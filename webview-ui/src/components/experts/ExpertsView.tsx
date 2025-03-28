import React, { useState, useEffect, memo } from "react"
import styled from "styled-components"
import { VSCodeButton, VSCodeTextField, VSCodeTextArea } from "@vscode/webview-ui-toolkit/react"
import { vscode } from "../../utils/vscode"
import { DEFAULT_EXPERTS } from "../../data/defaultExperts"
import { ExpertData } from "../../types/experts"

interface ExpertsViewProps {
	onDone: () => void
}

const ExpertsView: React.FC<ExpertsViewProps> = ({ onDone }) => {
	const [experts, setExperts] = useState<ExpertData[]>(DEFAULT_EXPERTS)
	const [selectedExpert, setSelectedExpert] = useState<ExpertData | null>(null)
	const [newExpertName, setNewExpertName] = useState("")
	const [newExpertPrompt, setNewExpertPrompt] = useState("")
	const [isFileUploaded, setIsFileUploaded] = useState(false)
	const [isFormReadOnly, setIsFormReadOnly] = useState(false)
	const [nameError, setNameError] = useState<string | null>(null)
	const [expertInDeleteConfirmation, setExpertInDeleteConfirmation] = useState<string | null>(null)

	// Create a reference to the file input element
	const fileInputRef = React.useRef<HTMLInputElement>(null)

	// Handle file selection
	const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0]
		if (!file) return

		// Store the file path
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
		setSelectedExpert(null)
		setIsFormReadOnly(false)
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
			name: newExpertName.trim(),
			prompt: newExpertPrompt.trim(),
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
				type: "deleteExpert",
				text: expertName.trim(),
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
				text: expertName.trim(),
				category: "viewExpert",
				isDefault: expertToOpen.isDefault,
				prompt: expertToOpen.isDefault ? expertToOpen.prompt : undefined,
			})
		}
	}

	return (
		<Container>
			{/* Hidden file input for markdown files */}
			<input type="file" ref={fileInputRef} accept=".md" onChange={handleFileSelect} style={{ display: "none" }} />

			<Header>
				<h3>EXPERTS</h3>
			</Header>

			<Content>
				<Section>
					<SectionHeader>
						HAI Experts <CountBadge>({experts.filter((expert) => expert.isDefault).length})</CountBadge>
					</SectionHeader>
					<DefaultExpertsContainer>
						<ExpertGrid>
							{experts
								.filter((expert) => expert.isDefault)
								.map((expert) => (
									<ExpertCard
										key={expert.name}
										className={selectedExpert?.name === expert.name ? "selected" : ""}
										onClick={() => handleOpenExpertPrompt(expert.name)}>
										<IconContainer>
											{expert.iconComponent ? (
												<expert.iconComponent width="24" height="24" />
											) : (
												<span className="codicon codicon-person" />
											)}
										</IconContainer>
										<ExpertName>{expert.name}</ExpertName>
									</ExpertCard>
								))}
						</ExpertGrid>
					</DefaultExpertsContainer>
				</Section>

				<Section>
					<SectionHeader>
						Custom Experts <CountBadge>({experts.filter((expert) => !expert.isDefault).length})</CountBadge>
					</SectionHeader>
					<CustomExpertsContainer>
						<ExpertsList>
							{experts.filter((expert) => !expert.isDefault).length > 0 ? (
								experts
									.filter((expert) => !expert.isDefault)
									.map((expert) => (
										<div key={expert.name} style={{ position: "relative", width: "100%" }}>
											<VSCodeButton
												appearance="secondary"
												onClick={() => handleSelectExpert(expert)}
												style={{
													width: "100%",
													marginBottom: "2px",
													textOverflow: "ellipsis",
													overflow: "hidden",
													cursor: "default",
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
					</CustomExpertsContainer>
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
								These guidelines will override the default HAI guidelines when this expert is selected.
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
	box-sizing: border-box;
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
	padding-right: 8px;
	padding-bottom: 24px;
	display: flex;
	flex-direction: column;
	overflow-y: auto;
	gap: 12px; /* Add consistent gap between sections */
	justify-content: flex-start; /* Align sections at the top */
`

const Section = styled.section`
	width: 100%;
	display: flex;
	flex-direction: column;
`

const SectionHeader = styled.h3`
	margin-bottom: 10px;
`

const ScrollableContainer = styled.div`
	min-height: 50px;
	max-height: 200px;
	overflow-y: auto;
	padding: 5px;
	height: auto;

	/* Hide scrollbar */
	&::-webkit-scrollbar {
		display: none;
	}

	-ms-overflow-style: none; /* IE and Edge */
	scrollbar-width: none; /* Firefox */
`

const DefaultExpertsContainer = styled(ScrollableContainer)`
	/* Dynamic height based on content with max height for scrolling */
	max-height: 160px;
	height: auto;
`

const CustomExpertsContainer = styled(ScrollableContainer)`
	/* Dynamic height based on content with max height for scrolling */
	max-height: 135px;
	height: auto;
`

const ExpertsList = styled.div`
	display: flex;
	flex-direction: column;
	gap: 8px;
	width: 100%;
`

// Expert grid with 2 columns and dynamic rows based on content
const ExpertGrid = styled.div`
	display: grid;
	grid-template-columns: repeat(2, 1fr);
	gap: 16px;
	width: 100%;
	/* Grid will expand naturally based on content */
`

const ExpertCard = styled.div`
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	padding: 8px 12px;
	background-color: var(--vscode-editor-background);
	border: 1px solid var(--vscode-panel-border);
	border-radius: 4px;
	cursor: pointer;
	transition: background-color 0.2s;
	min-height: 54px;

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

const FormContainer = styled.div`
	border: 1px solid var(--vscode-panel-border);
	border-radius: 4px;
	padding: 16px;
	background-color: var(--vscode-editor-background);
	width: 100%;
	box-sizing: border-box;
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

const CountBadge = styled.span`
	font-size: 0.85em;
	opacity: 0.7;
	font-weight: normal;
	margin-left: 6px;
	color: var(--vscode-descriptionForeground);
`

export default memo(ExpertsView)
