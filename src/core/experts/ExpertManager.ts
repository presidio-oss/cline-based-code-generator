import * as vscode from "vscode"
import * as path from "path"
import fs from "fs/promises"
import { v4 as uuidv4 } from "uuid"
import { DocumentLink, ExpertData, ExpertDataSchema, DocumentStatus } from "../../shared/experts"
import { GlobalFileNames } from "../../global-constants"
import { EmbeddingConfiguration } from "@/shared/embeddings"
import { fileExistsAtPath } from "../../utils/fs"
import { UrlContentFetcher } from "../../services/browser/UrlContentFetcher"
import { ExpertFileManager } from "./ExpertFileManager"
import { DocumentProcessor } from "./DocumentProcessor"
import { VectorStoreManager } from "./VectorStoreManager"
import { getAllExtensionState } from "../storage/state"

/**
 * Manages experts, coordinating between file operations, document processing,
 * and vector store management
 */
export class ExpertManager {
	private extensionContext: vscode.ExtensionContext
	private workspaceId: string
	private fileManager: ExpertFileManager
	private documentProcessor: DocumentProcessor
	private vectorStoreManager: VectorStoreManager

	/**
	 * Create a new ExpertManager
	 */
	constructor(extensionContext: vscode.ExtensionContext, workspaceId: string, embeddingConfig: EmbeddingConfiguration) {
		this.extensionContext = extensionContext
		this.workspaceId = workspaceId
		this.fileManager = new ExpertFileManager()
		this.documentProcessor = new DocumentProcessor(extensionContext, workspaceId)

		// Initialize embedding client and vector store manager
		const embeddings = VectorStoreManager.initializeEmbeddings(embeddingConfig)
		this.vectorStoreManager = new VectorStoreManager({
			embeddings,
			embeddingConfig,
			workspaceId,
		})

		this.connectProcessorToVectorStore()
	}

	/**
	 * Save an expert to the .hai-experts directory
	 */
	async saveExpert(workspacePath: string, expert: ExpertData): Promise<void> {
		if (!workspacePath) {
			throw new Error("No workspace path provided")
		}

		// Validate expert data
		const validationResult = ExpertDataSchema.safeParse(expert)
		if (!validationResult.success) {
			throw new Error(`Invalid expert data: ${validationResult.error.message}`)
		}

		const parsedExpert = validationResult.data
		const isDeepCrawl = parsedExpert.deepCrawl || false

		const { expertDir, docsDir, statusFilePath, faissStatusFilePath, metadataFilePath } = this.fileManager.getExpertPaths(
			workspacePath,
			parsedExpert.name,
		)

		// Create expert directory structure
		await this.fileManager.createExpertDirectoryStructure(expertDir)

		// Prepare and write metadata
		const metadata = {
			name: parsedExpert.name,
			isDefault: parsedExpert.isDefault,
			createdAt: parsedExpert.createdAt || new Date().toISOString(),
			documentLinks: parsedExpert.documentLinks || [],
			deepCrawl: isDeepCrawl,
			maxDepth: parsedExpert.maxDepth || 10,
			maxPages: parsedExpert.maxPages || 20,
			crawlTimeout: parsedExpert.crawlTimeout || 10_0000,
		}
		await this.fileManager.writeExpertMetadata(metadataFilePath, metadata)

		// Write prompt file
		const promptFilePath = `${expertDir}/${ExpertFileManager.PROMPT_FILE}`
		await this.fileManager.writeExpertPrompt(promptFilePath, parsedExpert.prompt)

		// Process document links if any
		if (parsedExpert.documentLinks && parsedExpert.documentLinks.length > 0) {
			// Set initial status to "pending"
			const statusData = parsedExpert.documentLinks.map((link) => ({
				...link,
				...(isDeepCrawl ? {} : { filename: `doc-${uuidv4()}.md` }),
				status: DocumentStatus.PENDING,
				processedAt: new Date().toISOString(),
				error: null,
			}))

			if (isDeepCrawl) {
				// For deepcrawl, store status in the .faiss directory
				await this.fileManager.updateFaissStatusFile(faissStatusFilePath, statusData)
			} else {
				// For regular docs, store status in the docs directory
				await this.fileManager.createExpertDocsDirectory(docsDir)
				await this.fileManager.writeStatusFile(statusFilePath, statusData)
			}

			// Process document links
			await this.documentProcessor.processDocumentLinks(
				parsedExpert.name,
				expertDir,
				statusData,
				workspacePath,
				isDeepCrawl,
				parsedExpert.maxDepth,
				parsedExpert.maxPages,
				parsedExpert.crawlTimeout,
			)
		}
	}

	/**
	 * Connect document processor to vector store
	 * This is needed to handle crawled content
	 */
	async connectProcessorToVectorStore(): Promise<void> {
		// Add the onCrawlComplete handler to pass data from DocumentProcessor to VectorStoreManager
		// This injects the handleCrawledContent method from the DocumentProcessor class
		this.documentProcessor.onCrawlComplete = async (
			markdown: string,
			expertName: string,
			workspacePath: string,
			url: string,
			suburl: string,
			title?: string,
		): Promise<void> => {
			await this.vectorStoreManager.chunkAndStore({
				markdown,
				expertName,
				workspacePath,
				url,
				suburl,
				title,
			})
		}
	}

	/**
	 * Refresh a document link
	 */
	async refreshDocumentLink(workspacePath: string, expertName: string, linkUrl: string): Promise<void> {
		// Read metadata to determine if this is a deepcrawl expert
		const { docsDir, statusFilePath, faissStatusFilePath, metadataFilePath } = this.fileManager.getExpertPaths(
			workspacePath,
			expertName,
		)

		// Get deepcrawl setting from metadata
		const metadata = await this.fileManager.readExpertMetadata(metadataFilePath)
		if (!metadata) {
			throw new Error(`Expert metadata not found for ${expertName}`)
		}

		const isDeepCrawl = metadata.deepCrawl || false

		if (isDeepCrawl) {
			// For deepcrawl experts, delete chunks and re-crawl
			await this.vectorStoreManager.deleteChunk(linkUrl, expertName, workspacePath)
			await this.documentProcessor.crawlAndConvertToMarkdown(
				linkUrl,
				expertName,
				workspacePath,
				metadata.maxDepth || 10,
				metadata.maxPages || 20,
				metadata.crawlTimeout || 10_0000,
			)
			return
		}

		// For regular experts, read the status file
		const statusData = await this.fileManager.readStatusFile(statusFilePath)
		if (statusData.length === 0) {
			console.error("Status file not found or empty for expert:", expertName)
			return
		}

		const index = statusData.findIndex((link) => link.url === linkUrl)
		if (index === -1) {
			return
		}

		// Update status to processing
		statusData[index].status = DocumentStatus.PROCESSING
		statusData[index].processedAt = new Date().toISOString()
		await this.fileManager.writeStatusFile(statusFilePath, statusData)

		if (!this.extensionContext) {
			console.error("Extension context not available")
			return
		}

		// Create URL content fetcher and process the link
		const urlContentFetcher = new UrlContentFetcher(this.extensionContext)
		try {
			await urlContentFetcher.launchBrowser()

			// Process the document link
			const updatedLink = await this.documentProcessor.processSingleDocumentLink(
				expertName,
				docsDir,
				statusData[index],
				urlContentFetcher,
			)

			// Update the status file with the result
			statusData[index] = updatedLink
			await this.fileManager.writeStatusFile(statusFilePath, statusData)
		} catch (error) {
			// Handle any errors during processing
			statusData[index].status = DocumentStatus.FAILED
			statusData[index].processedAt = new Date().toISOString()
			statusData[index].error = error instanceof Error ? error.message : String(error)
			await this.fileManager.writeStatusFile(statusFilePath, statusData)
		} finally {
			await urlContentFetcher.closeBrowser()
		}
	}

	/**
	 * Add a document link to an expert
	 */
	async addDocumentLink(workspacePath: string, expertName: string, linkUrl: string): Promise<void> {
		const { expertDir, statusFilePath, faissStatusFilePath, metadataFilePath } = this.fileManager.getExpertPaths(
			workspacePath,
			expertName,
		)

		// Read metadata to determine if this is a deepcrawl expert
		const metadata = await this.fileManager.readExpertMetadata(metadataFilePath)
		if (!metadata) {
			throw new Error(`Expert metadata not found for ${expertName}`)
		}

		const isDeepCrawl = metadata.deepCrawl || false
		const newLink = this.documentProcessor.createDocumentLink(linkUrl)

		if (isDeepCrawl) {
			// For deepcrawl experts, use faiss status file
			let faissStatusData = await this.fileManager.readStatusFile(faissStatusFilePath)

			// Check max links
			if (faissStatusData.length >= 3) {
				vscode.window.showWarningMessage("Maximum of 3 document links allowed. Additional links cannot be added.")
				return
			}

			// Add to faiss status.json
			faissStatusData.push(newLink)
			await this.fileManager.updateFaissStatusFile(faissStatusFilePath, faissStatusData)

			// Update metadata.json
			metadata.documentLinks = faissStatusData.map((link) => ({ url: link.url }))
			await this.fileManager.writeExpertMetadata(metadataFilePath, metadata)

			// Process the document with deep crawling
			await this.documentProcessor.crawlAndConvertToMarkdown(
				linkUrl,
				expertName,
				workspacePath,
				metadata.maxDepth || 10,
				metadata.maxPages || 20,
				metadata.crawlTimeout || 10_0000,
			)
		} else {
			// For regular experts, use docs status file
			let statusData = await this.fileManager.readStatusFile(statusFilePath)

			// Check if the maximum number of document links is reached
			if (statusData.length >= 3) {
				vscode.window.showWarningMessage("Maximum of 3 document links allowed. Additional links cannot be added.")
				return
			}

			// Add to status.json
			statusData.push(newLink)
			await this.fileManager.writeStatusFile(statusFilePath, statusData)

			// Update metadata.json with the new document link
			metadata.documentLinks = statusData.map((link) => ({ url: link.url }))
			await this.fileManager.writeExpertMetadata(metadataFilePath, metadata)

			// Process the newly added document link
			await this.documentProcessor.processDocumentLinks(
				expertName,
				expertDir,
				[newLink],
				workspacePath,
				isDeepCrawl,
				metadata.maxDepth,
				metadata.maxPages,
				metadata.crawlTimeout,
			)
		}
	}

	/**
	 * Delete a document link from an expert
	 */
	async deleteDocumentLink(workspacePath: string, expertName: string, linkUrl: string): Promise<void> {
		const { docsDir, statusFilePath, faissStatusFilePath, metadataFilePath } = this.fileManager.getExpertPaths(
			workspacePath,
			expertName,
		)

		// Read metadata to determine if this was a deepcrawl link
		const metadata = await this.fileManager.readExpertMetadata(metadataFilePath)
		if (!metadata) {
			throw new Error(`Expert metadata not found for ${expertName}`)
		}

		const isDeepCrawl = metadata.deepCrawl || false

		// Delete from vector DB regardless (since the URL might have been crawled before)
		await this.vectorStoreManager.deleteChunk(linkUrl, expertName, workspacePath)

		// Update regular status.json if it exists
		if (await this.fileManager.readStatusFile(statusFilePath)) {
			const statusData = await this.fileManager.readStatusFile(statusFilePath)
			const updatedStatusData = statusData.filter((link) => link.url !== linkUrl)
			await this.fileManager.writeStatusFile(statusFilePath, updatedStatusData)

			// Delete the associated file if it exists
			const linkToDelete = statusData.find((link) => link.url === linkUrl)
			if (linkToDelete?.filename) {
				const filePath = this.fileManager.getDocumentFilePath(docsDir, linkToDelete.filename)
				await this.fileManager.deleteFileIfExists(filePath)
			}
		}

		// Update faiss status.json if it exists for deepcrawl experts
		if (isDeepCrawl) {
			const faissStatusData = await this.fileManager.readStatusFile(faissStatusFilePath)
			const updatedFaissStatusData = faissStatusData.filter((link) => link.url !== linkUrl)
			await this.fileManager.updateFaissStatusFile(faissStatusFilePath, updatedFaissStatusData)
		}

		// Update metadata.json after deleting the document link
		metadata.documentLinks = metadata.documentLinks.filter((link: any) => link.url !== linkUrl)
		await this.fileManager.writeExpertMetadata(metadataFilePath, metadata)
	}

	/**
	 * Read all experts from the .hai-experts directory
	 */
	async readExperts(workspacePath: string): Promise<{ experts: ExpertData[]; selectedExpert: ExpertData | null }> {
		if (!workspacePath) {
			return { experts: [], selectedExpert: null }
		}

		const { expertName } = await getAllExtensionState(this.extensionContext, this.workspaceId)

		const expertsDir = `${workspacePath}/${GlobalFileNames.experts}`
		try {
			const expertFolders = await fs.readdir(expertsDir)
			const experts: ExpertData[] = []
			let selectedExpert: ExpertData | null = null

			for (const folder of expertFolders) {
				const expertDir = `${expertsDir}/${folder}`
				const stats = await fs.stat(expertDir)
				if (!stats.isDirectory()) {
					continue
				}

				try {
					const { docsDir, statusFilePath, faissStatusFilePath, metadataFilePath } = this.fileManager.getExpertPaths(
						workspacePath,
						folder,
					)

					const promptPath = `${expertDir}/${ExpertFileManager.PROMPT_FILE}`

					// Skip if metadata or prompt is missing
					if (!(await fileExistsAtPath(metadataFilePath)) || !(await fileExistsAtPath(promptPath))) {
						continue
					}

					// Read metadata and prompt
					const metadata = await this.fileManager.readExpertMetadata(metadataFilePath)
					const promptContent = await this.fileManager.readExpertPrompt(promptPath)

					if (!metadata || !promptContent) {
						continue
					}

					// Initialize document links from metadata
					let documentLinks: DocumentLink[] = metadata.documentLinks.map((link) => ({
						url: link.url,
						status: DocumentStatus.PENDING,
						processedAt: new Date().toISOString(),
						error: null,
					}))

					const isDeepCrawl = metadata.deepCrawl || false

					// Synchronize document links based on expert type
					if (isDeepCrawl) {
						documentLinks = await this.syncDeepCrawlLinks(
							faissStatusFilePath,
							documentLinks,
							metadata.name,
							workspacePath,
							metadata.maxDepth || 10,
							metadata.maxPages || 20,
							metadata.crawlTimeout || 10_0000,
						)
					} else {
						documentLinks = await this.syncRegularLinks(
							statusFilePath,
							documentLinks,
							metadata.name,
							workspacePath,
							expertDir,
						)
					}

					// Determine expert status based on document link statuses
					let expertStatus = DocumentStatus.COMPLETED
					if (documentLinks.length > 0) {
						const hasNonCompletedLinks = documentLinks.some((link) => link.status !== DocumentStatus.COMPLETED)
						if (hasNonCompletedLinks) {
							expertStatus = DocumentStatus.PROCESSING
						}
					}

					// Build expert data
					const expertData = {
						name: metadata.name,
						isDefault: metadata.isDefault,
						prompt: promptContent,
						createdAt: metadata.createdAt,
						documentLinks,
						deepCrawl: isDeepCrawl,
						maxDepth: metadata.maxDepth,
						maxPages: metadata.maxPages,
						crawlTimeout: metadata.crawlTimeout,
						status: expertStatus,
					}

					// Validate and add to list
					const validationResult = ExpertDataSchema.safeParse(expertData)
					if (validationResult.success) {
						const validExpert = validationResult.data
						experts.push(validExpert)
						if (expertName && validExpert.name === expertName) {
							selectedExpert = validExpert
						}
					} else {
						vscode.window.showWarningMessage(
							`Invalid expert data for ${folder}: ${validationResult.error.issues.map((i) => i.message).join(", ")}`,
						)
					}
				} catch (err) {
					console.error(`Error reading expert folder ${folder}:`, err)
				}
			}

			return { experts, selectedExpert }
		} catch (error) {
			console.error("Failed to read experts directory:", error)
			return { experts: [], selectedExpert: null }
		}
	}

	/**
	 * Synchronize deep crawl document links
	 */
	private async syncDeepCrawlLinks(
		faissStatusFilePath: string,
		documentLinks: DocumentLink[],
		expertName: string,
		workspacePath: string,
		maxDepth: number,
		maxPages: number,
		crawlTimeout: number,
	): Promise<DocumentLink[]> {
		try {
			// Read faiss status or initialize it
			let faissStatusLinks = await this.fileManager.readStatusFile(faissStatusFilePath)

			if (faissStatusLinks.length === 0) {
				// Initialize from document links
				faissStatusLinks = documentLinks.map((link) => ({
					url: link.url,
					status: DocumentStatus.PENDING,
					filename: `doc-${uuidv4()}.md`, // Ensure filename is set
					processedAt: new Date().toISOString(),
					error: null,
				}))

				// Save initial faiss status
				await this.fileManager.updateFaissStatusFile(faissStatusFilePath, faissStatusLinks)

				// Process links for crawling
				for (const link of documentLinks) {
					await this.documentProcessor.crawlAndConvertToMarkdown(
						link.url,
						expertName,
						workspacePath,
						maxDepth,
						maxPages,
						crawlTimeout,
					)
				}

				// Read updated status
				return await this.fileManager.readStatusFile(faissStatusFilePath)
			} else {
				// Synchronize metadata links with faiss status links
				const metadataUrls = new Set(documentLinks.map((link) => link.url))
				const faissStatusUrls = new Set(faissStatusLinks.map((link) => link.url))

				// Add missing links from metadata to faiss status
				for (const link of documentLinks) {
					if (!faissStatusUrls.has(link.url)) {
						try {
							await this.addDocumentLink(workspacePath, expertName, link.url)
						} catch (error) {
							console.error(`Failed to add document link ${link.url}:`, error)
						}
					}
				}

				// Remove links from faiss status that are not in metadata
				for (const link of faissStatusLinks) {
					if (!metadataUrls.has(link.url)) {
						try {
							await this.deleteDocumentLink(workspacePath, expertName, link.url)
						} catch (error) {
							console.error(`Failed to delete document link ${link.url}:`, error)
						}
					}
				}

				// Return updated faiss status links with proper error handling
				try {
					const updatedLinks = await this.fileManager.readStatusFile(faissStatusFilePath)
					return updatedLinks.filter((link) => metadataUrls.has(link.url))
				} catch (error) {
					console.error(`Failed to read status file ${faissStatusFilePath}:`, error)
					// Return the links we have in memory if file read fails
					return faissStatusLinks.filter((link) => metadataUrls.has(link.url))
				}
			}
		} catch (error) {
			console.error(`Error in syncDeepCrawlLinks for expert ${expertName}:`, error)
			// Return the original links if something went wrong
			return documentLinks
		}
	}

	/**
	 * Synchronize regular document links
	 */
	private async syncRegularLinks(
		statusFilePath: string,
		documentLinks: DocumentLink[],
		expertName: string,
		workspacePath: string,
		expertDir: string,
	): Promise<DocumentLink[]> {
		try {
			// Read status or initialize it
			let statusLinks = await this.fileManager.readStatusFile(statusFilePath)

			if (statusLinks.length === 0) {
				// Process links from metadata, ensure they have filenames
				for (const link of documentLinks) {
					try {
						await this.addDocumentLink(workspacePath, expertName, link.url)
					} catch (error) {
						console.error(`Failed to add document link ${link.url}:`, error)
					}
				}

				// Read the updated status
				try {
					return await this.fileManager.readStatusFile(statusFilePath)
				} catch (error) {
					console.error(`Failed to read status file ${statusFilePath}:`, error)
					return documentLinks
				}
			} else {
				// Synchronize metadata links with status links
				const metadataUrls = new Set(documentLinks.map((link) => link.url))
				const statusUrls = new Set(statusLinks.map((link) => link.url))

				// Add missing links from metadata to status
				for (const link of documentLinks) {
					if (!statusUrls.has(link.url)) {
						try {
							await this.addDocumentLink(workspacePath, expertName, link.url)
						} catch (error) {
							console.error(`Failed to add document link ${link.url}:`, error)
						}
					}
				}

				// Remove links from status that are not in metadata
				for (const link of statusLinks) {
					if (!metadataUrls.has(link.url)) {
						try {
							await this.deleteDocumentLink(workspacePath, expertName, link.url)
						} catch (error) {
							console.error(`Failed to delete document link ${link.url}:`, error)
						}
					}
				}

				// Return updated status links
				try {
					const updatedLinks = await this.fileManager.readStatusFile(statusFilePath)
					return updatedLinks.filter((link) => metadataUrls.has(link.url))
				} catch (error) {
					console.error(`Failed to read status file ${statusFilePath}:`, error)
					// Return what we have in memory if file read fails
					return statusLinks.filter((link) => metadataUrls.has(link.url))
				}
			}
		} catch (error) {
			console.error(`Error in syncRegularLinks for expert ${expertName}:`, error)
			// Return original links if something went wrong
			return documentLinks
		}
	}

	/**
	 * Delete an expert from the .hai-experts directory
	 */
	async deleteExpert(workspacePath: string, expertName: string): Promise<void> {
		if (!workspacePath) {
			throw new Error("No workspace path provided")
		}

		if (!expertName || typeof expertName !== "string") {
			throw new Error("Expert name must be a non-empty string")
		}

		const expertsDir = `${workspacePath}/${GlobalFileNames.experts}`
		if (!(await fileExistsAtPath(expertsDir))) {
			return
		}

		const expertFolders = await fs.readdir(expertsDir)
		for (const folder of expertFolders) {
			const expertDir = `${expertsDir}/${folder}`
			const stats = await fs.stat(expertDir)

			if (stats.isDirectory()) {
				const metadataPath = `${expertDir}/${ExpertFileManager.METADATA_FILE}`

				if (await fileExistsAtPath(metadataPath)) {
					try {
						const metadata = await this.fileManager.readExpertMetadata(metadataPath)

						if (metadata && metadata.name === expertName) {
							await this.fileManager.deleteExpertDirectory(expertDir)
							return
						}
					} catch (error) {
						console.error(`Failed to read metadata from ${folder}:`, error)
					}
				}
			}
		}
	}

	/**
	 * Get the path to the prompt.md file for a given expert
	 */
	async getExpertPromptPath(workspacePath: string, expertName: string): Promise<string | null> {
		if (!workspacePath) {
			throw new Error("No workspace path provided")
		}

		if (!expertName || typeof expertName !== "string") {
			throw new Error("Expert name must be a non-empty string")
		}

		const expertsDir = `${workspacePath}/${GlobalFileNames.experts}`
		if (!(await fileExistsAtPath(expertsDir))) {
			return null
		}

		const expertFolders = await fs.readdir(expertsDir)
		for (const folder of expertFolders) {
			const expertDir = `${expertsDir}/${folder}`
			const stats = await fs.stat(expertDir)

			if (stats.isDirectory()) {
				const metadataPath = `${expertDir}/${ExpertFileManager.METADATA_FILE}`

				if (await fileExistsAtPath(metadataPath)) {
					try {
						const metadata = await this.fileManager.readExpertMetadata(metadataPath)

						if (metadata && metadata.name === expertName) {
							const promptPath = `${expertDir}/${ExpertFileManager.PROMPT_FILE}`

							if (await fileExistsAtPath(promptPath)) {
								return promptPath
							}
							return null
						}
					} catch (error) {
						console.error(`Failed to read metadata from ${folder}:`, error)
					}
				}
			}
		}

		return null
	}

	/**
	 * Load the default Experts
	 */
	async loadDefaultExperts(): Promise<{ experts: ExpertData[]; selectedExpert: ExpertData | null }> {
		const expertsDir = path.join(this.extensionContext.extensionPath, GlobalFileNames.defaultExperts)
		let experts: ExpertData[] = []
		let selectedExpert: ExpertData | null = null
		const { expertName } = await getAllExtensionState(this.extensionContext, this.workspaceId)

		try {
			const directoryEntries = await fs.readdir(expertsDir, { withFileTypes: true })

			for (const directoryEntry of directoryEntries) {
				if (!directoryEntry.isDirectory()) {
					continue
				}

				const folderName = directoryEntry.name
				const folderPath = path.join(expertsDir, folderName)
				const promptPath = path.join(folderPath, ExpertFileManager.PROMPT_FILE)
				const iconPath = path.join(folderPath, ExpertFileManager.ICON)

				// Read prompt
				let prompt = await this.fileManager.readExpertPrompt(promptPath)
				if (!prompt || !prompt.trim()) {
					console.warn(`Empty prompt for ${folderName}, skipping...`)
					continue
				}

				// Read icon if available
				let iconBase64 = ""
				try {
					const svgContent = await fs.readFile(iconPath)
					iconBase64 = `data:image/svg+xml;base64,${svgContent.toString("base64")}`
				} catch {
					console.warn(`Icon not found for ${folderName}`)
				}

				const expert: ExpertData = {
					name: folderName,
					prompt,
					isDefault: true,
					iconComponent: iconBase64,
				}
				experts.push(expert)

				if (expertName && expert.name === expertName) {
					selectedExpert = expert
				}
			}
		} catch (error) {
			console.error("Error reading experts directory:", error)
		}

		return { experts, selectedExpert }
	}

	/**
	 * Search for a query in the expert's vector store
	 */
	async search(query: string, expertName: string, workspacePath: string, k?: number): Promise<string> {
		return this.vectorStoreManager.search(query, expertName, workspacePath, k)
	}
}
