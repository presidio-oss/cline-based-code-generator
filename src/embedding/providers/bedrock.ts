import { EmbeddingHandler } from "../"
import { BedrockEmbeddings } from "@langchain/aws"
import { EmbeddingHandlerOptions } from "../../shared/embeddings"

export class AwsBedrockEmbeddingHandler implements EmbeddingHandler {
	private options: EmbeddingHandlerOptions
	private client: BedrockEmbeddings

	constructor(options: EmbeddingHandlerOptions) {
		this.options = options

		this.client = new BedrockEmbeddings({
			model: this.options.modelId,
			region: this.options.awsRegion,
			credentials: {
				accessKeyId: this.options.awsAccessKey!,
				secretAccessKey: this.options.awsSecretKey!,
				...(this.options.awsSessionToken ? { sessionToken: this.options.awsSessionToken } : {}),
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
			console.error("Error validating Bedrock embedding credentials: ", error)
			return false
		}
	}
}
