import * as vscode from "vscode"
import { DEFAULT_CHAT_SETTINGS, OpenAIReasoningEffort } from "@shared/ChatSettings"
import { DEFAULT_BROWSER_SETTINGS } from "@shared/BrowserSettings"
import { DEFAULT_AUTO_APPROVAL_SETTINGS } from "@shared/AutoApprovalSettings"
import { GlobalStateKey, SecretKey } from "./state-keys"
import { ApiConfiguration, ApiProvider, BedrockModelId, ModelInfo } from "@shared/api"
import { HistoryItem } from "@shared/HistoryItem"
import { AutoApprovalSettings } from "@shared/AutoApprovalSettings"
import { BrowserSettings } from "@shared/BrowserSettings"
import { ChatSettings } from "@shared/ChatSettings"
import { TelemetrySetting } from "@shared/TelemetrySetting"
import { UserInfo } from "@shared/UserInfo"
import { ClineRulesToggles } from "@shared/cline-rules"

// TAG:HAI
import { EmbeddingConfiguration, EmbeddingProvider } from "@shared/embeddings"
import { HaiBuildContextOptions, HaiBuildIndexProgress } from "@shared/customApi"

/*
	Storage
	https://dev.to/kompotkot/how-to-use-secretstorage-in-your-vscode-extensions-2hco
	https://www.eliostruyf.com/devhack-code-extension-storage-options/
	*/

export function isCustomGlobalKey(key: string): boolean {
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
		"telemetrySetting",
		"globalWorkflowToggles",
		"globalClineRulesToggles",
		"lastShownAnnouncementId",
		"shellIntegrationTimeout",
		"autoApprovalSettings",
		"favoritedModelIds",
	]
	return customGlobalKeys.includes(key)
}

// global

export async function customUpdateState(context: vscode.ExtensionContext, key: string, value: any) {
	if (isCustomGlobalKey(key)) {
		await updateGlobalState(context, key as GlobalStateKey, value)
	}
	await updateWorkspaceState(context, key, value)
}

export async function customGetState(context: vscode.ExtensionContext, key: string) {
	let value = await getWorkspaceState(context, key)
	if (isCustomGlobalKey(key) && !value) {
		value = await getGlobalState(context, key as GlobalStateKey)
	}
	return value
}

export async function updateGlobalState(context: vscode.ExtensionContext, key: GlobalStateKey, value: any) {
	await context.globalState.update(key, value)
}

export async function getGlobalState(context: vscode.ExtensionContext, key: GlobalStateKey) {
	return await context.globalState.get(key)
}

// secrets

export async function customStoreSecret(
	context: vscode.ExtensionContext,
	key: SecretKey,
	workspaceId: string,
	value?: string,
	isDelete: boolean = false,
) {
	if (!(await getSecret(context, key)) || isDelete) {
		await storeSecret(context, key as SecretKey, value)
	}
	await storeSecret(context, `${workspaceId}-${key}` as SecretKey, value)
}

export async function customGetSecret(
	context: vscode.ExtensionContext,
	key: SecretKey,
	workspaceId: string,
	defaultGlobal: boolean = true,
) {
	let workspaceSecret = await getSecret(context, `${workspaceId}-${key}` as SecretKey)
	if (!defaultGlobal) {
		return workspaceSecret
	}

	if (!workspaceSecret) {
		return await getSecret(context, key as SecretKey)
	}
	return workspaceSecret
}

export async function storeSecret(context: vscode.ExtensionContext, key: SecretKey, value?: string) {
	if (value) {
		await context.secrets.store(key, value)
	} else {
		await context.secrets.delete(key)
	}
}

export async function getSecret(context: vscode.ExtensionContext, key: SecretKey) {
	return await context.secrets.get(key)
}

// workspace

export async function updateWorkspaceState(context: vscode.ExtensionContext, key: string, value: any) {
	await context.workspaceState.update(key, value)
}

export async function getWorkspaceState(context: vscode.ExtensionContext, key: string) {
	return await context.workspaceState.get(key)
}

async function migrateMcpMarketplaceEnableSetting(mcpMarketplaceEnabledRaw: boolean | undefined): Promise<boolean> {
	const config = vscode.workspace.getConfiguration("hai")
	const mcpMarketplaceEnabled = config.get<boolean>("mcpMarketplace.enabled")
	if (mcpMarketplaceEnabled !== undefined) {
		// Remove from VSCode configuration
		await config.update("mcpMarketplace.enabled", undefined, true)

		return !mcpMarketplaceEnabled
	}
	return mcpMarketplaceEnabledRaw ?? true
}

async function migrateEnableCheckpointsSetting(enableCheckpointsSettingRaw: boolean | undefined): Promise<boolean> {
	const config = vscode.workspace.getConfiguration("hai")
	const enableCheckpoints = config.get<boolean>("enableCheckpoints")
	if (enableCheckpoints !== undefined) {
		// Remove from VSCode configuration
		await config.update("enableCheckpoints", undefined, true)
		return enableCheckpoints
	}
	return enableCheckpointsSettingRaw ?? true
}

export async function getAllExtensionState(context: vscode.ExtensionContext, workspaceId: string) {
	const [
		isNewUser,
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
		awsBedrockCustomSelected,
		awsBedrockCustomModelBaseId,
		vertexProjectId,
		vertexRegion,
		openAiBaseUrl,
		openAiApiKey,
		openAiModelId,
		openAiModelInfo,
		openAiHeaders,
		ollamaModelId,
		ollamaBaseUrl,
		ollamaApiOptionsCtxNum,
		lmStudioModelId,
		lmStudioBaseUrl,
		anthropicBaseUrl,
		geminiApiKey,
		geminiBaseUrl,
		openAiNativeApiKey,
		deepSeekApiKey,
		requestyApiKey,
		requestyModelId,
		requestyModelInfo,
		togetherApiKey,
		togetherModelId,
		qwenApiKey,
		doubaoApiKey,
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
		liteLlmModelInfo,
		liteLlmUsePromptCache,
		fireworksApiKey,
		fireworksModelId,
		fireworksModelMaxCompletionTokens,
		fireworksModelMaxTokens,
		userInfo,
		previousModeApiProvider,
		previousModeModelId,
		previousModeModelInfo,
		previousModeVsCodeLmModelSelector,
		previousModeThinkingBudgetTokens,
		previousModeReasoningEffort,
		previousModeAwsBedrockCustomSelected,
		previousModeAwsBedrockCustomModelBaseId,
		qwenApiLine,
		liteLlmApiKey,
		telemetrySetting,
		asksageApiKey,
		asksageApiUrl,
		xaiApiKey,
		thinkingBudgetTokens,
		reasoningEffort,
		sambanovaApiKey,
		nebiusApiKey,
		planActSeparateModelsSettingRaw,
		favoritedModelIds,
		globalClineRulesToggles,
		requestTimeoutMs,
		shellIntegrationTimeout,
		enableCheckpointsSettingRaw,
		mcpMarketplaceEnabledRaw,
		globalWorkflowToggles,

		// TAG:HAI
		expertPrompt,
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
		customGetState(context, "isNewUser") as Promise<boolean | undefined>,
		customGetState(context, "apiProvider") as Promise<ApiProvider | undefined>,
		customGetState(context, "apiModelId") as Promise<string | undefined>,
		customGetSecret(context, "apiKey", workspaceId) as Promise<string | undefined>,
		customGetSecret(context, "openRouterApiKey", workspaceId) as Promise<string | undefined>,
		customGetSecret(context, "clineApiKey", workspaceId) as Promise<string | undefined>,
		customGetSecret(context, "awsAccessKey", workspaceId) as Promise<string | undefined>,
		customGetSecret(context, "awsSecretKey", workspaceId) as Promise<string | undefined>,
		customGetSecret(context, "awsSessionToken", workspaceId, false) as Promise<string | undefined>,
		customGetState(context, "awsRegion") as Promise<string | undefined>,
		customGetState(context, "awsUseCrossRegionInference") as Promise<boolean | undefined>,
		customGetState(context, "awsBedrockUsePromptCache") as Promise<boolean | undefined>,
		customGetState(context, "awsBedrockEndpoint") as Promise<string | undefined>,
		customGetState(context, "awsProfile") as Promise<string | undefined>,
		customGetState(context, "awsUseProfile") as Promise<boolean | undefined>,
		customGetState(context, "awsBedrockCustomSelected") as Promise<boolean | undefined>,
		customGetState(context, "awsBedrockCustomModelBaseId") as Promise<BedrockModelId | undefined>,
		customGetState(context, "vertexProjectId") as Promise<string | undefined>,
		customGetState(context, "vertexRegion") as Promise<string | undefined>,
		customGetState(context, "openAiBaseUrl") as Promise<string | undefined>,
		customGetSecret(context, "openAiApiKey", workspaceId) as Promise<string | undefined>,
		customGetState(context, "openAiModelId") as Promise<string | undefined>,
		customGetState(context, "openAiModelInfo") as Promise<ModelInfo | undefined>,
		customGetState(context, "openAiHeaders") as Promise<Record<string, string> | undefined>,
		customGetState(context, "ollamaModelId") as Promise<string | undefined>,
		customGetState(context, "ollamaBaseUrl") as Promise<string | undefined>,
		customGetState(context, "ollamaApiOptionsCtxNum") as Promise<string | undefined>,
		customGetState(context, "lmStudioModelId") as Promise<string | undefined>,
		customGetState(context, "lmStudioBaseUrl") as Promise<string | undefined>,
		customGetState(context, "anthropicBaseUrl") as Promise<string | undefined>,
		customGetSecret(context, "geminiApiKey", workspaceId) as Promise<string | undefined>,
		customGetState(context, "geminiBaseUrl") as Promise<string | undefined>,
		customGetSecret(context, "openAiNativeApiKey", workspaceId) as Promise<string | undefined>,
		customGetSecret(context, "deepSeekApiKey", workspaceId) as Promise<string | undefined>,
		customGetSecret(context, "requestyApiKey", workspaceId) as Promise<string | undefined>,
		customGetState(context, "requestyModelId") as Promise<string | undefined>,
		customGetState(context, "requestyModelInfo") as Promise<ModelInfo | undefined>,
		customGetSecret(context, "togetherApiKey", workspaceId) as Promise<string | undefined>,
		customGetState(context, "togetherModelId") as Promise<string | undefined>,
		customGetSecret(context, "qwenApiKey", workspaceId) as Promise<string | undefined>,
		customGetSecret(context, "doubaoApiKey", workspaceId) as Promise<string | undefined>,
		customGetSecret(context, "mistralApiKey", workspaceId) as Promise<string | undefined>,
		customGetState(context, "azureApiVersion") as Promise<string | undefined>,
		customGetState(context, "openRouterModelId") as Promise<string | undefined>,
		customGetState(context, "openRouterModelInfo") as Promise<ModelInfo | undefined>,
		customGetState(context, "openRouterProviderSorting") as Promise<string | undefined>,
		customGetState(context, "lastShownAnnouncementId") as Promise<string | undefined>,
		customGetState(context, "customInstructions") as Promise<string | undefined>,
		customGetState(context, "taskHistory") as Promise<HistoryItem[] | undefined>,
		customGetState(context, "autoApprovalSettings") as Promise<AutoApprovalSettings | undefined>,
		customGetState(context, "browserSettings") as Promise<BrowserSettings | undefined>,
		customGetState(context, "chatSettings") as Promise<ChatSettings | undefined>,
		customGetState(context, "vsCodeLmModelSelector") as Promise<vscode.LanguageModelChatSelector | undefined>,
		customGetState(context, "liteLlmBaseUrl") as Promise<string | undefined>,
		customGetState(context, "liteLlmModelId") as Promise<string | undefined>,
		customGetState(context, "liteLlmModelInfo") as Promise<ModelInfo | undefined>,
		customGetState(context, "liteLlmUsePromptCache") as Promise<boolean | undefined>,
		customGetSecret(context, "fireworksApiKey", workspaceId) as Promise<string | undefined>,
		customGetState(context, "fireworksModelId") as Promise<string | undefined>,
		customGetState(context, "fireworksModelMaxCompletionTokens") as Promise<number | undefined>,
		customGetState(context, "fireworksModelMaxTokens") as Promise<number | undefined>,
		customGetState(context, "userInfo") as Promise<UserInfo | undefined>,
		customGetState(context, "previousModeApiProvider") as Promise<ApiProvider | undefined>,
		customGetState(context, "previousModeModelId") as Promise<string | undefined>,
		customGetState(context, "previousModeModelInfo") as Promise<ModelInfo | undefined>,
		customGetState(context, "previousModeVsCodeLmModelSelector") as Promise<vscode.LanguageModelChatSelector | undefined>,
		customGetState(context, "previousModeThinkingBudgetTokens") as Promise<number | undefined>,
		customGetState(context, "previousModeReasoningEffort") as Promise<string | undefined>,
		customGetState(context, "previousModeAwsBedrockCustomSelected") as Promise<boolean | undefined>,
		customGetState(context, "previousModeAwsBedrockCustomModelBaseId") as Promise<BedrockModelId | undefined>,
		customGetState(context, "qwenApiLine") as Promise<string | undefined>,
		customGetSecret(context, "liteLlmApiKey", workspaceId) as Promise<string | undefined>,
		customGetState(context, "telemetrySetting") as Promise<TelemetrySetting | undefined>,
		customGetSecret(context, "asksageApiKey", workspaceId) as Promise<string | undefined>,
		customGetState(context, "asksageApiUrl") as Promise<string | undefined>,
		customGetSecret(context, "xaiApiKey", workspaceId) as Promise<string | undefined>,
		customGetState(context, "thinkingBudgetTokens") as Promise<number | undefined>,
		customGetState(context, "reasoningEffort") as Promise<string | undefined>,
		customGetSecret(context, "sambanovaApiKey", workspaceId) as Promise<string | undefined>,
		customGetSecret(context, "nebiusApiKey", workspaceId) as Promise<string | undefined>,
		customGetState(context, "planActSeparateModelsSetting") as Promise<boolean | undefined>,
		customGetState(context, "favoritedModelIds") as Promise<string[] | undefined>,
		customGetState(context, "globalClineRulesToggles") as Promise<ClineRulesToggles | undefined>,
		customGetState(context, "requestTimeoutMs") as Promise<number | undefined>,
		customGetState(context, "shellIntegrationTimeout") as Promise<number | undefined>,
		customGetState(context, "enableCheckpointsSetting") as Promise<boolean | undefined>,
		customGetState(context, "mcpMarketplaceEnabled") as Promise<boolean | undefined>,
		customGetState(context, "globalWorkflowToggles") as Promise<ClineRulesToggles | undefined>,

		// TAG:HAI
		customGetState(context, "expertPrompt") as Promise<string | undefined>,
		customGetState(context, "buildContextOptions") as Promise<HaiBuildContextOptions | undefined>,
		customGetState(context, "buildIndexProgress") as Promise<HaiBuildIndexProgress | undefined>,
		customGetState(context, "isApiConfigurationValid") as Promise<boolean | undefined>,
		// Embedding Configurations
		customGetState(context, "embeddingProvider") as Promise<EmbeddingProvider | undefined>,
		customGetState(context, "embeddingModelId") as Promise<string | undefined>,
		customGetSecret(context, "embeddingAwsAccessKey", workspaceId) as Promise<string | undefined>,
		customGetSecret(context, "embeddingAwsSecretKey", workspaceId) as Promise<string | undefined>,
		customGetSecret(context, "embeddingAwsSessionToken", workspaceId, false) as Promise<string | undefined>,
		customGetState(context, "embeddingAwsRegion") as Promise<string | undefined>,
		customGetState(context, "embeddingOpenAiBaseUrl") as Promise<string | undefined>,
		customGetSecret(context, "embeddingOpenAiApiKey", workspaceId) as Promise<string | undefined>,
		customGetState(context, "embeddingOpenAiModelId") as Promise<string | undefined>,
		customGetSecret(context, "embeddingOpenAiNativeApiKey", workspaceId) as Promise<string | undefined>,
		customGetSecret(context, "embeddingAzureOpenAIApiKey", workspaceId) as Promise<string | undefined>,
		customGetState(context, "embeddingAzureOpenAIApiInstanceName") as Promise<string | undefined>,
		customGetState(context, "embeddingAzureOpenAIApiEmbeddingsDeploymentName") as Promise<string | undefined>,
		customGetState(context, "embeddingAzureOpenAIApiVersion") as Promise<string | undefined>,
		customGetState(context, "isEmbeddingConfigurationValid") as Promise<boolean | undefined>,
		customGetState(context, "embeddingOllamaBaseUrl") as Promise<string | undefined>,
		customGetState(context, "embeddingOllamaModelId") as Promise<string | undefined>,
		fetch,
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
			apiProvider = "openrouter"
		}
	}

	// TAG:HAI
	let embeddingProvider: EmbeddingProvider
	if (storedEmbeddingProvider) {
		embeddingProvider = storedEmbeddingProvider
	} else {
		embeddingProvider = "openai-native"
	}

	const localClineRulesToggles = (await customGetState(context, "localClineRulesToggles")) as ClineRulesToggles

	const mcpMarketplaceEnabled = await migrateMcpMarketplaceEnableSetting(mcpMarketplaceEnabledRaw)
	const enableCheckpointsSetting = await migrateEnableCheckpointsSetting(enableCheckpointsSettingRaw)

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
		await customUpdateState(context, "planActSeparateModelsSetting", planActSeparateModelsSetting)
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
			awsBedrockCustomSelected,
			awsBedrockCustomModelBaseId,
			vertexProjectId,
			vertexRegion,
			openAiBaseUrl,
			openAiApiKey,
			openAiModelId,
			openAiModelInfo,
			openAiHeaders: openAiHeaders || {},
			ollamaModelId,
			ollamaBaseUrl,
			ollamaApiOptionsCtxNum,
			lmStudioModelId,
			lmStudioBaseUrl,
			anthropicBaseUrl,
			geminiApiKey,
			geminiBaseUrl,
			openAiNativeApiKey,
			deepSeekApiKey,
			requestyApiKey,
			requestyModelId,
			requestyModelInfo,
			togetherApiKey,
			togetherModelId,
			qwenApiKey,
			qwenApiLine,
			doubaoApiKey,
			mistralApiKey,
			azureApiVersion,
			openRouterModelId,
			openRouterModelInfo,
			openRouterProviderSorting,
			vsCodeLmModelSelector,
			thinkingBudgetTokens,
			reasoningEffort,
			liteLlmBaseUrl,
			liteLlmModelId,
			liteLlmModelInfo,
			liteLlmApiKey,
			liteLlmUsePromptCache,
			fireworksApiKey,
			fireworksModelId,
			fireworksModelMaxCompletionTokens,
			fireworksModelMaxTokens,
			asksageApiKey,
			asksageApiUrl,
			xaiApiKey,
			sambanovaApiKey,
			nebiusApiKey,
			favoritedModelIds,
			requestTimeoutMs,
			isApiConfigurationValid,
		},
		isNewUser: isNewUser ?? true,
		lastShownAnnouncementId,
		customInstructions,
		taskHistory,
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
		expertPrompt,
		buildContextOptions: buildContextOptions
			? {
					...buildContextOptions,
					systemPromptVersion: buildContextOptions.systemPromptVersion ?? "v3",
				}
			: {
					useIndex: true, // Enable Indexing by default
					useContext: true, // Enable Use Context by default
					useSyncWithApi: true, // Enable Sync with API by default
					useSecretScanning: true, // Enable Secret Scanning by default
					systemPromptVersion: "v3", // Setting v3 as default prompt
				},
		buildIndexProgress: buildIndexProgress,
		autoApprovalSettings: autoApprovalSettings || DEFAULT_AUTO_APPROVAL_SETTINGS, // default value can be 0 or empty string
		globalClineRulesToggles: globalClineRulesToggles || {},
		localClineRulesToggles: localClineRulesToggles || {},
		browserSettings: { ...DEFAULT_BROWSER_SETTINGS, ...browserSettings }, // this will ensure that older versions of browserSettings (e.g. before remoteBrowserEnabled was added) are merged with the default values (false for remoteBrowserEnabled)
		chatSettings: {
			...DEFAULT_CHAT_SETTINGS, // Apply defaults first
			...(chatSettings || {}), // Spread fetched chatSettings, which includes preferredLanguage, and openAIReasoningEffort
		},
		userInfo,
		previousModeApiProvider,
		previousModeModelId,
		previousModeModelInfo,
		previousModeVsCodeLmModelSelector,
		previousModeThinkingBudgetTokens,
		previousModeReasoningEffort,
		previousModeAwsBedrockCustomSelected,
		previousModeAwsBedrockCustomModelBaseId,
		mcpMarketplaceEnabled: mcpMarketplaceEnabled,
		telemetrySetting: telemetrySetting || "unset",
		planActSeparateModelsSetting,
		enableCheckpointsSetting: enableCheckpointsSetting,
		shellIntegrationTimeout: shellIntegrationTimeout || 4000,
		globalWorkflowToggles: globalWorkflowToggles || {},
	}
}

export async function updateApiConfiguration(
	context: vscode.ExtensionContext,
	apiConfiguration: ApiConfiguration,
	workspaceId: string,
) {
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
		awsBedrockCustomSelected,
		awsBedrockCustomModelBaseId,
		vertexProjectId,
		vertexRegion,
		openAiBaseUrl,
		openAiApiKey,
		openAiModelId,
		openAiModelInfo,
		openAiHeaders,
		ollamaModelId,
		ollamaBaseUrl,
		ollamaApiOptionsCtxNum,
		lmStudioModelId,
		lmStudioBaseUrl,
		anthropicBaseUrl,
		geminiApiKey,
		geminiBaseUrl,
		openAiNativeApiKey,
		deepSeekApiKey,
		requestyApiKey,
		requestyModelId,
		requestyModelInfo,
		togetherApiKey,
		togetherModelId,
		qwenApiKey,
		doubaoApiKey,
		mistralApiKey,
		azureApiVersion,
		openRouterModelId,
		openRouterModelInfo,
		openRouterProviderSorting,
		vsCodeLmModelSelector,
		liteLlmBaseUrl,
		liteLlmModelId,
		liteLlmModelInfo,
		liteLlmApiKey,
		liteLlmUsePromptCache,
		qwenApiLine,
		asksageApiKey,
		asksageApiUrl,
		xaiApiKey,
		thinkingBudgetTokens,
		reasoningEffort,
		clineApiKey,
		sambanovaApiKey,
		nebiusApiKey,
		favoritedModelIds,
	} = apiConfiguration
	await customUpdateState(context, "apiProvider", apiProvider)
	await customUpdateState(context, "apiModelId", apiModelId)
	await customStoreSecret(context, "apiKey", workspaceId, apiKey, true)
	await customStoreSecret(context, "openRouterApiKey", workspaceId, openRouterApiKey, true)
	await customStoreSecret(context, "awsAccessKey", workspaceId, awsAccessKey, true)
	await customStoreSecret(context, "awsSecretKey", workspaceId, awsSecretKey, true)
	await customStoreSecret(context, "awsSessionToken", workspaceId, awsSessionToken, true)
	await customUpdateState(context, "awsRegion", awsRegion)
	await customUpdateState(context, "awsUseCrossRegionInference", awsUseCrossRegionInference)
	await customUpdateState(context, "awsBedrockUsePromptCache", awsBedrockUsePromptCache)
	await customUpdateState(context, "awsBedrockEndpoint", awsBedrockEndpoint)
	await customUpdateState(context, "awsProfile", awsProfile)
	await customUpdateState(context, "awsUseProfile", awsUseProfile)
	await customUpdateState(context, "awsBedrockCustomSelected", awsBedrockCustomSelected)
	await customUpdateState(context, "awsBedrockCustomModelBaseId", awsBedrockCustomModelBaseId)
	await customUpdateState(context, "vertexProjectId", vertexProjectId)
	await customUpdateState(context, "vertexRegion", vertexRegion)
	await customUpdateState(context, "openAiBaseUrl", openAiBaseUrl)
	await customStoreSecret(context, "openAiApiKey", workspaceId, openAiApiKey, true)
	await customUpdateState(context, "openAiModelId", openAiModelId)
	await customUpdateState(context, "openAiModelInfo", openAiModelInfo)
	await customUpdateState(context, "openAiHeaders", openAiHeaders || {})
	await customUpdateState(context, "ollamaModelId", ollamaModelId)
	await customUpdateState(context, "ollamaBaseUrl", ollamaBaseUrl)
	await customUpdateState(context, "ollamaApiOptionsCtxNum", ollamaApiOptionsCtxNum)
	await customUpdateState(context, "lmStudioModelId", lmStudioModelId)
	await customUpdateState(context, "lmStudioBaseUrl", lmStudioBaseUrl)
	await customUpdateState(context, "anthropicBaseUrl", anthropicBaseUrl)
	await customStoreSecret(context, "geminiApiKey", workspaceId, geminiApiKey, true)
	await customUpdateState(context, "geminiBaseUrl", geminiBaseUrl)
	await customStoreSecret(context, "openAiNativeApiKey", workspaceId, openAiNativeApiKey, true)
	await customStoreSecret(context, "deepSeekApiKey", workspaceId, deepSeekApiKey, true)
	await customStoreSecret(context, "requestyApiKey", workspaceId, requestyApiKey, true)
	await customStoreSecret(context, "togetherApiKey", workspaceId, togetherApiKey, true)
	await customStoreSecret(context, "qwenApiKey", workspaceId, qwenApiKey, true)
	await customStoreSecret(context, "doubaoApiKey", workspaceId, doubaoApiKey, true)
	await customStoreSecret(context, "mistralApiKey", workspaceId, mistralApiKey, true)
	await customStoreSecret(context, "liteLlmApiKey", workspaceId, liteLlmApiKey, true)
	await customStoreSecret(context, "xaiApiKey", workspaceId, xaiApiKey, true)
	await customUpdateState(context, "azureApiVersion", azureApiVersion)
	await customUpdateState(context, "openRouterModelId", openRouterModelId)
	await customUpdateState(context, "openRouterModelInfo", openRouterModelInfo)
	await customUpdateState(context, "openRouterProviderSorting", openRouterProviderSorting)
	await customUpdateState(context, "vsCodeLmModelSelector", vsCodeLmModelSelector)
	await customUpdateState(context, "liteLlmBaseUrl", liteLlmBaseUrl)
	await customUpdateState(context, "liteLlmModelId", liteLlmModelId)
	await customUpdateState(context, "liteLlmModelInfo", liteLlmModelInfo)
	await customUpdateState(context, "liteLlmUsePromptCache", liteLlmUsePromptCache)
	await customUpdateState(context, "qwenApiLine", qwenApiLine)
	await customUpdateState(context, "requestyModelId", requestyModelId)
	await customUpdateState(context, "requestyModelInfo", requestyModelInfo)
	await customUpdateState(context, "togetherModelId", togetherModelId)
	await customStoreSecret(context, "asksageApiKey", workspaceId, asksageApiKey, true)
	await customUpdateState(context, "asksageApiUrl", asksageApiUrl)
	await customUpdateState(context, "thinkingBudgetTokens", thinkingBudgetTokens)
	await customUpdateState(context, "reasoningEffort", reasoningEffort)
	await customStoreSecret(context, "clineApiKey", workspaceId, clineApiKey, true)
	await customStoreSecret(context, "sambanovaApiKey", workspaceId, sambanovaApiKey, true)
	await customStoreSecret(context, "nebiusApiKey", workspaceId, nebiusApiKey, true)
	await customUpdateState(context, "favoritedModelIds", favoritedModelIds)
	await customUpdateState(context, "requestTimeoutMs", apiConfiguration.requestTimeoutMs)
}

export async function updateEmbeddingConfiguration(
	context: vscode.ExtensionContext,
	embeddingConfiguration: EmbeddingConfiguration,
	workspaceId: string,
) {
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
	await customUpdateState(context, "embeddingProvider", provider)
	await customUpdateState(context, "embeddingModelId", modelId)
	await customUpdateState(context, "embeddingAwsRegion", awsRegion)
	await customUpdateState(context, "embeddingOpenAiBaseUrl", openAiBaseUrl)
	await customUpdateState(context, "embeddingOpenAiModelId", openAiModelId)
	await customUpdateState(context, "embeddingAzureOpenAIApiInstanceName", azureOpenAIApiInstanceName)
	await customUpdateState(context, "embeddingAzureOpenAIApiVersion", azureOpenAIApiVersion)
	await customUpdateState(context, "embeddingAzureOpenAIApiEmbeddingsDeploymentName", azureOpenAIApiEmbeddingsDeploymentName)
	await customUpdateState(context, "embeddingOllamaBaseUrl", ollamaBaseUrl)
	await customUpdateState(context, "embeddingOllamaModelId", ollamaModelId)
	// Update Secrets
	await customStoreSecret(context, "embeddingAwsAccessKey", workspaceId, awsAccessKey, true)
	await customStoreSecret(context, "embeddingAwsSecretKey", workspaceId, awsSecretKey, true)
	await customStoreSecret(context, "embeddingAwsSessionToken", workspaceId, awsSessionToken, true)
	await customStoreSecret(context, "embeddingOpenAiApiKey", workspaceId, openAiApiKey, true)
	await customStoreSecret(context, "embeddingOpenAiNativeApiKey", workspaceId, openAiNativeApiKey, true)
	await customStoreSecret(context, "embeddingAzureOpenAIApiKey", workspaceId, azureOpenAIApiKey, true)
}

export async function resetExtensionState(context: vscode.ExtensionContext, workspaceId: string) {
	for (const key of context.workspaceState.keys()) {
		await context.workspaceState.update(key, undefined)
	}
	for (const key of context.globalState.keys()) {
		await context.globalState.update(key, undefined)
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
		"doubaoApiKey",
		"mistralApiKey",
		"clineApiKey",
		"liteLlmApiKey",
		"fireworksApiKey",
		"asksageApiKey",
		"xaiApiKey",
		"sambanovaApiKey",
		"nebiusApiKey",
		"embeddingAwsAccessKey",
		"embeddingAwsSecretKey",
		"embeddingAwsSessionToken",
		"embeddingOpenAiApiKey",
		"embeddingOpenAiNativeApiKey",
		"embeddingAzureOpenAIApiKey",
	]
	for (const key of secretKeys) {
		await customStoreSecret(context, key, workspaceId, undefined, true)
	}
}
