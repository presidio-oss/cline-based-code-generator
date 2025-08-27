import { VSCodeButton } from "@vscode/webview-ui-toolkit/react"
import { useState } from "react"
import { useExtensionState } from "../../context/ExtensionStateContext"
import Logo from "../../assets/hai-dark.svg?react"
import ApiOptions from "../settings/ApiOptions"
import EmbeddingOptions from "../settings/EmbeddingOptions"
import { Mode } from "@shared/storage/types"
import { StateServiceClient } from "@/services/grpc-client"
import { BooleanRequest } from "@shared/proto/cline/common"

const IS_DEV = false // FIXME: use flags when packaging

const WelcomeView = () => {
	const { apiConfiguration, embeddingConfiguration, buildContextOptions, buildIndexProgress, mode } = useExtensionState()

	const [currentTab, setCurrentTab] = useState<Mode>(mode)

	const [apiValid, setApiValid] = useState<boolean>(false)

	const handleSubmit = async () => {
		try {
			await StateServiceClient.setWelcomeViewCompleted(BooleanRequest.create({ value: true }))
		} catch (error) {
			console.error("Failed to update API configuration or complete welcome view:", error)
		}
	}

	return (
		<div
			style={{
				position: "fixed",
				top: 0,
				left: 0,
				right: 0,
				bottom: 0,
				padding: "0 20px",
				display: "flex",
				flexDirection: "column",
				overflow: "auto",
			}}>
			<div style={{ height: "auto", maxWidth: "200px", marginTop: "20px", marginBottom: "20px" }}>
				<Logo style={{ height: "100%", width: "100%" }} className="hai-logo" />
			</div>
			<div>
				{IS_DEV && (
					<pre
						style={{
							color: "#e8912d",
							backgroundColor: "#2b2d30",
							padding: "10px",
							borderRadius: "5px",
							border: "2px solid #333",
						}}>
						{JSON.stringify(
							{ buildContextOptions, buildIndexProgress, apiConfiguration, embeddingConfiguration },
							null,
							2,
						)}
					</pre>
				)}
				<p>
					I can handle complex software development tasks step-by-step. With tools that let me create & edit files,
					explore complex projects, use the browser, and execute terminal commands (after you grant permission), I can
					assist you in ways that go beyond code completion or tech support.
				</p>

				<p>
					{" "}
					Don't wait, start loading your Hai Tasks from your requirements app. Ensure that you configure the API keys
					for the model you plan to use in the settings section.
				</p>

				<div
					style={{
						marginTop: "10px",
						display: "flex",
						alignItems: "flex-start",
						flexDirection: "column",
						justifyContent: "flex-start",
						marginBottom: "1rem",
					}}>
					<div>
						<h3 style={{ marginBottom: 5 }}>LLM API Configuration</h3>
						<ApiOptions
							showModelOptions={true}
							currentMode={currentTab}
							onValid={(isValid) => setApiValid(isValid)}
						/>
					</div>

					<div style={{ marginBottom: 10 }}>
						<h3 style={{ marginBottom: 5 }}>Embedding Configuration</h3>
						<EmbeddingOptions showModelOptions={true} />
					</div>
					<VSCodeButton disabled={!apiValid} onClick={handleSubmit} style={{ marginTop: "10px", width: "max-content" }}>
						Let's go!
					</VSCodeButton>
				</div>
			</div>
		</div>
	)
}

export default WelcomeView
