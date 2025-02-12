import { VSCodeCheckbox, VSCodeTextArea } from "@vscode/webview-ui-toolkit/react"
import { HaiBuildContextOptions } from "../../interfaces/hai-context.interface"
import { HaiBuildDefaults } from "../../../../src/shared/haiDefaults"
import { memo } from "react"
import { useExtensionState } from "../../context/ExtensionStateContext"

type IndexingProgressProps = {
	buildContextOptions?: HaiBuildContextOptions
}

const IndexingProgress = memo(({ buildContextOptions }: IndexingProgressProps) => {
	const { buildIndexProgress } = useExtensionState()
	return (
		<>
			<div
				style={{
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					paddingTop: "2px",
					paddingBottom: "2px",
					opacity: !buildContextOptions?.useIndex ? 0.5 : 1,
				}}>
				<div style={{ width: "100%", backgroundColor: "#e5e7eb", height: "8px", borderRadius: "2px" }}>
					<div
						style={{
							backgroundColor: "#186DF0",
							height: "8px",
							width: `${buildIndexProgress?.progress ?? 0}%`,
							borderRadius: "2px",
						}}></div>
				</div>
				<span
					style={{
						paddingLeft: "4px",
					}}>
					{buildIndexProgress && buildIndexProgress.progress ? `${buildIndexProgress.progress.toFixed(1)}%` : "---"}
				</span>
			</div>
			<div>
				Last run
				<span
					style={{
						fontSize: "12px",
						color: "var(--vscode-descriptionForeground)",
						paddingLeft: "4px",
					}}>
					{buildIndexProgress?.ts ?? "-"}
				</span>
			</div>
		</>
	)
})

type SettingsViewExtraProps = {
	buildContextOptions?: HaiBuildContextOptions
	vscodeWorkspacePath?: string
	setBuildContextOptions: (value: HaiBuildContextOptions) => void
}

const SettingsViewExtra = ({ buildContextOptions, vscodeWorkspacePath, setBuildContextOptions }: SettingsViewExtraProps) => {
	return (
		<>
			<div style={{ marginBottom: 5 }}>
				<VSCodeCheckbox
					checked={buildContextOptions?.useIndex}
					onChange={(e: any) => {
						setBuildContextOptions({
							...buildContextOptions!,
							useIndex: e.target?.checked,
						})
					}}
					disabled={!vscodeWorkspacePath}>
					<span style={{ fontWeight: "500" }}>Use Code Index</span>
				</VSCodeCheckbox>
				<IndexingProgress buildContextOptions={buildContextOptions} />
				<p
					style={{
						fontSize: "12px",
						marginTop: "5px",
						color: "var(--vscode-descriptionForeground)",
					}}>
					When enabled, HAI will automatically index your code. This is useful for finding relevant files for the tasks
					you are working on.
				</p>
			</div>

			<div style={{ marginBottom: 5 }}>
				<VSCodeCheckbox
					checked={buildContextOptions?.useContext}
					disabled={!vscodeWorkspacePath || !buildContextOptions?.useIndex}
					onChange={(e: any) => {
						setBuildContextOptions({
							...buildContextOptions!,
							useContext: e.target?.checked,
						})
					}}>
					<span style={{ fontWeight: "500" }}>With Code Context (Comments)</span>
				</VSCodeCheckbox>
				<p
					style={{
						fontSize: "12px",
						marginTop: "5px",
						color: "var(--vscode-descriptionForeground)",
					}}>
					When enabled, HAI will automatically add code context to your code before indexing.
				</p>
			</div>

			<div style={{ marginBottom: 5 }}>
				<VSCodeTextArea
					value={buildContextOptions?.appContext ?? ""}
					style={{ width: "100%" }}
					rows={4}
					disabled={!vscodeWorkspacePath || !buildContextOptions?.useIndex}
					placeholder={'e.g. "This is an e-commerce application", "This is an CRM application"'}
					onInput={(e: any) => {
						setBuildContextOptions({
							...buildContextOptions!,
							appContext: e.target?.value || "",
						})
					}}>
					<span style={{ fontWeight: "500" }}>Application Context</span>
				</VSCodeTextArea>
				<p
					style={{
						fontSize: "12px",
						marginTop: "5px",
						color: "var(--vscode-descriptionForeground)",
					}}>
					This will help HAI to better understand your application.
				</p>
			</div>

			<div style={{ marginBottom: 5 }}>
				<VSCodeTextArea
					value={buildContextOptions?.excludeFolders ?? ""}
					style={{ width: "100%" }}
					rows={4}
					disabled={!vscodeWorkspacePath || !buildContextOptions?.useIndex}
					placeholder={"Comma separated list of folders to exclude from indexing"}
					onInput={(e: any) => {
						setBuildContextOptions({
							...buildContextOptions!,
							excludeFolders: e.target?.value || "",
						})
					}}>
					<span style={{ fontWeight: "500" }}>Exclude Folders</span>
				</VSCodeTextArea>
				<p
					style={{
						fontSize: "12px",
						marginTop: "5px",
						color: "var(--vscode-descriptionForeground)",
					}}>
					List of folders to exclude from the code indexing. The following folders are ignored by default{" "}
					<span
						style={{
							color: "#E8912D",
							opacity: "80%",
						}}>
						{HaiBuildDefaults.defaultDirsToIgnore.join(", ")}
					</span>
				</p>
			</div>

			<div style={{ marginBottom: 5 }}>
				<VSCodeCheckbox
					checked={buildContextOptions?.useSecretScanning ?? false}
					disabled={!vscodeWorkspacePath}
					onChange={(e: any) => {
						setBuildContextOptions({
							...buildContextOptions!,
							useSecretScanning: e.target?.checked,
						})
					}}>
					<span style={{ fontWeight: "500" }}>Secret Scanning</span>
				</VSCodeCheckbox>
				<p
					style={{
						fontSize: "12px",
						marginTop: "5px",
						color: "var(--vscode-descriptionForeground)",
					}}>
					When enabled, HAI will try not to read secrets from your code. That matches below given patterns.
				</p>
			</div>

			<div style={{ marginBottom: 5 }}>
				<VSCodeTextArea
					value={
						buildContextOptions?.secretFilesPatternToIgnore
							? buildContextOptions?.secretFilesPatternToIgnore.join("\n")
							: HaiBuildDefaults.defaultSecretFilesPatternToIgnore.join("\n")
					}
					style={{ width: "100%" }}
					rows={4}
					disabled={!vscodeWorkspacePath || !buildContextOptions?.useSecretScanning}
					placeholder={'e.g. ".env", ".env.local", ".env.development", ".env.production"'}
					onInput={(e: any) => {
						if (e.target?.value) {
							setBuildContextOptions({
								...buildContextOptions!,
								secretFilesPatternToIgnore: e.target?.value.split("\n"),
							})
						}
					}}>
					<span style={{ fontWeight: "500" }}>Secret Files Patterns to Ignore</span>
				</VSCodeTextArea>
				<p
					style={{
						fontSize: "12px",
						marginTop: "5px",
						color: "var(--vscode-descriptionForeground)",
					}}>
					List of files to ignore when scanning for secrets. Separate each pattern with a new line.
				</p>
			</div>
		</>
	)
}

export default memo(SettingsViewExtra)
