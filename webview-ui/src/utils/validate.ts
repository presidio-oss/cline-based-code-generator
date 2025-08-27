import { ApiConfiguration, openRouterDefaultModelId, ModelInfo } from "@shared/api"
import { getModeSpecificFields } from "@/components/settings/utils/providerUtils"
import { Mode } from "@shared/storage/types"
import { EmbeddingConfiguration } from "@shared/embeddings"

export function validateApiConfiguration(currentMode: Mode, apiConfiguration?: ApiConfiguration): string | undefined {
	if (apiConfiguration) {
		const {
			apiProvider,
			openAiModelId,
			requestyModelId,
			fireworksModelId,
			togetherModelId,
			ollamaModelId,
			lmStudioModelId,
			vsCodeLmModelSelector,
		} = getModeSpecificFields(apiConfiguration, currentMode)

		switch (apiProvider) {
			case "anthropic":
				if (!apiConfiguration.apiKey) {
					return "You must provide a valid API key or choose a different provider."
				}
				break
			case "bedrock":
				if (!apiConfiguration.awsRegion) {
					return "You must choose a region to use with AWS Bedrock."
				}
				// Validate authentication based on the selected method
				const authMethod = apiConfiguration.awsAuthentication || (apiConfiguration.awsProfile ? "profile" : "credentials")
				if (authMethod === "apikey") {
					if (!apiConfiguration.awsBedrockApiKey) {
						return "You must provide a valid AWS Bedrock API key."
					}
				} else if (authMethod === "credentials") {
					if (!apiConfiguration.awsAccessKey || !apiConfiguration.awsSecretKey) {
						return "You must provide both AWS Access Key and Secret Key."
					}
				}
				// Profile authentication is valid even with empty profile name (uses default)
				break
			case "openrouter":
				if (!apiConfiguration.openRouterApiKey) {
					return "You must provide a valid API key or choose a different provider."
				}
				break
			case "vertex":
				if (!apiConfiguration.vertexProjectId || !apiConfiguration.vertexRegion) {
					return "You must provide a valid Google Cloud Project ID and Region."
				}
				break
			case "gemini":
				if (!apiConfiguration.geminiApiKey) {
					return "You must provide a valid API key or choose a different provider."
				}
				break
			case "openai-native":
				if (!apiConfiguration.openAiNativeApiKey) {
					return "You must provide a valid API key or choose a different provider."
				}
				break
			case "deepseek":
				if (!apiConfiguration.deepSeekApiKey) {
					return "You must provide a valid API key or choose a different provider."
				}
				break
			case "xai":
				if (!apiConfiguration.xaiApiKey) {
					return "You must provide a valid API key or choose a different provider."
				}
				break
			case "qwen":
				if (!apiConfiguration.qwenApiKey) {
					return "You must provide a valid API key or choose a different provider."
				}
				break
			case "doubao":
				if (!apiConfiguration.doubaoApiKey) {
					return "You must provide a valid API key or choose a different provider."
				}
				break
			case "mistral":
				if (!apiConfiguration.mistralApiKey) {
					return "You must provide a valid API key or choose a different provider."
				}
				break
			case "cline":
				if (!apiConfiguration.clineAccountId) {
					return "You must provide a valid API key or choose a different provider."
				}
				break
			case "openai":
				if (!apiConfiguration.openAiBaseUrl || !apiConfiguration.openAiApiKey || !openAiModelId) {
					return "You must provide a valid base URL, API key, and model ID."
				}
				break
			case "requesty":
				if (!apiConfiguration.requestyApiKey || !requestyModelId) {
					return "You must provide a valid API key or choose a different provider."
				}
				break
			case "fireworks":
				if (!apiConfiguration.fireworksApiKey || !fireworksModelId) {
					return "You must provide a valid API key or choose a different provider."
				}
				break
			case "together":
				if (!apiConfiguration.togetherApiKey || !togetherModelId) {
					return "You must provide a valid API key or choose a different provider."
				}
				break
			case "ollama":
				if (!ollamaModelId) {
					return "You must provide a valid model ID."
				}
				break
			case "lmstudio":
				if (!lmStudioModelId) {
					return "You must provide a valid model ID."
				}
				break
			case "vscode-lm":
				if (!vsCodeLmModelSelector) {
					return "You must provide a valid model selector."
				}
				break
			case "moonshot":
				if (!apiConfiguration.moonshotApiKey) {
					return "You must provide a valid API key or choose a different provider."
				}
				break
			case "nebius":
				if (!apiConfiguration.nebiusApiKey) {
					return "You must provide a valid API key or choose a different provider."
				}
				break
			case "asksage":
				if (!apiConfiguration.asksageApiKey) {
					return "You must provide a valid API key or choose a different provider."
				}
				break
			case "sambanova":
				if (!apiConfiguration.sambanovaApiKey) {
					return "You must provide a valid API key or choose a different provider."
				}
				break
			case "sapaicore":
				if (!apiConfiguration.sapAiCoreBaseUrl) {
					return "You must provide a valid Base URL key or choose a different provider."
				}
				if (!apiConfiguration.sapAiCoreClientId) {
					return "You must provide a valid Client Id or choose a different provider."
				}
				if (!apiConfiguration.sapAiCoreClientSecret) {
					return "You must provide a valid Client Secret or choose a different provider."
				}
				if (!apiConfiguration.sapAiCoreTokenUrl) {
					return "You must provide a valid Auth URL or choose a different provider."
				}
				break
		}
	}
	return undefined
}

export function validateModelId(
	currentMode: Mode,
	apiConfiguration?: ApiConfiguration,
	openRouterModels?: Record<string, ModelInfo>,
): string | undefined {
	if (apiConfiguration) {
		const { apiProvider, openRouterModelId } = getModeSpecificFields(apiConfiguration, currentMode)
		switch (apiProvider) {
			case "openrouter":
			case "cline":
				const modelId = openRouterModelId || openRouterDefaultModelId // in case the user hasn't changed the model id, it will be undefined by default
				if (!modelId) {
					return "You must provide a model ID."
				}
				if (openRouterModels && !Object.keys(openRouterModels).includes(modelId)) {
					// even if the model list endpoint failed, extensionstatecontext will always have the default model info
					return "The model ID you provided is not available. Please choose a different model."
				}
				break
		}
	}
	return undefined
}

export function validateEmbeddingConfiguration(config?: EmbeddingConfiguration): string | undefined {
	if (!config) {
		return "Embedding configuration is required"
	}

	switch (config.provider) {
		case "none":
			// No validation needed for "none" provider
			break
		case "openai-native":
			if (!config.openAiNativeApiKey) {
				return "You must provide a valid OpenAI API key."
			}
			break
		case "bedrock":
			if (!config.awsRegion) {
				return "You must provide a valid AWS Region to use AWS Bedrock."
			}
			// Access key and secret key are optional if using AWS credential providers
			break
		case "openai":
			if (!config.openAiApiKey || !config.openAiBaseUrl || !config.openAiModelId) {
				return "You must provide a valid API key, Model ID and base URL."
			}
			break
		case "ollama":
			if (!config.ollamaModelId) {
				return "You must provide a valid model ID."
			}
			break
		default:
			return `Unsupported embedding provider: ${config.provider}`
	}

	return undefined
}
