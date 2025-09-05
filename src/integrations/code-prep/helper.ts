import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { basename, join } from "node:path"
import { ApiStream } from "@core/api/transform/stream"
import { BedrockEmbeddings } from "@langchain/aws"
import { OllamaEmbeddings } from "@langchain/ollama"
import { AzureOpenAIEmbeddings, OpenAIEmbeddings } from "@langchain/openai"
import ignore from "ignore"
// @ts-ignore
import walk from "ignore-walk"
import { azureOpenAIApiVersion, EmbeddingConfiguration } from "../../shared/embeddings"

/**
 * Recursively retrieves all code files from a given source folder,
 * excluding any files within specified excluded folders or 'tmp' folders if requested.
 * @returns An array of strings representing the file paths of all code files found.
 */
export function getCodeFiles(srcFolder: string, excludedFolders: string[], excludedFiles: string[] = []): string[] {
	const ig = ignore().add([...excludedFolders, ...excludedFiles])
	const files = walk.sync({ path: srcFolder, follow: true, ignoreFiles: [".gitignore"] })
	const filesFiltered = ig.filter(files)
	return filesFiltered.map((file) => join(srcFolder, file))
}

/**
 * Creates a directory at the specified path if it does not already exist.
 *
 * @param directoryPath - The path where the directory should be created.
 */
export function createDirectoryIfNotExists(directoryPath: string): string | void {
	if (!existsSync(directoryPath)) {
		return mkdirSync(directoryPath, { recursive: true })
	}
}

export function getEmbeddings(embeddingConfig: EmbeddingConfiguration) {
	if (!embeddingConfig.provider || !embeddingConfig.modelId) {
		throw new Error("Embedding provider and model ID are required")
	}

	switch (embeddingConfig.provider) {
		case "bedrock": {
			if (!embeddingConfig.awsAccessKey || !embeddingConfig.awsSecretKey) {
				throw new Error("AWS Credentials are required for Bedrock Embeddings")
			}

			return new BedrockEmbeddings({
				model: embeddingConfig.modelId,
				region: embeddingConfig.awsRegion,
				credentials: {
					accessKeyId: embeddingConfig.awsAccessKey,
					secretAccessKey: embeddingConfig.awsSecretKey,
					...(embeddingConfig.awsSessionToken ? { sessionToken: embeddingConfig.awsSessionToken } : {}),
				},
			})
		}

		case "openai-native": {
			if (!embeddingConfig.openAiNativeApiKey) {
				throw new Error("API Key is required for OpenAI")
			}

			return new OpenAIEmbeddings({
				model: embeddingConfig.modelId,
				apiKey: embeddingConfig.openAiNativeApiKey,
				configuration: {
					apiKey: embeddingConfig.openAiNativeApiKey,
					baseURL: "https://api.openai.com/v1",
				},
			})
		}

		case "openai": {
			if (!embeddingConfig.openAiApiKey || !embeddingConfig.openAiBaseUrl || !embeddingConfig.openAiModelId) {
				throw new Error("Azure OpenAI API Key, Model ID and Base URL are required for Azure OpenAI")
			}

			const originalURL = new URL(embeddingConfig.openAiBaseUrl)
			const baseURL = originalURL.origin

			return new AzureOpenAIEmbeddings({
				azureOpenAIApiKey: embeddingConfig.openAiApiKey,
				azureOpenAIBasePath: baseURL + "/openai/deployments",
				azureOpenAIApiEmbeddingsDeploymentName: embeddingConfig.openAiModelId,
				azureOpenAIApiVersion: embeddingConfig.azureOpenAIApiVersion || azureOpenAIApiVersion,
			})
		}

		case "ollama": {
			if (!embeddingConfig.ollamaModelId) {
				throw new Error("Ollama model ID is required")
			}
			return new OllamaEmbeddings({
				model: embeddingConfig.ollamaModelId,
				baseUrl: embeddingConfig.ollamaBaseUrl || "http://localhost:11434",
			})
		}

		default:
			throw new Error(`Unsupported embedding provider: ${embeddingConfig.provider}`)
	}
}

/**
 * Searches a given directory and all its subdirectories for files with a specific name.
 *
 * @param directory - The root directory path to initiate the search from.
 * @param targetFile - The name of the file to search for. Only exact matches are considered.
 * @returns An array of full paths to the files that match the target file name.
 */
export function findFilesInDirectory(directory: string, targetFile: string): string[] {
	const matchingFiles: string[] = []

	const searchDirectory = (currentDirectory: string) => {
		const entries = readdirSync(currentDirectory, { withFileTypes: true })

		for (const entry of entries) {
			const fullPath = join(currentDirectory, entry.name)

			if (entry.isDirectory()) {
				// Recursively search in subdirectory
				searchDirectory(fullPath)
			} else if (entry.isFile() && entry.name === targetFile) {
				// If the target file is found, add its full path to the list
				matchingFiles.push(fullPath)
			}
		}
	}

	searchDirectory(directory)
	return matchingFiles
}

/**
 * Reads a .gitignore file from a specified path and processes its contents.
 *
 * The function reads the contents of the .gitignore file, splits the content into lines,
 * and filters out any lines that are comments or empty. Only non-empty, non-comment lines
 * are returned, representing entries in the .gitignore file that are meant to specify
 * patterns to be ignored by Git.
 *
 * @param filePath - The path to the .gitignore file to be read and processed.
 * @returns An array of strings, each representing a non-comment, non-empty line from the
 *          .gitignore file, indicating patterns for Git to ignore.
 */
export function readAndProcessGitignore(filePath: string): string[] {
	const content = readFileSync(filePath, "utf-8")
	const lines = content.split("\n")

	// Filter out comments and empty lines
	const processedLines = lines.filter((line) => {
		const trimmedLine = line.trim()
		return trimmedLine && !trimmedLine.startsWith("#")
	})

	return processedLines
}

export interface FolderStructure {
	name: string
	type: string
	children?: FolderStructure[]
}

/**
 * Recursively generates the folder structure starting from a specified directory path,
 * while filtering out specified excluded folders. The function handles both file and folder
 * entries, constructing a nested representation of the directory contents.
 *
 * The structure of the resulting object adheres to the FolderStructure interface,
 * with each folder potentially containing children which may be either files or other folders.
 *
 * @param dirPath - The directory path from which to begin the generation of the folder structure.
 * @param excludedFolders - An array of folder names to exclude from the folder structure.
 * @param indent - A string used for indentation purposes during recursive calls, allowing
 *                 for more readable output when printing the structure. Defaults to an empty string.
 *
 * @returns A FolderStructure object representing the directory and file hierarchy,
 *          or null if the directory is among the excluded folders.
 */
export function getFolderStructure(dirPath: string, excludedFolders: string[], indent: string = ""): FolderStructure | null {
	const stats = statSync(dirPath)

	if (stats.isFile()) {
		return { name: basename(dirPath), type: "file" }
	}

	if (excludedFolders.includes(basename(dirPath))) {
		return null
	}

	const children: FolderStructure[] = readdirSync(dirPath)
		.map((child) => getFolderStructure(join(dirPath, child), excludedFolders, indent + " "))
		.filter((child) => child !== null) as FolderStructure[]

	return {
		name: basename(dirPath),
		type: "folder",
		children: children,
	}
}

/**
 * Converts a folder structure object into a formatted string representation.
 *
 * This function takes a FolderStructure object and recursively constructs a string
 * that visually represents the hierarchy of folders and files. Each entry is prefixed
 * by a specified indentation level, increasing as the depth in the hierarchy increases.
 *
 * @param folderStructure - The FolderStructure object to be converted to a string.
 *                          If null, an empty string is returned.
 * @param indent - A string that represents the current level of indentation, defaulting
 *                 to an empty string. Indentation increases with each nested level.
 *
 * @returns A string representation of the folder structure, formatted with indentation
 *          to depict the hierarchy visually. If the folder structure is null, an empty
 *          string is returned.
 */
export function getFolderStructureString(folderStructure: FolderStructure | null, indent: string = ""): string {
	if (!folderStructure) {
		return ""
	}

	let output = ""
	output += `${indent}${folderStructure.name}\n`

	if (folderStructure.type === "folder" && folderStructure.children) {
		for (const child of folderStructure.children) {
			output += getFolderStructureString(child, indent + " ")
		}
	}

	return output
}

/**
 * Asynchronously receives and accumulates text data from an ApiStream.
 *
 * This function utilizes an asynchronous iterator to consume chunks from
 * the provided ApiStream. It filters and concatenates the text content of
 * these chunks to form a complete string. Only chunks of type 'text' are
 * processed; other types are ignored. The resulting string is returned
 * after the full stream is consumed.
 *
 * @param apiStream - An ApiStream object which supplies data chunks in an asynchronous manner.
 * @returns A promise that resolves to a string containing the concatenated text data collected from the stream.
 */
export async function getApiStreamResponse(apiStream: ApiStream): Promise<string> {
	const iterator = apiStream[Symbol.asyncIterator]()
	let result = ""

	for await (const chunk of iterator) {
		if (chunk?.type === "text") {
			result += chunk.text ?? ""
		}
	}
	return result
}

/**
 * Checks and updates .gitignore file to include pattern
 *
 * This function checks if a .gitignore file exists in the specified directory.
 * If it exists, it verifies if the given pattern is present and adds it if missing.
 * If the file doesn't exist, it creates a new .gitignore file with the given pattern.
 *
 * @param path - The directory path where the .gitignore file should be checked/created
 * @param pattern - The pattern to be added to the .gitignore file
 * @returns A promise that resolves when the operation is complete
 */
export async function ensureGitignorePattern(path: string, pattern: string): Promise<void> {
	if (!path || !pattern || !existsSync(path) || !statSync(path).isDirectory()) {
		return
	}

	const gitignorePath = `${path}/.gitignore`

	try {
		// Check if .gitignore exists
		try {
			const content = readFileSync(gitignorePath, "utf8")

			// Check if pattern already exists
			if (!content.split("\n").some((line) => line.trim() === pattern)) {
				// Add pattern with a newline
				const updatedContent = content.endsWith("\n") ? `${content}${pattern}\n` : `${content}\n${pattern}\n`

				writeFileSync(gitignorePath, updatedContent, "utf8")
			}
		} catch (error) {
			if (error.code === "ENOENT") {
				// Create new .gitignore with pattern
				writeFileSync(gitignorePath, `${pattern}\n`, "utf8")
			} else {
				throw error
			}
		}
	} catch (error) {
		throw new Error(`Failed to update .gitignore: ${error.message}`)
	}
}

export async function exponentialBackoff<T>(operation: () => T, maxRetries: number = 5, baseDelay: number = 200): Promise<any> {
	let attempt = 0

	while (attempt < maxRetries) {
		try {
			return await operation()
		} catch (error) {
			attempt++
			if (attempt < maxRetries) {
				const delay = 2 ** attempt * baseDelay
				console.warn(`Attempt ${attempt} failed. Retrying in ${delay}ms...`, error)
				await new Promise((resolve) => setTimeout(resolve, delay))
			} else {
				console.error("Max retries reached. Operation failed.", error)
			}
		}
	}
}
