import { VSCodeCheckbox } from "@vscode/webview-ui-toolkit/react"
import { useState } from "react"
import { DebouncedTextField } from "../../common/DebouncedTextField"
import { useExtensionState } from "@/context/ExtensionStateContext"
import { useEmbeddingConfigurationHandlers } from "../../utils/useEmbeddingConfigurationHandlers"
import { azureOpenAIApiVersion } from "@shared/embeddings"

interface OpenAIEmbeddingProviderProps {
	showModelOptions: boolean
	isPopup?: boolean
}

export const OpenAIEmbeddingProvider = ({ showModelOptions, isPopup }: OpenAIEmbeddingProviderProps) => {
	const { embeddingConfiguration } = useExtensionState()
	const { handleFieldChange } = useEmbeddingConfigurationHandlers()
	const [azureApiVersionSelected, setAzureApiVersionSelected] = useState(!!embeddingConfiguration?.azureOpenAIApiVersion)

	return (
		<div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
			<DebouncedTextField
				initialValue={embeddingConfiguration?.openAiBaseUrl || ""}
				onChange={(value) => handleFieldChange("openAiBaseUrl", value)}
				placeholder="Enter base URL...">
				<span style={{ fontWeight: 500 }}>OpenAI Base URL</span>
			</DebouncedTextField>

			<DebouncedTextField
				initialValue={embeddingConfiguration?.openAiApiKey || ""}
				onChange={(value) => handleFieldChange("openAiApiKey", value)}
				placeholder="Enter API Key..."
				type="password">
				<span style={{ fontWeight: 500 }}>OpenAI API Key</span>
			</DebouncedTextField>

			<DebouncedTextField
				initialValue={embeddingConfiguration?.openAiModelId || ""}
				onChange={(value) => handleFieldChange("openAiModelId", value)}
				placeholder="Enter Model ID...">
				<span style={{ fontWeight: 500 }}>Model ID</span>
			</DebouncedTextField>

			<VSCodeCheckbox
				checked={azureApiVersionSelected}
				onChange={(e: any) => {
					const isChecked = e.target.checked === true
					setAzureApiVersionSelected(isChecked)
					if (!isChecked) {
						handleFieldChange("azureOpenAIApiVersion", "")
					}
				}}>
				Set API version
			</VSCodeCheckbox>

			{azureApiVersionSelected && (
				<DebouncedTextField
					initialValue={embeddingConfiguration?.azureOpenAIApiVersion || ""}
					onChange={(value) => handleFieldChange("azureOpenAIApiVersion", value)}
					placeholder={`Default: ${azureOpenAIApiVersion}`}>
					<span style={{ fontWeight: 500 }}>API Version</span>
				</DebouncedTextField>
			)}
		</div>
	)
}
