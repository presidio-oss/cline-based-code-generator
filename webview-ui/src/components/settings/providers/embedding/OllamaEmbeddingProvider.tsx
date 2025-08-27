import { VSCodeDropdown, VSCodeOption, VSCodeLink } from "@vscode/webview-ui-toolkit/react"
import { useCallback, useEffect, useState } from "react"
import { useInterval } from "react-use"
import { DebouncedTextField } from "../../common/DebouncedTextField"
import { DropdownContainer } from "../../common/ModelSelector"
import { useExtensionState } from "@/context/ExtensionStateContext"
import { useEmbeddingConfigurationHandlers } from "../../utils/useEmbeddingConfigurationHandlers"
import { ModelsServiceClient } from "@/services/grpc-client"
import { StringRequest } from "@shared/proto/cline/common"

interface OllamaEmbeddingProviderProps {
	showModelOptions: boolean
	isPopup?: boolean
}

export const OllamaEmbeddingProvider = ({ showModelOptions, isPopup }: OllamaEmbeddingProviderProps) => {
	const { embeddingConfiguration } = useExtensionState()
	const { handleFieldChange } = useEmbeddingConfigurationHandlers()
	const [ollamaModels, setOllamaModels] = useState<string[]>([])

	// Poll ollama models
	const requestLocalModels = useCallback(async () => {
		try {
			const response = await ModelsServiceClient.getOllamaModels(
				StringRequest.create({
					value: embeddingConfiguration?.ollamaBaseUrl || "",
				}),
			)
			if (response && response.values) {
				setOllamaModels(response.values)
			}
		} catch (error) {
			console.error("Failed to fetch Ollama models:", error)
			setOllamaModels([])
		}
	}, [embeddingConfiguration?.ollamaBaseUrl])

	useEffect(() => {
		requestLocalModels()
	}, [requestLocalModels])

	useInterval(requestLocalModels, 2000)

	return (
		<div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
			<DebouncedTextField
				initialValue={embeddingConfiguration?.ollamaBaseUrl || ""}
				onChange={(value) => handleFieldChange("ollamaBaseUrl", value)}
				type="url"
				placeholder="Default: http://localhost:11434">
				<span style={{ fontWeight: 500 }}>Ollama Base URL</span>
			</DebouncedTextField>

			{showModelOptions && (
				<DropdownContainer>
					<label htmlFor="ollama-embedding-model-id">
						<span style={{ fontWeight: 500 }}>
							Model <span style={{ color: "var(--vscode-errorForeground)" }}>*</span>
						</span>
					</label>
					<VSCodeDropdown
						id="ollama-embedding-model-id"
						value={embeddingConfiguration?.ollamaModelId || ""}
						onChange={(e: any) => handleFieldChange("ollamaModelId", e.target.value)}
						style={{ width: "100%" }}>
						<VSCodeOption value="">Select a model...</VSCodeOption>
						{ollamaModels.map((modelId) => (
							<VSCodeOption
								key={modelId}
								value={modelId}
								style={{
									whiteSpace: "normal",
									wordWrap: "break-word",
									maxWidth: "100%",
								}}>
								{modelId}
							</VSCodeOption>
						))}
					</VSCodeDropdown>
				</DropdownContainer>
			)}

			<p style={{ fontSize: "12px", marginTop: "5px", color: "var(--vscode-descriptionForeground)" }}>
				Ollama allows you to run embedding models locally on your computer. For instructions on how to get started, see
				their{" "}
				<VSCodeLink
					href="https://github.com/ollama/ollama/blob/main/README.md"
					style={{ display: "inline", fontSize: "inherit" }}>
					quickstart guide.
				</VSCodeLink>{" "}
				You can download list of supported embedding models from{" "}
				<VSCodeLink href="https://ollama.com/search?c=embedding" style={{ display: "inline", fontSize: "inherit" }}>
					here.
				</VSCodeLink>
			</p>
		</div>
	)
}
