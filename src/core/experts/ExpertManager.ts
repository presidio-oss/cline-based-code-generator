import fs from "fs/promises"
import * as path from "path"
import { ExpertData } from "../../../webview-ui/src/types/experts"
import { fileExistsAtPath, createDirectoriesForFile } from "../../utils/fs"

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

		// Create a sanitized folder name from the expert name
		const sanitizedName = expert.name.replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase()

		// Create the expert directory
		const expertDir = path.join(workspacePath, ".hai-experts", sanitizedName)
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

		const expertsDir = path.join(workspacePath, ".hai-experts")
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
						if (await fileExistsAtPath(metadataPath)) {
							const metadataContent = await fs.readFile(metadataPath, "utf-8")
							const metadata = JSON.parse(metadataContent)

							// Read prompt
							const promptPath = path.join(expertDir, "prompt.md")
							const promptContent = (await fileExistsAtPath(promptPath))
								? await fs.readFile(promptPath, "utf-8")
								: ""

							experts.push({
								name: metadata.name,
								isDefault: metadata.isDefault,
								prompt: promptContent,
								createdAt: metadata.createdAt,
							})
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

		const expertsDir = path.join(workspacePath, ".hai-experts")
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
}
