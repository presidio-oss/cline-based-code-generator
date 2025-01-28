interface QuickActionTileProps {
	icon: string
	title: string
	description: string
	onClick?: () => void
	className?: string
}

const QuickActionTile = ({ icon, title, description, onClick, className = "" }: QuickActionTileProps) => (
	<div className={`card-container ${className}`} onClick={onClick}>
		<div style={{ padding: "12px", display: "grid", gridTemplateColumns: "24px 1fr" }}>
			<span className={`codicon codicon-${icon}`} style={{ marginRight: "8px", marginTop: "2.5px" }} />
			<div>
				<strong>{title}</strong>
				<div style={{ fontSize: "var(--vscode-font-size)", marginTop: "6px" }}>{description}</div>
			</div>
		</div>
	</div>
)

export default QuickActionTile
