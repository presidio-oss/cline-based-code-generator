import { Anthropic } from "@anthropic-ai/sdk"
import axios from "axios"
import crypto from "crypto"
import { execa } from "execa"
import fs from "fs/promises"
import os from "os"
import pWaitFor from "p-wait-for"
import * as path from "path"
import * as vscode from "vscode"
import { buildApiHandler } from "../../api"
import { downloadTask } from "../../integrations/misc/export-markdown"
import { openFile, openImage } from "../../integrations/misc/open-file"
import { fetchOpenGraphData, isImageUrl } from "../../integrations/misc/link-preview"
import { selectImages } from "../../integrations/misc/process-images"
import { getTheme } from "../../integrations/theme/getTheme"
import WorkspaceTracker from "../../integrations/workspace/WorkspaceTracker"
import { ClineAccountService } from "../../services/account/ClineAccountService"
import { McpHub } from "../../services/mcp/McpHub"
import { UserInfo } from "../../shared/UserInfo"
import { ApiConfiguration, ApiProvider, ModelInfo } from "../../shared/api"
import { findLast } from "../../shared/array"
import { AutoApprovalSettings, DEFAULT_AUTO_APPROVAL_SETTINGS } from "../../shared/AutoApprovalSettings"
import { BrowserSettings, DEFAULT_BROWSER_SETTINGS } from "../../shared/BrowserSettings"
import { ChatContent } from "../../shared/ChatContent"
import { ChatSettings, DEFAULT_CHAT_SETTINGS } from "../../shared/ChatSettings"
import { ExtensionMessage, ExtensionState, Invoke, Platform } from "../../shared/ExtensionMessage"
import { HistoryItem } from "../../shared/HistoryItem"
import { McpDownloadResponse, McpMarketplaceCatalog, McpServer } from "../../shared/mcp"
import { ClineCheckpointRestore, WebviewMessage } from "../../shared/WebviewMessage"
import { fileExistsAtPath } from "../../utils/fs"
import { searchCommits } from "../../utils/git"
import { Cline } from "../Cline"
import { openMention } from "../mentions"
import { getNonce } from "./getNonce"
import { getUri } from "./getUri"
import { HaiBuildContextOptions, HaiBuildIndexProgress } from "../../shared/customApi"
import { IHaiStory } from "../../../webview-ui/src/interfaces/hai-task.interface"
import { CodeContextAdditionAgent } from "../../integrations/code-prep/CodeContextAddition"
import { VectorizeCodeAgent } from "../../integrations/code-prep/VectorizeCodeAgent"
import { CodeContextErrorMessage, CodeIndexStartMessage } from "./customClientProvider"
import { ICodeIndexProgress } from "../../integrations/code-prep/type"
import { validateApiConfiguration, validateEmbeddingConfiguration } from "../../shared/validate"
import { getFormattedDateTime } from "../../utils/date"
import { EmbeddingConfiguration, EmbeddingProvider } from "../../shared/embeddings"
import { ensureFaissPlatformDeps } from "../../utils/faiss"
import { FileOperations } from "../../utils/constants"
import HaiFileSystemWatcher from "../../integrations/workspace/HaiFileSystemWatcher"
import { deleteFromContextDirectory } from "../../utils/delete-helper"
import { HaiBuildDefaults } from "../../shared/haiDefaults"
import { buildEmbeddingHandler } from "../../embedding"
import { Logger } from "../../services/logging/Logger"
import { telemetryService } from "../../services/telemetry/TelemetryService"
import { TelemetrySetting } from "../../shared/TelemetrySetting"
import { cleanupLegacyCheckpoints } from "../../integrations/checkpoints/CheckpointMigration"
import CheckpointTracker from "../../integrations/checkpoints/CheckpointTracker"
import { getTotalTasksSize } from "../../utils/storage"
import { ConversationTelemetryService } from "../../services/telemetry/ConversationTelemetryService"
import { GlobalFileNames } from "../../global-constants"
import { setTimeout as setTimeoutPromise } from "node:timers/promises"

/*
https://github.com/microsoft/vscode-webview-ui-toolkit-samples/blob/main/default/weather-webview/src/providers/WeatherViewProvider.ts

https://github.com/KumarVariable/vscode-extension-sidebar-html/blob/master/src/customSidebarViewProvider.ts
*/

type SecretKey =
	| "apiKey"
	| "clineApiKey"
	| "openRouterApiKey"
	| "awsAccessKey"
	| "awsSecretKey"
	| "awsSessionToken"
	| "openAiApiKey"
	| "geminiApiKey"
	| "openAiNativeApiKey"
	// Embedding specific keys
	| "embeddingAwsAccessKey"
	| "embeddingAwsSecretKey"
	| "embeddingAwsSessionToken"
	| "embeddingOpenAiApiKey"
	| "embeddingOpenAiNativeApiKey"
	| "embeddingAzureOpenAIApiKey"
	| "deepSeekApiKey"
	| "requestyApiKey"
	| "togetherApiKey"
	| "qwenApiKey"
	| "mistralApiKey"
	| "liteLlmApiKey"
	| "authNonce"
	| "asksageApiKey"
	| "xaiApiKey"
	| "sambanovaApiKey"
type GlobalStateKey =
	| "apiProvider"
	| "apiModelId"
	| "awsRegion"
	| "awsUseCrossRegionInference"
	| "awsBedrockUsePromptCache"
	| "awsBedrockEndpoint"
	| "awsProfile"
	| "awsUseProfile"
	| "vertexProjectId"
	| "vertexRegion"
	| "lastShownAnnouncementId"
	| "customInstructions"
	| "taskHistory"
	| "openAiBaseUrl"
	| "openAiModelId"
	| "openAiModelInfo"
	| "ollamaModelId"
	| "ollamaBaseUrl"
	| "ollamaApiOptionsCtxNum"
	| "lmStudioModelId"
	| "lmStudioBaseUrl"
	| "anthropicBaseUrl"
	| "azureApiVersion"
	| "openRouterModelId"
	| "openRouterModelInfo"
	| "openRouterProviderSorting"
	// Embedding specific keys
	| "embeddingProvider"
	| "embeddingModelId"
	| "embeddingAwsRegion"
	| "embeddingOpenAiBaseUrl"
	| "embeddingOpenAiModelId"
	| "autoApprovalSettings"
	| "browserSettings"
	| "chatSettings"
	| "vsCodeLmModelSelector"
	| "userInfo"
	| "previousModeApiProvider"
	| "previousModeModelId"
	| "previousModeThinkingBudgetTokens"
	| "previousModeVsCodeLmModelSelector"
	| "previousModeModelInfo"
	| "liteLlmBaseUrl"
	| "liteLlmModelId"
	| "qwenApiLine"
	| "requestyModelId"
	| "togetherModelId"
	| "mcpMarketplaceCatalog"
	| "telemetrySetting"
	| "asksageApiUrl"
	| "thinkingBudgetTokens"
	| "planActSeparateModelsSetting"

export function getWorkspaceId(): string | undefined {
	const workspaceFolders = vscode.workspace.workspaceFolders
	if (!workspaceFolders || workspaceFolders.length === 0) {
		return undefined
	}
	// Use the URI of the first workspace folder as a stable identifier
	return workspaceFolders[0].uri.toString()
}

export class ClineProvider implements vscode.WebviewViewProvider {
	public static readonly sideBarId = "hai.SidebarProvider" // used in package.json as the view's id. This value cannot be changed due to how vscode caches views based on their id, and updating the id would break existing instances of the extension.
	public static readonly tabPanelId = "hai.TabPanelProvider"
	private static activeInstances: Set<ClineProvider> = new Set()
	private disposables: vscode.Disposable[] = []
	private view?: vscode.WebviewView | vscode.WebviewPanel
	private cline?: Cline
	workspaceTracker?: WorkspaceTracker
	mcpHub?: McpHub
	accountService?: ClineAccountService
	private latestAnnouncementId = "march-22-2025" // update to some unique identifier when we add a new announcement
	conversationTelemetryService: ConversationTelemetryService

	private workspaceId = getWorkspaceId()

	haiTaskList: string = ""
	private vsCodeWorkSpaceFolderFsPath!: string

	private codeIndexAbortController: AbortController
	private isSideBar: boolean
	fileSystemWatcher: HaiFileSystemWatcher | undefined
	private isCodeIndexInProgress: boolean = false

	constructor(
		readonly context: vscode.ExtensionContext,
		private readonly outputChannel: vscode.OutputChannel,
		isSideBar: boolean = true,
	) {
		this.outputChannel.appendLine("ClineProvider instantiated")
		ClineProvider.activeInstances.add(this)
		this.workspaceTracker = new WorkspaceTracker(this)
		this.mcpHub = new McpHub(this)
		this.accountService = new ClineAccountService(this)
		this.conversationTelemetryService = new ConversationTelemetryService(this)

		// Clean up legacy checkpoints
		cleanupLegacyCheckpoints(this.context.globalStorageUri.fsPath, this.outputChannel).catch((error) => {
			console.error("Failed to cleanup legacy checkpoints:", error)
		})

		this.codeIndexAbortController = new AbortController()
		this.isSideBar = isSideBar
		this.vsCodeWorkSpaceFolderFsPath = (this.getWorkspacePath() || "").trim()
		if (this.vsCodeWorkSpaceFolderFsPath) {
			this.fileSystemWatcher = new HaiFileSystemWatcher(this, this.vsCodeWorkSpaceFolderFsPath)
			this.codeIndexBackground()
		}
	}

	private getWorkspacePath() {
		const workspaceFolders = vscode.workspace.workspaceFolders
		if (!workspaceFolders || workspaceFolders.length === 0) {
			return
		}
		const workspaceFolder = workspaceFolders[0]
		return workspaceFolder.uri.fsPath
	}

	private isCustomGlobalKey(key: string): boolean {
		const customGlobalKeys = [
			"apiProvider",
			"apiModelId",
			"awsRegion",
			"awsUseCrossRegionInference",
			"vertexProjectId",
			"vertexRegion",
			"openAiBaseUrl",
			"openAiModelId",
			"ollamaModelId",
			"ollamaBaseUrl",
			"lmStudioModelId",
			"lmStudioBaseUrl",
			"anthropicBaseUrl",
			"azureApiVersion",
			"openRouterModelId",
			"openRouterModelInfo",
			"embeddingProvider",
			"embeddingModelId",
			"embeddingAwsRegion",
			"embeddingOpenAiBaseUrl",
			"embeddingOpenAiModelId",
			"embeddingAzureOpenAIApiInstanceName",
			"embeddingAzureOpenAIApiEmbeddingsDeploymentName",
			"embeddingAzureOpenAIApiVersion",
			"embeddingOllamaBaseUrl",
			"embeddingOllamaModelId",
		]
		return customGlobalKeys.includes(key)
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

	async codeIndexBackground(filePaths?: string[], reIndex: boolean = false, isManualTrigger: boolean = false) {
		if (!this.isSideBar || this.codeIndexAbortController.signal.aborted || this.isCodeIndexInProgress) {
			return
		}

		await ensureFaissPlatformDeps()
		const state = (await this.customGetState("buildIndexProgress")) as HaiBuildIndexProgress | undefined
		const updateProgressState = async (data: Partial<HaiBuildIndexProgress>) => {
			const state = (await this.customGetState("buildIndexProgress")) as HaiBuildIndexProgress | undefined
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
				await this.customUpdateState("buildIndexProgress", stateVal)
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
		const { apiConfiguration, buildContextOptions, embeddingConfiguration, buildIndexProgress } = await this.getState()
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

	async resetIndex() {
		await this.customUpdateState("buildIndexProgress", {
			progress: 0,
			type: "codeIndex",
			isInProgress: false,
		})
		await this.postStateToWebview()
	}
	/*
	VSCode extensions use the disposable pattern to clean up resources when the sidebar/editor tab is closed by the user or system. This applies to event listening, commands, interacting with the UI, etc.
	- https://vscode-docs.readthedocs.io/en/stable/extensions/patterns-and-principles/
	- https://github.com/microsoft/vscode-extension-samples/blob/main/webview-sample/src/extension.ts
	*/
	async dispose() {
		this.outputChannel.appendLine("Disposing ClineProvider...")
		await this.clearTask()
		this.outputChannel.appendLine("Cleared task")
		if (this.view && "dispose" in this.view) {
			this.view.dispose()
			this.outputChannel.appendLine("Disposed webview")
		}
		while (this.disposables.length) {
			const x = this.disposables.pop()
			if (x) {
				x.dispose()
			}
		}
		this.workspaceTracker?.dispose()
		this.workspaceTracker = undefined
		this.mcpHub?.dispose()
		this.mcpHub = undefined
		this.fileSystemWatcher?.dispose()
		this.accountService = undefined
		this.conversationTelemetryService.shutdown()
		this.outputChannel.appendLine("Disposed all disposables")
		ClineProvider.activeInstances.delete(this)
	}

	// Auth methods
	async handleSignOut() {
		try {
			await this.customStoreSecret("clineApiKey", undefined)
			await this.customUpdateState("apiProvider", "openrouter")
			await this.postStateToWebview()
			vscode.window.showInformationMessage("Successfully logged out of HAI")
		} catch (error) {
			vscode.window.showErrorMessage("Logout failed")
		}
	}

	async setUserInfo(info?: { displayName: string | null; email: string | null; photoURL: string | null }) {
		await this.customUpdateState("userInfo", info)
	}

	public static getVisibleInstance(): ClineProvider | undefined {
		return findLast(Array.from(this.activeInstances), (instance) => instance.view?.visible === true)
	}

	async resolveWebviewView(webviewView: vscode.WebviewView | vscode.WebviewPanel) {
		this.outputChannel.appendLine("Resolving webview view")
		this.view = webviewView

		webviewView.webview.options = {
			// Allow scripts in the webview
			enableScripts: true,
			localResourceRoots: [this.context.extensionUri],
		}

		webviewView.webview.html =
			this.context.extensionMode === vscode.ExtensionMode.Development
				? await this.getHMRHtmlContent(webviewView.webview)
				: this.getHtmlContent(webviewView.webview)

		// Sets up an event listener to listen for messages passed from the webview view context
		// and executes code based on the message that is received
		this.setWebviewMessageListener(webviewView.webview)

		// Logs show up in bottom panel > Debug Console
		//console.log("registering listener")

		// Listen for when the panel becomes visible
		// https://github.com/microsoft/vscode-discussions/discussions/840
		if ("onDidChangeViewState" in webviewView) {
			// WebviewView and WebviewPanel have all the same properties except for this visibility listener
			// panel
			webviewView.onDidChangeViewState(
				() => {
					if (this.view?.visible) {
						this.postMessageToWebview({
							type: "action",
							action: "didBecomeVisible",
						})
					}
				},
				null,
				this.disposables,
			)
		} else if ("onDidChangeVisibility" in webviewView) {
			// sidebar
			webviewView.onDidChangeVisibility(
				() => {
					if (this.view?.visible) {
						this.postMessageToWebview({
							type: "action",
							action: "didBecomeVisible",
						})
					}
				},
				null,
				this.disposables,
			)
		}

		// Listen for when the view is disposed
		// This happens when the user closes the view or when the view is closed programmatically
		webviewView.onDidDispose(
			async () => {
				await this.dispose()
			},
			null,
			this.disposables,
		)

		// Listen for configuration changes
		vscode.workspace.onDidChangeConfiguration(
			async (e) => {
				if (e && e.affectsConfiguration("workbench.colorTheme")) {
					// Sends latest theme name to webview
					await this.postMessageToWebview({
						type: "theme",
						text: JSON.stringify(await getTheme()),
					})
				}
				if (e && e.affectsConfiguration("hai.mcpMarketplace.enabled")) {
					// Update state when marketplace tab setting changes
					await this.postStateToWebview()
				}
			},
			null,
			this.disposables,
		)

		// if the extension is starting a new session, clear previous task state
		this.clearTask()

		this.outputChannel.appendLine("Webview view resolved")
	}

	async initClineWithTask(task?: string, images?: string[]) {
		await this.clearTask() // ensures that an exising task doesn't exist before starting a new one, although this shouldn't be possible since user must clear task before starting a new one
		const {
			apiConfiguration,
			embeddingConfiguration,
			customInstructions,
			buildContextOptions,
			autoApprovalSettings,
			browserSettings,
			chatSettings,
		} = await this.getState()
		this.cline = new Cline(
			this,
			apiConfiguration,
			autoApprovalSettings,
			browserSettings,
			chatSettings,
			embeddingConfiguration,
			customInstructions,
			task,
			images,
			undefined,
		)
		this.cline.buildContextOptions = buildContextOptions
	}

	async initClineWithHistoryItem(historyItem: HistoryItem) {
		await this.clearTask()
		const {
			apiConfiguration,
			embeddingConfiguration,
			customInstructions,
			autoApprovalSettings,
			buildContextOptions,
			browserSettings,
			chatSettings,
		} = await this.getState()
		this.cline = new Cline(
			this,
			apiConfiguration,
			autoApprovalSettings,
			browserSettings,
			chatSettings,
			embeddingConfiguration,
			customInstructions,
			undefined,
			undefined,
			historyItem,
		)

		this.cline.buildContextOptions = buildContextOptions
	}

	// Send any JSON serializable data to the react app
	async postMessageToWebview(message: ExtensionMessage) {
		await this.view?.webview.postMessage(message)
	}

	/**
	 * Defines and returns the HTML that should be rendered within the webview panel.
	 *
	 * @remarks This is also the place where references to the React webview build files
	 * are created and inserted into the webview HTML.
	 *
	 * @param webview A reference to the extension webview
	 * @param extensionUri The URI of the directory containing the extension
	 * @returns A template string literal containing the HTML that should be
	 * rendered within the webview panel
	 */
	private getHtmlContent(webview: vscode.Webview): string {
		// Get the local path to main script run in the webview,
		// then convert it to a uri we can use in the webview.

		// The CSS file from the React build output
		const stylesUri = getUri(webview, this.context.extensionUri, ["webview-ui", "build", "assets", "index.css"])
		// The JS file from the React build output
		const scriptUri = getUri(webview, this.context.extensionUri, ["webview-ui", "build", "assets", "index.js"])

		// The codicon font from the React build output
		// https://github.com/microsoft/vscode-extension-samples/blob/main/webview-codicons-sample/src/extension.ts
		// we installed this package in the extension so that we can access it how its intended from the extension (the font file is likely bundled in vscode), and we just import the css fileinto our react app we don't have access to it
		// don't forget to add font-src ${webview.cspSource};
		const codiconsUri = getUri(webview, this.context.extensionUri, [
			"node_modules",
			"@vscode",
			"codicons",
			"dist",
			"codicon.css",
		])

		// const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, "assets", "main.js"))

		// const styleResetUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, "assets", "reset.css"))
		// const styleVSCodeUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, "assets", "vscode.css"))

		// // Same for stylesheet
		// const stylesheetUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, "assets", "main.css"))

		// Use a nonce to only allow a specific script to be run.
		/*
				content security policy of your webview to only allow scripts that have a specific nonce
				create a content security policy meta tag so that only loading scripts with a nonce is allowed
				As your extension grows you will likely want to add custom styles, fonts, and/or images to your webview. If you do, you will need to update the content security policy meta tag to explicity allow for these resources. E.g.
								<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; font-src ${webview.cspSource}; img-src ${webview.cspSource} https:; script-src 'nonce-${nonce}';">
		- 'unsafe-inline' is required for styles due to vscode-webview-toolkit's dynamic style injection
		- since we pass base64 images to the webview, we need to specify img-src ${webview.cspSource} data:;

				in meta tag we add nonce attribute: A cryptographic nonce (only used once) to allow scripts. The server must generate a unique nonce value each time it transmits a policy. It is critical to provide a nonce that cannot be guessed as bypassing a resource's policy is otherwise trivial.
				*/
		const nonce = getNonce()

		// Tip: Install the es6-string-html VS Code extension to enable code highlighting below
		return /*html*/ `
        <!DOCTYPE html>
        <html lang="en">
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width,initial-scale=1,shrink-to-fit=no">
            <meta name="theme-color" content="#000000">
            <link rel="stylesheet" type="text/css" href="${stylesUri}">
            <link href="${codiconsUri}" rel="stylesheet" />
			<meta http-equiv="Content-Security-Policy" content="default-src 'none'; connect-src https://*.posthog.com https://*.firebaseauth.com https://*.firebaseio.com https://*.googleapis.com https://*.firebase.com; font-src ${webview.cspSource}; style-src ${webview.cspSource} 'unsafe-inline'; img-src ${webview.cspSource} https: data:; script-src 'nonce-${nonce}' 'unsafe-eval';">
            <title>HAI Build</title>
          </head>
          <body>
            <noscript>You need to enable JavaScript to run this app.</noscript>
            <div id="root"></div>
            <script type="module" nonce="${nonce}" src="${scriptUri}"></script>
          </body>
        </html>
      `
	}

	private async updateApiConfiguration(apiConfiguration: ApiConfiguration) {
		const {
			apiProvider,
			apiModelId,
			apiKey,
			openRouterApiKey,
			awsAccessKey,
			awsSecretKey,
			awsSessionToken,
			awsRegion,
			awsUseCrossRegionInference,
			awsBedrockUsePromptCache,
			awsBedrockEndpoint,
			awsProfile,
			awsUseProfile,
			vertexProjectId,
			vertexRegion,
			openAiBaseUrl,
			openAiApiKey,
			openAiModelId,
			openAiModelInfo,
			ollamaModelId,
			ollamaBaseUrl,
			ollamaApiOptionsCtxNum,
			lmStudioModelId,
			lmStudioBaseUrl,
			anthropicBaseUrl,
			geminiApiKey,
			openAiNativeApiKey,
			deepSeekApiKey,
			requestyApiKey,
			requestyModelId,
			togetherApiKey,
			togetherModelId,
			qwenApiKey,
			mistralApiKey,
			azureApiVersion,
			openRouterModelId,
			openRouterModelInfo,
			openRouterProviderSorting,
			vsCodeLmModelSelector,
			liteLlmBaseUrl,
			liteLlmModelId,
			liteLlmApiKey,
			qwenApiLine,
			asksageApiKey,
			asksageApiUrl,
			xaiApiKey,
			thinkingBudgetTokens,
			clineApiKey,
			sambanovaApiKey,
		} = apiConfiguration
		await this.customUpdateState("apiProvider", apiProvider)
		await this.customUpdateState("apiModelId", apiModelId)
		await this.customStoreSecret("apiKey", apiKey, true)
		await this.customStoreSecret("openRouterApiKey", openRouterApiKey, true)
		await this.customStoreSecret("awsAccessKey", awsAccessKey, true)
		await this.customStoreSecret("awsSecretKey", awsSecretKey, true)
		await this.customStoreSecret("awsSessionToken", awsSessionToken, true)
		await this.customUpdateState("awsRegion", awsRegion)
		await this.customUpdateState("awsUseCrossRegionInference", awsUseCrossRegionInference)
		await this.customUpdateState("awsBedrockUsePromptCache", awsBedrockUsePromptCache)
		await this.customUpdateState("awsBedrockEndpoint", awsBedrockEndpoint)
		await this.customUpdateState("awsProfile", awsProfile)
		await this.customUpdateState("awsUseProfile", awsUseProfile)
		await this.customUpdateState("vertexProjectId", vertexProjectId)
		await this.customUpdateState("vertexRegion", vertexRegion)
		await this.customUpdateState("openAiBaseUrl", openAiBaseUrl)
		await this.customStoreSecret("openAiApiKey", openAiApiKey, true)
		await this.customUpdateState("openAiModelId", openAiModelId)
		await this.customUpdateState("openAiModelInfo", openAiModelInfo)
		await this.customUpdateState("ollamaModelId", ollamaModelId)
		await this.customUpdateState("ollamaBaseUrl", ollamaBaseUrl)
		await this.customUpdateState("ollamaApiOptionsCtxNum", ollamaApiOptionsCtxNum)
		await this.customUpdateState("lmStudioModelId", lmStudioModelId)
		await this.customUpdateState("lmStudioBaseUrl", lmStudioBaseUrl)
		await this.customUpdateState("anthropicBaseUrl", anthropicBaseUrl)
		await this.customStoreSecret("geminiApiKey", geminiApiKey, true)
		await this.customStoreSecret("openAiNativeApiKey", openAiNativeApiKey, true)
		await this.customStoreSecret("deepSeekApiKey", deepSeekApiKey, true)
		await this.customStoreSecret("requestyApiKey", requestyApiKey, true)
		await this.customStoreSecret("togetherApiKey", togetherApiKey, true)
		await this.customStoreSecret("qwenApiKey", qwenApiKey, true)
		await this.customStoreSecret("mistralApiKey", mistralApiKey, true)
		await this.customStoreSecret("liteLlmApiKey", liteLlmApiKey, true)
		await this.customStoreSecret("xaiApiKey", xaiApiKey, true)
		await this.customUpdateState("azureApiVersion", azureApiVersion)
		await this.customUpdateState("openRouterModelId", openRouterModelId)
		await this.customUpdateState("openRouterModelInfo", openRouterModelInfo)
		await this.customUpdateState("openRouterProviderSorting", openRouterProviderSorting)
		await this.customUpdateState("vsCodeLmModelSelector", vsCodeLmModelSelector)
		await this.customUpdateState("liteLlmBaseUrl", liteLlmBaseUrl)
		await this.customUpdateState("liteLlmModelId", liteLlmModelId)
		await this.customUpdateState("qwenApiLine", qwenApiLine)
		await this.customUpdateState("requestyModelId", requestyModelId)
		await this.customUpdateState("togetherModelId", togetherModelId)
		await this.customStoreSecret("asksageApiKey", asksageApiKey, true)
		await this.customUpdateState("asksageApiUrl", asksageApiUrl)
		await this.customUpdateState("thinkingBudgetTokens", thinkingBudgetTokens)
		await this.customStoreSecret("clineApiKey", clineApiKey, true)
		await this.customStoreSecret("sambanovaApiKey", sambanovaApiKey, true)
		if (this.cline) {
			this.cline.api = buildApiHandler(apiConfiguration)
		}
	}

	private async updateEmbeddingConfiguration(embeddingConfiguration: EmbeddingConfiguration) {
		const {
			provider,
			modelId,
			awsAccessKey,
			awsSecretKey,
			awsSessionToken,
			awsRegion,
			openAiBaseUrl,
			openAiModelId,
			openAiApiKey,
			openAiNativeApiKey,
			azureOpenAIApiKey,
			azureOpenAIApiInstanceName,
			azureOpenAIApiEmbeddingsDeploymentName,
			azureOpenAIApiVersion,
			ollamaBaseUrl,
			ollamaModelId,
		} = embeddingConfiguration

		// Update Global State
		await this.customUpdateState("embeddingProvider", provider)
		await this.customUpdateState("embeddingModelId", modelId)
		await this.customUpdateState("embeddingAwsRegion", awsRegion)
		await this.customUpdateState("embeddingOpenAiBaseUrl", openAiBaseUrl)
		await this.customUpdateState("embeddingOpenAiModelId", openAiModelId)
		await this.customUpdateState("embeddingAzureOpenAIApiInstanceName", azureOpenAIApiInstanceName)
		await this.customUpdateState("embeddingAzureOpenAIApiVersion", azureOpenAIApiVersion)
		await this.customUpdateState("embeddingAzureOpenAIApiEmbeddingsDeploymentName", azureOpenAIApiEmbeddingsDeploymentName)
		await this.customUpdateState("embeddingOllamaBaseUrl", ollamaBaseUrl)
		await this.customUpdateState("embeddingOllamaModelId", ollamaModelId)
		// Update Secrets
		await this.customStoreSecret("embeddingAwsAccessKey", awsAccessKey, true)
		await this.customStoreSecret("embeddingAwsSecretKey", awsSecretKey, true)
		await this.customStoreSecret("embeddingAwsSecretKey", awsSecretKey, true)
		await this.customStoreSecret("embeddingAwsSessionToken", awsSessionToken, true)
		await this.customStoreSecret("embeddingOpenAiApiKey", openAiApiKey, true)
		await this.customStoreSecret("embeddingOpenAiNativeApiKey", openAiNativeApiKey, true)
		await this.customStoreSecret("embeddingAzureOpenAIApiKey", azureOpenAIApiKey, true)
	}

	async updateHaiRulesState(postToWebview: boolean = false) {
		const workspaceFolder = this.getWorkspacePath()
		if (!workspaceFolder) {
			return
		}
		const haiRulesPath = path.join(workspaceFolder, GlobalFileNames.clineRules)
		const isHaiRulePresent = await fileExistsAtPath(haiRulesPath)

		await this.customUpdateState("isHaiRulesPresent", isHaiRulePresent)

		if (postToWebview) {
			await this.postStateToWebview()
		}
	}
	/**
	 * Connects to the local Vite dev server to allow HMR, with fallback to the bundled assets
	 *
	 * @param webview A reference to the extension webview
	 * @returns A template string literal containing the HTML that should be
	 * rendered within the webview panel
	 */
	private async getHMRHtmlContent(webview: vscode.Webview): Promise<string> {
		const localPort = 25463
		const localServerUrl = `localhost:${localPort}`

		// Check if local dev server is running.
		try {
			await axios.get(`http://${localServerUrl}`)
		} catch (error) {
			vscode.window.showErrorMessage(
				"HAI: Local webview dev server is not running, HMR will not work. Please run 'npm run dev:webview' before launching the extension to enable HMR. Using bundled assets.",
			)

			return this.getHtmlContent(webview)
		}

		const nonce = getNonce()
		const stylesUri = getUri(webview, this.context.extensionUri, ["webview-ui", "build", "assets", "index.css"])
		const codiconsUri = getUri(webview, this.context.extensionUri, [
			"node_modules",
			"@vscode",
			"codicons",
			"dist",
			"codicon.css",
		])

		const scriptEntrypoint = "src/main.tsx"
		const scriptUri = `http://${localServerUrl}/${scriptEntrypoint}`

		const reactRefresh = /*html*/ `
			<script nonce="${nonce}" type="module">
				import RefreshRuntime from "http://${localServerUrl}/@react-refresh"
				RefreshRuntime.injectIntoGlobalHook(window)
				window.$RefreshReg$ = () => {}
				window.$RefreshSig$ = () => (type) => type
				window.__vite_plugin_react_preamble_installed__ = true
			</script>
		`

		const csp = [
			"default-src 'none'",
			`font-src ${webview.cspSource}`,
			`style-src ${webview.cspSource} 'unsafe-inline' https://* http://${localServerUrl} http://0.0.0.0:${localPort}`,
			`img-src ${webview.cspSource} https: data:`,
			`script-src 'unsafe-eval' https://* http://${localServerUrl} http://0.0.0.0:${localPort} 'nonce-${nonce}'`,
			`connect-src https://* ws://${localServerUrl} ws://0.0.0.0:${localPort} http://${localServerUrl} http://0.0.0.0:${localPort}`,
		]

		return /*html*/ `
			<!DOCTYPE html>
			<html lang="en">
				<head>
					<meta charset="utf-8">
					<meta name="viewport" content="width=device-width,initial-scale=1,shrink-to-fit=no">
					<meta http-equiv="Content-Security-Policy" content="${csp.join("; ")}">
					<link rel="stylesheet" type="text/css" href="${stylesUri}">
					<link href="${codiconsUri}" rel="stylesheet" />
					<title>HAI</title>
				</head>
				<body>
					<div id="root"></div>
					${reactRefresh}
					<script type="module" src="${scriptUri}"></script>
				</body>
			</html>
		`
	}

	/**
	 * Sets up an event listener to listen for messages passed from the webview context and
	 * executes code based on the message that is received.
	 *
	 * @param webview A reference to the extension webview
	 */
	private setWebviewMessageListener(webview: vscode.Webview) {
		webview.onDidReceiveMessage(
			async (message: WebviewMessage) => {
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

						this.getGlobalState("mcpMarketplaceCatalog").then((mcpMarketplaceCatalog) => {
							if (mcpMarketplaceCatalog) {
								this.postMessageToWebview({
									type: "mcpMarketplaceCatalog",
									mcpMarketplaceCatalog: mcpMarketplaceCatalog as McpMarketplaceCatalog,
								})
							}
						})
						this.silentlyRefreshMcpMarketplace()
						this.refreshOpenRouterModels().then(async (openRouterModels) => {
							if (openRouterModels) {
								// update model info in state (this needs to be done here since we don't want to update state while settings is open, and we may refresh models there)
								const { apiConfiguration } = await this.getState()
								if (apiConfiguration.openRouterModelId) {
									await this.customUpdateState(
										"openRouterModelInfo",
										openRouterModels[apiConfiguration.openRouterModelId],
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
					case "newTask":
						// Code that should run in response to the hello message command
						//vscode.window.showInformationMessage(message.text!)

						// Send a message to our webview.
						// You can send any JSON serializable data.
						// Could also do this in extension .ts
						//this.postMessageToWebview({ type: "text", text: `Extension: ${Date.now()}` })
						// initializing new instance of Cline will make sure that any agentically running promises in old instance don't affect our new task. this essentially creates a fresh slate for the new task
						await this.initClineWithTask(message.text, message.images)
						break
					case "checkHaiRules":
						await this.updateHaiRulesState(true)
						break
					case "apiConfiguration":
						if (message.apiConfiguration) {
							await this.updateApiConfiguration(message.apiConfiguration)
						}
						await this.postStateToWebview()
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
					case "customInstructions":
						await this.updateCustomInstructions(message.text, message.bool)
						break
					case "autoApprovalSettings":
						if (message.autoApprovalSettings) {
							await this.customUpdateState("autoApprovalSettings", message.autoApprovalSettings)
							if (this.cline) {
								this.cline.autoApprovalSettings = message.autoApprovalSettings
							}
							await this.postStateToWebview()
						}
						break
					case "browserSettings":
						if (message.browserSettings) {
							await this.customUpdateState("browserSettings", message.browserSettings)
							if (this.cline) {
								this.cline.updateBrowserSettings(message.browserSettings)
							}
							await this.postStateToWebview()
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
					// case "relaunchChromeDebugMode":
					// 	if (this.cline) {
					// 		this.cline.browserSession.relaunchChromeDebugMode()
					// 	}
					// 	break
					case "askResponse":
						this.cline?.handleWebviewAskResponse(message.askResponse!, message.text, message.images)
						break
					case "clearTask":
						// newTask will start a new task with a given task text, while clear task resets the current session and allows for a new task to be started
						await this.clearTask()
						await this.postStateToWebview()
						break
					case "didShowAnnouncement":
						await this.customUpdateState("lastShownAnnouncementId", this.latestAnnouncementId)
						await this.postStateToWebview()
						break
					case "selectImages":
						const images = await selectImages()
						await this.postMessageToWebview({
							type: "selectedImages",
							images,
						})
						break
					case "exportCurrentTask":
						const currentTaskId = this.cline?.taskId
						if (currentTaskId) {
							this.exportTaskWithId(currentTaskId)
						}
						break
					case "showTaskWithId":
						this.showTaskWithId(message.text!)
						break
					case "deleteTaskWithId":
						this.deleteTaskWithId(message.text!)
						break
					case "exportTaskWithId":
						this.exportTaskWithId(message.text!)
						break
					case "resetState":
						await this.resetState()
						break
					case "requestOllamaModels":
						const ollamaModels = await this.getOllamaModels(message.text)
						this.postMessageToWebview({
							type: "ollamaModels",
							ollamaModels,
						})
						break
					case "requestOllamaEmbeddingModels":
						const ollamaEmbeddingModels = await this.getOllamaEmbeddingModels(message.text)
						this.postMessageToWebview({
							type: "ollamaEmbeddingModels",
							ollamaEmbeddingModels,
						})
						break
					case "requestLmStudioModels":
						const lmStudioModels = await this.getLmStudioModels(message.text)
						this.postMessageToWebview({
							type: "lmStudioModels",
							lmStudioModels,
						})
						break
					case "requestVsCodeLmModels":
						const vsCodeLmModels = await this.getVsCodeLmModels()
						this.postMessageToWebview({ type: "vsCodeLmModels", vsCodeLmModels })
						break
					case "refreshOpenRouterModels":
						await this.refreshOpenRouterModels()
						break
					case "refreshOpenAiModels":
						const { apiConfiguration } = await this.getState()
						const openAiModels = await this.getOpenAiModels(
							apiConfiguration.openAiBaseUrl,
							apiConfiguration.openAiApiKey,
						)
						this.postMessageToWebview({ type: "openAiModels", openAiModels })
						break
					case "openImage":
						openImage(message.text!)
						break
					case "openInBrowser":
						if (message.url) {
							vscode.env.openExternal(vscode.Uri.parse(message.url))
						}
						break
					case "fetchOpenGraphData":
						this.fetchOpenGraphData(message.text!)
						break
					case "checkIsImageUrl":
						this.checkIsImageUrl(message.text!)
						break
					case "openFile":
						openFile(message.text!)
						break
					case "openMention":
						openMention(message.text)
						break
					case "checkpointDiff": {
						if (message.number) {
							await this.cline?.presentMultifileDiff(message.number, false)
						}
						break
					}
					case "checkpointRestore": {
						await this.cancelTask() // we cannot alter message history say if the task is active, as it could be in the middle of editing a file or running a command, which expect the ask to be responded to rather than being superceded by a new message eg add deleted_api_reqs
						// cancel task waits for any open editor to be reverted and starts a new cline instance
						if (message.number) {
							// wait for messages to be loaded
							await pWaitFor(() => this.cline?.isInitialized === true, {
								timeout: 3_000,
							}).catch(() => {
								console.error("Failed to init new cline instance")
							})
							// NOTE: cancelTask awaits abortTask, which awaits diffViewProvider.revertChanges, which reverts any edited files, allowing us to reset to a checkpoint rather than running into a state where the revertChanges function is called alongside or after the checkpoint reset
							await this.cline?.restoreCheckpoint(message.number, message.text! as ClineCheckpointRestore)
						}
						break
					}
					case "taskCompletionViewChanges": {
						if (message.number) {
							await this.cline?.presentMultifileDiff(message.number, true)
						}
						break
					}
					case "cancelTask":
						this.cancelTask()
						break
					case "getLatestState":
						await this.postStateToWebview()
						break
					case "accountLoginClicked": {
						// Generate nonce for state validation
						const nonce = crypto.randomBytes(32).toString("hex")
						await this.customStoreSecret("authNonce", nonce)

						// Open browser for authentication with state param
						console.log("Login button clicked in account page")
						console.log("Opening auth page with state param")

						const uriScheme = vscode.env.uriScheme

						const authUrl = vscode.Uri.parse(
							`https://app.cline.bot/auth?state=${encodeURIComponent(nonce)}&callback_url=${encodeURIComponent(`${uriScheme || "vscode"}://saoudrizwan.claude-dev/auth`)}`,
						)
						vscode.env.openExternal(authUrl)
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
					case "showMcpView": {
						await this.postMessageToWebview({ type: "action", action: "mcpButtonClicked" })
						break
					}
					case "openMcpSettings": {
						const mcpSettingsFilePath = await this.mcpHub?.getMcpSettingsFilePath()
						if (mcpSettingsFilePath) {
							openFile(mcpSettingsFilePath)
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

							// 2. Enable MCP settings if disabled
							// Enable MCP mode if disabled
							const mcpConfig = vscode.workspace.getConfiguration("hai.mcp")
							if (mcpConfig.get<string>("mode") !== "full") {
								await mcpConfig.update("mode", "full", true)
							}

							// 3. download MCP
							await this.downloadMcp(message.mcpId)
						}
						break
					}
					case "silentlyRefreshMcpMarketplace": {
						await this.silentlyRefreshMcpMarketplace()
						break
					}
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
					case "toggleMcpServer": {
						try {
							await this.mcpHub?.toggleServerDisabled(message.serverName!, message.disabled!)
						} catch (error) {
							console.error(`Failed to toggle MCP server ${message.serverName}:`, error)
						}
						break
					}
					case "toggleToolAutoApprove": {
						try {
							await this.mcpHub?.toggleToolAutoApprove(message.serverName!, message.toolName!, message.autoApprove!)
						} catch (error) {
							console.error(`Failed to toggle auto-approve for tool ${message.toolName}:`, error)
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
					case "onHaiConfigure":
						const isConfigureEnabled = message.bool !== undefined ? message.bool : true

						if (isConfigureEnabled) {
							this.chooseHaiProject(message?.text)
						} else {
							this.updateWorkspaceState("haiConfig", {})
						}

						break

					case "embeddingConfiguration":
						if (message.embeddingConfiguration) {
							await this.updateEmbeddingConfiguration(message.embeddingConfiguration)
						}
						await this.postStateToWebview()
						break
					case "validateLLMConfig":
						let isValid = false
						if (message.apiConfiguration) {
							// Save the LLM configuration in the state
							await this.updateApiConfiguration(message.apiConfiguration)

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
						await this.customUpdateState("isApiConfigurationValid", isValid)
						break
					case "validateEmbeddingConfig":
						let isEmbeddingValid = false
						if (message.embeddingConfiguration) {
							// Save the Embedding configuration in the state
							await this.updateEmbeddingConfiguration(message.embeddingConfiguration)

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
						await this.customUpdateState("isEmbeddingConfigurationValid", isEmbeddingValid)
						break
					case "openHistory":
						this.postMessageToWebview({ type: "action", action: "historyButtonClicked" })
						break
					case "openHaiTasks":
						this.postMessageToWebview({ type: "action", action: "haiBuildTaskListClicked" })
						break
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
					case "searchCommits": {
						const cwd = vscode.workspace.workspaceFolders?.map((folder) => folder.uri.fsPath).at(0)
						if (cwd) {
							try {
								const commits = await searchCommits(message.text || "", cwd)
								await this.postMessageToWebview({
									type: "commitSearchResults",
									commits,
								})
							} catch (error) {
								console.error(`Error searching commits: ${JSON.stringify(error)}`)
							}
						}
						break
					}
					case "updateMcpTimeout": {
						try {
							if (message.serverName && message.timeout) {
								await this.mcpHub?.updateServerTimeout(message.serverName, message.timeout)
							}
						} catch (error) {
							console.error(`Failed to update timeout for server ${message.serverName}:`, error)
						}
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
					case "stopIndex":
						Logger.log("Stopping Code index")
						this.codeIndexAbortController?.abort()
						break
					case "startIndex":
						Logger.log("Starting Code index")
						await this.updateWorkspaceState("codeIndexUserConfirmation", true)
						this.codeIndexAbortController = new AbortController()
						this.codeIndexBackground(undefined, undefined, true)
						break
					case "resetIndex":
						Logger.log("Re-indexing workspace")
						const resetIndex = await vscode.window.showWarningMessage(
							"Are you sure you want to reindex this workspace? This will erase all existing indexed data and restart the indexing process from the beginning.",
							"Yes",
							"No",
						)
						if (resetIndex === "Yes") {
							const haiFolderPath = path.join(
								this.vsCodeWorkSpaceFolderFsPath,
								HaiBuildDefaults.defaultContextDirectory,
							)
							if (await fileExistsAtPath(haiFolderPath)) {
								await fs.rmdir(haiFolderPath, { recursive: true })
							}
							this.codeIndexAbortController = new AbortController()
							await this.resetIndex()
							this.codeIndexBackground(undefined, undefined, true)
							break
						}
						break
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
							await this.updateApiConfiguration(message.apiConfiguration)
						}

						// custom instructions
						await this.updateCustomInstructions(message.customInstructionsSetting)

						// telemetry setting
						if (message.telemetrySetting) {
							await this.updateTelemetrySetting(message.telemetrySetting)
						}

						// plan act setting
						await this.customUpdateState("planActSeparateModelsSetting", message.planActSeparateModelsSetting)

						// after settings are updated, post state to webview
						await this.postStateToWebview()

						await this.postMessageToWebview({ type: "didUpdateSettings" })
						break
					}
					case "clearAllTaskHistory": {
						await this.deleteAllTaskHistory()
						await this.postStateToWebview()
						this.refreshTotalTasksSize()
						this.postMessageToWebview({ type: "relinquishControl" })
						break
					}
					default:
						this.customWebViewMessageHandlers(message)
						break
					// Add more switch case statements here as more webview message commands
					// are created within the webview context (i.e. inside media/main.js)
				}
			},
			null,
			this.disposables,
		)
	}

	async customWebViewMessageHandlers(message: WebviewMessage) {
		switch (message.type) {
			case "onHaiConfigure":
				console.log("onHaiConfigure")
				this.chooseHaiProject()
				break
			case "buildContextOptions":
				await this.customUpdateState("buildContextOptions", message.buildContextOptions ?? undefined)
				if (this.cline) {
					this.cline.buildContextOptions = message.buildContextOptions
				}
				await this.postStateToWebview()
				break
		}
	}

	async updateTelemetrySetting(telemetrySetting: TelemetrySetting) {
		await this.customUpdateState("telemetrySetting", telemetrySetting)
		const isOptedIn = telemetrySetting === "enabled"
		telemetryService.updateTelemetryState(isOptedIn)
	}

	async togglePlanActModeWithChatSettings(chatSettings: ChatSettings, chatContent?: ChatContent) {
		const didSwitchToActMode = chatSettings.mode === "act"

		// Capture mode switch telemetry | Capture regardless of if we know the taskId
		telemetryService.captureModeSwitch(this.cline?.taskId ?? "0", chatSettings.mode)

		// Get previous model info that we will revert to after saving current mode api info
		const {
			apiConfiguration,
			previousModeApiProvider: newApiProvider,
			previousModeModelId: newModelId,
			previousModeModelInfo: newModelInfo,
			previousModeVsCodeLmModelSelector: newVsCodeLmModelSelector,
			previousModeThinkingBudgetTokens: newThinkingBudgetTokens,
			planActSeparateModelsSetting,
		} = await this.getState()

		const shouldSwitchModel = planActSeparateModelsSetting === true

		if (shouldSwitchModel) {
			// Save the last model used in this mode
			await this.customUpdateState("previousModeApiProvider", apiConfiguration.apiProvider)
			await this.customUpdateState("previousModeThinkingBudgetTokens", apiConfiguration.thinkingBudgetTokens)
			switch (apiConfiguration.apiProvider) {
				case "anthropic":
				case "bedrock":
				case "vertex":
				case "gemini":
				case "asksage":
				case "openai-native":
				case "qwen":
				case "deepseek":
					await this.customUpdateState("previousModeModelId", apiConfiguration.apiModelId)
					break
				case "openrouter":
				case "cline":
					await this.customUpdateState("previousModeModelId", apiConfiguration.openRouterModelId)
					await this.customUpdateState("previousModeModelInfo", apiConfiguration.openRouterModelInfo)
					break
				case "vscode-lm":
					// Important we don't set modelId to this, as it's an object not string (webview expects model id to be a string)
					await this.customUpdateState("previousModeVsCodeLmModelSelector", apiConfiguration.vsCodeLmModelSelector)
					break
				case "openai":
					await this.customUpdateState("previousModeModelId", apiConfiguration.openAiModelId)
					await this.customUpdateState("previousModeModelInfo", apiConfiguration.openAiModelInfo)
					break
				case "ollama":
					await this.customUpdateState("previousModeModelId", apiConfiguration.ollamaModelId)
					break
				case "lmstudio":
					await this.customUpdateState("previousModeModelId", apiConfiguration.lmStudioModelId)
					break
				case "litellm":
					await this.customUpdateState("previousModeModelId", apiConfiguration.liteLlmModelId)
					break
				case "requesty":
					await this.customUpdateState("previousModeModelId", apiConfiguration.requestyModelId)
					break
			}

			// Restore the model used in previous mode
			if (newApiProvider || newModelId || newThinkingBudgetTokens !== undefined || newVsCodeLmModelSelector) {
				await this.customUpdateState("apiProvider", newApiProvider)
				await this.customUpdateState("thinkingBudgetTokens", newThinkingBudgetTokens)
				switch (newApiProvider) {
					case "anthropic":
					case "bedrock":
					case "vertex":
					case "gemini":
					case "asksage":
					case "openai-native":
					case "qwen":
					case "deepseek":
						await this.customUpdateState("apiModelId", newModelId)
						break
					case "openrouter":
					case "cline":
						await this.customUpdateState("openRouterModelId", newModelId)
						await this.customUpdateState("openRouterModelInfo", newModelInfo)
						break
					case "vscode-lm":
						await this.customUpdateState("vsCodeLmModelSelector", newVsCodeLmModelSelector)
						break
					case "openai":
						await this.customUpdateState("openAiModelId", newModelId)
						await this.customUpdateState("openAiModelInfo", newModelInfo)
						break
					case "ollama":
						await this.customUpdateState("ollamaModelId", newModelId)
						break
					case "lmstudio":
						await this.customUpdateState("lmStudioModelId", newModelId)
						break
					case "litellm":
						await this.customUpdateState("liteLlmModelId", newModelId)
						break
					case "requesty":
						await this.customUpdateState("requestyModelId", newModelId)
						break
				}

				if (this.cline) {
					const { apiConfiguration: updatedApiConfiguration } = await this.getState()
					this.cline.api = buildApiHandler(updatedApiConfiguration)
				}
			}
		}

		await this.customUpdateState("chatSettings", chatSettings)
		await this.postStateToWebview()

		if (this.cline) {
			this.cline.updateChatSettings(chatSettings)
			if (this.cline.isAwaitingPlanResponse && didSwitchToActMode) {
				this.cline.didRespondToPlanAskBySwitchingMode = true
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
		if (this.cline) {
			const { historyItem } = await this.getTaskWithId(this.cline.taskId)
			try {
				await this.cline.abortTask()
			} catch (error) {
				console.error("Failed to abort task", error)
			}
			await pWaitFor(
				() =>
					this.cline === undefined ||
					this.cline.isStreaming === false ||
					this.cline.didFinishAbortingStream ||
					this.cline.isWaitingForFirstChunk, // if only first chunk is processed, then there's no need to wait for graceful abort (closes edits, browser, etc)
				{
					timeout: 3_000,
				},
			).catch(() => {
				console.error("Failed to abort task")
			})
			if (this.cline) {
				// 'abandoned' will prevent this cline instance from affecting future cline instance gui. this may happen if its hanging on a streaming request
				this.cline.abandoned = true
			}
			await this.initClineWithHistoryItem(historyItem) // clears task again, so we need to abortTask manually above
			// await this.postStateToWebview() // new Cline instance will post state when it's ready. having this here sent an empty messages array to webview leading to virtuoso having to reload the entire list
		}
	}

	async updateCustomInstructions(instructions?: string, enable?: boolean) {
		// User may be clearing the field
		await this.customUpdateState("customInstructions", instructions || undefined)
		if (this.cline) {
			this.cline.customInstructions = instructions || undefined
		}
	}

	// MCP

	async getDocumentsPath(): Promise<string> {
		if (process.platform === "win32") {
			try {
				const { stdout: docsPath } = await execa("powershell", [
					"-NoProfile", // Ignore user's PowerShell profile(s)
					"-Command",
					"[System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::MyDocuments)",
				])
				const trimmedPath = docsPath.trim()
				if (trimmedPath) {
					return trimmedPath
				}
			} catch (err) {
				console.error("Failed to retrieve Windows Documents path. Falling back to homedir/Documents.")
			}
		} else if (process.platform === "linux") {
			try {
				// First check if xdg-user-dir exists
				await execa("which", ["xdg-user-dir"])

				// If it exists, try to get XDG documents path
				const { stdout } = await execa("xdg-user-dir", ["DOCUMENTS"])
				const trimmedPath = stdout.trim()
				if (trimmedPath) {
					return trimmedPath
				}
			} catch {
				// Log error but continue to fallback
				console.error("Failed to retrieve XDG Documents path. Falling back to homedir/Documents.")
			}
		}

		// Default fallback for all platforms
		return path.join(os.homedir(), "Documents")
	}

	async ensureMcpServersDirectoryExists(): Promise<string> {
		const userDocumentsPath = await this.getDocumentsPath()
		const mcpServersDir = path.join(userDocumentsPath, "HAI", "MCP")
		try {
			await fs.mkdir(mcpServersDir, { recursive: true })
		} catch (error) {
			return "~/Documents/HAI/MCP" // in case creating a directory in documents fails for whatever reason (e.g. permissions) - this is fine since this path is only ever used in the system prompt
		}
		return mcpServersDir
	}

	async ensureSettingsDirectoryExists(): Promise<string> {
		const settingsDir = path.join(this.context.globalStorageUri.fsPath, "settings")
		await fs.mkdir(settingsDir, { recursive: true })
		return settingsDir
	}

	// VSCode LM API

	private async getVsCodeLmModels() {
		try {
			const models = await vscode.lm.selectChatModels({})
			return models || []
		} catch (error) {
			console.error("Error fetching VS Code LM models:", error)
			return []
		}
	}

	// Ollama

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

	async getOllamaModels(baseUrl?: string) {
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
			return models
		} catch (error) {
			return []
		}
	}

	// LM Studio

	async getLmStudioModels(baseUrl?: string) {
		try {
			if (!baseUrl) {
				baseUrl = "http://localhost:1234"
			}
			if (!URL.canParse(baseUrl)) {
				return []
			}
			const response = await axios.get(`${baseUrl}/v1/models`)
			const modelsArray = response.data?.data?.map((model: any) => model.id) || []
			const models = [...new Set<string>(modelsArray)]
			return models
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
		const storedNonce = await this.getSecret("authNonce")
		if (!state || state !== storedNonce) {
			return false
		}
		await this.customStoreSecret("authNonce", undefined) // Clear after use
		return true
	}

	async handleAuthCallback(customToken: string, apiKey: string) {
		try {
			// Store API key for API calls
			await this.customStoreSecret("clineApiKey", apiKey)

			// Send custom token to webview for Firebase auth
			await this.postMessageToWebview({
				type: "authCallback",
				customToken,
			})

			const clineProvider: ApiProvider = "cline"
			await this.customUpdateState("apiProvider", clineProvider)

			// Update API configuration with the new provider and API key
			const { apiConfiguration } = await this.getState()
			const updatedConfig = {
				...apiConfiguration,
				apiProvider: clineProvider,
				clineApiKey: apiKey,
			}

			if (this.cline) {
				this.cline.api = buildApiHandler(updatedConfig)
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

			const catalog: McpMarketplaceCatalog = {
				items: (response.data || []).map((item: any) => ({
					...item,
					githubStars: item.githubStars ?? 0,
					downloadCount: item.downloadCount ?? 0,
					tags: item.tags ?? [],
				})),
			}

			// Store in global state
			await this.customUpdateState("mcpMarketplaceCatalog", catalog)
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
			const cachedCatalog = (await this.getGlobalState("mcpMarketplaceCatalog")) as McpMarketplaceCatalog | undefined
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

			const mcpDetails = response.data

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
- Use "${mcpDetails.mcpId}" as the server name in hai_mcp_settings.json.
- Create the directory for the new MCP server before starting installation.
- Use commands aligned with the user's shell and operating system best practices.
- The following README may contain instructions that conflict with the user's OS, in which case proceed thoughtfully.
- Once installed, demonstrate the server's capabilities by using one of its tools.
Here is the project's README to help you get started:\n\n${mcpDetails.readmeContent}\n${mcpDetails.llmsInstallationContent}`

			// Initialize task and show chat view
			await this.initClineWithTask(task)
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

	// OpenAi

	async getOpenAiModels(baseUrl?: string, apiKey?: string) {
		try {
			if (!baseUrl) {
				return []
			}

			if (!URL.canParse(baseUrl)) {
				return []
			}

			const config: Record<string, any> = {}
			if (apiKey) {
				config["headers"] = { Authorization: `Bearer ${apiKey}` }
			}

			const response = await axios.get(`${baseUrl}/models`, config)
			const modelsArray = response.data?.data?.map((model: any) => model.id) || []
			const models = [...new Set<string>(modelsArray)]
			return models
		} catch (error) {
			return []
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
		await this.customUpdateState("apiProvider", openrouter)
		await this.customStoreSecret("openRouterApiKey", apiKey)
		await this.postStateToWebview()
		if (this.cline) {
			this.cline.api = buildApiHandler({
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

	async refreshOpenRouterModels() {
		const openRouterModelsFilePath = path.join(await this.ensureCacheDirectoryExists(), GlobalFileNames.openRouterModels)

		let models: Record<string, ModelInfo> = {}
		try {
			const response = await axios.get("https://openrouter.ai/api/v1/models")
			/*
			{
				"id": "anthropic/claude-3.5-sonnet",
				"name": "Anthropic: Claude 3.5 Sonnet",
				"created": 1718841600,
				"description": "Claude 3.5 Sonnet delivers better-than-Opus capabilities, faster-than-Sonnet speeds, at the same Sonnet prices. Sonnet is particularly good at:\n\n- Coding: Autonomously writes, edits, and runs code with reasoning and troubleshooting\n- Data science: Augments human data science expertise; navigates unstructured data while using multiple tools for insights\n- Visual processing: excelling at interpreting charts, graphs, and images, accurately transcribing text to derive insights beyond just the text alone\n- Agentic tasks: exceptional tool use, making it great at agentic tasks (i.e. complex, multi-step problem solving tasks that require engaging with other systems)\n\n#multimodal",
				"context_length": 200000,
				"architecture": {
					"modality": "text+image-\u003Etext",
					"tokenizer": "Claude",
					"instruct_type": null
				},
				"pricing": {
					"prompt": "0.000003",
					"completion": "0.000015",
					"image": "0.0048",
					"request": "0"
				},
				"top_provider": {
					"context_length": 200000,
					"max_completion_tokens": 8192,
					"is_moderated": true
				},
				"per_request_limits": null
			},
			*/
			if (response.data?.data) {
				const rawModels = response.data.data
				const parsePrice = (price: any) => {
					if (price) {
						return parseFloat(price) * 1_000_000
					}
					return undefined
				}
				for (const rawModel of rawModels) {
					const modelInfo: ModelInfo = {
						maxTokens: rawModel.top_provider?.max_completion_tokens,
						contextWindow: rawModel.context_length,
						supportsImages: rawModel.architecture?.modality?.includes("image"),
						supportsPromptCache: false,
						inputPrice: parsePrice(rawModel.pricing?.prompt),
						outputPrice: parsePrice(rawModel.pricing?.completion),
						description: rawModel.description,
					}

					switch (rawModel.id) {
						case "anthropic/claude-3-7-sonnet":
						case "anthropic/claude-3-7-sonnet:beta":
						case "anthropic/claude-3.7-sonnet":
						case "anthropic/claude-3.7-sonnet:beta":
						case "anthropic/claude-3.7-sonnet:thinking":
						case "anthropic/claude-3.5-sonnet":
						case "anthropic/claude-3.5-sonnet:beta":
							// NOTE: this needs to be synced with api.ts/openrouter default model info
							modelInfo.supportsComputerUse = true
							modelInfo.supportsPromptCache = true
							modelInfo.cacheWritesPrice = 3.75
							modelInfo.cacheReadsPrice = 0.3
							break
						case "anthropic/claude-3.5-sonnet-20240620":
						case "anthropic/claude-3.5-sonnet-20240620:beta":
							modelInfo.supportsPromptCache = true
							modelInfo.cacheWritesPrice = 3.75
							modelInfo.cacheReadsPrice = 0.3
							break
						case "anthropic/claude-3-5-haiku":
						case "anthropic/claude-3-5-haiku:beta":
						case "anthropic/claude-3-5-haiku-20241022":
						case "anthropic/claude-3-5-haiku-20241022:beta":
						case "anthropic/claude-3.5-haiku":
						case "anthropic/claude-3.5-haiku:beta":
						case "anthropic/claude-3.5-haiku-20241022":
						case "anthropic/claude-3.5-haiku-20241022:beta":
							modelInfo.supportsPromptCache = true
							modelInfo.cacheWritesPrice = 1.25
							modelInfo.cacheReadsPrice = 0.1
							break
						case "anthropic/claude-3-opus":
						case "anthropic/claude-3-opus:beta":
							modelInfo.supportsPromptCache = true
							modelInfo.cacheWritesPrice = 18.75
							modelInfo.cacheReadsPrice = 1.5
							break
						case "anthropic/claude-3-haiku":
						case "anthropic/claude-3-haiku:beta":
							modelInfo.supportsPromptCache = true
							modelInfo.cacheWritesPrice = 0.3
							modelInfo.cacheReadsPrice = 0.03
							break
						case "deepseek/deepseek-chat":
							modelInfo.supportsPromptCache = true
							// see api.ts/deepSeekModels for more info
							modelInfo.inputPrice = 0
							modelInfo.cacheWritesPrice = 0.14
							modelInfo.cacheReadsPrice = 0.014
							break
					}

					models[rawModel.id] = modelInfo
				}
			} else {
				console.error("Invalid response from OpenRouter API")
			}
			await fs.writeFile(openRouterModelsFilePath, JSON.stringify(models))
			console.log("OpenRouter models fetched and saved", models)
		} catch (error) {
			console.error("Error fetching OpenRouter models:", error)
		}

		await this.postMessageToWebview({
			type: "openRouterModels",
			openRouterModels: models,
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
		await vscode.commands.executeCommand("claude-dev.SidebarProvider.focus")
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
		await vscode.commands.executeCommand("claude-dev.SidebarProvider.focus")
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
		await vscode.commands.executeCommand("claude-dev.SidebarProvider.focus")
		await setTimeoutPromise(100)

		const fileMention = this.getFileMentionFromPath(filePath)
		const problemsString = this.convertDiagnosticsToProblemsString(diagnostics)
		await this.initClineWithTask(
			`Fix the following code in ${fileMention}\n\`\`\`\n${code}\n\`\`\`\n\nProblems:\n${problemsString}`,
		)

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
		apiConversationHistory: Anthropic.MessageParam[]
	}> {
		const history = ((await this.customGetState("taskHistory")) as HistoryItem[] | undefined) || []
		const historyItem = history.find((item) => item.id === id)
		if (historyItem) {
			const taskDirPath = path.join(this.context.globalStorageUri.fsPath, "tasks", id)
			const apiConversationHistoryFilePath = path.join(taskDirPath, GlobalFileNames.apiConversationHistory)
			const uiMessagesFilePath = path.join(taskDirPath, GlobalFileNames.uiMessages)
			const fileExists = await fileExistsAtPath(apiConversationHistoryFilePath)
			if (fileExists) {
				const apiConversationHistory = JSON.parse(await fs.readFile(apiConversationHistoryFilePath, "utf8"))
				return {
					historyItem,
					taskDirPath,
					apiConversationHistoryFilePath,
					uiMessagesFilePath,
					apiConversationHistory,
				}
			}
		}
		// if we tried to get a task that doesn't exist, remove it from state
		// FIXME: this seems to happen sometimes when the json file doesnt save to disk for some reason
		await this.deleteTaskFromState(id)
		throw new Error("Task not found")
	}

	async showTaskWithId(id: string) {
		if (id !== this.cline?.taskId) {
			// non-current task
			const { historyItem } = await this.getTaskWithId(id)
			await this.initClineWithHistoryItem(historyItem) // clears existing task
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
		await this.customUpdateState("taskHistory", undefined)
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
			if (id === this.cline?.taskId) {
				await this.clearTask()
				console.debug("cleared task")
			}

			const { taskDirPath, apiConversationHistoryFilePath, uiMessagesFilePath } = await this.getTaskWithId(id)

			const updatedTaskHistory = await this.deleteTaskFromState(id)

			// Delete the task files
			const apiConversationHistoryFileExists = await fileExistsAtPath(apiConversationHistoryFilePath)
			if (apiConversationHistoryFileExists) {
				await fs.unlink(apiConversationHistoryFilePath)
			}
			const uiMessagesFileExists = await fileExistsAtPath(uiMessagesFilePath)
			if (uiMessagesFileExists) {
				await fs.unlink(uiMessagesFilePath)
			}
			const legacyMessagesFilePath = path.join(taskDirPath, "claude_messages.json")
			if (await fileExistsAtPath(legacyMessagesFilePath)) {
				await fs.unlink(legacyMessagesFilePath)
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
		const taskHistory = ((await this.customGetState("taskHistory")) as HistoryItem[] | undefined) || []
		const updatedTaskHistory = taskHistory.filter((task) => task.id !== id)
		await this.customUpdateState("taskHistory", updatedTaskHistory)

		// Notify the webview that the task has been deleted
		await this.postStateToWebview()

		return updatedTaskHistory
	}

	async postStateToWebview() {
		const state = await this.getStateToPostToWebview()
		this.postMessageToWebview({ type: "state", state })
	}

	async getStateToPostToWebview(): Promise<ExtensionState> {
		const {
			apiConfiguration,
			lastShownAnnouncementId,
			customInstructions,
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
		} = await this.getState()

		return {
			version: this.context.extension?.packageJSON?.version ?? "",
			apiConfiguration,
			customInstructions,
			isHaiRulesPresent,
			uriScheme: vscode.env.uriScheme,
			currentTaskItem: this.cline?.taskId ? (taskHistory || []).find((item) => item.id === this.cline?.taskId) : undefined,
			checkpointTrackerErrorMessage: this.cline?.checkpointTrackerErrorMessage,
			clineMessages: this.cline?.clineMessages || [],
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
		}
	}

	async clearTask() {
		this.cline?.abortTask()
		this.cline = undefined // removes reference to it, so once promises end it will be garbage collected
	}

	// Caching mechanism to keep track of webview messages + API conversation history per provider instance

	/*
	Now that we use retainContextWhenHidden, we don't have to store a cache of cline messages in the user's state, but we could to reduce memory footprint in long conversations.

	- We have to be careful of what state is shared between ClineProvider instances since there could be multiple instances of the extension running at once. For example when we cached cline messages using the same key, two instances of the extension could end up using the same key and overwriting each other's messages.
	- Some state does need to be shared between the instances, i.e. the API key--however there doesn't seem to be a good way to notify the other instances that the API key has changed.

	We need to use a unique identifier for each ClineProvider instance's message cache since we could be running several instances of the extension outside of just the sidebar i.e. in editor panels.

	// conversation history to send in API requests

	/*
	It seems that some API messages do not comply with vscode state requirements. Either the Anthropic library is manipulating these values somehow in the backend in a way thats creating cyclic references, or the API returns a function or a Symbol as part of the message content.
	VSCode docs about state: "The value must be JSON-stringifyable ... value — A value. MUST not contain cyclic references."
	For now we'll store the conversation history in memory, and if we need to store in state directly we'd need to do a manual conversion to ensure proper json stringification.
	*/

	// getApiConversationHistory(): Anthropic.MessageParam[] {
	// 	// const history = (await this.getGlobalState(
	// 	// 	this.getApiConversationHistoryStateKey()
	// 	// )) as Anthropic.MessageParam[]
	// 	// return history || []
	// 	return this.apiConversationHistory
	// }

	// setApiConversationHistory(history: Anthropic.MessageParam[] | undefined) {
	// 	// await this.updateGlobalState(this.getApiConversationHistoryStateKey(), history)
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

	/*
	Storage
	https://dev.to/kompotkot/how-to-use-secretstorage-in-your-vscode-extensions-2hco
	https://www.eliostruyf.com/devhack-code-extension-storage-options/
	*/

	async getState() {
		const [
			storedApiProvider,
			apiModelId,
			apiKey,
			openRouterApiKey,
			clineApiKey,
			awsAccessKey,
			awsSecretKey,
			awsSessionToken,
			awsRegion,
			awsUseCrossRegionInference,
			awsBedrockUsePromptCache,
			awsBedrockEndpoint,
			awsProfile,
			awsUseProfile,
			vertexProjectId,
			vertexRegion,
			openAiBaseUrl,
			openAiApiKey,
			openAiModelId,
			openAiModelInfo,
			ollamaModelId,
			ollamaBaseUrl,
			ollamaApiOptionsCtxNum,
			lmStudioModelId,
			lmStudioBaseUrl,
			anthropicBaseUrl,
			geminiApiKey,
			openAiNativeApiKey,
			deepSeekApiKey,
			requestyApiKey,
			requestyModelId,
			togetherApiKey,
			togetherModelId,
			qwenApiKey,
			mistralApiKey,
			azureApiVersion,
			openRouterModelId,
			openRouterModelInfo,
			openRouterProviderSorting,
			lastShownAnnouncementId,
			customInstructions,
			taskHistory,
			autoApprovalSettings,
			browserSettings,
			chatSettings,
			vsCodeLmModelSelector,
			liteLlmBaseUrl,
			liteLlmModelId,
			userInfo,
			previousModeApiProvider,
			previousModeModelId,
			previousModeModelInfo,
			previousModeVsCodeLmModelSelector,
			previousModeThinkingBudgetTokens,
			qwenApiLine,
			liteLlmApiKey,
			telemetrySetting,
			asksageApiKey,
			asksageApiUrl,
			xaiApiKey,
			thinkingBudgetTokens,
			sambanovaApiKey,
			planActSeparateModelsSettingRaw,
			isHaiRulesPresent,
			buildContextOptions,
			buildIndexProgress,
			isApiConfigurationValid,
			// Embedding Configuration
			storedEmbeddingProvider,
			embeddingModelId,
			embeddingAwsAccessKey,
			embeddingAwsSecretKey,
			embeddingAwsSessionToken,
			embeddingAwsRegion,
			embeddingOpenAiBaseUrl,
			embeddingOpenAiApiKey,
			embeddingOpenAiModelId,
			embeddingOpenAiNativeApiKey,
			azureOpenAIApiKey,
			azureOpenAIApiInstanceName,
			azureOpenAIApiEmbeddingsDeploymentName,
			azureOpenAIApiVersion,
			isEmbeddingConfigurationValid,
			embeddingOllamaBaseUrl,
			embeddingOllamaModelId,
		] = await Promise.all([
			this.customGetState("apiProvider") as Promise<ApiProvider | undefined>,
			this.customGetState("apiModelId") as Promise<string | undefined>,
			this.customGetSecret("apiKey") as Promise<string | undefined>,
			this.customGetSecret("openRouterApiKey") as Promise<string | undefined>,
			this.customGetSecret("clineApiKey") as Promise<string | undefined>,
			this.customGetSecret("awsAccessKey") as Promise<string | undefined>,
			this.customGetSecret("awsSecretKey") as Promise<string | undefined>,
			this.customGetSecret("awsSessionToken", false) as Promise<string | undefined>,
			this.customGetState("awsRegion") as Promise<string | undefined>,
			this.customGetState("awsUseCrossRegionInference") as Promise<boolean | undefined>,
			this.customGetState("awsBedrockUsePromptCache") as Promise<boolean | undefined>,
			this.customGetState("awsBedrockEndpoint") as Promise<string | undefined>,
			this.customGetState("awsProfile") as Promise<string | undefined>,
			this.customGetState("awsUseProfile") as Promise<boolean | undefined>,
			this.customGetState("vertexProjectId") as Promise<string | undefined>,
			this.customGetState("vertexRegion") as Promise<string | undefined>,
			this.customGetState("openAiBaseUrl") as Promise<string | undefined>,
			this.customGetSecret("openAiApiKey") as Promise<string | undefined>,
			this.customGetState("openAiModelId") as Promise<string | undefined>,
			this.customGetState("openAiModelInfo") as Promise<ModelInfo | undefined>,
			this.customGetState("ollamaModelId") as Promise<string | undefined>,
			this.customGetState("ollamaBaseUrl") as Promise<string | undefined>,
			this.customGetState("ollamaApiOptionsCtxNum") as Promise<string | undefined>,
			this.customGetState("lmStudioModelId") as Promise<string | undefined>,
			this.customGetState("lmStudioBaseUrl") as Promise<string | undefined>,
			this.customGetState("anthropicBaseUrl") as Promise<string | undefined>,
			this.customGetSecret("geminiApiKey") as Promise<string | undefined>,
			this.customGetSecret("openAiNativeApiKey") as Promise<string | undefined>,
			this.customGetSecret("deepSeekApiKey") as Promise<string | undefined>,
			this.customGetSecret("requestyApiKey") as Promise<string | undefined>,
			this.customGetState("requestyModelId") as Promise<string | undefined>,
			this.customGetSecret("togetherApiKey") as Promise<string | undefined>,
			this.customGetState("togetherModelId") as Promise<string | undefined>,
			this.customGetSecret("qwenApiKey") as Promise<string | undefined>,
			this.customGetSecret("mistralApiKey") as Promise<string | undefined>,
			this.customGetState("azureApiVersion") as Promise<string | undefined>,
			this.customGetState("openRouterModelId") as Promise<string | undefined>,
			this.customGetState("openRouterModelInfo") as Promise<ModelInfo | undefined>,
			this.customGetState("openRouterProviderSorting") as Promise<string | undefined>,
			this.customGetState("lastShownAnnouncementId") as Promise<string | undefined>,
			this.customGetState("customInstructions") as Promise<string | undefined>,
			this.customGetState("taskHistory") as Promise<HistoryItem[] | undefined>,
			this.customGetState("autoApprovalSettings") as Promise<AutoApprovalSettings | undefined>,
			this.customGetState("browserSettings") as Promise<BrowserSettings | undefined>,
			this.customGetState("chatSettings") as Promise<ChatSettings | undefined>,
			this.customGetState("vsCodeLmModelSelector") as Promise<vscode.LanguageModelChatSelector | undefined>,
			this.customGetState("liteLlmBaseUrl") as Promise<string | undefined>,
			this.customGetState("liteLlmModelId") as Promise<string | undefined>,
			this.customGetState("userInfo") as Promise<UserInfo | undefined>,
			this.customGetState("previousModeApiProvider") as Promise<ApiProvider | undefined>,
			this.customGetState("previousModeModelId") as Promise<string | undefined>,
			this.customGetState("previousModeModelInfo") as Promise<ModelInfo | undefined>,
			this.customGetState("previousModeVsCodeLmModelSelector") as Promise<vscode.LanguageModelChatSelector | undefined>,
			this.customGetState("previousModeThinkingBudgetTokens") as Promise<number | undefined>,
			this.customGetState("qwenApiLine") as Promise<string | undefined>,
			this.customGetSecret("liteLlmApiKey") as Promise<string | undefined>,
			this.customGetState("telemetrySetting") as Promise<TelemetrySetting | undefined>,
			this.customGetSecret("asksageApiKey") as Promise<string | undefined>,
			this.customGetState("asksageApiUrl") as Promise<string | undefined>,
			this.customGetSecret("xaiApiKey") as Promise<string | undefined>,
			this.customGetState("thinkingBudgetTokens") as Promise<number | undefined>,
			this.customGetSecret("sambanovaApiKey") as Promise<string | undefined>,
			this.customGetState("planActSeparateModelsSetting") as Promise<boolean | undefined>,
			this.customGetState("isHaiRulesPresent") as Promise<boolean | undefined>,
			this.customGetState("buildContextOptions") as Promise<HaiBuildContextOptions | undefined>,
			this.customGetState("buildIndexProgress") as Promise<HaiBuildIndexProgress | undefined>,
			this.customGetState("isApiConfigurationValid") as Promise<boolean | undefined>,
			// Embedding Configurations
			this.customGetState("embeddingProvider") as Promise<EmbeddingProvider | undefined>,
			this.customGetState("embeddingModelId") as Promise<string | undefined>,
			this.customGetSecret("embeddingAwsAccessKey") as Promise<string | undefined>,
			this.customGetSecret("embeddingAwsSecretKey") as Promise<string | undefined>,
			this.customGetSecret("embeddingAwsSessionToken", false) as Promise<string | undefined>,
			this.customGetState("embeddingAwsRegion") as Promise<string | undefined>,
			this.customGetState("embeddingOpenAiBaseUrl") as Promise<string | undefined>,
			this.customGetSecret("embeddingOpenAiApiKey") as Promise<string | undefined>,
			this.customGetState("embeddingOpenAiModelId") as Promise<string | undefined>,
			this.customGetSecret("embeddingOpenAiNativeApiKey") as Promise<string | undefined>,
			this.customGetSecret("embeddingAzureOpenAIApiKey") as Promise<string | undefined>,
			this.customGetState("embeddingAzureOpenAIApiInstanceName") as Promise<string | undefined>,
			this.customGetState("embeddingAzureOpenAIApiEmbeddingsDeploymentName") as Promise<string | undefined>,
			this.customGetState("embeddingAzureOpenAIApiVersion") as Promise<string | undefined>,
			this.customGetState("isEmbeddingConfigurationValid") as Promise<boolean | undefined>,
			this.customGetState("embeddingOllamaBaseUrl") as Promise<string | undefined>,
			this.customGetState("embeddingOllamaModelId") as Promise<string | undefined>,
		])

		let apiProvider: ApiProvider
		if (storedApiProvider) {
			apiProvider = storedApiProvider
		} else {
			// Either new user or legacy user that doesn't have the apiProvider stored in state
			// (If they're using OpenRouter or Bedrock, then apiProvider state will exist)
			if (apiKey) {
				apiProvider = "anthropic"
			} else {
				// New users should default to openrouter, since they've opted to use an API key instead of signing in
				apiProvider = "openai-native"
			}
		}

		let embeddingProvider: EmbeddingProvider
		if (storedEmbeddingProvider) {
			embeddingProvider = storedEmbeddingProvider
		} else {
			embeddingProvider = "openai-native"
		}

		const o3MiniReasoningEffort = vscode.workspace
			.getConfiguration("hai.modelSettings.o3Mini")
			.get("reasoningEffort", "medium")

		const mcpMarketplaceEnabled = vscode.workspace.getConfiguration("hai").get<boolean>("mcpMarketplace.enabled", true)

		// Plan/Act separate models setting is a boolean indicating whether the user wants to use different models for plan and act. Existing users expect this to be enabled, while we want new users to opt in to this being disabled by default.
		// On win11 state sometimes initializes as empty string instead of undefined
		let planActSeparateModelsSetting: boolean | undefined = undefined
		if (planActSeparateModelsSettingRaw === true || planActSeparateModelsSettingRaw === false) {
			planActSeparateModelsSetting = planActSeparateModelsSettingRaw
		} else {
			// default to true for existing users
			if (storedApiProvider) {
				planActSeparateModelsSetting = true
			} else {
				// default to false for new users
				planActSeparateModelsSetting = false
			}
			// this is a special case where it's a new state, but we want it to default to different values for existing and new users.
			// persist so next time state is retrieved it's set to the correct value.
			await this.customUpdateState("planActSeparateModelsSetting", planActSeparateModelsSetting)
		}

		return {
			apiConfiguration: {
				apiProvider,
				apiModelId,
				apiKey,
				openRouterApiKey,
				clineApiKey,
				awsAccessKey,
				awsSecretKey,
				awsSessionToken,
				awsRegion,
				awsUseCrossRegionInference,
				awsBedrockUsePromptCache,
				awsBedrockEndpoint,
				awsProfile,
				awsUseProfile,
				vertexProjectId,
				vertexRegion,
				openAiBaseUrl,
				openAiApiKey,
				openAiModelId,
				openAiModelInfo,
				ollamaModelId,
				ollamaBaseUrl,
				ollamaApiOptionsCtxNum,
				lmStudioModelId,
				lmStudioBaseUrl,
				anthropicBaseUrl,
				geminiApiKey,
				openAiNativeApiKey,
				deepSeekApiKey,
				requestyApiKey,
				requestyModelId,
				togetherApiKey,
				togetherModelId,
				qwenApiKey,
				qwenApiLine,
				mistralApiKey,
				azureApiVersion,
				openRouterModelId,
				openRouterModelInfo,
				openRouterProviderSorting,
				vsCodeLmModelSelector,
				o3MiniReasoningEffort,
				thinkingBudgetTokens,
				liteLlmBaseUrl,
				liteLlmModelId,
				liteLlmApiKey,
				asksageApiKey,
				asksageApiUrl,
				xaiApiKey,
				sambanovaApiKey,
				isApiConfigurationValid,
			},
			embeddingConfiguration: {
				provider: embeddingProvider,
				modelId: embeddingModelId,
				awsAccessKey: embeddingAwsAccessKey,
				awsSecretKey: embeddingAwsSecretKey,
				awsSessionToken: embeddingAwsSessionToken,
				awsRegion: embeddingAwsRegion,
				openAiBaseUrl: embeddingOpenAiBaseUrl,
				openAiApiKey: embeddingOpenAiApiKey,
				openAiModelId: embeddingOpenAiModelId,
				openAiNativeApiKey: embeddingOpenAiNativeApiKey,
				azureOpenAIApiKey,
				azureOpenAIApiInstanceName,
				azureOpenAIApiEmbeddingsDeploymentName,
				azureOpenAIApiVersion,
				isEmbeddingConfigurationValid,
				ollamaBaseUrl: embeddingOllamaBaseUrl,
				ollamaModelId: embeddingOllamaModelId,
			},
			lastShownAnnouncementId,
			customInstructions,
			isHaiRulesPresent,
			taskHistory,
			buildContextOptions: buildContextOptions ?? {
				useIndex: true, // Enable Indexing by default
				useContext: true, // Enable Use Context by default
				useSyncWithApi: true, // Enable Sync with API by default
				useSecretScanning: true, // Enable Secret Scanning by default
			},
			buildIndexProgress: buildIndexProgress,
			autoApprovalSettings: autoApprovalSettings || DEFAULT_AUTO_APPROVAL_SETTINGS, // default value can be 0 or empty string
			browserSettings: browserSettings || DEFAULT_BROWSER_SETTINGS,
			chatSettings: chatSettings || DEFAULT_CHAT_SETTINGS,
			userInfo,
			previousModeApiProvider,
			previousModeModelId,
			previousModeModelInfo,
			previousModeVsCodeLmModelSelector,
			previousModeThinkingBudgetTokens,
			mcpMarketplaceEnabled,
			telemetrySetting: telemetrySetting || "unset",
			planActSeparateModelsSetting,
		}
	}

	async updateTaskHistory(item: HistoryItem): Promise<HistoryItem[]> {
		const history = ((await this.customGetState("taskHistory")) as HistoryItem[]) || []
		const existingItemIndex = history.findIndex((h) => h.id === item.id)
		if (existingItemIndex !== -1) {
			history[existingItemIndex] = item
		} else {
			history.push(item)
		}
		await this.customUpdateState("taskHistory", history)
		return history
	}

	async customUpdateState(key: string, value: any) {
		if (this.isCustomGlobalKey(key)) {
			await this.customUpdateState(key as GlobalStateKey, value)
		}
		await this.updateWorkspaceState(key, value)
	}

	async customGetState(key: string) {
		const value = await this.getWorkspaceState(key)
		if (this.isCustomGlobalKey(key)) {
			if (!value) {
				return await this.getGlobalState(key as GlobalStateKey)
			}
			return value
		}
		return value
	}

	// global

	async updateGlobalState(key: GlobalStateKey, value: any) {
		await this.context.globalState.update(key, value)
	}

	async getGlobalState(key: GlobalStateKey) {
		return await this.context.globalState.get(key)
	}

	// workspace

	private async updateWorkspaceState(key: string, value: any) {
		await this.context.workspaceState.update(key, value)
	}

	private async getWorkspaceState(key: string) {
		return await this.context.workspaceState.get(key)
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

	async customStoreSecret(key: SecretKey, value?: string, isDelete: boolean = false) {
		if (!(await this.getSecret(key)) || isDelete) {
			await this.customStoreSecret(key as SecretKey, value)
		}
		await this.customStoreSecret(`${this.workspaceId}-${key}` as SecretKey, value)
	}

	async customGetSecret(key: SecretKey, defaultGlobal: boolean = true) {
		let workspaceSecret = await this.getSecret(`${this.workspaceId}-${key}` as SecretKey)
		if (!defaultGlobal) {
			return workspaceSecret
		}

		if (!workspaceSecret) {
			return await this.getSecret(key as SecretKey)
		}
		return workspaceSecret
	}

	// secrets

	private async storeSecret(key: SecretKey, value?: string) {
		if (value) {
			await this.context.secrets.store(key, value)
		} else {
			await this.context.secrets.delete(key)
		}
	}

	async getSecret(key: SecretKey) {
		return await this.context.secrets.get(key)
	}

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

	// Check if a URL is an image
	async checkIsImageUrl(url: string) {
		try {
			// Check if the URL is an image
			const isImage = await isImageUrl(url)

			// Send the result back to the webview
			await this.postMessageToWebview({
				type: "isImageUrlResult",
				isImage,
				url,
			})
		} catch (error) {
			console.error(`Error checking if URL is an image: ${url}`, error)
			// Send an error response
			await this.postMessageToWebview({
				type: "isImageUrlResult",
				isImage: false,
				url,
			})
		}
	}

	// dev

	async resetState() {
		vscode.window.showInformationMessage("Resetting state...")
		if (!this.codeIndexAbortController.signal.aborted) {
			this.codeIndexAbortController.abort()
			this.isCodeIndexInProgress = false
		}
		for (const key of this.context.workspaceState.keys()) {
			await this.context.workspaceState.update(key, undefined)
		}
		for (const key of this.context.globalState.keys()) {
			await this.context.globalState.update(key, undefined)
		}

		const secretKeys: SecretKey[] = [
			"apiKey",
			"openRouterApiKey",
			"awsAccessKey",
			"awsSecretKey",
			"awsSessionToken",
			"openAiApiKey",
			"geminiApiKey",
			"openAiNativeApiKey",
			"deepSeekApiKey",
			"requestyApiKey",
			"togetherApiKey",
			"qwenApiKey",
			"mistralApiKey",
			"clineApiKey",
			"liteLlmApiKey",
			"asksageApiKey",
			"xaiApiKey",
			"sambanovaApiKey",

			// Embedding Keys
			"embeddingAwsAccessKey",
			"embeddingAwsSecretKey",
			"embeddingAwsSessionToken",
			"embeddingOpenAiApiKey",
			"embeddingOpenAiNativeApiKey",
			"embeddingAzureOpenAIApiKey",
		]
		for (const key of secretKeys) {
			await this.customStoreSecret(key as SecretKey, undefined, true)
		}
		if (this.cline) {
			this.cline.abortTask()
			this.cline = undefined
		}
		vscode.window.showInformationMessage("State reset")
		await this.postStateToWebview()
		await this.postMessageToWebview({
			type: "action",
			action: "chatButtonClicked",
		})
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
					haiTaskList = [...haiTaskList, ...JSON.parse(content).features]
				})
			return haiTaskList
		} catch (e) {
			console.error("Error reading hai task list", e)
		}
		return []
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
					this.updateWorkspaceState("haiConfig", { folder: fileUri[0].fsPath, ts })
				}
			})
		} else {
			const ts = getFormattedDateTime()
			this.fetchTaskFromSelectedFolder(path, ts)
			this.updateWorkspaceState("haiConfig", { folder: path, ts })
		}
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
}
