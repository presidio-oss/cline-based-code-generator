import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters"
import { FaissStore } from "@langchain/community/vectorstores/faiss"
import { Document } from "@langchain/core/documents"
import { existsSync } from "fs"
import { join } from "path"
import { fileExists } from "@/utils/runtime-downloader"
import { ensureFaissPlatformDeps } from "@/utils/faiss"
import { OpenAIEmbeddings } from "@langchain/openai"
import { BedrockEmbeddings } from "@langchain/aws"
import { OllamaEmbeddings } from "@langchain/ollama"
import { EmbeddingConfiguration } from "@/shared/embeddings"
import { buildEmbeddingHandler } from "@/embedding"
import { VectorStoreConfig, DocumentChunkData } from "./types"
import { ExpertFileManager } from "./ExpertFileManager"

/**
 * Manages vector store operations for experts
 */
export class VectorStoreManager {
	private embeddings: OpenAIEmbeddings | BedrockEmbeddings | OllamaEmbeddings
	private vectorStore: FaissStore
	private fileManager: ExpertFileManager
	private workspaceId: string

	/**
	 * Create a new VectorStoreManager
	 */
	constructor(config: VectorStoreConfig) {
		this.embeddings = config.embeddings
		this.vectorStore = new FaissStore(this.embeddings, {})
		this.fileManager = new ExpertFileManager()
		this.workspaceId = config.workspaceId
	}

	/**
	 * Initialize vector store embeddings
	 */
	public static initializeEmbeddings(
		embeddingConfig: EmbeddingConfiguration,
	): OpenAIEmbeddings | BedrockEmbeddings | OllamaEmbeddings {
		const embeddingHandler = buildEmbeddingHandler(embeddingConfig)
		return embeddingHandler.getClient()
	}

	/**
	 * Ensure vector store is loaded
	 */
	public async ensureVectorStoreLoaded(expertName: string, workspacePath: string): Promise<boolean> {
		try {
			const { faissFilePath } = this.fileManager.getExpertPaths(workspacePath, expertName)

			await ensureFaissPlatformDeps()

			if (existsSync(faissFilePath)) {
				const faissIndexPath = join(faissFilePath, "faiss.index")

				if (fileExists(faissIndexPath)) {
					this.vectorStore = await FaissStore.load(faissFilePath, this.embeddings)
					return true
				}
			}

			// If we get here, there's no vector store to load
			this.vectorStore = new FaissStore(this.embeddings, {})
			return false
		} catch (error) {
			console.error(`Failed to load vector store for expert ${expertName}:`, error)
			this.vectorStore = new FaissStore(this.embeddings, {})
			return false
		}
	}

	/**
	 * Chunk and store document in vector database
	 */
	public async chunkAndStore(data: DocumentChunkData): Promise<void> {
		console.log(`Storing content for expert ${data.expertName} from ${data.suburl}`)

		try {
			await ensureFaissPlatformDeps()

			// Load existing vector store if available
			await this.ensureVectorStoreLoaded(data.expertName, data.workspacePath)

			// Split text into chunks
			const mdSplitter = RecursiveCharacterTextSplitter.fromLanguage("markdown", {
				chunkSize: 8192,
				chunkOverlap: 0,
			})

			const texts = await mdSplitter.splitText(data.markdown)

			// Create documents from text chunks with title and URL metadata
			const docs: Document[] = texts.map((text) => ({
				pageContent: text,
				id: data.url.trim(),
				metadata: {
					source: data.suburl.trim(),
					title: data.title || "Untitled",
					expertName: data.expertName,
				},
			}))

			// Add documents to vector store
			await this.vectorStore.addDocuments(docs)

			// Save vector store
			const { faissFilePath } = this.fileManager.getExpertPaths(data.workspacePath, data.expertName)
			await this.vectorStore.save(faissFilePath)

			console.log(`Successfully stored ${docs.length} chunks for expert ${data.expertName} from ${data.suburl}`)
		} catch (error) {
			console.error(`Failed to store chunks in vector database for expert ${data.expertName}:`, error)
			throw error
		}
	}

	/**
	 * Delete chunks for a URL
	 */
	public async deleteChunk(url: string, expertName: string, workspacePath: string): Promise<void> {
		console.log(`Deleting chunk for URL: ${url} in expert: ${expertName}`)

		try {
			// Ensure vector store is loaded
			const loaded = await this.ensureVectorStoreLoaded(expertName, workspacePath)

			if (!loaded) {
				console.log(`No vector store found for ${expertName}`)
				return
			}

			const ids = await this.getDocumentIds(url)

			if (ids.length > 0) {
				await this.vectorStore.delete({ ids })

				const { faissFilePath } = this.fileManager.getExpertPaths(workspacePath, expertName)
				await this.vectorStore.save(faissFilePath)

				console.log(`Removed ${ids.length} vectors for ${url}`)
			} else {
				console.log(`No vectors found for ${url}`)
			}
		} catch (error) {
			console.error(`Failed to delete chunk for ${url}:`, error)
			throw error
		}
	}

	/**
	 * Search vector store
	 */
	public async search(query: string, expertName: string, workspacePath: string, k?: number): Promise<string> {
		console.log(`Searching for query: ${query} in expert: ${expertName}`)

		try {
			// Ensure vector store is loaded
			const loaded = await this.ensureVectorStoreLoaded(expertName, workspacePath)

			if (!loaded) {
				throw new Error(`No vector store found for ${expertName}`)
			}

			const results = await this.vectorStore.similaritySearchWithScore(query, k)

			const formattedResults = results.map(([doc, score]) => ({
				id: doc.id,
				content: doc.pageContent,
				metadata: doc.metadata,
				score: score,
			}))

			return JSON.stringify(formattedResults, null, 2)
		} catch (error) {
			console.error(`Error searching vector store for expert ${expertName}:`, error)
			throw error
		}
	}

	/**
	 * Get document IDs for a given URL
	 */
	private async getDocumentIds(url: string): Promise<string[]> {
		console.log(`Retrieving document IDs for URL: ${url}`)

		const docStore = this.vectorStore.getDocstore()._docs
		const ids: string[] = []

		// Iterate through the Map entries
		docStore.forEach((doc, id) => {
			if (doc?.id === url) {
				ids.push(id)
			}
		})

		console.log(`Found ${ids.length} document IDs for file ${url}`)
		return ids
	}
}
