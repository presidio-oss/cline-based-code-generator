import fs from "fs/promises"
import * as path from "path"
import * as vscode from "vscode"
import { v4 as uuidv4 } from "uuid"
import { DocumentLink, ExpertData, ExpertDataSchema } from "../../../webview-ui/src/types/experts"
import { fileExistsAtPath, createDirectoriesForFile } from "../../utils/fs"
import { GlobalFileNames } from "../../global-constants"
import { UrlContentFetcher } from "../../services/browser/UrlContentFetcher"

export class ExpertManager {
	private extensionContext?: vscode.ExtensionContext

	constructor(extensionContext?: vscode.ExtensionContext) {
		this.extensionContext = extensionContext
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
					const docFilePath = path.join(docsDir, link.filename || "")
					await fs.writeFile(docFilePath, markdown)

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
			const docFilePath = path.join(docsDir, statusData[index].filename || "")
			await fs.writeFile(docFilePath, markdown)

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
			throw new Error("Maximum of 3 document links allowed")
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
						if ((await fileExistsAtPath(metadataPath)) && (await fileExistsAtPath(promptPath))) {
							const metadataContent = await fs.readFile(metadataPath, "utf-8")
							const metadata = JSON.parse(metadataContent)
							const promptContent = await fs.readFile(promptPath, "utf-8")
							const docsDir = path.join(expertDir, "docs")
							const statusFilePath = path.join(docsDir, "status.json")
							let documentLinks: DocumentLink[] | undefined = undefined
							if (await fileExistsAtPath(statusFilePath)) {
								try {
									const statusContent = await fs.readFile(statusFilePath, "utf-8")
									documentLinks = JSON.parse(statusContent)
								} catch (error) {
									console.error(`Failed to read document links status for ${folder}:`, error)
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
}
