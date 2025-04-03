import { Anthropic } from "@anthropic-ai/sdk"
import { AnthropicVertex } from "@anthropic-ai/vertex-sdk"
import { withRetry } from "../retry"
import { ApiHandler } from "../"
import { ApiHandlerOptions, ModelInfo, vertexDefaultModelId, VertexModelId, vertexModels } from "../../shared/api"
import { ApiStream } from "../transform/stream"

// https://docs.anthropic.com/en/api/claude-on-vertex-ai
export class VertexHandler implements ApiHandler {
	private options: ApiHandlerOptions
	private client: AnthropicVertex

	constructor(options: ApiHandlerOptions) {
		console.log("Caroline 🏗️ - Initializing VertexHandler with project:", options.vertexProjectId)
		this.options = options
		this.client = new AnthropicVertex({
			projectId: this.options.vertexProjectId,
			// https://cloud.google.com/vertex-ai/generative-ai/docs/partner-models/use-claude#regions
			region: this.options.vertexRegion,
			maxRetries: this.options.maxRetries,
		})
	}

	@withRetry()
	async *createMessage(systemPrompt: string, messages: Anthropic.Messages.MessageParam[]): ApiStream {
		console.log("Caroline 📝 - Creating new message stream")
		const model = this.getModel()
		const modelId = model.id
		const supportsCache = model.info.supportsPromptCache

		console.log(`Caroline 🤖 - Using model: ${modelId}, Cache Support: ${supportsCache}`)
		const stream = await this.client.messages.create({
			model: modelId,
			max_tokens: model.info.maxTokens || 8192,
			temperature: 0,
			system: [
				{
					text: systemPrompt,
					type: "text",
					...(supportsCache && { cache_control: { type: "ephemeral" } }),
				},
			],
			messages: messages.map((message, index) => {
				if (!supportsCache) {
					return message
				}

				const userMsgIndices = messages.reduce(
					(acc, msg, index) => (msg.role === "user" ? [...acc, index] : acc),
					[] as number[],
				)
				const lastUserMsgIndex = userMsgIndices[userMsgIndices.length - 1] ?? -1
				const secondLastMsgUserIndex = userMsgIndices[userMsgIndices.length - 2] ?? -1

				if (index === lastUserMsgIndex || index === secondLastMsgUserIndex) {
					console.log(`Caroline 💾 - Applying cache control for message at index: ${index}`)
					return {
						...message,
						content:
							typeof message.content === "string"
								? [
										{
											type: "text",
											text: message.content,
											cache_control: {
												type: "ephemeral",
											},
										},
									]
								: message.content.map((content, contentIndex) =>
										contentIndex === message.content.length - 1
											? {
													...content,
													cache_control: {
														type: "ephemeral",
													},
												}
											: content,
									),
					}
				}
				return message
			}),
			stream: true,
		})
		for await (const chunk of stream) {
			console.log("Caroline 🎯 - Processing message stream chunks")
			switch (chunk.type) {
				case "message_start":
					console.log("Caroline 📊 - Message start, processing usage metrics")
					const usage = chunk.message.usage
					yield {
						type: "usage",
						inputTokens: usage.input_tokens || 0,
						outputTokens: usage.output_tokens || 0,
						cacheWriteTokens: usage.cache_creation_input_tokens || undefined,
						cacheReadTokens: usage.cache_read_input_tokens || undefined,
					}
					break
				case "message_delta":
					console.log("Caroline 📈 - Message delta received")
					yield {
						type: "usage",
						inputTokens: 0,
						outputTokens: chunk.usage.output_tokens || 0,
					}
					break

				case "content_block_start":
					console.log("Caroline 📦 - Content block start")
					switch (chunk.content_block.type) {
						case "text":
							if (chunk.index > 0) {
								yield {
									type: "text",
									text: "\n",
								}
							}
							yield {
								type: "text",
								text: chunk.content_block.text,
							}
							break
					}
					break
				case "content_block_delta":
					console.log("Caroline 🔄 - Processing content block delta")
					switch (chunk.delta.type) {
						case "text_delta":
							yield {
								type: "text",
								text: chunk.delta.text,
							}
							break
					}
					break
			}
		}
	}

	getModel(): { id: VertexModelId; info: ModelInfo } {
		console.log("Caroline 🔍 - Getting model configuration")
		const modelId = this.options.apiModelId
		if (modelId && modelId in vertexModels) {
			const id = modelId as VertexModelId
			console.log(`Caroline ✅ - Using specified model: ${id}`)
			return { id, info: vertexModels[id] }
		}
		console.log(`Caroline ℹ️ - Using default model: ${vertexDefaultModelId}`)
		return {
			id: vertexDefaultModelId,
			info: vertexModels[vertexDefaultModelId],
		}
	}

	async validateAPIKey(): Promise<boolean> {
		console.log("Caroline 🔑 - Validating Vertex API credentials")
		try {
			await this.client.messages.create({
				model: this.getModel().id,
				max_tokens: 1,
				temperature: 0,
				messages: [{ role: "user", content: "Test" }],
				stream: false,
			})
			console.log("Caroline ✅ - API credentials validated successfully")
			return true
		} catch (error) {
			console.error("Error validating Vertex credentials: ", error)
			return false
		}
	}
}
