import { memo, useEffect, useState } from "react"
import { vscode } from "../../../utils/vscode"
import "./Guardrails.css"

interface Guard {
	key: string
	name: string
	hasThreshold: boolean
	threshold?: number
	mode?: string
}

const Guardrails = () => {
	const [guards, setGuards] = useState<Guard[]>([])
	const [isDragging, setIsDragging] = useState(false)

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

	const handleGuardThresholdChange = (event: React.ChangeEvent<HTMLInputElement>, guard: Guard) => {
		const newThreshold = parseFloat(event.target.value)
		setGuards((prevGuards) => prevGuards.map((g) => (g.key === guard.key ? { ...g, threshold: newThreshold } : g)))
		vscode.postMessage({
			type: "updateGuardThreshold",
			guard: {
				key: guard.key,
				name: guard.name,
				hasThreshold: guard.hasThreshold,
				threshold: newThreshold,
				mode: guard.mode,
			},
		})
	}

	const handleGuardModeChange = (event: React.ChangeEvent<HTMLInputElement>, guard: Guard) => {
		const mode = event.target.value === "block" ? "redact" : "block"
		setGuards((prevGuards) => prevGuards.map((g) => (g.key === guard.key ? { ...g, mode: mode } : g)))
		vscode.postMessage({
			type: "updateGuardMode",
			guard: {
				key: guard.key,
				name: guard.name,
				hasThreshold: guard.hasThreshold,
				mode: mode,
			},
		})
	}

	return (
		<div style={{ display: "flex", flexDirection: "column", gap: 5 }} className="guard-container">
			<div className="dropdown-container">
				<label className="feature-label">
					<span style={{ fontWeight: 500 }}>Active Guards</span>
				</label>
			</div>
			{guards.map((guard, index) => (
				<div style={{ display: "flex", justifyContent: "space-between", marginTop: 2, marginBottom: 2 }}>
					<label key={index} style={{ display: "flex", alignItems: "center", gap: 5 }} className="guard-label">
						<span className="checkmark"></span>
						{guard.name}
					</label>
					{guard.hasThreshold && guard.threshold && (
						<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 15 }}>
							<input
								type="range"
								min="0.25"
								max="1"
								step="0.05"
								value={guard.threshold}
								onChange={(event) => handleGuardThresholdChange(event, guard)}
								onMouseDown={() => setIsDragging(true)}
								onMouseUp={() => setIsDragging(false)}
								onTouchStart={() => setIsDragging(true)}
								onTouchEnd={() => setIsDragging(false)}
								style={{
									verticalAlign: "middle",
									outline: "none",
									flex: 1,
									accentColor: isDragging
										? "#66b2ff"
										: (guard.threshold ?? 0.5) >= 0.75
											? "#90ee90"
											: (guard.threshold ?? 0.5) >= 0.5
												? "#ffc66e"
												: "#ff7b7b",
								}}
							/>
							<label className="label-slider" style={{ width: "38px" }}>
								{guard.threshold?.toFixed(2)}
							</label>
						</div>
					)}
					{["secret", "pii"].includes(guard.key) && (
						<div
							className="toggle-group"
							style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 15 }}>
							<label className="switch" style={{ flex: 1 }}>
								<input
									type="checkbox"
									checked={guard.mode == "block"}
									value={guard.mode}
									onChange={(event) => handleGuardModeChange(event, guard)}
								/>
								<span className="slider round"></span>
							</label>
							<label key={guard.mode} className="toggle-label" style={{ width: "38px", alignItems: "flex-end" }}>
								{guard.mode === "redact" ? "Redact" : "Block"}
							</label>
						</div>
					)}
				</div>
			))}
			<sub>
				Recommended threshold value is <strong>0.75</strong> to ensure optimal accuracy and performance
			</sub>
		</div>
	)
}

export default memo(Guardrails)
