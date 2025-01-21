import { VSCodeButton, VSCodeCheckbox, VSCodeTextArea } from "@vscode/webview-ui-toolkit/react"
import { memo, useEffect, useState } from "react"
import { useExtensionState } from "../../context/ExtensionStateContext"
import { validateApiConfiguration, validateEmbeddingConfiguration, validateModelId } from "../../utils/validate"
import { vscode } from "../../utils/vscode"
import ApiOptions from "./ApiOptions"
import SettingsViewExtra from "./SettingsViewExtra"
import EmbeddingOptions from "./EmbeddingOptions"
import { ACCEPTED_FILE_EXTENSIONS } from "../../utils/constants"
import { HaiInstructionFile } from "../../../../src/shared/customApi"

const IS_DEV = true // FIXME: use flags when packaging

type SettingsViewProps = {
	onDone: () => void
}

const SettingsView = ({ onDone }: SettingsViewProps) => {
	const {
		apiConfiguration,
		version,
		customInstructions,
		setCustomInstructions,
		alwaysAllowReadOnly,
		setAlwaysAllowReadOnly,
		openRouterModels,
		buildContextOptions,
		setBuildContextOptions,
		buildIndexProgress,
		embeddingConfiguration,
		fileInstructions,
		setFileInstructions
	} = useExtensionState()
	const [apiErrorMessage, setApiErrorMessage] = useState<string | undefined>(undefined)
	const [modelIdErrorMessage, setModelIdErrorMessage] = useState<string | undefined>(undefined)
	const [embeddingErrorMessage, setEmbeddingErrorMessage] = useState<string | undefined>(undefined)
	const [showCopied, setShowCopied] = useState(false);
	const [trashClickedFiles, setTrashClickedFiles] = useState<Set<string>>(new Set());

    const toggleTrashClicked = (filename: string) => {
        setTrashClickedFiles(prev => {
            const newSet = new Set(prev);
            if (newSet.has(filename)) {
                newSet.delete(filename);
            } else {
                newSet.add(filename);
            }
            return newSet;
        });
    };

    useEffect(() => {
        setApiErrorMessage(undefined)
        setModelIdErrorMessage(undefined)
        setEmbeddingErrorMessage(undefined)
    }, [apiConfiguration, embeddingConfiguration])

	const handleSubmit = () => {
		const apiValidationResult = validateApiConfiguration(apiConfiguration)
		const modelIdValidationResult = validateModelId(apiConfiguration, openRouterModels)
		const embeddingValidationResult = validateEmbeddingConfiguration(embeddingConfiguration)

		setApiErrorMessage(apiValidationResult)
		setEmbeddingErrorMessage(embeddingValidationResult)

		if (!apiValidationResult && !modelIdValidationResult) {
			vscode.postMessage({ type: "apiConfiguration", apiConfiguration })
			vscode.postMessage({ type: "alwaysAllowReadOnly", bool: alwaysAllowReadOnly })
			vscode.postMessage({ type: "buildContextOptions", buildContextOptions: buildContextOptions })
			vscode.postMessage({ type: "embeddingConfiguration", embeddingConfiguration })
			vscode.postMessage({ type: "customInstructions", text: customInstructions });
			onDone()
		}
	}

	const [fileInput, setFileInput] = useState<HaiInstructionFile[]>([]);

	const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
		if (e.target.files) {
			const newFiles = Array.from(e.target.files);
			const existingFiles = new Set(fileInstructions?.map(file => file.name));
			for (const file of newFiles) {
				const fileExtension = file.name.split('.').pop()?.toLowerCase();

				if ((!fileExtension || !ACCEPTED_FILE_EXTENSIONS.includes(fileExtension))) {
					vscode.postMessage({
						type: "showToast",
						toast: {
							message: "Only markdown files are supported",
							toastType: "warning",
						}
					});
					return;
				}
		
				if (existingFiles.has(file.name)) {
					vscode.postMessage({
						type: "showToast",
						toast: {
							message: `${file.name} already exists. Please upload a different file.`,
							toastType: "warning",
						}
					});
					return;
				}
	
				const content = await new Promise<string>((resolve) => {
					const reader = new FileReader();
					reader.onload = () => {
						if (typeof reader.result === "string") {
							resolve(reader.result);
						}
					};
					reader.readAsText(file);
				});
	
				fileInput.push({
					name: file.name,
					content: content,
					enabled: false
				});
				setFileInput(fileInput)
			}
	
			if (fileInput.length > 0) {
				vscode.postMessage({
					type: "uploadInstruction",
					fileInstructions: fileInput
				});
	
				vscode.postMessage({
					type: "showToast",
					toast: {
						message: `${fileInput.length} files uploaded successfully`,
						toastType: "info"
					}
				});
			}
		}
		setFileInput([])
		e.target.value = '';
	};

    const handleDeleteFile = (filename: string) => {
		vscode.postMessage({
			type: "deleteInstruction",
			text: filename
		});
		
		let newFileInstructions = fileInstructions?.filter(file => file.name !== filename);
		if (newFileInstructions){
			setFileInstructions(newFileInstructions);
		}
    };

	const handleResetState = () => {
		vscode.postMessage({ type: "resetState" })
	}

	const handleCopy = () => {
		navigator.clipboard.writeText(JSON.stringify({ buildContextOptions, buildIndexProgress, apiConfiguration, embeddingConfiguration }, null, 2));
		setShowCopied(true);
		setTimeout(() => setShowCopied(false), 2000);
	};

	return (
		<div
			style={{
				position: "fixed",
				top: 0,
				left: 0,
				right: 0,
				bottom: 0,
				padding: "10px 0px 0px 20px",
				display: "flex",
				flexDirection: "column",
				overflow: "hidden",
			}}>
			<div
				style={{
					display: "flex",
					justifyContent: "space-between",
					alignItems: "center",
					marginBottom: "17px",
					paddingRight: 17,
				}}>
				<h3 style={{ color: "var(--vscode-foreground)", margin: 0 }}>Settings</h3>
				<VSCodeButton onClick={handleSubmit}>Done</VSCodeButton>
			</div>
			<div
				style={{ flexGrow: 1, overflowY: "scroll", paddingRight: 8, display: "flex", flexDirection: "column" }}>
				<div style={{ marginBottom: 10 }}>
					<h3 style={{ marginBottom: 5 }}>LLM API Configuration</h3>
					<ApiOptions
						showModelOptions={true}
						apiErrorMessage={apiErrorMessage}
						modelIdErrorMessage={modelIdErrorMessage}
					/>
				</div>

				<div style={{ marginBottom: 10 }}>
					<h3 style={{ marginBottom: 5 }}>Embedding Configuration</h3>
					<EmbeddingOptions showModelOptions={true} errorMessage={embeddingErrorMessage} />
				</div>

				<div style={{ marginBottom: 5 }}>
					<VSCodeTextArea
						value={customInstructions ?? ""}
						style={{ width: "100%", marginTop: 15 }}
						rows={4}
						placeholder={
							'e.g. "Run unit tests at the end", "Use TypeScript with async/await", "Speak in Spanish"'
						}
						onInput={(e: any) => setCustomInstructions(e.target?.value ?? "")}>
						<span style={{ fontWeight: "500" }}>Custom Instructions</span>
					</VSCodeTextArea>
					<p style={{
							fontSize: "12px",
							marginTop: "5px",
							color: "var(--vscode-descriptionForeground)",
						}}>
						These default instructions are added to the end of the system prompt sent with every request.
					</p>
                    <VSCodeButton
                        style={{
                            width: "100%",
                            marginTop: "10px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                        }}
                        onClick={() => document.getElementById('fileInput')?.click()}
                    >
                        <span className="codicon codicon-add" style={{ marginRight: "5px" }}></span>
                        Upload Instruction File
                    </VSCodeButton>
                    <input
                        id="fileInput"
                        type="file"
                        accept=".md"
                        style={{ display: 'none' }}
                        onChange={handleFileUpload}
                        multiple
                    />

                    {fileInstructions && (fileInstructions.length) > 0 && (
                        <div style={{ marginTop: "10px", display: "flex", flexDirection: "column", gap: "5px" }}>
                            {fileInstructions.map((file) => (
                                <div
                                    key={file.name}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        padding: '8px',
                                        backgroundColor: 'var(--vscode-input-background)',
                                        borderRadius: '3px',
                                        color: 'var(--vscode-foreground)',
                                        opacity: 0.6
                                    }}
                                >
                                    <span style={{
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap',
                                        marginRight: '10px'
                                    }}>
                                        {file.name}
                                    </span>
                                    {!trashClickedFiles.has(file.name) ? (
                                        <VSCodeButton
                                            appearance="icon"
                                            onClick={() => toggleTrashClicked(file.name)}
                                        >
                                            <span className="codicon codicon-trash"></span>
                                        </VSCodeButton>
                                    ) : (
                                        <div style={{ display: 'flex', gap: '4px' }}>
                                            <VSCodeButton
                                                appearance="icon"
                                                onClick={() => toggleTrashClicked(file.name)}
                                            >
                                                <span className="codicon codicon-close"></span>
                                            </VSCodeButton>
                                            <VSCodeButton
                                                appearance="icon"
                                                onClick={() => {
                                                    handleDeleteFile(file.name);
                                                    toggleTrashClicked(file.name);
                                                }}
                                            >
                                                <span className="codicon codicon-check"></span>
                                            </VSCodeButton>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}

                    <p style={{
							fontSize: "12px",
							marginTop: "5px",
							color: "var(--vscode-descriptionForeground)",
						}}>
						This supports uploading markdown (.md) files of instructions to be followed by the LLM ex. Coding conventions, task chat histories etc. The content will be appended to the end of the system prompt sent with every request. Additionally, to maintain a global file of instructions, create a .hairules file and have your instructions there.
					</p>
				</div>

				<div style={{ marginBottom: 5 }}>
					<VSCodeCheckbox
						checked={alwaysAllowReadOnly}
						onChange={(e: any) => setAlwaysAllowReadOnly(e.target.checked)}>
						<span style={{ fontWeight: "500" }}>Always approve read-only operations</span>
					</VSCodeCheckbox>
					<p
						style={{
							fontSize: "12px",
							marginTop: "5px",
							color: "var(--vscode-descriptionForeground)",
						}}>
						When enabled, HAI will automatically view directory contents and read files without requiring
						you to click the Approve button.
					</p>
				</div>

				<SettingsViewExtra
					setBuildContextOptions={setBuildContextOptions}
					buildContextOptions={buildContextOptions}
				/>

				{IS_DEV && (
					<>
						<div style={{ marginTop: "10px", marginBottom: "4px" }}>Debug</div>
						<VSCodeButton onClick={handleResetState} style={{ marginTop: "5px", width: "auto" }}>
							Reset State
						</VSCodeButton>
						<p
							style={{
								fontSize: "12px",
								marginTop: "5px",
								color: "var(--vscode-descriptionForeground)",
							}}>
							This will reset all global state and secret storage in the extension.
						</p>
						<div style={{ position: 'relative' }}>
							<VSCodeButton
								style={{ position: 'absolute', top: '24px', right: '18px', padding: "4px 8px",}}
								onClick={handleCopy}
								appearance="icon"
							>
								<span className="codicon codicon-copy" style={{marginRight: '4px'}}></span>
								{showCopied ? 'Copied!' : 'Copy'}
							</VSCodeButton>
							<pre style={{ color: "#e8912d", backgroundColor: "#2b2d30", padding: "10px", borderRadius: "5px", border: "2px solid #333", whiteSpace: "pre-wrap", wordWrap: "break-word", overflowWrap: "break-word"  }}>
								{JSON.stringify({ buildContextOptions, buildIndexProgress, apiConfiguration, embeddingConfiguration, fileInstructions }, null, 2)}
							</pre>
						</div>
					</>
				)}

				<div
					style={{
						textAlign: "center",
						color: "var(--vscode-descriptionForeground)",
						fontSize: "12px",
						lineHeight: "1.2",
						marginTop: "auto",
						padding: "10px 8px 15px 0px",
					}}>
					<p style={{ fontStyle: "italic", margin: "10px 0 0 0", padding: 0 }}>v{version}</p>
				</div>
			</div>
		</div>
	)
}

export default memo(SettingsView)