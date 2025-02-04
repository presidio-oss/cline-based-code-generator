import { FaissStore } from "@langchain/community/vectorstores/faiss"
import { ApiConfiguration } from "../../shared/api"
import { HaiBuildContextOptions } from "../../shared/customApi"
import {
	findFilesInDirectory,
	getApiStreamResponse,
	getEmbeddings,
	getFolderStructure,
	getFolderStructureString,
	readAndProcessGitignore,
} from "./helper"
import type { OpenAIEmbeddings } from "@langchain/openai"
import type { BedrockEmbeddings } from "@langchain/aws"
import { basename, join } from "node:path"
import { buildApiHandler } from "../../api"
import { ensureFaissPlatformDeps } from "../../utils/faiss"
import { EmbeddingConfiguration } from "../../shared/embeddings"
import { OllamaEmbeddings } from "@langchain/ollama"

export class FindFilesToEditAgent {
	private srcFolder: string
	private llmApiConfig: ApiConfiguration
	private embeddingConfig: EmbeddingConfiguration
	private embeddings: OpenAIEmbeddings | BedrockEmbeddings | OllamaEmbeddings
	private vectorStore: FaissStore
	private task: string
	private buildContextOptions: HaiBuildContextOptions
	private contextDir: string

	private abortController = new AbortController()

	private SYSTEM_PROMPT: string = `You are a world class software developer.`

	constructor(
		srcFolder: string,
		llmApiConfig: ApiConfiguration,
		embeddingConfig: EmbeddingConfiguration,
		buildContextOptions: HaiBuildContextOptions,
		task: string,
		contextDir = ".hai",
	) {
		this.srcFolder = srcFolder
		this.llmApiConfig = llmApiConfig
		this.embeddingConfig = embeddingConfig
		this.embeddings = getEmbeddings(this.embeddingConfig)
		this.vectorStore = new FaissStore(this.embeddings, {})
		this.task = task
		this.buildContextOptions = buildContextOptions
		this.contextDir = contextDir
	}

	private async job(): Promise<string[]> {
		const faissWithContextDir = ".faiss-context"
		const faissWithoutContextDir = ".faiss"

		// faiss db path
		const faissDbPath = this.buildContextOptions.useContext
			? join(this.srcFolder, this.contextDir, faissWithContextDir)
			: join(this.srcFolder, this.contextDir, faissWithoutContextDir)

		const defaultExcludeDirs: string[] = [
			".git",
			"node_modules",
			".husky",
			".vscode",
			this.contextDir,
			faissWithoutContextDir,
			faissWithContextDir,
		]

		const excludedFolders = this.buildContextOptions.excludeFolders
			? [...this.buildContextOptions.excludeFolders.split(",").map((f) => f.trim()), ...defaultExcludeDirs]
			: [...defaultExcludeDirs]

		const gitIgnoreFilePaths = findFilesInDirectory(this.srcFolder, ".gitignore")

		const gitIgnorePatterns = gitIgnoreFilePaths.flatMap((filePath) => readAndProcessGitignore(filePath))

		excludedFolders.push(...gitIgnorePatterns)

		const folderStructure = getFolderStructure(this.srcFolder, excludedFolders)

		const folderStructureString = getFolderStructureString(folderStructure)

		try {
			this.vectorStore = await FaissStore.load(faissDbPath, this.embeddings)
		} catch (error) {
			// vector store not found
			return []
		}

		const similarDocs = await this.vectorStore.similaritySearchWithScore(this.task)

		const similarDocsString = similarDocs
			.map(([{ id }]) => id)
			.filter((id) => id !== undefined)
			.map((id, idx) => `${idx + 1}. ${basename(id)} \t ${id}`)
			.join("\n")

		const llmApi = buildApiHandler(this.llmApiConfig)

		const USER_PROMPT = `
        This is the folder structure of a application you are working on:
        <folder-structure>
        ${folderStructureString}
        </folder-structure>

        Initial search found these files are needed to be edited:
        <related-files>
        ${similarDocsString}
        </related-files>

        For the task: ${this.task}

        List the potential related files that need to be edited to implement the functionality. 
        Give the updated related-files list.
        ALWAYS output the files in absolute path.
        ALWAYS name the files that are relevant, don't make up file with placeholder names.
        ALWAYS reuse the files as possible.
        ALWAYS output the files in valid JSON array.
        DO NOT include any other information in the output other than the files.
        DO NOT include any other information and \`\`\` marks or JSON in the output
        ALWAYS SEND THE LIST OF FILES AS A JSON ARRAY OF STRINGS`
		const MAX_ATTEMPT = 3
		for (let attempt = 1; attempt <= MAX_ATTEMPT; attempt++) {
			try {
				const apiStream = llmApi.createMessage(this.SYSTEM_PROMPT, [
					{
						role: "user",
						content: USER_PROMPT,
					},
				])
				const res = await getApiStreamResponse(apiStream)
				const resJson = JSON.parse(res)

				return resJson
			} catch (err) {
				if (attempt >= MAX_ATTEMPT) {
					return []
				}
			}
		}
		return []
	}

	async start(): Promise<string[]> {
		await ensureFaissPlatformDeps()
		return this.job()
	}

	stop() {
		this.abortController.abort()
	}
}

// Example Usage:
// const awsAccessKey = '';
// const awsSecretKey = '';
// const awsRegion = "us-west-2";

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

// const task = `implement a test case to validate extension is activated`

// const vsCodeWorkSpaceFolderFsPath = '/Users/presidio/Desktop/git/jarvis-gitlab/hai-vscode-plugin-v2';

// const agent = new FindFilesToEditAgent(vsCodeWorkSpaceFolderFsPath, llmApiConfig, llmApiConfig, buildContextOptions, task);

// agent.start().then((files) => console.log(files));
