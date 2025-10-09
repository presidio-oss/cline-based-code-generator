import type { IHaiStory } from "@shared/hai-task"
import { Empty } from "@shared/proto/cline/common"
import type { HaiTasksLoadRequest } from "@shared/proto/cline/ui"
import * as fs from "fs"
import * as path from "path"
import * as vscode from "vscode"
import type { Controller } from "../index"
import { sendHaiTaskDataUpdate } from "./subscribeToHaiTaskData"

/**
 * Get formatted date time string
 */
function getFormattedDateTime(): string {
	const now = new Date()
	return now.toLocaleString()
}

/**
 * Load HAI tasks from a folder path or show folder picker if path is not provided
 * @param controller The controller instance
 * @param request The load request containing optional folder path
 * @returns Empty response
 */
export async function loadHaiTasks(controller: Controller, request: HaiTasksLoadRequest): Promise<Empty> {
	try {
		const { folderPath, loadDefault } = request

		if (loadDefault && folderPath) {
			// Load from the provided path (refresh case)
			const ts = getFormattedDateTime()
			await fetchTaskFromSelectedFolder(controller, folderPath, ts)
			controller.cacheService.setWorkspaceState("haiConfig", { folder: folderPath, ts })
		} else if (folderPath) {
			// Load from specific path
			const ts = getFormattedDateTime()
			await fetchTaskFromSelectedFolder(controller, folderPath, ts)
			controller.cacheService.setWorkspaceState("haiConfig", { folder: folderPath, ts })
		} else {
			// Show folder picker
			const options: vscode.OpenDialogOptions = {
				canSelectMany: false,
				openLabel: "Open",
				canSelectFiles: false,
				canSelectFolders: true,
			}

			const fileUri = await vscode.window.showOpenDialog(options)
			if (fileUri && fileUri[0]) {
				const ts = getFormattedDateTime()
				await fetchTaskFromSelectedFolder(controller, fileUri[0].fsPath, ts)
				controller.cacheService.setWorkspaceState("haiConfig", { folder: fileUri[0].fsPath, ts })
			}
		}

		return Empty.create({})
	} catch (error) {
		console.error(`Failed to load HAI tasks: ${error}`)
		throw error
	}
}

/**
 * Fetch tasks from the selected folder and send to webview
 */
async function fetchTaskFromSelectedFolder(controller: Controller, folderPath: string, ts: string): Promise<void> {
	const stories = await readHaiTaskList(folderPath)

	if (stories.length === 0) {
		vscode.window.showInformationMessage("No tasks found in the selected folder")
	}

	// Send the task data to all subscribed clients
	sendHaiTaskDataUpdate({
		stories,
		folderPath,
		timestamp: ts,
	})
}

/**
 * Read HAI task list from PRD folder
 */
async function readHaiTaskList(folderPath: string): Promise<IHaiStory[]> {
	try {
		const prdPath = path.join(folderPath, "PRD")

		if (!fs.existsSync(prdPath)) {
			console.error(`PRD folder not found at: ${prdPath}`)
			return []
		}

		const files = fs.readdirSync(prdPath)
		let haiTaskList: IHaiStory[] = []

		files
			.filter((file: string) => file.match(/-feature.json$/))
			.forEach((file: string) => {
				const content = fs.readFileSync(path.join(prdPath, file), "utf-8")
				const prdId = file.split("-")[0].replace("PRD", "")
				const parsedFeaturesList = JSON.parse(content).features
				const featuresListWithPrdId = parsedFeaturesList.map((feature: any) => ({
					...feature,
					prdId: prdId,
				}))
				haiTaskList = [...haiTaskList, ...featuresListWithPrdId]
			})

		return haiTaskList
	} catch (error) {
		console.error("Error reading HAI task list:", error)
		return []
	}
}
