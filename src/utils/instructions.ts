import * as path from "path"
import fs from "fs/promises"
import { getWorkspacePath } from "./path"

export const readInstructionsFromFiles = async (
	instructionStates: { name: string; enabled: boolean }[],
): Promise<string | undefined> => {
	const workspacePath = getWorkspacePath()
	if (!workspacePath) {
		console.log("Workspace path is undefined")
		return
	}
	const instructionsDir = path.resolve(workspacePath, ".vscode/hai-instructions")
	try {
		const files = await fs.readdir(instructionsDir)
		let instructions = ""
		for (const file of files) {
			const instructionState = instructionStates.find((state) => state.name === file)
			if (instructionState && instructionState.enabled) {
				const filePath = path.join(instructionsDir, file)
				const content = await fs.readFile(filePath, "utf8")
				instructions += `# ${file}\n\n${content}\n\n`
			}
		}
		return instructions.trim() || undefined
	} catch (error) {
		console.error(`Failed to read instructions from ${instructionsDir}:`, error)
		return undefined
	}
}

export const uploadInstructionFile = async (fileName: string, fileContents: string) => {
	const workspacePath = getWorkspacePath()
	if (!workspacePath) {
		console.log("Workspace path is undefined")
		return
	}
	const instructionsDir = path.resolve(workspacePath, ".vscode/hai-instructions")
	await fs.mkdir(instructionsDir, { recursive: true })
	const filePath = path.join(instructionsDir, fileName)
	await fs.writeFile(filePath, fileContents, "utf8")
}

export const deleteInstructionFile = async (fileName: string) => {
	const workspacePath = getWorkspacePath()
	if (!workspacePath) {
		console.log("Workspace path is undefined")
		return
	}
	const instructionsDir = path.resolve(workspacePath, ".vscode/hai-instructions")
	try {
		const filePath = path.join(instructionsDir, fileName)
		await fs.unlink(filePath)
	} catch (error) {
		console.error(`Failed to delete file ${fileName}:`, error)
	}
}
