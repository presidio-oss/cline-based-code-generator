import { StateServiceClient, BrowserServiceClient } from "@/services/grpc-client"
import { UpdateSettingsRequest, ManageIndexRequest, ManageExpertsRequest } from "@shared/proto/cline/state"
import { UpdateBrowserSettingsRequest } from "@shared/proto/cline/browser"

/**
 * Updates a single field in the settings.
 *
 * @param field - The field key to update
 * @param value - The new value for the field
 */
export const updateSetting = (field: keyof UpdateSettingsRequest, value: any) => {
	const updateRequest: Partial<UpdateSettingsRequest> = {}
	updateRequest[field] = value

	StateServiceClient.updateSettings(UpdateSettingsRequest.create(updateRequest)).catch((error) => {
		console.error(`Failed to update setting ${field}:`, error)
	})
}

/**
 * Updates a single browser setting field.
 *
 * @param field - The field key to update
 * @param value - The new value for the field
 */
export const updateBrowserSetting = (field: keyof UpdateBrowserSettingsRequest, value: any) => {
	const updateRequest: Partial<UpdateBrowserSettingsRequest> = {
		metadata: {},
		[field]: value,
	}

	BrowserServiceClient.updateBrowserSettings(UpdateBrowserSettingsRequest.create(updateRequest)).catch((error) => {
		console.error(`Failed to update browser setting ${field}:`, error)
	})
}

/**
 * Manages index operations (start, stop, reset).
 *
 * @param operation - The operation to perform ('start', 'stop', or 'reset')
 */
export const manageIndex = (operation: "start" | "stop" | "reset") => {
	const manageRequest: Partial<ManageIndexRequest> = {
		metadata: {},
	}

	// Set the appropriate operation flag
	if (operation === "start") {
		manageRequest.startIndex = true
	} else if (operation === "stop") {
		manageRequest.stopIndex = true
	} else if (operation === "reset") {
		manageRequest.resetIndex = true
	}

	StateServiceClient.manageIndex(ManageIndexRequest.create(manageRequest)).catch((error) => {
		console.error(`Failed to ${operation} index:`, error)
	})
}

/**
 * Manages experts operations (loadDefaultExperts, loadExperts, viewExpertPrompt).
 *
 * @param operation - The operation to perform ('loadDefaultExperts' | 'loadExperts' | 'viewExpertPrompt')
 * @param expertData - Optional expert data for viewExpertPrompt operation
 * @returns Promise that resolves to the experts response
 */
export const manageExperts = (
	operation:
		| "loadDefaultExperts"
		| "loadExperts"
		| "viewExpertPrompt"
		| "saveExpert"
		| "deleteExpert"
		| "selectExpert"
		| "addDocumentLink"
		| "deleteDocumentLink"
		| "refreshDocumentLink",
	expertData?: any,
) => {
	const manageRequest: Partial<ManageExpertsRequest> = {
		metadata: {},
	}

	// Set the appropriate operation flag
	if (operation === "loadDefaultExperts") {
		manageRequest.loadDefaultExperts = true
	} else if (operation === "loadExperts") {
		manageRequest.loadExperts = true
	} else if (operation === "viewExpertPrompt" && expertData) {
		manageRequest.viewExpertPrompt = expertData
	} else if (operation === "saveExpert" && expertData) {
		manageRequest.saveExpert = expertData
	} else if (operation === "deleteExpert" && expertData) {
		manageRequest.deleteExpert = expertData
	} else if (operation === "addDocumentLink" && expertData) {
		manageRequest.addDocumentLink = expertData
	} else if (operation === "deleteDocumentLink" && expertData) {
		manageRequest.deleteDocumentLink = expertData
	} else if (operation === "refreshDocumentLink" && expertData) {
		manageRequest.refreshDocumentLink = expertData
	} else if (operation === "selectExpert" && expertData) {
		manageRequest.selectExpert = expertData
	}

	return StateServiceClient.manageExperts(ManageExpertsRequest.create(manageRequest))
}
