import fs from "fs/promises"
import * as path from "path"
import * as vscode from "vscode"
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
	 * @param workspacePath The workspace path
	 * @param expert The expert data to save
	 */
	async saveExpert(workspacePath: string, expert: ExpertData): Promise<void> {
		if (!workspacePath) {
			throw new Error("No workspace path provided")
		}

		// Validate expert data with Zod schema
		const validationResult = ExpertDataSchema.safeParse(expert)
		if (!validationResult.success) {
			throw new Error(`Invalid expert data: ${validationResult.error.message}`)
		}

		// Create a sanitized folder name from the expert name
		const sanitizedName = expert.name.replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase()

		// Create the expert directory
		const expertDir = path.join(workspacePath, GlobalFileNames.experts, sanitizedName)
		await createDirectoriesForFile(path.join(expertDir, "placeholder.txt"))

		// Create metadata file
		const metadataFilePath = path.join(expertDir, "metadata.json")
		const metadata = {
			name: expert.name,
			isDefault: expert.isDefault,
			createdAt: expert.createdAt || Date.now(),
		}
		await fs.writeFile(metadataFilePath, JSON.stringify(metadata, null, 2))

		// Create prompt file
		const promptFilePath = path.join(expertDir, "prompt.md")
		await fs.writeFile(promptFilePath, expert.prompt)

		// Process document links if any
		if (expert.documentLinks && expert.documentLinks.length > 0) {
			// Create docs directory
			const docsDir = path.join(expertDir, "docs")
			await createDirectoriesForFile(path.join(docsDir, "placeholder.txt"))

			// Create status.json file to track document processing status
			const statusFilePath = path.join(docsDir, "status.json")
			const statusData = expert.documentLinks.map((link, index) => ({
				...link,
				filename: `Doc-${index + 1}.md`,
				status: "fetching" as "fetching" | "completed" | "failed",
				processedAt: new Date().toISOString(),
				error: null,
			}))

			await fs.writeFile(statusFilePath, JSON.stringify(statusData, null, 2))

			// Process each document link asynchronously
			this.processDocumentLinks(expert.name, expertDir, statusData)
		}
	}

	/**
	 * Process document links for an expert
	 * @param expertName The name of the expert
	 * @param expertDir The expert directory path
	 * @param documentLinks The document links to process
	 */
	private async processDocumentLinks(expertName: string, expertDir: string, documentLinks: DocumentLink[]): Promise<void> {
		const docsDir = path.join(expertDir, "docs")
		const statusFilePath = path.join(docsDir, "status.json")

		if (!this.extensionContext) {
			console.error("Extension context not available")
			return
		}

		const urlContentFetcher = new UrlContentFetcher(this.extensionContext)

		try {
			// Launch browser once for all documents
			await urlContentFetcher.launchBrowser()

			// Process each document link sequentially
			for (const link of documentLinks) {
				try {
					// Update status to fetching
					link.status = "fetching"
					link.processedAt = new Date().toISOString()
					await fs.writeFile(statusFilePath, JSON.stringify(documentLinks, null, 2))

					// Fetch and convert content
					const markdown = await urlContentFetcher.urlToMarkdown(link.url)

					// Save content to file
					const docFilePath = path.join(docsDir, link.filename || "")
					await fs.writeFile(docFilePath, markdown)

					// Update status to completed
					link.status = "completed"
					link.processedAt = new Date().toISOString()
					link.error = null
					await fs.writeFile(statusFilePath, JSON.stringify(documentLinks, null, 2))
				} catch (error) {
					// Update status to failed
					link.status = "failed"
					link.processedAt = new Date().toISOString()
					link.error = error instanceof Error ? error.message : String(error)
					await fs.writeFile(statusFilePath, JSON.stringify(documentLinks, null, 2))

					console.error(`Failed to process document link for expert ${expertName}:`, error)
				}
			}
		} catch (error) {
			console.error(`Error processing document links for expert ${expertName}:`, error)
		} finally {
			// Close browser
			await urlContentFetcher.closeBrowser()
		}
	}

	/**
	 * Read all experts from the .hai-experts directory
	 * @param workspacePath The workspace path
	 * @returns Array of expert data
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
						// Read metadata
						const metadataPath = path.join(expertDir, "metadata.json")
						const promptPath = path.join(expertDir, "prompt.md")

						if ((await fileExistsAtPath(metadataPath)) && (await fileExistsAtPath(promptPath))) {
							const metadataContent = await fs.readFile(metadataPath, "utf-8")
							const metadata = JSON.parse(metadataContent)

							// Read prompt
							const promptContent = await fs.readFile(promptPath, "utf-8")

							// Read document links status if available
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

							// Validate expert data with Zod schema
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
	 * Get document links status for an expert
	 * @param workspacePath The workspace path
	 * @param expertName The name of the expert
	 * @returns Array of document links with status
	 */
	async getDocumentLinksStatus(workspacePath: string, expertName: string): Promise<DocumentLink[]> {
		if (!workspacePath || !expertName) {
			return []
		}

		// Find the expert directory
		const sanitizedName = expertName.replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase()
		const expertDir = path.join(workspacePath, GlobalFileNames.experts, sanitizedName)

		if (!(await fileExistsAtPath(expertDir))) {
			return []
		}

		// Check for status.json file
		const docsDir = path.join(expertDir, "docs")
		const statusFilePath = path.join(docsDir, "status.json")

		if (!(await fileExistsAtPath(statusFilePath))) {
			return []
		}

		try {
			const statusContent = await fs.readFile(statusFilePath, "utf-8")
			return JSON.parse(statusContent)
		} catch (error) {
			console.error(`Failed to read document links status for ${expertName}:`, error)
			return []
		}
	}

	/**
	 * Delete an expert from the .hai-experts directory
	 * @param workspacePath The workspace path
	 * @param expertName The name of the expert to delete
	 */
	async deleteExpert(workspacePath: string, expertName: string): Promise<void> {
		if (!workspacePath) {
			throw new Error("No workspace path provided")
		}

		// Validate expert name
		if (!expertName || typeof expertName !== "string") {
			throw new Error("Expert name must be a non-empty string")
		}

		const expertsDir = path.join(workspacePath, GlobalFileNames.experts)
		if (!(await fileExistsAtPath(expertsDir))) {
			return
		}

		// Find the expert folder by reading metadata files
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
							// Delete the entire expert directory
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
	 * @param workspacePath The workspace path
	 * @param expertName The name of the expert
	 * @returns The path to the prompt.md file, or null if not found
	 */
	async getExpertPromptPath(workspacePath: string, expertName: string): Promise<string | null> {
		if (!workspacePath) {
			throw new Error("No workspace path provided")
		}

		// Validate expert name
		if (!expertName || typeof expertName !== "string") {
			throw new Error("Expert name must be a non-empty string")
		}

		const expertsDir = path.join(workspacePath, GlobalFileNames.experts)
		if (!(await fileExistsAtPath(expertsDir))) {
			return null
		}

		// Find the expert folder by reading metadata files
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
							// Return the path to the prompt.md file
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
