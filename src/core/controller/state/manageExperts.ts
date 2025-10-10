import { ManageExpertsRequest, ManageExpertsResponse } from "@shared/proto/cline/state"
import { ShowMessageType } from "@shared/proto/index.host"
import { convertProtoToLocalExpertData } from "@shared/proto-conversions/experts/experts-conversion"
import * as vscode from "vscode"
import { HostProvider } from "@/hosts/host-provider"
import { openFile } from "@/integrations/misc/open-file"
import { Controller, EXPERT_PROMPT_URI_SCHEME } from ".."

/**
 * Manages experts operations (loadDefaultExperts, loadExperts)
 * @param controller The controller instance
 * @param request The request containing the experts operations to perform
 * @returns ManageExpertsResponse containing experts data
 */
export async function manageExperts(controller: Controller, request: ManageExpertsRequest): Promise<ManageExpertsResponse> {
	try {
		let experts: any[] = []
		let selectedExpert: any = null
		let key: string | undefined

		// Handle loadDefaultExperts operation
		if (request.loadDefaultExperts) {
			console.log("Loading default experts")
			const expertManager = await controller.getExpertManager()
			const result = await expertManager.loadDefaultExperts()
			experts = result.experts || []
			selectedExpert = result.selectedExpert || null
			key = "defaultExpertsLoaded"
		}

		// Handle loadExperts operation (future functionality)
		if (request.loadExperts) {
			console.log("Loading custom experts")
			const expertManager = await controller.getExpertManager()
			const result = await expertManager.readExperts(controller.vsCodeWorkSpaceFolderFsPath)
			experts = result.experts || []
			selectedExpert = result.selectedExpert || null
			key = "customExpertsLoaded"
		}

		// Handle viewExpertPrompt operation
		if (request.viewExpertPrompt) {
			console.log("Viewing expert prompt")
			const viewExpertName = request.viewExpertPrompt.name
			if (request.viewExpertPrompt.isDefault && request.viewExpertPrompt.prompt) {
				try {
					const encodedContent = Buffer.from(request.viewExpertPrompt.prompt).toString("base64")
					const uri = vscode.Uri.parse(`${EXPERT_PROMPT_URI_SCHEME}:${viewExpertName}.md?${encodedContent}`)
					const document = await vscode.workspace.openTextDocument(uri)
					await vscode.window.showTextDocument(document, { preview: false })
				} catch (error) {
					console.error("Error creating or opening the virtual document:", error)
				}
			} else {
				const expertManager = await controller.getExpertManager()
				const promptPath = await expertManager.getExpertPromptPath(controller.vsCodeWorkSpaceFolderFsPath, viewExpertName)
				if (promptPath) {
					openFile(promptPath)
				} else {
					HostProvider.window.showMessage({
						type: ShowMessageType.ERROR,
						message: `Could not find prompt file for expert: ${viewExpertName}`,
					})
				}
			}
		}

		// Handle saveExpert operation
		if (request.saveExpert) {
			const protoExpert = request.saveExpert
			const localExpert = convertProtoToLocalExpertData(protoExpert)
			const expertManager = await controller.getExpertManager()
			await expertManager.saveExpert(controller.vsCodeWorkSpaceFolderFsPath, localExpert)
		}

		// Handle deleteExpert operation
		if (request.deleteExpert) {
			const expertToDelete = request.deleteExpert.name
			const expertName = controller.cacheService.getGlobalStateKey("expertName")
			const expertManager = await controller.getExpertManager()
			await expertManager.deleteExpert(controller.vsCodeWorkSpaceFolderFsPath, expertToDelete)
			if (expertName === expertToDelete) {
				controller.cacheService.setGlobalState("expertName", undefined)
				controller.cacheService.setGlobalState("expertPrompt", undefined)
				controller.cacheService.setGlobalState("isDeepCrawlEnabled", false)
			}
		}

		if (request.selectExpert) {
			const expertName = request.selectExpert.name
			const expertPrompt = request.selectExpert.prompt
			const isDeepCrawlEnabled = request.selectExpert.deepCrawl

			// If name is empty string, user selected "Default" - clear the expert selection
			if (expertName === "") {
				controller.cacheService.setGlobalState("expertPrompt", undefined)
				controller.cacheService.setGlobalState("expertName", undefined)
				controller.cacheService.setGlobalState("isDeepCrawlEnabled", false)
				await controller.updateExpertPrompt(undefined, undefined)
			} else {
				controller.cacheService.setGlobalState("expertPrompt", expertPrompt || undefined)
				controller.cacheService.setGlobalState("expertName", expertName || undefined)
				controller.cacheService.setGlobalState("isDeepCrawlEnabled", isDeepCrawlEnabled)
				if (!isDeepCrawlEnabled) {
					await controller.updateExpertPrompt(expertPrompt, expertName)
				}
			}
		}

		// Handle refreshDocumentLink operation
		if (request.refreshDocumentLink) {
			const expertManager = await controller.getExpertManager()
			await expertManager.refreshDocumentLink(
				controller.vsCodeWorkSpaceFolderFsPath,
				request.refreshDocumentLink.expertName,
				request.refreshDocumentLink.url,
			)
		}

		// Handle deleteDocumentLink operation
		if (request.deleteDocumentLink) {
			const expertManager = await controller.getExpertManager()
			await expertManager.deleteDocumentLink(
				controller.vsCodeWorkSpaceFolderFsPath,
				request.deleteDocumentLink.expertName,
				request.deleteDocumentLink.url,
			)
		}

		// Handle addDocumentLink operation
		if (request.addDocumentLink) {
			const expertManager = await controller.getExpertManager()
			await expertManager.addDocumentLink(
				controller.vsCodeWorkSpaceFolderFsPath,
				request.addDocumentLink.expertName,
				request.addDocumentLink.url,
			)
		}

		await controller.postStateToWebview()

		return ManageExpertsResponse.create({
			experts,
			selectedExpert,
			key,
		})
	} catch (error) {
		console.error("Failed to manage experts:", error)
		throw error
	}
}
