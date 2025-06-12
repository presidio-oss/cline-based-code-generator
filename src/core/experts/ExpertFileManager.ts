import fs from "fs/promises"
import * as path from "path"
import { existsSync } from "fs"
import { fileExistsAtPath, createDirectoriesForFile } from "../../utils/fs"
import { DocumentLink, DocumentStatus, ExpertData, ExpertDataSchema } from "../../shared/experts"
import { GlobalFileNames } from "../../global-constants"
import { ExpertPaths, ExpertMetadata } from "./types"

/**
 * Manages file operations for experts
 */
export class ExpertFileManager {
	// File and directory constants
	public static readonly METADATA_FILE = "metadata.json"
	public static readonly PROMPT_FILE = "prompt.md"
	public static readonly ICON = "icon.svg"
	public static readonly DOCS_DIR = "docs"
	public static readonly STATUS_FILE = "status.json"
	public static readonly PLACEHOLDER_FILE = "placeholder.txt"
	public static readonly FAISS = ".faiss"
	public static readonly CRAWLEE_STORAGE = ".crawlee"

	/**
	 * Format expert names to be file system friendly
	 */
	public formatExpertName(name: string): string {
		return name.replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase()
	}

	/**
	 * Get expert directory paths
	 */
	public getExpertPaths(workspacePath: string, expertName: string): ExpertPaths {
		const sanitizedName = this.formatExpertName(expertName)
		const expertDir = path.join(workspacePath, GlobalFileNames.experts, sanitizedName)
		const docsDir = path.join(expertDir, ExpertFileManager.DOCS_DIR)
		const statusFilePath = path.join(docsDir, ExpertFileManager.STATUS_FILE)
		const metadataFilePath = path.join(expertDir, ExpertFileManager.METADATA_FILE)
		const faissFilePath = path.join(expertDir, ExpertFileManager.FAISS)
		const faissStatusFilePath = path.join(faissFilePath, ExpertFileManager.STATUS_FILE)
		const crawlStorage = path.join(expertDir, ExpertFileManager.CRAWLEE_STORAGE)

		return {
			sanitizedName,
			expertDir,
			docsDir,
			statusFilePath,
			metadataFilePath,
			faissFilePath,
			faissStatusFilePath,
			crawlStorage,
		}
	}

	/**
	 * Read status file
	 */
	public async readStatusFile(filePath: string): Promise<DocumentLink[]> {
		try {
			// First check if the file exists
			if (await fileExistsAtPath(filePath)) {
				try {
					// Read and parse the content
					const content = await fs.readFile(filePath, "utf-8")
					const parsed = JSON.parse(content)

					// Validate that it's an array
					if (Array.isArray(parsed)) {
						// Ensure each item has a valid status value
						return parsed.map((item) => {
							// Ensure status is one of the valid enum values
							if (
								item.status &&
								item.status !== DocumentStatus.PENDING &&
								item.status !== DocumentStatus.PROCESSING &&
								item.status !== DocumentStatus.COMPLETED &&
								item.status !== DocumentStatus.FAILED
							) {
								item.status = DocumentStatus.PENDING
							}
							return item
						})
					}

					// If not an array, return empty
					console.error(`Status file content is not an array: ${filePath}`)
					return []
				} catch (parseError) {
					console.error(`Failed to parse status file at ${filePath}:`, parseError)
					return []
				}
			}
			// If the file doesn't exist, return an empty array
			return []
		} catch (error) {
			console.error(`Failed to check or read status file at ${filePath}:`, error)
			return []
		}
	}

	/**
	 * Write status file
	 */
	public async writeStatusFile(filePath: string, data: DocumentLink[]): Promise<void> {
		try {
			await createDirectoriesForFile(filePath)
			await fs.writeFile(filePath, JSON.stringify(data, null, 2))
		} catch (error) {
			console.error(`Failed to write status file at ${filePath}:`, error)
		}
	}

	/**
	 * Update faiss status file
	 */
	public async updateFaissStatusFile(faissStatusFilePath: string, links: DocumentLink[]): Promise<void> {
		try {
			await createDirectoriesForFile(faissStatusFilePath)
			await fs.writeFile(faissStatusFilePath, JSON.stringify(links, null, 2))
		} catch (error) {
			console.error(`Failed to update faiss status file at ${faissStatusFilePath}:`, error)
		}
	}

	/**
	 * Read expert metadata
	 */
	public async readExpertMetadata(metadataPath: string): Promise<ExpertMetadata | null> {
		try {
			if (await fileExistsAtPath(metadataPath)) {
				const content = await fs.readFile(metadataPath, "utf-8")
				return JSON.parse(content)
			}
			return null
		} catch (error) {
			console.error(`Failed to read metadata at ${metadataPath}:`, error)
			return null
		}
	}

	/**
	 * Write expert metadata
	 */
	public async writeExpertMetadata(metadataPath: string, metadata: ExpertMetadata): Promise<void> {
		try {
			await createDirectoriesForFile(metadataPath)
			await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2))
		} catch (error) {
			console.error(`Failed to write metadata at ${metadataPath}:`, error)
		}
	}

	/**
	 * Read expert prompt
	 */
	public async readExpertPrompt(promptPath: string): Promise<string | null> {
		try {
			if (await fileExistsAtPath(promptPath)) {
				return await fs.readFile(promptPath, "utf-8")
			}
			return null
		} catch (error) {
			console.error(`Failed to read prompt at ${promptPath}:`, error)
			return null
		}
	}

	/**
	 * Write expert prompt
	 */
	public async writeExpertPrompt(promptPath: string, prompt: string): Promise<void> {
		try {
			await createDirectoriesForFile(promptPath)
			await fs.writeFile(promptPath, prompt)
		} catch (error) {
			console.error(`Failed to write prompt at ${promptPath}:`, error)
		}
	}

	/**
	 * Check if expert exists
	 */
	public async expertExists(workspacePath: string, expertName: string): Promise<boolean> {
		const { expertDir } = this.getExpertPaths(workspacePath, expertName)
		return await fileExistsAtPath(expertDir)
	}

	/**
	 * Get document file path
	 */
	public getDocumentFilePath(docsDir: string, filename: string): string {
		return path.join(docsDir, filename)
	}

	/**
	 * Create expert directory structure
	 */
	public async createExpertDirectoryStructure(expertDir: string): Promise<void> {
		await createDirectoriesForFile(path.join(expertDir, ExpertFileManager.PLACEHOLDER_FILE))
	}

	/**
	 * Create expert docs directory
	 */
	public async createExpertDocsDirectory(docsDir: string): Promise<void> {
		await createDirectoriesForFile(path.join(docsDir, ExpertFileManager.PLACEHOLDER_FILE))
	}

	/**
	 * Delete file if exists
	 */
	public async deleteFileIfExists(filePath: string): Promise<void> {
		if (await fileExistsAtPath(filePath)) {
			await fs.unlink(filePath)
		}
	}

	/**
	 * Delete expert directory
	 */
	public async deleteExpertDirectory(expertDir: string): Promise<void> {
		try {
			if (await fileExistsAtPath(expertDir)) {
				await fs.rm(expertDir, { recursive: true, force: true })
			}
		} catch (error) {
			console.error(`Failed to delete expert directory ${expertDir}:`, error)
		}
	}
}
