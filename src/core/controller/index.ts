import { Anthropic } from "@anthropic-ai/sdk"
import axios from "axios"
import fs from "fs/promises"
import { setTimeout as setTimeoutPromise } from "node:timers/promises"
import pWaitFor from "p-wait-for"
import * as path from "path"
import * as vscode from "vscode"
import { handleGrpcRequest, handleGrpcRequestCancel } from "./grpc-handler"
import { handleModelsServiceRequest } from "./models"
import { EmptyRequest } from "@shared/proto/common"
import { buildApiHandler } from "@api/index"
import { cleanupLegacyCheckpoints } from "@integrations/checkpoints/CheckpointMigration"
import { downloadTask } from "@integrations/misc/export-markdown"
import { fetchOpenGraphData } from "@integrations/misc/link-preview"
import { handleFileServiceRequest } from "./file"
import { selectImages } from "@integrations/misc/process-images"
import { getTheme } from "@integrations/theme/getTheme"
import WorkspaceTracker from "@integrations/workspace/WorkspaceTracker"
import { ClineAccountService } from "@services/account/ClineAccountService"
import { BrowserSession } from "@services/browser/BrowserSession"
import { McpHub } from "@services/mcp/McpHub"
import { telemetryService } from "@/services/posthog/telemetry/TelemetryService"
import { ApiProvider, ModelInfo } from "@shared/api"
import { ChatContent } from "@shared/ChatContent"
import { ChatSettings } from "@shared/ChatSettings"
import { ExtensionMessage, ExtensionState, Invoke, Platform } from "@shared/ExtensionMessage"
import { HistoryItem } from "@shared/HistoryItem"
import { McpDownloadResponse, McpMarketplaceCatalog, McpServer } from "@shared/mcp"
import { TelemetrySetting } from "@shared/TelemetrySetting"
import { WebviewMessage } from "@shared/WebviewMessage"
import { fileExistsAtPath } from "@utils/fs"
import { getWorkingState } from "@utils/git"
import { extractCommitMessage } from "@integrations/git/commit-message-generator"
import { getTotalTasksSize } from "@utils/storage"
import { openMention } from "../mentions"
import { ensureMcpServersDirectoryExists, ensureSettingsDirectoryExists, GlobalFileNames } from "../storage/disk"
import {
	customGetSecret,
	customGetState,
	customStoreSecret,
	customUpdateState,
	getAllExtensionState,
	getWorkspaceState,
	resetExtensionState,
	updateApiConfiguration,
	updateEmbeddingConfiguration,
	updateWorkspaceState,
} from "../storage/state"
import { Task, cwd } from "../task"
import { ClineRulesToggles } from "@shared/cline-rules"
import { sendStateUpdate } from "./state/subscribeToState"
import { refreshClineRulesToggles } from "@core/context/instructions/user-instructions/cline-rules"
import { refreshExternalRulesToggles } from "@core/context/instructions/user-instructions/external-rules"
import HaiFileSystemWatcher from "../../integrations/workspace/HaiFileSystemWatcher"
import { ExpertManager } from "../experts/ExpertManager"
import { getWorkspaceID, getWorkspacePath } from "@utils/path"
import { FileOperations } from "@utils/constants"
import { ensureFaissPlatformDeps } from "@utils/faiss"
import { HaiBuildIndexProgress } from "@shared/customApi"
import { getFormattedDateTime } from "@utils/date"
import { validateApiConfiguration, validateEmbeddingConfiguration } from "@shared/validate"
import { IHaiStory } from "../../shared/hai-task"
import { CodeContextErrorMessage, CodeIndexStartMessage } from "../webview/customClientProvider"
import { CodeContextAdditionAgent } from "../../integrations/code-prep/CodeContextAddition"
import { ICodeIndexProgress } from "../../integrations/code-prep/type"
import { VectorizeCodeAgent } from "../../integrations/code-prep/VectorizeCodeAgent"
import { ExpertData } from "@shared/experts"
import { buildEmbeddingHandler } from "../../embedding"
import { HaiBuildDefaults } from "@shared/haiDefaults"
import { deleteFromContextDirectory } from "@utils/delete-helper"
import { isLocalMcp, getLocalMcpDetails, getLocalMcp, getAllLocalMcps } from "@utils/local-mcp-registry"
import { getStarCount } from "../../services/github/github"
import { openFile } from "@integrations/misc/open-file"

/*
https://github.com/microsoft/vscode-webview-ui-toolkit-samples/blob/main/default/weather-webview/src/providers/WeatherViewProvider.ts

https://github.com/KumarVariable/vscode-extension-sidebar-html/blob/master/src/customSidebarViewProvider.ts
*/

// URI scheme for expert prompts virtual documents
export const EXPERT_PROMPT_URI_SCHEME = "hai-expert-prompt"

export class Controller {
	private postMessage: (message: ExtensionMessage) => Thenable<boolean> | undefined

	private disposables: vscode.Disposable[] = []
	task?: Task
	workspaceTracker: WorkspaceTracker
	mcpHub: McpHub
	accountService: ClineAccountService
	private latestAnnouncementId = "may-09-2025_17:11:00" // update to some unique identifier when we add a new announcement

	haiTaskList: string = ""
	fileSystemWatcher: HaiFileSystemWatcher | undefined
	private workspaceId: string
	private vsCodeWorkSpaceFolderFsPath!: string
	private codeIndexAbortController: AbortController
	private isSideBar: boolean
	private expertManager: ExpertManager
	private isCodeIndexInProgress: boolean = false

	constructor(
		readonly context: vscode.ExtensionContext,
		private readonly outputChannel: vscode.OutputChannel,
		postMessage: (message: ExtensionMessage) => Thenable<boolean> | undefined,
		isSideBar: boolean = true,
	) {
		this.outputChannel.appendLine("HAIProvider instantiated")
		this.postMessage = postMessage

		this.workspaceTracker = new WorkspaceTracker((msg) => this.postMessageToWebview(msg))
		this.mcpHub = new McpHub(
			() => ensureMcpServersDirectoryExists(),
			() => ensureSettingsDirectoryExists(this.context),
			(msg) => this.postMessageToWebview(msg),
			this.context.extension?.packageJSON?.version ?? "1.0.0",
		)
		this.accountService = new ClineAccountService(
			(msg) => this.postMessageToWebview(msg),
			async () => {
				const { apiConfiguration } = await this.getStateToPostToWebview()
				return apiConfiguration?.clineApiKey
			},
		)

		// Clean up legacy checkpoints
		cleanupLegacyCheckpoints(this.context.globalStorageUri.fsPath, this.outputChannel).catch((error) => {
			console.error("Failed to cleanup legacy checkpoints:", error)
		})

		this.codeIndexAbortController = new AbortController()
		this.workspaceId = getWorkspaceID() || ""
		this.expertManager = new ExpertManager(this.context, this.workspaceId)
		this.isSideBar = isSideBar
		this.vsCodeWorkSpaceFolderFsPath = (getWorkspacePath() || "").trim()
		if (this.vsCodeWorkSpaceFolderFsPath) {
			this.fileSystemWatcher = new HaiFileSystemWatcher(this, this.vsCodeWorkSpaceFolderFsPath)
			this.codeIndexBackground()
		}

		// Register the expert prompt provider
		const registration = vscode.workspace.registerTextDocumentContentProvider(
			EXPERT_PROMPT_URI_SCHEME,
			this.expertPromptProvider,
		)
		this.disposables.push(registration)
	}

	// Content provider for expert prompts
	private expertPromptProvider = new (class implements vscode.TextDocumentContentProvider {
		provideTextDocumentContent(uri: vscode.Uri): string {
			return Buffer.from(uri.query, "base64").toString("utf-8")
		}
	})()

	/*
	VSCode extensions use the disposable pattern to clean up resources when the sidebar/editor tab is closed by the user or system. This applies to event listening, commands, interacting with the UI, etc.
	- https://vscode-docs.readthedocs.io/en/stable/extensions/patterns-and-principles/
	- https://github.com/microsoft/vscode-extension-samples/blob/main/webview-sample/src/extension.ts
	*/
	async dispose() {
		this.outputChannel.appendLine("Disposing HAIProvider...")
		await this.clearTask()
		this.outputChannel.appendLine("Cleared task")
		while (this.disposables.length) {
			const x = this.disposables.pop()
			if (x) {
				x.dispose()
			}
		}
		this.workspaceTracker.dispose()
		this.mcpHub.dispose()
		this.fileSystemWatcher?.dispose()
		this.outputChannel.appendLine("Disposed all disposables")

		console.error("Controller disposed")
	}

	// Auth methods
	async handleSignOut() {
		try {
			await customStoreSecret(this.context, "clineApiKey", this.workspaceId, undefined)
			await customUpdateState(this.context, "userInfo", undefined)
			await customUpdateState(this.context, "apiProvider", "openrouter")
			await this.postStateToWebview()
			vscode.window.showInformationMessage("Successfully logged out of HAI")
		} catch (error) {
			vscode.window.showErrorMessage("Logout failed")
		}
	}

	async setUserInfo(info?: { displayName: string | null; email: string | null; photoURL: string | null }) {
		await customUpdateState(this.context, "userInfo", info)
	}

	async initTask(task?: string, images?: string[], historyItem?: HistoryItem) {
		await this.clearTask() // ensures that an existing task doesn't exist before starting a new one, although this shouldn't be possible since user must clear task before starting a new one
		const {
			apiConfiguration,
			customInstructions,
			autoApprovalSettings,
			browserSettings,
			chatSettings,
			shellIntegrationTimeout,
			embeddingConfiguration,
			expertPrompt,
			buildContextOptions,
		} = await getAllExtensionState(this.context, this.workspaceId)

		if (autoApprovalSettings) {
			const updatedAutoApprovalSettings = {
				...autoApprovalSettings,
				version: (autoApprovalSettings.version ?? 1) + 1,
			}
			await customUpdateState(this.context, "autoApprovalSettings", updatedAutoApprovalSettings)
		}
		this.task = new Task(
			this.context,
			this.mcpHub,
			this.workspaceTracker,
			(historyItem) => this.updateTaskHistory(historyItem),
			() => this.postStateToWebview(),
			(message) => this.postMessageToWebview(message),
			(taskId) => this.reinitExistingTaskFromId(taskId),
			() => this.cancelTask(),
			apiConfiguration,
			autoApprovalSettings,
			browserSettings,
			chatSettings,
			embeddingConfiguration,
			shellIntegrationTimeout,
			customInstructions,
			expertPrompt,
			task,
			images,
			historyItem,
		)
	}

	async reinitExistingTaskFromId(taskId: string) {
		const history = await this.getTaskWithId(taskId)
		if (history) {
			await this.initTask(undefined, undefined, history.historyItem)
		}
	}

	// Send any JSON serializable data to the react app
	async postMessageToWebview(message: ExtensionMessage) {
		await this.postMessage(message)
	}

	/**
	 * Sets up an event listener to listen for messages passed from the webview context and
	 * executes code based on the message that is received.
	 *
	 * @param webview A reference to the extension webview
	 */
	async handleWebviewMessage(message: WebviewMessage) {
		switch (message.type) {
			case "authStateChanged":
				await this.setUserInfo(message.user || undefined)
				await this.postStateToWebview()
				break
			case "webviewDidLaunch":
				await this.updateHaiRulesState()
				this.postStateToWebview()
				this.workspaceTracker?.populateFilePaths() // don't await
				getTheme().then((theme) =>
					this.postMessageToWebview({
						type: "theme",
						text: JSON.stringify(theme),
					}),
				)
				// post last cached models in case the call to endpoint fails
				this.readOpenRouterModels().then((openRouterModels) => {
					if (openRouterModels) {
						this.postMessageToWebview({
							type: "openRouterModels",
							openRouterModels,
						})
					}
				})
				// gui relies on model info to be up-to-date to provide the most accurate pricing, so we need to fetch the latest details on launch.
				// we do this for all users since many users switch between api providers and if they were to switch back to openrouter it would be showing outdated model info if we hadn't retrieved the latest at this point
				// (see normalizeApiConfiguration > openrouter)
				// Prefetch marketplace and OpenRouter models

				customGetState(this.context, "mcpMarketplaceCatalog").then((mcpMarketplaceCatalog) => {
					if (mcpMarketplaceCatalog) {
						this.postMessageToWebview({
							type: "mcpMarketplaceCatalog",
							mcpMarketplaceCatalog: mcpMarketplaceCatalog as McpMarketplaceCatalog,
						})
					}
				})
				this.silentlyRefreshMcpMarketplace()
				handleModelsServiceRequest(this, "refreshOpenRouterModels", EmptyRequest.create()).then(async (response) => {
					if (response && response.models) {
						// update model info in state (this needs to be done here since we don't want to update state while settings is open, and we may refresh models there)
						const { apiConfiguration } = await getAllExtensionState(this.context, this.workspaceId)
						if (apiConfiguration.openRouterModelId && response.models[apiConfiguration.openRouterModelId]) {
							await customUpdateState(
								this.context,
								"openRouterModelInfo",
								response.models[apiConfiguration.openRouterModelId],
							)
							await this.postStateToWebview()
						}
					}
				})

				// If user already opted in to telemetry, enable telemetry service
				this.getStateToPostToWebview().then((state) => {
					const { telemetrySetting } = state
					const isOptedIn = telemetrySetting === "enabled"
					telemetryService.updateTelemetryState(isOptedIn)
				})
				break
			case "showChatView": {
				this.postMessageToWebview({
					type: "action",
					action: "chatButtonClicked",
				})
				break
			}
			case "newTask":
				// Code that should run in response to the hello message command
				//vscode.window.showInformationMessage(message.text!)

				// Send a message to our webview.
				// You can send any JSON serializable data.
				// Could also do this in extension .ts
				//this.postMessageToWebview({ type: "text", text: `Extension: ${Date.now()}` })
				// initializing new instance of Cline will make sure that any agentically running promises in old instance don't affect our new task. this essentially creates a fresh slate for the new task
				await this.initTask(message.text, message.images)
				break
			case "condense":
				this.task?.handleWebviewAskResponse("yesButtonClicked")
				break
			case "reportBug":
				this.task?.handleWebviewAskResponse("yesButtonClicked")
				break
			case "apiConfiguration":
				if (message.apiConfiguration) {
					await updateApiConfiguration(this.context, message.apiConfiguration, this.workspaceId)
					if (this.task) {
						this.task.api = buildApiHandler(message.apiConfiguration)
					}
				}
				await this.postStateToWebview()
				break
			case "autoApprovalSettings":
				if (message.autoApprovalSettings) {
					const currentSettings = (await getAllExtensionState(this.context, this.workspaceId)).autoApprovalSettings
					const incomingVersion = message.autoApprovalSettings.version ?? 1
					const currentVersion = currentSettings?.version ?? 1
					if (incomingVersion > currentVersion) {
						await customUpdateState(this.context, "autoApprovalSettings", message.autoApprovalSettings)
						if (this.task) {
							this.task.autoApprovalSettings = message.autoApprovalSettings
						}
						await this.postStateToWebview()
					}
				}
				break
			case "togglePlanActMode":
				if (message.chatSettings) {
					await this.togglePlanActModeWithChatSettings(message.chatSettings, message.chatContent)
				}
				break
			case "optionsResponse":
				await this.postMessageToWebview({
					type: "invoke",
					invoke: "sendMessage",
					text: message.text,
				})
				break
			case "relaunchChromeDebugMode":
				const { browserSettings } = await getAllExtensionState(this.context, this.workspaceId)
				const browserSession = new BrowserSession(this.context, browserSettings)
				await browserSession.relaunchChromeDebugMode(this)
				break
			case "askResponse":
				this.task?.handleWebviewAskResponse(message.askResponse!, message.text, message.images)
				break
			case "didShowAnnouncement":
				await customUpdateState(this.context, "lastShownAnnouncementId", this.latestAnnouncementId)
				await this.postStateToWebview()
				break
			case "selectImages":
				const images = await selectImages()
				await this.postMessageToWebview({
					type: "selectedImages",
					images,
				})
				break
			case "resetState":
				await this.resetState()
				break
			case "refreshRequestyModels":
				await this.refreshRequestyModels()
				break
			case "refreshClineRules":
				await refreshClineRulesToggles(this.context, cwd)
				await refreshExternalRulesToggles(this.context, cwd)
				await this.postStateToWebview()
				break
			case "openInBrowser":
				if (message.url) {
					vscode.env.openExternal(vscode.Uri.parse(message.url))
				}
				break
			case "fetchOpenGraphData":
				this.fetchOpenGraphData(message.text!)
				break
			case "openMention":
				openMention(message.text)
				break
			case "taskCompletionViewChanges": {
				if (message.number) {
					await this.task?.presentMultifileDiff(message.number, true)
				}
				break
			}
			case "accountLogoutClicked": {
				await this.handleSignOut()
				break
			}
			case "showAccountViewClicked": {
				await this.postMessageToWebview({ type: "action", action: "accountButtonClicked" })
				break
			}
			case "fetchUserCreditsData": {
				await this.fetchUserCreditsData()
				break
			}
			case "openMcpSettings": {
				const mcpSettingsFilePath = await this.mcpHub?.getMcpSettingsFilePath()
				if (mcpSettingsFilePath) {
					await handleFileServiceRequest(this, "openFile", { value: mcpSettingsFilePath })
				}
				break
			}
			case "fetchMcpMarketplace": {
				await this.fetchMcpMarketplace(message.bool)
				break
			}
			case "downloadMcp": {
				if (message.mcpId) {
					// 1. Toggle to act mode if we are in plan mode
					const { chatSettings } = await this.getStateToPostToWebview()
					if (chatSettings.mode === "plan") {
						await this.togglePlanActModeWithChatSettings({ mode: "act" })
					}

					// 2. download MCP
					await this.downloadMcp(message.mcpId)
				}
				break
			}
			case "silentlyRefreshMcpMarketplace": {
				await this.silentlyRefreshMcpMarketplace()
				break
			}
			case "taskFeedback":
				if (message.feedbackType && this.task?.taskId) {
					telemetryService.captureTaskFeedback(this.task.taskId, message.feedbackType)
				}
				break
			// case "openMcpMarketplaceServerDetails": {
			// 	if (message.text) {
			// 		const response = await fetch(`https://api.cline.bot/v1/mcp/marketplace/item?mcpId=${message.mcpId}`)
			// 		const details: McpDownloadResponse = await response.json()

			// 		if (details.readmeContent) {
			// 			// Disable markdown preview markers
			// 			const config = vscode.workspace.getConfiguration("markdown")
			// 			await config.update("preview.markEditorSelection", false, true)

			// 			// Create URI with base64 encoded markdown content
			// 			const uri = vscode.Uri.parse(
			// 				`${DIFF_VIEW_URI_SCHEME}:${details.name} README?${Buffer.from(details.readmeContent).toString("base64")}`,
			// 			)

			// 			// close existing
			// 			const tabs = vscode.window.tabGroups.all
			// 				.flatMap((tg) => tg.tabs)
			// 				.filter((tab) => tab.label && tab.label.includes("README") && tab.label.includes("Preview"))
			// 			for (const tab of tabs) {
			// 				await vscode.window.tabGroups.close(tab)
			// 			}

			// 			// Show only the preview
			// 			await vscode.commands.executeCommand("markdown.showPreview", uri, {
			// 				sideBySide: true,
			// 				preserveFocus: true,
			// 			})
			// 		}
			// 	}

			// 	this.postMessageToWebview({ type: "relinquishControl" })

			// 	break
			// }
			case "toggleToolAutoApprove": {
				try {
					await this.mcpHub?.toggleToolAutoApprove(message.serverName!, message.toolNames!, message.autoApprove!)
				} catch (error) {
					if (message.toolNames?.length === 1) {
						console.error(
							`Failed to toggle auto-approve for server ${message.serverName} with tool ${message.toolNames[0]}:`,
							error,
						)
					} else {
						console.error(`Failed to toggle auto-approve tools for server ${message.serverName}:`, error)
					}
				}
				break
			}
			case "toggleClineRule": {
				const { isGlobal, rulePath, enabled } = message
				if (rulePath && typeof enabled === "boolean" && typeof isGlobal === "boolean") {
					if (isGlobal) {
						const toggles =
							((await customGetState(this.context, "globalClineRulesToggles")) as ClineRulesToggles) || {}
						toggles[rulePath] = enabled
						await customUpdateState(this.context, "globalClineRulesToggles", toggles)
					} else {
						const toggles =
							((await getWorkspaceState(this.context, "localClineRulesToggles")) as ClineRulesToggles) || {}
						toggles[rulePath] = enabled
						await updateWorkspaceState(this.context, "localClineRulesToggles", toggles)
					}
					await this.postStateToWebview()
				} else {
					console.error("toggleClineRule: Missing or invalid parameters", {
						rulePath,
						isGlobal: typeof isGlobal === "boolean" ? isGlobal : `Invalid: ${typeof isGlobal}`,
						enabled: typeof enabled === "boolean" ? enabled : `Invalid: ${typeof enabled}`,
					})
				}
				break
			}
			case "toggleWindsurfRule": {
				const { rulePath, enabled } = message
				if (rulePath && typeof enabled === "boolean") {
					const toggles =
						((await getWorkspaceState(this.context, "localWindsurfRulesToggles")) as ClineRulesToggles) || {}
					toggles[rulePath] = enabled
					await updateWorkspaceState(this.context, "localWindsurfRulesToggles", toggles)
					await this.postStateToWebview()
				} else {
					console.error("toggleWindsurfRule: Missing or invalid parameters")
				}
				break
			}
			case "toggleCursorRule": {
				const { rulePath, enabled } = message
				if (rulePath && typeof enabled === "boolean") {
					const toggles =
						((await getWorkspaceState(this.context, "localCursorRulesToggles")) as ClineRulesToggles) || {}
					toggles[rulePath] = enabled
					await updateWorkspaceState(this.context, "localCursorRulesToggles", toggles)
					await this.postStateToWebview()
				} else {
					console.error("toggleCursorRule: Missing or invalid parameters")
				}
				break
			}
			case "requestTotalTasksSize": {
				this.refreshTotalTasksSize()
				break
			}
			case "restartMcpServer": {
				try {
					await this.mcpHub?.restartConnection(message.text!)
				} catch (error) {
					console.error(`Failed to retry connection for ${message.text}:`, error)
				}
				break
			}
			case "deleteMcpServer": {
				if (message.serverName) {
					this.mcpHub?.deleteServer(message.serverName)
				}
				break
			}
			case "fetchLatestMcpServersFromHub": {
				this.mcpHub?.sendLatestMcpServers()
				break
			}
			case "openExtensionSettings": {
				const settingsFilter = message.text || ""
				await vscode.commands.executeCommand(
					"workbench.action.openSettings",
					`@ext:presidio-inc.hai-build-code-generator ${settingsFilter}`.trim(), // trim whitespace if no settings filter
				)
				break
			}
			case "invoke": {
				if (message.text) {
					await this.postMessageToWebview({
						type: "invoke",
						invoke: message.text as Invoke,
					})
				}
				break
			}
			// telemetry
			case "openSettings": {
				await this.postMessageToWebview({
					type: "action",
					action: "settingsButtonClicked",
				})
				break
			}
			case "scrollToSettings": {
				await this.postMessageToWebview({
					type: "scrollToSettings",
					text: message.text,
				})
				break
			}
			case "telemetrySetting": {
				if (message.telemetrySetting) {
					await this.updateTelemetrySetting(message.telemetrySetting)
				}
				await this.postStateToWebview()
				break
			}
			case "updateSettings": {
				// api config
				if (message.apiConfiguration) {
					await updateApiConfiguration(this.context, message.apiConfiguration, this.workspaceId)
					if (this.task) {
						this.task.api = buildApiHandler(message.apiConfiguration)
					}
				}

				// custom instructions
				await this.updateCustomInstructions(message.customInstructionsSetting)

				// telemetry setting
				if (message.telemetrySetting) {
					await this.updateTelemetrySetting(message.telemetrySetting)
				}

				// plan act setting
				await customUpdateState(this.context, "planActSeparateModelsSetting", message.planActSeparateModelsSetting)

				// after settings are updated, post state to webview
				await this.postStateToWebview()

				await this.postMessageToWebview({ type: "didUpdateSettings" })
				break
			}
			case "clearAllTaskHistory": {
				const answer = await vscode.window.showWarningMessage(
					"What would you like to delete?",
					{ modal: true },
					"Delete All Except Favorites",
					"Delete Everything",
					"Cancel",
				)

				if (answer === "Delete All Except Favorites") {
					await this.deleteNonFavoriteTaskHistory()
					await this.postStateToWebview()
					this.refreshTotalTasksSize()
				} else if (answer === "Delete Everything") {
					await this.deleteAllTaskHistory()
					await this.postStateToWebview()
					this.refreshTotalTasksSize()
				}
				this.postMessageToWebview({ type: "relinquishControl" })
				break
			}
			case "toggleFavoriteModel": {
				if (message.modelId) {
					const { apiConfiguration } = await getAllExtensionState(this.context, this.workspaceId)
					const favoritedModelIds = apiConfiguration.favoritedModelIds || []

					// Toggle favorite status
					const updatedFavorites = favoritedModelIds.includes(message.modelId)
						? favoritedModelIds.filter((id) => id !== message.modelId)
						: [...favoritedModelIds, message.modelId]

					await customUpdateState(this.context, "favoritedModelIds", updatedFavorites)

					// Capture telemetry for model favorite toggle
					const isFavorited = !favoritedModelIds.includes(message.modelId)
					telemetryService.captureModelFavoritesUsage(message.modelId, isFavorited)

					// Post state to webview without changing any other configuration
					await this.postStateToWebview()
				}
				break
			}
			case "grpc_request": {
				if (message.grpc_request) {
					await handleGrpcRequest(this, message.grpc_request)
				}
				break
			}
			case "grpc_request_cancel": {
				if (message.grpc_request_cancel) {
					await handleGrpcRequestCancel(this, message.grpc_request_cancel)
				}
				break
			}

			case "copyToClipboard": {
				try {
					await vscode.env.clipboard.writeText(message.text || "")
				} catch (error) {
					console.error("Error copying to clipboard:", error)
				}
				break
			}
			case "updateTerminalConnectionTimeout": {
				if (message.shellIntegrationTimeout !== undefined) {
					const timeout = message.shellIntegrationTimeout

					if (typeof timeout === "number" && !isNaN(timeout) && timeout > 0) {
						await customUpdateState(this.context, "shellIntegrationTimeout", timeout)
						await this.postStateToWebview()
					} else {
						console.warn(
							`Invalid shell integration timeout value received: ${timeout}. ` + `Expected a positive number.`,
						)
					}
				}
				break
			}

			// HAI webview messages
			case "requestOllamaEmbeddingModels":
				const ollamaEmbeddingModels = await this.getOllamaEmbeddingModels(message.text)
				this.postMessageToWebview({
					type: "ollamaEmbeddingModels",
					ollamaEmbeddingModels,
				})
				break
			case "checkHaiRules":
				await this.updateHaiRulesState(true)
				break
			case "showToast":
				switch (message.toast?.toastType) {
					case "info":
						vscode.window.showInformationMessage(message.toast.message)
						break
					case "error":
						vscode.window.showErrorMessage(message.toast.message)
						break
					case "warning":
						vscode.window.showWarningMessage(message.toast.message)
						break
				}
				break
			case "expertPrompt":
				const expertName = message.text || ""
				if (message.category === "viewExpert") {
					if (message.isDefault && message.prompt) {
						try {
							// Create a unique URI for this expert prompt
							const encodedContent = Buffer.from(message.prompt).toString("base64")
							const uri = vscode.Uri.parse(`${EXPERT_PROMPT_URI_SCHEME}:${expertName}.md?${encodedContent}`)

							// Open the document
							const document = await vscode.workspace.openTextDocument(uri)
							await vscode.window.showTextDocument(document, { preview: false })
						} catch (error) {
							console.error("Error creating or opening the virtual document:", error)
						}
					} else {
						// For custom experts, use the existing path
						const promptPath = await this.expertManager.getExpertPromptPath(
							this.vsCodeWorkSpaceFolderFsPath,
							expertName,
						)
						if (promptPath) {
							openFile(promptPath)
						} else {
							vscode.window.showErrorMessage(`Could not find prompt file for expert: ${expertName}`)
						}
					}
				} else {
					await this.updateExpertPrompt(message.prompt, expertName)
				}
				break
			case "saveExpert":
				if (message.text) {
					const expert = JSON.parse(message.text) as ExpertData
					await this.expertManager.saveExpert(this.vsCodeWorkSpaceFolderFsPath, expert)
					await this.loadExperts()
				}
				break
			case "deleteExpert":
				if (message.text) {
					const expertName = message.text
					await this.expertManager.deleteExpert(this.vsCodeWorkSpaceFolderFsPath, expertName)
					await this.loadExperts()
				}
				break
			case "loadExperts":
				await this.loadExperts()
				break
			case "loadDefaultExperts":
				await this.loadDefaultExperts()
				break
			case "refreshDocumentLink":
				if (message.text && message.expert) {
					await this.expertManager.refreshDocumentLink(this.vsCodeWorkSpaceFolderFsPath, message.expert, message.text)
				}
				await this.loadExperts()
				break
			case "deleteDocumentLink":
				if (message.text && message.expert) {
					try {
						await this.expertManager.deleteDocumentLink(
							this.vsCodeWorkSpaceFolderFsPath,
							message.expert,
							message.text,
						)
						await this.loadExperts()
					} catch (error) {
						console.error(`Failed to delete document link for expert ${message.expert}:`, error)
						vscode.window.showErrorMessage(`Failed to delete document link: ${error.message}`)
					}
				}
				break
			case "addDocumentLink":
				if (message.text && message.expert) {
					try {
						await this.expertManager.addDocumentLink(this.vsCodeWorkSpaceFolderFsPath, message.expert, message.text)
						await this.loadExperts()
					} catch (error) {
						console.error(`Failed to add document link for expert ${message.expert}:`, error)
						vscode.window.showErrorMessage(`Failed to add document link: ${error.message}`)
					}
				}
				break
			case "onHaiConfigure":
				const isConfigureEnabled = message.bool !== undefined ? message.bool : true

				if (isConfigureEnabled) {
					this.chooseHaiProject(message?.text)
				} else {
					updateWorkspaceState(this.context, "haiConfig", {})
				}

				break

			case "embeddingConfiguration":
				if (message.embeddingConfiguration) {
					await updateEmbeddingConfiguration(this.context, message.embeddingConfiguration, this.workspaceId)
				}
				await this.postStateToWebview()
				break
			case "validateLLMConfig":
				let isValid = false
				if (message.apiConfiguration) {
					// If no validation error is encountered, validate the LLM configuration by sending a test message.
					if (!message.text) {
						try {
							const apiHandler = buildApiHandler({ ...message.apiConfiguration, maxRetries: 0 })
							isValid = await apiHandler.validateAPIKey()
						} catch (error) {
							vscode.window.showErrorMessage(`LLM validation failed: ${error}`)
						}
					}
				}

				if (!message.text) {
					this.postMessageToWebview({
						type: "llmConfigValidation",
						bool: isValid,
					})
				}
				await customUpdateState(this.context, "isApiConfigurationValid", isValid)
				break
			case "validateEmbeddingConfig":
				let isEmbeddingValid = false
				if (message.embeddingConfiguration) {
					// If no validation error is encountered, validate the Embedding configuration by sending a test message.
					if (!message.text) {
						try {
							const embeddingHandler = buildEmbeddingHandler({
								...message.embeddingConfiguration,
								maxRetries: 0,
							})
							isEmbeddingValid = await embeddingHandler.validateAPIKey()
						} catch (error) {
							vscode.window.showErrorMessage(`Embedding validation failed: ${error}`)
						}
					}
				}

				if (!message.text) {
					this.postMessageToWebview({
						type: "embeddingConfigValidation",
						bool: isEmbeddingValid,
					})
				}
				await customUpdateState(this.context, "isEmbeddingConfigurationValid", isEmbeddingValid)
				break
			case "openHistory":
				this.postMessageToWebview({ type: "action", action: "historyButtonClicked" })
				break
			case "openHaiTasks":
				this.postMessageToWebview({ type: "action", action: "haiBuildTaskListClicked" })
				break
			case "stopIndex":
				console.log("Stopping Code index")
				this.codeIndexAbortController?.abort()
				break
			case "startIndex":
				console.log("Starting Code index")
				await updateWorkspaceState(this.context, "codeIndexUserConfirmation", true)
				this.codeIndexAbortController = new AbortController()
				this.codeIndexBackground(undefined, undefined, true)
				break
			case "resetIndex":
				console.log("Re-indexing workspace")
				const resetIndex = await vscode.window.showWarningMessage(
					"Are you sure you want to reindex this workspace? This will erase all existing indexed data and restart the indexing process from the beginning.",
					"Yes",
					"No",
				)
				if (resetIndex === "Yes") {
					const haiFolderPath = path.join(this.vsCodeWorkSpaceFolderFsPath, HaiBuildDefaults.defaultContextDirectory)
					if (await fileExistsAtPath(haiFolderPath)) {
						await fs.rmdir(haiFolderPath, { recursive: true })
					}
					this.codeIndexAbortController = new AbortController()
					await this.resetIndex()
					this.codeIndexBackground(undefined, undefined, true)
					break
				}
				break
			case "writeTaskStatus":
				// write status to the file
				const folder = message.folder
				const taskId = message?.taskId ?? ""
				const status = message?.status
				const taskIdMatch = taskId.match(/^(\d+)-US(\d+)-TASK(\d+)$/)
				if (!folder || !taskIdMatch || !status) {
					const message = `Failed to update task status. Error: Either folder, taskId or status is invalid.`
					vscode.window.showErrorMessage(message)
				} else {
					const [_, prdId, usId, taskId] = taskIdMatch
					const prdFeatureFilePath = path.join(`${folder}`, "PRD", `PRD${prdId}-feature.json`)
					try {
						const fileContent = await fs.readFile(prdFeatureFilePath, "utf-8")
						const prdFeatureJson = JSON.parse(fileContent)
						const feature = prdFeatureJson["features"].find((feature: { id: string }) => feature.id === `US${usId}`)
						if (feature) {
							const selectedTask = feature["tasks"].find((task: { id: string }) => task.id === `TASK${taskId}`)
							selectedTask.status = status
						}

						await fs.writeFile(prdFeatureFilePath, JSON.stringify(prdFeatureJson, null, 2), "utf-8")
						const message = `Successfully marked task as ${status.toLowerCase()}.`
						vscode.window.showInformationMessage(message)
						await this.postMessageToWebview({
							type: "writeTaskStatus",
							writeTaskStatusResult: {
								success: true,
								message,
								status,
							},
						})
					} catch (error) {
						const message = `Failed to mark task as ${status.toLowerCase()}. Error: ${error.message}`
						vscode.window.showErrorMessage(message)
					}
				}
				break
			default:
				this.customWebViewMessageHandlers(message)
				break
			// Add more switch case statements here as more webview message commands
			// are created within the webview context (i.e. inside media/main.js)
		}
	}

	async updateTelemetrySetting(telemetrySetting: TelemetrySetting) {
		await customUpdateState(this.context, "telemetrySetting", telemetrySetting)
		const isOptedIn = telemetrySetting === "enabled"
		telemetryService.updateTelemetryState(isOptedIn)
	}

	async togglePlanActModeWithChatSettings(chatSettings: ChatSettings, chatContent?: ChatContent) {
		const didSwitchToActMode = chatSettings.mode === "act"

		// Capture mode switch telemetry | Capture regardless of if we know the taskId
		telemetryService.captureModeSwitch(this.task?.taskId ?? "0", chatSettings.mode)

		// Get previous model info that we will revert to after saving current mode api info
		const {
			apiConfiguration,
			previousModeApiProvider: newApiProvider,
			previousModeModelId: newModelId,
			previousModeModelInfo: newModelInfo,
			previousModeVsCodeLmModelSelector: newVsCodeLmModelSelector,
			previousModeThinkingBudgetTokens: newThinkingBudgetTokens,
			previousModeReasoningEffort: newReasoningEffort,
			previousModeAwsBedrockCustomSelected: newAwsBedrockCustomSelected,
			previousModeAwsBedrockCustomModelBaseId: newAwsBedrockCustomModelBaseId,
			planActSeparateModelsSetting,
		} = await getAllExtensionState(this.context, this.workspaceId)

		const shouldSwitchModel = planActSeparateModelsSetting === true

		if (shouldSwitchModel) {
			// Save the last model used in this mode
			await customUpdateState(this.context, "previousModeApiProvider", apiConfiguration.apiProvider)
			await customUpdateState(this.context, "previousModeThinkingBudgetTokens", apiConfiguration.thinkingBudgetTokens)
			await customUpdateState(this.context, "previousModeReasoningEffort", apiConfiguration.reasoningEffort)
			switch (apiConfiguration.apiProvider) {
				case "anthropic":
				case "vertex":
				case "gemini":
				case "asksage":
				case "openai-native":
				case "qwen":
				case "deepseek":
				case "xai":
					await customUpdateState(this.context, "previousModeModelId", apiConfiguration.apiModelId)
					break
				case "bedrock":
					await customUpdateState(this.context, "previousModeModelId", apiConfiguration.apiModelId)
					await customUpdateState(
						this.context,
						"previousModeAwsBedrockCustomSelected",
						apiConfiguration.awsBedrockCustomSelected,
					)
					await customUpdateState(
						this.context,
						"previousModeAwsBedrockCustomModelBaseId",
						apiConfiguration.awsBedrockCustomModelBaseId,
					)
					break
				case "openrouter":
				case "cline":
					await customUpdateState(this.context, "previousModeModelId", apiConfiguration.openRouterModelId)
					await customUpdateState(this.context, "previousModeModelInfo", apiConfiguration.openRouterModelInfo)
					break
				case "vscode-lm":
					// Important we don't set modelId to this, as it's an object not string (webview expects model id to be a string)
					await customUpdateState(
						this.context,
						"previousModeVsCodeLmModelSelector",
						apiConfiguration.vsCodeLmModelSelector,
					)
					break
				case "openai":
					await customUpdateState(this.context, "previousModeModelId", apiConfiguration.openAiModelId)
					await customUpdateState(this.context, "previousModeModelInfo", apiConfiguration.openAiModelInfo)
					break
				case "ollama":
					await customUpdateState(this.context, "previousModeModelId", apiConfiguration.ollamaModelId)
					break
				case "lmstudio":
					await customUpdateState(this.context, "previousModeModelId", apiConfiguration.lmStudioModelId)
					break
				case "litellm":
					await customUpdateState(this.context, "previousModeModelId", apiConfiguration.liteLlmModelId)
					break
				case "requesty":
					await customUpdateState(this.context, "previousModeModelId", apiConfiguration.requestyModelId)
					await customUpdateState(this.context, "previousModeModelInfo", apiConfiguration.requestyModelInfo)
					break
			}

			// Restore the model used in previous mode
			if (
				newApiProvider ||
				newModelId ||
				newThinkingBudgetTokens !== undefined ||
				newReasoningEffort ||
				newVsCodeLmModelSelector
			) {
				await customUpdateState(this.context, "apiProvider", newApiProvider)
				await customUpdateState(this.context, "thinkingBudgetTokens", newThinkingBudgetTokens)
				await customUpdateState(this.context, "reasoningEffort", newReasoningEffort)
				switch (newApiProvider) {
					case "anthropic":
					case "vertex":
					case "gemini":
					case "asksage":
					case "openai-native":
					case "qwen":
					case "deepseek":
					case "xai":
						await customUpdateState(this.context, "apiModelId", newModelId)
						break
					case "bedrock":
						await customUpdateState(this.context, "apiModelId", newModelId)
						await customUpdateState(this.context, "awsBedrockCustomSelected", newAwsBedrockCustomSelected)
						await customUpdateState(this.context, "awsBedrockCustomModelBaseId", newAwsBedrockCustomModelBaseId)
						break
					case "openrouter":
					case "cline":
						await customUpdateState(this.context, "openRouterModelId", newModelId)
						await customUpdateState(this.context, "openRouterModelInfo", newModelInfo)
						break
					case "vscode-lm":
						await customUpdateState(this.context, "vsCodeLmModelSelector", newVsCodeLmModelSelector)
						break
					case "openai":
						await customUpdateState(this.context, "openAiModelId", newModelId)
						await customUpdateState(this.context, "openAiModelInfo", newModelInfo)
						break
					case "ollama":
						await customUpdateState(this.context, "ollamaModelId", newModelId)
						break
					case "lmstudio":
						await customUpdateState(this.context, "lmStudioModelId", newModelId)
						break
					case "litellm":
						await customUpdateState(this.context, "liteLlmModelId", newModelId)
						break
					case "requesty":
						await customUpdateState(this.context, "requestyModelId", newModelId)
						await customUpdateState(this.context, "requestyModelInfo", newModelInfo)
						break
				}

				if (this.task) {
					const { apiConfiguration: updatedApiConfiguration } = await getAllExtensionState(
						this.context,
						this.workspaceId,
					)
					this.task.api = buildApiHandler(updatedApiConfiguration)
				}
			}
		}

		await customUpdateState(this.context, "chatSettings", chatSettings)
		await this.postStateToWebview()

		if (this.task) {
			this.task.chatSettings = chatSettings
			if (this.task.isAwaitingPlanResponse && didSwitchToActMode) {
				this.task.didRespondToPlanAskBySwitchingMode = true
				// Use chatContent if provided, otherwise use default message
				await this.postMessageToWebview({
					type: "invoke",
					invoke: "sendMessage",
					text: chatContent?.message || "PLAN_MODE_TOGGLE_RESPONSE",
					images: chatContent?.images,
				})
			} else {
				this.cancelTask()
			}
		}
	}

	async cancelTask() {
		if (this.task) {
			const { historyItem } = await this.getTaskWithId(this.task.taskId)
			try {
				await this.task.abortTask()
			} catch (error) {
				console.error("Failed to abort task", error)
			}
			await pWaitFor(
				() =>
					this.task === undefined ||
					this.task.isStreaming === false ||
					this.task.didFinishAbortingStream ||
					this.task.isWaitingForFirstChunk, // if only first chunk is processed, then there's no need to wait for graceful abort (closes edits, browser, etc)
				{
					timeout: 3_000,
				},
			).catch(() => {
				console.error("Failed to abort task")
			})
			if (this.task) {
				// 'abandoned' will prevent this cline instance from affecting future cline instance gui. this may happen if its hanging on a streaming request
				this.task.abandoned = true
			}
			await this.initTask(undefined, undefined, historyItem) // clears task again, so we need to abortTask manually above
			// await this.postStateToWebview() // new Cline instance will post state when it's ready. having this here sent an empty messages array to webview leading to virtuoso having to reload the entire list
		}
	}

	async updateCustomInstructions(instructions?: string) {
		// User may be clearing the field
		await customUpdateState(this.context, "customInstructions", instructions || undefined)
		if (this.task) {
			this.task.customInstructions = instructions || undefined
		}
	}

	async getOllamaEmbeddingModels(baseUrl?: string) {
		try {
			if (!baseUrl) {
				baseUrl = "http://localhost:11434"
			}
			if (!URL.canParse(baseUrl)) {
				return []
			}
			const response = await axios.get(`${baseUrl}/api/tags`)
			const modelsArray = response.data?.models?.map((model: any) => model.name) || []
			const models = [...new Set<string>(modelsArray)]
			// TODO: Currently OLLAM local API doen't support diffrentiate between embedding and chat models
			// so we are only considering models that have the following inclusion, as OLLAMA release new
			// models this list has to be updated, or we have to wait for OLLAMA to support this natively.
			// And diretctly fetching from the Public remote API is not also avaialble.
			// https://ollama.com/search?c=embedding
			const PUBLIC_KNOWN_MODELS = [
				"nomic-embed-text",
				"mxbai-embed-large",
				"snowflake-arctic-embed",
				"bge-m3",
				"all-minilm",
				"bge-large",
				"snowflake-arctic-embed2",
				"paraphrase-multilingual",
				"granite-embedding",
			]
			return models.filter((model: string) =>
				PUBLIC_KNOWN_MODELS.some((known) => model.toLowerCase().includes(known.toLowerCase())),
			)
		} catch (error) {
			return []
		}
	}

	// Account

	async fetchUserCreditsData() {
		try {
			await Promise.all([
				this.accountService?.fetchBalance(),
				this.accountService?.fetchUsageTransactions(),
				this.accountService?.fetchPaymentTransactions(),
			])
		} catch (error) {
			console.error("Failed to fetch user credits data:", error)
		}
	}

	// Auth

	public async validateAuthState(state: string | null): Promise<boolean> {
		const storedNonce = await customGetSecret(this.context, "authNonce", this.workspaceId)
		if (!state || state !== storedNonce) {
			return false
		}
		await customStoreSecret(this.context, "authNonce", this.workspaceId, undefined, true) // Clear after use
		return true
	}

	async handleAuthCallback(customToken: string, apiKey: string) {
		try {
			// Store API key for API calls
			await customStoreSecret(this.context, "clineApiKey", this.workspaceId, apiKey, true)

			// Send custom token to webview for Firebase auth
			await this.postMessageToWebview({
				type: "authCallback",
				customToken,
			})

			const clineProvider: ApiProvider = "cline"
			await customUpdateState(this.context, "apiProvider", clineProvider)

			// Update API configuration with the new provider and API key
			const { apiConfiguration } = await getAllExtensionState(this.context, this.workspaceId)
			const updatedConfig = {
				...apiConfiguration,
				apiProvider: clineProvider,
				clineApiKey: apiKey,
			}

			if (this.task) {
				this.task.api = buildApiHandler(updatedConfig)
			}

			await this.postStateToWebview()
			// vscode.window.showInformationMessage("Successfully logged in to Cline")
		} catch (error) {
			console.error("Failed to handle auth callback:", error)
			vscode.window.showErrorMessage("Failed to log in to Cline")
			// Even on login failure, we preserve any existing tokens
			// Only clear tokens on explicit logout
		}
	}

	// MCP Marketplace

	private async fetchMcpMarketplaceFromApi(silent: boolean = false): Promise<McpMarketplaceCatalog | undefined> {
		try {
			const response = await axios.get("https://api.cline.bot/v1/mcp/marketplace", {
				headers: {
					"Content-Type": "application/json",
				},
			})

			if (!response.data) {
				throw new Error("Invalid response from MCP marketplace API")
			}

			// Create an array to hold all local MCPs with their star counts
			const localMcpItems = []

			// Get all local MCPs from registry
			const localMcpIds = Object.keys(getAllLocalMcps())

			// Fetch GitHub stars for each local MCP
			for (const mcpId of localMcpIds) {
				const mcp = getLocalMcp(mcpId)
				if (mcp) {
					// Update star count for this MCP and add isLocal flag
					const gitHubStars = await getStarCount(mcp.githubUrl)
					localMcpItems.push({
						...mcp,
						githubStars: gitHubStars || 0,
						isLocal: true, // Add isLocal flag to identify local MCPs
					})
				}
			}

			const catalog: McpMarketplaceCatalog = {
				items: [
					...localMcpItems,
					...(response.data || []).map((item: any) => ({
						...item,
						githubStars: item.githubStars ?? 0,
						downloadCount: item.downloadCount ?? 0,
						tags: item.tags ?? [],
						isLocal: false, // Mark remote MCPs explicitly
					})),
				],
			}

			// Store in global state
			await customUpdateState(this.context, "mcpMarketplaceCatalog", catalog)
			return catalog
		} catch (error) {
			console.error("Failed to fetch MCP marketplace:", error)
			if (!silent) {
				const errorMessage = error instanceof Error ? error.message : "Failed to fetch MCP marketplace"
				await this.postMessageToWebview({
					type: "mcpMarketplaceCatalog",
					error: errorMessage,
				})
				vscode.window.showErrorMessage(errorMessage)
			}
			return undefined
		}
	}

	async silentlyRefreshMcpMarketplace() {
		try {
			const catalog = await this.fetchMcpMarketplaceFromApi(true)
			if (catalog) {
				await this.postMessageToWebview({
					type: "mcpMarketplaceCatalog",
					mcpMarketplaceCatalog: catalog,
				})
			}
		} catch (error) {
			console.error("Failed to silently refresh MCP marketplace:", error)
		}
	}

	private async fetchMcpMarketplace(forceRefresh: boolean = false) {
		try {
			// Check if we have cached data
			const cachedCatalog = (await customGetState(this.context, "mcpMarketplaceCatalog")) as
				| McpMarketplaceCatalog
				| undefined
			if (!forceRefresh && cachedCatalog?.items) {
				await this.postMessageToWebview({
					type: "mcpMarketplaceCatalog",
					mcpMarketplaceCatalog: cachedCatalog,
				})
				return
			}

			const catalog = await this.fetchMcpMarketplaceFromApi(false)
			if (catalog) {
				await this.postMessageToWebview({
					type: "mcpMarketplaceCatalog",
					mcpMarketplaceCatalog: catalog,
				})
			}
		} catch (error) {
			console.error("Failed to handle cached MCP marketplace:", error)
			const errorMessage = error instanceof Error ? error.message : "Failed to handle cached MCP marketplace"
			await this.postMessageToWebview({
				type: "mcpMarketplaceCatalog",
				error: errorMessage,
			})
			vscode.window.showErrorMessage(errorMessage)
		}
	}

	private async downloadMcp(mcpId: string) {
		try {
			// First check if we already have this MCP server installed
			const servers = this.mcpHub?.getServers() || []
			const isInstalled = servers.some((server: McpServer) => server.name === mcpId)

			if (isInstalled) {
				throw new Error("This MCP server is already installed")
			}

			let mcpDetails: McpDownloadResponse

			// Check if this is a local MCP
			if (isLocalMcp(mcpId)) {
				// Get details from local registry
				mcpDetails = await getLocalMcpDetails(mcpId)
				console.log("[downloadMcp] Using local data for MCP server", { mcpDetails })
			} else {
				// Fetch server details from marketplace
				const response = await axios.post<McpDownloadResponse>(
					"https://api.cline.bot/v1/mcp/download",
					{ mcpId },
					{
						headers: { "Content-Type": "application/json" },
						timeout: 10000,
					},
				)

				if (!response.data) {
					throw new Error("Invalid response from MCP marketplace API")
				}

				console.log("[downloadMcp] Response from download API", { response })

				mcpDetails = response.data
			}
			// Validate required fields
			if (!mcpDetails.githubUrl) {
				throw new Error("Missing GitHub URL in MCP download response")
			}
			if (!mcpDetails.readmeContent) {
				throw new Error("Missing README content in MCP download response")
			}

			// Send details to webview
			await this.postMessageToWebview({
				type: "mcpDownloadDetails",
				mcpDownloadDetails: mcpDetails,
			})

			// Create task with context from README and added guidelines for MCP server installation
			const task = `Set up the MCP server from ${mcpDetails.githubUrl} while adhering to these MCP server installation rules:
- Start by loading the MCP documentation.
- Use "${mcpDetails.mcpId}" as the server name in hai_mcp_settings.json.
- Create the directory for the new MCP server before starting installation.
- Make sure you read the user's existing hai_mcp_settings.json file before editing it with this new mcp, to not overwrite any existing servers.
- Use commands aligned with the user's shell and operating system best practices.
- The following README may contain instructions that conflict with the user's OS, in which case proceed thoughtfully.
- Once installed, demonstrate the server's capabilities by using one of its tools.
Here is the project's README to help you get started:\n\n${mcpDetails.readmeContent}\n${mcpDetails.llmsInstallationContent}`

			// Initialize task and show chat view
			await this.initTask(task)
			await this.postMessageToWebview({
				type: "action",
				action: "chatButtonClicked",
			})
		} catch (error) {
			console.error("Failed to download MCP:", error)
			let errorMessage = "Failed to download MCP"

			if (axios.isAxiosError(error)) {
				if (error.code === "ECONNABORTED") {
					errorMessage = "Request timed out. Please try again."
				} else if (error.response?.status === 404) {
					errorMessage = "MCP server not found in marketplace."
				} else if (error.response?.status === 500) {
					errorMessage = "Internal server error. Please try again later."
				} else if (!error.response && error.request) {
					errorMessage = "Network error. Please check your internet connection."
				}
			} else if (error instanceof Error) {
				errorMessage = error.message
			}

			// Show error in both notification and marketplace UI
			vscode.window.showErrorMessage(errorMessage)
			await this.postMessageToWebview({
				type: "mcpDownloadDetails",
				error: errorMessage,
			})
		}
	}

	// OpenRouter

	async handleOpenRouterCallback(code: string) {
		let apiKey: string
		try {
			const response = await axios.post("https://openrouter.ai/api/v1/auth/keys", { code })
			if (response.data && response.data.key) {
				apiKey = response.data.key
			} else {
				throw new Error("Invalid response from OpenRouter API")
			}
		} catch (error) {
			console.error("Error exchanging code for API key:", error)
			throw error
		}

		const openrouter: ApiProvider = "openrouter"
		await customUpdateState(this.context, "apiProvider", openrouter)
		await customStoreSecret(this.context, "openRouterApiKey", this.workspaceId, apiKey)
		await this.postStateToWebview()
		if (this.task) {
			this.task.api = buildApiHandler({
				apiProvider: openrouter,
				openRouterApiKey: apiKey,
			})
		}
		// await this.postMessageToWebview({ type: "action", action: "settingsButtonClicked" }) // bad ux if user is on welcome
	}

	private async ensureCacheDirectoryExists(): Promise<string> {
		const cacheDir = path.join(this.context.globalStorageUri.fsPath, "cache")
		await fs.mkdir(cacheDir, { recursive: true })
		return cacheDir
	}

	async readOpenRouterModels(): Promise<Record<string, ModelInfo> | undefined> {
		const openRouterModelsFilePath = path.join(await this.ensureCacheDirectoryExists(), GlobalFileNames.openRouterModels)
		const fileExists = await fileExistsAtPath(openRouterModelsFilePath)
		if (fileExists) {
			const fileContents = await fs.readFile(openRouterModelsFilePath, "utf8")
			return JSON.parse(fileContents)
		}
		return undefined
	}

	async refreshRequestyModels() {
		const parsePrice = (price: any) => {
			if (price) {
				return parseFloat(price) * 1_000_000
			}
			return undefined
		}

		let models: Record<string, ModelInfo> = {}
		try {
			const apiKey = await customGetSecret(this.context, "requestyApiKey", this.workspaceId)
			const headers = {
				Authorization: `Bearer ${apiKey}`,
			}
			const response = await axios.get("https://router.requesty.ai/v1/models", { headers })
			if (response.data?.data) {
				for (const model of response.data.data) {
					const modelInfo: ModelInfo = {
						maxTokens: model.max_output_tokens || undefined,
						contextWindow: model.context_window,
						supportsImages: model.supports_vision || undefined,
						supportsPromptCache: model.supports_caching || undefined,
						inputPrice: parsePrice(model.input_price),
						outputPrice: parsePrice(model.output_price),
						cacheWritesPrice: parsePrice(model.caching_price),
						cacheReadsPrice: parsePrice(model.cached_price),
						description: model.description,
					}
					models[model.id] = modelInfo
				}
				console.log("Requesty models fetched", models)
			} else {
				console.error("Invalid response from Requesty API")
			}
		} catch (error) {
			console.error("Error fetching Requesty models:", error)
		}

		await this.postMessageToWebview({
			type: "requestyModels",
			requestyModels: models,
		})
		return models
	}

	// Context menus and code actions

	getFileMentionFromPath(filePath: string) {
		const cwd = vscode.workspace.workspaceFolders?.map((folder) => folder.uri.fsPath).at(0)
		if (!cwd) {
			return "@/" + filePath
		}
		const relativePath = path.relative(cwd, filePath)
		return "@/" + relativePath
	}

	// 'Add to Cline' context menu in editor and code action
	async addSelectedCodeToChat(code: string, filePath: string, languageId: string, diagnostics?: vscode.Diagnostic[]) {
		// Ensure the sidebar view is visible
		await vscode.commands.executeCommand("hai.SidebarProvider.focus")
		await setTimeoutPromise(100)

		// Post message to webview with the selected code
		const fileMention = this.getFileMentionFromPath(filePath)

		let input = `${fileMention}\n\`\`\`\n${code}\n\`\`\``
		if (diagnostics) {
			const problemsString = this.convertDiagnosticsToProblemsString(diagnostics)
			input += `\nProblems:\n${problemsString}`
		}

		await this.postMessageToWebview({
			type: "addToInput",
			text: input,
		})

		console.log("addSelectedCodeToChat", code, filePath, languageId)
	}

	// 'Add to Cline' context menu in Terminal
	async addSelectedTerminalOutputToChat(output: string, terminalName: string) {
		// Ensure the sidebar view is visible
		await vscode.commands.executeCommand("hai.SidebarProvider.focus")
		await setTimeoutPromise(100)

		// Post message to webview with the selected terminal output
		// await this.postMessageToWebview({
		//     type: "addSelectedTerminalOutput",
		//     output,
		//     terminalName
		// })

		await this.postMessageToWebview({
			type: "addToInput",
			text: `Terminal output:\n\`\`\`\n${output}\n\`\`\``,
		})

		console.log("addSelectedTerminalOutputToChat", output, terminalName)
	}

	// 'Fix with Cline' in code actions
	async fixWithCline(code: string, filePath: string, languageId: string, diagnostics: vscode.Diagnostic[]) {
		// Ensure the sidebar view is visible
		await vscode.commands.executeCommand("hai.SidebarProvider.focus")
		await setTimeoutPromise(100)

		const fileMention = this.getFileMentionFromPath(filePath)
		const problemsString = this.convertDiagnosticsToProblemsString(diagnostics)
		await this.initTask(`Fix the following code in ${fileMention}\n\`\`\`\n${code}\n\`\`\`\n\nProblems:\n${problemsString}`)

		console.log("fixWithHAI", code, filePath, languageId, diagnostics, problemsString)
	}

	convertDiagnosticsToProblemsString(diagnostics: vscode.Diagnostic[]) {
		let problemsString = ""
		for (const diagnostic of diagnostics) {
			let label: string
			switch (diagnostic.severity) {
				case vscode.DiagnosticSeverity.Error:
					label = "Error"
					break
				case vscode.DiagnosticSeverity.Warning:
					label = "Warning"
					break
				case vscode.DiagnosticSeverity.Information:
					label = "Information"
					break
				case vscode.DiagnosticSeverity.Hint:
					label = "Hint"
					break
				default:
					label = "Diagnostic"
			}
			const line = diagnostic.range.start.line + 1 // VSCode lines are 0-indexed
			const source = diagnostic.source ? `${diagnostic.source} ` : ""
			problemsString += `\n- [${source}${label}] Line ${line}: ${diagnostic.message}`
		}
		problemsString = problemsString.trim()
		return problemsString
	}

	// Task history

	async getTaskWithId(id: string): Promise<{
		historyItem: HistoryItem
		taskDirPath: string
		apiConversationHistoryFilePath: string
		uiMessagesFilePath: string
		contextHistoryFilePath: string
		taskMetadataFilePath: string
		apiConversationHistory: Anthropic.MessageParam[]
	}> {
		const history = ((await customGetState(this.context, "taskHistory")) as HistoryItem[] | undefined) || []
		const historyItem = history.find((item) => item.id === id)
		if (historyItem) {
			const taskDirPath = path.join(this.context.globalStorageUri.fsPath, "tasks", id)
			const apiConversationHistoryFilePath = path.join(taskDirPath, GlobalFileNames.apiConversationHistory)
			const uiMessagesFilePath = path.join(taskDirPath, GlobalFileNames.uiMessages)
			const contextHistoryFilePath = path.join(taskDirPath, GlobalFileNames.contextHistory)
			const taskMetadataFilePath = path.join(taskDirPath, GlobalFileNames.taskMetadata)
			const fileExists = await fileExistsAtPath(apiConversationHistoryFilePath)
			if (fileExists) {
				const apiConversationHistory = JSON.parse(await fs.readFile(apiConversationHistoryFilePath, "utf8"))
				return {
					historyItem,
					taskDirPath,
					apiConversationHistoryFilePath,
					uiMessagesFilePath,
					contextHistoryFilePath,
					taskMetadataFilePath,
					apiConversationHistory,
				}
			}
		}
		// if we tried to get a task that doesn't exist, remove it from state
		// FIXME: this seems to happen sometimes when the json file doesn't save to disk for some reason
		await this.deleteTaskFromState(id)
		throw new Error("Task not found")
	}

	async showTaskWithId(id: string) {
		if (id !== this.task?.taskId) {
			// non-current task
			const { historyItem } = await this.getTaskWithId(id)
			await this.initTask(undefined, undefined, historyItem) // clears existing task
		}
		await this.postMessageToWebview({
			type: "action",
			action: "chatButtonClicked",
		})
	}

	async exportTaskWithId(id: string) {
		const { historyItem, apiConversationHistory } = await this.getTaskWithId(id)
		await downloadTask(historyItem.ts, apiConversationHistory)
	}

	async deleteAllTaskHistory() {
		await this.clearTask()
		await customUpdateState(this.context, "taskHistory", undefined)
		try {
			// Remove all contents of tasks directory
			const taskDirPath = path.join(this.context.globalStorageUri.fsPath, "tasks")
			if (await fileExistsAtPath(taskDirPath)) {
				await fs.rm(taskDirPath, { recursive: true, force: true })
			}
			// Remove checkpoints directory contents
			const checkpointsDirPath = path.join(this.context.globalStorageUri.fsPath, "checkpoints")
			if (await fileExistsAtPath(checkpointsDirPath)) {
				await fs.rm(checkpointsDirPath, { recursive: true, force: true })
			}
		} catch (error) {
			vscode.window.showErrorMessage(
				`Encountered error while deleting task history, there may be some files left behind. Error: ${error instanceof Error ? error.message : String(error)}`,
			)
		}
		// await this.postStateToWebview()
	}

	async deleteNonFavoriteTaskHistory() {
		await this.clearTask()

		const taskHistory = ((await customGetState(this.context, "taskHistory")) as HistoryItem[]) || []
		const favoritedTasks = taskHistory.filter((task) => task.isFavorited === true)

		// If user has no favorited tasks, show a warning message
		if (favoritedTasks.length === 0) {
			vscode.window.showWarningMessage("No favorited tasks found. Please favorite tasks before using this option.")
			await this.postStateToWebview()
			return
		}

		await customUpdateState(this.context, "taskHistory", favoritedTasks)

		// Delete non-favorited task directories
		try {
			const preserveTaskIds = favoritedTasks.map((task) => task.id)
			const taskDirPath = path.join(this.context.globalStorageUri.fsPath, "tasks")

			if (await fileExistsAtPath(taskDirPath)) {
				const taskDirs = await fs.readdir(taskDirPath)
				for (const taskDir of taskDirs) {
					if (!preserveTaskIds.includes(taskDir)) {
						await fs.rm(path.join(taskDirPath, taskDir), { recursive: true, force: true })
					}
				}
			}
		} catch (error) {
			vscode.window.showErrorMessage(
				`Error deleting task history: ${error instanceof Error ? error.message : String(error)}`,
			)
		}

		await this.postStateToWebview()
	}

	async refreshTotalTasksSize() {
		getTotalTasksSize(this.context.globalStorageUri.fsPath)
			.then((newTotalSize) => {
				this.postMessageToWebview({
					type: "totalTasksSize",
					totalTasksSize: newTotalSize,
				})
			})
			.catch((error) => {
				console.error("Error calculating total tasks size:", error)
			})
	}

	async deleteTaskWithId(id: string) {
		console.info("deleteTaskWithId: ", id)

		try {
			if (id === this.task?.taskId) {
				await this.clearTask()
				console.debug("cleared task")
			}

			const {
				taskDirPath,
				apiConversationHistoryFilePath,
				uiMessagesFilePath,
				contextHistoryFilePath,
				taskMetadataFilePath,
			} = await this.getTaskWithId(id)
			const legacyMessagesFilePath = path.join(taskDirPath, "claude_messages.json")
			const updatedTaskHistory = await this.deleteTaskFromState(id)

			// Delete the task files
			for (const filePath of [
				apiConversationHistoryFilePath,
				uiMessagesFilePath,
				contextHistoryFilePath,
				taskMetadataFilePath,
				legacyMessagesFilePath,
			]) {
				const fileExists = await fileExistsAtPath(filePath)
				if (fileExists) {
					await fs.unlink(filePath)
				}
			}

			await fs.rmdir(taskDirPath) // succeeds if the dir is empty

			if (updatedTaskHistory.length === 0) {
				await this.deleteAllTaskHistory()
			}
		} catch (error) {
			console.debug(`Error deleting task:`, error)
		}

		this.refreshTotalTasksSize()
	}

	async deleteTaskFromState(id: string) {
		// Remove the task from history
		const taskHistory = ((await customGetState(this.context, "taskHistory")) as HistoryItem[] | undefined) || []
		const updatedTaskHistory = taskHistory.filter((task) => task.id !== id)
		await customUpdateState(this.context, "taskHistory", updatedTaskHistory)

		// Notify the webview that the task has been deleted
		await this.postStateToWebview()

		return updatedTaskHistory
	}

	async postStateToWebview() {
		const state = await this.getStateToPostToWebview()
		await sendStateUpdate(state)
	}

	async getStateToPostToWebview(): Promise<ExtensionState> {
		const {
			apiConfiguration,
			lastShownAnnouncementId,
			customInstructions,
			expertPrompt,
			isHaiRulesPresent,
			taskHistory,
			autoApprovalSettings,
			browserSettings,
			chatSettings,
			userInfo,
			buildContextOptions,
			buildIndexProgress,
			embeddingConfiguration,
			mcpMarketplaceEnabled,
			telemetrySetting,
			planActSeparateModelsSetting,
			globalClineRulesToggles,
			shellIntegrationTimeout,
		} = await getAllExtensionState(this.context, this.workspaceId)

		const localClineRulesToggles =
			((await getWorkspaceState(this.context, "localClineRulesToggles")) as ClineRulesToggles) || {}

		const localWindsurfRulesToggles =
			((await getWorkspaceState(this.context, "localWindsurfRulesToggles")) as ClineRulesToggles) || {}

		const localCursorRulesToggles =
			((await getWorkspaceState(this.context, "localCursorRulesToggles")) as ClineRulesToggles) || {}

		return {
			version: this.context.extension?.packageJSON?.version ?? "",
			apiConfiguration,
			customInstructions,
			expertPrompt,
			isHaiRulesPresent,
			uriScheme: vscode.env.uriScheme,
			currentTaskItem: this.task?.taskId ? (taskHistory || []).find((item) => item.id === this.task?.taskId) : undefined,
			checkpointTrackerErrorMessage: this.task?.checkpointTrackerErrorMessage,
			clineMessages: this.task?.clineMessages || [],
			taskHistory: (taskHistory || [])
				.filter((item) => item.ts && item.task)
				.sort((a, b) => b.ts - a.ts)
				.slice(0, 100), // for now we're only getting the latest 100 tasks, but a better solution here is to only pass in 3 for recent task history, and then get the full task history on demand when going to the task history view (maybe with pagination?)
			shouldShowAnnouncement: lastShownAnnouncementId !== this.latestAnnouncementId,
			buildContextOptions,
			buildIndexProgress,
			embeddingConfiguration,
			platform: process.platform as Platform,
			autoApprovalSettings,
			browserSettings,
			chatSettings,
			userInfo,
			mcpMarketplaceEnabled,
			telemetrySetting,
			planActSeparateModelsSetting,
			vscMachineId: vscode.env.machineId,
			vscodeWorkspacePath: this.vsCodeWorkSpaceFolderFsPath,
			globalClineRulesToggles: globalClineRulesToggles || {},
			localClineRulesToggles: localClineRulesToggles || {},
			localWindsurfRulesToggles: localWindsurfRulesToggles || {},
			localCursorRulesToggles: localCursorRulesToggles || {},
			shellIntegrationTimeout,
		}
	}

	async clearTask() {
		if (this.task) {
			await telemetryService.sendCollectedEvents(this.task.taskId)
		}
		this.task?.abortTask()
		this.task = undefined // removes reference to it, so once promises end it will be garbage collected
	}

	// Caching mechanism to keep track of webview messages + API conversation history per provider instance

	/*
	Now that we use retainContextWhenHidden, we don't have to store a cache of cline messages in the user's state, but we could to reduce memory footprint in long conversations.

	- We have to be careful of what state is shared between ClineProvider instances since there could be multiple instances of the extension running at once. For example when we cached cline messages using the same key, two instances of the extension could end up using the same key and overwriting each other's messages.
	- Some state does need to be shared between the instances, i.e. the API key--however there doesn't seem to be a good way to notify the other instances that the API key has changed.

	We need to use a unique identifier for each ClineProvider instance's message cache since we could be running several instances of the extension outside of just the sidebar i.e. in editor panels.

	// conversation history to send in API requests

	/*
	It seems that some API messages do not comply with vscode state requirements. Either the Anthropic library is manipulating these values somehow in the backend in a way that's creating cyclic references, or the API returns a function or a Symbol as part of the message content.
	VSCode docs about state: "The value must be JSON-stringifyable ... value — A value. MUST not contain cyclic references."
	For now we'll store the conversation history in memory, and if we need to store in state directly we'd need to do a manual conversion to ensure proper json stringification.
	*/

	// getApiConversationHistory(): Anthropic.MessageParam[] {
	// 	// const history = (await this.customGetState(
	// 	// 	this.getApiConversationHistoryStateKey()
	// 	// )) as Anthropic.MessageParam[]
	// 	// return history || []
	// 	return this.apiConversationHistory
	// }

	// setApiConversationHistory(history: Anthropic.MessageParam[] | undefined) {
	// 	// await this.customUpdateState(this.getApiConversationHistoryStateKey(), history)
	// 	this.apiConversationHistory = history || []
	// }

	// addMessageToApiConversationHistory(message: Anthropic.MessageParam): Anthropic.MessageParam[] {
	// 	// const history = await this.getApiConversationHistory()
	// 	// history.push(message)
	// 	// await this.setApiConversationHistory(history)
	// 	// return history
	// 	this.apiConversationHistory.push(message)
	// 	return this.apiConversationHistory
	// }

	async updateTaskHistory(item: HistoryItem): Promise<HistoryItem[]> {
		const history = ((await customGetState(this.context, "taskHistory")) as HistoryItem[]) || []
		const existingItemIndex = history.findIndex((h) => h.id === item.id)
		if (existingItemIndex !== -1) {
			history[existingItemIndex] = item
		} else {
			history.push(item)
		}
		await customUpdateState(this.context, "taskHistory", history)
		return history
	}

	// private async clearState() {
	// 	this.context.workspaceState.keys().forEach((key) => {
	// 		this.context.workspaceState.update(key, undefined)
	// 	})
	// 	this.context.globalState.keys().forEach((key) => {
	// 		this.context.globalState.update(key, undefined)
	// 	})
	// 	this.context.secrets.delete("apiKey")
	// }

	// secrets

	// Open Graph Data

	async fetchOpenGraphData(url: string) {
		try {
			// Use the fetchOpenGraphData function from link-preview.ts
			const ogData = await fetchOpenGraphData(url)

			// Send the data back to the webview
			await this.postMessageToWebview({
				type: "openGraphData",
				openGraphData: ogData,
				url: url,
			})
		} catch (error) {
			console.error(`Error fetching Open Graph data for ${url}:`, error)
			// Send an error response
			await this.postMessageToWebview({
				type: "openGraphData",
				error: `Failed to fetch Open Graph data: ${error}`,
				url: url,
			})
		}
	}

	// Git commit message generation

	async generateGitCommitMessage() {
		try {
			// Check if there's a workspace folder open
			const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
			if (!cwd) {
				vscode.window.showErrorMessage("No workspace folder open")
				return
			}

			// Get the git diff
			const gitDiff = await getWorkingState(cwd)
			if (gitDiff === "No changes in working directory") {
				vscode.window.showInformationMessage("No changes in workspace for commit message")
				return
			}

			// Show a progress notification
			await vscode.window.withProgress(
				{
					location: vscode.ProgressLocation.Notification,
					title: "Generating commit message...",
					cancellable: false,
				},
				async (progress, token) => {
					try {
						// Format the git diff into a prompt
						const prompt = `Based on the following git diff, generate a concise and descriptive commit message:

${gitDiff.length > 5000 ? gitDiff.substring(0, 5000) + "\n\n[Diff truncated due to size]" : gitDiff}

The commit message should:
1. Start with a short summary (50-72 characters)
2. Use the imperative mood (e.g., "Add feature" not "Added feature")
3. Describe what was changed and why
4. Be clear and descriptive

Commit message:`

						// Get the current API configuration
						const { apiConfiguration } = await getAllExtensionState(this.context, this.workspaceId)

						// Build the API handler
						const apiHandler = buildApiHandler(apiConfiguration)

						// Create a system prompt
						const systemPrompt =
							"You are a helpful assistant that generates concise and descriptive git commit messages based on git diffs."

						// Create a message for the API
						const messages = [
							{
								role: "user" as const,
								content: prompt,
							},
						]

						// Call the API directly
						const stream = apiHandler.createMessage(systemPrompt, messages)

						// Collect the response
						let response = ""
						for await (const chunk of stream) {
							if (chunk.type === "text") {
								response += chunk.text
							}
						}

						// Extract the commit message
						const commitMessage = extractCommitMessage(response)

						// Apply the commit message to the Git input box
						if (commitMessage) {
							// Get the Git extension API
							const gitExtension = vscode.extensions.getExtension("vscode.git")?.exports
							if (gitExtension) {
								const api = gitExtension.getAPI(1)
								if (api && api.repositories.length > 0) {
									const repo = api.repositories[0]
									repo.inputBox.value = commitMessage
									vscode.window.showInformationMessage("Commit message generated and applied")
								} else {
									vscode.window.showErrorMessage("No Git repositories found")
								}
							} else {
								vscode.window.showErrorMessage("Git extension not found")
							}
						} else {
							vscode.window.showErrorMessage("Failed to generate commit message")
						}
					} catch (innerError) {
						const innerErrorMessage = innerError instanceof Error ? innerError.message : String(innerError)
						vscode.window.showErrorMessage(`Failed to generate commit message: ${innerErrorMessage}`)
					}
				},
			)
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error)
			vscode.window.showErrorMessage(`Failed to generate commit message: ${errorMessage}`)
		}
	}

	// dev

	async resetState() {
		vscode.window.showInformationMessage("Resetting state...")
		if (!this.codeIndexAbortController.signal.aborted) {
			this.codeIndexAbortController.abort()
			this.isCodeIndexInProgress = false
		}
		await resetExtensionState(this.context, this.workspaceId)
		if (this.task) {
			this.task.abortTask()
			this.task = undefined
		}
		vscode.window.showInformationMessage("State reset")
		await this.postStateToWebview()
		await this.postMessageToWebview({
			type: "action",
			action: "chatButtonClicked",
		})
	}

	// HAI functions

	async codeIndexBackground(filePaths?: string[], reIndex: boolean = false, isManualTrigger: boolean = false) {
		if (!this.isSideBar || this.codeIndexAbortController.signal.aborted || this.isCodeIndexInProgress) {
			return
		}

		await ensureFaissPlatformDeps()
		const state = (await customGetState(this.context, "buildIndexProgress")) as HaiBuildIndexProgress | undefined
		const updateProgressState = async (data: Partial<HaiBuildIndexProgress>) => {
			const state = (await customGetState(this.context, "buildIndexProgress")) as HaiBuildIndexProgress | undefined
			const stateVal = Object.assign(state ?? {}, {
				...(data.type === "codeContext" && data.isInProgress === false && data.progress === 100
					? {
							isCodeContextEverCompleted: true,
						}
					: data.type === "codeIndex" && data.isInProgress === false && data.progress === 100
						? {
								isCodeIndexEverCompleted: true,
							}
						: {}),
				...(data.type === "codeIndex" && data.isInProgress === false && data.progress === 100
					? { ts: getFormattedDateTime() }
					: {}),
				...data,
			})
			if (!this.codeIndexAbortController.signal.aborted || data.isInProgress === false) {
				await customUpdateState(this.context, "buildIndexProgress", stateVal)
				await this.postStateToWebview()
			}
		}
		const getProgress = (progress: number, useIndex: boolean, useContext: boolean, type: "codeIndex" | "codeContext") => {
			if (type === "codeContext") {
				return progress / 2
			} else if (type === "codeIndex") {
				return progress / 2 + (useContext ? 50 : 0)
			}
			return progress
		}
		const { apiConfiguration, buildContextOptions, embeddingConfiguration, buildIndexProgress } = await getAllExtensionState(
			this.context,
			this.workspaceId,
		)
		const isValidApiConfiguration = validateApiConfiguration(apiConfiguration) === undefined
		const isValidEmbeddingConfiguration = validateEmbeddingConfiguration(embeddingConfiguration) === undefined

		if (isValidApiConfiguration && isValidEmbeddingConfiguration) {
			try {
				if (!this.vsCodeWorkSpaceFolderFsPath) {
					return
				}
				if (buildContextOptions.useIndex) {
					if (!isManualTrigger && (!buildIndexProgress || !buildIndexProgress.progress)) {
						const userConfirmation = await vscode.window.showWarningMessage(
							"hAI performs best with a code index. Would you like to navigate to Settings to start indexing for this workspace?",
							"Open Settings",
							"No",
						)
						if (userConfirmation === undefined) {
							return
						}
						if (userConfirmation === "No") {
							buildContextOptions.useIndex = false
							this.customWebViewMessageHandlers({
								type: "buildContextOptions",
								buildContextOptions: buildContextOptions,
							})
							return
						}
						if (userConfirmation === "Open Settings") {
							await this.postMessageToWebview({ type: "action", action: "settingsButtonClicked" })
							return
						}
					}

					// Setting a flag to prevent multiple code index background tasks.
					this.isCodeIndexInProgress = true

					await vscode.window.withProgress(
						{
							cancellable: false,
							title: CodeIndexStartMessage,
							location: vscode.ProgressLocation.Window,
						},
						async (progressCtx, token) => {
							let lastIncrement = 0
							if (buildContextOptions.useContext) {
								if (this.codeIndexAbortController.signal.aborted) {
									return
								}

								console.log(`codeContextAgentProgress...`)
								// CodeContext
								const codeContextAgent = new CodeContextAdditionAgent()
									.withSource(this.vsCodeWorkSpaceFolderFsPath)
									.withLLMApiConfig(apiConfiguration)
									.withBuildContextOptions(buildContextOptions)
									.build()
								this.codeIndexAbortController.signal.addEventListener("abort", async () => {
									codeContextAgent.stop()
									await updateProgressState({
										type: "codeContext",
										isInProgress: false,
									})
									this.isCodeIndexInProgress = false
								})
								codeContextAgent.on("progress", async (progress: ICodeIndexProgress) => {
									this.outputChannel.appendLine(`codeContextAgentProgress ${progress.type} ${progress.value}%`)
									console.log(`codeContextAgentProgress ${JSON.stringify(progress, null, 2)}`)
									// If user cancels the operation from notification, we need to cancel the operation
									if (token.isCancellationRequested) {
										codeContextAgent.stop()
										await updateProgressState({
											type: "codeContext",
											isInProgress: false,
										})
										return
									}
									// If user cancels the operation from settings, we need to cancel the operation
									if (this.codeIndexAbortController.signal.aborted) {
										codeContextAgent.stop()
										await updateProgressState({
											type: "codeContext",
											isInProgress: false,
										})
										return
									}
									// Continue to update the progress
									if (
										progress.type === "progress" &&
										progress.value &&
										!this.codeIndexAbortController.signal.aborted
									) {
										const p = getProgress(
											progress.value,
											buildContextOptions.useIndex,
											buildContextOptions.useContext,
											"codeContext",
										)
										const increment = p - lastIncrement
										lastIncrement += increment
										progressCtx.report({ increment, message: `${lastIncrement}%` })
										await updateProgressState({
											progress: p,
											type: "codeContext",
											isInProgress: true,
										})
									}
								})
								codeContextAgent.on("error", async (error: { message: string; error: any }) => {
									console.error("Error during code context:", error.message, error.error)
									vscode.window.showErrorMessage(`Code context failed: ${error.message}`)

									this.codeIndexAbortController.abort()
									this.isCodeIndexInProgress = false
								})
								await codeContextAgent.start(filePaths, reIndex)
								if (!this.codeIndexAbortController.signal.aborted) {
									await updateProgressState({
										type: "codeContext",
										isInProgress: false,
									})
								}
							}
							if (this.codeIndexAbortController.signal.aborted) {
								return
							}

							// TODO: ISSUE: Assuming faiss node takes time to load/initialize.So adding a delay as a temporary fix until we find a root cause.
							await setTimeoutPromise(500)

							const vectorizeCodeAgent = new VectorizeCodeAgent(
								this.vsCodeWorkSpaceFolderFsPath,
								embeddingConfiguration,
								buildContextOptions,
							)
							console.log("vectorizeCodeAgentProgress.......")
							this.codeIndexAbortController.signal.addEventListener("abort", async () => {
								vectorizeCodeAgent.stop()
								await updateProgressState({
									type: "codeIndex",
									isInProgress: false,
								})
								this.isCodeIndexInProgress = false
							})
							vectorizeCodeAgent.on("progress", async (progress: ICodeIndexProgress) => {
								this.outputChannel.appendLine(`vectorizeCodeAgentProgress: ${progress.type} ${progress.value}%`)
								console.log(`vectorizeCodeAgentProgress ${JSON.stringify(progress, null, 2)}`)
								// If user cancels the operation from notification, we need to cancel the operation
								if (token.isCancellationRequested) {
									vectorizeCodeAgent.stop()
									await updateProgressState({
										type: "codeIndex",
										isInProgress: false,
									})
									return
								}
								// If user cancels the operation from settings, we need to cancel the operation
								if (this.codeIndexAbortController.signal.aborted) {
									vectorizeCodeAgent.stop()
									await updateProgressState({
										type: "codeIndex",
										isInProgress: false,
									})
									return
								}
								if (
									progress.type === "progress" &&
									progress.value &&
									!this.codeIndexAbortController.signal.aborted
								) {
									const p = getProgress(
										progress.value,
										buildContextOptions.useIndex,
										buildContextOptions.useContext,
										"codeIndex",
									)
									const increment = p - lastIncrement
									lastIncrement += increment
									progressCtx.report({ increment, message: `${lastIncrement}%` })
									await updateProgressState({
										progress: p,
										type: "codeIndex",
										isInProgress: true,
									})
								}
							})
							vectorizeCodeAgent.on("error", async (error: { message: string; error: any }) => {
								console.error("Error during indexing:", error.message, error.error)
								vscode.window.showErrorMessage(`Indexing failed: ${error.message}`)
								this.codeIndexAbortController.abort()
								this.isCodeIndexInProgress = false
							})
							await vectorizeCodeAgent.start(filePaths)
							if (!this.codeIndexAbortController.signal.aborted) {
								progressCtx.report({ increment: 100, message: "Done!" })
								await updateProgressState({
									progress: 100,
									type: "codeIndex",
									isInProgress: false,
								})
							}

							// Resetting the flag after the entire process is complete.
							this.isCodeIndexInProgress = false
						},
					)
				}
			} catch (error) {
				console.error("codeIndexBackground", "Error listing files in workspace:", error)
				vscode.window.showErrorMessage(CodeContextErrorMessage)
				this.isCodeIndexInProgress = false
			}
		}
	}

	async invokeReindex(filePaths: string[], operation: FileOperations) {
		switch (operation) {
			case FileOperations.Create:
				console.log(`HaiFileSystemWatcher File Created`)
				await this.codeIndexBackground(filePaths, true)
				break
			case FileOperations.Delete:
				console.log(`HaiFileSystemWatcher File Deleted`)
				await deleteFromContextDirectory(filePaths, this.vsCodeWorkSpaceFolderFsPath)
				break
			case FileOperations.Change:
				console.log(`HaiFileSystemWatcher File Changed`)
				await this.codeIndexBackground(filePaths, true)
				break
			default:
				console.log(`${operation} revectorize`)
		}
	}

	async readHaiTaskList(url: string): Promise<IHaiStory[]> {
		try {
			const fs = require("fs")
			const path = require("path")
			let haiTaskList: IHaiStory[] = []
			const files = fs.readdirSync(`${url}/PRD`)
			files
				.filter((file: string) => file.match(/\-feature.json$/))
				.forEach((file: string) => {
					const content = fs.readFileSync(path.join(`${url}/PRD`, file), "utf-8")
					const prdId = file.split("-")[0].replace("PRD", "")
					const parsedFeaturesList = JSON.parse(content).features
					const featuresListWithPrdId = parsedFeaturesList.map((feature: any) => ({
						...feature,
						prdId: prdId,
					}))
					haiTaskList = [...haiTaskList, ...featuresListWithPrdId]
				})
			return haiTaskList
		} catch (e) {
			console.error("Error reading hai task list", e)
		}
		return []
	}

	fetchTaskFromSelectedFolder(path: string, ts: string) {
		this.readHaiTaskList(path).then((res: IHaiStory[]) => {
			// this.haiTaskList = res
			if (res.length === 0) {
				vscode.window.showInformationMessage("No tasks found in the selected folder")
			}
			this.postMessageToWebview({
				type: "haiTaskData",
				haiTaskData: { tasks: res, folder: path, ts },
			}).then()
		})
	}

	chooseHaiProject(path?: string) {
		if (!path) {
			const options: vscode.OpenDialogOptions = {
				canSelectMany: false,
				openLabel: "Open",
				canSelectFiles: false,
				canSelectFolders: true,
			}

			vscode.window.showOpenDialog(options).then((fileUri) => {
				if (fileUri && fileUri[0]) {
					console.log("Selected file: " + fileUri[0].fsPath)

					const ts = getFormattedDateTime()
					this.fetchTaskFromSelectedFolder(fileUri[0].fsPath, ts)
					updateWorkspaceState(this.context, "haiConfig", { folder: fileUri[0].fsPath, ts })
				}
			})
		} else {
			const ts = getFormattedDateTime()
			this.fetchTaskFromSelectedFolder(path, ts)
			updateWorkspaceState(this.context, "haiConfig", { folder: path, ts })
		}
	}

	async customWebViewMessageHandlers(message: WebviewMessage) {
		switch (message.type) {
			case "onHaiConfigure":
				console.log("onHaiConfigure")
				this.chooseHaiProject()
				break
			case "buildContextOptions":
				await customUpdateState(this.context, "buildContextOptions", message.buildContextOptions ?? undefined)
				if (this.task) {
					this.task.buildContextOptions = message.buildContextOptions
				}
				await this.postStateToWebview()
				break
		}
	}

	async updateHaiRulesState(postToWebview: boolean = false) {
		const workspaceFolder = getWorkspacePath()
		if (!workspaceFolder) {
			return
		}
		const haiRulesPath = path.join(workspaceFolder, GlobalFileNames.clineRules)
		const isHaiRulePresent = await fileExistsAtPath(haiRulesPath)

		await customUpdateState(this.context, "isHaiRulesPresent", isHaiRulePresent)

		if (postToWebview) {
			await this.postStateToWebview()
		}
	}

	async updateExpertPrompt(prompt?: string, expertName?: string) {
		let additionalContext = ""

		if (expertName) {
			additionalContext = await this.getExpertDocumentsContent(expertName)
		}

		const updatedPrompt = prompt ? `${prompt}${additionalContext}` : additionalContext

		await customUpdateState(this.context, "expertPrompt", updatedPrompt || undefined)

		if (this.task) {
			this.task.expertPrompt = updatedPrompt || undefined
		}

		await this.postStateToWebview()
	}

	async resetIndex() {
		await customUpdateState(this.context, "buildIndexProgress", {
			progress: 0,
			type: "codeIndex",
			isInProgress: false,
		})
		await this.postStateToWebview()
	}

	async loadExperts() {
		const experts = await this.expertManager.readExperts(this.vsCodeWorkSpaceFolderFsPath)
		await this.postMessageToWebview({
			type: "expertsUpdated",
			experts,
		})
	}

	async loadDefaultExperts() {
		const experts = await this.expertManager.loadDefaultExperts()
		await this.postMessageToWebview({
			type: "defaultExpertsLoaded",
			experts,
		})
	}

	private async getExpertDocumentsContent(expertName: string): Promise<string> {
		const expertPath = await this.expertManager.getExpertPromptPath(this.vsCodeWorkSpaceFolderFsPath, expertName)

		if (!expertPath) {
			return ""
		}

		const docsDir = path.join(path.dirname(expertPath), ExpertManager.DOCS_DIR)
		const statusFilePath = path.join(docsDir, ExpertManager.STATUS_FILE)

		if (!(await fileExistsAtPath(statusFilePath))) {
			return ""
		}

		const statusData = JSON.parse(await fs.readFile(statusFilePath, "utf-8"))
		let additionalContext = ""
		let documentCounter = 1
		for (const document of statusData) {
			if (document.status === "completed" && document.filename) {
				const docFilePath = path.join(docsDir, document.filename)
				if (await fileExistsAtPath(docFilePath)) {
					const docContent = await fs.readFile(docFilePath, "utf-8")
					additionalContext += `\n\n### Document-${documentCounter} Reference\n${docContent}`
					documentCounter++
				}
			}
		}

		return additionalContext
	}
}
