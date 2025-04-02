import { HaiBuildContextOptions } from "./customApi"
import { EmbeddingConfiguration } from "./embeddings"
import { ApiConfiguration } from "./api"
import { AutoApprovalSettings } from "./AutoApprovalSettings"
import { BrowserSettings } from "./BrowserSettings"
import { ChatSettings } from "./ChatSettings"
import { UserInfo } from "./UserInfo"
import { ChatContent } from "./ChatContent"
import { TelemetrySetting } from "./TelemetrySetting"

export interface WebviewMessage {
	type:
		| "apiConfiguration"
		| "customInstructions"
		| "expertPrompt"
		| "webviewDidLaunch"
		| "newTask"
		| "askResponse"
		| "clearTask"
		| "didShowAnnouncement"
		| "selectImages"
		| "saveExpert"
		| "deleteExpert"
		| "loadExperts"
		| "exportCurrentTask"
		| "showTaskWithId"
		| "deleteTaskWithId"
		| "exportTaskWithId"
		| "resetState"
		| "requestOllamaModels"
		| "requestLmStudioModels"
		| "openImage"
		| "openInBrowser"
		| "openFile"
		| "openMention"
		| "cancelTask"
		| "refreshOpenRouterModels"
		| "refreshOpenAiModels"
		| "openMcpSettings"
		| "restartMcpServer"
		| "deleteMcpServer"
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
		| "showAccountViewClicked"
		| "authStateChanged"
		| "authCallback"
		| "fetchMcpMarketplace"
		| "downloadMcp"
		| "silentlyRefreshMcpMarketplace"
		| "searchCommits"
		| "showMcpView"
		| "fetchLatestMcpServersFromHub"
		| "checkHaiRules"
		| "telemetrySetting"
		| "openSettings"
		| "updateMcpTimeout"
		| "fetchOpenGraphData"
		| "checkIsImageUrl"
		| "invoke"
		| "updateSettings"
		| "clearAllTaskHistory"
		| "fetchUserCreditsData"
		| "optionsResponse"
		| "requestTotalTasksSize"
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
	timeout?: number
	isDefault?: boolean
	prompt?: string
	category?: string

	// For toggleToolAutoApprove
	serverName?: string
	toolName?: string
	autoApprove?: boolean

	buildContextOptions?: HaiBuildContextOptions
	embeddingConfiguration?: EmbeddingConfiguration
	toast?: { message: string; toastType: "error" | "warning" | "info" }

	// For auth
	user?: UserInfo | null
	customToken?: string
	// For openInBrowser
	url?: string
	planActSeparateModelsSetting?: boolean
	telemetrySetting?: TelemetrySetting
	customInstructionsSetting?: string
}

export type ClineAskResponse = "yesButtonClicked" | "noButtonClicked" | "messageResponse"
export type ClineCheckpointRestore = "task" | "workspace" | "taskAndWorkspace"
