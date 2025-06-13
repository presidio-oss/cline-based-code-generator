import { EmbeddingHandler } from "../"
import { BedrockEmbeddings } from "@langchain/aws"
import { EmbeddingHandlerOptions } from "../../shared/embeddings"
import { BedrockRuntimeClient } from "@aws-sdk/client-bedrock-runtime";

export class AwsBedrockEmbeddingHandler implements EmbeddingHandler {
	private options: EmbeddingHandlerOptions
	private client: BedrockEmbeddings | null = null

	constructor(options: EmbeddingHandlerOptions) {
		this.options = options

		let bedrockRuntimeClient: BedrockRuntimeClient;

		if (this.options.awsUseProfile) {
			bedrockRuntimeClient = new BedrockRuntimeClient({
				region: this.options.awsRegion,
				profile: this.options.awsProfile,
			})
		} else {
			bedrockRuntimeClient = new BedrockRuntimeClient({
				region: this.options.awsRegion,
				credentials: {
					accessKeyId: this.options.awsAccessKey!,
					secretAccessKey: this.options.awsSecretKey!,
					...(this.options.awsSessionToken ? { sessionToken: this.options.awsSessionToken } : {}),
				},
			})
		}

		this.client = new BedrockEmbeddings({
			client: bedrockRuntimeClient, onFailedAttempt: (error) => {
				console.error("Failed attempt in Bedrock Embeddings:", error);
				throw error;
			}
		})
	}

	getClient() {
		return this.client!;
	}

	async validateAPIKey(): Promise<boolean> {
		try {
			await this.client!.embedQuery("Test")
			return true
		} catch (error) {
			console.error("Error validating Bedrock embedding credentials: ", error)
			return false
		}
	}
}
