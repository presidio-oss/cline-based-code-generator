import { appendFileSync, createWriteStream, existsSync, readFileSync, writeFileSync } from "node:fs"
import { basename, dirname, extname, join } from "node:path"
import EventEmitter from "node:events"
import { isBinaryFileSync } from "isbinaryfile"
import { ApiConfiguration } from "../../shared/api"
import { HaiBuildContextOptions } from "../../shared/customApi"
import { ApiStreamChunk } from "../../api/transform/stream"
import { buildApiHandler } from "../../api"
import { createDirectoryIfNotExists, ensureGitignorePattern, exponentialBackoff, getCodeFiles } from "./helper"
import { HaiBuildDefaults } from "../../shared/haiDefaults"
import { createHash } from "node:crypto"
import { Mode } from "@/shared/storage/types"

export class CodeContextAdditionAgent extends EventEmitter {
	private srcFolder!: string
	private llmApiConfig!: ApiConfiguration
	private concurrency: number
	private buildContextOptions!: HaiBuildContextOptions
	private contextDir: string
	private currentMode!: Mode

	private abortController: AbortController

	private systemPrompt!: string
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

	constructor() {
		super()
		this.concurrency = HaiBuildDefaults.defaultContextAdditionConcurrency
		this.contextDir = HaiBuildDefaults.defaultContextDirectory
		this.abortController = new AbortController()
		this.systemPrompt = HaiBuildDefaults.defaultContextAdditionSystemPrompt
	}

	withSource(srcFolder: string) {
		this.srcFolder = srcFolder
		ensureGitignorePattern(this.srcFolder, `${this.contextDir}/`)
		return this
	}

	withLLMApiConfig(config: ApiConfiguration) {
		this.llmApiConfig = config
		return this
	}

	withConcurrency(concurrency: number) {
		this.concurrency = concurrency
		return this
	}

	withBuildContextOptions(options: HaiBuildContextOptions) {
		this.buildContextOptions = options
		return this
	}

	withContextDir(directory: string) {
		this.contextDir = directory
		return this
	}

	withSystemPrompt(prompt: string) {
		this.systemPrompt = prompt
		return this
	}

	withAbortController(abortController: AbortController) {
		this.abortController = abortController
		return this
	}
	withCurrentMode(mode: Mode) {
		this.currentMode = mode
		return this
	}

	build() {
		if (!this.srcFolder) {
			throw new Error("Source folder must be set before building.")
		}
		if (!this.llmApiConfig) {
			throw new Error("LLM API configuration must be set before building.")
		}
		if (!this.buildContextOptions) {
			throw new Error("Build context options must be set before building.")
		}
		return this
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

	private async processFile(codeFilePath: string) {
		// Stop processing stream when user aborts
		if (this.abortController.signal.aborted || !this.running) {
			return
		}

		// If the file is binary such as image, video, etc., then skip it
		if (isBinaryFileSync(codeFilePath)) {
			console.log(`Skipping binary file ${codeFilePath}`)
			this.emitProgress(1)
			return
		}

		// Destination folder path
		const destinationFolderPath = join(this.srcFolder, this.contextDir)

		// Destination file path
		const destinationFilePath = codeFilePath.replace(this.srcFolder, destinationFolderPath)

		console.log(`Processing ${codeFilePath} -> ${destinationFilePath}`)

		const fileName = basename(codeFilePath, extname(codeFilePath))

		const fileContent = readFileSync(codeFilePath, "utf-8")

		const fileContentHashMD5 = createHash("md5")
			.update(JSON.stringify({ fileContent, filePath: codeFilePath }))
			.digest("hex")

		const userPrompt = `
        Application content: ${this.buildContextOptions.appContext}
        File name: ${fileName} 
        <CODE>${fileContent}</CODE>`

		const llmApi = buildApiHandler(this.llmApiConfig, this.currentMode)

		createDirectoryIfNotExists(dirname(destinationFilePath))

		// TODO: Figure out the way to calculate the token based on the selected model
		// currently `tiktoken` doesn't support other then GPT models.
		// commented the code since tokenLength not in use

		// const encoding = encodingForModel("gpt-4o")
		// const tokenLength = encoding.encode(fileContent).length

		// TODO: `4096` is arbitrary, we need to figure out the optimal value for this. incase of `getModel` returns `null`
		const maxToken = llmApi.getModel().info.maxTokens ?? 4096 * 4 // 1 token ~= 4 char

		if (fileContent.length > maxToken) {
			console.log(`Skipping ${fileName} as it exceeds max token length of ${maxToken}`)
			writeFileSync(destinationFilePath, fileContent)
			exponentialBackoff(() => this.updateRepoHash(fileContentHashMD5, codeFilePath))
			this.emitProgress(1)
			return
		}

		const apiStream = llmApi.createMessage(this.systemPrompt, [
			{
				role: "user",
				content: userPrompt,
			},
		])

		const iterator = apiStream[Symbol.asyncIterator]()

		await this.processStream(iterator, destinationFilePath, fileContentHashMD5, codeFilePath)
	}

	private async processStream(
		iterator: AsyncGenerator<ApiStreamChunk, any, any>,
		destinationFilePath: string,
		fileContentHashMD5: string,
		codeFilePath: string,
	): Promise<void> {
		// Stop processing stream when user aborts
		if (this.abortController.signal.aborted || !this.running) {
			return
		}
		const writeStream = createWriteStream(destinationFilePath, { flags: "w" })

		try {
			for await (const chunk of iterator) {
				// Stop processing stream when user aborts
				if (this.abortController.signal.aborted || !this.running) {
					break
				}
				if (chunk && chunk.type === "text") {
					if (!writeStream.write(chunk.text)) {
						await new Promise((resolve) => writeStream.once("drain", resolve))
					}
				}
			}
			exponentialBackoff(() => this.updateRepoHash(fileContentHashMD5, codeFilePath))
		} catch (error) {
			this.emit("error", { message: error })
			// TODO: Figure out a way to handle stream errors and Retry
		} finally {
			writeStream.end()
			this.emitProgress(1)
		}
	}

	private updateRepoHash(fileContentHashMD5: string, filePath: string) {
		const repoHashFilePath = join(this.srcFolder, this.contextDir, HaiBuildDefaults.defaultRepoHashFileName)
		let hashMap: Record<string, string> = {}
		if (existsSync(repoHashFilePath)) {
			try {
				const content = readFileSync(repoHashFilePath, "utf-8")
				if (content) {
					hashMap = JSON.parse(content)
				}
			} catch (error) {
				console.error("Error reading hash file:", error)
			}
		}

		hashMap[filePath] = fileContentHashMD5
		writeFileSync(repoHashFilePath, JSON.stringify(hashMap, null, 2))
	}

	private async processFilesConcurrently(codeFiles: Set<string>) {
		// Stop processing stream when user aborts
		if (this.abortController.signal.aborted || !this.running) {
			return
		}

		const taskQueue: Promise<void>[] = []

		for (const codeFilePath of codeFiles) {
			// Stop processing stream when user aborts
			if (this.abortController.signal.aborted || !this.running) {
				return
			}

			// Ensure only a limited number of concurrent tasks are running
			if (taskQueue.length >= this.concurrency) {
				await Promise.race(taskQueue)
			}

			// Start processing a new file and track its promise in the queue
			const taskPromise = this.processFile(codeFilePath).finally(() => {
				// Remove completed promise from the queue
				taskQueue.splice(taskQueue.indexOf(taskPromise), 1)
			})

			taskQueue.push(taskPromise)
		}

		// Wait for all remaining promises in the queue to resolve
		await Promise.all(taskQueue)

		this.emit("progress", {
			type: "progress",
			value: 100,
		})
		this.emit("progress", {
			type: "done",
			done: true,
		})
	}

	private async job(filePaths?: string[], reIndex: boolean = false): Promise<void> {
		const defaultExcludeDirs: string[] = [...HaiBuildDefaults.defaultDirsToIgnore, this.contextDir]

		const excludedFolders = this.buildContextOptions.excludeFolders
			? [...this.buildContextOptions.excludeFolders.split(",").map((f) => f.trim()), ...defaultExcludeDirs]
			: [...defaultExcludeDirs]

		const codeFiles = reIndex ? new Set(filePaths) : new Set(getCodeFiles(this.srcFolder, excludedFolders))

		this.running = true

		this.emit("progress", {
			type: "start",
			start: true,
		})

		this.emit("progress", {
			type: "total",
			total: codeFiles.size,
		})

		this.stats.total = codeFiles.size

		const repoHashFilePath = join(this.srcFolder, this.contextDir, HaiBuildDefaults.defaultRepoHashFileName)
		let skippedFilesCount = 0

		if (existsSync(repoHashFilePath)) {
			const repoHashContent = readFileSync(repoHashFilePath, "utf-8")
			let hashMap: Record<string, string> = {}
			try {
				if (repoHashContent) {
					hashMap = JSON.parse(repoHashContent)
				}
			} catch (error) {
				this.emit("error", { message: error })
				return
			}

			for (const codeFilePath of codeFiles) {
				if (isBinaryFileSync(codeFilePath)) {
					codeFiles.delete(codeFilePath)
					skippedFilesCount += 1
					continue
				}
				const fileContent = readFileSync(codeFilePath, "utf-8")
				const fileContentHashMD5 = createHash("md5")
					.update(JSON.stringify({ fileContent, filePath: codeFilePath }))
					.digest("hex")
				if (hashMap[codeFilePath] === fileContentHashMD5) {
					codeFiles.delete(codeFilePath)
					skippedFilesCount += 1
				}
			}
		}

		if (skippedFilesCount > 0) {
			this.emitProgress(skippedFilesCount, true)
		}

		if (this.abortController.signal.aborted || !this.running) {
			return
		}

		console.log("Remaining codeFiles", Array.from(codeFiles))

		return await this.processFilesConcurrently(codeFiles).finally(() => {
			this.emit("progress", {
				type: "progress",
				value: 100,
			})
			this.emit("progress", {
				type: "done",
				done: true,
			})
		})
	}

	public start(filePaths?: string[], reIndex: boolean = false) {
		return this.job(filePaths, reIndex)
	}

	public stop(): void {
		this.running = false
		this.abortController?.abort()
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

// const agent = new CodeContextAdditionAgent()
//     .withSource(vsCodeWorkSpaceFolderFsPath)
//     .withLLMApiConfig(llmApiConfig)
//     .withBuildContextOptions(buildContextOptions);

// agent.on('progress', (progress) => {
//     console.log('progress', progress)
// })

// agent.start()
