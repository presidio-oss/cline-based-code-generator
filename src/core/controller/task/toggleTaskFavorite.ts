import { customGetState, customUpdateState } from "@/core/storage/state"
import { Controller } from "../"
import { Empty } from "../../../shared/proto/common"
import { TaskFavoriteRequest } from "../../../shared/proto/task"
import { HistoryItem } from "@/shared/HistoryItem"

export async function toggleTaskFavorite(controller: Controller, request: TaskFavoriteRequest): Promise<Empty> {
	if (!request.taskId || request.isFavorited === undefined) {
		const errorMsg = `[toggleTaskFavorite] Invalid request: taskId or isFavorited missing`
		console.error(errorMsg)
		return {}
	}

	try {
		// Update in-memory state only
		try {
			const history = ((await customGetState(controller.context, "taskHistory")) as HistoryItem[] | undefined) || []

			const taskIndex = history.findIndex((item) => item.id === request.taskId)

			if (taskIndex === -1) {
				console.log(`[toggleTaskFavorite] Task not found in history array!`)
			} else {
				// Create a new array instead of modifying in place to ensure state change
				const updatedHistory = [...history]
				updatedHistory[taskIndex] = {
					...updatedHistory[taskIndex],
					isFavorited: request.isFavorited,
				}

				// Update global state and wait for it to complete
				try {
					await customUpdateState(controller.context, "taskHistory", updatedHistory)
				} catch (stateErr) {
					console.error("Error updating global state:", stateErr)
				}
			}
		} catch (historyErr) {
			console.error("Error processing task history:", historyErr)
		}

		// Post to webview
		try {
			await controller.postStateToWebview()
		} catch (webviewErr) {
			console.error("Error posting to webview:", webviewErr)
		}
	} catch (error) {
		console.error("Error in toggleTaskFavorite:", error)
	}

	return {}
}
