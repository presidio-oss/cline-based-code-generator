import { AwsBedrockEmbeddingHandler } from "./providers/bedrock"
import { OpenAiEmbeddingHandler } from "./providers/openai"
import { OpenAiNativeEmbeddingHandler } from "./providers/openai-native"
import { BedrockEmbeddings } from "@langchain/aws"
import { AzureOpenAIEmbeddings, OpenAIEmbeddings } from "@langchain/openai"
import { EmbeddingConfiguration } from "../shared/embeddings"
import type { OllamaEmbeddings } from "@langchain/ollama"
import { OllamaEmbeddingHandler } from "./providers/ollama"

export interface EmbeddingHandler {
	getClient(): BedrockEmbeddings | OpenAIEmbeddings | AzureOpenAIEmbeddings | OllamaEmbeddings
	validateAPIKey(): Promise<boolean>
}

export function buildEmbeddingHandler(configuration: EmbeddingConfiguration): EmbeddingHandler {
	const { provider, ...options } = configuration
	switch (provider) {
		case "bedrock":
			return new AwsBedrockEmbeddingHandler(options)
		case "openai":
			return new OpenAiEmbeddingHandler(options)
		case "openai-native":
			return new OpenAiNativeEmbeddingHandler(options)
		case "ollama":
			return new OllamaEmbeddingHandler(options)
		default:
			throw new Error(`Unsupported embedding provider: ${provider}`)
	}
}
