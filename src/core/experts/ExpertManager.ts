import fs from "fs/promises"
import * as path from "path"
import * as vscode from "vscode"
import { v4 as uuidv4 } from "uuid"
import { DocumentLink, ExpertData, ExpertDataSchema } from "../../shared/experts"
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

	constructor(extensionContext: vscode.ExtensionContext, workspaceId: string) {
		this.extensionContext = extensionContext
		this.workspaceId = workspaceId
		this.systemPrompt = HaiBuildDefaults.defaultMarkDownSummarizer
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

		const sanitizedName = expert.name.replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase()
		const expertDir = path.join(workspacePath, GlobalFileNames.experts, sanitizedName)
		await createDirectoriesForFile(path.join(expertDir, "placeholder.txt"))

		const metadataFilePath = path.join(expertDir, "metadata.json")
		const metadata = {
			name: expert.name,
			isDefault: expert.isDefault,
			createdAt: expert.createdAt || new Date().toISOString(),
			documentLinks: expert.documentLinks || [],
		}
		await fs.writeFile(metadataFilePath, JSON.stringify(metadata, null, 2))

		const promptFilePath = path.join(expertDir, "prompt.md")
		await fs.writeFile(promptFilePath, expert.prompt)

		if (expert.documentLinks && expert.documentLinks.length > 0) {
			const docsDir = path.join(expertDir, "docs")
			await createDirectoriesForFile(path.join(docsDir, "placeholder.txt"))

			// Set initial status to "pending"
			const statusData = expert.documentLinks.map((link) => ({
				...link,
				filename: `doc-${uuidv4()}.md`,
				status: "pending" as "pending" | "processing" | "completed" | "failed",
				processedAt: new Date().toISOString(),
				error: null,
			}))

			const statusFilePath = path.join(docsDir, "status.json")
			await fs.writeFile(statusFilePath, JSON.stringify(statusData, null, 2))

			// Process document links (pass workspacePath)
			this.processDocumentLinks(expert.name, expertDir, statusData, workspacePath)
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
		const docsDir = path.join(expertDir, "docs")
		const statusFilePath = path.join(docsDir, "status.json")

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
				link.status = "processing"
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

					link.status = "completed"
					link.processedAt = new Date().toISOString()
					link.error = null
				} catch (error) {
					link.status = "failed"
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
		const sanitizedName = expertName.replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase()
		const expertDir = path.join(workspacePath, GlobalFileNames.experts, sanitizedName)
		const docsDir = path.join(expertDir, "docs")
		const statusFilePath = path.join(docsDir, "status.json")

		let statusData: DocumentLink[] = JSON.parse(await fs.readFile(statusFilePath, "utf-8"))
		const index = statusData.findIndex((link) => link.url === linkUrl)
		if (index === -1) {
			return
		}

		// Update status to processing
		statusData[index].status = "processing"
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

			statusData[index].status = "completed"
			statusData[index].processedAt = new Date().toISOString()
			statusData[index].error = null
			await fs.writeFile(statusFilePath, JSON.stringify(statusData, null, 2))
		} catch (error) {
			statusData[index].status = "failed"
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
		const sanitizedName = expertName.replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase()
		const expertDir = path.join(workspacePath, GlobalFileNames.experts, sanitizedName)
		const docsDir = path.join(expertDir, "docs")
		const statusFilePath = path.join(docsDir, "status.json")
		const metadataFilePath = path.join(expertDir, "metadata.json")

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
			status: "pending",
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
		const sanitizedName = expertName.replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase()
		const expertDir = path.join(workspacePath, GlobalFileNames.experts, sanitizedName)
		const docsDir = path.join(expertDir, "docs")
		const statusFilePath = path.join(docsDir, "status.json")
		const metadataFilePath = path.join(expertDir, "metadata.json")

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
				if (stats.isDirectory()) {
					try {
						const metadataPath = path.join(expertDir, "metadata.json")
						const promptPath = path.join(expertDir, "prompt.md")
						const docsDir = path.join(expertDir, "docs")
						const statusFilePath = path.join(docsDir, "status.json")

						if ((await fileExistsAtPath(metadataPath)) && (await fileExistsAtPath(promptPath))) {
							const metadataContent = await fs.readFile(metadataPath, "utf-8")
							const metadata = JSON.parse(metadataContent)
							const promptContent = await fs.readFile(promptPath, "utf-8")

							// Initialize documentLinks from metadata.json
							let documentLinks: DocumentLink[] = metadata.documentLinks || []

							// Check if status.json exists
							if (await fileExistsAtPath(statusFilePath)) {
								try {
									const statusContent = await fs.readFile(statusFilePath, "utf-8")
									const statusLinks: DocumentLink[] = JSON.parse(statusContent)

									// Synchronize metadata.json and status.json
									const statusUrls = new Set(statusLinks.map((link) => link.url))
									const metadataUrls = new Set(documentLinks.map((link) => link.url))

									// Add missing links from metadata.json to status.json
									for (const link of documentLinks) {
										if (!statusUrls.has(link.url)) {
											await this.addDocumentLink(workspacePath, metadata.name, link.url)
										}
									}

									// Remove extra links from status.json not in metadata.json
									for (const link of statusLinks) {
										if (!metadataUrls.has(link.url)) {
											await this.deleteDocumentLink(workspacePath, metadata.name, link.url)
										}
									}

									// Reload documentLinks after synchronization
									documentLinks = JSON.parse(await fs.readFile(statusFilePath, "utf-8"))
								} catch (error) {
									console.error(`Failed to read or synchronize document links for ${folder}:`, error)
								}
							} else {
								// If status.json is missing, process all links from metadata.json
								for (const link of documentLinks) {
									await this.addDocumentLink(workspacePath, metadata.name, link.url)
								}

								// Reload documentLinks after processing
								if (await fileExistsAtPath(statusFilePath)) {
									documentLinks = JSON.parse(await fs.readFile(statusFilePath, "utf-8"))
								}
							}

							// Construct expert data
							const expertData = {
								name: metadata.name,
								isDefault: metadata.isDefault,
								prompt: promptContent,
								createdAt: metadata.createdAt,
								documentLinks,
							}

							// Validate expert data
							const validationResult = ExpertDataSchema.safeParse(expertData)
							if (validationResult.success) {
								experts.push(expertData)
							} else {
								vscode.window.showWarningMessage(
									`Invalid expert data for ${folder}: ${validationResult.error.issues.map((issue) => issue.message).join(", ")}`,
								)
							}
						}
					} catch (error) {
						console.error(`Failed to read expert from ${folder}:`, error)
					}
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
				const metadataPath = path.join(expertDir, "metadata.json")
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
				const metadataPath = path.join(expertDir, "metadata.json")
				if (await fileExistsAtPath(metadataPath)) {
					try {
						const metadataContent = await fs.readFile(metadataPath, "utf-8")
						const metadata = JSON.parse(metadataContent)
						if (metadata.name === expertName) {
							const promptPath = path.join(expertDir, "prompt.md")
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
}
