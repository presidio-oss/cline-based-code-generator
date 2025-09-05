import { setTimeout as setTimeoutPromise } from "node:timers/promises"
import { Anthropic } from "@anthropic-ai/sdk"
import { buildApiHandler } from "@core/api"
import { cleanupLegacyCheckpoints } from "@integrations/checkpoints/CheckpointMigration"
import { downloadTask } from "@integrations/misc/export-markdown"
import { ClineAccountService } from "@services/account/ClineAccountService"
import { McpHub } from "@services/mcp/McpHub"
import { ApiProvider, ModelInfo } from "@shared/api"
import { ChatContent } from "@shared/ChatContent"
import { ExtensionState, Platform } from "@shared/ExtensionMessage"
import { HistoryItem } from "@shared/HistoryItem"
import { McpMarketplaceCatalog } from "@shared/mcp"
import { Mode } from "@shared/storage/types"
import { TelemetrySetting } from "@shared/TelemetrySetting"
import { UserInfo } from "@shared/UserInfo"
import { fileExistsAtPath } from "@utils/fs"
import axios from "axios"
import fs from "fs/promises"
import pWaitFor from "p-wait-for"
import * as path from "path"
import * as vscode from "vscode"
import { clineEnvConfig } from "@/config"
import { buildEmbeddingHandler } from "@/embedding"
import { HostProvider } from "@/hosts/host-provider"
import { CodeContextAdditionAgent } from "@/integrations/code-prep/CodeContextAddition"
import { ICodeIndexProgress } from "@/integrations/code-prep/type"
import { VectorizeCodeAgent } from "@/integrations/code-prep/VectorizeCodeAgent"
import HaiFileSystemWatcher from "@/integrations/workspace/HaiFileSystemWatcher"
import { AuthService } from "@/services/auth/AuthService"
import { getStarCount } from "@/services/github/github"
import { PostHogClientProvider, posthogClientProvider, telemetryService } from "@/services/posthog/PostHogClientProvider"
import { HaiBuildIndexProgress } from "@/shared/customApi"
import { ShowMessageRequest, ShowMessageType } from "@/shared/proto/host/window"
import { getLatestAnnouncementId } from "@/utils/announcements"
import { FileOperations } from "@/utils/constants"
import { getFormattedDateTime } from "@/utils/date"
import { deleteFromContextDirectory } from "@/utils/delete-helper"
import { ensureFaissPlatformDeps } from "@/utils/faiss"
import { getAllLocalMcps, getLocalMcp } from "@/utils/local-mcp-registry"
import { getCwd, getDesktopDir, getWorkspaceID, getWorkspacePath } from "@/utils/path"
import { validateApiConfiguration, validateEmbeddingConfiguration } from "@/utils/validate"
import { ExpertFileManager } from "../experts/ExpertFileManager"
import { ExpertManager } from "../experts/ExpertManager"
import { CacheService, PersistenceErrorEvent } from "../storage/CacheService"
import { ensureMcpServersDirectoryExists, ensureSettingsDirectoryExists, GlobalFileNames } from "../storage/disk"
import { Task } from "../task"
import { WebviewProvider } from "../webview"
import { CodeContextErrorMessage, CodeIndexStartMessage } from "../webview/customClientProvider"
import { sendMcpMarketplaceCatalogEvent } from "./mcp/subscribeToMcpMarketplaceCatalog"
import { sendStateUpdate } from "./state/subscribeToState"

/*
https://github.com/microsoft/vscode-webview-ui-toolkit-samples/blob/main/default/weather-webview/src/providers/WeatherViewProvider.ts

https://github.com/KumarVariable/vscode-extension-sidebar-html/blob/master/src/customSidebarViewProvider.ts
*/

export const EXPERT_PROMPT_URI_SCHEME = "hai-expert-prompt"

export class Controller {
	readonly id: string
	private disposables: vscode.Disposable[] = []
	task?: Task

	mcpHub: McpHub
	accountService: ClineAccountService
	authService: AuthService
	readonly cacheService: CacheService
	private cacheServiceInitialized: Promise<void>

	// TAG:HAI
	fileSystemWatcher: HaiFileSystemWatcher | undefined
	workspaceId: string
	vsCodeWorkSpaceFolderFsPath!: string
	codeIndexAbortController: AbortController
	isSideBar: boolean
	isCodeIndexInProgress: boolean = false
	expertManager: ExpertManager | undefined

	constructor(
		readonly context: vscode.ExtensionContext,
		id: string,
		isSideBar: boolean = true,
	) {
		this.id = id

		HostProvider.get().logToChannel("HAIProvider  instantiated")
		this.accountService = ClineAccountService.getInstance()
		this.cacheService = new CacheService(context)
		this.authService = AuthService.getInstance(this)

		// Initialize cache service asynchronously - critical for extension functionality
		this.cacheServiceInitialized = this.cacheService
			.initialize()
			.then(() => {
				this.authService.restoreRefreshTokenAndRetrieveAuthInfo()
			})
			.catch((error) => {
				console.error("CRITICAL: Failed to initialize CacheService - extension may not function properly:", error)
				throw error
			})

		// Set up persistence error recovery
		this.cacheService.onPersistenceError = async ({ error }: PersistenceErrorEvent) => {
			console.error("Cache persistence failed, recovering:", error)
			try {
				await this.cacheService.reInitialize()
				await this.postStateToWebview()
				HostProvider.window.showMessage({
					type: ShowMessageType.WARNING,
					message: "Saving settings to storage failed.",
				})
			} catch (recoveryError) {
				console.error("Cache recovery failed:", recoveryError)
				HostProvider.window.showMessage({
					type: ShowMessageType.ERROR,
					message: "Failed to save settings. Please restart the extension.",
				})
			}
		}

		this.mcpHub = new McpHub(
			() => ensureMcpServersDirectoryExists(),
			() => ensureSettingsDirectoryExists(this.context),
			this.context.extension?.packageJSON?.version ?? "1.0.0",
			telemetryService,
		)

		// Clean up legacy checkpoints
		cleanupLegacyCheckpoints(this.context.globalStorageUri.fsPath).catch((error) => {
			console.error("Failed to cleanup legacy checkpoints:", error)
		})

		// TAG:HAI
		this.initWorkspaceFolderFsPath()
		this.workspaceId = getWorkspaceID() || ""
		this.codeIndexAbortController = new AbortController()
		this.isSideBar = isSideBar
		const registration = vscode.workspace.registerTextDocumentContentProvider(
			EXPERT_PROMPT_URI_SCHEME,
			this.expertPromptProvider,
		)
		this.disposables.push(registration)
	}

	/**
	 * Wait for the CacheService to be initialized
	 * @returns Promise that resolves when CacheService is ready
	 */
	async waitForCacheServiceInitialization(): Promise<void> {
		return this.cacheServiceInitialized
	}

	// TAG:HAI
	async getExpertManager(): Promise<ExpertManager> {
		if (!this.expertManager) {
			this.expertManager = new ExpertManager(this.context, this.workspaceId, this.cacheService)
		}
		return this.expertManager
	}

	/**
	 * Initialize embeddings in ExpertManager
	 */
	public async initializeExpertManagerEmbeddings(): Promise<void> {
		await this.cacheServiceInitialized
		if (!this.expertManager) {
			this.expertManager = new ExpertManager(this.context, this.workspaceId, this.cacheService)
		}
		const embeddingConfiguration = this.cacheService.getEmbeddingConfiguration()
		const embeddingHandler = buildEmbeddingHandler({
			...embeddingConfiguration,
			maxRetries: 0,
		})
		const isEmbeddingValid = await embeddingHandler.validateAPIKey()
		if (isEmbeddingValid) {
			this.expertManager.initializeEmbeddings(embeddingConfiguration)
		}
	}

	private async initWorkspaceFolderFsPath() {
		this.vsCodeWorkSpaceFolderFsPath = ((await getWorkspacePath()) || "").trim()
		if (this.vsCodeWorkSpaceFolderFsPath) {
			console.log("Workspace folder path:", this.vsCodeWorkSpaceFolderFsPath)
			this.fileSystemWatcher = new HaiFileSystemWatcher(this, this.vsCodeWorkSpaceFolderFsPath)
			this.codeIndexBackground()
		}
	}

	async getCurrentMode(): Promise<Mode> {
		await this.cacheServiceInitialized
		return this.cacheService.getGlobalStateKey("mode")
	}

	/*
	VSCode extensions use the disposable pattern to clean up resources when the sidebar/editor tab is closed by the user or system. This applies to event listening, commands, interacting with the UI, etc.
	- https://vscode-docs.readthedocs.io/en/stable/extensions/patterns-and-principles/
	- https://github.com/microsoft/vscode-extension-samples/blob/main/webview-sample/src/extension.ts
	*/
	async dispose() {
		await this.clearTask()
		while (this.disposables.length) {
			const x = this.disposables.pop()
			if (x) {
				x.dispose()
			}
		}
		this.mcpHub.dispose()

		console.error("Controller disposed")
	}

	// Auth methods
	async handleSignOut() {
		try {
			// TODO: update to clineAccountId and then move clineApiKey to a clear function.
			this.cacheService.setSecret("clineAccountId", undefined)
			this.cacheService.setGlobalState("userInfo", undefined)

			// Update API providers through cache service
			const apiConfiguration = this.cacheService.getApiConfiguration()
			const updatedConfig = {
				...apiConfiguration,
				planModeApiProvider: "openrouter" as ApiProvider,
				actModeApiProvider: "openrouter" as ApiProvider,
			}
			this.cacheService.setApiConfiguration(updatedConfig)

			await this.postStateToWebview()
			HostProvider.window.showMessage({
				type: ShowMessageType.INFORMATION,
				message: "Successfully logged out of Cline",
			})
		} catch (_error) {
			HostProvider.window.showMessage({
				type: ShowMessageType.INFORMATION,
				message: "Logout failed",
			})
		}
	}

	async setUserInfo(info?: UserInfo) {
		this.cacheService.setGlobalState("userInfo", info)
	}

	async initTask(task?: string, images?: string[], files?: string[], historyItem?: HistoryItem) {
		await this.clearTask() // ensures that an existing task doesn't exist before starting a new one, although this shouldn't be possible since user must clear task before starting a new one

		const apiConfiguration = this.cacheService.getApiConfiguration()
		const embeddingConfiguration = this.cacheService.getEmbeddingConfiguration()
		const autoApprovalSettings = this.cacheService.getGlobalStateKey("autoApprovalSettings")
		const browserSettings = this.cacheService.getGlobalStateKey("browserSettings")
		const focusChainSettings = this.cacheService.getGlobalStateKey("focusChainSettings")
		const focusChainFeatureFlagEnabled = this.cacheService.getGlobalStateKey("focusChainFeatureFlagEnabled")
		const preferredLanguage = this.cacheService.getGlobalStateKey("preferredLanguage")
		const openaiReasoningEffort = this.cacheService.getGlobalStateKey("openaiReasoningEffort")
		const mode = this.cacheService.getGlobalStateKey("mode")
		const shellIntegrationTimeout = this.cacheService.getGlobalStateKey("shellIntegrationTimeout")
		const terminalReuseEnabled = this.cacheService.getGlobalStateKey("terminalReuseEnabled")
		const terminalOutputLineLimit = this.cacheService.getGlobalStateKey("terminalOutputLineLimit")
		const defaultTerminalProfile = this.cacheService.getGlobalStateKey("defaultTerminalProfile")
		const enableCheckpointsSetting = this.cacheService.getGlobalStateKey("enableCheckpointsSetting")
		const isNewUser = this.cacheService.getGlobalStateKey("isNewUser")
		const taskHistory = this.cacheService.getGlobalStateKey("taskHistory")
		const strictPlanModeEnabled = this.cacheService.getGlobalStateKey("strictPlanModeEnabled")
		const useAutoCondense = this.cacheService.getGlobalStateKey("useAutoCondense")
		const buildContextOptions = this.cacheService.getWorkspaceStateKey("buildContextOptions")
		const expertPrompt = this.cacheService.getGlobalStateKey("expertPrompt")
		const expertName = this.cacheService.getGlobalStateKey("expertName")
		const isDeepCrawlEnabled = this.cacheService.getGlobalStateKey("isDeepCrawlEnabled")

		const NEW_USER_TASK_COUNT_THRESHOLD = 10

		// Check if the user has completed enough tasks to no longer be considered a "new user"
		if (isNewUser && !historyItem && taskHistory && taskHistory.length >= NEW_USER_TASK_COUNT_THRESHOLD) {
			this.cacheService.setGlobalState("isNewUser", false)
			await this.postStateToWebview()
		}

		if (autoApprovalSettings) {
			const updatedAutoApprovalSettings = {
				...autoApprovalSettings,
				version: (autoApprovalSettings.version ?? 1) + 1,
			}
			this.cacheService.setGlobalState("autoApprovalSettings", updatedAutoApprovalSettings)
		}
		// Apply remote feature flag gate to focus chain settings
		const effectiveFocusChainSettings = {
			...(focusChainSettings || { enabled: true, remindClineInterval: 6 }),
			enabled: Boolean(focusChainSettings?.enabled) && Boolean(focusChainFeatureFlagEnabled),
		}

		this.task = new Task(
			this,
			this.mcpHub,
			(historyItem) => this.updateTaskHistory(historyItem),
			() => this.postStateToWebview(),
			(taskId) => this.reinitExistingTaskFromId(taskId),
			() => this.cancelTask(),
			apiConfiguration,
			autoApprovalSettings,
			browserSettings,
			effectiveFocusChainSettings,
			preferredLanguage,
			openaiReasoningEffort,
			mode,
			strictPlanModeEnabled ?? true,
			useAutoCondense ?? true,
			shellIntegrationTimeout,
			terminalReuseEnabled ?? true,
			terminalOutputLineLimit ?? 500,
			defaultTerminalProfile ?? "default",
			enableCheckpointsSetting ?? true,
			await getCwd(getDesktopDir()),
			embeddingConfiguration,
			this.cacheService,
			task,
			images,
			files,
			historyItem,

			// TAG:HAI
			expertPrompt,
			expertName,
			isDeepCrawlEnabled,
			buildContextOptions,
		)
	}

	async reinitExistingTaskFromId(taskId: string) {
		const history = await this.getTaskWithId(taskId)
		if (history) {
			await this.initTask(undefined, undefined, undefined, history.historyItem)
		}
	}

	async updateTelemetrySetting(telemetrySetting: TelemetrySetting) {
		this.cacheService.setGlobalState("telemetrySetting", telemetrySetting)
		const isOptedIn = telemetrySetting !== "disabled"
		telemetryService.updateTelemetryState(isOptedIn)
		await this.postStateToWebview()
	}

	async togglePlanActMode(modeToSwitchTo: Mode, chatContent?: ChatContent): Promise<boolean> {
		const didSwitchToActMode = modeToSwitchTo === "act"

		// Store mode to global state
		this.cacheService.setGlobalState("mode", modeToSwitchTo)

		// Capture mode switch telemetry | Capture regardless of if we know the taskId
		telemetryService.captureModeSwitch(this.task?.ulid ?? "0", modeToSwitchTo)

		// Update API handler with new mode (buildApiHandler now selects provider based on mode)
		if (this.task) {
			const apiConfiguration = this.cacheService.getApiConfiguration()
			this.task.api = buildApiHandler({ ...apiConfiguration, ulid: this.task.ulid }, modeToSwitchTo)
		}

		await this.postStateToWebview()

		if (this.task) {
			this.task.updateMode(modeToSwitchTo)
			if (this.task.taskState.isAwaitingPlanResponse && didSwitchToActMode) {
				this.task.taskState.didRespondToPlanAskBySwitchingMode = true
				// Use chatContent if provided, otherwise use default message
				await this.task.handleWebviewAskResponse(
					"messageResponse",
					chatContent?.message || "PLAN_MODE_TOGGLE_RESPONSE",
					chatContent?.images || [],
					chatContent?.files || [],
				)

				return true
			} else {
				this.cancelTask()
				return false
			}
		}

		return false
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
					this.task.taskState.isStreaming === false ||
					this.task.taskState.didFinishAbortingStream ||
					this.task.taskState.isWaitingForFirstChunk, // if only first chunk is processed, then there's no need to wait for graceful abort (closes edits, browser, etc)
				{
					timeout: 3_000,
				},
			).catch(() => {
				console.error("Failed to abort task")
			})
			if (this.task) {
				// 'abandoned' will prevent this cline instance from affecting future cline instance gui. this may happen if its hanging on a streaming request
				this.task.taskState.abandoned = true
			}
			await this.initTask(undefined, undefined, undefined, historyItem) // clears task again, so we need to abortTask manually above
			// Dont send the state to the webview, the new HAI instance will send state when it's ready.
			// Sending the state here sent an empty messages array to webview leading to virtuoso having to reload the entire list
		}
	}

	async handleAuthCallback(customToken: string, provider: string | null = null) {
		try {
			await this.authService.handleAuthCallback(customToken, provider ? provider : "google")

			const clineProvider: ApiProvider = "cline"

			// Get current settings to determine how to update providers
			const planActSeparateModelsSetting = this.cacheService.getGlobalStateKey("planActSeparateModelsSetting")

			const currentMode = await this.getCurrentMode()

			// Get current API configuration from cache
			const currentApiConfiguration = this.cacheService.getApiConfiguration()

			const updatedConfig = { ...currentApiConfiguration }

			if (planActSeparateModelsSetting) {
				// Only update the current mode's provider
				if (currentMode === "plan") {
					updatedConfig.planModeApiProvider = clineProvider
				} else {
					updatedConfig.actModeApiProvider = clineProvider
				}
			} else {
				// Update both modes to keep them in sync
				updatedConfig.planModeApiProvider = clineProvider
				updatedConfig.actModeApiProvider = clineProvider
			}

			// Update the API configuration through cache service
			this.cacheService.setApiConfiguration(updatedConfig)

			// Mark welcome view as completed since user has successfully logged in
			this.cacheService.setGlobalState("welcomeViewCompleted", true)

			if (this.task) {
				this.task.api = buildApiHandler({ ...updatedConfig, ulid: this.task.ulid }, currentMode)
			}

			await this.postStateToWebview()
		} catch (error) {
			console.error("Failed to handle auth callback:", error)
			HostProvider.window.showMessage({
				type: ShowMessageType.ERROR,
				message: "Failed to log in to Cline",
			})
			// Even on login failure, we preserve any existing tokens
			// Only clear tokens on explicit logout
		}
	}

	// MCP Marketplace
	private async fetchMcpMarketplaceFromApi(silent: boolean = false): Promise<McpMarketplaceCatalog | undefined> {
		try {
			const response = await axios.get(`${clineEnvConfig.mcpBaseUrl}/marketplace`, {
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
			this.cacheService.setGlobalState("mcpMarketplaceCatalog", catalog)
			return catalog
		} catch (error) {
			console.error("Failed to fetch MCP marketplace:", error)
			if (!silent) {
				const errorMessage = error instanceof Error ? error.message : "Failed to fetch MCP marketplace"
				HostProvider.window.showMessage({
					type: ShowMessageType.ERROR,
					message: errorMessage,
				})
			}
			return undefined
		}
	}

	private async fetchMcpMarketplaceFromApiRPC(silent: boolean = false): Promise<McpMarketplaceCatalog | undefined> {
		try {
			const response = await axios.get(`${clineEnvConfig.mcpBaseUrl}/marketplace`, {
				headers: {
					"Content-Type": "application/json",
					"User-Agent": "cline-vscode-extension",
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
			this.cacheService.setGlobalState("mcpMarketplaceCatalog", catalog)
			return catalog
		} catch (error) {
			console.error("Failed to fetch MCP marketplace:", error)
			if (!silent) {
				const errorMessage = error instanceof Error ? error.message : "Failed to fetch MCP marketplace"
				throw new Error(errorMessage)
			}
			return undefined
		}
	}

	async silentlyRefreshMcpMarketplace() {
		try {
			const catalog = await this.fetchMcpMarketplaceFromApi(true)
			if (catalog) {
				await sendMcpMarketplaceCatalogEvent(catalog)
			}
		} catch (error) {
			console.error("Failed to silently refresh MCP marketplace:", error)
		}
	}

	/**
	 * RPC variant that silently refreshes the MCP marketplace catalog and returns the result
	 * Unlike silentlyRefreshMcpMarketplace, this doesn't send a message to the webview
	 * @returns MCP marketplace catalog or undefined if refresh failed
	 */
	async silentlyRefreshMcpMarketplaceRPC() {
		try {
			return await this.fetchMcpMarketplaceFromApiRPC(true)
		} catch (error) {
			console.error("Failed to silently refresh MCP marketplace (RPC):", error)
			return undefined
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
		const currentMode = await this.getCurrentMode()

		// Update API configuration through cache service
		const currentApiConfiguration = this.cacheService.getApiConfiguration()
		const updatedConfig = {
			...currentApiConfiguration,
			planModeApiProvider: openrouter,
			actModeApiProvider: openrouter,
			openRouterApiKey: apiKey,
		}
		this.cacheService.setApiConfiguration(updatedConfig)

		await this.postStateToWebview()
		if (this.task) {
			this.task.api = buildApiHandler({ ...updatedConfig, ulid: this.task.ulid }, currentMode)
		}
		// Dont send settingsButtonClicked because its bad ux if user is on welcome
	}

	private async ensureCacheDirectoryExists(): Promise<string> {
		const cacheDir = path.join(this.context.globalStorageUri.fsPath, "cache")
		await fs.mkdir(cacheDir, { recursive: true })
		return cacheDir
	}

	// Read OpenRouter models from disk cache
	async readOpenRouterModels(): Promise<Record<string, ModelInfo> | undefined> {
		const openRouterModelsFilePath = path.join(await this.ensureCacheDirectoryExists(), GlobalFileNames.openRouterModels)
		const fileExists = await fileExistsAtPath(openRouterModelsFilePath)
		if (fileExists) {
			const fileContents = await fs.readFile(openRouterModelsFilePath, "utf8")
			return JSON.parse(fileContents)
		}
		return undefined
	}

	// Read Vercel AI Gateway models from disk cache
	async readVercelAiGatewayModels(): Promise<Record<string, ModelInfo> | undefined> {
		const vercelAiGatewayModelsFilePath = path.join(
			await this.ensureCacheDirectoryExists(),
			GlobalFileNames.vercelAiGatewayModels,
		)
		const fileExists = await fileExistsAtPath(vercelAiGatewayModelsFilePath)
		if (fileExists) {
			const fileContents = await fs.readFile(vercelAiGatewayModelsFilePath, "utf8")
			return JSON.parse(fileContents)
		}
		return undefined
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
		const history = this.cacheService.getGlobalStateKey("taskHistory")
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

	async exportTaskWithId(id: string) {
		const { historyItem, apiConversationHistory } = await this.getTaskWithId(id)
		await downloadTask(historyItem.ts, apiConversationHistory)
	}

	async deleteTaskFromState(id: string) {
		// Remove the task from history
		const taskHistory = this.cacheService.getGlobalStateKey("taskHistory")
		const updatedTaskHistory = taskHistory.filter((task) => task.id !== id)
		this.cacheService.setGlobalState("taskHistory", updatedTaskHistory)

		// Notify the webview that the task has been deleted
		await this.postStateToWebview()

		return updatedTaskHistory
	}

	async postStateToWebview() {
		const state = await this.getStateToPostToWebview()
		await sendStateUpdate(this.id, state)
	}

	async getStateToPostToWebview(): Promise<ExtensionState> {
		// Wait for cache service initialization before accessing state
		await this.cacheServiceInitialized
		// Get API configuration from cache for immediate access
		const apiConfiguration = this.cacheService.getApiConfiguration()
		const embeddingConfiguration = this.cacheService.getEmbeddingConfiguration()
		const lastShownAnnouncementId = this.cacheService.getGlobalStateKey("lastShownAnnouncementId")
		const taskHistory = this.cacheService.getGlobalStateKey("taskHistory")
		const autoApprovalSettings = this.cacheService.getGlobalStateKey("autoApprovalSettings")
		const browserSettings = this.cacheService.getGlobalStateKey("browserSettings")
		const focusChainSettings = this.cacheService.getGlobalStateKey("focusChainSettings")
		const focusChainFeatureFlagEnabled = this.cacheService.getGlobalStateKey("focusChainFeatureFlagEnabled")
		const preferredLanguage = this.cacheService.getGlobalStateKey("preferredLanguage")
		const openaiReasoningEffort = this.cacheService.getGlobalStateKey("openaiReasoningEffort")
		const mode = this.cacheService.getGlobalStateKey("mode")
		const strictPlanModeEnabled = this.cacheService.getGlobalStateKey("strictPlanModeEnabled")
		const useAutoCondense = this.cacheService.getGlobalStateKey("useAutoCondense")
		const userInfo = this.cacheService.getGlobalStateKey("userInfo")
		const mcpMarketplaceEnabled = this.cacheService.getGlobalStateKey("mcpMarketplaceEnabled")
		const mcpDisplayMode = this.cacheService.getGlobalStateKey("mcpDisplayMode")
		const telemetrySetting = this.cacheService.getGlobalStateKey("telemetrySetting")
		const planActSeparateModelsSetting = this.cacheService.getGlobalStateKey("planActSeparateModelsSetting")
		const enableCheckpointsSetting = this.cacheService.getGlobalStateKey("enableCheckpointsSetting")
		const globalClineRulesToggles = this.cacheService.getGlobalStateKey("globalClineRulesToggles")
		const globalWorkflowToggles = this.cacheService.getGlobalStateKey("globalWorkflowToggles")
		const shellIntegrationTimeout = this.cacheService.getGlobalStateKey("shellIntegrationTimeout")
		const terminalReuseEnabled = this.cacheService.getGlobalStateKey("terminalReuseEnabled")
		const defaultTerminalProfile = this.cacheService.getGlobalStateKey("defaultTerminalProfile")
		const isNewUser = this.cacheService.getGlobalStateKey("isNewUser")
		const welcomeViewCompleted = Boolean(
			this.cacheService.getGlobalStateKey("welcomeViewCompleted") || this.authService.getInfo()?.user?.uid,
		)
		const customPrompt = this.cacheService.getGlobalStateKey("customPrompt")
		const mcpResponsesCollapsed = this.cacheService.getGlobalStateKey("mcpResponsesCollapsed")
		const terminalOutputLineLimit = this.cacheService.getGlobalStateKey("terminalOutputLineLimit")
		const localClineRulesToggles = this.cacheService.getWorkspaceStateKey("localClineRulesToggles")
		const localWindsurfRulesToggles = this.cacheService.getWorkspaceStateKey("localWindsurfRulesToggles")
		const localCursorRulesToggles = this.cacheService.getWorkspaceStateKey("localCursorRulesToggles")
		const workflowToggles = this.cacheService.getWorkspaceStateKey("workflowToggles")
		const enableInlineEdit = this.cacheService.getGlobalStateKey("enableInlineEdit")
		const buildContextOptions = this.cacheService.getWorkspaceStateKey("buildContextOptions")
		const buildIndexProgress = this.cacheService.getWorkspaceStateKey("buildIndexProgress")

		const currentTaskItem = this.task?.taskId ? (taskHistory || []).find((item) => item.id === this.task?.taskId) : undefined
		const checkpointTrackerErrorMessage = this.task?.taskState.checkpointTrackerErrorMessage
		const clineMessages = this.task?.messageStateHandler.getClineMessages() || []

		const processedTaskHistory = (taskHistory || [])
			.filter((item) => item.ts && item.task)
			.sort((a, b) => b.ts - a.ts)
			.slice(0, 100) // for now we're only getting the latest 100 tasks, but a better solution here is to only pass in 3 for recent task history, and then get the full task history on demand when going to the task history view (maybe with pagination?)

		const latestAnnouncementId = getLatestAnnouncementId(this.context)
		const shouldShowAnnouncement = lastShownAnnouncementId !== latestAnnouncementId
		const platform = process.platform as Platform
		const distinctId = PostHogClientProvider.getInstance().distinctId
		const version = this.context.extension?.packageJSON?.version ?? ""
		const uriScheme = vscode.env.uriScheme

		return {
			version,
			apiConfiguration,
			embeddingConfiguration,
			uriScheme,
			currentTaskItem,
			checkpointTrackerErrorMessage,
			clineMessages,
			currentFocusChainChecklist: this.task?.taskState.currentFocusChainChecklist || null,
			taskHistory: processedTaskHistory,
			shouldShowAnnouncement,
			platform,
			autoApprovalSettings,
			browserSettings,
			focusChainSettings,
			focusChainFeatureFlagEnabled,
			preferredLanguage,
			openaiReasoningEffort,
			mode,
			strictPlanModeEnabled,
			useAutoCondense,
			userInfo,
			mcpMarketplaceEnabled,
			mcpDisplayMode,
			telemetrySetting,
			planActSeparateModelsSetting,
			enableCheckpointsSetting: enableCheckpointsSetting ?? true,
			distinctId,
			globalClineRulesToggles: globalClineRulesToggles || {},
			localClineRulesToggles: localClineRulesToggles || {},
			localWindsurfRulesToggles: localWindsurfRulesToggles || {},
			localCursorRulesToggles: localCursorRulesToggles || {},
			localWorkflowToggles: workflowToggles || {},
			globalWorkflowToggles: globalWorkflowToggles || {},
			shellIntegrationTimeout,
			terminalReuseEnabled,
			defaultTerminalProfile,
			isNewUser,
			welcomeViewCompleted: welcomeViewCompleted as boolean, // Can be undefined but is set to either true or false by the migration that runs on extension launch in extension.ts
			mcpResponsesCollapsed,
			terminalOutputLineLimit,
			customPrompt,

			// TAG:HAI
			enableInlineEdit: enableInlineEdit ?? true,
			buildContextOptions: buildContextOptions || undefined,
			vscodeWorkspacePath: this.vsCodeWorkSpaceFolderFsPath,
			buildIndexProgress: buildIndexProgress || undefined,
		}
	}

	async clearTask() {
		if (this.task) {
		}
		await this.task?.abortTask()
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

	async updateTaskHistory(item: HistoryItem): Promise<HistoryItem[]> {
		const history = this.cacheService.getGlobalStateKey("taskHistory")
		const existingItemIndex = history.findIndex((h) => h.id === item.id)
		if (existingItemIndex !== -1) {
			history[existingItemIndex] = item
		} else {
			history.push(item)
		}
		this.cacheService.setGlobalState("taskHistory", history)
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

	// dev

	// TAG:HAI

	expertPromptProvider = new (class implements vscode.TextDocumentContentProvider {
		provideTextDocumentContent(uri: vscode.Uri): string {
			return Buffer.from(uri.query, "base64").toString("utf-8")
		}
	})()

	async codeIndexBackground(filePaths?: string[], reIndex: boolean = false, isManualTrigger: boolean = false) {
		if (!this.isSideBar || this.codeIndexAbortController.signal.aborted || this.isCodeIndexInProgress) {
			return
		}
		await ensureFaissPlatformDeps()
		const updateProgressState = async (data: Partial<HaiBuildIndexProgress>) => {
			const state = this.cacheService.getWorkspaceStateKey("buildIndexProgress")
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
				this.cacheService.setWorkspaceState("buildIndexProgress", stateVal)
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
		const apiConfiguration = this.cacheService.getApiConfiguration()
		const buildContextOptions = this.cacheService.getWorkspaceStateKey("buildContextOptions")
		const embeddingConfiguration = this.cacheService.getEmbeddingConfiguration()
		const buildIndexProgress = this.cacheService.getWorkspaceStateKey("buildIndexProgress")
		const currentMode = await this.getCurrentMode()
		const isValidApiConfiguration = validateApiConfiguration(currentMode, apiConfiguration) === undefined
		const isValidEmbeddingConfiguration = validateEmbeddingConfiguration(embeddingConfiguration) === undefined
		if (isValidApiConfiguration && isValidEmbeddingConfiguration) {
			try {
				if (!this.vsCodeWorkSpaceFolderFsPath) {
					return
				}
				if (buildContextOptions.useIndex) {
					if (!isManualTrigger && (!buildIndexProgress || !buildIndexProgress.progress)) {
						const message =
							"HAI performs best with a code index. Would you like to navigate to Settings to start indexing for this workspace?"
						const userConfirmation = (
							await HostProvider.window.showMessage(
								ShowMessageRequest.create({
									type: ShowMessageType.WARNING,
									message,
									options: {
										items: ["Open Settings", "No"],
									},
								}),
							)
						).selectedOption

						if (userConfirmation === undefined) {
							return
						}
						if (userConfirmation === "No") {
							buildContextOptions.useIndex = false
							this.cacheService.setWorkspaceState("buildContextOptions", buildContextOptions)
							if (this.task) {
								this.task.buildContextOptions = buildContextOptions
							}
							await this.postStateToWebview()
							return
						}
						if (userConfirmation === "Open Settings") {
							await vscode.commands.executeCommand("hai.settingsButtonClicked")
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
									.withCurrentMode(currentMode)
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
									HostProvider.get().logToChannel(
										`codeContextAgentProgress ${progress.type} ${progress.value}%`,
									)
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
									HostProvider.window.showMessage({
										type: ShowMessageType.ERROR,
										message: `Code context failed: ${error.message}`,
									})

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
								HostProvider.get().logToChannel(`vectorizeCodeAgentProgress: ${progress.type} ${progress.value}%`)
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
								HostProvider.window.showMessage({
									type: ShowMessageType.ERROR,
									message: `Indexing failed: ${error.message}`,
								})
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
				HostProvider.window.showMessage({ type: ShowMessageType.ERROR, message: CodeContextErrorMessage })
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

	async updateExpertPrompt(prompt?: string, expertName?: string) {
		let additionalContext = ""

		if (expertName) {
			additionalContext = await this.getExpertDocumentsContent(expertName)
		}

		const updatedPrompt = prompt ? `${prompt}${additionalContext}` : additionalContext

		this.cacheService.setGlobalState("expertPrompt", updatedPrompt)

		if (this.task) {
			this.task.expertPrompt = updatedPrompt || undefined
		}

		await this.postStateToWebview()
	}

	async updateTelemetryConfig() {
		// Refresh PostHog client and update Langfuse instance in telemetry
		await posthogClientProvider.initPostHogClient()
		await telemetryService.initLangfuseClient()
	}

	async loadExperts() {
		// Reload experts when expert files change - calls the same gRPC function as the webview
		const { manageExperts } = await import("./state/manageExperts")
		try {
			console.log("Reloading experts...")
			const result = await manageExperts(this, { loadExperts: true })

			// Send gRPC response to webview so ExpertsView can receive the updated experts
			await this.sendGrpcResponseToWebview({
				message: result,
				request_id: "loadExperts_" + Date.now(), // Generate a unique request ID
			})

			await this.postStateToWebview()
		} catch (error) {
			console.error("Failed to reload experts:", error)
		}
	}

	private async getExpertDocumentsContent(expertName: string): Promise<string> {
		const expertManager = await this.getExpertManager()
		const expertPath = await expertManager.getExpertPromptPath(this.vsCodeWorkSpaceFolderFsPath, expertName)

		if (!expertPath) {
			return ""
		}

		const docsDir = path.join(path.dirname(expertPath), ExpertFileManager.DOCS_DIR)
		const statusFilePath = path.join(docsDir, ExpertFileManager.STATUS_FILE)

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

	private async sendGrpcResponseToWebview(response: { message: any; request_id: string }): Promise<void> {
		try {
			const webviewProvider = WebviewProvider.getAllInstances().find((instance) => instance.controller.id === this.id)
			if (webviewProvider && "sendGrpcResponse" in webviewProvider) {
				await (webviewProvider as any).sendGrpcResponse(response)
			} else {
				console.warn("Could not find webview provider to send gRPC response")
			}
		} catch (error) {
			console.error("Failed to send gRPC response to webview:", error)
		}
	}
}
