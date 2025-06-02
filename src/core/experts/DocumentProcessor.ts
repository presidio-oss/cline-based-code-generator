import * as vscode from "vscode"
import { v4 as uuidv4 } from "uuid"
import TurndownService from "turndown"
import * as cheerio from "cheerio"
import { DocumentLink, DocumentStatus } from "../../shared/experts"
import { UrlContentFetcher } from "../../services/browser/UrlContentFetcher"
import { getAllExtensionState } from "../storage/state"
import { buildApiHandler } from "../../api"
import { HaiBuildDefaults } from "../../shared/haiDefaults"
import { ExpertFileManager } from "./ExpertFileManager"

/**
 * Handles document processing operations
 */
export class DocumentProcessor {
	private extensionContext: vscode.ExtensionContext
	private workspaceId: string
	private systemPrompt: string
	private fileManager: ExpertFileManager

	/**
	 * Create a new DocumentProcessor
	 */
	constructor(extensionContext: vscode.ExtensionContext, workspaceId: string) {
		this.extensionContext = extensionContext
		this.workspaceId = workspaceId
		this.systemPrompt = HaiBuildDefaults.defaultMarkDownSummarizer
		this.fileManager = new ExpertFileManager()
	}

	/**
	 * Process document links for an expert
	 */
	public async processDocumentLinks(
		expertName: string,
		expertDir: string,
		documentLinks: DocumentLink[],
		workspacePath: string,
		deepCrawl: boolean = false,
		maxRequestsPerCrawl: number = 10,
	): Promise<void> {
		// Simple dispatcher based on type
		if (deepCrawl) {
			await this.processDeepCrawlLinks(documentLinks, expertName, workspacePath, maxRequestsPerCrawl)
		} else {
			await this.processRegularLinks(expertName, expertDir, documentLinks, workspacePath)
		}
	}

	/**
	 * Process regular (non-deepcrawl) document links
	 */
	private async processRegularLinks(
		expertName: string,
		expertDir: string,
		documentLinks: DocumentLink[],
		workspacePath: string,
	): Promise<void> {
		if (!this.extensionContext) {
			console.error("Extension context not available")
			return
		}

		const { docsDir, statusFilePath } = this.fileManager.getExpertPaths(workspacePath, expertName)
		const urlContentFetcher = new UrlContentFetcher(this.extensionContext)

		try {
			await urlContentFetcher.launchBrowser()

			// Read existing status data
			let existingStatusData = await this.fileManager.readStatusFile(statusFilePath)

			for (const link of documentLinks) {
				// Find or create entry in status data
				const existingLinkIndex = existingStatusData.findIndex((l) => l.url === link.url)

				// Mark as processing
				const processingLink = {
					...link,
					status: DocumentStatus.PROCESSING,
					processedAt: new Date().toISOString(),
				}

				if (existingLinkIndex !== -1) {
					existingStatusData[existingLinkIndex] = processingLink
				} else {
					existingStatusData.push(processingLink)
				}

				// Update status before processing
				await this.fileManager.writeStatusFile(statusFilePath, existingStatusData)

				// Process the link
				const updatedLink = await this.processSingleDocumentLink(expertName, docsDir, processingLink, urlContentFetcher)

				// Update in the status data
				if (existingLinkIndex !== -1) {
					existingStatusData[existingLinkIndex] = updatedLink
				} else {
					const newIndex = existingStatusData.findIndex((l) => l.url === link.url)
					if (newIndex !== -1) {
						existingStatusData[newIndex] = updatedLink
					}
				}

				// Write updated status
				await this.fileManager.writeStatusFile(statusFilePath, existingStatusData)
			}
		} catch (error) {
			console.error(`Error processing document links for expert ${expertName}:`, error)
		} finally {
			await urlContentFetcher.closeBrowser()
		}
	}

	/**
	 * Process deep crawl document links
	 */
	private async processDeepCrawlLinks(
		documentLinks: DocumentLink[],
		expertName: string,
		workspacePath: string,
		maxRequestsPerCrawl: number,
	): Promise<void> {
		// For deep crawl, we just need to crawl each URL
		for (const link of documentLinks) {
			await this.crawlAndConvertToMarkdown(link.url, expertName, workspacePath, maxRequestsPerCrawl)
		}
	}

	/**
	 * Process a single document link
	 */
	public async processSingleDocumentLink(
		expertName: string,
		docsDir: string,
		link: DocumentLink,
		urlContentFetcher: UrlContentFetcher,
	): Promise<DocumentLink> {
		if (!link.filename) {
			link.filename = `doc-${uuidv4()}.md`
		}

		// Create a copy to avoid direct modification
		const updatedLink = {
			...link,
			status: DocumentStatus.PROCESSING,
			processedAt: new Date().toISOString(),
		}

		try {
			// Fetch and convert document
			const markdown = await this.fetchAndConvertDocument(link.url, urlContentFetcher)

			// Make sure docs directory exists
			await this.fileManager.createExpertDocsDirectory(docsDir)

			// Save to file - ensure filename is always a string
			const docFilePath = this.fileManager.getDocumentFilePath(docsDir, updatedLink.filename || `doc-${uuidv4()}.md`)
			await this.fileManager.writeExpertPrompt(docFilePath, markdown)

			// Update status
			updatedLink.status = DocumentStatus.COMPLETED
			updatedLink.processedAt = new Date().toISOString()
			updatedLink.error = null

			console.log(`Successfully processed document link for expert ${expertName}: ${link.url}`)
		} catch (error) {
			// Update with error status
			updatedLink.status = DocumentStatus.FAILED
			updatedLink.processedAt = new Date().toISOString()
			updatedLink.error = error instanceof Error ? error.message : String(error)

			console.error(`Failed to process document link for expert ${expertName}:`, error)
		}

		return updatedLink
	}

	/**
	 * Fetch and convert a document to summarized markdown
	 */
	private async fetchAndConvertDocument(url: string, urlContentFetcher: UrlContentFetcher): Promise<string> {
		const markdown = await urlContentFetcher.urlToMarkdown(url)
		return this.summarizeMarkdownContent(markdown)
	}

	/**
	 * Summarize markdown content
	 */
	public async summarizeMarkdownContent(markdownContent: string): Promise<string> {
		let content = ""
		const { apiConfiguration } = await getAllExtensionState(this.extensionContext, this.workspaceId)
		const llmApi = buildApiHandler(apiConfiguration)

		const apiStream = llmApi.createMessage(this.systemPrompt, [
			{
				role: "user",
				content: markdownContent,
			},
		])

		const iterator = apiStream[Symbol.asyncIterator]()
		for await (const chunk of iterator) {
			if (chunk && chunk.type === "text" && chunk.text) {
				content += chunk.text
			}
		}

		return content
	}

	/**
	 * Crawl a website and convert to markdown
	 */
	public async crawlAndConvertToMarkdown(
		url: string,
		expertName: string,
		workspacePath: string,
		maxRequestsPerCrawl: number = 10,
	): Promise<void> {
		// Dynamic import of crawlee
		const { PlaywrightCrawler, Configuration } = await import("crawlee")
		const { faissStatusFilePath } = this.fileManager.getExpertPaths(workspacePath, expertName)

		// Initialize or update status file in .faiss directory
		let faissStatusData = await this.fileManager.readStatusFile(faissStatusFilePath)

		// Find or create entry for this URL
		const linkIndex = faissStatusData.findIndex((link) => link.url === url)
		if (linkIndex !== -1) {
			faissStatusData[linkIndex].status = DocumentStatus.PROCESSING
			faissStatusData[linkIndex].processedAt = new Date().toISOString()
		} else {
			faissStatusData.push({
				url,
				status: DocumentStatus.PROCESSING,
				processedAt: new Date().toISOString(),
				error: null,
			})
		}

		// Update status file before crawling
		await this.fileManager.updateFaissStatusFile(faissStatusFilePath, faissStatusData)

		const config = new Configuration({
			persistStorage: false, // Disable default storage
		})

		// Store reference to this instance for use in the crawler
		const self = this

		try {
			const crawler = new PlaywrightCrawler(
				{
					async requestHandler({ request, page, enqueueLinks }) {
						const title = await page.title()
						const content = await page.content()
						const suburl = request.loadedUrl

						// Parse and clean HTML
						const $ = cheerio.load(content)
						$("script, style, nav, footer, header").remove()

						// Convert to Markdown
						const turndownService = new TurndownService()
						const markdown = turndownService.turndown($.html())

						// Forward to vector store manager using the instance reference
						await self.onCrawlComplete(markdown, expertName, workspacePath, url, suburl, title)

						// Enqueue more links
						await enqueueLinks()
					},
					maxRequestsPerCrawl,
					// Optional: headless: false, to show browser
				},
				config,
			)

			await crawler.run([url])

			// Update status to COMPLETED after successful crawl
			const updatedLinkIndex = faissStatusData.findIndex((link) => link.url === url)
			if (updatedLinkIndex !== -1) {
				faissStatusData[updatedLinkIndex].status = DocumentStatus.COMPLETED
				faissStatusData[updatedLinkIndex].processedAt = new Date().toISOString()
				faissStatusData[updatedLinkIndex].error = null
			}

			await this.fileManager.updateFaissStatusFile(faissStatusFilePath, faissStatusData)
		} catch (error) {
			// Update status to FAILED if crawl fails
			console.error(`Error in crawling ${url} for expert ${expertName}:`, error)

			const failedLinkIndex = faissStatusData.findIndex((link) => link.url === url)
			if (failedLinkIndex !== -1) {
				faissStatusData[failedLinkIndex].status = DocumentStatus.FAILED
				faissStatusData[failedLinkIndex].processedAt = new Date().toISOString()
				faissStatusData[failedLinkIndex].error = error instanceof Error ? error.message : String(error)
			}

			await this.fileManager.updateFaissStatusFile(faissStatusFilePath, faissStatusData)
		}
	}

	/**
	 * Create a new document link
	 */
	public createDocumentLink(url: string): DocumentLink {
		return {
			url,
			status: DocumentStatus.PENDING,
			filename: `doc-${uuidv4()}.md`,
			processedAt: new Date().toISOString(),
			error: null,
		}
	}

	/**
	 * Handler for crawler completion
	 */
	private async onCrawlComplete(
		markdown: string,
		expertName: string,
		workspacePath: string,
		url: string,
		suburl: string,
		title?: string,
	): Promise<void> {
		// This is a placeholder for the vectorization step
		// This will be implemented in VectorStoreManager
		console.log(`Processed content for ${suburl}`)
	}
}
