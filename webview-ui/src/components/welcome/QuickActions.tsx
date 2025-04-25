import { memo } from "react"
import { vscode } from "../../utils/vscode"
import { IHaiClineTask } from "../../interfaces/hai-task.interface"
import { FEATURE_TILES, MAIN_CARDS } from "../../utils/constants"
import QuickActionTile from "./QuickActionTile"

interface QuickActionProps {
	onTaskSelect: (task: IHaiClineTask) => void
}

const createHaiTask = (title: string, description: string, context: string): IHaiClineTask => ({
	context: context,
	list: title,
	acceptance: description,
	id: "",
	status: "",
})

const QuickActions = ({ onTaskSelect }: QuickActionProps) => {
	const handleCardClick = (cardName: string) => {
		const messageTypes = {
			"View Conversation": "openHistory",
			"View Hai Tasks": "openHaiTasks",
		} as const

		const messageType = messageTypes[cardName as keyof typeof messageTypes]
		if (messageType) {
			vscode.postMessage({ type: messageType })
		}
	}

	return (
		<div style={{ flexShrink: 0 }}>
			<div
				style={{
					color: "var(--vscode-descriptionForeground)",
					margin: "10px 20px 10px 20px",
					display: "flex",
					alignItems: "center",
				}}>
				<span className="codicon codicon-checklist" style={{ marginRight: "4px", transform: "scale(0.9)" }} />
				<span className="getting-started-title">WELCOME TO HAI</span>
			</div>
			<div style={{ padding: "0px 20px 0 20px" }}>
				{MAIN_CARDS.map((card) => (
					<QuickActionTile
						key={card.name}
						className="getting-started-item"
						icon={card.icon}
						title={card.title}
						description={card.description}
						onClick={() => handleCardClick(card.name)}
					/>
				))}

				<div style={{ display: "flex", alignItems: "center", margin: "10px 0" }}>
					<div
						style={{
							flex: 1,
							height: "1px",
							backgroundColor: "var(--vscode-descriptionForeground)",
							opacity: 0.1,
						}}></div>
					<span
						style={{
							padding: "0 10px",
							color: "var(--vscode-descriptionForeground)",
							opacity: 0.8,
							fontSize: "1em",
							fontWeight: "bold",
						}}>
						OR
					</span>
					<div
						style={{
							flex: 1,
							height: "1px",
							backgroundColor: "var(--vscode-descriptionForeground)",
							opacity: 0.1,
						}}></div>
				</div>
				<h3 style={{ padding: 0, margin: 0 }}>Chat with HAI</h3>
				<p style={{ paddingTop: "0.4rem", margin: 0 }}>Start with our suggestions to begin with</p>
				<div className="tiles-container">
					{FEATURE_TILES.map((tile) => (
						<QuickActionTile
							key={tile.title}
							icon={tile.icon}
							title={tile.title}
							description={tile.description}
							onClick={() => onTaskSelect(createHaiTask(tile.title, tile.description, tile.context))}
						/>
					))}
				</div>
			</div>
		</div>
	)
}

export default memo(QuickActions)
