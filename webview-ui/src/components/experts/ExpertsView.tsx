import React, { useState, useEffect, memo } from "react"
import styled from "styled-components"
import { VSCodeButton, VSCodeTextField, VSCodeTextArea, VSCodeDivider, VSCodeLink } from "@vscode/webview-ui-toolkit/react"
import { vscode } from "../../utils/vscode"
import { useExtensionState } from "../../context/ExtensionStateContext"
import { DEFAULT_EXPERTS } from "../../data/defaultExperts"
import { ExpertData } from "../../types/experts"

interface ExpertsViewProps {
	onDone: () => void
}

const ExpertsView: React.FC<ExpertsViewProps> = ({ onDone }) => {
	const { version } = useExtensionState()
	const [experts, setExperts] = useState<ExpertData[]>(DEFAULT_EXPERTS)
	const [selectedExpert, setSelectedExpert] = useState<ExpertData | null>(null)
	const [newExpertName, setNewExpertName] = useState("")
	const [newExpertPrompt, setNewExpertPrompt] = useState("")
	const [isFileUploaded, setIsFileUploaded] = useState(false)
	const [uploadedFilePath, setUploadedFilePath] = useState<string>("")
	const [isFormReadOnly, setIsFormReadOnly] = useState(false)
	const [formMode, setFormMode] = useState<"view" | "edit" | "create">("create")
	const [nameError, setNameError] = useState<string | null>(null)

	// Create a reference to the file input element
	const fileInputRef = React.useRef<HTMLInputElement>(null)

	// Handle file selection
	const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0]
		if (!file) return

		// Store the file path
		setUploadedFilePath(file.name)
		setIsFileUploaded(true)

		// Read the file content
		const reader = new FileReader()
		reader.onload = (e) => {
			const content = e.target?.result as string
			setNewExpertPrompt(content)
		}
		reader.readAsText(file)

		// Reset the file input value so the same file can be selected again if needed
		if (fileInputRef.current) {
			fileInputRef.current.value = ""
		}
	}

	// Handle messages from VSCode
	useEffect(() => {
		const messageHandler = (event: MessageEvent) => {
			const message = event.data

			// Handle messages from the extension
			if (message.type === "expertsUpdated" && message.experts) {
				// Update experts list with custom experts from the backend
				setExperts([...DEFAULT_EXPERTS, ...message.experts])
			}
		}

		window.addEventListener("message", messageHandler)

		// Request custom experts from backend when component mounts
		vscode.postMessage({ type: "loadExperts" })

		return () => {
			window.removeEventListener("message", messageHandler)
		}
	}, [])

	// Reset form
	const resetForm = () => {
		setNewExpertName("")
		setNewExpertPrompt("")
		setIsFileUploaded(false)
		setUploadedFilePath("")
		setSelectedExpert(null)
		setIsFormReadOnly(false)
		setFormMode("create")
		setNameError(null)
	}

	// Handle expert selection and unselection
	const handleSelectExpert = (expert: ExpertData) => {
		// If the expert is already selected, unselect it
		if (selectedExpert && selectedExpert.name === expert.name) {
			setSelectedExpert(null)
			return
		}

		// Otherwise, just select the expert without populating the form
		setSelectedExpert(expert)

		// Always keep form in create mode
		setIsFormReadOnly(false)
		setFormMode("create")
	}

	// Handle saving a new expert
	const handleSaveExpert = () => {
		// Reset any previous error
		setNameError(null)

		if (!newExpertName.trim()) {
			vscode.postMessage({
				type: "showToast",
				toast: {
					message: "Expert name cannot be empty",
					toastType: "error",
				},
			})
			return
		}

		if (!newExpertPrompt.trim() && !isFileUploaded) {
			vscode.postMessage({
				type: "showToast",
				toast: {
					message: "Expert prompt cannot be empty",
					toastType: "error",
				},
			})
			return
		}

		// Check if an expert with this name already exists
		const expertExists = [...experts, ...experts.filter((e) => !e.isDefault)].some(
			(expert) => expert.name.toLowerCase() === newExpertName.toLowerCase(),
		)

		if (expertExists) {
			setNameError("An expert with this name already exists")
			vscode.postMessage({
				type: "showToast",
				toast: {
					message: "An expert with this name already exists",
					toastType: "error",
				},
			})
			return
		}

		// Create new expert
		const newExpert: ExpertData = {
			name: newExpertName,
			prompt: newExpertPrompt,
			isDefault: false,
			createdAt: new Date().toISOString(),
		}

		// Save to the file system
		vscode.postMessage({
			type: "saveExpert",
			text: JSON.stringify(newExpert),
		})

		setExperts([...experts, newExpert])
		resetForm()
	}

	// Handle file upload
	const handleFileUpload = () => {
		// Check if there's existing content in the prompt
		if (newExpertPrompt.trim()) {
			// Show warning that uploading will override existing content
			vscode.postMessage({
				type: "showToast",
				toast: {
					message: "Uploading a file will override existing prompt content",
					toastType: "warning",
				},
			})
		}

		// Trigger the hidden file input
		if (fileInputRef.current) {
			fileInputRef.current.click()
		}
	}

	// Handle expert deletion
	const handleDeleteExpert = (expertName: string) => {
		const expertToDelete = experts.find((expert) => expert.name === expertName)

		if (expertToDelete && !expertToDelete.isDefault) {
			// Delete from the file system
			vscode.postMessage({
				type: "saveExpert",
				text: `delete:${expertName}`,
			})

			setExperts(experts.filter((expert) => expert.name !== expertName))

			if (selectedExpert && selectedExpert.name === expertName) {
				resetForm()
			}
		}
	}

	// Handle opening expert prompt file
	const handleOpenExpertPrompt = (expertName: string) => {
		const expertToOpen = experts.find((expert) => expert.name === expertName)

		if (expertToOpen) {
			// Send message to extension to open the prompt file
			vscode.postMessage({
				type: "expertPrompt",
				text: `openFile:${expertName}`,
				isDefault: expertToOpen.isDefault,
				prompt: expertToOpen.isDefault ? expertToOpen.prompt : undefined,
			})
		}
	}

	// Get icon for expert based on name
	const getExpertIcon = (expertName: string) => {
		switch (expertName.toLowerCase()) {
			case "css":
				return (
					<svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" width="24" height="24">
						<path d="M6 28L4 3H28L26 28L16 31L6 28Z" fill="#1172B8" />
						<path d="M26 5H16V29.5L24 27L26 5Z" fill="#33AADD" />
						<path
							d="M19.5 17.5H9.5L9 14L17 11.5H9L8.5 8.5H24L23.5 12L17 14.5H23L22 24L16 26L10 24L9.5 19H12.5L13 21.5L16 22.5L19 21.5L19.5 17.5Z"
							fill="white"
						/>
					</svg>
				)
			case "angular":
				return (
					<svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" width="24" height="24">
						<path d="M16 2L3 7L5 24L16 30L27 24L29 7L16 2Z" fill="#DD0031" />
						<path d="M16 2V30L27 24L29 7L16 2Z" fill="#C3002F" />
						<path
							d="M16 5.09L7.09 23.41H10.64L12.55 18.64H19.45L21.36 23.41H24.91L16 5.09ZM18.18 16.18H13.82L16 10.45L18.18 16.18Z"
							fill="white"
						/>
					</svg>
				)
			case "hono":
				return (
					<svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" width="24" height="24">
						<path d="M16 3L29 10.5V21.5L16 29L3 21.5V10.5L16 3Z" fill="#E36B5D" />
						<path d="M16 7L24 11.5V20.5L16 25L8 20.5V11.5L16 7Z" fill="#FF9D8A" />
						<path d="M16 12L20 14.5V19.5L16 22L12 19.5V14.5L16 12Z" fill="#FFBEB3" />
					</svg>
				)
			case "next.js":
				return (
					<svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" width="24" height="24">
						<path
							d="M16 2C8.268 2 2 8.268 2 16C2 23.732 8.268 30 16 30C23.732 30 30 23.732 30 16C30 8.268 23.732 2 16 2ZM7.5 22.5L17.25 9H19.5V22.5H17.25V12.75L9 23.25C8.4 22.95 7.95 22.5 7.5 22.5Z"
							fill="white"
						/>
					</svg>
				)
			case "tailwindcss":
				return (
					<svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" width="24" height="24">
						<path
							d="M9 13.7C10.2 7.9 14.4 5 20.7 5C30.1 5 31 12.5 26.3 14.5C29.6 14.5 32 18.5 32 22.5C32 26.5 28.5 30 23 30C19.7 30 16.9 28.5 15.5 25.5C14.3 29.5 10.5 32 5.5 32C2.5 32 0 30.5 0 27.5C0 24.5 3 22.5 9 22.5V13.7Z"
							fill="#38BDF8"
						/>
						<path d="M9 13.7C12.8 13.7 14.7 16.3 14.7 22.5H9V13.7Z" fill="#0EA5E9" />
					</svg>
				)
			case "react":
				return (
					<svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" width="24" height="24">
						<path
							d="M16 13.146C14.402 13.146 13.098 14.451 13.098 16.049C13.098 17.646 14.402 18.951 16 18.951C17.598 18.951 18.902 17.646 18.902 16.049C18.902 14.451 17.598 13.146 16 13.146Z"
							fill="#61DAFB"
						/>
						<path
							d="M16 9.317C10.049 9.317 4.634 10.634 4.634 16.049C4.634 21.463 10.049 22.78 16 22.78C21.951 22.78 27.366 21.463 27.366 16.049C27.366 10.634 21.951 9.317 16 9.317ZM16 20.244C13.293 20.244 11.098 18.39 11.098 16.049C11.098 13.707 13.293 11.854 16 11.854C18.707 11.854 20.902 13.707 20.902 16.049C20.902 18.39 18.707 20.244 16 20.244Z"
							fill="#61DAFB"
						/>
						<path
							d="M16 7.317C19.927 7.317 23.317 6.634 25.78 5.463C27.366 4.683 29.366 3.317 29.366 1.317C29.366 0.683 29.049 0 28.415 0C26.415 0 23.366 3.049 16 3.049C8.634 3.049 5.585 0 3.585 0C2.951 0 2.634 0.683 2.634 1.317C2.634 3.317 4.634 4.683 6.22 5.463C8.683 6.634 12.073 7.317 16 7.317Z"
							fill="#61DAFB"
						/>
						<path
							d="M16 24.78C12.073 24.78 8.683 25.463 6.22 26.634C4.634 27.415 2.634 28.78 2.634 30.78C2.634 31.415 2.951 32.098 3.585 32.098C5.585 32.098 8.634 29.049 16 29.049C23.366 29.049 26.415 32.098 28.415 32.098C29.049 32.098 29.366 31.415 29.366 30.78C29.366 28.78 27.366 27.415 25.78 26.634C23.317 25.463 19.927 24.78 16 24.78Z"
							fill="#61DAFB"
						/>
					</svg>
				)
			case ".net":
				return (
					<svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" width="24" height="24">
						<path d="M3 6.5V25.5L16 29.5L29 25.5V6.5L16 2.5L3 6.5Z" fill="#512BD4" />
						<path
							d="M9 21.5L7 11.5H8.5L9.5 18L11 11.5H12.5L14 18L15 11.5H16.5L14.5 21.5H13L11.5 15L10 21.5H9Z"
							fill="white"
						/>
						<path
							d="M17 21.5V11.5H21C22.7 11.5 24 12.8 24 14.5C24 16.2 22.7 17.5 21 17.5H18.5V21.5H17ZM18.5 16H21C21.8 16 22.5 15.3 22.5 14.5C22.5 13.7 21.8 13 21 13H18.5V16Z"
							fill="white"
						/>
					</svg>
				)
			default:
				// Generic icon for any other expert
				return (
					<svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" width="24" height="24">
						<circle cx="16" cy="16" r="14" stroke="currentColor" strokeWidth="2" fill="none" />
						<text x="16" y="20" textAnchor="middle" fill="currentColor" fontSize="14">
							{expertName.charAt(0)}
						</text>
					</svg>
				)
		}
	}

	return (
		<Container>
			{/* Hidden file input for markdown files */}
			<input type="file" ref={fileInputRef} accept=".md" onChange={handleFileSelect} style={{ display: "none" }} />

			<Header>
				<h3>Experts</h3>
			</Header>

			<Content>
				<Section>
					<SectionHeader>Default Experts</SectionHeader>
					<ExpertGrid>
						{experts
							.filter((expert) => expert.isDefault)
							.map((expert) => (
								<ExpertCard
									key={expert.name}
									className={selectedExpert?.name === expert.name ? "selected" : ""}
									onClick={() => handleOpenExpertPrompt(expert.name)}>
									<IconContainer>{getExpertIcon(expert.name)}</IconContainer>
									<ExpertName>{expert.name}</ExpertName>
								</ExpertCard>
							))}
					</ExpertGrid>
				</Section>

				<Section>
					<SectionHeader>Custom Experts</SectionHeader>
					<ExpertsList>
						{experts.filter((expert) => !expert.isDefault).length > 0 ? (
							experts
								.filter((expert) => !expert.isDefault)
								.map((expert) => (
									<div key={expert.name} style={{ position: "relative", width: "100%" }}>
										<VSCodeButton
											appearance={selectedExpert?.name === expert.name ? "primary" : "secondary"}
											onClick={() => handleSelectExpert(expert)}
											style={{
												width: "100%",
												marginBottom: "2px",
												textOverflow: "ellipsis",
												overflow: "hidden",
											}}>
											{expert.name}
										</VSCodeButton>
										<VSCodeButton
											appearance="icon"
											onClick={(e: React.MouseEvent) => {
												e.stopPropagation()
												handleOpenExpertPrompt(expert.name)
											}}
											style={{
												position: "absolute",
												right: "38px",
												top: "50%",
												transform: "translateY(-50%)",
												minWidth: "20px",
												height: "20px",
												padding: 0,
											}}>
											<span className="codicon codicon-link-external"></span>
										</VSCodeButton>
										<VSCodeButton
											appearance="icon"
											onClick={(e: React.MouseEvent) => {
												e.stopPropagation()
												handleDeleteExpert(expert.name)
											}}
											style={{
												position: "absolute",
												right: "8px",
												top: "50%",
												transform: "translateY(-50%)",
												minWidth: "20px",
												height: "20px",
												padding: 0,
											}}>
											<span className="codicon codicon-trash"></span>
										</VSCodeButton>
									</div>
								))
						) : (
							<EmptyState>
								<p>No custom experts yet.</p>
							</EmptyState>
						)}
					</ExpertsList>
				</Section>

				<VSCodeDivider style={{ margin: "20px 0" }} />

				{/* Add/Edit Form Section */}
				<Section>
					<SectionHeader>Add New Expert</SectionHeader>
					<FormContainer>
						<FormGroup>
							<label htmlFor="expert-name">Name</label>
							<VSCodeTextField
								id="expert-name"
								value={newExpertName}
								onChange={(e) => setNewExpertName((e.target as HTMLInputElement).value)}
								placeholder="Expert Name"
								style={{ width: "100%" }}
								disabled={isFormReadOnly}
							/>
							{nameError && (
								<p style={{ color: "var(--vscode-errorForeground)", fontSize: "12px", marginTop: "4px" }}>
									{nameError}
								</p>
							)}
						</FormGroup>

						<FormGroup>
							<label htmlFor="expert-prompt">Prompt</label>
							<VSCodeTextArea
								id="expert-prompt"
								value={newExpertPrompt}
								onChange={(e) => setNewExpertPrompt((e.target as HTMLTextAreaElement).value)}
								placeholder="Enter Expert Prompt"
								resize="vertical"
								rows={6}
								disabled={isFormReadOnly}
								style={{ width: "100%" }}
							/>
							<p className="description-text">
								This prompt will replace the default HAI prompt when this expert is selected.
							</p>
						</FormGroup>

						{!isFormReadOnly && (
							<FormGroup>
								<VSCodeButton appearance="secondary" onClick={handleFileUpload}>
									<span className="codicon codicon-cloud-upload" style={{ marginRight: "5px" }}></span>
									Upload Prompt File
								</VSCodeButton>
							</FormGroup>
						)}

						{!isFormReadOnly && (
							<ActionButtons>
								<VSCodeButton appearance="secondary" onClick={resetForm}>
									Cancel
								</VSCodeButton>
								<VSCodeButton appearance="primary" onClick={handleSaveExpert}>
									Save
								</VSCodeButton>
							</ActionButtons>
						)}
					</FormContainer>
				</Section>

				<Footer>
					<p>
						If you have any questions or feedback, feel free to open an issue at{" "}
						<VSCodeLink
							href="https://github.com/presidio-oss/cline-based-code-generator"
							style={{ display: "inline" }}>
							https://github.com/presidio-oss/cline-based-code-generator
						</VSCodeLink>
					</p>
					<p className="version">v{version}</p>
				</Footer>
			</Content>
		</Container>
	)
}

// Styled components
const Container = styled.div`
	position: fixed;
	top: 0;
	left: 0;
	right: 0;
	bottom: 0;
	padding: 10px 0px 0px 20px;
	display: flex;
	flex-direction: column;
	overflow: hidden;
`

const Header = styled.div`
	display: flex;
	justify-content: space-between;
	align-items: center;
	margin-bottom: 17px;
	padding-right: 17px;

	h3 {
		color: var(--vscode-foreground);
		margin: 0;
	}
`

const Content = styled.div`
	flex-grow: 1;
	overflow-y: scroll;
	padding-right: 8px;
	display: flex;
	flex-direction: column;
`

const Section = styled.section`
	margin-bottom: 20px;
`

const SectionHeader = styled.h3`
	margin-bottom: 5px;
`

const ExpertsList = styled.div`
	display: flex;
	flex-direction: column;
	gap: 8px;
	width: 100%;
	max-height: 200px;
	overflow-y: auto;
	padding-right: 8px;

	/* Improve scrollbar appearance */
	&::-webkit-scrollbar {
		width: 6px;
	}

	&::-webkit-scrollbar-thumb {
		background-color: var(--vscode-scrollbarSlider-background);
		border-radius: 3px;
	}

	&::-webkit-scrollbar-thumb:hover {
		background-color: var(--vscode-scrollbarSlider-hoverBackground);
	}
`

// New styled components for expert cards
const ExpertGrid = styled.div`
	display: grid;
	grid-template-columns: repeat(2, 1fr);
	gap: 16px;
	width: 100%;
	margin-bottom: 16px;
`

const ExpertCard = styled.div`
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	width: 113px;
	height: 54.06512451171875px;
	padding: 8px 12px;
	background-color: var(--vscode-editor-background);
	border: 1px solid var(--vscode-panel-border);
	border-radius: 4px;
	cursor: pointer;
	transition: background-color 0.2s;

	&:hover {
		background-color: var(--vscode-list-hoverBackground);
	}

	&.selected {
		background-color: var(--vscode-list-activeSelectionBackground);
		color: var(--vscode-list-activeSelectionForeground);
	}
`

const IconContainer = styled.div`
	display: flex;
	align-items: center;
	justify-content: center;
	margin-bottom: 4px;
	font-size: 24px;
	color: var(--vscode-textLink-foreground);
`

const ExpertName = styled.div`
	font-size: 12px;
	text-align: center;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
	width: 100%;
`

// Removed unused styled components

const FormContainer = styled.div`
	border: 1px solid var(--vscode-panel-border);
	border-radius: 4px;
	padding: 16px;
	background-color: var(--vscode-editor-background);
`

const FormGroup = styled.div`
	margin-bottom: 16px;

	label {
		display: block;
		margin-bottom: 8px;
		font-weight: 500;
	}

	.description-text {
		font-size: 12px;
		margin-top: 5px;
		color: var(--vscode-descriptionForeground);
	}
`

const ActionButtons = styled.div`
	display: flex;
	justify-content: flex-end;
	gap: 8px;
	margin-top: 16px;
`

const EmptyState = styled.div`
	text-align: center;
	padding: 20px;
	color: var(--vscode-descriptionForeground);
	border: 1px dashed var(--vscode-panel-border);
	border-radius: 4px;
`

const FileUploadIndicator = styled.span`
	margin-left: 10px;
	color: var(--vscode-terminal-ansiGreen);
`

const FilePathLabel = styled.span`
	display: inline-block;
	margin-left: 10px;
	font-size: 12px;
	color: var(--vscode-descriptionForeground);

	.codicon {
		margin-right: 4px;
	}
`

const FileUploadContainer = styled.div`
	display: flex;
	align-items: center;
	justify-content: space-between;
	flex-wrap: wrap;
	gap: 10px;
`

const Footer = styled.div`
	text-align: center;
	color: var(--vscode-descriptionForeground);
	font-size: 12px;
	line-height: 1.2;
	padding: 0 8px 15px 0;
	margin-top: auto;

	p {
		word-wrap: break-word;
		margin: 0;
		padding: 0;
	}

	.version {
		font-style: italic;
		margin: 10px 0 0 0;
	}
`

export default memo(ExpertsView)
