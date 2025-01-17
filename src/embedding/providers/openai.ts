import { EmbeddingHandler } from "../"
import { azureOpenAIApiVersion, EmbeddingHandlerOptions } from "../../shared/embeddings"
import { AzureOpenAIEmbeddings, OpenAIEmbeddings } from "@langchain/openai"

export class OpenAiEmbeddingHandler implements EmbeddingHandler {
	private options: EmbeddingHandlerOptions
	private client: OpenAIEmbeddings

	constructor(options: EmbeddingHandlerOptions) {
		this.options = options
		if (this.options.openAiBaseUrl?.toLowerCase().includes("azure.com")) {
			const originalURL = new URL(this.options.openAiBaseUrl);
            const baseURL = originalURL.origin;

			this.client = new AzureOpenAIEmbeddings({
				azureOpenAIApiKey: this.options.openAiApiKey,
				azureOpenAIBasePath: baseURL + "/openai/deployments",
				azureOpenAIApiEmbeddingsDeploymentName: this.options.openAiModelId,
				azureOpenAIApiVersion: this.options.azureOpenAIApiVersion || azureOpenAIApiVersion,
				maxRetries: this.options.maxRetries
			})
		} else {
			this.client = new OpenAIEmbeddings({
				model: this.options.openAiModelId,
				apiKey: this.options.openAiApiKey,
				configuration: {
					apiKey: this.options.openAiApiKey,
					baseURL: this.options.openAiBaseUrl || "https://api.openai.com/v1",
				},
				maxRetries: this.options.maxRetries
			})
		}
	}

	getClient() {
		return this.client;
	}

	async validateAPIKey(): Promise<boolean> {
		try {
			await this.client.embedQuery('Test');
			return true
		} catch (error) {
			console.error("Error validating OpenAI Native embedding credentials: ", error)
			return false
		}
	}
}
