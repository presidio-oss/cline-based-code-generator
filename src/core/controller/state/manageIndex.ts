import { updateGlobalState } from "@/core/storage/state"
import { Controller } from ".."
import { Empty } from "@shared/proto/cline/common"
import { ManageIndexRequest } from "@shared/proto/cline/state"
import * as vscode from "vscode"
import { HaiBuildDefaults } from "@/shared/haiDefaults"
import { fileExistsAtPath } from "@/utils/fs"
import fs from "fs/promises"
import * as path from "path"

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
			await updateGlobalState(controller.context, "codeIndexUserConfirmation", true)
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
			const resetIndex = await vscode.window.showWarningMessage(
				"Are you sure you want to reindex this workspace? This will erase all existing indexed data and restart the indexing process from the beginning.",
				"Yes",
				"No",
			)
			if (resetIndex === "Yes") {
				const haiFolderPath = path.join(controller.vsCodeWorkSpaceFolderFsPath, HaiBuildDefaults.defaultContextDirectory)
				if (await fileExistsAtPath(haiFolderPath)) {
					await fs.rmdir(haiFolderPath, { recursive: true })
				}
				controller.codeIndexAbortController = new AbortController()
				await updateGlobalState(controller.context, "buildIndexProgress", {
					progress: 0,
					type: "codeIndex",
					isInProgress: false,
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
