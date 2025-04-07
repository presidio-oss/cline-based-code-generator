import { specifMcp } from "../integrations/custom-mcp/specif-mcp"
import { getReadmeContent } from "../services/github/github"
import { McpDownloadResponse } from "../shared/mcp"

// Registry of all local MCPs
const localMcps = {
	[specifMcp.mcpId]: specifMcp,
	// Future local MCPs can be added here
}

/**
 * Checks if an MCP is available locally
 * @param mcpId The MCP identifier to check
 * @returns boolean indicating if the MCP is available locally
 */
export function isLocalMcp(mcpId: string): boolean {
	return mcpId in localMcps
}

/**
 * Gets the local MCP definition
 * @param mcpId The MCP identifier
 * @returns The MCP definition or undefined if not found
 */
export function getLocalMcp(mcpId: string) {
	return localMcps[mcpId]
}

/**
 * Gets all local MCPs from the registry
 * @returns Object containing all registered local MCPs
 */
export function getAllLocalMcps() {
	return localMcps
}

/**
 * Gets detailed information for a local MCP, including README content
 * @param mcpId The MCP identifier
 * @returns Promise with the MCP download response
 * @throws Error if MCP is not available locally or README fetching fails
 */
export async function getLocalMcpDetails(mcpId: string): Promise<McpDownloadResponse> {
	if (!isLocalMcp(mcpId)) {
		throw new Error(`MCP ${mcpId} is not available locally`)
	}

	const mcp = localMcps[mcpId]
	const readmeContent = await getReadmeContent(mcp.githubUrl)

	return {
		mcpId: mcp.mcpId,
		name: mcp.name,
		githubUrl: mcp.githubUrl,
		readmeContent: readmeContent,
		llmsInstallationContent: "", // This can be customized per MCP if needed
		author: mcp.author,
		description: mcp.description,
		requiresApiKey: mcp.requiresApiKey,
	}
}
