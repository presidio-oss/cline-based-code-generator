import { EmbeddingConfiguration } from "@/shared/embeddings"
import * as vscode from "vscode"
import { OpenAIEmbeddings } from "@langchain/openai"
import { BedrockEmbeddings } from "@langchain/aws"
import { OllamaEmbeddings } from "@langchain/ollama"

/**
 * Expert file paths structure
 */
export interface ExpertPaths {
	sanitizedName: string
	expertDir: string
	docsDir: string
	statusFilePath: string
	metadataFilePath: string
	faissFilePath: string
	faissStatusFilePath: string
	crawlStorage: string
}

/**
 * Expert metadata structure
 */
export interface ExpertMetadata {
	name: string
	isDefault?: boolean
	createdAt: string
	documentLinks: { url: string }[]
	deepCrawl: boolean
	maxDepth: number
	maxPages?: number
	crawlTimeout?: number
	embeddingProvider?: string
	embeddingModelId?: string
}

/**
 * Document processing options
 */
export interface DocumentProcessOptions {
	expertName: string
	workspacePath: string
	docsDir: string
	extensionContext: vscode.ExtensionContext
	deepCrawl?: boolean
	maxDepth?: number
	maxPages?: number
	crawlTimeout?: number
}

/**
 * Crawler configuration options
 */
export interface CrawlerOptions {
	url: string
	expertName: string
	workspacePath: string
	maxDepth: number
	maxPages?: number
	crawlTimeout?: number
}

/**
 * Vector store configuration
 */
export interface VectorStoreConfig {
	embeddings: OpenAIEmbeddings | BedrockEmbeddings | OllamaEmbeddings
	embeddingConfig: EmbeddingConfiguration
	workspaceId: string
}

/**
 * Document chunk data
 */
export interface DocumentChunkData {
	markdown: string
	expertName: string
	workspacePath: string
	url: string
	suburl: string
	title?: string
}
