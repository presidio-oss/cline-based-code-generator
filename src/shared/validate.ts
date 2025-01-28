import { ApiConfiguration } from "./api"
import { EmbeddingConfiguration } from "./embeddings"

export function validateApiConfiguration(apiConfiguration?: ApiConfiguration): string | undefined {
	if (apiConfiguration) {
		switch (apiConfiguration.apiProvider) {
			case "anthropic":
				if (!apiConfiguration.apiKey) {
					return "You must provide a valid API key or choose a different provider."
				}
				break
			case "bedrock":
				if (!apiConfiguration.awsRegion || !apiConfiguration.awsAccessKey || !apiConfiguration.awsSecretKey) {
					return "You must provide a valid Access Key, Secret Key and Region to use AWS Bedrock."
				}
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
			case "mistral":
				if (!apiConfiguration.mistralApiKey) {
					return "You must provide a valid API key or choose a different provider."
				}
				break
			case "openai":
				if (!apiConfiguration.openAiBaseUrl || !apiConfiguration.openAiApiKey || !apiConfiguration.openAiModelId) {
					return "You must provide a valid base URL, API key, and model ID."
				}
				break
			case "ollama":
				if (!apiConfiguration.ollamaModelId) {
					return "You must provide a valid model ID."
				}
				break
			case "lmstudio":
				if (!apiConfiguration.lmStudioModelId) {
					return "You must provide a valid model ID."
				}
				break
			case "vscode-lm":
				if (!apiConfiguration.vsCodeLmModelSelector) {
					return "You must provide a valid model selector."
				}
				break
		}
	}
	return undefined
}

export function validateEmbeddingConfiguration(config?: EmbeddingConfiguration): string | undefined {
	if (config) {
		switch (config.provider) {
			case "openai-native":
				if (!config.openAiNativeApiKey) {
					return "You must provide a valid API key."
				}
				break
			case "bedrock":
				if (!config.awsRegion || !config.awsAccessKey || !config.awsSecretKey) {
					return "You must provide a valid Access Key, Secret Key and Region to use AWS Bedrock."
				}
				break
			case "openai":
				if (!config.openAiApiKey || !config.openAiBaseUrl || !config.openAiModelId) {
					return "You must provide a valid API key, Model ID and base URL."
				}
		}
	}
	return undefined
}
