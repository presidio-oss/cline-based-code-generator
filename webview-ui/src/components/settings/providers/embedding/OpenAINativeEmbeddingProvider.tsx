import { openAiNativeEmbeddingModels } from "@shared/embeddings"
import { ApiKeyField } from "../../common/ApiKeyField"
import { ModelSelector } from "../../common/ModelSelector"
import { ModelInfoView } from "../../common/ModelInfoView"
import { useExtensionState } from "@/context/ExtensionStateContext"
import { useEmbeddingConfigurationHandlers } from "../../utils/useEmbeddingConfigurationHandlers"

/**
 * Props for the OpenAINativeEmbeddingProvider component
 */
interface OpenAINativeEmbeddingProviderProps {
	showModelOptions: boolean
	isPopup?: boolean
}

/**
 * The OpenAI (native) embedding provider configuration component
 */
export const OpenAINativeEmbeddingProvider = ({ showModelOptions, isPopup }: OpenAINativeEmbeddingProviderProps) => {
	const { embeddingConfiguration } = useExtensionState()
	const { handleFieldChange } = useEmbeddingConfigurationHandlers()

	return (
		<div>
			<ApiKeyField
				initialValue={embeddingConfiguration?.openAiNativeApiKey || ""}
				onChange={(value) => handleFieldChange("openAiNativeApiKey", value)}
				providerName="OpenAI"
				signupUrl="https://platform.openai.com/api-keys"
			/>

			{showModelOptions && (
				<>
					<ModelSelector
						models={openAiNativeEmbeddingModels}
						selectedModelId={embeddingConfiguration?.modelId || ""}
						onChange={(e: any) => handleFieldChange("modelId", e.target.value)}
						label="Embedding Model"
					/>

					{embeddingConfiguration?.modelId && embeddingConfiguration.modelId in openAiNativeEmbeddingModels && (
						<ModelInfoView
							selectedModelId={embeddingConfiguration.modelId}
							modelInfo={
								openAiNativeEmbeddingModels[
									embeddingConfiguration.modelId as keyof typeof openAiNativeEmbeddingModels
								]
							}
						/>
					)}
				</>
			)}
		</div>
	)
}
