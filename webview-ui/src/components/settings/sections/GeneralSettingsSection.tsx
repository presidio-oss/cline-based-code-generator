import { VSCodeCheckbox, VSCodeLink } from "@vscode/webview-ui-toolkit/react"
import { useExtensionState } from "@/context/ExtensionStateContext"
import PreferredLanguageSetting from "../PreferredLanguageSetting"
import Section from "../Section"
import { updateSetting } from "../utils/settingsHandlers"

interface GeneralSettingsSectionProps {
	renderSectionHeader: (tabId: string) => JSX.Element | null
}

const GeneralSettingsSection = ({ renderSectionHeader }: GeneralSettingsSectionProps) => {
	const { telemetrySetting } = useExtensionState()

	return (
		<div>
			{renderSectionHeader("general")}
			<Section>
				<PreferredLanguageSetting />

				<div className="mb-[5px]">
					<VSCodeCheckbox
						checked={telemetrySetting !== "disabled"}
						className="mb-[5px]"
						onChange={(e: any) => {
							const checked = e.target.checked === true
							updateSetting("telemetrySetting", checked ? "enabled" : "disabled")
						}}>
						Allow error and usage reporting
					</VSCodeCheckbox>

					<p className="text-xs mt-[5px] text-[var(--vscode-descriptionForeground)]">
						Help improve HAI by sending usage data and error reports. No code, prompts, or personal information are
						ever sent. Only the{" "}
						<VSCodeLink
							className="text-inherit"
							href="https://docs.github.com/en/get-started/git-basics/setting-your-username-in-git">
							git username and email
						</VSCodeLink>{" "}
						are sent for analytics.
					</p>
				</div>
			</Section>
		</div>
	)
}

export default GeneralSettingsSection
