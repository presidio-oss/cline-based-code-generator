import path from "path"
import { GlobalFileNames, ensureWorkflowsDirectoryExists } from "@core/storage/disk"
import { ClineRulesToggles } from "@shared/cline-rules"
import { customGetState, customUpdateState } from "@core/storage/state"
import * as vscode from "vscode"
import { synchronizeRuleToggles } from "@core/context/instructions/user-instructions/rule-helpers"

/**
 * Refresh the workflow toggles
 */
export async function refreshWorkflowToggles(
	context: vscode.ExtensionContext,
	workingDirectory: string,
): Promise<{
	globalWorkflowToggles: ClineRulesToggles
	localWorkflowToggles: ClineRulesToggles
}> {
	// Global workflows
	const globalWorkflowToggles = ((await customGetState(context, "globalWorkflowToggles")) as ClineRulesToggles) || {}
	const globalClineWorkflowsFilePath = await ensureWorkflowsDirectoryExists()
	const updatedGlobalWorkflowToggles = await synchronizeRuleToggles(globalClineWorkflowsFilePath, globalWorkflowToggles)
	await customUpdateState(context, "globalWorkflowToggles", updatedGlobalWorkflowToggles)

	const workflowRulesToggles = ((await customGetState(context, "workflowToggles")) as ClineRulesToggles) || {}
	const workflowsDirPath = path.resolve(workingDirectory, GlobalFileNames.workflows)
	const updatedWorkflowToggles = await synchronizeRuleToggles(workflowsDirPath, workflowRulesToggles)
	await customUpdateState(context, "workflowToggles", updatedWorkflowToggles)

	return {
		globalWorkflowToggles: updatedGlobalWorkflowToggles,
		localWorkflowToggles: updatedWorkflowToggles,
	}
}
