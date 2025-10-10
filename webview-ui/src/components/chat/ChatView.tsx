import { findLast } from "@shared/array"
import { combineApiRequests } from "@shared/combineApiRequests"
import { combineCommandSequences } from "@shared/combineCommandSequences"
import type { ClineApiReqInfo, ClineMessage } from "@shared/ExtensionMessage"
import { getApiMetrics } from "@shared/getApiMetrics"
import { IHaiClineTask } from "@shared/hai-task"
import { BooleanRequest, StringRequest } from "@shared/proto/cline/common"
import type { UpdateTaskStatusRequest } from "@shared/proto/cline/ui"
import { VSCodeButton } from "@vscode/webview-ui-toolkit/react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { useMount } from "react-use"
import { normalizeApiConfiguration } from "@/components/settings/utils/providerUtils"
import { useExtensionState } from "@/context/ExtensionStateContext"
import { FileServiceClient, UiServiceClient } from "@/services/grpc-client"
// TAG:HAI
import Logo from "../../assets/hai-dark.svg?react"
import TelemetryBanner from "../common/TelemetryBanner"
import { Navbar } from "../menu/Navbar"
import QuickActions from "../welcome/QuickActions"
import AutoApproveBar from "./auto-approve-menu/AutoApproveBar"
import CodeIndexWarning from "./CodeIndexWarning"
// Import utilities and hooks from the new structure
import {
	ActionButtons,
	CHAT_CONSTANTS,
	ChatLayout,
	convertHtmlToMarkdown,
	filterVisibleMessages,
	groupMessages,
	InputSection,
	MessagesArea,
	TaskSection,
	useChatState,
	useMessageHandlers,
	useScrollBehavior,
	WelcomeSection,
} from "./chat-view"

interface ChatViewProps {
	isHidden: boolean
	showAnnouncement: boolean
	hideAnnouncement: () => void
	showHistoryView: () => void
	showHaiTaskListView: () => void

	// TAG:HAI
	onTaskSelect: (task: IHaiClineTask | null) => void
	selectedHaiTask: IHaiClineTask | null
	haiConfigFolder: string
}

// Use constants from the imported module
const MAX_IMAGES_AND_FILES_PER_MESSAGE = CHAT_CONSTANTS.MAX_IMAGES_AND_FILES_PER_MESSAGE
const QUICK_WINS_HISTORY_THRESHOLD = 3

const IS_STANDALONE = window?.__is_standalone__ ?? false

const ChatView = ({
	isHidden,
	showAnnouncement,
	hideAnnouncement,
	showHistoryView,
	showHaiTaskListView,
	onTaskSelect,
	selectedHaiTask,
	haiConfigFolder,
}: ChatViewProps) => {
	const {
		version,
		clineMessages: messages,
		taskHistory,
		apiConfiguration,
		telemetrySetting,
		navigateToChat,
		mode,
		userInfo,
		currentFocusChainChecklist,
	} = useExtensionState()
	const isProdHostedApp = userInfo?.apiBaseUrl === "https://app.cline.bot"
	const shouldShowQuickWins = isProdHostedApp && (!taskHistory || taskHistory.length < QUICK_WINS_HISTORY_THRESHOLD)

	//const task = messages.length > 0 ? (messages[0].say === "task" ? messages[0] : undefined) : undefined) : undefined
	const task = useMemo(() => messages.at(0), [messages]) // leaving this less safe version here since if the first message is not a task, then the extension is in a bad state and needs to be debugged (see HAI.abort)
	const modifiedMessages = useMemo(() => combineApiRequests(combineCommandSequences(messages.slice(1))), [messages])
	// has to be after api_req_finished are all reduced into api_req_started messages
	const apiMetrics = useMemo(() => getApiMetrics(modifiedMessages), [modifiedMessages])

	const lastApiReqTotalTokens = useMemo(() => {
		const getTotalTokensFromApiReqMessage = (msg: ClineMessage) => {
			if (!msg.text) {
				return 0
			}
			const { tokensIn, tokensOut, cacheWrites, cacheReads }: ClineApiReqInfo = JSON.parse(msg.text)
			return (tokensIn || 0) + (tokensOut || 0) + (cacheWrites || 0) + (cacheReads || 0)
		}
		const lastApiReqMessage = findLast(modifiedMessages, (msg) => {
			if (msg.say !== "api_req_started") {
				return false
			}
			return getTotalTokensFromApiReqMessage(msg) > 0
		})
		if (!lastApiReqMessage) {
			return undefined
		}
		return getTotalTokensFromApiReqMessage(lastApiReqMessage)
	}, [modifiedMessages])

	// Use custom hooks for state management
	const chatState = useChatState(messages)
	const {
		setInputValue,
		selectedImages,
		setSelectedImages,
		selectedFiles,
		setSelectedFiles,
		sendingDisabled,
		enableButtons,
		expandedRows,
		setExpandedRows,
		textAreaRef,
	} = chatState

	// TAG:HAI - Track last successfully executed task ID
	const [lastSuccessfullyExecutedTaskId, setLastSuccessfullyExecutedTaskId] = useState<string | undefined>(undefined)

	// TAG:HAI - Reset lastSuccessfullyExecutedTaskId when task changes (new task started or task cleared)
	useEffect(() => {
		setLastSuccessfullyExecutedTaskId(undefined)
	}, [task?.ts])

	// TAG:HAI - Set input value when task is selected
	useEffect(() => {
		// eslint-disable-next-line @typescript-eslint/no-unused-expressions
		selectedHaiTask && setInputValue(`Task: ${selectedHaiTask.list} ${selectedHaiTask.acceptance} ${selectedHaiTask.context}`)
	}, [selectedHaiTask])

	// TAG:HAI - Track when a task completes successfully
	useEffect(() => {
		if (selectedHaiTask && messages.length > 0) {
			const lastMessage = messages[messages.length - 1]
			// Check if the last message is a completion_result (task completed)
			if ((lastMessage.ask === "completion_result" || lastMessage.say === "completion_result") && !lastMessage.partial) {
				setLastSuccessfullyExecutedTaskId(selectedHaiTask.id)
			}
		}
	}, [messages, selectedHaiTask])

	useEffect(() => {
		const handleCopy = async (e: ClipboardEvent) => {
			const targetElement = e.target as HTMLElement | null
			// If the copy event originated from an input or textarea,
			// let the default browser behavior handle it.
			if (
				targetElement &&
				(targetElement.tagName === "INPUT" || targetElement.tagName === "TEXTAREA" || targetElement.isContentEditable)
			) {
				return
			}

			if (window.getSelection) {
				const selection = window.getSelection()
				if (selection && selection.rangeCount > 0) {
					const range = selection.getRangeAt(0)
					const commonAncestor = range.commonAncestorContainer
					let textToCopy: string | null = null

					// Check if the selection is inside an element where plain text copy is preferred
					let currentElement =
						commonAncestor.nodeType === Node.ELEMENT_NODE
							? (commonAncestor as HTMLElement)
							: commonAncestor.parentElement
					let preferPlainTextCopy = false
					while (currentElement) {
						if (currentElement.tagName === "PRE" && currentElement.querySelector("code")) {
							preferPlainTextCopy = true
							break
						}
						// Check computed white-space style
						const computedStyle = window.getComputedStyle(currentElement)
						if (
							computedStyle.whiteSpace === "pre" ||
							computedStyle.whiteSpace === "pre-wrap" ||
							computedStyle.whiteSpace === "pre-line"
						) {
							// If the element itself or an ancestor has pre-like white-space,
							// and the selection is likely contained within it, prefer plain text.
							// This helps with elements like the TaskHeader's text display.
							preferPlainTextCopy = true
							break
						}

						// Stop searching if we reach a known chat message boundary or body
						if (
							currentElement.classList.contains("chat-row-assistant-message-container") ||
							currentElement.classList.contains("chat-row-user-message-container") ||
							currentElement.tagName === "BODY"
						) {
							break
						}
						currentElement = currentElement.parentElement
					}

					if (preferPlainTextCopy) {
						// For code blocks or elements with pre-formatted white-space, get plain text.
						textToCopy = selection.toString()
					} else {
						// For other content, use the existing HTML-to-Markdown conversion
						const clonedSelection = range.cloneContents()
						const div = document.createElement("div")
						div.appendChild(clonedSelection)
						const selectedHtml = div.innerHTML
						textToCopy = await convertHtmlToMarkdown(selectedHtml)
					}

					if (textToCopy !== null) {
						try {
							FileServiceClient.copyToClipboard(StringRequest.create({ value: textToCopy })).catch((err) => {
								console.error("Error copying to clipboard:", err)
							})
							e.preventDefault()
						} catch (error) {
							console.error("Error copying to clipboard:", error)
						}
					}
				}
			}
		}
		document.addEventListener("copy", handleCopy)

		return () => {
			document.removeEventListener("copy", handleCopy)
		}
	}, [])
	// Button state is now managed by useButtonState hook

	useEffect(() => {
		setExpandedRows({})
	}, [task?.ts])

	// handleFocusChange is already provided by chatState

	// Use message handlers hook
	const messageHandlers = useMessageHandlers(messages, chatState)

	const { selectedModelInfo } = useMemo(() => {
		return normalizeApiConfiguration(apiConfiguration, mode)
	}, [apiConfiguration, mode])

	const selectFilesAndImages = useCallback(async () => {
		try {
			const response = await FileServiceClient.selectFiles(
				BooleanRequest.create({
					value: selectedModelInfo.supportsImages,
				}),
			)
			if (
				response &&
				response.values1 &&
				response.values2 &&
				(response.values1.length > 0 || response.values2.length > 0)
			) {
				const currentTotal = selectedImages.length + selectedFiles.length
				const availableSlots = MAX_IMAGES_AND_FILES_PER_MESSAGE - currentTotal

				if (availableSlots > 0) {
					// Prioritize images first
					const imagesToAdd = Math.min(response.values1.length, availableSlots)
					if (imagesToAdd > 0) {
						setSelectedImages((prevImages) => [...prevImages, ...response.values1.slice(0, imagesToAdd)])
					}

					// Use remaining slots for files
					const remainingSlots = availableSlots - imagesToAdd
					if (remainingSlots > 0) {
						setSelectedFiles((prevFiles) => [...prevFiles, ...response.values2.slice(0, remainingSlots)])
					}
				}
			}
		} catch (error) {
			console.error("Error selecting images & files:", error)
		}
	}, [selectedModelInfo.supportsImages])

	const shouldDisableFilesAndImages = selectedImages.length + selectedFiles.length >= MAX_IMAGES_AND_FILES_PER_MESSAGE

	// Listen for local focusChatInput event
	useEffect(() => {
		const handleFocusChatInput = () => {
			if (isHidden) {
				navigateToChat()
			}
			textAreaRef.current?.focus()
		}

		window.addEventListener("focusChatInput", handleFocusChatInput)

		return () => {
			window.removeEventListener("focusChatInput", handleFocusChatInput)
		}
	}, [isHidden])

	// Set up addToInput subscription
	useEffect(() => {
		const clientId = (window as { clineClientId?: string }).clineClientId
		if (!clientId) {
			console.error("Client ID not found in window object for addToInput subscription")
			return
		}

		const request = StringRequest.create({ value: clientId })
		const cleanup = UiServiceClient.subscribeToAddToInput(request, {
			onResponse: (event) => {
				if (event.value) {
					setInputValue((prevValue) => {
						const newText = event.value
						const newTextWithNewline = newText + "\n"
						return prevValue ? `${prevValue}\n${newTextWithNewline}` : newTextWithNewline
					})
					// Add scroll to bottom after state update
					// Auto focus the input and start the cursor on a new line for easy typing
					setTimeout(() => {
						if (textAreaRef.current) {
							textAreaRef.current.scrollTop = textAreaRef.current.scrollHeight
							textAreaRef.current.focus()
						}
					}, 0)
				}
			},
			onError: (error) => {
				console.error("Error in addToInput subscription:", error)
			},
			onComplete: () => {
				console.log("addToInput subscription completed")
			},
		})

		return cleanup
	}, [])

	useMount(() => {
		// NOTE: the vscode window needs to be focused for this to work
		textAreaRef.current?.focus()
	})

	useEffect(() => {
		const timer = setTimeout(() => {
			if (!isHidden && !sendingDisabled && !enableButtons) {
				textAreaRef.current?.focus()
			}
		}, 50)
		return () => {
			clearTimeout(timer)
		}
	}, [isHidden, sendingDisabled, enableButtons])

	const visibleMessages = useMemo(() => {
		return filterVisibleMessages(modifiedMessages)
	}, [modifiedMessages])

	const lastProgressMessageText = useMemo(() => {
		// First check if we have a current focus chain list from the extension state
		if (currentFocusChainChecklist) {
			return currentFocusChainChecklist
		}

		// Fall back to the last task_progress message if no state focus chain list
		const lastProgressMessage = [...modifiedMessages].reverse().find((message) => message.say === "task_progress")
		return lastProgressMessage?.text
	}, [modifiedMessages, currentFocusChainChecklist])

	const groupedMessages = useMemo(() => {
		return groupMessages(visibleMessages)
	}, [visibleMessages])

	// Use scroll behavior hook
	const scrollBehavior = useScrollBehavior(messages, visibleMessages, groupedMessages, expandedRows, setExpandedRows)

	const placeholderText = useMemo(() => {
		const text = task ? "Type a message..." : "Type your task here..."
		return text
	}, [task])

	return (
		<ChatLayout isHidden={isHidden}>
			<div className="flex flex-col flex-1 overflow-hidden">
				{IS_STANDALONE && <Navbar />}
				{task ? (
					<TaskSection
						apiMetrics={apiMetrics}
						lastApiReqTotalTokens={lastApiReqTotalTokens}
						lastProgressMessageText={lastProgressMessageText}
						messageHandlers={messageHandlers}
						scrollBehavior={scrollBehavior}
						selectedModelInfo={{
							supportsPromptCache: selectedModelInfo.supportsPromptCache,
							supportsImages: selectedModelInfo.supportsImages || false,
						}}
						task={task}
					/>
				) : (
					// <WelcomeSection
					// 	hideAnnouncement={hideAnnouncement}
					// 	shouldShowQuickWins={shouldShowQuickWins}
					// 	showAnnouncement={showAnnouncement}
					// 	showHistoryView={showHistoryView}
					// 	taskHistory={taskHistory}
					// 	telemetrySetting={telemetrySetting}
					// 	version={version}
					// />
					<div
						style={{
							flex: "1 1 0", // flex-grow: 1, flex-shrink: 1, flex-basis: 0
							minHeight: 0,
							overflowY: "auto",
							display: "flex",
							flexDirection: "column",
							paddingBottom: "10px",
						}}>
						<div style={{ height: "auto", maxWidth: "200px", margin: "20px" }}>
							<Logo className="hai-logo" style={{ height: "100%", width: "100%" }} />
						</div>

						{telemetrySetting === "unset" && <TelemetryBanner />}

						<CodeIndexWarning
							style={{
								margin: "0px 15px",
								position: "relative",
								flexShrink: 0,
							}}
							type="info"
						/>
						<div style={{ padding: "0 20px", flexShrink: 0 }}>
							<h2>How can I help you today?</h2>
							<p>
								I can handle complex software development tasks step-by-step. With tools that let me create & edit
								files, explore complex projects, use the browser, and execute terminal commands (after you grant
								permission), I can assist you in ways that go beyond code completion or tech support. I can even
								use MCP to create new tools and extend my own capabilities.
							</p>
						</div>
						<QuickActions
							onTaskSelect={onTaskSelect}
							showHaiTaskListView={showHaiTaskListView}
							showHistoryView={showHistoryView}
						/>
					</div>
				)}
				{task && (
					<MessagesArea
						chatState={chatState}
						groupedMessages={groupedMessages}
						messageHandlers={messageHandlers}
						modifiedMessages={modifiedMessages}
						scrollBehavior={scrollBehavior}
						task={task}
					/>
				)}
			</div>
			<footer className="bg-[var(--vscode-sidebar-background)]" style={{ gridRow: "2" }}>
				<AutoApproveBar />
				{/* TAG:HAI - Mark task as completed UI */}
				{selectedHaiTask?.id &&
					lastSuccessfullyExecutedTaskId &&
					selectedHaiTask?.id === lastSuccessfullyExecutedTaskId &&
					!enableButtons && (
						<div style={{ padding: "12px 15px 0px" }}>
							<p style={{ margin: "0px 0px 6px" }}>Do you want to mark this task as completed?</p>
							<div style={{ display: "flex" }}>
								<VSCodeButton
									appearance="primary"
									onClick={async () => {
										try {
											setLastSuccessfullyExecutedTaskId(undefined)

											const request: UpdateTaskStatusRequest = {
												metadata: {},
												folderPath: haiConfigFolder,
												taskId: selectedHaiTask?.id,
												status: "Completed",
											}
											const response = await UiServiceClient.updateTaskStatus(request)
											if (response.success) {
												onTaskSelect(null)
											} else {
												console.error("Failed to mark task as completed:", response.message)
											}
										} catch (error) {
											console.error("Failed to mark task as completed:", error)
										}
									}}
									style={{
										marginRight: "6px",
										flexGrow: 1,
									}}>
									Yes
								</VSCodeButton>
								<VSCodeButton
									appearance="secondary"
									onClick={() => {
										setLastSuccessfullyExecutedTaskId(undefined)
										onTaskSelect(null)
									}}
									style={{
										flexGrow: 1,
									}}>
									No
								</VSCodeButton>
							</div>
						</div>
					)}
				<ActionButtons
					chatState={chatState}
					messageHandlers={messageHandlers}
					messages={messages}
					mode={mode}
					scrollBehavior={{
						scrollToBottomSmooth: scrollBehavior.scrollToBottomSmooth,
						disableAutoScrollRef: scrollBehavior.disableAutoScrollRef,
						showScrollToBottom: scrollBehavior.showScrollToBottom,
					}}
					task={task}
				/>
				<InputSection
					chatState={chatState}
					messageHandlers={messageHandlers}
					placeholderText={placeholderText}
					scrollBehavior={scrollBehavior}
					selectFilesAndImages={selectFilesAndImages}
					shouldDisableFilesAndImages={shouldDisableFilesAndImages}
				/>
			</footer>
		</ChatLayout>
	)
}

export default ChatView
