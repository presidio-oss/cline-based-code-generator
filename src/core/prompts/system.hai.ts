import type { McpHub } from "../../services/mcp/McpHub"
import type { BrowserSettings } from "../../shared/BrowserSettings"
import { SYSTEM_PROMPT as haiSystemPromptV1 } from "./system.hai.v1"
import { SYSTEM_PROMPT as haiSystemPromptV2 } from "./system.hai.v2"
import { SYSTEM_PROMPT as haiSystemPromptV3 } from "./system.hai.v3"
import { SYSTEM_PROMPT as haiDefaultSystemPrompt } from "./system"

export const haiSystemPrompt = (
	cwd: string,
	supportsComputerUse: boolean,
	supportsCodeIndex: boolean,
	mcpHub: McpHub,
	browserSettings: BrowserSettings,
	version?: string,
) => {
	switch (version) {
		case "v1":
			return haiSystemPromptV1(cwd, supportsComputerUse, supportsCodeIndex, mcpHub, browserSettings)
		case "v2":
			return haiSystemPromptV2(cwd, supportsComputerUse, supportsCodeIndex, mcpHub, browserSettings)
		case "v3":
			return haiSystemPromptV3(cwd, supportsComputerUse, supportsCodeIndex, mcpHub, browserSettings)
		default:
			return haiDefaultSystemPrompt(cwd, supportsComputerUse, supportsCodeIndex, mcpHub, browserSettings)
	}
}
