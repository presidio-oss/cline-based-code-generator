import { VSCodeCheckbox, VSCodeDropdown, VSCodeLink, VSCodeOption, VSCodeRadioGroup, VSCodeTextField, VSCodeRadio } from "@vscode/webview-ui-toolkit/react"
import { memo, useEffect, useMemo, useState, useCallback } from "react"
import {
	EmbeddingConfiguration,
	embeddingProviderModels,
	EmbeddingModelInfo,
	openAiNativeEmbeddingModels,
	openAiNativeEmbeddingDefaultModelId,
	bedrockeEmbeddingDefaultModelId,
	bedrockEmbeddingModels,
	azureOpenAIApiVersion,
} from "../../../../src/shared/embeddings"
import { useExtensionState } from "../../context/ExtensionStateContext"
import { vscode } from "../../utils/vscode"
import { ExtensionMessage } from "../../../../src/shared/ExtensionMessage"
import { useDebounce, useDeepCompareEffect, useEvent, useInterval } from "react-use"
import Info, { InfoStatus } from "../common/Info"
import { validateEmbeddingConfiguration } from "../../utils/validate"

interface EmbeddingOptionsProps {
	showModelOptions: boolean
	showModelError?: boolean
	embeddingConfiguration?: EmbeddingConfiguration
	onValid?: (isValid: boolean) => void
}

const EmbeddingOptions = ({ showModelOptions, showModelError = true, onValid }: EmbeddingOptionsProps) => {
	const { embeddingConfiguration, setEmbeddingConfiguration, apiConfiguration, setBuildContextOptions, buildContextOptions } =
		useExtensionState()
	const [azureOpenAIApiVersionSelected, setAzureOpenAIApiVersionSelected] = useState(
		!!embeddingConfiguration?.azureOpenAIApiVersion,
	)
	const [isEmbeddingValid, setIsEmbeddingValid] = useState<boolean | null>(null)
	const [isLoading, setIsLoading] = useState(false)
	const [validateEmbedding, setValidateEmbedding] = useState<EmbeddingConfiguration | undefined>(undefined)
	const [ollamaModels, setOllamaModels] = useState<string[]>([])

	useEffect(() => {
		if (!apiConfiguration || !buildContextOptions?.useSyncWithApi) return

		if (apiConfiguration.apiProvider === "openai-native") {
			setEmbeddingConfiguration({
				...embeddingConfiguration,
				provider: "openai-native",
				openAiNativeApiKey: apiConfiguration.openAiNativeApiKey,
			})
		} else if (apiConfiguration.apiProvider === "bedrock") {
			setEmbeddingConfiguration({
				...embeddingConfiguration,
				provider: "bedrock",
				awsAccessKey: apiConfiguration.awsAccessKey,
				awsSecretKey: apiConfiguration.awsSecretKey,
				awsSessionToken: apiConfiguration.awsSessionToken,
				awsRegion: apiConfiguration.awsRegion,
				awsProfile: apiConfiguration.awsProfile,
				awsUseProfile: apiConfiguration.awsUseProfile,
			})
		} else if (apiConfiguration.apiProvider === "openai") {
			setEmbeddingConfiguration({
				...embeddingConfiguration,
				provider: "openai",
				openAiApiKey: apiConfiguration.openAiApiKey,
				openAiBaseUrl: apiConfiguration.openAiBaseUrl,
			})
		}
		// To handle Azure AI
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [apiConfiguration, buildContextOptions?.useSyncWithApi])

	const handleInputChange = (field: keyof EmbeddingConfiguration) => (event: any) => {
		if (field === "provider") {
			// Reset the validation message
			setIsEmbeddingValid(null)
		}

		const newEmbeddingConfiguration = { ...embeddingConfiguration, [field]: event.target.value }
		if (field === "awsProfile") {
			// Make sure to preserve the awsUseProfile setting
			newEmbeddingConfiguration.awsUseProfile = embeddingConfiguration?.awsUseProfile || false
		}
		setEmbeddingConfiguration(newEmbeddingConfiguration)
	}

	useDeepCompareEffect(() => {
		const error = validateEmbeddingConfiguration(embeddingConfiguration)

		if (error) {
			setIsEmbeddingValid(null)
			vscode.postMessage({ type: "validateEmbeddingConfig", embeddingConfiguration, text: error })
		} else {
			setValidateEmbedding(embeddingConfiguration)
		}
	}, [embeddingConfiguration])

	useDebounce(
		() => {
			if (validateEmbedding) {
				setIsEmbeddingValid(false)
				setIsLoading(true)
				vscode.postMessage({ type: "validateEmbeddingConfig", embeddingConfiguration: validateEmbedding })
			}
		},
		500,
		[validateEmbedding],
	)

	const handleApiKey = useCallback((event: MessageEvent) => {
		const message: ExtensionMessage = event.data
		if (message.type === "embeddingConfigValidation") {
			setIsEmbeddingValid(!!message.bool)
			setIsLoading(false)
		}
	}, [])

	useEffect(() => {
		if (onValid) onValid(!!isEmbeddingValid)
	}, [isEmbeddingValid, onValid])

	useEvent("message", handleApiKey)

	const { selectedProvider, selectedModelId } = useMemo(() => {
		return normalizeEmbeddingConfiguration(embeddingConfiguration)
	}, [embeddingConfiguration])

	// Poll ollama models
	const requestLocalModels = useCallback(() => {
		if (selectedProvider === "ollama") {
			vscode.postMessage({
				type: "requestOllamaEmbeddingModels",
				text: apiConfiguration?.ollamaBaseUrl,
			})
		}
	}, [selectedProvider, apiConfiguration?.ollamaBaseUrl])
	useEffect(() => {
		if (selectedProvider === "ollama") {
			requestLocalModels()
		}
	}, [selectedProvider, requestLocalModels])

	useInterval(requestLocalModels, selectedProvider === "ollama" ? 2000 : null)

	const handleMessage = useCallback((event: MessageEvent) => {
		const message: ExtensionMessage = event.data
		if (message.type === "ollamaEmbeddingModels" && message.ollamaEmbeddingModels) {
			setOllamaModels(message.ollamaEmbeddingModels)
		}
	}, [])

	useEvent("message", handleMessage)

	useEffect(() => {
		setEmbeddingConfiguration({
			...embeddingConfiguration,
			provider: selectedProvider,
			modelId: selectedModelId,
		})
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [selectedModelId, selectedProvider])

	const availableModels = useMemo(() => {
		if (!selectedProvider) {
			return {} as Record<string, EmbeddingModelInfo>
		}
		return embeddingProviderModels[selectedProvider] as Record<string, EmbeddingModelInfo>
	}, [selectedProvider])

	return (
		<div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
			<div className="dropdown-container">
				<label htmlFor="embedding-provider">
					<span style={{ fontWeight: 500 }}>Embedding API Provider</span>
				</label>
				<VSCodeDropdown
					id="embedding-provider"
					value={selectedProvider}
					onChange={handleInputChange("provider")}
					disabled={isLoading}
					style={{ minWidth: 130, position: "relative", width: "100%" }}>
					<VSCodeOption value="bedrock">AWS Bedrock</VSCodeOption>
					<VSCodeOption value="openai-native">OpenAI</VSCodeOption>
					<VSCodeOption value="openai">OpenAI Compatible</VSCodeOption>
					<VSCodeOption value="ollama">Ollama (experimental) </VSCodeOption>
				</VSCodeDropdown>
			</div>

			{selectedProvider === "openai-native" && (
				<div>
					<VSCodeTextField
						value={embeddingConfiguration?.openAiNativeApiKey || ""}
						style={{ width: "100%" }}
						type="password"
						onInput={handleInputChange("openAiNativeApiKey")}
						placeholder="Enter API Key...">
						<span style={{ fontWeight: 500 }}>
							OpenAI API Key <span style={{ color: "var(--vscode-errorForeground)" }}>*</span>
						</span>
					</VSCodeTextField>
					<p
						style={{
							fontSize: "12px",
							marginTop: 3,
							color: "var(--vscode-descriptionForeground)",
						}}>
						This key is stored locally and only used to make API requests from this extension.
						{!embeddingConfiguration?.openAiNativeApiKey && (
							<VSCodeLink
								href="https://platform.openai.com/api-keys"
								style={{ display: "inline", fontSize: "inherit" }}>
								You can get an OpenAI API key by signing up here.
							</VSCodeLink>
						)}
					</p>
				</div>
			)}

			{selectedProvider === "bedrock" && (
				<div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
					<VSCodeRadioGroup
						value={embeddingConfiguration?.awsUseProfile ? "profile" : "credentials"}
						onChange={(e) => {
							const value = (e.target as HTMLInputElement)?.value
							const useProfile = value === "profile"
							setEmbeddingConfiguration({
								...embeddingConfiguration,
								awsUseProfile: useProfile,
							})
						}}>
						<VSCodeRadio value="credentials">AWS Credentials</VSCodeRadio>
						<VSCodeRadio value="profile">AWS Profile</VSCodeRadio>
					</VSCodeRadioGroup>
					{embeddingConfiguration?.awsUseProfile ? (<>
						<VSCodeTextField
							value={embeddingConfiguration?.awsProfile || ""}
							style={{ width: "100%" }}
							type="text"
							onInput={handleInputChange("awsProfile")}
							placeholder="Enter profile name (default if empty)">
							<span style={{ fontWeight: 500 }}>AWS Profile Name</span>
						</VSCodeTextField>
					</>) : (
						<>
							<VSCodeTextField
								value={embeddingConfiguration?.awsAccessKey || ""}
								style={{ width: "100%" }}
								type="password"
								onInput={handleInputChange("awsAccessKey")}
								placeholder="Enter Access Key...">
								<span style={{ fontWeight: 500 }}>
									AWS Access Key <span style={{ color: "var(--vscode-errorForeground)" }}>*</span>
								</span>
							</VSCodeTextField>
							<VSCodeTextField
								value={embeddingConfiguration?.awsSecretKey || ""}
								style={{ width: "100%" }}
								type="password"
								onInput={handleInputChange("awsSecretKey")}
								placeholder="Enter Secret Key...">
								<span style={{ fontWeight: 500 }}>
									AWS Secret Key <span style={{ color: "var(--vscode-errorForeground)" }}>*</span>
								</span>
							</VSCodeTextField>
							<VSCodeTextField
								value={embeddingConfiguration?.awsSessionToken || ""}
								style={{ width: "100%" }}
								type="password"
								onInput={handleInputChange("awsSessionToken")}
								placeholder="Enter Session Token (optional)...">
								<span style={{ fontWeight: 500 }}>AWS Session Token</span>
							</VSCodeTextField>
							<p
								style={{
									fontSize: "12px",
									marginTop: "5px",
									color: "var(--vscode-descriptionForeground)",
								}}>
								Authenticate by either providing the keys above or use the default AWS credential providers, i.e.
								~/.aws/credentials or environment variables. These credentials are only used locally to make API requests
								from this extension.
							</p>
						</>
					)}
					<div className="dropdown-container">
						<label htmlFor="aws-region-dropdown">
							<span style={{ fontWeight: 500 }}>
								AWS Region <span style={{ color: "var(--vscode-errorForeground)" }}>*</span>
							</span>
						</label>
						<VSCodeDropdown
							id="aws-region-dropdown"
							value={embeddingConfiguration?.awsRegion || ""}
							style={{ width: "100%" }}
							onChange={handleInputChange("awsRegion")}>
							<VSCodeOption value="">Select a region...</VSCodeOption>
							{/* The user will have to choose a region that supports the model they use, but this shouldn't be a problem since they'd have to request access for it in that region in the first place. */}
							<VSCodeOption value="us-east-1">us-east-1</VSCodeOption>
							<VSCodeOption value="us-east-2">us-east-2</VSCodeOption>
							{/* <VSCodeOption value="us-west-1">us-west-1</VSCodeOption> */}
							<VSCodeOption value="us-west-2">us-west-2</VSCodeOption>
							{/* <VSCodeOption value="af-south-1">af-south-1</VSCodeOption> */}
							{/* <VSCodeOption value="ap-east-1">ap-east-1</VSCodeOption> */}
							<VSCodeOption value="ap-south-1">ap-south-1</VSCodeOption>
							<VSCodeOption value="ap-northeast-1">ap-northeast-1</VSCodeOption>
							<VSCodeOption value="ap-northeast-2">ap-northeast-2</VSCodeOption>
							{/* <VSCodeOption value="ap-northeast-3">ap-northeast-3</VSCodeOption> */}
							<VSCodeOption value="ap-southeast-1">ap-southeast-1</VSCodeOption>
							<VSCodeOption value="ap-southeast-2">ap-southeast-2</VSCodeOption>
							<VSCodeOption value="ca-central-1">ca-central-1</VSCodeOption>
							<VSCodeOption value="eu-central-1">eu-central-1</VSCodeOption>
							<VSCodeOption value="eu-west-1">eu-west-1</VSCodeOption>
							<VSCodeOption value="eu-west-2">eu-west-2</VSCodeOption>
							<VSCodeOption value="eu-west-3">eu-west-3</VSCodeOption>
							{/* <VSCodeOption value="eu-north-1">eu-north-1</VSCodeOption> */}
							{/* <VSCodeOption value="me-south-1">me-south-1</VSCodeOption> */}
							<VSCodeOption value="sa-east-1">sa-east-1</VSCodeOption>
							<VSCodeOption value="us-gov-west-1">us-gov-west-1</VSCodeOption>
							{/* <VSCodeOption value="us-gov-east-1">us-gov-east-1</VSCodeOption> */}
						</VSCodeDropdown>
					</div>

				</div>
			)}

			{selectedProvider === "openai" && (
				<div>
					<VSCodeTextField
						value={embeddingConfiguration?.openAiBaseUrl || ""}
						style={{ width: "100%" }}
						type="text"
						onInput={handleInputChange("openAiBaseUrl")}
						placeholder="Enter base URL...">
						<span style={{ fontWeight: 500 }}>
							Base URL <span style={{ color: "var(--vscode-errorForeground)" }}>*</span>
						</span>
					</VSCodeTextField>
					<VSCodeTextField
						value={embeddingConfiguration?.openAiApiKey || ""}
						style={{ width: "100%" }}
						type="password"
						onInput={handleInputChange("openAiApiKey")}
						placeholder="Enter API Key...">
						<span style={{ fontWeight: 500 }}>
							API Key <span style={{ color: "var(--vscode-errorForeground)" }}>*</span>
						</span>
					</VSCodeTextField>
					<VSCodeTextField
						value={embeddingConfiguration?.openAiModelId || ""}
						style={{ width: "100%" }}
						type="text"
						onInput={handleInputChange("openAiModelId")}
						placeholder="Enter Model ID...">
						<span style={{ fontWeight: 500 }}>
							Model ID <span style={{ color: "var(--vscode-errorForeground)" }}>*</span>
						</span>
					</VSCodeTextField>
					<VSCodeCheckbox
						checked={azureOpenAIApiVersionSelected}
						onChange={(e: any) => {
							const isChecked = e.target.checked === true
							setAzureOpenAIApiVersionSelected(isChecked)
							if (!isChecked) {
								setEmbeddingConfiguration({ ...embeddingConfiguration, azureOpenAIApiVersion: "" })
							}
						}}>
						Set API version
					</VSCodeCheckbox>
					{azureOpenAIApiVersionSelected && (
						<VSCodeTextField
							value={embeddingConfiguration?.azureOpenAIApiVersion || ""}
							style={{ width: "100%" }}
							onInput={handleInputChange("azureOpenAIApiVersion")}
							placeholder={`Default: ${azureOpenAIApiVersion}`}></VSCodeTextField>
					)}
				</div>
			)}

			{selectedProvider === "ollama" && (
				<div>
					<VSCodeTextField
						value={embeddingConfiguration?.ollamaBaseUrl || ""}
						style={{ width: "100%" }}
						type="url"
						onInput={handleInputChange("ollamaBaseUrl")}
						placeholder={"Default: http://localhost:11434"}>
						<span style={{ fontWeight: 500 }}>Base URL (optional)</span>
					</VSCodeTextField>
					<div className="dropdown-container">
						<label htmlFor="ollama-model-id">
							<span style={{ fontWeight: 500 }}>
								Model <span style={{ color: "var(--vscode-errorForeground)" }}>*</span>
							</span>
						</label>
						<VSCodeDropdown
							id="ollama-model-id"
							value={embeddingConfiguration?.ollamaModelId || ""}
							onChange={handleInputChange("ollamaModelId")}
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
					</div>
					<p
						style={{
							fontSize: "12px",
							marginTop: "5px",
							color: "var(--vscode-descriptionForeground)",
						}}>
						Ollama allows you to run models locally on your computer. For instructions on how to get started, see
						their
						<VSCodeLink
							href="https://github.com/ollama/ollama/blob/main/README.md"
							style={{ display: "inline", fontSize: "inherit" }}>
							quickstart guide.
						</VSCodeLink>
						You can download list of supported embedding models from{" "}
						<VSCodeLink
							href="https://ollama.com/search?c=embedding"
							style={{ display: "inline", fontSize: "inherit" }}>
							here.
						</VSCodeLink>
					</p>
				</div>
			)}

			{selectedProvider && Object.keys(availableModels).length > 0 && (
				<div className="dropdown-container">
					<label htmlFor="embedding-model">
						<span style={{ fontWeight: 500 }}>
							Embedding Model <span style={{ color: "var(--vscode-errorForeground)" }}>*</span>
						</span>
					</label>
					<VSCodeDropdown
						id="embedding-model"
						value={selectedModelId}
						onChange={handleInputChange("modelId")}
						style={{ width: "100%" }}>
						<VSCodeOption value="">Select a model...</VSCodeOption>
						{Object.entries(availableModels).map(([modelId, info]) => (
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

					{showModelOptions && selectedModelId && availableModels[selectedModelId] && (
						<p
							style={{
								fontSize: "12px",
								marginTop: 3,
								color: "var(--vscode-descriptionForeground)",
							}}>
							{availableModels[selectedModelId].description}
							<br />
							Price: ${availableModels[selectedModelId].pricePerMillion} per million tokens
							<br />
							Dimensions: {availableModels[selectedModelId].maxDimensions}
							{availableModels[selectedModelId].supportsBatching && (
								<>
									<br />
									Supports batch processing
								</>
							)}
						</p>
					)}
				</div>
			)}

			<VSCodeCheckbox
				style={{
					marginBottom: "10px",
				}}
				checked={buildContextOptions?.useSyncWithApi}
				onChange={(e: any) => {
					setBuildContextOptions({
						...buildContextOptions!,
						useSyncWithApi: e.target?.checked,
					})
				}}>
				Same as LLM API configuration
			</VSCodeCheckbox>

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

export function normalizeEmbeddingConfiguration(embeddingConfiguration?: EmbeddingConfiguration) {
	const provider = embeddingConfiguration?.provider || "openai-native"
	const modelId = embeddingConfiguration?.modelId

	const getProviderData = (models: Record<string, EmbeddingModelInfo>, defaultId: string) => {
		let selectedModelId: string
		let selectedModelInfo: EmbeddingModelInfo
		if (modelId && modelId in models) {
			selectedModelId = modelId
			selectedModelInfo = models[modelId]
		} else {
			selectedModelId = defaultId
			selectedModelInfo = models[defaultId]
		}
		return { selectedProvider: provider, selectedModelId, selectedModelInfo }
	}

	switch (provider) {
		case "bedrock":
			return getProviderData(bedrockEmbeddingModels, bedrockeEmbeddingDefaultModelId)
		case "openai-native":
			return getProviderData(openAiNativeEmbeddingModels, openAiNativeEmbeddingDefaultModelId)
		case "openai":
			return getProviderData(openAiNativeEmbeddingModels, openAiNativeEmbeddingDefaultModelId)
		default:
			return getProviderData(openAiNativeEmbeddingModels, openAiNativeEmbeddingDefaultModelId)
	}
}

export default memo(EmbeddingOptions)
