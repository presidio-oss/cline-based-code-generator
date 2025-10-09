import type { EmptyRequest } from "@shared/proto/cline/common"
import { Empty } from "@shared/proto/cline/common"
import type { Controller } from "../index"
import { sendHaiTaskDataUpdate } from "./subscribeToHaiTaskData"

/**
 * Reset HAI tasks and clear configuration
 * @param controller The controller instance
 * @param request Empty request
 * @returns Empty response
 */
export async function resetHaiTasks(controller: Controller, _request: EmptyRequest): Promise<Empty> {
	try {
		// Clear the HAI config using workspace state
		controller.cacheService.setWorkspaceState("haiConfig", undefined)

		// Send empty task data to all subscribed clients
		sendHaiTaskDataUpdate({
			stories: [],
			folderPath: "",
			timestamp: "",
		})

		return Empty.create({})
	} catch (error) {
		console.error(`Failed to reset HAI tasks: ${error}`)
		throw error
	}
}
