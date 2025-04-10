import fs from "fs/promises"
import * as path from "path"
import * as vscode from "vscode"
import { ExpertData, ExpertDataSchema } from "../../../webview-ui/src/types/experts"
import { fileExistsAtPath, createDirectoriesForFile } from "../../utils/fs"
import { GlobalFileNames } from "../../global-constants"

export class ExpertManager {
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

							const expertData = {
								name: metadata.name,
								isDefault: metadata.isDefault,
								prompt: promptContent,
								createdAt: metadata.createdAt,
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
