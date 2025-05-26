import { HaiBuildContextOptions } from "./customApi"
import { EmbeddingConfiguration } from "./embeddings"
import { ApiConfiguration } from "./api"
import { AutoApprovalSettings } from "./AutoApprovalSettings"
import { BrowserSettings } from "./BrowserSettings"
import { ChatSettings } from "./ChatSettings"
import { UserInfo } from "./UserInfo"
import { ChatContent } from "./ChatContent"
import { TelemetrySetting } from "./TelemetrySetting"
import { McpViewTab } from "./mcp"
import { Guard } from "./ExtensionMessage"

export interface WebviewMessage {
	type:
		| "addRemoteServer"
		| "apiConfiguration"
		| "customInstructions"
		| "expertPrompt"
		| "webviewDidLaunch"
		| "newTask"
		| "condense"
		| "reportBug"
		| "askResponse"
		| "clearTask"
		| "didShowAnnouncement"
		| "selectImages"
		| "saveExpert"
		| "deleteExpert"
		| "loadExperts"
		| "loadDefaultExperts"
		| "loadGuards"
		| "updateGuardThreshold"
		| "updateGuardMode"
		| "updateGuards"
		| "refreshDocumentLink"
		| "deleteDocumentLink"
		| "addDocumentLink"
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
		| "showChatView"
		| "refreshRequestyModels"
		| "refreshClineRules"
		| "cancelTask"
		| "refreshOpenRouterModels"
		| "refreshOpenAiModels"
		| "openMcpSettings"
		| "restartMcpServer"
		| "deleteMcpServer"
		| "autoApprovalSettings"
		| "browserSettings"
		| "browserRelaunchResult"
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
		| "relaunchChromeDebugMode"
		| "taskFeedback"
		| "writeTaskStatus"
		| "defaultGuards"
		| "scrollToSettings"
		| "searchFiles"
		| "toggleFavoriteModel"
		| "grpc_request"
		| "grpc_request_cancel"
		| "toggleClineRule"
		| "toggleCursorRule"
		| "toggleWindsurfRule"
		| "deleteClineRule"
		| "copyToClipboard"
		| "updateTerminalConnectionTimeout"
		| "setActiveQuote"

	// | "relaunchChromeDebugMode"
	text?: string
	expert?: string
	guard?: Guard
	guards?: Guard[]
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
	folder?: string
	taskId?: string
	status?: string

	buildContextOptions?: HaiBuildContextOptions
	embeddingConfiguration?: EmbeddingConfiguration
	toast?: { message: string; toastType: "error" | "warning" | "info" }

	tab?: McpViewTab
	// For toggleToolAutoApprove
	serverName?: string
	serverUrl?: string
	toolNames?: string[]
	autoApprove?: boolean

	// For auth
	user?: UserInfo | null
	customToken?: string
	// For openInBrowser
	url?: string
	planActSeparateModelsSetting?: boolean
	telemetrySetting?: TelemetrySetting
	customInstructionsSetting?: string
	// For task feedback
	feedbackType?: TaskFeedbackType
	mentionsRequestId?: string
	query?: string
	// For toggleFavoriteModel
	modelId?: string
	grpc_request?: {
		service: string
		method: string
		message: any // JSON serialized protobuf message
		request_id: string // For correlating requests and responses
		is_streaming?: boolean // Whether this is a streaming request
	}
	grpc_request_cancel?: {
		request_id: string // ID of the request to cancel
	}
	// For cline rules
	isGlobal?: boolean
	rulePath?: string
	enabled?: boolean
	filename?: string

	offset?: number
	shellIntegrationTimeout?: number
}

export type ClineAskResponse = "yesButtonClicked" | "noButtonClicked" | "messageResponse"

export type ClineCheckpointRestore = "task" | "workspace" | "taskAndWorkspace"

export type TaskFeedbackType = "thumbs_up" | "thumbs_down"
