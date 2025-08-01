import { PostHog } from "posthog-node"
import * as vscode from "vscode"
import { version as extensionVersion, name as extensionName } from "../../../../package.json"
import type { TaskFeedbackType } from "@shared/WebviewMessage"
import type { BrowserSettings } from "@shared/BrowserSettings"
import { posthogClientProvider } from "../PostHogClientProvider"
import { getGitUserInfo } from "@utils/git"
import { Langfuse, LangfuseTraceClient } from "langfuse"
import { HaiConfig } from "@/shared/hai-config"

/**
 * PostHogClient handles telemetry event tracking for the Cline extension
 * Uses PostHog analytics to track user interactions and system events
 * Respects user privacy settings and VSCode's global telemetry configuration
 */

interface CollectedTasks {
	taskId: string
	collection: Collection[]
}

interface Collection {
	event: string
	properties: any
}

/**
 * Represents telemetry event categories that can be individually enabled or disabled
 * When adding a new category, add it both here and to the initial values in telemetryCategoryEnabled
 * Ensure `if (!this.isCategoryEnabled('<category_name>')` is added to the capture method
 */
type TelemetryCategory = "checkpoints" | "browser"

class PostHogClient {
	// Map to control specific telemetry categories (event types)
	private telemetryCategoryEnabled: Map<TelemetryCategory, boolean> = new Map([
		["checkpoints", false], // Checkpoints telemetry disabled
		["browser", true], // Browser telemetry enabled
	])

	// Stores events when collect=true
	private collectedTasks: CollectedTasks[] = []
	// Event constants for tracking user interactions and system events
	private static readonly EVENTS = {
		// Task-related events for tracking conversation and execution flow
		TASK: {
			// Tracks when a new task/conversation is started
			CREATED: "task.created",
			// Tracks when a task is reopened
			RESTARTED: "task.restarted",
			// Tracks when a task is finished, with acceptance or rejection status
			COMPLETED: "task.completed",
			// Tracks user feedback on completed tasks
			FEEDBACK: "task.feedback",
			// Tracks when a message is sent in a conversation
			CONVERSATION_TURN: "task.conversation_turn",
			// Tracks token consumption for cost and usage analysis
			TOKEN_USAGE: "task.tokens",
			// Tracks switches between plan and act modes
			MODE_SWITCH: "task.mode",
			// Tracks when users select an option from AI-generated followup questions
			OPTION_SELECTED: "task.option_selected",
			// Tracks when users type a custom response instead of selecting an option from AI-generated followup questions
			OPTIONS_IGNORED: "task.options_ignored",
			// Tracks usage of the git-based checkpoint system (shadow_git_initialized, commit_created, branch_created, branch_deleted_active, branch_deleted_inactive, restored)
			CHECKPOINT_USED: "task.checkpoint_used",
			// Tracks when tools (like file operations, commands) are used
			TOOL_USED: "task.tool_used",
			// Tracks when a historical task is loaded from storage
			HISTORICAL_LOADED: "task.historical_loaded",
			// Tracks when the retry button is clicked for failed operations
			RETRY_CLICKED: "task.retry_clicked",
			// Tracks when a diff edit (replace_in_file) operation fails
			DIFF_EDIT_FAILED: "task.diff_edit_failed",
			// Tracks when the browser tool is started
			BROWSER_TOOL_START: "task.browser_tool_start",
			// Tracks when the browser tool is completed
			BROWSER_TOOL_END: "task.browser_tool_end",
			// Tracks when browser errors occur
			BROWSER_ERROR: "task.browser_error",
			// Tracks Gemini API specific performance metrics
			GEMINI_API_PERFORMANCE: "task.gemini_api_performance",
			// Collection of all task events
			TASK_COLLECTION: "task.collection",
		},
		// UI interaction events for tracking user engagement
		UI: {
			// Tracks when user switches between API providers
			PROVIDER_SWITCH: "ui.provider_switch",
			// Tracks when images are attached to a conversation
			IMAGE_ATTACHED: "ui.image_attached",
			// Tracks general button click interactions
			BUTTON_CLICK: "ui.button_click",
			// Tracks when the marketplace view is opened
			MARKETPLACE_OPENED: "ui.marketplace_opened",
			// Tracks when settings panel is opened
			SETTINGS_OPENED: "ui.settings_opened",
			// Tracks when task history view is opened
			HISTORY_OPENED: "ui.history_opened",
			// Tracks when a task is removed from history
			TASK_POPPED: "ui.task_popped",
			// Tracks when a different model is selected
			MODEL_SELECTED: "ui.model_selected",
			// Tracks when planning mode is toggled on
			PLAN_MODE_TOGGLED: "ui.plan_mode_toggled",
			// Tracks when action mode is toggled on
			ACT_MODE_TOGGLED: "ui.act_mode_toggled",
			// Tracks when users use the "favorite" button in the model picker
			MODEL_FAVORITE_TOGGLED: "ui.model_favorite_toggled",
		},
	}

	/** Singleton instance of the PostHogClient */
	private static instance: PostHogClient
	/** PostHog client instance for sending analytics events */
	private client: PostHog
	/** Unique identifier for the current VSCode instance */
	private distinctId: string = vscode.env.machineId
	/** Whether telemetry is currently enabled based on user and VSCode settings */
	private telemetryEnabled: boolean = false
	/** Current version of the extension */
	private readonly version: string = extensionVersion
	/** Whether the extension is running in development mode */
	private readonly isDev = process.env.IS_DEV

	// TAG:HAI
	/** Git user information (username and email) for tracking user identity */
	// This is used to identify the user in PostHog and Langfuse
	private readonly gitUserInfo: {
		username: string
		email: string
	} = getGitUserInfo()

	private langfuse: Langfuse
	private langfuseTraceClient?: LangfuseTraceClient

	/**
	 * Private constructor to enforce singleton pattern
	 * Initializes PostHog client with configuration
	 */
	private constructor() {
		this.client = this.initPostHogClient()

		// Initialize Langfuse client
		this.langfuse = this.initLangfuseClient()
	}

	private createLangfuseTraceClient(taskId: string, isNew: boolean = false) {
		// Only create traces if telemetry is enabled
		if (!this.telemetryEnabled) {
			return
		}

		// Start / Re-Create a new trace in Langfuse
		this.langfuseTraceClient = this.langfuse.trace({
			id: taskId,
			name: extensionName,
			userId: this.gitUserInfo.username,
			version: this.version,
			sessionId: this.distinctId,
			metadata: {
				user: this.gitUserInfo.username,
				email: this.gitUserInfo.email,
			},
			...(isNew ? { startTime: new Date() } : {}),
		})
	}

	public initPostHogClient() {
		this.client = posthogClientProvider.getClient()

		// Set distinct ID for the client & identify the user
		this.client.identify({
			distinctId: this.distinctId,
			properties: {
				name: this.gitUserInfo.username,
				email: this.gitUserInfo.email,
			},
		})

		return this.client
	}

	public initLangfuseClient() {
		const config = HaiConfig.getLangfuseConfig()
		const secretKey = config && config.apiKey ? config.apiKey : process.env.LANGFUSE_API_KEY!
		const publicKey = config && config.publicKey ? config.publicKey : process.env.LANGFUSE_PUBLIC_KEY!
		const baseUrl = config && config.apiUrl ? config.apiUrl : process.env.LANGFUSE_API_URL

		this.langfuse = new Langfuse({
			secretKey,
			publicKey,
			baseUrl,
			requestTimeout: 10000,
			enabled: true,
		})

		return this.langfuse
	}

	/**
	 * Updates the telemetry state based on user preferences and VSCode settings
	 * Only enables telemetry if both VSCode global telemetry is enabled and user has opted in
	 * @param didUserOptIn Whether the user has explicitly opted into telemetry
	 */
	public updateTelemetryState(didUserOptIn: boolean): void {
		this.telemetryEnabled = false

		// First check global telemetry level - telemetry should only be enabled when level is "all"
		const telemetryLevel = vscode.workspace.getConfiguration("telemetry").get<string>("telemetryLevel", "all")
		const globalTelemetryEnabled = telemetryLevel === "all"

		// We only enable telemetry if global vscode telemetry is enabled
		if (globalTelemetryEnabled) {
			this.telemetryEnabled = didUserOptIn
		}

		// Update PostHog client state based on telemetry preference
		if (this.telemetryEnabled) {
			this.client.optIn()
		} else {
			this.client.optOut()
		}
	}

	/**
	 * Gets or creates the singleton instance of PostHogClient
	 * @returns The PostHogClient instance
	 */
	public static getInstance(): PostHogClient {
		if (!PostHogClient.instance) {
			PostHogClient.instance = new PostHogClient()
		}
		return PostHogClient.instance
	}

	/**
	 * Captures a telemetry event if telemetry is enabled or collects if collect=true
	 * @param event The event to capture with its properties
	 * @param collect If true, store the event in collectedEvents instead of sending to PostHog
	 */
	public capture(event: { event: string; properties?: any }, collect: boolean = false): void {
		const taskId = event.properties.taskId
		const propertiesWithVersion = {
			...event.properties,
			extension_version: this.version,
			is_dev: this.isDev,
		}
		if (collect) {
			const existingTask = this.collectedTasks.find((task) => task.taskId === taskId)
			if (existingTask) {
				existingTask.collection.push({
					event: event.event,
					properties: propertiesWithVersion,
				})
			} else {
				this.collectedTasks.push({
					taskId,
					collection: [
						{
							event: event.event,
							properties: propertiesWithVersion,
						},
					],
				})
			}
		} else if (this.telemetryEnabled) {
			this.client.capture({ distinctId: this.distinctId, event: event.event, properties: propertiesWithVersion })
		}
	}

	// Task events
	/**
	 * Records when a new task/conversation is started
	 * @param taskId Unique identifier for the new task
	 * @param apiProvider Optional API provider
	 * @param collect If true, collect event instead of sending
	 */
	public captureTaskCreated(taskId: string, apiProvider?: string, collect: boolean = false) {
		this.capture(
			{
				event: PostHogClient.EVENTS.TASK.CREATED,
				properties: { taskId, apiProvider },
			},
			collect,
		)

		// Start a new trace in Langfuse
		this.createLangfuseTraceClient(taskId, true)
	}

	/**
	 * Records when a task/conversation is restarted
	 * @param taskId Unique identifier for the new task
	 * @param apiProvider Optional API provider
	 * @param collect If true, collect event instead of sending
	 */
	public captureTaskRestarted(taskId: string, apiProvider?: string, collect: boolean = false) {
		this.capture(
			{
				event: PostHogClient.EVENTS.TASK.RESTARTED,
				properties: { taskId, apiProvider },
			},
			collect,
		)

		// Start a new trace in Langfuse
		this.createLangfuseTraceClient(taskId)
	}

	/**
	 * Records when cline calls the task completion_result tool signifying that cline is done with the task
	 * @param taskId Unique identifier for the task
	 * @param collect If true, collect event instead of sending
	 */
	public captureTaskCompleted(taskId: string, collect: boolean = false) {
		this.capture(
			{
				event: PostHogClient.EVENTS.TASK.COMPLETED,
				properties: { taskId },
			},
			collect,
		)
	}

	/**
	 * Captures that a message was sent, and includes the API provider and model used
	 * @param taskId Unique identifier for the task
	 * @param provider The API provider (e.g., OpenAI, Anthropic)
	 * @param model The specific model used (e.g., GPT-4, Claude)
	 * @param source The source of the message ("user" | "model"). Used to track message patterns and identify when users need to correct the model's responses.
	 */
	public captureConversationTurnEvent(
		taskId: string,
		provider: string = "unknown",
		model: string = "unknown",
		source: "user" | "assistant",
		collect: boolean = false,
	) {
		// Ensure required parameters are provided
		if (!taskId || !provider || !model || !source) {
			console.warn("TelemetryService: Missing required parameters for message capture")
			return
		}

		const properties: Record<string, any> = {
			taskId,
			provider,
			model,
			source,
			timestamp: new Date().toISOString(), // Add timestamp for message sequencing
		}

		this.capture(
			{
				event: PostHogClient.EVENTS.TASK.CONVERSATION_TURN,
				properties,
			},
			collect,
		)
	}

	/**
	 * Records token usage metrics for cost tracking and usage analysis
	 * @param taskId Unique identifier for the task
	 * @param tokensIn Number of input tokens consumed
	 * @param tokensOut Number of output tokens generated
	 * @param model The model used for token calculation
	 */
	public captureTokenUsage(
		taskId: string,
		tokensIn: number,
		tokensOut: number,
		startTime: Date,
		endTime: Date,
		model: string,
		metadata: Record<string, any> = {},
		promptVersion: string = "default",
	) {
		this.capture({
			event: PostHogClient.EVENTS.TASK.TOKEN_USAGE,
			properties: {
				taskId,
				tokensIn,
				tokensOut,
				model,
				user: this.gitUserInfo.username,
				email: this.gitUserInfo.email,
			},
		})

		// Only send to Langfuse if telemetry is enabled
		if (this.telemetryEnabled && (tokensIn > 0 || tokensOut > 0)) {
			this.langfuseTraceClient?.generation({
				model: model,
				startTime: startTime,
				endTime: endTime,
				metadata: {
					user: this.gitUserInfo.username,
					email: this.gitUserInfo.email,
					promptVersion: promptVersion,
					...metadata,
				},
				version: this.version,
				usage: {
					input: tokensIn,
					output: tokensOut,
				},
			})
		}
	}

	/**
	 * Records when a task switches between plan and act modes
	 * @param taskId Unique identifier for the task
	 * @param mode The mode being switched to (plan or act)
	 */
	public captureModeSwitch(taskId: string, mode: "plan" | "act", collect: boolean = false) {
		this.capture(
			{
				event: PostHogClient.EVENTS.TASK.MODE_SWITCH,
				properties: {
					taskId,
					mode,
				},
			},
			collect,
		)
	}

	/**
	 * Records user feedback on completed tasks
	 * @param taskId Unique identifier for the task
	 * @param feedbackType The type of feedback ("thumbs_up" or "thumbs_down")
	 */
	public captureTaskFeedback(taskId: string, feedbackType: TaskFeedbackType, collect: boolean = false) {
		console.info("TelemetryService: Capturing task feedback", { taskId, feedbackType })
		this.capture(
			{
				event: PostHogClient.EVENTS.TASK.FEEDBACK,
				properties: {
					taskId,
					feedbackType,
				},
			},
			collect,
		)
	}

	// Tool events
	/**
	 * Records when a tool is used during task execution
	 * @param taskId Unique identifier for the task
	 * @param tool Name of the tool being used
	 * @param autoApproved Whether the tool was auto-approved based on settings
	 * @param success Whether the tool execution was successful
	 */
	public captureToolUsage(taskId: string, tool: string, autoApproved: boolean, success: boolean, collect: boolean = false) {
		this.capture(
			{
				event: PostHogClient.EVENTS.TASK.TOOL_USED,
				properties: {
					taskId,
					tool,
					autoApproved,
					success,
				},
			},
			collect,
		)
	}

	/**
	 * Records interactions with the git-based checkpoint system
	 * @param taskId Unique identifier for the task
	 * @param action The type of checkpoint action
	 * @param durationMs Optional duration of the operation in milliseconds
	 */
	public captureCheckpointUsage(
		taskId: string,
		action: "shadow_git_initialized" | "commit_created" | "restored" | "diff_generated",
		durationMs?: number,
		collect: boolean = false,
	) {
		if (!this.isCategoryEnabled("checkpoints")) {
			return
		}

		this.capture(
			{
				event: PostHogClient.EVENTS.TASK.CHECKPOINT_USED,
				properties: {
					taskId,
					action,
					durationMs,
				},
			},
			collect,
		)
	}

	// UI events
	/**
	 * Records when the user switches between different API providers
	 * @param from Previous provider name
	 * @param to New provider name
	 * @param location Where the switch occurred (settings panel or bottom bar)
	 * @param taskId Optional task identifier if switch occurred during a task
	 */
	public captureProviderSwitch(
		from: string,
		to: string,
		location: "settings" | "bottom",
		taskId?: string,
		collect: boolean = false,
	) {
		this.capture(
			{
				event: PostHogClient.EVENTS.UI.PROVIDER_SWITCH,
				properties: {
					from,
					to,
					location,
					taskId,
				},
			},
			collect,
		)
	}

	/**
	 * Records when images are attached to a conversation
	 * @param taskId Unique identifier for the task
	 * @param imageCount Number of images attached
	 */
	public captureImageAttached(taskId: string, imageCount: number, collect: boolean = false) {
		this.capture(
			{
				event: PostHogClient.EVENTS.UI.IMAGE_ATTACHED,
				properties: {
					taskId,
					imageCount,
				},
			},
			collect,
		)
	}

	/**
	 * Records general button click interactions in the UI
	 * @param button Identifier for the button that was clicked
	 * @param taskId Optional task identifier if click occurred during a task
	 */
	public captureButtonClick(button: string, taskId?: string, collect: boolean = false) {
		this.capture(
			{
				event: PostHogClient.EVENTS.UI.BUTTON_CLICK,
				properties: {
					button,
					taskId,
				},
			},
			collect,
		)
	}

	/**
	 * Records when the marketplace view is opened
	 * @param taskId Optional task identifier if marketplace was opened during a task
	 */
	public captureMarketplaceOpened(taskId?: string, collect: boolean = false) {
		this.capture(
			{
				event: PostHogClient.EVENTS.UI.MARKETPLACE_OPENED,
				properties: {
					taskId,
				},
			},
			collect,
		)
	}

	/**
	 * Records when the settings panel is opened
	 * @param taskId Optional task identifier if settings were opened during a task
	 */
	public captureSettingsOpened(taskId?: string, collect: boolean = false) {
		this.capture(
			{
				event: PostHogClient.EVENTS.UI.SETTINGS_OPENED,
				properties: {
					taskId,
				},
			},
			collect,
		)
	}

	/**
	 * Records when the task history view is opened
	 * @param taskId Optional task identifier if history was opened during a task
	 */
	public captureHistoryOpened(taskId?: string, collect: boolean = false) {
		this.capture(
			{
				event: PostHogClient.EVENTS.UI.HISTORY_OPENED,
				properties: {
					taskId,
				},
			},
			collect,
		)
	}

	/**
	 * Records when a task is removed from the task history
	 * @param taskId Unique identifier for the task being removed
	 */
	public captureTaskPopped(taskId: string, collect: boolean = false) {
		this.capture(
			{
				event: PostHogClient.EVENTS.UI.TASK_POPPED,
				properties: {
					taskId,
				},
			},
			collect,
		)
	}

	/**
	 * Records when a diff edit (replace_in_file) operation fails
	 * @param taskId Unique identifier for the task
	 * @param errorType Type of error that occurred (e.g., "search_not_found", "invalid_format")
	 */
	public captureDiffEditFailure(taskId: string, modelId: string, errorType?: string, collect: boolean = false) {
		this.capture(
			{
				event: PostHogClient.EVENTS.TASK.DIFF_EDIT_FAILED,
				properties: {
					taskId,
					errorType,
					modelId,
				},
			},
			collect,
		)
	}

	/**
	 * Records when a different model is selected for use
	 * @param model Name of the selected model
	 * @param provider Provider of the selected model
	 * @param taskId Optional task identifier if model was selected during a task
	 */
	public captureModelSelected(model: string, provider: string, taskId?: string, collect: boolean = false) {
		this.capture(
			{
				event: PostHogClient.EVENTS.UI.MODEL_SELECTED,
				properties: {
					model,
					provider,
					taskId,
				},
			},
			collect,
		)
	}

	/**
	 * Records when a historical task is loaded from storage
	 * @param taskId Unique identifier for the historical task
	 */
	public captureHistoricalTaskLoaded(taskId: string, collect: boolean = false) {
		this.capture(
			{
				event: PostHogClient.EVENTS.TASK.HISTORICAL_LOADED,
				properties: {
					taskId,
				},
			},
			collect,
		)
	}

	/**
	 * Records when the retry button is clicked for failed operations
	 * @param taskId Unique identifier for the task being retried
	 */
	public captureRetryClicked(taskId: string, collect: boolean = false) {
		this.capture(
			{
				event: PostHogClient.EVENTS.TASK.RETRY_CLICKED,
				properties: {
					taskId,
				},
			},
			collect,
		)
	}

	/**
	 * Records when the browser tool is started
	 * @param taskId Unique identifier for the task
	 * @param browserSettings The browser settings being used
	 */
	public captureBrowserToolStart(taskId: string, browserSettings: BrowserSettings, collect: boolean = false) {
		if (!this.isCategoryEnabled("browser")) {
			return
		}

		this.capture(
			{
				event: PostHogClient.EVENTS.TASK.BROWSER_TOOL_START,
				properties: {
					taskId,
					viewport: browserSettings.viewport,
					isRemote: !!browserSettings.remoteBrowserEnabled,
					remoteBrowserHost: browserSettings.remoteBrowserHost,
					timestamp: new Date().toISOString(),
				},
			},
			collect,
		)
	}

	/**
	 * Records when the browser tool is completed
	 * @param taskId Unique identifier for the task
	 * @param stats Statistics about the browser session
	 */
	public captureBrowserToolEnd(
		taskId: string,
		stats: {
			actionCount: number
			duration: number
			actions?: string[]
		},
		collect: boolean = false,
	) {
		if (!this.isCategoryEnabled("browser")) {
			return
		}

		this.capture(
			{
				event: PostHogClient.EVENTS.TASK.BROWSER_TOOL_END,
				properties: {
					taskId,
					actionCount: stats.actionCount,
					duration: stats.duration,
					actions: stats.actions,
					timestamp: new Date().toISOString(),
				},
			},
			collect,
		)
	}

	/**
	 * Records when browser errors occur during a task
	 * @param taskId Unique identifier for the task
	 * @param errorType Type of error that occurred (e.g., "launch_error", "connection_error", "navigation_error")
	 * @param errorMessage The error message
	 * @param context Additional context about where the error occurred
	 */
	public captureBrowserError(
		taskId: string,
		errorType: string,
		errorMessage: string,
		context?: {
			action?: string
			url?: string
			isRemote?: boolean
			[key: string]: any
		},
		collect: boolean = false,
	) {
		if (!this.isCategoryEnabled("browser")) {
			return
		}

		this.capture(
			{
				event: PostHogClient.EVENTS.TASK.BROWSER_ERROR,
				properties: {
					taskId,
					errorType,
					errorMessage,
					context,
					timestamp: new Date().toISOString(),
				},
			},
			collect,
		)
	}

	/**
	 * Records when a user selects an option from AI-generated followup questions
	 * @param taskId Unique identifier for the task
	 * @param qty The quantity of options that were presented
	 * @param mode The mode in which the option was selected ("plan" or "act")
	 */
	public captureOptionSelected(taskId: string, qty: number, mode: "plan" | "act", collect: boolean = false) {
		this.capture(
			{
				event: PostHogClient.EVENTS.TASK.OPTION_SELECTED,
				properties: {
					taskId,
					qty,
					mode,
				},
			},
			collect,
		)
	}

	/**
	 * Records when a user types a custom response instead of selecting one of the AI-generated followup questions
	 * @param taskId Unique identifier for the task
	 * @param qty The quantity of options that were presented
	 * @param mode The mode in which the custom response was provided ("plan" or "act")
	 */
	public captureOptionsIgnored(taskId: string, qty: number, mode: "plan" | "act", collect: boolean = false) {
		this.capture(
			{
				event: PostHogClient.EVENTS.TASK.OPTIONS_IGNORED,
				properties: {
					taskId,
					qty,
					mode,
				},
			},
			collect,
		)
	}

	/**
	 * Captures Gemini API performance metrics.
	 * @param taskId Unique identifier for the task
	 * @param modelId Specific Gemini model ID
	 * @param data Performance data including TTFT, durations, token counts, cache stats, and API success status
	 * @param collect If true, collect event instead of sending
	 */
	public captureGeminiApiPerformance(
		taskId: string,
		modelId: string,
		data: {
			ttftSec?: number
			totalDurationSec?: number
			promptTokens: number
			outputTokens: number
			cacheReadTokens: number
			cacheHit: boolean
			cacheHitPercentage?: number
			apiSuccess: boolean
			apiError?: string
			throughputTokensPerSec?: number
		},
		collect: boolean = false,
	) {
		this.capture(
			{
				event: PostHogClient.EVENTS.TASK.GEMINI_API_PERFORMANCE,
				properties: {
					taskId,
					modelId,
					...data,
				},
			},
			collect,
		)
	}

	/**
	 * Records when the user uses the model favorite button in the model picker
	 * @param model The name of the model the user has interacted with
	 * @param isFavorited Whether the model is being favorited (true) or unfavorited (false)
	 */
	public captureModelFavoritesUsage(model: string, isFavorited: boolean, collect: boolean = false) {
		this.capture(
			{
				event: PostHogClient.EVENTS.UI.MODEL_FAVORITE_TOGGLED,
				properties: {
					model,
					isFavorited,
				},
			},
			collect,
		)
	}

	/**
	 * Checks if telemetry is enabled
	 * @returns Boolean indicating whether telemetry is enabled
	 */
	public isTelemetryEnabled(): boolean {
		return this.telemetryEnabled
	}

	/**
	 * Checks if a specific telemetry category is enabled
	 * @param category The telemetry category to check
	 * @returns Boolean indicating whether the specified telemetry category is enabled
	 */
	public isCategoryEnabled(category: TelemetryCategory): boolean {
		// Default to true if category has not been explicitly configured
		return this.telemetryCategoryEnabled.get(category) ?? true
	}

	public async sendCollectedEvents(taskId?: string): Promise<void> {
		if (this.collectedTasks.length > 0) {
			if (taskId) {
				const task = this.collectedTasks.find((t) => t.taskId === taskId)
				if (task) {
					this.capture(
						{
							event: PostHogClient.EVENTS.TASK.TASK_COLLECTION,
							properties: { taskId, events: task.collection },
						},
						false,
					)
					this.collectedTasks = this.collectedTasks.filter((t) => t.taskId !== taskId)
				}
			} else {
				for (const task of this.collectedTasks) {
					this.capture(
						{
							event: PostHogClient.EVENTS.TASK.TASK_COLLECTION,
							properties: { taskId: task.taskId, events: task.collection },
						},
						false,
					)
					this.collectedTasks = this.collectedTasks.filter((t) => t.taskId !== task.taskId)
				}
			}
		}
	}

	public async shutdown(): Promise<void> {
		await this.client.shutdown()
		await this.langfuse.shutdownAsync()
	}
}

export const telemetryService = PostHogClient.getInstance()
