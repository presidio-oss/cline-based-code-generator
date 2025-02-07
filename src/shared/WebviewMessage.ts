import { HaiBuildContextOptions, HaiInstructionFile } from "./customApi"
import { EmbeddingConfiguration } from "./embeddings"
import { ApiConfiguration } from "./api"
import { AutoApprovalSettings } from "./AutoApprovalSettings"
import { BrowserSettings } from "./BrowserSettings"
import { ChatSettings } from "./ChatSettings"

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
		| "chatSettings"
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
		| "uploadInstruction"
		| "deleteInstruction"
		| "fileInstructions"
		| "requestOllamaEmbeddingModels"
		| "stopIndex"
		| "startIndex"
		| "resetIndex"
		| "subscribeEmail"
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

	// For toggleToolAutoApprove
	serverName?: string
	toolName?: string
	autoApprove?: boolean

	buildContextOptions?: HaiBuildContextOptions
	embeddingConfiguration?: EmbeddingConfiguration
	fileInstructions?: HaiInstructionFile[]
	toast?: { message: string; toastType: "error" | "warning" | "info" }
}

export type ClineAskResponse = "yesButtonClicked" | "noButtonClicked" | "messageResponse"
export type ClineCheckpointRestore = "task" | "workspace" | "taskAndWorkspace"
