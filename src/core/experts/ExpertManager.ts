import fs from "fs/promises"
import * as path from "path"
import { ExpertData } from "../../../webview-ui/src/types/experts"
import { fileExistsAtPath, createDirectoriesForFile } from "../../utils/fs"

export class ExpertManager {
	/**
	 * Save an expert to the .vscode/experts directory
	 * @param workspacePath The workspace path
	 * @param expert The expert data to save
	 */
	async saveExpert(workspacePath: string, expert: ExpertData): Promise<void> {
		if (!workspacePath) {
			throw new Error("No workspace path provided")
		}

		const expertsDir = path.join(workspacePath, ".vscode", "experts")
		await createDirectoriesForFile(path.join(expertsDir, "placeholder.txt"))

		const expertFilePath = path.join(expertsDir, `expert-${expert.id}.json`)
		await fs.writeFile(expertFilePath, JSON.stringify(expert, null, 2))
	}

	/**
	 * Read all experts from the .vscode/experts directory
	 * @param workspacePath The workspace path
	 * @returns Array of expert data
	 */
	async readExperts(workspacePath: string): Promise<ExpertData[]> {
		if (!workspacePath) {
			return []
		}

		const expertsDir = path.join(workspacePath, ".vscode", "experts")
		if (!(await fileExistsAtPath(expertsDir))) {
			return []
		}

		try {
			const files = await fs.readdir(expertsDir)
			const expertFiles = files.filter((file) => file.startsWith("expert-") && file.endsWith(".json"))

			const experts: ExpertData[] = []
			for (const file of expertFiles) {
				const filePath = path.join(expertsDir, file)
				const content = await fs.readFile(filePath, "utf-8")
				try {
					const expert = JSON.parse(content) as ExpertData
					experts.push(expert)
				} catch (error) {
					console.error(`Failed to parse expert file ${file}:`, error)
				}
			}

			return experts
		} catch (error) {
			console.error("Failed to read experts directory:", error)
			return []
		}
	}

	/**
	 * Delete an expert from the .vscode/experts directory
	 * @param workspacePath The workspace path
	 * @param expertId The ID of the expert to delete
	 */
	async deleteExpert(workspacePath: string, expertId: string): Promise<void> {
		if (!workspacePath) {
			throw new Error("No workspace path provided")
		}

		const expertsDir = path.join(workspacePath, ".vscode", "experts")
		const expertFilePath = path.join(expertsDir, `expert-${expertId}.json`)

		if (await fileExistsAtPath(expertFilePath)) {
			await fs.unlink(expertFilePath)
		}
	}
}
