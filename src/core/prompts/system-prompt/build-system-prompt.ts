import { ApiHandlerModel, ApiProviderInfo } from "@core/api"
import { McpHub } from "@services/mcp/McpHub"
import { BrowserSettings } from "@shared/BrowserSettings"
import { FocusChainSettings } from "@shared/FocusChainSettings"
import { haiSystemPrompt } from "../system.hai"
import { SYSTEM_PROMPT_COMPACT } from "./families/local-models/compact-system-prompt"
import { SYSTEM_PROMPT_NEXT_GEN } from "./families/next-gen-models/next-gen-system-prompt"
import { isLocalModelFamily, isNextGenModelFamily } from "./utils"

export const buildSystemPrompt = async (
	cwd: string,
	supportsBrowserUse: boolean,
	mcpHub: McpHub,
	browserSettings: BrowserSettings,
	apiHandlerModel: ApiHandlerModel,
	focusChainSettings: FocusChainSettings,
	providerInfo: ApiProviderInfo,

	// TAG:HAI
	supportsCodeIndex: boolean,
	expertPrompt?: string,
	isDeepCrawlEnabled?: boolean,
	expertName?: string,
	version?: string,
) => {
	// Compact prompt is only available for local models with custom prompt set to compact
	if (providerInfo.customPrompt === "compact" && isLocalModelFamily(providerInfo.providerId)) {
		return SYSTEM_PROMPT_COMPACT(cwd, supportsBrowserUse, mcpHub, browserSettings, focusChainSettings)
	}
	// New prompts per family can be added as granularly as we like by adding a folder in the "families" folder
	// We then discriminate between families with a functions in the utils.
	if (isNextGenModelFamily(apiHandlerModel.id)) {
		return SYSTEM_PROMPT_NEXT_GEN(cwd, supportsBrowserUse, mcpHub, browserSettings, focusChainSettings)
	}
	return haiSystemPrompt(
		cwd,
		supportsBrowserUse,
		mcpHub,
		browserSettings,
		apiHandlerModel,
		focusChainSettings,
		providerInfo,
		supportsCodeIndex,
		expertPrompt,
		isDeepCrawlEnabled,
		expertName,
		version,
	)
}
