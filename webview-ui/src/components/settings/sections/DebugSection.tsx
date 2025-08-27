import { useExtensionState } from "@/context/ExtensionStateContext"
import Section from "../Section"
import { VSCodeButton } from "@vscode/webview-ui-toolkit/react"
import { useState } from "react"

interface DebugSectionProps {
	onResetState: (resetGlobalState?: boolean) => Promise<void>
	renderSectionHeader: (tabId: string) => JSX.Element | null
}

const DebugSection = ({ onResetState, renderSectionHeader }: DebugSectionProps) => {
	const { buildContextOptions, buildIndexProgress, apiConfiguration, embeddingConfiguration } = useExtensionState()
	const [showCopied, setShowCopied] = useState(false)
	const handleCopy = () => {
		navigator.clipboard.writeText(
			JSON.stringify({ buildContextOptions, buildIndexProgress, apiConfiguration, embeddingConfiguration }, null, 2),
		)
		setShowCopied(true)
		setTimeout(() => setShowCopied(false), 2000)
	}
	return (
		<div>
			{renderSectionHeader("debug")}
			<Section>
				{/* <VSCodeButton
					onClick={() => onResetState()}
					className="mt-[5px] w-auto"
					style={{ backgroundColor: "var(--vscode-errorForeground)", color: "black" }}>
					Reset Workspace State
				</VSCodeButton> */}
				<VSCodeButton
					onClick={() => onResetState(true)}
					className="mt-[5px] w-auto"
					style={{ backgroundColor: "var(--vscode-errorForeground)", color: "black" }}>
					Reset State
				</VSCodeButton>
				<p className="text-xs mt-[5px] text-[var(--vscode-descriptionForeground)]">
					This will reset all global state and secret storage in the extension.
				</p>
				<div style={{ position: "relative" }}>
					<VSCodeButton
						style={{ position: "absolute", top: "24px", right: "18px", padding: "4px 8px" }}
						onClick={handleCopy}
						appearance="icon">
						<span className="codicon codicon-copy" style={{ marginRight: "4px" }}></span>
						{showCopied ? "Copied!" : "Copy"}
					</VSCodeButton>
					<pre
						style={{
							color: "#e8912d",
							backgroundColor: "#2b2d30",
							padding: "10px",
							borderRadius: "5px",
							border: "2px solid #333",
							whiteSpace: "pre-wrap",
							wordWrap: "break-word",
							overflowWrap: "break-word",
						}}>
						{JSON.stringify(
							{
								buildContextOptions,
								buildIndexProgress,
								apiConfiguration,
								embeddingConfiguration,
							},
							null,
							2,
						)}
					</pre>
				</div>
			</Section>
		</div>
	)
}

export default DebugSection
