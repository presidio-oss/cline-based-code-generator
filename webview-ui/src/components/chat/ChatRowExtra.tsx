import { ClineMessage, ClineSayTool } from "../../../../src/shared/ExtensionMessage"
import CodeAccordian from "../common/CodeAccordian"

interface ChatRowExtraProps {
	headerStyle: React.CSSProperties
	toolIcon: (iconName: string) => React.ReactNode
	message: ClineMessage
	isExpanded: boolean
	onToggleExpand: () => void
	tool: ClineSayTool
}

const ChatRowExtra: React.FC<ChatRowExtraProps> = ({ headerStyle, toolIcon, message, isExpanded, onToggleExpand, tool }) => {
	switch (tool.tool) {
		case "findRelevantFiles":
			return (
				<>
					<div style={headerStyle}>
						{toolIcon("search")}
						<span style={{ fontWeight: "bold" }}>
							{message.type === "ask" ? (
								<>HAI is searching for relevant files in this directory:</>
							) : (
								<>HAI found the following relevant files:</>
							)}
						</span>
					</div>
					{message.type === "ask" ? (
						<>
							<CodeAccordian
								code={tool.content!}
								path={tool.path || ""}
								language="markdown"
								isExpanded={false}
								onToggleExpand={onToggleExpand}
							/>
						</>
					) : (
						<>
							<CodeAccordian
								code={tool.content!}
								path={tool.path || ""}
								language="markdown"
								isExpanded={isExpanded}
								onToggleExpand={onToggleExpand}
							/>
						</>
					)}
				</>
			)
		case "codeSecurityScan":
			return (
				<>
					<div style={headerStyle}>
						{toolIcon("search")}
						<span style={{ fontWeight: "bold" }}>
							{message.type === "ask" ? (
								<>HAI wants to perform a security scan in this directory:</>
							) : (
								<>HAI security scan result:</>
							)}
						</span>
					</div>
					<CodeAccordian
						code={tool.content!}
						path={tool.path || ""}
						language="markdown"
						isExpanded={message.type === "ask" ? false : isExpanded}
						onToggleExpand={onToggleExpand}
					/>
				</>
			)
		default:
			return null
	}
}

export default ChatRowExtra
