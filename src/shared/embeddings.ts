export type EmbeddingProvider = "none" | "bedrock" | "openai-native" | "openai" | "ollama"

export interface EmbeddingHandlerOptions {
	modelId?: string
	apiKey?: string // anthropic
	openRouterApiKey?: string
	awsAccessKey?: string
	awsSecretKey?: string
	awsSessionToken?: string
	awsRegion?: string
	openAiBaseUrl?: string
	openAiApiKey?: string
	openAiModelId?: string
	openAiNativeApiKey?: string
	azureOpenAIApiKey?: string
	azureOpenAIApiInstanceName?: string
	azureOpenAIApiEmbeddingsDeploymentName?: string
	azureOpenAIApiVersion?: string
	maxRetries?: number
	ollamaBaseUrl?: string
	ollamaModelId?: string
}

export type EmbeddingConfiguration = EmbeddingHandlerOptions & {
	provider?: EmbeddingProvider
}

export interface EmbeddingModelInfo {
	maxDimensions: number
	contextWindow?: number
	pricePerMillion: number
	description?: string
	supportsImages?: boolean
	supportsBatching?: boolean
}

// Embedding Models

// Bedrock

export type bedrockEmbeddingModelId = keyof typeof bedrockEmbeddingModels
export const bedrockEmbeddingDefaultModelId: bedrockEmbeddingModelId = "amazon.titan-embed-text-v1"
export const bedrockEmbeddingModels = {
	"amazon.titan-embed-text-v1": {
		maxDimensions: 1536,
		pricePerMillion: 0.0004,
		description: "Amazon Titan Text Embeddings model for semantic search and text similarity tasks.",
		supportsPromptCache: false,
	},
	"amazon.titan-embed-text-v2:0": {
		maxDimensions: 1024,
		pricePerMillion: 0.02,
		description: "Amazon Titan Text Embeddings model for semantic search and text similarity tasks with larger context.",
		supportsPromptCache: false,
	},
} as const

// OpenAI Native
export type OpenAiNativeEmbeddingModelId = keyof typeof openAiNativeEmbeddingModels
export const openAiNativeEmbeddingDefaultModelId: OpenAiNativeEmbeddingModelId = "text-embedding-3-small"
export const openAiNativeEmbeddingModels = {
	"text-embedding-3-small": {
		maxDimensions: 1536,
		pricePerMillion: 0.02,
		description: "Fastest and most cost-effective model. Ideal for production deployments.",
		supportsBatching: true,
		supportsPromptCache: false,
	},
	"text-embedding-3-large": {
		maxDimensions: 3072,
		pricePerMillion: 0.13,
		description: "Most capable model. Best for high-stakes use cases requiring maximal performance.",
		supportsBatching: true,
		supportsPromptCache: false,
	},
	"text-embedding-ada-002": {
		maxDimensions: 1536,
		pricePerMillion: 0.1,
		description: "Legacy model. Kept for backwards compatibility.",
		supportsBatching: true,
		supportsPromptCache: false,
	},
} as const

export const embeddingProviderModels = {
	none: {},
	bedrock: bedrockEmbeddingModels,
	"openai-native": openAiNativeEmbeddingModels,
	openai: {},
	ollama: {},
} as const

export const defaultEmbeddingConfigs: Record<EmbeddingProvider, { defaultModel: string }> = {
	none: {
		defaultModel: "",
	},
	bedrock: {
		defaultModel: "amazon.titan-embed-text-v1",
	},
	"openai-native": {
		defaultModel: "text-embedding-3-small",
	},
	openai: {
		defaultModel: "",
	},
	ollama: {
		defaultModel: "",
	},
}

export const azureOpenAIApiVersion = "2023-05-15"
