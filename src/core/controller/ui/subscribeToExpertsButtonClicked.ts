import { Controller } from "../index"
import { Empty } from "@shared/proto/cline/common"
import { EmptyRequest } from "@shared/proto/cline/common"
import { StreamingResponseHandler, getRequestRegistry } from "../grpc-handler"

// Keep track of active expertsButtonClicked subscriptions by controller ID
const activeExpertsButtonClickedSubscriptions = new Map<string, StreamingResponseHandler<Empty>>()

/**
 * Subscribe to expertsButtonClicked events
 * @param controller The controller instance
 * @param request The empty request
 * @param responseStream The streaming response handler
 * @param requestId The ID of the request (passed by the gRPC handler)
 */
export async function subscribeToExpertsButtonClicked(
	controller: Controller,
	_request: EmptyRequest,
	responseStream: StreamingResponseHandler<Empty>,
	requestId?: string,
): Promise<void> {
	const controllerId = controller.id
	console.log(`[DEBUG] set up expertsButtonClicked subscription for controller ${controllerId}`)

	// Add this subscription to the active subscriptions with the controller ID
	activeExpertsButtonClickedSubscriptions.set(controllerId, responseStream)

	// Register cleanup when the connection is closed
	const cleanup = () => {
		activeExpertsButtonClickedSubscriptions.delete(controllerId)
	}

	// Register the cleanup function with the request registry if we have a requestId
	if (requestId) {
		getRequestRegistry().registerRequest(requestId, cleanup, { type: "expertsButtonClicked_subscription" }, responseStream)
	}
}

/**
 * Send a expertsButtonClicked event to a specific controller's subscription
 * @param controllerId The ID of the controller to send the event to
 */
export async function sendExpertsButtonClickedEvent(controllerId: string): Promise<void> {
	// Get the subscription for this specific controller
	const responseStream = activeExpertsButtonClickedSubscriptions.get(controllerId)

	if (!responseStream) {
		console.error(`[DEBUG] No active subscription for controller ${controllerId}`)
		return
	}

	try {
		const event = Empty.create({})
		await responseStream(
			event,
			false, // Not the last message
		)
	} catch (error) {
		console.error(`Error sending expertsButtonClicked event to controller ${controllerId}:`, error)
		// Remove the subscription if there was an error
		activeExpertsButtonClickedSubscriptions.delete(controllerId)
	}
}
