import type { IHaiStory, IHaiTask } from "@shared/hai-task"
import { EmptyRequest } from "@shared/proto/cline/common"
import { HaiStory, HaiTask, HaiTaskDataResponse } from "@shared/proto/cline/ui"
import { getRequestRegistry, StreamingResponseHandler } from "../grpc-handler"
import { Controller } from "../index"

// Keep track of active HAI task data subscriptions
const activeHaiTaskDataSubscriptions = new Set<StreamingResponseHandler<HaiTaskDataResponse>>()

/**
 * Subscribe to HAI task data updates
 * @param controller The controller instance
 * @param request The empty request
 * @param responseStream The streaming response handler
 * @param requestId The ID of the request (passed by the gRPC handler)
 */
export async function subscribeToHaiTaskData(
	_controller: Controller,
	_request: EmptyRequest,
	responseStream: StreamingResponseHandler<HaiTaskDataResponse>,
	requestId?: string,
): Promise<void> {
	// Add this subscription to the active subscriptions
	activeHaiTaskDataSubscriptions.add(responseStream)

	// Register cleanup when the connection is closed
	const cleanup = () => {
		activeHaiTaskDataSubscriptions.delete(responseStream)
	}

	// Register the cleanup function with the request registry if we have a requestId
	if (requestId) {
		getRequestRegistry().registerRequest(requestId, cleanup, { type: "hai_task_data_subscription" }, responseStream)
	}
}

/**
 * Send HAI task data update to all active subscribers
 * @param data The task data containing stories, folder path, and timestamp
 */
export async function sendHaiTaskDataUpdate(data: {
	stories: IHaiStory[]
	folderPath: string
	timestamp: string
}): Promise<void> {
	// Convert IHaiStory[] to HaiStory[] (proto format)
	const protoStories = data.stories.map((story) => convertToProtoStory(story))

	const response = HaiTaskDataResponse.create({
		stories: protoStories,
		folderPath: data.folderPath,
		timestamp: data.timestamp,
	})

	// Send the event to all active subscribers
	const promises = Array.from(activeHaiTaskDataSubscriptions).map(async (responseStream) => {
		try {
			await responseStream(
				response,
				false, // Not the last message
			)
		} catch (error) {
			console.error("Error sending HAI task data update:", error)
			// Remove the subscription if there was an error
			activeHaiTaskDataSubscriptions.delete(responseStream)
		}
	})

	await Promise.all(promises)
}

/**
 * Convert IHaiStory to proto HaiStory format
 */
function convertToProtoStory(story: IHaiStory): HaiStory {
	return HaiStory.create({
		id: story.id,
		prdId: story.prdId,
		name: story.name,
		description: story.description,
		storyTicketId: story.storyTicketId || "",
		tasks: story.tasks.map((task) => convertToProtoTask(task)),
	})
}

/**
 * Convert IHaiTask to proto HaiTask format
 */
function convertToProtoTask(task: IHaiTask): HaiTask {
	return HaiTask.create({
		id: task.id,
		list: task.list,
		acceptance: task.acceptance,
		subTaskTicketId: task.subTaskTicketId || "",
		status: task.status,
	})
}
