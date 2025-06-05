import { memo, useEffect, useMemo, useState } from "react"
import { vscode } from "../../../utils/vscode"
import "./Guardrails.css"
import { VSCodeButton, VSCodeDropdown, VSCodeOption } from "@vscode/webview-ui-toolkit/react"
import { useExtensionState } from "@/context/ExtensionStateContext"

interface Guard {
	key: string
	name: string
	hasThreshold: boolean
	threshold?: number
	mode?: string
}

const Guardrails = () => {
	const { guards, setGuards } = useExtensionState()

	useEffect(() => {
		const messageHandler = (event: MessageEvent) => {
			const message = event.data

			switch (message.type) {
				case "defaultGuards":
					if (message.guards) {
						setGuards(message.guards)
					}
					break

				default:
					console.warn(`Unhandled message type: ${message.type}`)
			}
		}
		window.addEventListener("message", messageHandler)
		vscode.postMessage({ type: "loadGuards" })
		return () => {
			window.removeEventListener("message", messageHandler)
		}
	}, [])

	const handleGuardThresholdChange = (guard: Guard, newThreshold: number) => {
		if (guards) {
			const updatedGuards = guards.map((g) => (g.key === guard.key ? { ...g, threshold: newThreshold } : g))
			setGuards(updatedGuards)
		}
	}

	const handleGuardModeChange = (guard: Guard, mode: string) => {
		if (guards) {
			const updatedGuards = guards.map((g) => (g.key === guard.key ? { ...g, mode: mode } : g))
			setGuards(updatedGuards)
		}
	}

	const getThresholdColor = (threshold: number) => {
		if (threshold <= 0.25) return "var(--vscode-testing-iconPassed)"
		if (threshold <= 0.5) return "var(--vscode-testing-iconQueued)"
		return "var(--vscode-testing-iconFailed)"
	}

	const getThresholdLevel = (threshold: number) => {
		if (threshold <= 0.25) return "High"
		if (threshold <= 0.5) return "Medium"
		return "Low"
	}

	const toggleLabel = (value: number) => {
		if (value == null) return <>No Threshold</>
		switch (value) {
			case 0:
				return "Max"
			case 0.25:
				return "High"
			case 0.5:
				return "Medium"
			case 0.75:
				return "Low"
			case 1:
				return "Off"
			default:
				return "Invalid Config"
		}
	}

	return (
		<div className="guardrails-container">
			<div className="guardrails-header">
				<h3>Active Guards</h3>
				<p className="guardrails-description">Configure security guards to protect your code generation</p>
			</div>

			<div className="guards-list">
				{guards?.map((guard, index) => (
					<div key={index} className="guard-item">
						<div className="guard-header">
							<div className="guard-info">
								<VSCodeButton appearance="icon" className="guard-status-icon">
									<span className="codicon codicon-shield" />
								</VSCodeButton>
								<span className="guard-name">{guard.name}</span>
							</div>

							{["secret", "pii"].includes(guard.key) && (
								<div className="guard-mode-selector">
									<VSCodeDropdown
										value={guard.mode}
										onChange={(e) => handleGuardModeChange(guard, (e.target as HTMLSelectElement).value)}>
										<VSCodeOption value="block">Block</VSCodeOption>
										<VSCodeOption value="redact">Redact</VSCodeOption>
									</VSCodeDropdown>
								</div>
							)}
						</div>
						{guard.hasThreshold && guard.threshold != null && (
							<div className="guard-threshold-section">
								<div className="threshold-header">
									<span className="threshold-label">Sensitivity</span>
									<div className="threshold-value">
										<span
											className="threshold-indicator"
											style={{ color: getThresholdColor(guard.threshold) }}>
											●
										</span>
										<span className="threshold-level">{getThresholdLevel(guard.threshold)}</span>
									</div>
								</div>

								<div className="threshold-controls">
									<div className="threshold-buttons">
										{[1.0, 0.75, 0.5, 0.25, 0].map((value) => (
											<VSCodeButton
												key={value}
												appearance={guard.threshold === value ? "primary" : "secondary"}
												onClick={() => handleGuardThresholdChange(guard, value)}
												className="threshold-button">
												{toggleLabel(value)}
												{/* {value === 0.25 ? "Low" : value === 0.5 ? "Med" : value === 0.75 ? "High" : "Max"} */}
											</VSCodeButton>
										))}
									</div>
								</div>
							</div>
						)}
					</div>
				))}
			</div>
			<div className="recommendation">
				<span className="codicon codicon-info"></span>
				<span>
					Recommended threshold: <strong>0.75</strong> for optimal accuracy
				</span>
			</div>
			<div className="recommendation">
				<span>To proceed after disabling the guardrail, please create a new task.</span>
			</div>

			<div className="guardrails-footer"></div>
		</div>
	)
}

export default memo(Guardrails)
