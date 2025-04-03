import { Anthropic } from "@anthropic-ai/sdk"
import { Mistral } from "@mistralai/mistralai"
import { AssistantMessage } from "@mistralai/mistralai/models/components/assistantmessage"
import { SystemMessage } from "@mistralai/mistralai/models/components/systemmessage"
import { ToolMessage } from "@mistralai/mistralai/models/components/toolmessage"
import { UserMessage } from "@mistralai/mistralai/models/components/usermessage"

export type MistralMessage =
	| (SystemMessage & { role: "system" })
	| (UserMessage & { role: "user" })
	| (AssistantMessage & { role: "assistant" })
	| (ToolMessage & { role: "tool" })

function isImageBlock(block: Anthropic.Messages.ContentBlockParam): block is Anthropic.Messages.ImageBlockParam {
	return block.type === "image"
}

function isTextBlock(block: Anthropic.Messages.ContentBlockParam): block is Anthropic.Messages.TextBlockParam {
	return block.type === "text"
}

function getImageUrl(part: Anthropic.Messages.ImageBlockParam): { type: "image_url"; imageUrl: { url: string } } {
	// Handle both base64 and URL image sources
	if (part.source.type === "base64") {
		const data = part.source.data
		const mimeType = part.source.media_type
		return {
			type: "image_url",
			imageUrl: {
				url: `data:${mimeType};base64,${data}`,
			},
		}
	} else {
		return {
			type: "image_url",
			imageUrl: {
				url: part.source.url,
			},
		}
	}
}

export function convertToMistralMessages(anthropicMessages: Anthropic.Messages.MessageParam[]): MistralMessage[] {
	const mistralMessages: MistralMessage[] = []
	for (const anthropicMessage of anthropicMessages) {
		if (typeof anthropicMessage.content === "string") {
			mistralMessages.push({
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

				if (nonToolMessages.length > 0) {
					mistralMessages.push({
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

				mistralMessages.push({
					role: "assistant",
					content,
				})
			}
		}
	}

	return mistralMessages
}
