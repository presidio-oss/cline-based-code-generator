import type { Boolean, EmptyRequest } from "@shared/proto/cline/common"
import { useEffect, useState } from "react"
import AccountView from "./components/account/AccountView"
import ChatView from "./components/chat/ChatView"
import ExpertsView from "./components/experts/ExpertsView"
import HistoryView from "./components/history/HistoryView"
import McpView from "./components/mcp/configuration/McpConfigurationView"
import SettingsView from "./components/settings/SettingsView"
import WelcomeView from "./components/welcome/WelcomeView"
import { useClineAuth } from "./context/ClineAuthContext"
import { useExtensionState } from "./context/ExtensionStateContext"
import { Providers } from "./Providers"
import { UiServiceClient } from "./services/grpc-client"
import { IHaiClineTask } from "@shared/hai-task"

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
		showExperts,
		showAnnouncement,
		setShowAnnouncement,
		setShouldShowAnnouncement,
		closeMcpView,
		navigateToHistory,
		hideSettings,
		hideHistory,
		hideAccount,
		hideExperts,
		hideAnnouncement,
	} = useExtensionState()

	// TAG:HAI
	const [selectedTask, setSelectedTask] = useState<IHaiClineTask | null>(null)

	const { clineUser, organizations, activeOrganization } = useClineAuth()

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
	}, [shouldShowAnnouncement, setShouldShowAnnouncement, setShowAnnouncement])

	if (!didHydrateState) {
		return null
	}

	if (showWelcome) {
		return <WelcomeView />
	}

	return (
		<div className="flex h-full w-full">
			{showSettings && <SettingsView onDone={hideSettings} />}
			{showHistory && <HistoryView onDone={hideHistory} />}
			{showMcp && <McpView initialTab={mcpTab} onDone={closeMcpView} />}
			{showAccount && (
				<AccountView
					onDone={hideAccount}
					clineUser={clineUser}
					organizations={organizations}
					activeOrganization={activeOrganization}
				/>
			)}
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
			/>
		</div>
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
