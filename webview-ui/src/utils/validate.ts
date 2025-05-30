import { ApiConfiguration, openRouterDefaultModelId, ModelInfo } from "@shared/api"
import {
	validateApiConfiguration as validateApiConfigurationFn,
	validateEmbeddingConfiguration as validateEmbeddingConfigurationFn,
} from "@shared/validate"
export const validateApiConfiguration = validateApiConfigurationFn
export const validateEmbeddingConfiguration = validateEmbeddingConfigurationFn

export function validateModelId(
	apiConfiguration?: ApiConfiguration,
	openRouterModels?: Record<string, ModelInfo>,
): string | undefined {
	if (apiConfiguration) {
		switch (apiConfiguration.apiProvider) {
			case "openrouter":
			case "cline":
				const modelId = apiConfiguration.openRouterModelId || openRouterDefaultModelId // in case the user hasn't changed the model id, it will be undefined by default
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
