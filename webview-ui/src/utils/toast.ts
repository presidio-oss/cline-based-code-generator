import { UiServiceClient } from "../services/grpc-client"
import { ShowToastRequest, ToastType } from "@shared/proto/cline/ui"
import { Metadata } from "@shared/proto/cline/common"

/**
 * Shows a toast notification using the gRPC service
 * @param message The message to display
 * @param type The type of toast (info, error, warning)
 */
export const showToast = async (message: string, type: "info" | "error" | "warning" = "info"): Promise<void> => {
	try {
		// Map string types to proto enum values
		let toastType: ToastType
		switch (type) {
			case "error":
				toastType = ToastType.TOAST_ERROR
				break
			case "warning":
				toastType = ToastType.TOAST_WARNING
				break
			case "info":
			default:
				toastType = ToastType.TOAST_INFO
				break
		}

		// Create the request
		const request = ShowToastRequest.create({
			metadata: Metadata.create({}),
			message,
			type: toastType,
		})

		// Call the gRPC service
		await UiServiceClient.showToast(request)
	} catch (error) {
		// Fallback to console logging if gRPC call fails
		console.error(`Failed to show toast: ${error}`)
		console.log(`[Toast ${type.toUpperCase()}]:`, message)
	}
}

/**
 * Convenience method for showing info toast
 */
export const showInfoToast = (message: string) => showToast(message, "info")

/**
 * Convenience method for showing error toast
 */
export const showErrorToast = (message: string) => showToast(message, "error")

/**
 * Convenience method for showing warning toast
 */
export const showWarningToast = (message: string) => showToast(message, "warning")
