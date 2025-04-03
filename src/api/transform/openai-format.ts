import { Anthropic } from "@anthropic-ai/sdk"
import OpenAI from "openai"

function isImageBlock(block: Anthropic.Messages.ContentBlockParam): block is Anthropic.Messages.ImageBlockParam {
	return block.type === "image"
}

function isTextBlock(block: Anthropic.Messages.ContentBlockParam): block is Anthropic.Messages.TextBlockParam {
	return block.type === "text"
}

function getImageUrl(part: Anthropic.Messages.ImageBlockParam): { type: "image_url"; image_url: { url: string } } {
	if (part.source.type === "base64") {
		return {
			type: "image_url",
			image_url: {
				url: `data:${part.source.media_type};base64,${part.source.data}`,
			},
		}
	} else {
		return {
			type: "image_url",
			image_url: {
				url: part.source.url,
			},
		}
	}
}

export function convertToOpenAiMessages(
	anthropicMessages: Anthropic.Messages.MessageParam[],
): OpenAI.Chat.ChatCompletionMessageParam[] {
	const openAiMessages: OpenAI.Chat.ChatCompletionMessageParam[] = []

	for (const anthropicMessage of anthropicMessages) {
		if (typeof anthropicMessage.content === "string") {
			openAiMessages.push({
				role: anthropicMessage.role,
				content: anthropicMessage.content,
			})
		} else {
			if (anthropicMessage.role === "user") {
				const { nonToolMessages, toolMessages } = anthropicMessage.content.reduce<{
					nonToolMessages: (Anthropic.Messages.TextBlockParam | Anthropic.Messages.ImageBlockParam)[]
					toolMessages: Anthropic.Messages.ToolResultBlockParam[]
				}>(
					(acc, part) => {
						if (part.type === "tool_result") {
							acc.toolMessages.push(part)
						} else if (isTextBlock(part) || isImageBlock(part)) {
							acc.nonToolMessages.push(part)
						} // user cannot send tool_use messages
						return acc
					},
					{ nonToolMessages: [], toolMessages: [] },
				)

				// Process tool result messages FIRST since they must follow the tool use messages
				let toolResultImages: Anthropic.Messages.ImageBlockParam[] = []
				toolMessages.forEach((toolMessage) => {
					let content: string

					if (typeof toolMessage.content === "string") {
						content = toolMessage.content
					} else {
						content =
							toolMessage.content
								?.map((part) => {
									if (isImageBlock(part)) {
										toolResultImages.push(part)
										return "(see following user message for image)"
									}
									return part.text
								})
								.join("\n") ?? ""
					}
					openAiMessages.push({
						role: "tool",
						tool_call_id: toolMessage.tool_use_id,
						content: content,
					})
				})

				// If tool results contain images, send as a separate user message
				// I ran into an issue where if I gave feedback for one of many tool uses, the request would fail.
				// "Messages following `tool_use` blocks must begin with a matching number of `tool_result` blocks."
				// Therefore we need to send these images after the tool result messages
				// NOTE: it's actually okay to have multiple user messages in a row, the model will treat them as a continuation of the same input (this way works better than combining them into one message, since the tool result specifically mentions (see following user message for image)
				// UPDATE v2.0: we don't use tools anymore, but if we did it's important to note that the openrouter prompt caching mechanism requires one user message at a time, so we would need to add these images to the user content array instead.
				// if (toolResultImages.length > 0) {
				// 	openAiMessages.push({
				// 		role: "user",
				// 		content: toolResultImages.map((part) => ({
				// 			type: "image_url",
				// 			image_url: { url: `data:${part.source.media_type};base64,${part.source.data}` },
				// 		})),
				// 	})
				// }

				// Process non-tool messages
				if (nonToolMessages.length > 0) {
					openAiMessages.push({
						role: "user",
						content: nonToolMessages.map((part) => {
							if (isImageBlock(part)) {
								return getImageUrl(part)
							}
							return { type: "text", text: part.text }
						}),
					})
				}
			} else if (anthropicMessage.role === "assistant") {
				const { nonToolMessages, toolMessages } = anthropicMessage.content.reduce<{
					nonToolMessages: (Anthropic.Messages.TextBlockParam | Anthropic.Messages.ImageBlockParam)[]
					toolMessages: Anthropic.Messages.ToolUseBlockParam[]
				}>(
					(acc, part) => {
						if (part.type === "tool_use") {
							acc.toolMessages.push(part)
						} else if (isTextBlock(part) || isImageBlock(part)) {
							acc.nonToolMessages.push(part)
						} // assistant cannot send tool_result messages
						return acc
					},
					{ nonToolMessages: [], toolMessages: [] },
				)

				// Process non-tool messages
				let content: string | undefined
				if (nonToolMessages.length > 0) {
					content = nonToolMessages
						.map((part) => {
							if (isImageBlock(part)) {
								return "" // impossible as the assistant cannot send images
							}
							return part.text
						})
						.join("\n")
				}

				// Process tool use messages
				let tool_calls: OpenAI.Chat.ChatCompletionMessageToolCall[] = toolMessages.map((toolMessage) => ({
					id: toolMessage.id,
					type: "function",
					function: {
						name: toolMessage.name,
						arguments: JSON.stringify(toolMessage.input),
					},
				}))

				openAiMessages.push({
					role: "assistant",
					content,
					// Cannot be an empty array. API expects an array with minimum length 1, and will respond with an error if it's empty
					tool_calls: tool_calls.length > 0 ? tool_calls : undefined,
				})
			}
		}
	}

	return openAiMessages
}

// Convert OpenAI response to Anthropic format
export function convertToAnthropicMessage(completion: OpenAI.Chat.Completions.ChatCompletion): Anthropic.Messages.Message {
	const openAiMessage = completion.choices[0].message
	const anthropicMessage: Anthropic.Messages.Message = {
		id: completion.id,
		type: "message",
		role: openAiMessage.role, // always "assistant"
		content: [
			{
				type: "text",
				text: openAiMessage.content || "",
				citations: null,
			},
		],
		model: completion.model,
		stop_reason: (() => {
			switch (completion.choices[0].finish_reason) {
				case "stop":
					return "end_turn"
				case "length":
					return "max_tokens"
				case "tool_calls":
					return "tool_use"
				case "content_filter": // Anthropic doesn't have an exact equivalent
				default:
					return null
			}
		})(),
		stop_sequence: null, // which custom stop_sequence was generated, if any (not applicable if you don't use stop_sequence)
		usage: {
			input_tokens: completion.usage?.prompt_tokens || 0,
			output_tokens: completion.usage?.completion_tokens || 0,
			cache_creation_input_tokens: 0,
			cache_read_input_tokens: 0,
		},
	}

	if (openAiMessage.tool_calls && openAiMessage.tool_calls.length > 0) {
		anthropicMessage.content.push(
			...openAiMessage.tool_calls.map((toolCall): Anthropic.Messages.ToolUseBlock => {
				let parsedInput = {}
				try {
					parsedInput = JSON.parse(toolCall.function.arguments || "{}")
				} catch (error) {
					console.error("Failed to parse tool arguments:", error)
				}
				return {
					type: "tool_use",
					id: toolCall.id,
					name: toolCall.function.name,
					input: parsedInput,
				}
			}),
		)
	}
	return anthropicMessage
}
