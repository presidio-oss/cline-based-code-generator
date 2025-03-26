import React, { useState, useEffect, memo } from "react"
import styled from "styled-components"
import { VSCodeButton, VSCodeTextField, VSCodeTextArea } from "@vscode/webview-ui-toolkit/react"
import { vscode } from "../../utils/vscode"
import { DEFAULT_EXPERTS } from "../../data/defaultExperts"
import { ExpertData } from "../../types/experts"
import { ReactIcon, DotNetIcon, TerraformIcon, GenAIIcon, DefaultIcon } from "../../assets/experts-icon/expertIcons"

interface ExpertsViewProps {
	onDone: () => void
}

const ExpertsView: React.FC<ExpertsViewProps> = ({ onDone }) => {
	const [experts, setExperts] = useState<ExpertData[]>(DEFAULT_EXPERTS)
	const [selectedExpert, setSelectedExpert] = useState<ExpertData | null>(null)
	const [newExpertName, setNewExpertName] = useState("")
	const [newExpertPrompt, setNewExpertPrompt] = useState("")
	const [isFileUploaded, setIsFileUploaded] = useState(false)
	const [uploadedFilePath, setUploadedFilePath] = useState<string>("")
	const [isFormReadOnly, setIsFormReadOnly] = useState(false)
	const [formMode, setFormMode] = useState<"view" | "edit" | "create">("create")
	const [nameError, setNameError] = useState<string | null>(null)
	const [expertInDeleteConfirmation, setExpertInDeleteConfirmation] = useState<string | null>(null)

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

	// Initiate delete confirmation
	const handleDeleteConfirmation = (expertName: string, e: React.MouseEvent) => {
		e.stopPropagation()
		setExpertInDeleteConfirmation(expertName)
	}

	// Handle expert deletion when confirmed
	const confirmDelete = (expertName: string, e: React.MouseEvent) => {
		e.stopPropagation()

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

		// Reset confirmation state
		setExpertInDeleteConfirmation(null)
	}

	// Cancel deletion
	const cancelDelete = (e: React.MouseEvent) => {
		e.stopPropagation()
		setExpertInDeleteConfirmation(null)
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
			case "react":
				return <ReactIcon />
			case ".net":
				return <DotNetIcon />
			case "terraform":
				return <TerraformIcon />
			case "genai":
				return <GenAIIcon />
			default:
				// Generic icon for any other expert
				return <DefaultIcon />
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
										{expert.name === expertInDeleteConfirmation ? (
											// Show confirmation buttons
											<>
												<VSCodeButton
													appearance="icon"
													onClick={(e) => cancelDelete(e)}
													style={{
														position: "absolute",
														right: "38px",
														top: "50%",
														transform: "translateY(-50%)",
														minWidth: "20px",
														height: "20px",
														padding: 0,
													}}>
													<span className="codicon codicon-close"></span>
												</VSCodeButton>
												<VSCodeButton
													appearance="icon"
													onClick={(e) => confirmDelete(expert.name, e)}
													style={{
														position: "absolute",
														right: "68px",
														top: "50%",
														transform: "translateY(-50%)",
														minWidth: "20px",
														height: "20px",
														padding: 0,
													}}>
													<span className="codicon codicon-check"></span>
												</VSCodeButton>
											</>
										) : (
											// Show regular delete button
											<VSCodeButton
												appearance="icon"
												onClick={(e) => handleDeleteConfirmation(expert.name, e)}
												style={{
													position: "absolute",
													right: "38px",
													top: "50%",
													transform: "translateY(-50%)",
													minWidth: "20px",
													height: "20px",
													padding: 0,
												}}>
												<span className="codicon codicon-trash"></span>
											</VSCodeButton>
										)}
										<VSCodeButton
											appearance="icon"
											onClick={(e: React.MouseEvent) => {
												e.stopPropagation()
												handleOpenExpertPrompt(expert.name)
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
											<span className="codicon codicon-link-external"></span>
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
							<label htmlFor="expert-prompt">GuideLines</label>
							<VSCodeTextArea
								id="expert-prompt"
								value={newExpertPrompt}
								onChange={(e) => setNewExpertPrompt((e.target as HTMLTextAreaElement).value)}
								placeholder="Enter Expert Guidelines"
								resize="vertical"
								rows={6}
								disabled={isFormReadOnly}
								style={{ width: "100%" }}
							/>
							<p className="description-text">
								This guidelines will replace the default HAI guidelines when this expert is selected.
							</p>
						</FormGroup>

						{!isFormReadOnly && (
							<FormGroup>
								<VSCodeButton appearance="secondary" onClick={handleFileUpload}>
									<span className="codicon codicon-cloud-upload" style={{ marginRight: "5px" }}></span>
									Upload Guidelines File (.md only)
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

export default memo(ExpertsView)
