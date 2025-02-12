import { Anthropic } from "@anthropic-ai/sdk"
import OpenAI, { AzureOpenAI } from "openai"
import { ApiHandlerOptions, azureOpenAiDefaultApiVersion, ModelInfo, openAiModelInfoSaneDefaults } from "../../shared/api"
import { ApiHandler } from "../index"
import { convertToOpenAiMessages } from "../transform/openai-format"
import { ApiStream } from "../transform/stream"
import { convertToR1Format } from "../transform/r1-format"

export class OpenAiHandler implements ApiHandler {
	private options: ApiHandlerOptions
	private client: OpenAI

	constructor(options: ApiHandlerOptions) {
		this.options = options
		// Azure API shape slightly differs from the core API shape: https://github.com/openai/openai-node?tab=readme-ov-file#microsoft-azure-openai
		if (this.options.openAiBaseUrl?.toLowerCase().includes("azure.com")) {
			this.client = new AzureOpenAI({
				endpoint: this.options.openAiBaseUrl,
				deployment: this.options.openAiModelId,
				apiKey: this.options.openAiApiKey,
				apiVersion: this.options.azureApiVersion || azureOpenAiDefaultApiVersion,
				maxRetries: this.options.maxRetries,
			})
		} else {
			this.client = new OpenAI({
				baseURL: this.options.openAiBaseUrl,
				apiKey: this.options.openAiApiKey,
				maxRetries: this.options.maxRetries,
			})
		}
	}

	async *createMessage(systemPrompt: string, messages: Anthropic.Messages.MessageParam[]): ApiStream {
		const modelId = this.options.openAiModelId ?? ""
		const isDeepseekReasoner = modelId.includes("deepseek-reasoner")

		let openAiMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
			{ role: "system", content: systemPrompt },
			...convertToOpenAiMessages(messages),
		]

		if (isDeepseekReasoner) {
			openAiMessages = convertToR1Format([{ role: "user", content: systemPrompt }, ...messages])
		}

		const stream = await this.client.chat.completions.create({
			model: modelId,
			messages: openAiMessages,
			temperature: 0,
			stream: true,
			stream_options: { include_usage: true },
		})
		for await (const chunk of stream) {
			const delta = chunk.choices[0]?.delta
			if (delta?.content) {
				yield {
					type: "text",
					text: delta.content,
				}
			}

			if (delta && "reasoning_content" in delta && delta.reasoning_content) {
				yield {
					type: "reasoning",
					reasoning: (delta.reasoning_content as string | undefined) || "",
				}
			}

			if (chunk.usage) {
				yield {
					type: "usage",
					inputTokens: chunk.usage.prompt_tokens || 0,
					outputTokens: chunk.usage.completion_tokens || 0,
				}
			}
		}
	}

	getModel(): { id: string; info: ModelInfo } {
		return {
			id: this.options.openAiModelId ?? "",
			info: openAiModelInfoSaneDefaults,
		}
	}

	async validateAPIKey(): Promise<boolean> {
		try {
			if (this.options.openAiBaseUrl?.toLowerCase().includes("azure.com") && !this.options.openAiModelId) {
				return false
			}

			await this.client.chat.completions.create({
				model: this.getModel().id,
				max_tokens: 1,
				messages: [{ role: "user", content: "Test" }],
				temperature: 0,
				stream: false,
			})
			return true
		} catch (error) {
			console.error("Error validating OpenAI credentials: ", error)
			return false
		}
	}
}
