import { join } from "path"
import { HaiBuildDefaults } from "../shared/haiDefaults"
import { existsSync, readFileSync, rmSync, writeFileSync } from "fs"

export async function deleteFromContextDirectory(filePaths: string[], srcFolder: string) {
	// Get destination paths
	const destinationFolderPath = join(srcFolder, HaiBuildDefaults.defaultContextDirectory)
	const repoHashFilePath = join(destinationFolderPath, HaiBuildDefaults.defaultRepoHashFileName)

	// Delete files from context directory
	for (const filePath of filePaths) {
		const destinationFilePath = filePath.replace(srcFolder, destinationFolderPath)
		if (existsSync(destinationFilePath)) {
			rmSync(destinationFilePath, { recursive: true })
		}
	}

	// Handle hash file updates
	if (existsSync(repoHashFilePath)) {
		const content = readFileSync(repoHashFilePath, "utf-8").trim()
		const hashMap: Record<string, string> = JSON.parse(content)

		let isModified = false
		const hashMapKeys = Object.keys(hashMap)

		// Process files and their containing directories
		for (const filePath of filePaths) {
			// Find keys that match either exact file path or are contained within directory path
			const keysToDelete = hashMapKeys.filter((key) => key === filePath || key.includes(filePath))
			if (keysToDelete.length > 0) {
				keysToDelete.forEach((key) => delete hashMap[key])
				isModified = true
			}
		}

		// Update hash file if changes were made
		if (isModified) {
			writeFileSync(repoHashFilePath, JSON.stringify(hashMap, null, 2))
		}
	}
}
