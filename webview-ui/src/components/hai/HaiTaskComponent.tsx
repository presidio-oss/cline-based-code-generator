import { IHaiClineTask, IHaiTask } from "@shared/hai-task"
import { VSCodeButton } from "@vscode/webview-ui-toolkit/react"
import React from "react"
import CopyClipboard from "../common/CopyClipboard"

// Interface for the highlighted task structure
interface IHighlightedHaiTask {
	original: IHaiTask
	highlighted: IHaiTask
}

interface HaiTaskComponentProps {
	id: string
	prdId: string
	name: string
	description: string
	task: IHighlightedHaiTask
	onTaskClick: (task: IHaiTask) => void
	onTaskSelect: (task: IHaiClineTask) => void
}

const HaiTaskComponent: React.FC<HaiTaskComponentProps> = ({ id, prdId, name, description, task, onTaskSelect, onTaskClick }) => {
	// Helper function to strip HTML tags
	const sanitizeHtml = (html: string): string => {
		const tmp = document.createElement("DIV")
		tmp.innerHTML = html
		return tmp.textContent || tmp.innerText || ""
	}

	// Get clean versions for use in copy and execute
	const cleanId = sanitizeHtml(id)
	const cleanName = sanitizeHtml(name)
	const cleanDescription = sanitizeHtml(description)

	return (
		<div
			style={{
				display: "flex",
				alignItems: "center",
				width: "100%",
				minWidth: 0,
				gap: "8px",
				padding: "8px 0",
			}}>
			<div
				style={{
					flex: 1,
					minWidth: 0,
					overflow: "hidden",
					whiteSpace: "nowrap",
					textOverflow: "ellipsis",
					padding: "0 8px",
					display: "flex",
					flexDirection: "column",
				}}>
				<div
					style={{
						flex: 1,
						minWidth: 0,
						overflow: "hidden",
						whiteSpace: "nowrap",
						textOverflow: "ellipsis",
						display: "flex",
						flexDirection: "row",
						alignItems: "center",
					}}>
					<span
						style={{
							fontSize: "12px",
							fontWeight: "bold",
							color: "var(--vscode-descriptionForeground)",
						}}>
						<span dangerouslySetInnerHTML={{ __html: task.highlighted.id }} />
						{task.highlighted.subTaskTicketId && (
							<span
								dangerouslySetInnerHTML={{
									__html: ` • ${task.highlighted.subTaskTicketId}`,
								}}
								style={{
									fontSize: "12px",
									overflow: "hidden",
									whiteSpace: "nowrap",
									textOverflow: "ellipsis",
								}}
							/>
						)}{" "}
					</span>
					{task.original.status === "Completed" && (
						<span
							className={`codicon codicon-pass-filled`}
							style={{ marginLeft: "4px", color: "green", fontSize: "13px" }}
						/>
					)}
				</div>
				<span
					dangerouslySetInnerHTML={{ __html: task.highlighted.list }}
					style={{
						display: "-webkit-box",
						WebkitLineClamp: 1,
						WebkitBoxOrient: "vertical",
						whiteSpace: "pre-wrap",
						wordBreak: "break-word",
						overflowWrap: "anywhere",
					}}
				/>
			</div>

			<div
				style={{
					display: "flex",
					gap: "8px",
					flexShrink: 0,
				}}>
				<VSCodeButton
					appearance="icon"
					onClick={() => {
						onTaskSelect({
							context: `${cleanName}: ${cleanDescription}`,
							...task.original,
							id: `${prdId}-${cleanId}-${task.original.id}`,
						})
					}}
					title="Execute Task">
					<span className="codicon codicon-play" style={{ fontSize: 14, cursor: "pointer" }} />
				</VSCodeButton>
				<CopyClipboard
					onCopyContent={() => {
						return `Task (${task.original.id}): ${task.original.list}\nAcceptance: ${task.original.acceptance}\n\nContext:\nStory (${cleanId}): ${cleanName}\nStory Acceptance: ${cleanDescription}\n`
					}}
					title="Copy Task"
				/>
				<VSCodeButton appearance="icon" onClick={() => onTaskClick(task.original)} title="View Task">
					<span className="codicon codicon-eye" style={{ fontSize: 14, cursor: "pointer" }} />
				</VSCodeButton>
			</div>
		</div>
	)
}
export default HaiTaskComponent
