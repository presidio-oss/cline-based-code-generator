import { PlaywrightCrawler, Configuration } from "crawlee"
import * as cheerio from "cheerio"
import TurndownService from "turndown"

export interface CrawlResult {
	url: string
	suburl: string
	title: string
	markdown: string
	timestamp: string
}

export interface CrawlOptions {
	maxRequestsPerCrawl?: number
	headless?: boolean
}

export class WebCrawler {
	private config: Configuration

	constructor() {
		this.config = new Configuration({
			persistStorage: false, // Disable default storage
		})
	}

	/**
	 * Crawl a website and convert pages to markdown
	 */
	public async crawlAndConvertToMarkdown(url: string, options: CrawlOptions = {}): Promise<CrawlResult[]> {
		const { maxRequestsPerCrawl = 10, headless = true } = options
		const results: CrawlResult[] = []

		const crawler = new PlaywrightCrawler(
			{
				async requestHandler({ request, page, enqueueLinks }) {
					try {
						const title = await page.title()
						const content = await page.content()
						const suburl = request.loadedUrl || request.url

						// Parse and clean HTML
						const $ = cheerio.load(content)
						$("script, style, nav, footer, header, .sidebar, .ad, .advertisement").remove()

						// Convert to Markdown
						const turndownService = new TurndownService({
							headingStyle: "atx",
							codeBlockStyle: "fenced",
						})
						const markdown = turndownService.turndown($.html())

						// Store result
						results.push({
							url,
							suburl,
							title,
							markdown,
							timestamp: new Date().toISOString(),
						})

						// Enqueue more links from the same domain
						await enqueueLinks()
					} catch (error) {
						console.error(`Error processing page ${request.url}:`, error)
					}
				},
				maxRequestsPerCrawl,
			},
			this.config,
		)

		await crawler.run([url])
		return results
	}
}

export async function crawlWebsite(url: string, options?: CrawlOptions): Promise<CrawlResult[]> {
	const crawler = new WebCrawler()
	return crawler.crawlAndConvertToMarkdown(url, options)
}
