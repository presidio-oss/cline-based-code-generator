import React, { useState } from "react"
import { VSCodeButton } from "@vscode/webview-ui-toolkit/react"

interface CopyClipboardProps {
    title: string;
    onCopyContent: () => string;
    onCopyDismiss?: () => void;
    dismissInterval?: number;
}

const CopyClipboard: React.FC<CopyClipboardProps> = ({ title, dismissInterval = 1000, onCopyContent, onCopyDismiss }) => {
    const [icon, setIcon] = useState<string>('codicon-copy');
    const [copied, setCopied] = useState(false);

    const onCopy = () => {
        const content = onCopyContent();

        navigator.clipboard
            .writeText(content)
            .then(() => {
                setCopied(true);
                setIcon('codicon-check');

                setTimeout(() => {
                    setCopied(false);
                    setIcon('codicon-copy');

                    if (onCopyDismiss) onCopyDismiss();
                }, dismissInterval);
            })
            .catch((err) => {
                console.error("Failed to copy content: ", err)
            })
    };

    return (
        <div style={{ position: "relative" }}>
            <VSCodeButton appearance="icon" title={title} onClick={onCopy}>
                <span className={`codicon ${icon}`} style={{ fontSize: 14, cursor: "pointer" }} />
            </VSCodeButton>
            {copied && (
                <div
                    style={{
                        position: "absolute",
                        top: "-30px",
                        left: "50%",
                        transform: "translateX(-50%)",
                        backgroundColor: "var(--vscode-tooltip-background)",
                        color: "var(--vscode-tooltip-foreground)",
                        padding: "4px 8px",
                        borderRadius: 4,
                        fontSize: "12px",
                        boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
                        pointerEvents: "none",
                        whiteSpace: "nowrap",
                    }}>
                    Copied!
                </div>
            )}
        </div>
    )
}

export default CopyClipboard
