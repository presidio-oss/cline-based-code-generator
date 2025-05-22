import { VSCodeButton, VSCodeCheckbox, VSCodeLink, VSCodeTextArea } from "@vscode/webview-ui-toolkit/react"
import SettingsViewExtra from "./SettingsViewExtra"
import EmbeddingOptions from "./EmbeddingOptions"
import { CREATE_HAI_RULES_PROMPT, HAI_RULES_PATH } from "@utils/constants"
import { memo, useCallback, useEffect, useState } from "react"
import { useExtensionState } from "@/context/ExtensionStateContext"
import { validateApiConfiguration, validateModelId } from "@/utils/validate"
import { vscode } from "@/utils/vscode"
import SettingsButton from "@/components/common/SettingsButton"
import ApiOptions from "./ApiOptions"
import { TabButton } from "../mcp/configuration/McpConfigurationView"
import { useEvent } from "react-use"
import { ExtensionMessage } from "@shared/ExtensionMessage"
import BrowserSettingsSection from "./BrowserSettingsSection"
import TerminalSettingsSection from "./TerminalSettingsSection"
import { FEATURE_FLAGS } from "@shared/services/feature-flags/feature-flags"
import Guardrails from "./guardrails/Guardrails"

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

	const handleSubmit = (withoutDone: boolean = false) => {
		const apiValidationResult = validateApiConfiguration(apiConfiguration)
		const modelIdValidationResult = validateModelId(apiConfiguration, openRouterModels)

		if (!apiValidationResult && !modelIdValidationResult) {
			vscode.postMessage({ type: "apiConfiguration", apiConfiguration })
			vscode.postMessage({ type: "buildContextOptions", buildContextOptions: buildContextOptions })
			vscode.postMessage({ type: "embeddingConfiguration", embeddingConfiguration })
		}

		vscode.postMessage({
			type: "updateSettings",
			planActSeparateModelsSetting,
			customInstructionsSetting: customInstructions,
			telemetrySetting,
		})

		if (!withoutDone) {
			onDone()
		}
	}

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

	// validate as soon as the component is mounted
	/*
	useEffect will use stale values of variables if they are not included in the dependency array. 
	so trying to use useEffect with a dependency array of only one value for example will use any 
	other variables' old values. In most cases you don't want this, and should opt to use react-use 
	hooks.
    
		// uses someVar and anotherVar
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [someVar])
	If we only want to run code once on mount we can use react-use's useEffectOnce or useMount
	*/

	const handleMessage = useCallback(
		(event: MessageEvent) => {
			const message: ExtensionMessage = event.data
			switch (message.type) {
				case "didUpdateSettings":
					if (pendingTabChange) {
						vscode.postMessage({
							type: "togglePlanActMode",
							chatSettings: {
								mode: pendingTabChange,
							},
						})
						setPendingTabChange(null)
					}
					break
				case "scrollToSettings":
					setTimeout(() => {
						const elementId = message.text
						if (elementId) {
							const element = document.getElementById(elementId)
							if (element) {
								element.scrollIntoView({ behavior: "smooth" })

								element.style.transition = "background-color 0.5s ease"
								element.style.backgroundColor = "var(--vscode-textPreformat-background)"

								setTimeout(() => {
									element.style.backgroundColor = "transparent"
								}, 1200)
							}
						}
					}, 300)
					break
			}
		},
		[pendingTabChange],
	)

	useEvent("message", handleMessage)

	const handleResetState = () => {
		vscode.postMessage({ type: "resetState" })
	}

	const handleTabChange = (tab: "plan" | "act") => {
		if (tab === chatSettings.mode) {
			return
		}
		setPendingTabChange(tab)
		handleSubmit(true)
	}

	return (
		<div className="fixed top-0 left-0 right-0 bottom-0 pt-[10px] pr-0 pb-0 pl-5 flex flex-col overflow-hidden">
			<div className="flex justify-between items-center mb-[13px] pr-[17px]">
				<h3 className="text-[var(--vscode-foreground)] m-0">Settings</h3>
				<VSCodeButton onClick={() => handleSubmit(false)}>Save</VSCodeButton>
			</div>
			<div className="grow overflow-y-scroll pr-2 flex flex-col">
				{/* Tabs container */}
				{planActSeparateModelsSetting ? (
					<div className="border border-solid border-[var(--vscode-panel-border)] rounded-md p-[10px] mb-5 bg-[var(--vscode-panel-background)]">
						<div className="flex gap-[1px] mb-[10px] -mt-2 border-0 border-b border-solid border-[var(--vscode-panel-border)]">
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
						</div>
					</div>
				) : (
					<div style={{ marginBottom: 10 }}>
						<h3 style={{ marginBottom: 5 }}>LLM API Configuration</h3>
						<ApiOptions key={"single"} showModelOptions={true} />
					</div>
				)}

				<div style={{ marginBottom: 10 }}>
					<h3 style={{ marginBottom: 5 }}>Embedding Configuration</h3>
					<EmbeddingOptions showModelOptions={true} />
				</div>

				<div className="mb-[5px]">
					<VSCodeTextArea
						value={customInstructions ?? ""}
						className="w-full"
						resize="vertical"
						rows={4}
						placeholder={'e.g. "Run unit tests at the end", "Use TypeScript with async/await", "Speak in Spanish"'}
						onInput={(e: any) => setCustomInstructions(e.target?.value ?? "")}
						disabled={!vscodeWorkspacePath}>
						<span className="font-medium">Custom Instructions</span>
					</VSCodeTextArea>
					<p className="text-xs mt-[5px] text-[var(--vscode-descriptionForeground)]">
						These instructions are appended to the end of the system prompt sent with every request.
					</p>
				</div>

				<SettingsViewExtra
					setBuildContextOptions={setBuildContextOptions}
					buildContextOptions={buildContextOptions}
					vscodeWorkspacePath={vscodeWorkspacePath}
					buildIndexProgress={buildIndexProgress}
				/>

				<div className="mb-[5px]">
					<VSCodeCheckbox
						className="mb-[5px]"
						checked={planActSeparateModelsSetting}
						onChange={(e: any) => {
							const checked = e.target.checked === true
							setPlanActSeparateModelsSetting(checked)
						}}>
						Use different models for Plan and Act modes
					</VSCodeCheckbox>
					<p className="text-xs mt-[5px] text-[var(--vscode-descriptionForeground)]">
						Switching between Plan and Act mode will persist the API and model used in the previous mode. This may be
						helpful e.g. when using a strong reasoning model to architect a plan for a cheaper coding model to act on.
					</p>
				</div>

				<div className="mb-[5px]">
					<VSCodeCheckbox
						className="mb-[5px]"
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
						are sent for analytics.
					</p>
				</div>

				{/* Browser Settings Section */}
				<BrowserSettingsSection />

				{/* Terminal Settings Section */}
				<TerminalSettingsSection />

				{/* Guardrails */}
				<Guardrails />

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

				<div className="mt-auto pr-2 flex justify-center">
					<SettingsButton
						onClick={() => vscode.postMessage({ type: "openExtensionSettings" })}
						className="mt-0 mr-0 mb-4 ml-0">
						<i className="codicon codicon-settings-gear" />
						Advanced Settings
					</SettingsButton>
				</div>
				<div className="text-center text-[var(--vscode-descriptionForeground)] text-xs leading-[1.2] px-0 py-0 pr-2 pb-[15px] mt-auto">
					<p className="break-words m-0 p-0">
						If you have any questions or feedback, feel free to open an issue at{" "}
						<VSCodeLink
							href="https://github.com/presidio-oss/cline-based-code-generator"
							style={{ display: "inline" }}>
							https://github.com/presidio-oss/cline-based-code-generator
						</VSCodeLink>
					</p>
					<p className="italic mt-[10px] mb-0 p-0">v{version}</p>
				</div>
			</div>
		</div>
	)
}

export default memo(SettingsView)
