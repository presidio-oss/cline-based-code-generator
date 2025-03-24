import { HaiBuildContextOptions } from "./customApi"
import { EmbeddingConfiguration } from "./embeddings"
import { ApiConfiguration } from "./api"
import { AutoApprovalSettings } from "./AutoApprovalSettings"
import { BrowserSettings } from "./BrowserSettings"
import { ChatSettings } from "./ChatSettings"
import { ChatContent } from "./ChatContent"

export interface WebviewMessage {
	type:
		| "apiConfiguration"
		| "customInstructions"
		| "webviewDidLaunch"
		| "newTask"
		| "askResponse"
		| "clearTask"
		| "didShowAnnouncement"
		| "selectImages"
		| "saveExpert"
		| "loadExperts"
		| "exportCurrentTask"
		| "showTaskWithId"
		| "deleteTaskWithId"
		| "exportTaskWithId"
		| "resetState"
		| "requestOllamaModels"
		| "requestLmStudioModels"
		| "openImage"
		| "openFile"
		| "openMention"
		| "cancelTask"
		| "refreshOpenRouterModels"
		| "refreshOpenAiModels"
		| "openMcpSettings"
		| "restartMcpServer"
		| "autoApprovalSettings"
		| "browserSettings"
		| "togglePlanActMode"
		| "checkpointDiff"
		| "checkpointRestore"
		| "taskCompletionViewChanges"
		| "openExtensionSettings"
		| "requestVsCodeLmModels"
		| "toggleToolAutoApprove"
		| "toggleMcpServer"
		| "getLatestState"
		| "accountLoginClicked"
		| "accountLogoutClicked"
		| "onHaiConfigure"
		| "buildContextOptions"
		| "embeddingConfiguration"
		| "validateLLMConfig"
		| "validateEmbeddingConfig"
		| "openHistory"
		| "openHaiTasks"
		| "showToast"
		| "requestOllamaEmbeddingModels"
		| "stopIndex"
		| "startIndex"
		| "resetIndex"
		| "subscribeEmail"
		| "fetchMcpMarketplace"
		| "downloadMcp"
		| "silentlyRefreshMcpMarketplace"
		| "searchCommits"
		| "showMcpView"
		| "fetchLatestMcpServersFromHub"
		| "checkHaiRules"
	// | "relaunchChromeDebugMode"
	text?: string
	disabled?: boolean
	askResponse?: ClineAskResponse
	apiConfiguration?: ApiConfiguration
	images?: string[]
	bool?: boolean
	number?: number
	autoApprovalSettings?: AutoApprovalSettings
	browserSettings?: BrowserSettings
	chatSettings?: ChatSettings
	chatContent?: ChatContent
	mcpId?: string

	// For toggleToolAutoApprove
	serverName?: string
	toolName?: string
	autoApprove?: boolean

	buildContextOptions?: HaiBuildContextOptions
	embeddingConfiguration?: EmbeddingConfiguration
	toast?: { message: string; toastType: "error" | "warning" | "info" }
}

export type ClineAskResponse = "yesButtonClicked" | "noButtonClicked" | "messageResponse"
export type ClineCheckpointRestore = "task" | "workspace" | "taskAndWorkspace"
