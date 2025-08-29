import { bedrockEmbeddingModels } from "@shared/embeddings"
import { VSCodeDropdown, VSCodeOption } from "@vscode/webview-ui-toolkit/react"
import { DebouncedTextField } from "../../common/DebouncedTextField"
import { ModelSelector } from "../../common/ModelSelector"
import { ModelInfoView } from "../../common/ModelInfoView"
import { DropdownContainer } from "../../common/ModelSelector"
import { useExtensionState } from "@/context/ExtensionStateContext"
import { useEmbeddingConfigurationHandlers } from "../../utils/useEmbeddingConfigurationHandlers"

interface BedrockEmbeddingProviderProps {
	showModelOptions: boolean
	isPopup?: boolean
}

export const BedrockEmbeddingProvider = ({ showModelOptions, isPopup }: BedrockEmbeddingProviderProps) => {
	const { embeddingConfiguration } = useExtensionState()
	const { handleFieldChange } = useEmbeddingConfigurationHandlers()

	return (
		<div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
			<DebouncedTextField
				initialValue={embeddingConfiguration?.awsAccessKey || ""}
				onChange={(value) => handleFieldChange("awsAccessKey", value)}
				placeholder="Enter Access Key..."
				type="password">
				<span style={{ fontWeight: 500 }}>AWS Access Key</span>
			</DebouncedTextField>
			<DebouncedTextField
				initialValue={embeddingConfiguration?.awsSecretKey || ""}
				onChange={(value) => handleFieldChange("awsSecretKey", value)}
				placeholder="Enter Secret Key..."
				type="password">
				<span style={{ fontWeight: 500 }}>AWS Secret Key</span>
			</DebouncedTextField>

			<DebouncedTextField
				initialValue={embeddingConfiguration?.awsSessionToken || ""}
				onChange={(value) => handleFieldChange("awsSessionToken", value)}
				placeholder="Enter Session Token (optional)..."
				type="password">
				<span style={{ fontWeight: 500 }}>AWS Session Token (optional)</span>
			</DebouncedTextField>

			<DropdownContainer>
				<label htmlFor="embedding-aws-region">
					<span style={{ fontWeight: 500 }}>
						AWS Region <span style={{ color: "var(--vscode-errorForeground)" }}>*</span>
					</span>
				</label>
				<VSCodeDropdown
					id="embedding-aws-region"
					value={embeddingConfiguration?.awsRegion || ""}
					style={{ width: "100%" }}
					onChange={(e: any) => handleFieldChange("awsRegion", e.target.value)}>
					<VSCodeOption value="">Select a region...</VSCodeOption>
					<VSCodeOption value="us-east-1">us-east-1</VSCodeOption>
					<VSCodeOption value="us-east-2">us-east-2</VSCodeOption>
					<VSCodeOption value="us-west-2">us-west-2</VSCodeOption>
					<VSCodeOption value="ap-south-1">ap-south-1</VSCodeOption>
					<VSCodeOption value="ap-northeast-1">ap-northeast-1</VSCodeOption>
					<VSCodeOption value="ap-northeast-2">ap-northeast-2</VSCodeOption>
					<VSCodeOption value="ap-southeast-1">ap-southeast-1</VSCodeOption>
					<VSCodeOption value="ap-southeast-2">ap-southeast-2</VSCodeOption>
					<VSCodeOption value="ca-central-1">ca-central-1</VSCodeOption>
					<VSCodeOption value="eu-central-1">eu-central-1</VSCodeOption>
					<VSCodeOption value="eu-west-1">eu-west-1</VSCodeOption>
					<VSCodeOption value="eu-west-2">eu-west-2</VSCodeOption>
					<VSCodeOption value="eu-west-3">eu-west-3</VSCodeOption>
					<VSCodeOption value="sa-east-1">sa-east-1</VSCodeOption>
					<VSCodeOption value="us-gov-west-1">us-gov-west-1</VSCodeOption>
				</VSCodeDropdown>
			</DropdownContainer>

			{showModelOptions && (
				<>
					<ModelSelector
						models={bedrockEmbeddingModels}
						selectedModelId={embeddingConfiguration?.modelId || ""}
						onChange={(e: any) => handleFieldChange("modelId", e.target.value)}
						label="Embedding Model"
					/>

					{embeddingConfiguration?.modelId && embeddingConfiguration.modelId in bedrockEmbeddingModels && (
						<ModelInfoView
							selectedModelId={embeddingConfiguration.modelId}
							modelInfo={
								bedrockEmbeddingModels[embeddingConfiguration.modelId as keyof typeof bedrockEmbeddingModels]
							}
						/>
					)}
				</>
			)}

			<p style={{ fontSize: "12px", marginTop: "5px", color: "var(--vscode-descriptionForeground)" }}>
				Authenticate by either providing the keys above or use the default AWS credential providers, i.e.
				~/.aws/credentials or environment variables. These credentials are only used locally to make API requests from
				this extension.
			</p>
		</div>
	)
}
