import * as vscode from "vscode"
import * as fs from "fs/promises"
import * as path from "path"
import { Browser, Page, launch } from "puppeteer-core"
import * as cheerio from "cheerio"
import TurndownService from "turndown"
// @ts-ignore
import PCR from "puppeteer-chromium-resolver"
import { fileExistsAtPath } from "@utils/fs"

export interface CrawlOptions {
	maxDepth: number
	maxPages?: number
	timeout?: number
	urlFilter?: (url: string) => boolean
	onPageCrawlComplete?: (data: CrawlResult) => Promise<void>
}

export interface CrawlResult {
	url: string
	content: string
	depth: number
	links: string[]
	parentUrl?: string
}

interface PCRStats {
	puppeteer: { launch: typeof launch }
	executablePath: string
}

export class UrlContentFetcher {
	private context: vscode.ExtensionContext
	private browser?: Browser
	private page?: Page

	constructor(context: vscode.ExtensionContext) {
		this.context = context
	}

	private async ensureChromiumExists(): Promise<PCRStats> {
		const globalStoragePath = this.context?.globalStorageUri?.fsPath
		if (!globalStoragePath) {
			throw new Error("Global storage uri is invalid")
		}
		const puppeteerDir = path.join(globalStoragePath, "puppeteer")
		const dirExists = await fileExistsAtPath(puppeteerDir)
		if (!dirExists) {
			await fs.mkdir(puppeteerDir, { recursive: true })
		}
		// if chromium doesn't exist, this will download it to path.join(puppeteerDir, ".chromium-browser-snapshots")
		// if it does exist it will return the path to existing chromium
		const stats: PCRStats = await PCR({
			downloadPath: puppeteerDir,
		})
		return stats
	}

	async launchBrowser(): Promise<void> {
		if (this.browser) {
			return
		}
		const stats = await this.ensureChromiumExists()
		this.browser = await stats.puppeteer.launch({
			args: [
				"--user-agent=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
			],
			executablePath: stats.executablePath,
		})
		// (latest version of puppeteer does not add headless to user agent)
		this.page = await this.browser?.newPage()
	}

	async closeBrowser(): Promise<void> {
		await this.browser?.close()
		this.browser = undefined
		this.page = undefined
	}

	private async extractLinks(page: Page): Promise<string[]> {
		return await page.evaluate(() => {
			const links = Array.from(document.querySelectorAll("a[href]"))
			return links.map((link) => link.getAttribute("href")).filter((href): href is string => href !== null)
		})
	}

	private normalizeUrl(url: string, baseUrl: string): string {
		try {
			return new URL(url, baseUrl).href
		} catch {
			return ""
		}
	}

	async deepCrawl(startUrl: string, options: CrawlOptions): Promise<CrawlResult[]> {
		if (!this.browser || !this.page) {
			throw new Error("Browser not initialized")
		}

		const results: CrawlResult[] = []
		const visited = new Set<string>()
		const queue: Array<{ url: string; depth: number; parentUrl?: string }> = [{ url: startUrl, depth: 0 }]
		const maxPages = options.maxPages || 20

		while (queue.length > 0 && results.length < maxPages) {
			const current = queue.shift()
			if (!current) {
				continue
			}

			const { url, depth, parentUrl } = current

			// Skip if URL already visited or exceeds max depth
			if (visited.has(url) || depth > options.maxDepth) {
				continue
			}

			try {
				// Extract markdown and sub-links
				const markdown = await this.urlToMarkdown(url, options.timeout || 10_0000)
				const links = await this.extractLinks(this.page)
				const result = {
					url,
					content: markdown,
					depth,
					links,
					parentUrl,
				}

				results.push(result)
				visited.add(url)

				if (options.onPageCrawlComplete) {
					await options.onPageCrawlComplete(result)
				}

				// Add new URLs to queue if not at max depth
				if (depth < options.maxDepth) {
					const newUrls = result.links
						.map((link) => this.normalizeUrl(link, url))
						.filter((link) => link && !visited.has(link))
						.filter((link) => !options.urlFilter || options.urlFilter(link))

					for (const newUrl of newUrls) {
						queue.push({ url: newUrl, depth: depth + 1, parentUrl: url })
					}
				}
			} catch (error) {
				console.error(`Error processing ${url}:`, error)
				continue
			}
		}

		return results
	}

	// must make sure to call launchBrowser before and closeBrowser after using this
	async urlToMarkdown(url: string, timeout: number = 10_000): Promise<string> {
		if (!this.browser || !this.page) {
			throw new Error("Browser not initialized")
		}
		/*
		- networkidle2 is equivalent to playwright's networkidle where it waits until there are no more than 2 network connections for at least 500 ms.
		- domcontentloaded is when the basic DOM is loaded
		this should be sufficient for most doc sites
		*/
		await this.page.goto(url, {
			timeout: 10_000,
			waitUntil: ["domcontentloaded", "networkidle2"],
		})
		const content = await this.page.content()

		// use cheerio to parse and clean up the HTML
		const $ = cheerio.load(content)
		$("script, style, nav, footer, header").remove()

		// convert cleaned HTML to markdown
		const turndownService = new TurndownService()
		const markdown = turndownService.turndown($.html())

		return markdown
	}
}
