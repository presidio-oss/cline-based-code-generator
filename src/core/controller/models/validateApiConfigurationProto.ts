import { Controller } from "@/core/controller"
import { Boolean } from "@shared/proto/cline/common"
import { UpdateApiConfigurationRequest } from "@shared/proto/cline/models"
import { convertProtoToApiConfiguration } from "@shared/proto-conversions/models/api-configuration-conversion"
import { buildApiHandler } from "@/api"
import { Mode } from "@shared/storage/types"
import { validateApiConfiguration } from "@/utils/validate"

export async function validateApiConfigurationProto(
	controller: Controller,
	request: UpdateApiConfigurationRequest,
): Promise<Boolean> {
	try {
		if (!request.apiConfiguration) {
			return Boolean.create({ value: false })
		}

		const appApiConfiguration = convertProtoToApiConfiguration(request.apiConfiguration)

		// Get current mode from controller's state
		const currentMode = await controller.getCurrentMode()

		const validationError = validateApiConfiguration(currentMode, appApiConfiguration)

		if (validationError) {
			console.log("[APICONFIG: validateApiConfigurationProto] Client-side validation failed:", validationError)
			return Boolean.create({ value: false })
		}

		// Perform server-side API key validation (similar to legacy implementation)
		try {
			const apiHandler = buildApiHandler(appApiConfiguration, currentMode)

			const isValid = await apiHandler.validateAPIKey()

			console.log(`[APICONFIG: validateApiConfigurationProto] API validation result: ${isValid}`)

			return Boolean.create({ value: isValid })
		} catch (validationError) {
			console.log("[APICONFIG: validateApiConfigurationProto] API validation failed:", validationError)
			return Boolean.create({ value: false })
		}
	} catch (error) {
		console.log("[APICONFIG: validateApiConfigurationProto] Validation error:", error)
		return Boolean.create({ value: false })
	}
}
