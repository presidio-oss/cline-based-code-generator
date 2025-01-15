import { VSCodeButton, VSCodeCheckbox, VSCodeTextArea } from "@vscode/webview-ui-toolkit/react"
import { memo, useEffect, useState } from "react"
import { useExtensionState } from "../../context/ExtensionStateContext"
import { validateApiConfiguration, validateEmbeddingConfiguration, validateModelId } from "../../utils/validate"
import { vscode } from "../../utils/vscode"
import ApiOptions from "./ApiOptions"
import SettingsViewExtra from "./SettingsViewExtra"
import EmbeddingOptions from "./EmbeddingOptions"

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
	} = useExtensionState()
	const [apiErrorMessage, setApiErrorMessage] = useState<string | undefined>(undefined)
	const [modelIdErrorMessage, setModelIdErrorMessage] = useState<string | undefined>(undefined)
	const [embeddingErrorMessage, setEmbeddingErrorMessage] = useState<string | undefined>(undefined)
	const [showCopied, setShowCopied] = useState(false);

	const [uploadedFiles, setUploadedFiles] = useState<string[]>();

    useEffect(() => {
        const messageHandler = (event: MessageEvent) => {
            const message = event.data;
            switch (message.type) {
                case 'existingFiles':
                    setUploadedFiles(message.instructions.map((instruction: any) => (
                        instruction.name
                    )));
                    break;
            }
        };

        window.addEventListener('message', messageHandler);
        return () => window.removeEventListener('message', messageHandler);
    }, []);

    useEffect(() => {
        vscode.postMessage({ type: "getExistingFiles" });
    }, []);

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

		if (!apiValidationResult && !embeddingValidationResult && !modelIdValidationResult) {
			vscode.postMessage({ type: "apiConfiguration", apiConfiguration })
			vscode.postMessage({ type: "alwaysAllowReadOnly", bool: alwaysAllowReadOnly })
			vscode.postMessage({ type: "buildContextOptions", buildContextOptions: buildContextOptions })
			vscode.postMessage({ type: "embeddingConfiguration", embeddingConfiguration })
			vscode.postMessage({ type: "customInstructions", text: customInstructions });
			vscode.postMessage({ type: "getExistingFiles" });
			onDone()
		}
	}

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            for (const file of Array.from(e.target.files)) {
				const fileExtension = file.name.split('.').pop()?.toLowerCase();
				const mimeType = file.type;
		
				if (fileExtension !== 'md' || mimeType !== 'text/markdown') {
					vscode.postMessage({
						type: "showToast",
						toast: {"message": "Only markdown files are supported", "toastType": "error"}
					});
					return;
				}
		
                const reader = new FileReader();
                reader.onload = () => {
                    if (typeof reader.result === "string") {
                        vscode.postMessage({ 
                            type: "uploadInstructions", 
                            text: reader.result, 
                            filename: file.name 
                        });
						setUploadedFiles(prev => [...(prev ?? []), file.name]);
                    }
                };
                reader.readAsText(file);
            }
			vscode.postMessage({
				type: "showToast",
				toast: { "message": `${Array.from(e.target.files).length} files uploaded successfully`, "toastType": "error" }
			});
        }
        e.target.value = '';
    };

    const handleDeleteFile = (filename: string) => {
        vscode.postMessage({
            type: "deleteFile",
            filename: filename
        });
		setUploadedFiles(prev => (prev ?? []).filter(file => file !== filename));
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
                        accept=".txt,.md"
                        style={{ display: 'none' }}
                        onChange={handleFileUpload}
                        multiple
                    />

                    {uploadedFiles && (uploadedFiles.length) > 0 && (
                        <div style={{ marginTop: "10px", display: "flex", flexDirection: "column", gap: "5px" }}>
                            {uploadedFiles.map((file) => (
                                <div
                                    key={file}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        padding: '8px',
                                        backgroundColor: 'var(--vscode-input-background)',
                                        borderRadius: '3px',
                                        color: 'var(--vscode-foreground)',
                                    }}
                                >
                                    <span style={{
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap',
                                        marginRight: '10px'
                                    }}>
                                        {file}
                                    </span>
                                    <VSCodeButton
                                        appearance="icon"
                                        onClick={() => handleDeleteFile(file)}
                                    >
                                        <span className="codicon codicon-close"></span>
                                    </VSCodeButton>
                                </div>
                            ))}
                        </div>
                    )}

                    <p style={{
							fontSize: "12px",
							marginTop: "5px",
							color: "var(--vscode-descriptionForeground)",
						}}>
						These instructions are added to the end of the system prompt sent with every request.
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
								{JSON.stringify({ buildContextOptions, buildIndexProgress, apiConfiguration, embeddingConfiguration }, null, 2)}
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
