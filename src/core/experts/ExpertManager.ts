import fs from "fs/promises"
import * as path from "path"
import * as vscode from "vscode"
import { v4 as uuidv4 } from "uuid"
import { DocumentLink, ExpertData, ExpertDataSchema, DocumentStatus } from "../../shared/experts"
import { fileExistsAtPath, createDirectoriesForFile } from "../../utils/fs"
import { GlobalFileNames } from "../../global-constants"
import { UrlContentFetcher } from "../../services/browser/UrlContentFetcher"
import { getAllExtensionState } from "../storage/state"
import { buildApiHandler } from "../../api"
import { HaiBuildDefaults } from "../../shared/haiDefaults"

export class ExpertManager {
	private extensionContext: vscode.ExtensionContext
	private workspaceId: string
	private systemPrompt: string

	public static readonly METADATA_FILE = "metadata.json"
	public static readonly PROMPT_FILE = "prompt.md"
	public static readonly DOCS_DIR = "docs"
	public static readonly STATUS_FILE = "status.json"
	public static readonly PLACEHOLDER_FILE = "placeholder.txt"

	constructor(extensionContext: vscode.ExtensionContext, workspaceId: string) {
		this.extensionContext = extensionContext
		this.workspaceId = workspaceId
		this.systemPrompt = HaiBuildDefaults.defaultMarkDownSummarizer
	}

	/**
	 * Utility function to format expert names
	 */
	private formatExpertName(name: string): string {
		return name.replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase()
	}

	/**
	 * Helper to get expert directory paths
	 */
	private getExpertPaths(workspacePath: string, expertName: string) {
		const sanitizedName = this.formatExpertName(expertName)
		const expertDir = path.join(workspacePath, GlobalFileNames.experts, sanitizedName)
		const docsDir = path.join(expertDir, ExpertManager.DOCS_DIR)
		const statusFilePath = path.join(docsDir, ExpertManager.STATUS_FILE)
		const metadataFilePath = path.join(expertDir, ExpertManager.METADATA_FILE)
		return { sanitizedName, expertDir, docsDir, statusFilePath, metadataFilePath }
	}

	/**
	 * Save an expert to the .hai-experts directory
	 */
	async saveExpert(workspacePath: string, expert: ExpertData): Promise<void> {
		if (!workspacePath) {
			throw new Error("No workspace path provided")
		}

		const validationResult = ExpertDataSchema.safeParse(expert)
		if (!validationResult.success) {
			throw new Error(`Invalid expert data: ${validationResult.error.message}`)
		}

		const parsedExpert = validationResult.data

		const { expertDir, docsDir, statusFilePath, metadataFilePath } = this.getExpertPaths(workspacePath, parsedExpert.name)
		await createDirectoriesForFile(path.join(expertDir, ExpertManager.PLACEHOLDER_FILE))

		const metadata = {
			name: parsedExpert.name,
			isDefault: parsedExpert.isDefault,
			createdAt: parsedExpert.createdAt || new Date().toISOString(),
			documentLinks: parsedExpert.documentLinks || [],
		}
		await fs.writeFile(metadataFilePath, JSON.stringify(metadata, null, 2))

		const promptFilePath = path.join(expertDir, ExpertManager.PROMPT_FILE)
		await fs.writeFile(promptFilePath, parsedExpert.prompt)

		if (parsedExpert.documentLinks && parsedExpert.documentLinks.length > 0) {
			const docsDir = path.join(expertDir, ExpertManager.DOCS_DIR)
			await createDirectoriesForFile(path.join(docsDir, ExpertManager.PLACEHOLDER_FILE))

			// Set initial status to "pending"
			const statusData = parsedExpert.documentLinks.map((link) => ({
				...link,
				filename: `doc-${uuidv4()}.md`,
				status: DocumentStatus.PENDING,
				processedAt: new Date().toISOString(),
				error: null,
			}))

			const statusFilePath = path.join(docsDir, ExpertManager.STATUS_FILE)
			await fs.writeFile(statusFilePath, JSON.stringify(statusData, null, 2))

			// Process document links (pass workspacePath)
			this.processDocumentLinks(parsedExpert.name, expertDir, statusData, workspacePath)
		}
	}

	/**
	 * Process document links for an expert
	 */
	private async processDocumentLinks(
		expertName: string,
		expertDir: string,
		documentLinks: DocumentLink[],
		workspacePath: string,
	): Promise<void> {
		const { docsDir, statusFilePath } = this.getExpertPaths(workspacePath, expertName)

		if (!this.extensionContext) {
			console.error("Extension context not available")
			return
		}

		const urlContentFetcher = new UrlContentFetcher(this.extensionContext)
		try {
			await urlContentFetcher.launchBrowser()

			// Read the existing status data
			let existingStatusData: DocumentLink[] = []
			if (await fileExistsAtPath(statusFilePath)) {
				try {
					const fileContent = await fs.readFile(statusFilePath, "utf-8")
					existingStatusData = JSON.parse(fileContent)
				} catch (error) {
					console.error("Failed to read existing status data:", error)
				}
			}

			for (const link of documentLinks) {
				// Find the existing link in the status data
				const existingLinkIndex = existingStatusData.findIndex((l) => l.url === link.url)

				// Update to processing before extraction
				link.status = DocumentStatus.PROCESSING
				link.processedAt = new Date().toISOString()

				if (existingLinkIndex !== -1) {
					// Update the existing link
					existingStatusData[existingLinkIndex] = link
				} else {
					// Add the new link
					existingStatusData.push(link)
				}

				await fs.writeFile(statusFilePath, JSON.stringify(existingStatusData, null, 2))

				try {
					const markdown = await urlContentFetcher.urlToMarkdown(link.url)
					const summarizedMarkDown = await this.summarizeMarDownContent(markdown)
					const docFilePath = path.join(docsDir, link.filename || "")
					await fs.writeFile(docFilePath, summarizedMarkDown)

					link.status = DocumentStatus.COMPLETED
					link.processedAt = new Date().toISOString()
					link.error = null
				} catch (error) {
					link.status = DocumentStatus.FAILED
					link.processedAt = new Date().toISOString()
					link.error = error instanceof Error ? error.message : String(error)
					console.error(`Failed to process document link for expert ${expertName}:`, error)
				}

				// Update the status file after processing
				if (existingLinkIndex !== -1) {
					existingStatusData[existingLinkIndex] = link
				} else {
					existingStatusData.push(link)
				}
				await fs.writeFile(statusFilePath, JSON.stringify(existingStatusData, null, 2))
			}
		} catch (error) {
			console.error(`Error processing document links for expert ${expertName}:`, error)
		} finally {
			await urlContentFetcher.closeBrowser()
		}
	}

	/**
	 * Refresh (or edit) a single document link for an expert.
	 */
	async refreshDocumentLink(workspacePath: string, expertName: string, linkUrl: string): Promise<void> {
		const { expertDir, docsDir, statusFilePath } = this.getExpertPaths(workspacePath, expertName)

		let statusData: DocumentLink[] = JSON.parse(await fs.readFile(statusFilePath, "utf-8"))
		const index = statusData.findIndex((link) => link.url === linkUrl)
		if (index === -1) {
			return
		}

		// Update status to processing
		statusData[index].status = DocumentStatus.PROCESSING
		statusData[index].processedAt = new Date().toISOString()
		await fs.writeFile(statusFilePath, JSON.stringify(statusData, null, 2))

		if (!this.extensionContext) {
			console.error("Extension context not available")
			return
		}
		const urlContentFetcher = new UrlContentFetcher(this.extensionContext)
		await urlContentFetcher.launchBrowser()
		try {
			const markdown = await urlContentFetcher.urlToMarkdown(linkUrl)
			const summarizedMarkDown = await this.summarizeMarDownContent(markdown)
			const docFilePath = path.join(docsDir, statusData[index].filename || "")
			await fs.writeFile(docFilePath, summarizedMarkDown)

			statusData[index].status = DocumentStatus.COMPLETED
			statusData[index].processedAt = new Date().toISOString()
			statusData[index].error = null
			await fs.writeFile(statusFilePath, JSON.stringify(statusData, null, 2))
		} catch (error) {
			statusData[index].status = DocumentStatus.FAILED
			statusData[index].processedAt = new Date().toISOString()
			statusData[index].error = error instanceof Error ? error.message : String(error)
			await fs.writeFile(statusFilePath, JSON.stringify(statusData, null, 2))
			console.error(`Failed to refresh document link for expert ${expertName}:`, error)
		} finally {
			await urlContentFetcher.closeBrowser()
		}
	}

	/**
	 * Add document link
	 */

	async addDocumentLink(workspacePath: string, expertName: string, linkUrl: string): Promise<void> {
		const { expertDir, statusFilePath, metadataFilePath } = this.getExpertPaths(workspacePath, expertName)

		// Ensure the docs directory exists
		await createDirectoriesForFile(statusFilePath)

		// Read or initialize the status file
		let statusData: DocumentLink[] = []
		if (await fileExistsAtPath(statusFilePath)) {
			statusData = JSON.parse(await fs.readFile(statusFilePath, "utf-8"))
		}

		// Check if the maximum number of document links is reached
		if (statusData.length >= 3) {
			vscode.window.showWarningMessage("Maximum of 3 document links allowed. Additional links cannot be added.")
			return
		}

		// Add the new document link
		const newLink: DocumentLink = {
			url: linkUrl,
			status: DocumentStatus.PENDING,
			filename: `doc-${uuidv4()}.md`,
			processedAt: new Date().toISOString(),
			error: null,
		}

		statusData.push(newLink)
		await fs.writeFile(statusFilePath, JSON.stringify(statusData, null, 2))

		// Update metadata.json with the new document link
		const metadata = JSON.parse(await fs.readFile(metadataFilePath, "utf-8"))
		metadata.documentLinks = statusData.map((link) => ({ url: link.url }))
		await fs.writeFile(metadataFilePath, JSON.stringify(metadata, null, 2))

		// Process the newly added document link
		await this.processDocumentLinks(expertName, expertDir, [newLink], workspacePath)
	}

	/**
	 * Delete a document link for a custom expert
	 */
	async deleteDocumentLink(workspacePath: string, expertName: string, linkUrl: string): Promise<void> {
		const { docsDir, statusFilePath, metadataFilePath } = this.getExpertPaths(workspacePath, expertName)

		if (!(await fileExistsAtPath(statusFilePath))) {
			throw new Error("Status file not found")
		}

		const statusData: DocumentLink[] = JSON.parse(await fs.readFile(statusFilePath, "utf-8"))
		const updatedStatusData = statusData.filter((link) => link.url !== linkUrl)

		await fs.writeFile(statusFilePath, JSON.stringify(updatedStatusData, null, 2))

		// Update metadata.json after deleting the document link
		const metadata = JSON.parse(await fs.readFile(metadataFilePath, "utf-8"))
		metadata.documentLinks = updatedStatusData.map((link) => ({ url: link.url }))
		await fs.writeFile(metadataFilePath, JSON.stringify(metadata, null, 2))

		// Optionally delete the associated file if it exists
		const linkToDelete = statusData.find((link) => link.url === linkUrl)
		if (linkToDelete?.filename) {
			const filePath = path.join(docsDir, linkToDelete.filename)
			if (await fileExistsAtPath(filePath)) {
				await fs.unlink(filePath)
			}
		}
	}

	/**
	 * Read all experts from the .hai-experts directory
	 */
	async readExperts(workspacePath: string): Promise<ExpertData[]> {
		if (!workspacePath) {
			return []
		}

		const expertsDir = path.join(workspacePath, GlobalFileNames.experts)
		if (!(await fileExistsAtPath(expertsDir))) {
			return []
		}

		try {
			const expertFolders = await fs.readdir(expertsDir)
			const experts: ExpertData[] = []

			for (const folder of expertFolders) {
				const expertDir = path.join(expertsDir, folder)
				const stats = await fs.stat(expertDir)
				if (!stats.isDirectory()) {
					continue
				}

				try {
					const metadataPath = path.join(expertDir, ExpertManager.METADATA_FILE)
					const promptPath = path.join(expertDir, ExpertManager.PROMPT_FILE)
					const docsDir = path.join(expertDir, ExpertManager.DOCS_DIR)
					const statusFilePath = path.join(docsDir, ExpertManager.STATUS_FILE)

					if (!(await fileExistsAtPath(metadataPath)) || !(await fileExistsAtPath(promptPath))) {
						continue
					}

					const metadataContent = await fs.readFile(metadataPath, "utf-8")
					const metadata = JSON.parse(metadataContent)
					const promptContent = await fs.readFile(promptPath, "utf-8")

					let documentLinks: DocumentLink[] = metadata.documentLinks || []

					// Keep metadata.json as source of truth
					if (await fileExistsAtPath(statusFilePath)) {
						try {
							const statusContent = await fs.readFile(statusFilePath, "utf-8")
							const allStatusLinks: DocumentLink[] = JSON.parse(statusContent)

							const metadataUrls = new Set(documentLinks.map((link) => link.url))
							const statusUrls = new Set(allStatusLinks.map((link) => link.url))

							// Add missing links from metadata.json
							for (const link of documentLinks) {
								if (!statusUrls.has(link.url)) {
									await this.addDocumentLink(workspacePath, metadata.name, link.url)
								}
							}

							// Remove links from status.json that are not in metadata.json
							for (const link of allStatusLinks) {
								if (!metadataUrls.has(link.url)) {
									await this.deleteDocumentLink(workspacePath, metadata.name, link.url)
								}
							}

							// Filtered status.json entries based on metadata.json
							const seenUrls = new Set<string>()
							documentLinks = []

							for (const link of allStatusLinks) {
								if (metadataUrls.has(link.url) && !seenUrls.has(link.url)) {
									documentLinks.push(link)
									seenUrls.add(link.url)
								}
							}
						} catch (error) {
							console.error(`Failed to sync status.json for ${folder}:`, error)
						}
					} else {
						// status.json missing, process links from metadata
						for (const link of documentLinks) {
							await this.addDocumentLink(workspacePath, metadata.name, link.url)
						}

						if (await fileExistsAtPath(statusFilePath)) {
							const refreshed = JSON.parse(await fs.readFile(statusFilePath, "utf-8"))
							const metadataUrls = new Set(documentLinks.map((l) => l.url))
							documentLinks = refreshed.filter((link: DocumentLink) => metadataUrls.has(link.url))
						}
					}

					const expertData = {
						name: metadata.name,
						isDefault: metadata.isDefault,
						prompt: promptContent,
						createdAt: metadata.createdAt,
						documentLinks,
					}

					const validationResult = ExpertDataSchema.safeParse(expertData)
					if (validationResult.success) {
						experts.push(validationResult.data)
					} else {
						vscode.window.showWarningMessage(
							`Invalid expert data for ${folder}: ${validationResult.error.issues.map((i) => i.message).join(", ")}`,
						)
					}
				} catch (err) {
					console.error(`Error reading expert folder ${folder}:`, err)
				}
			}

			return experts
		} catch (error) {
			console.error("Failed to read experts directory:", error)
			return []
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
		const expertsDir = path.join(workspacePath, GlobalFileNames.experts)
		if (!(await fileExistsAtPath(expertsDir))) {
			return
		}
		const expertFolders = await fs.readdir(expertsDir)
		for (const folder of expertFolders) {
			const expertDir = path.join(expertsDir, folder)
			const stats = await fs.stat(expertDir)
			if (stats.isDirectory()) {
				const metadataPath = path.join(expertDir, ExpertManager.METADATA_FILE)
				if (await fileExistsAtPath(metadataPath)) {
					try {
						const metadataContent = await fs.readFile(metadataPath, "utf-8")
						const metadata = JSON.parse(metadataContent)
						if (metadata.name === expertName) {
							await fs.rm(expertDir, { recursive: true, force: true })
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
		const expertsDir = path.join(workspacePath, GlobalFileNames.experts)
		if (!(await fileExistsAtPath(expertsDir))) {
			return null
		}
		const expertFolders = await fs.readdir(expertsDir)
		for (const folder of expertFolders) {
			const expertDir = path.join(expertsDir, folder)
			const stats = await fs.stat(expertDir)
			if (stats.isDirectory()) {
				const metadataPath = path.join(expertDir, ExpertManager.METADATA_FILE)
				if (await fileExistsAtPath(metadataPath)) {
					try {
						const metadataContent = await fs.readFile(metadataPath, "utf-8")
						const metadata = JSON.parse(metadataContent)
						if (metadata.name === expertName) {
							const promptPath = path.join(expertDir, ExpertManager.PROMPT_FILE)
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
	 * Summarize the content
	 */
	private async summarizeMarDownContent(markDownContent: string) {
		let content = ""
		const { apiConfiguration } = await getAllExtensionState(this.extensionContext, this.workspaceId)
		const llmApi = buildApiHandler(apiConfiguration)
		const apiStream = llmApi.createMessage(this.systemPrompt, [
			{
				role: "user",
				content: markDownContent,
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
	 * Load the default Experts
	 */

	async loadDefaultExperts(): Promise<ExpertData[]> {
		const expertsDir = path.join(this.extensionContext.extensionPath, GlobalFileNames.defaultExperts)

		let expertFolders: string[] = []
		try {
			const dirents = await fs.readdir(expertsDir, { withFileTypes: true })
			expertFolders = dirents.filter((dirent) => dirent.isDirectory()).map((dirent) => dirent.name)
		} catch (error) {
			console.error("Error reading experts directory:", error)
			return []
		}

		const experts = await Promise.all(
			expertFolders.map(async (folderName) => {
				const folderPath = path.join(expertsDir, folderName)
				const promptPath = path.join(folderPath, ExpertManager.PROMPT_FILE)
				const iconPath = path.join(folderPath, `${folderName}.svg`)

				let prompt = ""
				try {
					prompt = await fs.readFile(promptPath, "utf8")
				} catch (error) {
					console.error(`Error reading prompt for ${folderName}:`, error)
				}

				let iconBase64 = ""
				try {
					const svgContent = await fs.readFile(iconPath)
					iconBase64 = `data:image/svg+xml;base64,${svgContent.toString("base64")}`
				} catch (error) {
					console.warn(`Icon not found for ${folderName}`)
				}

				return {
					name: folderName,
					prompt,
					isDefault: true,
					iconComponent: iconBase64,
				}
			}),
		)

		return experts
	}
}
