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

	// Handle messages from VSCode (keeping other message handling)
	useEffect(() => {
		const messageHandler = (event: MessageEvent) => {
			const message = event.data

			// Keep other message handling (not related to file upload)
			// File upload is now handled directly in the component
		}

		window.addEventListener("message", messageHandler)

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
	}

	// Handle expert selection and unselection
	const handleSelectExpert = (expert: ExpertData) => {
		// If the expert is already selected, unselect it
		if (selectedExpert && selectedExpert.id === expert.id) {
			resetForm() // This will clear the form and set selectedExpert to null
			return
		}

		// Otherwise, select the expert
		setSelectedExpert(expert)
		setNewExpertName(expert.name)
		setNewExpertPrompt(expert.prompt)
		setIsFileUploaded(expert.fileUpload || false)
		setUploadedFilePath(expert.filePath || "")

		// Set form mode based on whether the expert is default or custom
		if (expert.isDefault) {
			setIsFormReadOnly(true)
			setFormMode("view")
		} else {
			setIsFormReadOnly(false)
			setFormMode("edit")
		}
	}

	// Handle saving an expert (new or edited)
	const handleSaveExpert = () => {
		if (!newExpertName.trim()) {
			vscode.postMessage({
				type: "newTask",
				text: "Expert name cannot be empty",
			})
			return
		}

		if (!newExpertPrompt.trim() && !isFileUploaded) {
			vscode.postMessage({
				type: "newTask",
				text: "Expert prompt cannot be empty",
			})
			return
		}

		// Only allow editing custom experts
		if (selectedExpert && selectedExpert.isDefault) {
			vscode.postMessage({
				type: "newTask",
				text: "Default experts cannot be modified",
			})
			return
		}

		if (selectedExpert && !selectedExpert.isDefault) {
			// Update existing custom expert
			const updatedExpert = {
				...selectedExpert,
				name: newExpertName,
				prompt: newExpertPrompt,
				fileUpload: isFileUploaded,
				filePath: uploadedFilePath,
			}

			// In a real implementation, this would save to the file system
			vscode.postMessage({
				type: "selectImages",
				text: JSON.stringify(updatedExpert),
			})

			setExperts(experts.map((expert) => (expert.id === selectedExpert.id ? updatedExpert : expert)))
		} else {
			// Create new expert
			const newExpert: ExpertData = {
				id: Date.now().toString(),
				name: newExpertName,
				prompt: newExpertPrompt,
				isDefault: false,
				fileUpload: isFileUploaded,
				filePath: uploadedFilePath,
			}

			// In a real implementation, this would save to the file system
			vscode.postMessage({
				type: "selectImages",
				text: JSON.stringify(newExpert),
			})

			setExperts([...experts, newExpert])
		}

		resetForm()
	}

	// Handle file upload
	const handleFileUpload = () => {
		// Trigger the hidden file input
		if (fileInputRef.current) {
			fileInputRef.current.click()
		}
	}

	// Handle removing uploaded file
	const handleRemoveFile = () => {
		setIsFileUploaded(false)
		setUploadedFilePath("")
		setNewExpertPrompt("") // Clear the prompt content when file is removed
	}

	// Handle expert deletion
	const handleDeleteExpert = (expertId: string) => {
		const expertToDelete = experts.find((expert) => expert.id === expertId)

		if (expertToDelete && !expertToDelete.isDefault) {
			// In a real implementation, this would delete from the file system
			vscode.postMessage({
				type: "selectImages",
				text: `delete:${expertId}`,
			})

			setExperts(experts.filter((expert) => expert.id !== expertId))

			if (selectedExpert && selectedExpert.id === expertId) {
				resetForm()
			}
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
					<ExpertsList>
						{experts
							.filter((expert) => expert.isDefault)
							.map((expert) => (
								<VSCodeButton
									key={expert.id}
									appearance={selectedExpert?.id === expert.id ? "primary" : "secondary"}
									onClick={() => handleSelectExpert(expert)}
									style={{
										width: "100%",
										marginBottom: "2px",
										textOverflow: "ellipsis",
										overflow: "hidden",
									}}>
									{expert.name}
								</VSCodeButton>
							))}
					</ExpertsList>
				</Section>

				<Section>
					<SectionHeader>Custom Experts</SectionHeader>
					<ExpertsList>
						{experts.filter((expert) => !expert.isDefault).length > 0 ? (
							experts
								.filter((expert) => !expert.isDefault)
								.map((expert) => (
									<div key={expert.id} style={{ position: "relative", width: "100%" }}>
										<VSCodeButton
											appearance={selectedExpert?.id === expert.id ? "primary" : "secondary"}
											onClick={() => handleSelectExpert(expert)}
											style={{
												width: "100%",
												marginBottom: "2px",
												paddingRight: "28px", // Make room for delete button
												textOverflow: "ellipsis",
												overflow: "hidden",
											}}>
											{expert.name}
										</VSCodeButton>
										<VSCodeButton
											appearance="icon"
											onClick={(e: React.MouseEvent) => {
												e.stopPropagation()
												handleDeleteExpert(expert.id)
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
					<SectionHeader>
						{formMode === "view"
							? `Viewing ${selectedExpert?.name}`
							: formMode === "edit"
								? `Edit ${selectedExpert?.name}`
								: "Add New Expert"}
					</SectionHeader>
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
						</FormGroup>

						<FormGroup>
							<label htmlFor="expert-prompt">
								Prompt
								{isFileUploaded && (
									<FilePathLabel>
										<span className="codicon codicon-file"></span>
										{uploadedFilePath}
									</FilePathLabel>
								)}
							</label>
							<VSCodeTextArea
								id="expert-prompt"
								value={newExpertPrompt}
								onChange={(e) => setNewExpertPrompt((e.target as HTMLTextAreaElement).value)}
								placeholder="Enter expert prompt"
								rows={6}
								disabled={isFormReadOnly || isFileUploaded}
								style={{ width: "100%" }}
							/>
							<p className="description-text">
								This prompt will replace the default HAI prompt when this expert is selected.
							</p>
						</FormGroup>

						{!isFormReadOnly && (
							<FormGroup>
								{isFileUploaded ? (
									<FileUploadContainer>
										<FileUploadIndicator>
											<span className="codicon codicon-check"></span>
											File uploaded
										</FileUploadIndicator>
										<VSCodeButton appearance="secondary" onClick={handleRemoveFile}>
											<span className="codicon codicon-close" style={{ marginRight: "5px" }}></span>
											Remove File
										</VSCodeButton>
									</FileUploadContainer>
								) : (
									<VSCodeButton appearance="secondary" onClick={handleFileUpload}>
										<span className="codicon codicon-cloud-upload" style={{ marginRight: "5px" }}></span>
										Upload Prompt File
									</VSCodeButton>
								)}
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
