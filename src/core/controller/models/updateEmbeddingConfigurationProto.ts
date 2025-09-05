import { Empty } from "@shared/proto/cline/common"
import { UpdateEmbeddingConfigurationRequest } from "@shared/proto/cline/models"
import { convertProtoToEmbeddingConfiguration } from "@shared/proto-conversions/models/embedding-configuration-conversion"
import type { Controller } from "../index"

/**
 * Updates Embedding configuration
 * @param controller The controller instance
 * @param request The update embedding configuration request
 * @returns Empty response
 */
export async function updateEmbeddingConfigurationProto(
	controller: Controller,
	request: UpdateEmbeddingConfigurationRequest,
): Promise<Empty> {
	try {
		if (!request.embeddingConfiguration) {
			console.log("[EMBEDDINGCONFIG: updateEmbeddingConfigurationProto] Embedding configuration is required")
			throw new Error("Embedding configuration is required")
		}

		// Convert proto EmbeddingConfiguration to application EmbeddingConfiguration
		const appEmbeddingConfiguration = convertProtoToEmbeddingConfiguration(request.embeddingConfiguration)

		// Update the embedding configuration in storage
		controller.cacheService.setEmbeddingConfiguration(appEmbeddingConfiguration)

		// Post updated state to webview
		await controller.postStateToWebview()

		return Empty.create()
	} catch (error) {
		console.error(`Failed to update embedding configuration: ${error}`)
		throw error
	}
}
