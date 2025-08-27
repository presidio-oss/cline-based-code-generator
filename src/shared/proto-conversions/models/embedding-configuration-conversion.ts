import { EmbeddingConfiguration, EmbeddingProvider } from "../../embeddings"
import { ModelsEmbeddingConfiguration as ProtoEmbeddingConfiguration } from "@shared/proto/cline/models"
import { EmbeddingProvider as ProtoEmbeddingProvider } from "@shared/proto/cline/state"

// Convert application EmbeddingProvider to proto EmbeddingProvider
function convertEmbeddingProviderToProto(provider: EmbeddingProvider | undefined): string | undefined {
	// For models.proto, the provider field is a string that matches the application values directly
	return provider
}

// Convert proto EmbeddingProvider to application EmbeddingProvider
function convertProtoToEmbeddingProvider(protoProvider: string | undefined): EmbeddingProvider | undefined {
	if (!protoProvider) {
		return undefined
	}

	// Validate that the string is a valid EmbeddingProvider value
	const validProviders: EmbeddingProvider[] = ["none", "bedrock", "openai-native", "openai", "ollama"]
	if (validProviders.includes(protoProvider as EmbeddingProvider)) {
		return protoProvider as EmbeddingProvider
	}

	// Default to "none" if invalid
	return "none"
}

// Converts application EmbeddingConfiguration to proto EmbeddingConfiguration
export function convertEmbeddingConfigurationToProto(config: EmbeddingConfiguration): ProtoEmbeddingConfiguration {
	return {
		// Provider configuration
		provider: convertEmbeddingProviderToProto(config.provider),
		modelId: config.modelId,

		// Global configuration fields
		apiKey: config.apiKey,
		openRouterApiKey: config.openRouterApiKey,
		awsAccessKey: config.awsAccessKey,
		awsSecretKey: config.awsSecretKey,
		awsSessionToken: config.awsSessionToken,
		awsRegion: config.awsRegion,
		openaiBaseUrl: config.openAiBaseUrl,
		openaiApiKey: config.openAiApiKey,
		openaiModelId: config.openAiModelId,
		openaiNativeApiKey: config.openAiNativeApiKey,
		azureOpenaiApiKey: config.azureOpenAIApiKey,
		azureOpenaiApiInstanceName: config.azureOpenAIApiInstanceName,
		azureOpenaiApiEmbeddingsDeploymentName: config.azureOpenAIApiEmbeddingsDeploymentName,
		azureOpenaiApiVersion: config.azureOpenAIApiVersion,
		maxRetries: config.maxRetries,
		ollamaBaseUrl: config.ollamaBaseUrl,
		ollamaModelId: config.ollamaModelId,
	}
}

// Converts proto EmbeddingConfiguration to application EmbeddingConfiguration
export function convertProtoToEmbeddingConfiguration(protoConfig: ProtoEmbeddingConfiguration): EmbeddingConfiguration {
	return {
		// Provider configuration
		provider: convertProtoToEmbeddingProvider(protoConfig.provider),
		modelId: protoConfig.modelId,

		// Global configuration fields
		apiKey: protoConfig.apiKey,
		openRouterApiKey: protoConfig.openRouterApiKey,
		awsAccessKey: protoConfig.awsAccessKey,
		awsSecretKey: protoConfig.awsSecretKey,
		awsSessionToken: protoConfig.awsSessionToken,
		awsRegion: protoConfig.awsRegion,
		openAiBaseUrl: protoConfig.openaiBaseUrl,
		openAiApiKey: protoConfig.openaiApiKey,
		openAiModelId: protoConfig.openaiModelId,
		openAiNativeApiKey: protoConfig.openaiNativeApiKey,
		azureOpenAIApiKey: protoConfig.azureOpenaiApiKey,
		azureOpenAIApiInstanceName: protoConfig.azureOpenaiApiInstanceName,
		azureOpenAIApiEmbeddingsDeploymentName: protoConfig.azureOpenaiApiEmbeddingsDeploymentName,
		azureOpenAIApiVersion: protoConfig.azureOpenaiApiVersion,
		maxRetries: protoConfig.maxRetries,
		ollamaBaseUrl: protoConfig.ollamaBaseUrl,
		ollamaModelId: protoConfig.ollamaModelId,
	}
}
