import React, { useState, useEffect, memo, useMemo } from "react"
import styled from "styled-components"
import {
	VSCodeButton,
	VSCodeTextField,
	VSCodeTextArea,
	VSCodeProgressRing,
	VSCodeCheckbox,
} from "@vscode/webview-ui-toolkit/react"
import { vscode } from "../../utils/vscode"
import { DocumentLink, DocumentStatus, ExpertData } from "../../../../src/shared/experts"
import { useExtensionState } from "../../context/ExtensionStateContext"
import { capitalizeFirstLetter, formatTimestamp } from "../../utils/format"

interface ExpertsViewProps {
	onDone: () => void
}

const ExpertsView: React.FC<ExpertsViewProps> = ({ onDone }) => {
	const [defaultExperts, setDefaultExperts] = useState<ExpertData[]>([])
	const [customExperts, setCustomExperts] = useState<ExpertData[]>([])
	const [selectedExpert, setSelectedExpert] = useState<ExpertData | null>(null)
	const [newExpertName, setNewExpertName] = useState("")
	const [newExpertPrompt, setNewExpertPrompt] = useState("")
	const [documentLink, setDocumentLink] = useState("")
	const [documentLinks, setDocumentLinks] = useState<DocumentLink[]>([])
	const [documentLinkError, setDocumentLinkError] = useState<string | null>(null)
	const [inlineDocLinkError, setInlineDocLinkError] = useState<string | null>(null)
	const [nameError, setNameError] = useState<string | null>(null)
	const [isFileUploaded, setIsFileUploaded] = useState(false)
	const [isFormReadOnly, setIsFormReadOnly] = useState(false)
	const [expertInDeleteConfirmation, setExpertInDeleteConfirmation] = useState<string | null>(null)
	const [expandedExperts, setExpandedExperts] = useState<{ [key: string]: boolean }>({})
	const [documentLinkInDeleteConfirmation, setDocumentLinkInDeleteConfirmation] = useState<{
		expertName: string
		linkUrl: string
	} | null>(null)

	const [inlineEditingDoc, setInlineEditingDoc] = useState<{
		expertName: string
		linkUrl: string
	} | null>(null)
	const [deepCrawl, setDeepCrawl] = useState(false)
	const [maxDepth, setMaxDepth] = useState(10)
	const [maxPages, setMaxPages] = useState(20)
	const [crawlTimeout, setCrawlTimeout] = useState(10_0000)
	const [isEmbeddingValid, setIsEmbeddingValid] = useState<boolean | null>(null)
	const { vscodeWorkspacePath, embeddingConfiguration } = useExtensionState()
	const fileInputRef = React.useRef<HTMLInputElement>(null)

	const allExperts = useMemo(() => [...defaultExperts, ...customExperts], [defaultExperts, customExperts])

	useEffect(() => {
		const messageHandler = (event: MessageEvent) => {
			const message = event.data

			switch (message.type) {
				case "defaultExpertsLoaded":
					if (message.experts) {
						setDefaultExperts(message.experts)
					}
					break

				case "expertsUpdated":
					if (message.experts) {
						setCustomExperts(message.experts)
					}
					break
				case "embeddingConfigValidation":
					setIsEmbeddingValid(!!message.bool)
					break

				default:
					console.warn(`Unhandled message type: ${message.type}`)
			}
		}
		window.addEventListener("message", messageHandler)
		vscode.postMessage({ type: "loadDefaultExperts" })
		vscode.postMessage({ type: "loadExperts" })
		vscode.postMessage({ type: "validateEmbeddingConfig", embeddingConfiguration })
		return () => {
			window.removeEventListener("message", messageHandler)
		}
	}, [])

	const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0]
		if (!file) return
		setIsFileUploaded(true)
		const reader = new FileReader()
		reader.onload = (e) => {
			const content = e.target?.result as string
			setNewExpertPrompt(content)
		}
		reader.readAsText(file)
		if (fileInputRef.current) {
			fileInputRef.current.value = ""
		}
	}

	const toggleAccordionForExpert = (expertName: string) => {
		setExpandedExperts((prev) => {
			const isExpanded = !prev[expertName]
			return { ...prev, [expertName]: isExpanded }
		})
	}

	const resetForm = () => {
		setNewExpertName("")
		setNewExpertPrompt("")
		setDocumentLink("")
		setDocumentLinks([])
		setDocumentLinkError(null)
		setIsFileUploaded(false)
		setSelectedExpert(null)
		setIsFormReadOnly(false)
		setNameError(null)
		setDeepCrawl(false)
		setMaxDepth(10)
		setMaxPages(20)
		setCrawlTimeout(10_0000)
	}

	const handleSelectExpert = (expert: ExpertData) => {
		if (selectedExpert && selectedExpert.name === expert.name) {
			setSelectedExpert(null)
			return
		}
		setSelectedExpert(expert)
		setIsFormReadOnly(false)
	}

	const handleSaveExpert = () => {
		setNameError(null)
		if (!newExpertName.trim()) {
			vscode.postMessage({
				type: "showToast",
				toast: { message: "Expert name cannot be empty", toastType: "error" },
			})
			return
		}
		if (!newExpertPrompt.trim() && !isFileUploaded) {
			vscode.postMessage({
				type: "showToast",
				toast: { message: "Expert prompt cannot be empty", toastType: "error" },
			})
			return
		}

		if (deepCrawl && documentLinks.length === 0) {
			vscode.postMessage({
				type: "showToast",
				toast: { message: "At least one document link is required when DeepCrawl is enabled", toastType: "error" },
			})
			return
		}

		const expertExists = allExperts.some((expert) => expert.name.toLowerCase() === newExpertName.toLowerCase())
		if (expertExists) {
			setNameError("An expert with this name already exists")
			vscode.postMessage({
				type: "showToast",
				toast: { message: "An expert with this name already exists", toastType: "error" },
			})
			return
		}
		const newExpert: ExpertData = {
			name: newExpertName.trim(),
			prompt: newExpertPrompt.trim(),
			isDefault: false,
			createdAt: new Date().toISOString(),
			documentLinks: documentLinks.length > 0 ? documentLinks : undefined,
			deepCrawl: deepCrawl,
			maxDepth: deepCrawl ? maxDepth : undefined,
			maxPages: deepCrawl ? maxPages : undefined,
			crawlTimeout: deepCrawl ? crawlTimeout : undefined,
		}
		vscode.postMessage({
			type: "saveExpert",
			text: JSON.stringify(newExpert),
		})
		setCustomExperts([...customExperts, newExpert])
		resetForm()
	}

	const handleFileUpload = () => {
		if (newExpertPrompt.trim()) {
			vscode.postMessage({
				type: "showToast",
				toast: { message: "Uploading a file will override existing prompt content", toastType: "warning" },
			})
		}
		fileInputRef.current?.click()
	}

	const handleDeleteConfirmation = (expertName: string, e: React.MouseEvent) => {
		e.stopPropagation()
		setExpertInDeleteConfirmation(expertName)
	}

	const confirmDelete = (expertName: string, e: React.MouseEvent) => {
		e.stopPropagation()
		const expertToDelete = customExperts.find((expert) => expert.name === expertName)
		if (expertToDelete && !expertToDelete.isDefault) {
			vscode.postMessage({ type: "deleteExpert", text: expertName.trim() })
			setCustomExperts(customExperts.filter((expert) => expert.name !== expertName))
			if (selectedExpert && selectedExpert.name === expertName) {
				resetForm()
			}
		}
		setExpertInDeleteConfirmation(null)
	}

	const cancelDelete = (e: React.MouseEvent) => {
		e.stopPropagation()
		setExpertInDeleteConfirmation(null)
	}

	const handleOpenExpertPrompt = (expertName: string) => {
		const expertToOpen = allExperts.find((expert) => expert.name === expertName)
		if (expertToOpen) {
			vscode.postMessage({
				type: "viewExpertPrompt",
				text: expertName.trim(),
				isDefault: expertToOpen.isDefault,
				prompt: expertToOpen.isDefault ? expertToOpen.prompt : undefined,
				isDeepCrawlEnabled: expertToOpen.deepCrawl,
			})
		}
	}

	return (
		<Container>
			<input type="file" ref={fileInputRef} accept=".md" onChange={handleFileSelect} style={{ display: "none" }} />
			<Header>
				<h3>EXPERTS</h3>
			</Header>
			<Content>
				{/* Default Experts */}
				<Section>
					<SectionHeader>
						HAI Experts <CountBadge>({defaultExperts.length})</CountBadge>
					</SectionHeader>
					<DefaultExpertsContainer>
						<ExpertGrid>
							{defaultExperts.map((exp) => (
								<ExpertCard key={exp.name} onClick={() => handleOpenExpertPrompt(exp.name)}>
									<IconContainer>
										{exp.iconComponent ? (
											<img src={exp.iconComponent} alt={`${exp.name} icon`} width="24" height="24" />
										) : (
											<span
												className="codicon codicon-person"
												style={{ fontSize: "24px", width: "24px", height: "24px" }}
											/>
										)}
									</IconContainer>
									<ExpertName>{exp.name}</ExpertName>
								</ExpertCard>
							))}
						</ExpertGrid>
					</DefaultExpertsContainer>
				</Section>

				{/* Custom Experts with Document Accordion */}
				<Section>
					<SectionHeader>
						Custom Experts <CountBadge>({customExperts.length})</CountBadge>
					</SectionHeader>
					<CustomExpertsContainer>
						<ExpertsList>
							{customExperts.length > 0 ? (
								customExperts.map((exp) => (
									<div key={exp.name} style={{ width: "100%" }}>
										<ExpertRow>
											<ExpertRowLeftSide>
												<VSCodeButton
													appearance="icon"
													onClick={(e) => {
														e.stopPropagation()
														toggleAccordionForExpert(exp.name)
													}}
													style={{ marginRight: "8px" }}>
													<span
														className={`codicon ${
															expandedExperts[exp.name]
																? "codicon-chevron-down"
																: "codicon-chevron-right"
														}`}
													/>
												</VSCodeButton>
												<span
													style={{
														overflow: "hidden",
														textOverflow: "ellipsis",
														whiteSpace: "nowrap",
														cursor: "pointer",
													}}
													onClick={() => handleSelectExpert(exp)}>
													{exp.name}
												</span>
											</ExpertRowLeftSide>
											<ExpertRowActions>
												{exp.name === expertInDeleteConfirmation ? (
													<>
														<VSCodeButton
															appearance="icon"
															onClick={(e) => cancelDelete(e)}
															style={{ marginRight: "10px" }}>
															<span className="codicon codicon-close" />
														</VSCodeButton>
														<VSCodeButton
															appearance="icon"
															onClick={(e) => confirmDelete(exp.name, e)}
															style={{ marginRight: "10px" }}>
															<span className="codicon codicon-check" />
														</VSCodeButton>
													</>
												) : (
													<VSCodeButton
														appearance="icon"
														onClick={(e) => handleDeleteConfirmation(exp.name, e)}
														style={{ marginRight: "10px" }}>
														<span className="codicon codicon-trash" />
													</VSCodeButton>
												)}
												<VSCodeButton
													appearance="icon"
													onClick={(e) => {
														e.stopPropagation()
														handleOpenExpertPrompt(exp.name)
													}}>
													<span className="codicon codicon-link-external" />
												</VSCodeButton>
											</ExpertRowActions>
										</ExpertRow>
										{expandedExperts[exp.name] && (
											<AccordionContainer>
												{/* Render document links if available */}
												{exp.documentLinks && exp.documentLinks.length > 0
													? exp.documentLinks.map((link, idx) => (
															<DocumentAccordionItem key={idx}>
																{link.status && (
																	<StatusIcon
																		status={link.status}
																		title={capitalizeFirstLetter(link.status)}>
																		{link.status.toLowerCase() ===
																		DocumentStatus.COMPLETED ? (
																			<span className="codicon codicon-check" />
																		) : link.status.toLowerCase() ===
																		  DocumentStatus.FAILED ? (
																			<span className="codicon codicon-error" />
																		) : link.status.toLowerCase() ===
																		  DocumentStatus.PROCESSING ? (
																			<div
																				style={{
																					transform: "scale(0.8)",
																					width: "20px",
																					height: "20px",
																					display: "flex",
																					alignItems: "center",
																					justifyContent: "center",
																				}}>
																				<VSCodeProgressRing />
																			</div>
																		) : (
																			<span className="codicon codicon-clock" />
																		)}
																	</StatusIcon>
																)}
																<DocumentLinkContainer>
																	<DocumentLinkText title={link.url}>
																		{link.url}
																	</DocumentLinkText>
																	{link.processedAt && (
																		<TimestampText>
																			{formatTimestamp(link.processedAt)}
																		</TimestampText>
																	)}
																</DocumentLinkContainer>
																<DocumentButtons>
																	<VSCodeButton
																		appearance="icon"
																		onClick={(e) => {
																			e.stopPropagation()
																			vscode.postMessage({
																				type: "refreshDocumentLink",
																				text: link.url,
																				expert: exp.name,
																			})
																		}}>
																		<span className="codicon codicon-refresh" />
																	</VSCodeButton>
																	{documentLinkInDeleteConfirmation?.expertName === exp.name &&
																	documentLinkInDeleteConfirmation?.linkUrl === link.url ? (
																		<>
																			<VSCodeButton
																				appearance="icon"
																				onClick={(e) => {
																					e.stopPropagation()
																					setDocumentLinkInDeleteConfirmation(null)
																				}}>
																				<span className="codicon codicon-close" />
																			</VSCodeButton>
																			<VSCodeButton
																				appearance="icon"
																				onClick={(e) => {
																					e.stopPropagation()
																					vscode.postMessage({
																						type: "deleteDocumentLink",
																						text: link.url,
																						expert: exp.name,
																					})
																					setDocumentLinkInDeleteConfirmation(null)
																				}}>
																				<span className="codicon codicon-check" />
																			</VSCodeButton>
																		</>
																	) : (
																		<VSCodeButton
																			appearance="icon"
																			onClick={(e) => {
																				e.stopPropagation()
																				setDocumentLinkInDeleteConfirmation({
																					expertName: exp.name,
																					linkUrl: link.url,
																				})
																			}}>
																			<span className="codicon codicon-trash" />
																		</VSCodeButton>
																	)}
																</DocumentButtons>
															</DocumentAccordionItem>
														))
													: null}

												{/* Inline editing for adding a document */}
												{inlineEditingDoc?.expertName === exp.name ? (
													<DocumentAccordionItem>
														<div style={{ display: "flex", flexDirection: "column", flexGrow: 1 }}>
															<VSCodeTextField
																value={inlineEditingDoc.linkUrl}
																placeholder="Enter document link"
																onChange={(e) => {
																	setInlineDocLinkError(null) // Reset error on input change
																	setInlineEditingDoc((prev) =>
																		prev
																			? {
																					...prev,
																					linkUrl: (e.target as HTMLInputElement).value,
																				}
																			: null,
																	)
																}}
																style={{ flexGrow: 1 }}
															/>
															{inlineDocLinkError && (
																<p
																	style={{
																		color: "var(--vscode-errorForeground)",
																		fontSize: "12px",
																		marginTop: "4px",
																	}}>
																	{inlineDocLinkError}
																</p>
															)}
														</div>
														<DocumentButtons>
															<VSCodeButton
																appearance="icon"
																onClick={(e) => {
																	e.stopPropagation()
																	try {
																		const url = new URL(inlineEditingDoc.linkUrl.trim())
																		if (url.protocol !== "https:") {
																			setInlineDocLinkError("Only HTTPS links are allowed")
																			return
																		}
																		if (
																			exp.documentLinks?.some(
																				(link) =>
																					link.url === inlineEditingDoc.linkUrl.trim(),
																			)
																		) {
																			setInlineDocLinkError(
																				"This link has already been added",
																			)
																			return
																		}
																		if (inlineEditingDoc.linkUrl.trim()) {
																			vscode.postMessage({
																				type: "addDocumentLink",
																				text: inlineEditingDoc.linkUrl,
																				expert: exp.name,
																			})
																			setCustomExperts((prevExperts) =>
																				prevExperts.map((expert) =>
																					expert.name === exp.name
																						? {
																								...expert,
																								documentLinks: [
																									...(expert.documentLinks ||
																										[]),
																									{
																										url: inlineEditingDoc.linkUrl,
																										status: DocumentStatus.PENDING,
																									},
																								],
																							}
																						: expert,
																				),
																			)
																		}
																		setInlineEditingDoc(null)
																	} catch (e) {
																		setInlineDocLinkError("Please enter a valid URL")
																	}
																}}>
																<span className="codicon codicon-check" />
															</VSCodeButton>
															<VSCodeButton
																appearance="icon"
																onClick={(e) => {
																	e.stopPropagation()
																	setInlineEditingDoc(null)
																	setInlineDocLinkError(null) // Clear error on cancel
																}}>
																<span className="codicon codicon-close" />
															</VSCodeButton>
														</DocumentButtons>
													</DocumentAccordionItem>
												) : (
													// Show "+ Add Doc" button only if inline editing is not active
													(exp.documentLinks ?? []).length < 3 && (
														<VSCodeButton
															appearance="secondary"
															onClick={() => {
																setInlineEditingDoc({ expertName: exp.name, linkUrl: "" })
																setInlineDocLinkError(null) // Reset error when starting inline editing
															}}
															style={{ width: "100%", marginTop: "8px" }}>
															+ Add Doc
														</VSCodeButton>
													)
												)}
											</AccordionContainer>
										)}
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
				{vscodeWorkspacePath ? (
					<Section>
						<SectionHeader>Add New Expert</SectionHeader>
						<FormContainer>
							<FormGroup>
								<label htmlFor="expert-name">
									Name<span style={{ color: "var(--vscode-errorForeground)" }}>*</span>
								</label>
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
								<label htmlFor="expert-prompt">
									Guidelines<span style={{ color: "var(--vscode-errorForeground)" }}>*</span>
								</label>
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
										<span className="codicon codicon-cloud-upload" style={{ marginRight: "5px" }} />
										Upload Guidelines File (.md only)
									</VSCodeButton>
								</FormGroup>
							)}
							<FormGroup>
								<label htmlFor="document-link">Document Link</label>
								<div style={{ display: "flex", gap: "8px" }}>
									<VSCodeTextField
										id="document-link"
										value={documentLink}
										onChange={(e) => {
											setDocumentLink((e.target as HTMLInputElement).value)
											setDocumentLinkError(null)
										}}
										placeholder="https://example.com/document"
										style={{ flexGrow: 1 }}
										disabled={isFormReadOnly || documentLinks.length >= 3}
									/>
									<VSCodeButton
										appearance="secondary"
										disabled={isFormReadOnly || documentLinks.length >= 3 || !documentLink}
										onClick={() => {
											try {
												const url = new URL(documentLink)
												if (url.protocol !== "https:") {
													setDocumentLinkError("Only HTTPS links are allowed")
													return
												}
												if (documentLinks.some((link) => link.url === documentLink.trim())) {
													setDocumentLinkError("This link has already been added")
													return
												}
												setDocumentLinks([...documentLinks, { url: documentLink.trim() }])
												setDocumentLink("")
											} catch (e) {
												setDocumentLinkError("Please enter a valid URL")
											}
										}}>
										<span className="codicon codicon-add" />
									</VSCodeButton>
								</div>
								{documentLinkError && (
									<p style={{ color: "var(--vscode-errorForeground)", fontSize: "12px", marginTop: "4px" }}>
										{documentLinkError}
									</p>
								)}
								{documentLinks.length >= 3 && (
									<p
										style={{
											color: "var(--vscode-editorWarning-foreground)",
											fontSize: "12px",
											marginTop: "4px",
										}}>
										Maximum of 3 document links allowed
									</p>
								)}
								{documentLinks.length > 0 && (
									<div style={{ marginTop: "8px" }}>
										{documentLinks.map((link, index) => (
											<DocumentLinkItem key={index}>
												<span
													style={{
														overflow: "hidden",
														textOverflow: "ellipsis",
														whiteSpace: "nowrap",
													}}>
													{link.url}
												</span>
												<VSCodeButton
													appearance="icon"
													onClick={() => {
														const newLinks = [...documentLinks]
														newLinks.splice(index, 1)
														setDocumentLinks(newLinks)
													}}
													style={{ minWidth: "20px", height: "20px", padding: 0 }}>
													<span className="codicon codicon-close" />
												</VSCodeButton>
											</DocumentLinkItem>
										))}
									</div>
								)}
							</FormGroup>
							<FormGroup>
								<VSCodeCheckbox
									checked={deepCrawl}
									onChange={(e) => setDeepCrawl((e.target as HTMLInputElement).checked)}
									disabled={isFormReadOnly || !isEmbeddingValid}>
									DeepCrawl
								</VSCodeCheckbox>
								<p className="description-text">
									Enabling deep crawl can explore websites beyond a single page by following internal links.
								</p>
							</FormGroup>
							{deepCrawl && (
								<>
									<FormGroup>
										<label htmlFor="max-depth">Link Depth</label>
										<VSCodeTextField
											id="max-depth"
											value={maxDepth.toString()}
											onChange={(e) => setMaxDepth(parseInt((e.target as HTMLInputElement).value) || 10)}
											placeholder="10"
											disabled={isFormReadOnly || !isEmbeddingValid}
											style={{ width: "100%" }}
										/>
										<p className="description-text">Sets the maximum link depth for the crawl.</p>
									</FormGroup>
									<FormGroup>
										<label htmlFor="max-pages">Page Limit</label>
										<VSCodeTextField
											id="max-pages"
											value={maxPages.toString()}
											onChange={(e) => setMaxPages(parseInt((e.target as HTMLInputElement).value) || 20)}
											placeholder="10"
											disabled={isFormReadOnly || !isEmbeddingValid}
											style={{ width: "100%" }}
										/>
										<p className="description-text">Sets the maximum number of unique pages to crawl.</p>
									</FormGroup>
									<FormGroup>
										<label htmlFor="max-timeout">Timeout</label>
										<VSCodeTextField
											id="max-timeout"
											value={crawlTimeout.toString()}
											onChange={(e) =>
												setCrawlTimeout(parseInt((e.target as HTMLInputElement).value) || 10_0000)
											}
											placeholder="10"
											disabled={isFormReadOnly || !isEmbeddingValid}
											style={{ width: "100%" }}
										/>
										<p className="description-text">Sets the crawl timeout for each page.</p>
									</FormGroup>
									{deepCrawl && (
										<div
											className="info-message"
											style={{
												display: "flex",
												alignItems: "flex-start",
												gap: "8px",
												color: "var(--vscode-foreground)",
												fontSize: "12px",
												padding: "8px",
												backgroundColor: "var(--vscode-editorWidget-background)",
												border: "1px solid var(--vscode-widget-border)",
												borderRadius: "4px",
												marginBottom: "16px",
											}}>
											<i
												className="codicon codicon-info"
												style={{
													fontSize: "14px",
													marginTop: "2px",
													color: "var(--vscode-textLink-foreground)",
												}}
											/>
											<span>
												Important: Experts created with specific embedding configurations must use the
												same embedding settings. Using different embeddings will prevent the experts from
												working.
											</span>
										</div>
									)}
								</>
							)}
							{!isEmbeddingValid && (
								<div
									className="warning-message"
									style={{
										display: "flex",
										alignItems: "center",
										gap: "8px",
										color: "var(--vscode-editorWarning-foreground)",
										fontSize: "11px",
									}}>
									<i className="codicon codicon-warning" style={{ fontSize: "14px" }} />
									<span>Valid embedding configuration required for deep crawling</span>
								</div>
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
				) : (
					<Section>
						<SectionHeader>Add New Expert</SectionHeader>
						<EmptyState>
							<div
								style={{
									display: "flex",
									alignItems: "center",
									gap: "8px",
									color: "var(--vscode-editorWarning-foreground)",
									fontSize: "11px",
								}}>
								<i className="codicon codicon-warning" />
								<span>Please open a workspace to add new experts.</span>
							</div>
						</EmptyState>
					</Section>
				)}
			</Content>
		</Container>
	)
}

export default memo(ExpertsView)

/* Styled Components */
const Container = styled.div`
	position: fixed;
	top: 0;
	left: 0;
	right: 0;
	bottom: 0;
	padding: 10px 0 0 20px;
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
	gap: 12px;
`

const Section = styled.section`
	width: 100%;
	display: flex;
	flex-direction: column;
`

const SectionHeader = styled.h3`
	margin-bottom: 10px;
`

const DefaultExpertsContainer = styled.div`
	max-height: 160px;
	overflow-y: auto;
`

const CustomExpertsContainer = styled.div`
	max-height: 250px;
	overflow-y: auto;
`

const ExpertsList = styled.div`
	display: flex;
	flex-direction: column;
	gap: 8px;
	width: 100%;
`

const ExpertGrid = styled.div`
	display: grid;
	grid-template-columns: repeat(2, 1fr);
	gap: 16px;
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

const DocumentLinkItem = styled.div`
	display: flex;
	justify-content: space-between;
	align-items: center;
	padding: 4px 8px;
	margin-bottom: 4px;
	background-color: var(--vscode-editor-background);
	border: 1px solid var(--vscode-panel-border);
	border-radius: 4px;
	font-size: 12px;
`

const ExpertRow = styled.div`
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 4px 8px;
	background-color: var(--vscode-editor-background);
	border: 1px solid var(--vscode-panel-border);
	border-radius: 4px;
`

const ExpertRowLeftSide = styled.div`
	display: flex;
	align-items: center;
	flex-grow: 1;
	overflow: hidden;
`

const ExpertRowActions = styled.div`
	display: flex;
	align-items: center;
`

const AccordionContainer = styled.div`
	margin: 8px 0;
	padding: 8px;
	border: 1px solid var(--vscode-panel-border);
	border-radius: 4px;
	background-color: var(--vscode-editor-background);
`

const DocumentAccordionItem = styled.div`
	display: flex;
	justify-content: space-between;
	align-items: flex-start;
	padding: 4px 8px;
	margin-bottom: 4px;
	border: 1px solid var(--vscode-panel-border);
	border-radius: 4px;
	font-size: 12px;
`

const DocumentLinkContainer = styled.div`
	display: flex;
	flex-direction: column;
	flex-grow: 1;
	overflow: hidden;
`

const DocumentLinkText = styled.div`
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
`

const StatusIcon = styled.span<{ status?: string }>`
	margin-right: 8px;
	font-size: 14px;
	display: flex;
	align-items: center;
	color: ${(props) => {
		switch (props.status?.toLowerCase()) {
			case "completed":
				return "var(--vscode-testing-iconPassed)"
			case "failed":
				return "var(--vscode-testing-iconFailed)"
			default:
				return "var(--vscode-foreground)"
		}
	}};
`

const TimestampText = styled.span`
	font-size: 9px;
	color: var(--vscode-descriptionForeground);
`

const DocumentButtons = styled.div`
	display: flex;
	gap: 4px;
	margin-left: 8px;
`
