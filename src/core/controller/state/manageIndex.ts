import { Empty } from "@shared/proto/cline/common"
import { ManageIndexRequest } from "@shared/proto/cline/state"
import fs from "fs/promises"
import * as path from "path"
import { ShowMessageRequest, ShowMessageType } from "@/generated/nice-grpc/host/window"
import { HostProvider } from "@/hosts/host-provider"
import { HaiBuildDefaults } from "@/shared/haiDefaults"
import { fileExistsAtPath } from "@/utils/fs"
import { Controller } from ".."

/**
 * Manages index operations (start, stop, reset)
 * @param controller The controller instance
 * @param request The request containing the index operations to perform
 * @returns An empty response
 */
export async function manageIndex(controller: Controller, request: ManageIndexRequest): Promise<Empty> {
	try {
		// Handle start index operation
		if (request.startIndex) {
			console.log("Starting index operation")
			controller.codeIndexAbortController = new AbortController()
			controller.codeIndexBackground(undefined, undefined, true)
		}

		// Handle stop index operation
		if (request.stopIndex) {
			console.log("Stopping index operation")
			controller.codeIndexAbortController.abort()
		}

		// Handle reset index operation
		if (request.resetIndex) {
			console.log("Re-indexing workspace")
			const message =
				"Are you sure you want to reindex this workspace? This will erase all existing indexed data and restart the indexing process from the beginning."
			const resetIndex = (
				await HostProvider.window.showMessage(
					ShowMessageRequest.create({
						type: ShowMessageType.WARNING,
						message,
						options: {
							items: ["Yes", "No"],
						},
					}),
				)
			).selectedOption
			if (resetIndex === "Yes") {
				const haiFolderPath = path.join(controller.vsCodeWorkSpaceFolderFsPath, HaiBuildDefaults.defaultContextDirectory)
				if (await fileExistsAtPath(haiFolderPath)) {
					await fs.rmdir(haiFolderPath, { recursive: true })
				}
				controller.codeIndexAbortController = new AbortController()
				controller.cacheService.setWorkspaceState("buildIndexProgress", {
					progress: 0,
					type: "codeIndex",
					isInProgress: false,
					ts: "",
				})
				controller.codeIndexBackground(undefined, undefined, true)
			}
		}

		// Post updated state to webview
		await controller.postStateToWebview()

		return Empty.create()
	} catch (error) {
		console.error("Failed to manage index:", error)
		throw error
	}
}
