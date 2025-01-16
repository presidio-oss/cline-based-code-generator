import { ApiConfiguration, ApiProvider } from "./api"
import { HaiBuildContextOptions } from "./customApi"
import { EmbeddingConfiguration } from "./embeddings"
import { AutoApprovalSettings } from "./AutoApprovalSettings"

export interface WebviewMessage {
	type:
		| "apiConfiguration"
		| "customInstructions"
		| "alwaysAllowReadOnly"
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
		| "onHaiConfigure"
		| "buildContextOptions"
		| "embeddingConfiguration"
		| "validateApiKey"
		| "validateEmbeddingKey"
		| "openMcpSettings"
		| "restartMcpServer"
		| "autoApprovalSettings"
		| "openHistory"
		| "openHaiTasks"
		| "uploadInstructions"
		| "deleteInstruction"
		| "fetchExistingFiles"
		| "getExistingFiles"
		| "updateInstructionState"
		| "showToast"
	text?: string
	askResponse?: ClineAskResponse
	apiConfiguration?: ApiConfiguration
	images?: string[]
	bool?: boolean
	buildContextOptions?: HaiBuildContextOptions
	embeddingConfiguration?: EmbeddingConfiguration
	autoApprovalSettings?: AutoApprovalSettings
	filename?: string
	instructions?: { name: string; enabled: boolean }[];
	toast?: { message: string; toastType: "error" | "warning" | "info" } 
}

export type ClineAskResponse = "yesButtonClicked" | "noButtonClicked" | "messageResponse"
