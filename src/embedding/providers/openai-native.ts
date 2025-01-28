import { EmbeddingHandler } from "../"
import { EmbeddingHandlerOptions } from "../../shared/embeddings"
import { OpenAIEmbeddings } from "@langchain/openai"

export class OpenAiNativeEmbeddingHandler implements EmbeddingHandler {
	private options: EmbeddingHandlerOptions
	private client: OpenAIEmbeddings

	constructor(options: EmbeddingHandlerOptions) {
		this.options = options
		this.client = new OpenAIEmbeddings({
			model: this.options.modelId,
			apiKey: this.options.openAiNativeApiKey,
			configuration: {
				apiKey: this.options.openAiNativeApiKey,
				baseURL: "https://api.openai.com/v1",
			},
			maxRetries: this.options.maxRetries,
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
			console.error("Error validating OpenAI Native embedding credentials: ", error)
			return false
		}
	}
}
