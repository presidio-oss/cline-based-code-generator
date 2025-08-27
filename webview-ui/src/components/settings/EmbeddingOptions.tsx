import { VSCodeDropdown, VSCodeOption } from "@vscode/webview-ui-toolkit/react"
import { memo, useState, useCallback } from "react"
import { useExtensionState } from "../../context/ExtensionStateContext"
import { useEmbeddingConfigurationHandlers } from "./utils/useEmbeddingConfigurationHandlers"
import { EmbeddingProvider, EmbeddingConfiguration } from "@shared/embeddings"
import { OpenAINativeEmbeddingProvider } from "./providers/embedding/OpenAINativeEmbeddingProvider"
import { BedrockEmbeddingProvider } from "./providers/embedding/BedrockEmbeddingProvider"
import { OpenAIEmbeddingProvider } from "./providers/embedding/OpenAIEmbeddingProvider"
import { OllamaEmbeddingProvider } from "./providers/embedding/OllamaEmbeddingProvider"
import { DropdownContainer } from "./ApiOptions"
import { normalizeEmbeddingConfiguration } from "./utils/providerUtils"
import { useDebounce, useDeepCompareEffect } from "react-use"
import { validateEmbeddingConfiguration } from "@/utils/validate"
import { convertEmbeddingConfigurationToProto } from "@shared/proto-conversions/models/embedding-configuration-conversion"
import { UpdateEmbeddingConfigurationRequest } from "@shared/proto/cline/models"
import { ModelsServiceClient } from "@/services/grpc-client"
import Info, { InfoStatus } from "../common/Info"

interface EmbeddingOptionsProps {
	showModelOptions: boolean
	showModelError?: boolean
	isPopup?: boolean
}

const EmbeddingOptions = ({ showModelOptions, showModelError = true, isPopup }: EmbeddingOptionsProps) => {
	const { embeddingConfiguration } = useExtensionState()
	const { handleFieldChange } = useEmbeddingConfigurationHandlers()

	// Add validation state
	const [isEmbeddingValid, setIsEmbeddingValid] = useState<boolean | null>(null)
	const [isLoading, setIsLoading] = useState(false)
	const [validateEmbedding, setValidateEmbedding] = useState<EmbeddingConfiguration | undefined>(undefined)

	const { selectedProvider } = normalizeEmbeddingConfiguration(embeddingConfiguration)

	// Handle input changes with validation reset
	const handleInputChangeWithValidation = useCallback(
		(field: keyof EmbeddingConfiguration) => {
			return (event: any) => {
				if (field === "provider") {
					// Reset the validation message
					setIsEmbeddingValid(null)
				}
				handleFieldChange(field, event.target.value as EmbeddingConfiguration[typeof field])
			}
		},
		[handleFieldChange],
	)

	// Client-side and trigger server-side validation
	useDeepCompareEffect(() => {
		// If provider is "none", skip validation
		if (embeddingConfiguration?.provider === "none") {
			setIsEmbeddingValid(null)
			return
		}

		const error = validateEmbeddingConfiguration(embeddingConfiguration)

		if (error) {
			setIsEmbeddingValid(null)
			// For client-side validation errors, don't attempt server validation
		} else {
			setValidateEmbedding(embeddingConfiguration)
		}
	}, [embeddingConfiguration])

	// Debounced server-side validation
	useDebounce(
		() => {
			if (validateEmbedding) {
				setIsEmbeddingValid(false)
				setIsLoading(true)
				// Call validation via gRPC
				const validate = async () => {
					try {
						const protoConfig = convertEmbeddingConfigurationToProto(validateEmbedding)
						const result = await ModelsServiceClient.validateEmbeddingConfigurationProto(
							UpdateEmbeddingConfigurationRequest.create({
								embeddingConfiguration: protoConfig,
							}),
						)
						setIsEmbeddingValid(result.value)
						setIsLoading(false)
					} catch (error) {
						setIsEmbeddingValid(false)
						setIsLoading(false)
					}
				}
				validate()
			}
		},
		500,
		[validateEmbedding],
	)

	return (
		<div style={{ display: "flex", flexDirection: "column", gap: 5, marginBottom: isPopup ? -10 : 0 }}>
			<DropdownContainer className="dropdown-container">
				<label htmlFor="embedding-provider">
					<span style={{ fontWeight: 500 }}>Embedding API Provider</span>
				</label>
				<VSCodeDropdown
					id="embedding-provider"
					value={selectedProvider}
					onChange={handleInputChangeWithValidation("provider")}
					disabled={isLoading}
					style={{
						minWidth: 130,
						position: "relative",
					}}>
					<VSCodeOption value="none">None</VSCodeOption>
					<VSCodeOption value="bedrock">AWS Bedrock</VSCodeOption>
					<VSCodeOption value="openai-native">OpenAI</VSCodeOption>
					<VSCodeOption value="openai">OpenAI Compatible</VSCodeOption>
					<VSCodeOption value="ollama">Ollama</VSCodeOption>
				</VSCodeDropdown>
			</DropdownContainer>

			{embeddingConfiguration && selectedProvider === "openai-native" && (
				<OpenAINativeEmbeddingProvider showModelOptions={showModelOptions} isPopup={isPopup} />
			)}

			{embeddingConfiguration && selectedProvider === "bedrock" && (
				<BedrockEmbeddingProvider showModelOptions={showModelOptions} isPopup={isPopup} />
			)}

			{embeddingConfiguration && selectedProvider === "openai" && (
				<OpenAIEmbeddingProvider showModelOptions={showModelOptions} isPopup={isPopup} />
			)}

			{embeddingConfiguration && selectedProvider === "ollama" && (
				<OllamaEmbeddingProvider showModelOptions={showModelOptions} isPopup={isPopup} />
			)}

			{/* Show inline validation feedback for all providers except 'none' */}
			{showModelError && isEmbeddingValid !== null && (
				<Info
					status={isEmbeddingValid ? InfoStatus.SUCCESS : InfoStatus.FAILED}
					statusLabel={`Embedding configuration is ${isEmbeddingValid ? "valid" : "invalid"}`}
					isLoading={isLoading}
					loadingText="Validating Embedding configuration..."
				/>
			)}
		</div>
	)
}

export default memo(EmbeddingOptions)
