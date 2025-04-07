import { VSCodeButton, VSCodeCheckbox, VSCodeLink, VSCodeTextArea } from "@vscode/webview-ui-toolkit/react"
import { memo, useCallback, useEffect, useState } from "react"
import { validateApiConfiguration, validateModelId } from "../../utils/validate"
import { useExtensionState } from "../../context/ExtensionStateContext"
import { vscode } from "../../utils/vscode"
import ApiOptions from "./ApiOptions"
import SettingsViewExtra from "./SettingsViewExtra"
import EmbeddingOptions from "./EmbeddingOptions"
import SettingsButton from "../common/SettingsButton"
import { useDebounce, useDeepCompareEffect } from "react-use"
import { CREATE_HAI_RULES_PROMPT, HAI_RULES_PATH } from "../../utils/constants"
import { TabButton } from "../mcp/McpView"
import { useEvent } from "react-use"
import { ExtensionMessage } from "../../../../src/shared/ExtensionMessage"

const IS_DEV = true // FIXME: use flags when packaging

type SettingsViewProps = {
	onDone: () => void
}

const SettingsView = ({ onDone }: SettingsViewProps) => {
	const {
		apiConfiguration,
		version,
		customInstructions,
		setCustomInstructions,
		isHaiRulesPresent,
		buildContextOptions,
		setBuildContextOptions,
		buildIndexProgress,
		embeddingConfiguration,
		vscodeWorkspacePath,
		openRouterModels,
		telemetrySetting,
		setTelemetrySetting,
		chatSettings,
		planActSeparateModelsSetting,
		setPlanActSeparateModelsSetting,
	} = useExtensionState()
	const [showCopied, setShowCopied] = useState(false)
	const [pendingTabChange, setPendingTabChange] = useState<"plan" | "act" | null>(null)

	const handleResetState = () => {
		vscode.postMessage({ type: "resetState" })
	}

	const handleCopy = () => {
		navigator.clipboard.writeText(
			JSON.stringify({ buildContextOptions, buildIndexProgress, apiConfiguration, embeddingConfiguration }, null, 2),
		)
		setShowCopied(true)
		setTimeout(() => setShowCopied(false), 2000)
	}

	const handleHaiRules = (mode: "create" | "edit") => {
		switch (mode) {
			case "create":
				vscode.postMessage({ type: "newTask", text: CREATE_HAI_RULES_PROMPT })
				onDone()
				break
			case "edit":
				vscode.postMessage({ type: "openFile", text: `${vscodeWorkspacePath}/${HAI_RULES_PATH}` })
				break
		}
	}

	useDebounce(
		() => {
			vscode.postMessage({ type: "customInstructions", text: customInstructions || "" })
		},
		500,
		[customInstructions],
	)

	useEffect(() => {
		vscode.postMessage({ type: "telemetrySetting", telemetrySetting })
	}, [telemetrySetting])

	useEffect(() => {
		vscode.postMessage({ type: "updateSettings", planActSeparateModelsSetting })
	}, [planActSeparateModelsSetting])

	useEffect(() => {
		if (pendingTabChange) {
			vscode.postMessage({
				type: "togglePlanActMode",
				chatSettings: {
					mode: pendingTabChange,
				},
			})
		}
	}, [pendingTabChange])

	useDeepCompareEffect(() => {
		vscode.postMessage({ type: "buildContextOptions", buildContextOptions: buildContextOptions })
	}, [buildContextOptions])

	const handleTabChange = (tab: "plan" | "act") => {
		if (tab === chatSettings.mode) {
			return
		}
		setPendingTabChange(tab)
	}

	return (
		<div
			style={{
				position: "fixed",
				top: 0,
				left: 0,
				right: 0,
				bottom: 0,
				padding: "10px 0px 0px 20px",
				display: "flex",
				flexDirection: "column",
				overflow: "hidden",
			}}>
			<div
				style={{
					display: "flex",
					justifyContent: "space-between",
					alignItems: "center",
					marginBottom: "13px",
					paddingRight: 17,
				}}>
				<h3 style={{ color: "var(--vscode-foreground)", margin: 0 }}>Settings</h3>
			</div>
			<div
				style={{
					flexGrow: 1,
					overflowY: "scroll",
					paddingRight: 8,
					display: "flex",
					flexDirection: "column",
				}}>
				{/* Tabs container */}
				{planActSeparateModelsSetting ? (
					<div
						style={{
							border: "1px solid var(--vscode-panel-border)",
							borderRadius: "4px",
							padding: "10px",
							marginBottom: "20px",
							background: "var(--vscode-panel-background)",
						}}>
						<div
							style={{
								display: "flex",
								gap: "1px",
								marginBottom: "10px",
								marginTop: -8,
								borderBottom: "1px solid var(--vscode-panel-border)",
							}}>
							<TabButton isActive={chatSettings.mode === "plan"} onClick={() => handleTabChange("plan")}>
								Plan Mode
							</TabButton>
							<TabButton isActive={chatSettings.mode === "act"} onClick={() => handleTabChange("act")}>
								Act Mode
							</TabButton>
						</div>

						{/* Content container */}
						<div style={{ marginBottom: -12 }}>
							<div style={{ marginBottom: 10 }}>
								<h3 style={{ marginBottom: 5 }}>LLM API Configuration</h3>
								<ApiOptions key={chatSettings.mode} showModelOptions={true} />
							</div>

							<div style={{ marginBottom: 10 }}>
								<h3 style={{ marginBottom: 5 }}>Embedding Configuration</h3>
								<EmbeddingOptions key={chatSettings.mode} showModelOptions={true} />
							</div>
						</div>
					</div>
				) : (
					<>
						<div style={{ marginBottom: 10 }}>
							<h3 style={{ marginBottom: 5 }}>LLM API Configuration</h3>
							<ApiOptions key={"single"} showModelOptions={true} />
						</div>

						<div style={{ marginBottom: 10 }}>
							<h3 style={{ marginBottom: 5 }}>Embedding Configuration</h3>
							<EmbeddingOptions key={"single"} showModelOptions={true} />
						</div>
					</>
				)}

				<div style={{ marginBottom: 5 }}>
					<VSCodeTextArea
						value={customInstructions ?? ""}
						style={{ width: "100%", marginTop: 15 }}
						resize="vertical"
						rows={4}
						placeholder={'e.g. "Run unit tests at the end", "Use TypeScript with async/await", "Speak in Spanish"'}
						onInput={(e: any) => setCustomInstructions(e.target?.value ?? "")}
						disabled={!vscodeWorkspacePath}>
						<span style={{ fontWeight: "500" }}>Custom Instructions</span>
					</VSCodeTextArea>
					<p
						style={{
							fontSize: "12px",
							marginTop: "5px",
							color: "var(--vscode-descriptionForeground)",
						}}>
						These instructions are appended to the end of the system prompt sent with every request. You can also use
						.hairules at the root of your workspace to define custom instructions.
					</p>
					<VSCodeButton
						style={{
							width: "100%",
							marginTop: "10px",
							marginBottom: "10px",
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
						}}
						onClick={() => handleHaiRules(isHaiRulesPresent ? "edit" : "create")}
						disabled={!vscodeWorkspacePath}>
						<span
							className={"codicon codicon-" + (isHaiRulesPresent ? "link-external" : "add")}
							style={{ marginRight: "5px" }}></span>
						{isHaiRulesPresent ? "Edit" : "Create"} .hairules
					</VSCodeButton>
				</div>

				<SettingsViewExtra
					setBuildContextOptions={setBuildContextOptions}
					buildContextOptions={buildContextOptions}
					vscodeWorkspacePath={vscodeWorkspacePath}
					buildIndexProgress={buildIndexProgress}
				/>

				<div style={{ marginBottom: 5 }}>
					<VSCodeCheckbox
						style={{ marginBottom: "5px" }}
						checked={planActSeparateModelsSetting}
						onChange={(e: any) => {
							const checked = e.target.checked === true
							setPlanActSeparateModelsSetting(checked)
						}}>
						Use different models for Plan and Act modes
					</VSCodeCheckbox>
					<p
						style={{
							fontSize: "12px",
							marginTop: "5px",
							color: "var(--vscode-descriptionForeground)",
						}}>
						Switching between Plan and Act mode will persist the API and model used in the previous mode. This may be
						helpful e.g. when using a strong reasoning model to architect a plan for a cheaper coding model to act on.
					</p>
				</div>

				<div style={{ marginBottom: 5 }}>
					<VSCodeCheckbox
						style={{ marginBottom: "5px" }}
						checked={telemetrySetting === "enabled"}
						onChange={(e: any) => {
							const checked = e.target.checked === true
							setTelemetrySetting(checked ? "enabled" : "disabled")
						}}>
						Allow anonymous error and usage reporting
					</VSCodeCheckbox>
					<p
						style={{
							fontSize: "12px",
							marginTop: "5px",
							color: "var(--vscode-descriptionForeground)",
						}}>
						Help improve HAI by sending usage data and error reports. No code, prompts, or personal information are
						ever sent. Only the{" "}
						<a href="https://docs.github.com/en/get-started/git-basics/setting-your-username-in-git">
							git username and email
						</a>{" "}
						are sent to help us identify the user.
					</p>
				</div>

				{IS_DEV && (
					<>
						<div style={{ marginTop: "10px", marginBottom: "4px" }}>Debug</div>
						<VSCodeButton onClick={handleResetState} style={{ marginTop: "5px", width: "auto" }}>
							Reset State
						</VSCodeButton>
						<p
							style={{
								fontSize: "12px",
								marginTop: "5px",
								color: "var(--vscode-descriptionForeground)",
							}}>
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
					</>
				)}

				<div
					style={{
						marginTop: "auto",
						paddingRight: 8,
						display: "flex",
						justifyContent: "center",
					}}>
					<SettingsButton
						onClick={() => vscode.postMessage({ type: "openExtensionSettings" })}
						style={{
							margin: "0 0 16px 0",
						}}>
						<i className="codicon codicon-settings-gear" />
						Advanced Settings
					</SettingsButton>
				</div>
				<div
					style={{
						textAlign: "center",
						color: "var(--vscode-descriptionForeground)",
						fontSize: "12px",
						lineHeight: "1.2",
						padding: "0 8px 15px 0",
					}}>
					<p
						style={{
							wordWrap: "break-word",
							margin: 0,
							padding: 0,
						}}>
						If you have any questions or feedback, feel free to open an issue at{" "}
						<VSCodeLink
							href="https://github.com/presidio-oss/cline-based-code-generator"
							style={{ display: "inline" }}>
							https://github.com/presidio-oss/cline-based-code-generator
						</VSCodeLink>
					</p>
					<p
						style={{
							fontStyle: "italic",
							margin: "10px 0 0 0",
							padding: 0,
						}}>
						v{version}
					</p>
				</div>
			</div>
		</div>
	)
}

export default memo(SettingsView)
