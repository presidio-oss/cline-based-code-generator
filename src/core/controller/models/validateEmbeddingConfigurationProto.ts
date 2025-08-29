import type { Controller } from "../index"
import { Boolean } from "@shared/proto/cline/common"
import { UpdateEmbeddingConfigurationRequest } from "@shared/proto/cline/models"
import { convertProtoToEmbeddingConfiguration } from "@shared/proto-conversions/models/embedding-configuration-conversion"
import { buildEmbeddingHandler } from "@/embedding"
import { validateEmbeddingConfiguration } from "@/utils/validate"

/**
 * Validates embedding configuration by performing both client-side validation
 * and server-side API key validation similar to the legacy validateEmbeddingConfig implementation
 * @param controller The controller instance
 * @param request The validate embedding configuration request
 * @returns Boolean response indicating if the configuration is valid
 */
export async function validateEmbeddingConfigurationProto(
	controller: Controller,
	request: UpdateEmbeddingConfigurationRequest,
): Promise<Boolean> {
	try {
		if (!request.embeddingConfiguration) {
			console.log("[EMBEDDINGCONFIG: validateEmbeddingConfigurationProto] Embedding configuration is required")
			return Boolean.create({ value: false })
		}

		// Convert proto EmbeddingConfiguration to application EmbeddingConfiguration
		const appEmbeddingConfiguration = convertProtoToEmbeddingConfiguration(request.embeddingConfiguration)

		// First, perform client-side validation (same logic as in webview validate.ts)
		const validationError = validateEmbeddingConfiguration(appEmbeddingConfiguration)
		if (validationError) {
			console.log("[EMBEDDINGCONFIG: validateEmbeddingConfigurationProto] Client-side validation failed:", validationError)
			return Boolean.create({ value: false })
		}

		// Skip API validation for "none" provider
		if (appEmbeddingConfiguration?.provider === "none") {
			return Boolean.create({ value: true })
		}

		// Perform server-side API key validation (similar to legacy implementation)
		try {
			const embeddingHandler = buildEmbeddingHandler({
				...appEmbeddingConfiguration,
				maxRetries: 0, // Use 0 retries for validation to fail fast
			})

			const isValid = await embeddingHandler.validateAPIKey()

			console.log(`[EMBEDDINGCONFIG: validateEmbeddingConfigurationProto] API validation result: ${isValid}`)
			return Boolean.create({ value: isValid })
		} catch (error) {
			console.error(`[EMBEDDINGCONFIG: validateEmbeddingConfigurationProto] API validation error: ${error}`)
			return Boolean.create({ value: false })
		}
	} catch (error) {
		console.error(`[EMBEDDINGCONFIG: validateEmbeddingConfigurationProto] Validation failed: ${error}`)
		return Boolean.create({ value: false })
	}
}
