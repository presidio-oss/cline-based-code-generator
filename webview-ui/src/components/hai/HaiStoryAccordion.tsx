import { IHaiClineTask, IHaiStory, IHaiTask } from "@shared/hai-task"
import { VSCodeButton } from "@vscode/webview-ui-toolkit/react"
import React, { useEffect, useState } from "react"
import HaiTaskComponent from "./HaiTaskComponent"

// Interface for the highlighted task structure
interface IHighlightedHaiTask {
	original: IHaiTask
	highlighted: IHaiTask
}

interface HaiStoryAccordionProps {
	onTaskClick: (task: IHaiTask) => void
	onStoryClick: (story: IHaiStory) => void
	name: string
	description: string
	tasks: IHighlightedHaiTask[]
	onTaskSelect: (task: IHaiClineTask) => void
	id: string
	prdId: string
	storyTicketId?: string
	isAllExpanded: boolean
	originalStory: IHaiStory
}

export const HaiStoryAccordion: React.FC<HaiStoryAccordionProps> = ({
	onTaskClick,
	onStoryClick,
	name,
	tasks,
	onTaskSelect,
	description,
	storyTicketId,
	id,
	prdId,
	isAllExpanded,
	originalStory,
}) => {
	const [isExpanded, setIsExpanded] = useState<boolean>(true)

	useEffect(() => {
		setIsExpanded(isAllExpanded)
	}, [isAllExpanded])

	return (
		<div style={{ width: "100%" }}>
			<div
				onClick={() => setIsExpanded(!isExpanded)}
				style={{
					cursor: "pointer",
					display: "flex",
					alignItems: "center",
					padding: "8px",
					gap: "8px",
					width: "100%",
					boxSizing: "border-box",
				}}>
				<span
					className="codicon codicon-chevron-right"
					style={{
						transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)",
						transition: "transform 0.2s ease",
						flexShrink: 0,
						width: "16px",
						height: "16px",
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
					}}
				/>
				<div
					style={{
						display: "flex",
						alignItems: "center",
						flex: 1,
						minWidth: 0,
					}}>
					<div
						style={{
							minWidth: 0,
							flex: 1,
						}}>
						<div
							style={{
								display: "flex",
								flexDirection: "column",
								gap: "4px",
							}}>
							<div
								style={{
									display: "flex",
									flexDirection: "row",
									gap: "2px",
									color: "var(--vscode-descriptionForeground)",
								}}>
								<span
									dangerouslySetInnerHTML={{ __html: id }}
									style={{
										fontSize: "12px",
										fontWeight: "bold",
									}}
								/>
								{storyTicketId && (
									<span
										dangerouslySetInnerHTML={{ __html: ` • ${storyTicketId}` }}
										style={{
											fontSize: "12px",
											overflow: "hidden",
											whiteSpace: "nowrap",
											textOverflow: "ellipsis",
											fontWeight: "bold",
										}}
									/>
								)}{" "}
							</div>
							<span
								dangerouslySetInnerHTML={{ __html: name }}
								style={{
									overflow: "hidden",
									fontSize: "14px",
									fontWeight: "bold",
									display: "-webkit-box",
									WebkitLineClamp: 1,
									WebkitBoxOrient: "vertical",
									whiteSpace: "pre-wrap",
									wordBreak: "break-word",
									overflowWrap: "anywhere",
								}}
							/>
							<span
								dangerouslySetInnerHTML={{ __html: description }}
								style={{
									overflow: "hidden",
									fontSize: "12px",
									paddingRight: "8px",
									display: "-webkit-box",
									WebkitLineClamp: 3,
									WebkitBoxOrient: "vertical",
									whiteSpace: "pre-wrap",
									wordBreak: "break-word",
									overflowWrap: "anywhere",
								}}
							/>
						</div>
					</div>
					<VSCodeButton appearance="icon" onClick={() => onStoryClick(originalStory)} title="View Story">
						<span
							className="codicon codicon-eye"
							style={{
								opacity: 0.8,
							}}
						/>
					</VSCodeButton>
				</div>
			</div>

			{isExpanded && (
				<div
					style={{
						paddingLeft: "8px",
						borderLeft: "1px solid",
						marginLeft: "16px",
						color: "var(--vscode-descriptionForeground)",
					}}>
					{tasks.length > 0 ? (
						<div
							style={{
								paddingRight: "24px",
								boxSizing: "border-box",
							}}>
							{tasks.map((task) => (
								<div key={task.original.id}>
									<div>
										<HaiTaskComponent
											description={description}
											id={id}
											name={name}
											onTaskClick={onTaskClick}
											onTaskSelect={onTaskSelect}
											prdId={prdId}
											task={task}
										/>
									</div>
								</div>
							))}
						</div>
					) : (
						<p style={{ padding: "8px 24px" }}>No tasks available.</p>
					)}
				</div>
			)}
		</div>
	)
}
