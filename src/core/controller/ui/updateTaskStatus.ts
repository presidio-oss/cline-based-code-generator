import type { IHaiStory } from "@shared/hai-task"
import type { UpdateTaskStatusRequest } from "@shared/proto/cline/ui"
import { UpdateTaskStatusResponse } from "@shared/proto/cline/ui"
import * as fs from "fs/promises"
import * as path from "path"
import * as vscode from "vscode"
import type { Controller } from "../index"
import { sendHaiTaskDataUpdate } from "./subscribeToHaiTaskData"

function getFormattedDateTime(): string {
	const now = new Date()
	return now.toLocaleString()
}

/**
 * Read all HAI stories from PRD folder
 */
async function readAllHaiStories(folderPath: string): Promise<IHaiStory[]> {
	try {
		const prdPath = path.join(folderPath, "PRD")

		// Check if PRD folder exists
		try {
			await fs.access(prdPath)
		} catch {
			console.error(`PRD folder not found at: ${prdPath}`)
			return []
		}

		const files = await fs.readdir(prdPath)
		let haiTaskList: IHaiStory[] = []

		const featureFiles = files.filter((file: string) => file.match(/-feature.json$/))

		for (const file of featureFiles) {
			const content = await fs.readFile(path.join(prdPath, file), "utf-8")
			const prdId = file.split("-")[0].replace("PRD", "")
			const prdFeatureJson = JSON.parse(content)
			const parsedFeaturesList = prdFeatureJson.features || []
			const featuresListWithPrdId = parsedFeaturesList.map((feature: any) => ({
				id: feature.id,
				prdId: prdId,
				name: feature.name,
				description: feature.description,
				storyTicketId: feature.storyTicketId || "",
				tasks: (feature.tasks || []).map((task: any) => ({
					id: task.id,
					list: task.list,
					acceptance: task.acceptance,
					subTaskTicketId: task.subTaskTicketId || "",
					status: task.status || "Pending",
				})),
			}))
			haiTaskList = [...haiTaskList, ...featuresListWithPrdId]
		}

		return haiTaskList
	} catch (error) {
		console.error("Error reading HAI task list:", error)
		return []
	}
}

export async function updateTaskStatus(
	_controller: Controller,
	request: UpdateTaskStatusRequest,
): Promise<UpdateTaskStatusResponse> {
	const { folderPath, taskId, status } = request

	if (!folderPath || !taskId || !status) {
		return UpdateTaskStatusResponse.create({
			success: false,
			message: "Missing required parameters: folderPath, taskId, or status",
		})
	}

	// Parse task ID to extract PRD ID, User Story ID, and Task ID
	// Expected format: PRD1-US1-TASK1 or 1-US1-TASK1 or US1-TASK1 (if PRD ID is missing)
	const taskIdMatch = taskId.match(/^(?:(?:PRD)?(\d+)-)?US(\d+)-TASK(\d+)$/)

	if (!taskIdMatch) {
		return UpdateTaskStatusResponse.create({
			success: false,
			message: `Invalid task ID format: ${taskId}. Expected format: PRD1-US1-TASK1`,
		})
	}

	const [, prdId, usId, taskIdNum] = taskIdMatch

	// If prdId is missing from the task ID, we need to find it from the user story ID
	if (!prdId) {
		return UpdateTaskStatusResponse.create({
			success: false,
			message: `PRD ID is missing from task ID: ${taskId}. Cannot determine which PRD file to update.`,
		})
	}

	const prdFeatureFilePath = path.join(folderPath, "PRD", `PRD${prdId}-feature.json`)

	try {
		// Check if file exists
		try {
			await fs.access(prdFeatureFilePath)
		} catch {
			return UpdateTaskStatusResponse.create({
				success: false,
				message: `PRD feature file not found: ${prdFeatureFilePath}`,
			})
		}

		// Read the PRD feature file
		const fileContent = await fs.readFile(prdFeatureFilePath, "utf-8")
		const prdFeatureJson = JSON.parse(fileContent)

		// Find the feature (user story)
		const feature = prdFeatureJson.features?.find((f: { id: string }) => f.id === `US${usId}`)

		if (!feature) {
			return UpdateTaskStatusResponse.create({
				success: false,
				message: `User story US${usId} not found in PRD${prdId}`,
			})
		}

		// Find the task
		const selectedTask = feature.tasks?.find((t: { id: string }) => t.id === `TASK${taskIdNum}`)

		if (!selectedTask) {
			return UpdateTaskStatusResponse.create({
				success: false,
				message: `Task TASK${taskIdNum} not found in US${usId}`,
			})
		}

		// Update the task status
		selectedTask.status = status

		// Write back to file with proper formatting
		await fs.writeFile(prdFeatureFilePath, JSON.stringify(prdFeatureJson, null, 2), "utf-8")

		// Show success message with buttons option (new API)
		await vscode.window.showInformationMessage(`Successfully marked task as ${status.toLowerCase()}.`, {})

		// Read all stories from all PRD files and broadcast via gRPC stream
		const stories = await readAllHaiStories(folderPath)
		const ts = getFormattedDateTime()
		await sendHaiTaskDataUpdate({
			stories,
			folderPath,
			timestamp: ts,
		})

		return UpdateTaskStatusResponse.create({
			success: true,
			message: `Task marked as ${status}`,
		})
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error)
		await vscode.window.showErrorMessage(`Failed to mark task as ${status.toLowerCase()}: ${errorMessage}`, {})

		return UpdateTaskStatusResponse.create({
			success: false,
			message: `Error updating task: ${errorMessage}`,
		})
	}
}
