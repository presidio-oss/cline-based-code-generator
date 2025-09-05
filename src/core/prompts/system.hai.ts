import { FocusChainSettings } from "@/shared/FocusChainSettings"
import type { McpHub } from "../../services/mcp/McpHub"
import type { BrowserSettings } from "../../shared/BrowserSettings"
import { ApiHandlerModel, ApiProviderInfo } from "../api"
import { SYSTEM_PROMPT as haiSystemPromptV1 } from "./system.hai.v1"
import { SYSTEM_PROMPT as haiSystemPromptV2 } from "./system.hai.v2"
import { SYSTEM_PROMPT as haiSystemPromptV3 } from "./system.hai.v3"
import { SYSTEM_PROMPT_GENERIC } from "./system-prompt/generic-system-prompt"

export const haiSystemPrompt = (
	cwd: string,
	supportsBrowserUse: boolean,
	mcpHub: McpHub,
	browserSettings: BrowserSettings,
	_apiHandlerModel: ApiHandlerModel,
	focusChainSettings: FocusChainSettings,
	_providerInfo: ApiProviderInfo,

	// TAG:HAI
	supportsCodeIndex: boolean,
	expertPrompt?: string,
	isDeepCrawlEnabled?: boolean,
	expertName?: string,
	version?: string,
) => {
	switch (version) {
		case "v1":
			return haiSystemPromptV1(
				cwd,
				supportsBrowserUse,
				mcpHub,
				browserSettings,
				focusChainSettings,
				supportsCodeIndex,
				expertPrompt,
				isDeepCrawlEnabled,
				expertName,
			)
		case "v2":
			return haiSystemPromptV2(
				cwd,
				supportsBrowserUse,
				mcpHub,
				browserSettings,
				focusChainSettings,
				supportsCodeIndex,
				expertPrompt,
				isDeepCrawlEnabled,
				expertName,
			)
		case "v3":
			return haiSystemPromptV3(
				cwd,
				supportsBrowserUse,
				mcpHub,
				browserSettings,
				focusChainSettings,
				supportsCodeIndex,
				expertPrompt,
				isDeepCrawlEnabled,
				expertName,
			)
		default:
			return SYSTEM_PROMPT_GENERIC(
				cwd,
				supportsBrowserUse,
				mcpHub,
				browserSettings,
				focusChainSettings,
				supportsCodeIndex,
				expertPrompt,
				isDeepCrawlEnabled,
				expertName,
			)
	}
}
