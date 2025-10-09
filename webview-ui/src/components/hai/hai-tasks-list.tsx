import { IHaiClineTask, IHaiStory, IHaiTask } from "@shared/hai-task"
import { VSCodeButton, VSCodeTextField } from "@vscode/webview-ui-toolkit/react"
import Fuse from "fuse.js"
import { useMemo, useState } from "react"
import { v4 as uuidv4 } from "uuid"
import { addHighlighting } from "../../utils/add-highlighting"
import { HaiStoryAccordion } from "./HaiStoryAccordion"

// Define interfaces to store both original and highlighted versions
interface IHighlightedHaiTask {
	original: IHaiTask
	highlighted: IHaiTask
}

interface IHighlightedHaiStory {
	original: IHaiStory
	highlighted: IHaiStory & { tasks: IHighlightedHaiTask[] }
}

type SearchableTaskFields = keyof IHaiTask
const TASK_PREFIX = "tasks."

export function HaiTasksList({
	haiTaskList,
	haiTaskLastUpdatedTs,
	selectedHaiTask,
	onCancel,
	onConfigure,
	onHaiTaskReset,
	onTaskClick,
	onStoryClick,
}: {
	haiTaskList: IHaiStory[]
	haiTaskLastUpdatedTs?: string
	selectedHaiTask: (task: IHaiClineTask) => void
	onCancel: () => void
	onConfigure: (loadDefault: boolean) => void
	onHaiTaskReset: () => void
	onTaskClick: (task: IHaiTask) => void
	onStoryClick: (story: IHaiStory) => void
}) {
	const [searchQuery, setSearchQuery] = useState("")
	const [isAllExpanded, setIsAllExpanded] = useState(true)
	const handleFoldUnfold = (expand: boolean) => {
		setIsAllExpanded(expand)
	}

	const fuse = useMemo(() => {
		return new Fuse(haiTaskList, {
			keys: ["id", "name", "description", "storyTicketId", "tasks.id", "tasks.list", "tasks.subTaskTicketId"],
			includeMatches: true,
			shouldSort: true,
			threshold: 0.5,
			ignoreLocation: true,
			minMatchCharLength: 1,
			isCaseSensitive: false,
		})
	}, [haiTaskList])

	const taskSearchResults = useMemo(() => {
		if (!searchQuery.trim()) {
			// For no search query, return the original list with both original and highlighted
			// properties pointing to the same objects (no highlighting needed)
			return haiTaskList.map((story) => ({
				original: story,
				highlighted: {
					...story,
					tasks: story.tasks.map((task) => ({
						original: task,
						highlighted: task,
					})),
				},
			}))
		}

		const searchResults = fuse.search(searchQuery)

		return searchResults
			.map(({ item, matches }) => {
				// Store the original story
				const originalStory = item
				// Create a copy for highlighting
				const highlightedStory = { ...item }
				let hasStoryMatch = false

				matches?.forEach((match) => {
					if (
						match.key === "id" ||
						match.key === "name" ||
						match.key === "description" ||
						match.key === "storyTicketId"
					) {
						hasStoryMatch = true
						highlightedStory[match.key] = addHighlighting(String(match.value), match.indices || [])
					}
				})

				// Process task-level matches
				const processedTasks = originalStory.tasks
					.map((task) => {
						let hasTaskMatch = false
						// Create a copy for highlighting
						const highlightedTask = { ...task }

						matches?.forEach((match) => {
							if (match.key?.startsWith(TASK_PREFIX)) {
								const [, field] = match.key.split(".") as [string, SearchableTaskFields]
								if (isTaskField(field) && task[field] === match.value) {
									hasTaskMatch = true
									highlightedTask[field] = addHighlighting(String(match.value), match.indices || [])
								}
							}
						})

						// Only keep tasks that match or are in a matching story
						return hasTaskMatch || hasStoryMatch
							? {
									original: task,
									highlighted: highlightedTask,
								}
							: null
					})
					.filter((task): task is IHighlightedHaiTask => task !== null)

				if (processedTasks.length === 0) return null
				setIsAllExpanded(true)

				// Return both the original and highlighted versions
				return {
					original: originalStory,
					highlighted: {
						...highlightedStory,
						tasks: processedTasks,
					},
				}
			})
			.filter((story): story is IHighlightedHaiStory => story !== null)
	}, [searchQuery, haiTaskList, fuse])

	function isTaskField(key: string): key is SearchableTaskFields {
		return ["list", "acceptance", "id", "subTaskTicketId"].includes(key)
	}

	return (
		<>
			<style>
				{`
          .hai-task-highlight {
            background-color: var(--vscode-editor-findMatchHighlightBackground);
            color: inherit;
          }
        `}
			</style>
			<div
				style={{
					position: "fixed",
					top: 0,
					left: 0,
					right: 0,
					bottom: 0,
					display: "flex",
					flexDirection: "column",
					overflow: "hidden",
					zIndex: "10",
					backgroundColor: "var(--vscode-editor-background)",
				}}>
				<div className="hai-task-list-wrapper">
					<div className="hai-task-list-header">
						<div
							style={{
								display: "flex",
								alignItems: "center",
								justifyContent: "space-between",
							}}>
							<div>
								<h3 style={{ color: "var(--vscode-foreground)", margin: 0 }}>USER STORIES</h3>
								{haiTaskList.length > 0 && haiTaskLastUpdatedTs && (
									<div
										style={{
											fontSize: "12px",
											color: "var(--vscode-descriptionForeground)",
											paddingRight: "5px",
											marginTop: "5px",
										}}>
										{haiTaskLastUpdatedTs}
									</div>
								)}
							</div>
							<div style={{ display: "flex", gap: "0.5rem" }}>
								{haiTaskList.length > 0 && (
									<>
										<VSCodeButton appearance="icon" onClick={() => onConfigure(true)} title="Refresh">
											<span className="codicon codicon-refresh"></span>
										</VSCodeButton>
										<VSCodeButton appearance="icon" onClick={() => handleFoldUnfold(true)} title="Expand All">
											<span className="codicon codicon-unfold"></span>
										</VSCodeButton>
										<VSCodeButton
											appearance="icon"
											onClick={() => handleFoldUnfold(false)}
											title="Collapse All">
											<span className="codicon codicon-fold"></span>
										</VSCodeButton>
										<VSCodeButton appearance="icon" onClick={onHaiTaskReset} title="Clear All">
											<span className="codicon codicon-clear-all"></span>
										</VSCodeButton>
									</>
								)}
							</div>
						</div>
						<div style={{ marginTop: "1rem" }}>
							<VSCodeTextField
								onInput={(e) => {
									const newValue = (e.target as HTMLInputElement)?.value
									setSearchQuery(newValue)
								}}
								placeholder="Fuzzy search story..."
								style={{ width: "100%" }}
								value={searchQuery}>
								<div
									className="codicon codicon-search"
									slot="start"
									style={{ fontSize: 13, marginTop: 2.5, opacity: 0.8 }}></div>
								{searchQuery && (
									<div
										aria-label="Clear search"
										className="input-icon-button codicon codicon-close"
										onClick={() => setSearchQuery("")}
										slot="end"
										style={{
											display: "flex",
											justifyContent: "center",
											alignItems: "center",
											height: "100%",
											cursor: "pointer",
										}}
									/>
								)}
							</VSCodeTextField>
						</div>
					</div>
					{taskSearchResults.length > 0 ? (
						taskSearchResults.map((story) => (
							<HaiStoryAccordion
								description={story.highlighted.description}
								id={story.highlighted.id}
								isAllExpanded={isAllExpanded}
								key={uuidv4()}
								name={story.highlighted.name}
								onStoryClick={onStoryClick}
								onTaskClick={onTaskClick}
								onTaskSelect={selectedHaiTask}
								originalStory={story.original}
								prdId={story.highlighted.prdId}
								storyTicketId={story.highlighted.storyTicketId}
								tasks={story.highlighted.tasks}
							/>
						))
					) : (
						<div
							style={{
								display: "flex",
								flexDirection: "column",
								justifyContent: "center",
								alignItems: "center",
								marginTop: "60px",
								padding: "30px 0",
							}}>
							<h3 style={{ marginBottom: "0" }}>
								{searchQuery ? "No matching tasks found." : "No tasks available."}
							</h3>
							{!searchQuery && (
								<>
									<p style={{ width: "80%", textAlign: "center" }}>
										Choose your hai build workspace to load the tasks from the project
									</p>
									<VSCodeButton onClick={() => onConfigure(false)}>Load Tasks</VSCodeButton>
								</>
							)}
						</div>
					)}
				</div>
			</div>
		</>
	)
}
