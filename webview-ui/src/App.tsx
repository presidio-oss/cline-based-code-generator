import { useCallback, useEffect, useState } from "react"
import { useEvent } from "react-use"
import { ExtensionMessage } from "@shared/ExtensionMessage"
import ChatView from "./components/chat/ChatView"
import HistoryView from "./components/history/HistoryView"
import SettingsView from "./components/settings/SettingsView"
import WelcomeView from "./components/welcome/WelcomeView"
import AccountView from "./components/account/AccountView"
import { vscode } from "./utils/vscode"
import { useExtensionState } from "./context/ExtensionStateContext"
import { UiServiceClient } from "./services/grpc-client"
import McpView from "./components/mcp/configuration/McpConfigurationView"
import { Providers } from "./Providers"
import { Boolean, EmptyRequest } from "@shared/proto/common"

// TAG:HAI
import ExpertsView from "./components/experts/ExpertsView"
import { HaiTasksList } from "./components/hai/hai-tasks-list"
import { IHaiClineTask, IHaiStory, IHaiTask } from "@shared/hai-task"
import DetailedView from "./components/hai/DetailedView"

const AppContent = () => {
	const {
		didHydrateState,
		showWelcome,
		shouldShowAnnouncement,
		showMcp,
		mcpTab,
		showSettings,
		showHistory,
		showAccount,
		showAnnouncement,
		setShowAnnouncement,
		setShouldShowAnnouncement,
		closeMcpView,
		navigateToHistory,
		hideSettings,
		hideHistory,
		hideAccount,
		hideAnnouncement,

		// TAG:HAI
		haiConfig,
		showHaiTaskList,
		detailedStory,
		detailedTask,
		showExperts,
		setShowHaiTaskList,
		setDetailedStory,
		setDetailedTask,
		setHaiConfig,
		hideExperts,
	} = useExtensionState()

	// TAG:HAI
	const [taskList, setTaskList] = useState<IHaiStory[]>([])
	const [taskLastUpdatedTs, setTaskLastUpdatedTs] = useState<string>("")
	const [selectedTask, setSelectedTask] = useState<IHaiClineTask | null>(null)

	const handleMessage = useCallback((e: MessageEvent) => {
		const message: ExtensionMessage = e.data
		switch (message.type) {
			case "haiTaskData":
				setTaskList(message.haiTaskData!.tasks)
				setTaskLastUpdatedTs(message.haiTaskData!.ts)
				setHaiConfig({ ...haiConfig, folder: message.haiTaskData!.folder, ts: message.haiTaskData!.ts })
				break
		}
	}, [])

	useEvent("message", handleMessage)

	useEffect(() => {
		if (shouldShowAnnouncement) {
			setShowAnnouncement(true)

			// Use the gRPC client instead of direct WebviewMessage
			UiServiceClient.onDidShowAnnouncement({} as EmptyRequest)
				.then((response: Boolean) => {
					setShouldShowAnnouncement(response.value)
				})
				.catch((error) => {
					console.error("Failed to acknowledge announcement:", error)
				})
		}
	}, [shouldShowAnnouncement])

	// TAG:HAI
	useEffect(() => {
		if (haiConfig?.folder) {
			onConfigure(true)
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [haiConfig?.folder])

	const onHaiTaskCancel = () => {
		setShowHaiTaskList(false)
	}

	const onConfigure = (loadDefault: boolean) => {
		loadDefault && vscode.postMessage({ type: "onHaiConfigure", text: haiConfig?.folder })
		!loadDefault && vscode.postMessage({ type: "onHaiConfigure" })
	}

	const onHaiTaskReset = () => {
		setTaskList([])
		vscode.postMessage({ type: "onHaiConfigure", bool: false })
	}

	const handleTaskClick = (task: IHaiTask) => {
		setDetailedTask(task)
		const story = taskList.find((story) => story.tasks.some((t) => t.id === task.id && t === task))
		setDetailedStory(story ? story : null)
	}

	const handleStoryClick = (story: IHaiStory) => {
		setDetailedStory(story)
		setDetailedTask(null)
	}

	const handleBreadcrumbClick = (type: string) => {
		if (type === "USER_STORIES") {
			setShowHaiTaskList(true)
			setDetailedTask(null)
			setDetailedStory(null)
		} else if (type === "USER_STORY") {
			setDetailedStory(detailedStory)
			setDetailedTask(null)
		}
	}

	if (!didHydrateState) {
		return null
	}

	return (
		<>
			{showWelcome ? (
				<WelcomeView />
			) : (
				<>
					{detailedTask || detailedStory ? (
						<DetailedView
							onTaskClick={handleTaskClick}
							task={detailedTask}
							story={detailedStory}
							onBreadcrumbClick={handleBreadcrumbClick}
							onTaskSelect={(selectedTask) => {
								setSelectedTask(selectedTask)
								setShowHaiTaskList(false)
								setDetailedStory(null)
								setDetailedTask(null)
							}}
						/>
					) : (
						<>
							{showHaiTaskList && (
								<HaiTasksList
									haiTaskList={taskList}
									haiTaskLastUpdatedTs={taskLastUpdatedTs}
									selectedHaiTask={(selectedTask) => {
										setSelectedTask(selectedTask)
										setShowHaiTaskList(false)
									}}
									onCancel={onHaiTaskCancel}
									onConfigure={onConfigure}
									onHaiTaskReset={onHaiTaskReset}
									onTaskClick={handleTaskClick}
									onStoryClick={handleStoryClick}
								/>
							)}
							{showSettings && <SettingsView onDone={hideSettings} />}
							{showHistory && <HistoryView onDone={hideHistory} />}
							{showMcp && <McpView initialTab={mcpTab} onDone={closeMcpView} />}
							{showAccount && <AccountView onDone={hideAccount} />}
							{showExperts && <ExpertsView onDone={hideExperts} />}
							{/* Do not conditionally load ChatView, it's expensive and there's state we don't want to lose (user input, disableInput, askResponse promise, etc.) */}
							<ChatView
								showHistoryView={navigateToHistory}
								isHidden={showSettings || showHistory || showMcp || showAccount || showExperts}
								showAnnouncement={showAnnouncement}
								hideAnnouncement={hideAnnouncement}
								onTaskSelect={(selectedTask) => {
									setSelectedTask(selectedTask)
								}}
								selectedHaiTask={selectedTask}
								haiConfig={haiConfig}
							/>
						</>
					)}
				</>
			)}
		</>
	)
}

const App = () => {
	return (
		<Providers>
			<AppContent />
		</Providers>
	)
}

export default App
