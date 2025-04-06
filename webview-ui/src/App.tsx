import { useCallback, useEffect, useState } from "react"
import { useEvent } from "react-use"
import { ExtensionMessage } from "../../src/shared/ExtensionMessage"
import ChatView from "./components/chat/ChatView"
import HistoryView from "./components/history/HistoryView"
import SettingsView from "./components/settings/SettingsView"
import WelcomeView from "./components/welcome/WelcomeView"
import AccountView from "./components/account/AccountView"
import ExpertsView from "./components/experts/ExpertsView"
import { ExtensionStateContextProvider, useExtensionState } from "./context/ExtensionStateContext"
import { FirebaseAuthProvider } from "./context/FirebaseAuthContext"
import { vscode } from "./utils/vscode"
import { HaiTasksList } from "./components/hai/hai-tasks-list"
import { IHaiClineTask, IHaiStory, IHaiTask } from "./interfaces/hai-task.interface"
import DetailedView from "./components/hai/DetailedView"
import McpView from "./components/mcp/McpView"

const AppContent = () => {
	const { didHydrateState, showWelcome, shouldShowAnnouncement, telemetrySetting, vscMachineId, setHaiConfig, haiConfig } =
		useExtensionState()
	const [showSettings, setShowSettings] = useState(false)
	const [showHistory, setShowHistory] = useState(false)
	const [showMcp, setShowMcp] = useState(false)
	const [showAccount, setShowAccount] = useState(false)
	const [showExperts, setShowExperts] = useState(false)
	const [showAnnouncement, setShowAnnouncement] = useState(false)
	const [showHaiTaskList, setShowHaiTaskList] = useState(false)
	const [taskList, setTaskList] = useState<IHaiStory[]>([])
	const [taskLastUpdatedTs, setTaskLastUpdatedTs] = useState<string>("")
	const [selectedTask, setSelectedTask] = useState<IHaiClineTask | null>(null)
	const [detailedTask, setDetailedTask] = useState<IHaiTask | null>(null)
	const [detailedStory, setDetailedStory] = useState<IHaiStory | null>(null)

	const handleMessage = useCallback((e: MessageEvent) => {
		const message: ExtensionMessage = e.data
		switch (message.type) {
			case "action":
				switch (message.action!) {
					case "settingsButtonClicked":
						setShowSettings(true)
						setShowHistory(false)
						setShowHaiTaskList(false)
						setDetailedStory(null)
						setDetailedTask(null)
						setShowMcp(false)
						setShowAccount(false)
						setShowExperts(false)
						break
					case "historyButtonClicked":
						setShowSettings(false)
						setShowHistory(true)
						setShowHaiTaskList(false)
						setDetailedStory(null)
						setDetailedTask(null)
						setShowMcp(false)
						setShowAccount(false)
						setShowExperts(false)
						break
					case "mcpButtonClicked":
						setShowSettings(false)
						setShowHistory(false)
						setShowHaiTaskList(false)
						setDetailedStory(null)
						setDetailedTask(null)
						setShowMcp(true)
						setShowAccount(false)
						setShowExperts(false)
						break
					case "accountButtonClicked":
						setShowSettings(false)
						setShowHistory(false)
						setShowHaiTaskList(false)
						setDetailedStory(null)
						setDetailedTask(null)
						setShowMcp(false)
						setShowAccount(true)
						setShowExperts(false)
						break
					case "chatButtonClicked":
						setShowSettings(false)
						setShowHistory(false)
						setShowHaiTaskList(false)
						setDetailedStory(null)
						setDetailedTask(null)
						setShowMcp(false)
						setShowAccount(false)
						setShowExperts(false)
						break
					case "haiBuildTaskListClicked":
						setShowSettings(false)
						setShowHistory(false)
						setShowHaiTaskList(true)
						setDetailedStory(null)
						setDetailedTask(null)
						setShowMcp(false)
						setShowAccount(false)
						setShowExperts(false)
						break
					case "expertsButtonClicked":
						setShowSettings(false)
						setShowHistory(false)
						setShowHaiTaskList(false)
						setDetailedStory(null)
						setDetailedTask(null)
						setShowMcp(false)
						setShowAccount(false)
						setShowExperts(true)
						break
				}
				break
			case "haiTaskData":
				setTaskList(message.haiTaskData!.tasks)
				setTaskLastUpdatedTs(message.haiTaskData!.ts)
				setHaiConfig({ ...haiConfig, folder: message.haiTaskData!.folder, ts: message.haiTaskData!.ts })
				break
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])

	useEvent("message", handleMessage)

	// useEffect(() => {
	// 	if (telemetrySetting === "enabled") {
	// 		posthog.identify(vscMachineId)
	// 		posthog.opt_in_capturing()
	// 	} else {
	// 		posthog.opt_out_capturing()
	// 	}
	// }, [telemetrySetting, vscMachineId])

	useEffect(() => {
		if (shouldShowAnnouncement) {
			setShowAnnouncement(true)
			vscode.postMessage({ type: "didShowAnnouncement" })
		}
	}, [shouldShowAnnouncement])

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
							{showSettings && <SettingsView onDone={() => setShowSettings(false)} />}
							{showHistory && <HistoryView onDone={() => setShowHistory(false)} />}
							{showMcp && <McpView onDone={() => setShowMcp(false)} />}
							{showAccount && <AccountView onDone={() => setShowAccount(false)} />}
							{showExperts && <ExpertsView onDone={() => setShowExperts(false)} />}
							{/* Do not conditionally load ChatView, it's expensive and there's state we don't want to lose (user input, disableInput, askResponse promise, etc.) */}
							<ChatView
								onTaskSelect={(selectedTask) => {
									setSelectedTask(selectedTask)
								}}
								showHistoryView={() => {
									setShowSettings(false)
									setShowMcp(false)
									setShowHistory(true)
									setShowHaiTaskList(false)
									setShowAccount(false)
								}}
								selectedHaiTask={selectedTask}
								isHidden={showSettings || showHistory || showMcp || showAccount || showExperts}
								showAnnouncement={showAnnouncement}
								hideAnnouncement={() => {
									setShowAnnouncement(false)
								}}
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
		<ExtensionStateContextProvider>
			<FirebaseAuthProvider>
				<AppContent />
			</FirebaseAuthProvider>
		</ExtensionStateContextProvider>
	)
}

export default App
