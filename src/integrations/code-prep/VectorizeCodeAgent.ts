import { FaissStore } from "@langchain/community/vectorstores/faiss"
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters"
import { OpenAIEmbeddings } from "@langchain/openai"
import { BedrockEmbeddings } from "@langchain/aws"
import { isBinaryFileSync } from "isbinaryfile"
import type { Document } from "@langchain/core/documents"
import { ensureGitignorePattern, getCodeFiles, getEmbeddings } from "./helper"
import { existsSync, readFileSync } from "node:fs"
import { basename, join } from "node:path"
import { ApiConfiguration } from "../../shared/api"
import { HaiBuildContextOptions } from "../../shared/customApi"
import EventEmitter from "node:events"
import { createHash } from "node:crypto"
import { HaiBuildDefaults } from "../../shared/haiDefaults"
import { EmbeddingConfiguration } from "../../shared/embeddings"
import { fileExists } from "../../utils/runtime-downloader"
import { OllamaEmbeddings } from "@langchain/ollama"

export class VectorizeCodeAgent extends EventEmitter {
	private srcFolder: string
	private abortController = new AbortController()

	private embeddings: OpenAIEmbeddings | BedrockEmbeddings | OllamaEmbeddings
	private vectorStore: FaissStore
	private buildContextOptions: HaiBuildContextOptions
	private contextDir: string
	private embeddingConfig: EmbeddingConfiguration
	private stats: {
		total: number
		completed: number
		progress: number
	} = {
		total: 100,
		completed: 0,
		progress: 0,
	}

	running: boolean = false

	constructor(
		srcFolder: string,
		embeddingConfig: EmbeddingConfiguration,
		buildContextOptions: HaiBuildContextOptions,
		contextDir = HaiBuildDefaults.defaultContextDirectory,
	) {
		super()
		this.srcFolder = srcFolder
		this.embeddingConfig = embeddingConfig
		this.embeddings = getEmbeddings(embeddingConfig)
		this.vectorStore = new FaissStore(this.embeddings, {})
		this.buildContextOptions = buildContextOptions
		this.contextDir = contextDir
		ensureGitignorePattern(this.srcFolder, `${this.contextDir}/`)
	}

	private emitProgress(count: number, ignore: boolean = false) {
		this.stats.completed += count
		this.stats.progress = Math.round((this.stats.completed / this.stats.total) * 100)
		this.emit("progress", {
			type: "progress",
			value: this.stats.progress,
			ignore: ignore,
		})
	}

	private async job(filePaths?: string[]) {
		this.running = true

		this.emit("progress", {
			type: "start",
			start: true,
		})

		const faissWithContextDir = ".faiss-context"
		const faissWithoutContextDir = ".faiss"

		// faiss db path
		const faissDbPath = this.buildContextOptions.useContext
			? join(this.srcFolder, this.contextDir, faissWithContextDir)
			: join(this.srcFolder, this.contextDir, faissWithoutContextDir)

		const defaultExcludeDirs: string[] = [
			...HaiBuildDefaults.defaultDirsToIgnore,
			faissWithoutContextDir,
			faissWithContextDir,
		]

		if (!this.buildContextOptions.useContext) {
			defaultExcludeDirs.push(this.contextDir)
		}

		const excludedFolders = this.buildContextOptions.excludeFolders
			? [...this.buildContextOptions.excludeFolders.split(",").map((f) => f.trim()), ...defaultExcludeDirs]
			: [...defaultExcludeDirs]

		const srcFolder = this.buildContextOptions.useContext ? join(this.srcFolder, this.contextDir) : join(this.srcFolder)

		const codeFiles =
			filePaths && filePaths.length > 0
				? new Set(filePaths)
				: new Set(getCodeFiles(srcFolder, excludedFolders, [HaiBuildDefaults.defaultRepoHashFileName]))

		this.emit("progress", {
			type: "total",
			total: codeFiles.size,
		})

		this.stats.total = codeFiles.size

		if (existsSync(faissDbPath)) {
			const faissIndexPath = join(faissDbPath, "faiss.index")
			if (fileExists(faissIndexPath)) {
				try {
					this.vectorStore = await FaissStore.load(faissDbPath, this.embeddings)
				} catch (error) {
					// ignore, we can't do anything about it, the faiss index is corrupted
					// we will just recreate it
				}
			}
		}

		// get all the documents from the vector store
		const docStore = this.vectorStore.getDocstore()._docs
		const docHashMap = new Map<string, string>()
		// create a hashmap of the documents in the vector store with the hash of the file content
		// hash in the doc is md5 has of the original file content regardless of the `useContext` option
		docStore.forEach((documentValue) => {
			if (documentValue.id && documentValue.metadata.fileContentHashMD5) {
				docHashMap.set(documentValue.id, documentValue.metadata.fileContentHashMD5)
			}
		})

		// unique code files
		const codeFilesSet = new Set(codeFiles)

		for (const codeFilePath of codeFiles) {
			// if aborted, save the vector store and break
			if (this.abortController.signal.aborted || !this.running) {
				await this.vectorStore.save(faissDbPath)
				break
			}

			// id is the code path
			const id = codeFilePath.replace(`/${this.contextDir}`, "")

			// Check if file is deleted
			if (!fileExists(id)) {
				console.log(`Skipped deleted file ${codeFilePath}`)
				codeFilesSet.delete(codeFilePath)
				continue
			}

			// if the file is a binary file, skip it and remove it from the set
			if (isBinaryFileSync(id)) {
				console.log(`Skipped binary file ${codeFilePath}`)
				codeFilesSet.delete(codeFilePath)
				continue
			}
			// read the file content
			const fileContent = readFileSync(id, "utf-8")
			// create a hash of the file content
			const fileContentHashMD5 = createHash("md5")
				.update(
					JSON.stringify({
						fileContent,
						embeddingConfig: this.embeddingConfig,
						buildContextOptions: this.buildContextOptions,
					}),
				)
				.digest("hex")
			// get the hash of the file content from the vector store
			const existingDocHash = docHashMap.get(id)
			// if the file content hash is the same as the one in the vector store, skip it
			if (existingDocHash && existingDocHash === fileContentHashMD5) {
				console.log(`Skipped file ${codeFilePath} as it already exists in the vector store`)
				codeFilesSet.delete(codeFilePath)
			} else {
				// if the file content hash is different, add it to the vector store,
				// to reuse the hash during the actual indexing process
				docHashMap.set(id, fileContentHashMD5)
			}
		}

		const skippedFilesCount = codeFiles.size - codeFilesSet.size

		this.emitProgress(skippedFilesCount, true)

		console.log("Remaining codeFiles", Array.from(codeFilesSet))

		for (const codeFilePath of codeFilesSet) {
			if (this.abortController.signal.aborted || !this.running) {
				await this.vectorStore.save(faissDbPath)
				break
			}

			const id = codeFilePath.replace(`/${this.contextDir}`, "")

			// Check if file is deleted
			if (!fileExists(id)) {
				console.log(`Skipped deleted file ${codeFilePath}`)
				codeFilesSet.delete(codeFilePath)
				continue
			}

			// safety check, somehow the file got into the set
			if (isBinaryFileSync(id)) {
				console.log(`Skipped binary file ${codeFilePath}`)
				this.emitProgress(1)
				continue
			}

			const fileContent = readFileSync(codeFilePath, "utf-8")
			let fileContentHashMD5 = docHashMap.get(id)
			if (!fileContentHashMD5) {
				// create a hash of the file content, if it's not already in the hashmap
				fileContentHashMD5 = createHash("md5")
					.update(
						JSON.stringify({
							fileContent,
							embeddingConfig: this.embeddingConfig,
							buildContextOptions: this.buildContextOptions,
						}),
					)
					.digest("hex")
			}
			const fileName = basename(codeFilePath)

			const textSplitter = new RecursiveCharacterTextSplitter({
				chunkSize: this.embeddingConfig.provider !== "ollama" ? 8191 : 512,
				chunkOverlap: 0,
			})
			const texts = await textSplitter.splitText(fileContent)
			const docs: Document[] = texts.map((text) => ({
				pageContent: text,
				id,
				metadata: { source: codeFilePath, fileName, fileContentHashMD5 },
			}))
			try {
				const documentsAdded = await this.vectorStore.addDocuments(docs)
				await this.vectorStore.save(faissDbPath)
			} catch (error) {
				this.emit("error", { message: error })
				return // Stop further processing
			}
			this.emitProgress(1)
		}

		await this.vectorStore.save(faissDbPath).finally(() => {
			this.emit("progress", {
				type: "progress",
				value: 100,
			})
			this.emit("progress", {
				type: "done",
				done: true,
			})
		})

		this.emit("progress", {
			type: "progress",
			value: 100,
		})
		this.emit("progress", {
			type: "done",
			done: true,
		})
	}

	start(filePaths?: string[]) {
		if (this.abortController.signal.aborted) {
			return
		}
		return this.job().catch((error) => {
			this.emit("error", { message: "Error in vectorizeCodeAgent", error })
		})
	}

	stop() {
		this.running = false
		this.abortController.abort()
	}
}

// Example Usage:
// const awsAccessKey = '';
// const awsSecretKey = '';

// const llmApiConfig: ApiConfiguration = {
//     apiProvider: 'openai-native',
//     apiModelId: 'gpt-4o',
//     openAiNativeApiKey: 'sk-proj'
// };

// const buildContextOptions: HaiBuildContextOptions = {
//     useContext: true,
//     useIndex: true,
//     appContext: "this is an vscode extension",
//     excludeFolders: "node_modules, .git, .husky, .vscode"
// };

// const vsCodeWorkSpaceFolderFsPath = '/Users/presidio/Desktop/git/jarvis-gitlab/hai-vscode-plugin-v2';

// const agent = new VectorizeCodeAgent(vsCodeWorkSpaceFolderFsPath, llmApiConfig, buildContextOptions);

// agent.on('progress', (progress) => {
//     console.log('progress', progress)
// })

// agent.start()
