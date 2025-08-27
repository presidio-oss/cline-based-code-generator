import { useExtensionState } from "@/context/ExtensionStateContext"
import { EmbeddingConfiguration } from "@shared/embeddings"
import { convertEmbeddingConfigurationToProto } from "@shared/proto-conversions/models/embedding-configuration-conversion"
import { UpdateEmbeddingConfigurationRequest } from "@shared/proto/cline/models"
import { ModelsServiceClient } from "@/services/grpc-client"

export const useEmbeddingConfigurationHandlers = () => {
	const { embeddingConfiguration } = useExtensionState()

	/**
	 * Updates a single field in the Embedding configuration.
	 *
	 * **Warning**: If this function is called multiple times in rapid succession,
	 * it can lead to race conditions where later calls may overwrite changes from
	 * earlier calls. For updating multiple fields, use `handleFieldsChange` instead.
	 *
	 * @param field - The field key to update
	 * @param value - The new value for the field
	 */
	const handleFieldChange = async <K extends keyof EmbeddingConfiguration>(field: K, value: EmbeddingConfiguration[K]) => {
		const updatedConfig = {
			...embeddingConfiguration,
			[field]: value,
		}

		const protoConfig = convertEmbeddingConfigurationToProto(updatedConfig)
		await ModelsServiceClient.updateEmbeddingConfigurationProto(
			UpdateEmbeddingConfigurationRequest.create({
				embeddingConfiguration: protoConfig,
			}),
		)
	}

	/**
	 * Updates multiple fields in the Embedding configuration at once.
	 *
	 * This function should be used when updating multiple fields to avoid race conditions
	 * that can occur when calling `handleFieldChange` multiple times in succession.
	 * All updates are applied together as a single operation.
	 *
	 * @param updates - An object containing the fields to update and their new values
	 */
	const handleFieldsChange = async (updates: Partial<EmbeddingConfiguration>) => {
		const updatedConfig = {
			...embeddingConfiguration,
			...updates,
		}

		const protoConfig = convertEmbeddingConfigurationToProto(updatedConfig)
		await ModelsServiceClient.updateEmbeddingConfigurationProto(
			UpdateEmbeddingConfigurationRequest.create({
				embeddingConfiguration: protoConfig,
			}),
		)
	}

	return { handleFieldChange, handleFieldsChange }
}
