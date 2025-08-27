import * as fs from "fs"
import * as path from "path"
import { z } from "zod"
import { GlobalFileNames } from "@/global-constants"
import { getWorkspacePath } from "@/utils/path"

export const haiConfigSchema = z.object({
	name: z.string().optional(),
	langfuse: z
		.object({
			apiUrl: z.string().trim().optional(),
			apiKey: z.string().trim().optional(),
			publicKey: z.string().trim().optional(),
		})
		.optional(),
	posthog: z
		.object({
			url: z.string().trim().optional(),
			apiKey: z.string().trim().optional(),
		})
		.optional(),
	cormatrix: z
		.object({
			baseURL: z.string().trim().optional(),
			token: z.string().trim().optional(),
			workspaceId: z.string().trim().optional(),
		})
		.optional(),
})

export class HaiConfig {
	static async getConfig(workspacePath?: string) {
		if (!workspacePath) {
			workspacePath = await getWorkspacePath()
		}

		// Parse hai config file
		const configPath = path.join(workspacePath, GlobalFileNames.haiConfig)
		if (!fs.existsSync(configPath)) {
			console.log(`[HaiConfig]: ${configPath} does not exist`)
			return
		}

		const content = fs.readFileSync(configPath, "utf-8")
		const lines = content.split("\n")

		const config: Record<string, any> = {}

		for (const line of lines) {
			const trimmed = line.trim()
			if (!trimmed || trimmed.startsWith("#")) {
				continue
			}

			const [key, ...rest] = trimmed.split("=")
			const value = rest.join("=").trim() // supports '=' in value

			const keyParts = key.trim().split(".")

			let current = config
			for (let i = 0; i < keyParts.length; i++) {
				const part = keyParts[i]
				if (i === keyParts.length - 1) {
					current[part] = value
				} else {
					if (!current[part]) {
						current[part] = {}
					}
					current = current[part]
				}
			}
		}

		// Validate the parsed content with schema
		const { success, data, error } = haiConfigSchema.safeParse(config)
		if (!success) {
			console.error(`Error validating ${configPath}, Error: ${error}`)
			return
		}

		return data
	}

	static async getPostHogConfig(workspacePath?: string) {
		const config = await HaiConfig.getConfig(workspacePath)
		return config?.posthog
	}

	static async getLangfuseConfig(workspacePath?: string) {
		const config = await HaiConfig.getConfig(workspacePath)
		return config?.langfuse
	}

	static async getCorMatrixConfig(workspacePath?: string) {
		const config = await HaiConfig.getConfig(workspacePath)
		return config?.cormatrix
	}
}
