import type { Controller } from "../index"
import type { ShowToastRequest } from "@shared/proto/cline/ui"
import { ToastType } from "@shared/proto/cline/ui"
import { Empty } from "@shared/proto/cline/common"
import { HostProvider } from "@/hosts/host-provider"
import { ShowMessageType } from "@shared/proto/index.host"

/**
 * Shows a toast notification with the specified message and type
 * @param _controller The controller instance (unused)
 * @param request The toast request containing message and type
 * @returns Empty response
 */
export async function showToast(_controller: Controller, request: ShowToastRequest): Promise<Empty> {
	try {
		const { message, type } = request

		// Map proto ToastType to HostProvider ShowMessageType
		let messageType: ShowMessageType
		switch (type) {
			case ToastType.TOAST_INFO:
				messageType = ShowMessageType.INFORMATION
				break
			case ToastType.TOAST_ERROR:
				messageType = ShowMessageType.ERROR
				break
			case ToastType.TOAST_WARNING:
				messageType = ShowMessageType.WARNING
				break
			default:
				// Fallback to info for unknown types
				messageType = ShowMessageType.INFORMATION
				break
		}

		HostProvider.window.showMessage({ type: messageType, message })

		return Empty.create({})
	} catch (error) {
		console.error(`Failed to show toast: ${error}`)
		throw error
	}
}
