import React, { memo, PropsWithChildren } from "react"
import Alert from "../common/Alert"
import { useExtensionState } from "../../context/ExtensionStateContext"

type CodeIndexWarningProps = {
	style?: React.CSSProperties
	expanded?: boolean
	type: "success" | "info" | "warning" | "error"
}

const CodeIndexWarning: React.FC<PropsWithChildren<CodeIndexWarningProps>> = ({ type, style, expanded }) => {
	const { buildIndexProgress, buildContextOptions } = useExtensionState()
	return (
		<>
			{buildContextOptions?.useIndex &&
				buildIndexProgress?.isInProgress &&
				!buildIndexProgress.isCodeIndexEverCompleted && (
					<div style={style}>
						<Alert expanded={expanded} type={type}>
							<div>
								{`hai Build is performing the code  ${buildIndexProgress.type === "codeContext" ? "context addition " : "indexing"} process ${buildIndexProgress.progress}% completed. Please wait until the process is complete, else unintended results could be encountered.`}
							</div>
						</Alert>
					</div>
				)}
		</>
	)
}

export default memo(CodeIndexWarning)
