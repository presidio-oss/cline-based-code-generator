import { BedrockEmbeddings } from "@langchain/aws"
import { OpenAIEmbeddings, AzureOpenAIEmbeddings } from "@langchain/openai"
import { EmbeddingHandler } from "../"
import { EmbeddingHandlerOptions } from "../../shared/embeddings"
import { OllamaEmbeddings } from "@langchain/ollama"

export class OllamaEmbeddingHandler implements EmbeddingHandler {
	private options: EmbeddingHandlerOptions
	private client: OllamaEmbeddings

	constructor(options: EmbeddingHandlerOptions) {
		this.options = options
		this.client = new OllamaEmbeddings({
			model: this.options.ollamaModelId,
			baseUrl: this.options.ollamaBaseUrl || "http://localhost:11434",
		})
	}

	getClient() {
		return this.client
	}

	async validateAPIKey(): Promise<boolean> {
		try {
			await this.client.embedQuery("Test")
			return true
		} catch (error) {
			console.error("Error validating Ollama credentials: ", error)
			return false
		}
	}
}
