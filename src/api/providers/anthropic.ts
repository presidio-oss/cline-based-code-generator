import { Anthropic } from "@anthropic-ai/sdk"
import { Stream as AnthropicStream } from "@anthropic-ai/sdk/streaming"
import { withRetry } from "../retry"
import { anthropicDefaultModelId, AnthropicModelId, anthropicModels, ApiHandlerOptions, ModelInfo } from "../../shared/api"
import { ApiHandler } from "../index"
import { ApiStream } from "../transform/stream"

export class AnthropicHandler implements ApiHandler {
	private options: ApiHandlerOptions
	private client: Anthropic

	constructor(options: ApiHandlerOptions) {
		this.options = options
		this.client = new Anthropic({
			apiKey: this.options.apiKey,
			baseURL: this.options.anthropicBaseUrl || undefined,
			maxRetries: this.options.maxRetries,
		})
	}

	@withRetry()
	async *createMessage(systemPrompt: string, messages: Anthropic.Messages.MessageParam[]): ApiStream {
		const model = this.getModel()
		const modelId = model.id
		const supportsCache = model.info.supportsPromptCache

		const stream = (await this.client.messages.create({
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
			...(supportsCache && {
				headers: {
					"anthropic-beta": "prompt-caching-2024-07-31",
				},
			}),
			stream: true,
		})) as AnthropicStream<Anthropic.Messages.MessageStreamEvent>

		for await (const chunk of stream) {
			switch (chunk.type) {
				case "message_start":
					// tells us cache reads/writes/input/output
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
					// tells us stop_reason, stop_sequence, and output tokens along the way and at the end of the message

					yield {
						type: "usage",
						inputTokens: 0,
						outputTokens: chunk.usage.output_tokens || 0,
					}
					break
				case "message_stop":
					// no usage data, just an indicator that the message is done
					break
				case "content_block_start":
					switch (chunk.content_block.type) {
						case "text":
							// we may receive multiple text blocks, in which case just insert a line break between them
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
					switch (chunk.delta.type) {
						case "text_delta":
							yield {
								type: "text",
								text: chunk.delta.text,
							}
							break
					}
					break
				case "content_block_stop":
					break
			}
		}
	}

	getModel(): { id: AnthropicModelId; info: ModelInfo } {
		const modelId = this.options.apiModelId
		if (modelId && modelId in anthropicModels) {
			const id = modelId as AnthropicModelId
			return { id, info: anthropicModels[id] }
		}
		return {
			id: anthropicDefaultModelId,
			info: anthropicModels[anthropicDefaultModelId],
		}
	}

	async validateAPIKey(): Promise<boolean> {
		try {
			await this.client.messages.create({
				model: this.getModel().id,
				max_tokens: 1,
				temperature: 0,
				messages: [{ role: "user", content: "Test" }],
				stream: false,
			})
			return true
		} catch (error) {
			console.error("Error validating Anthropic credentials: ", error)
			return false
		}
	}
}
