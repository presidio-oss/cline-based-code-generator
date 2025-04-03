/**
 * GitHub service for interacting with GitHub repositories
 */

/**
 * Interface for parsed GitHub URL components
 */
interface GitHubRepoInfo {
	owner: string
	repo: string
}

/**
 * Interface for GitHub repository data
 */
interface GitHubRepoData {
	stargazers_count: number
	[key: string]: any
}

/**
 * Interface for GitHub README data
 */
interface GitHubReadmeData {
	content: string
	encoding: string
	[key: string]: any
}

/**
 * Parses a GitHub URL to extract owner and repository name
 * @param githubUrl GitHub repository URL
 * @returns Object containing owner and repo name
 * @throws Error if the URL is not a valid GitHub repository URL
 */
function parseGitHubUrl(githubUrl: string): GitHubRepoInfo {
	try {
		// Handle different GitHub URL formats
		const url = new URL(githubUrl)

		// Ensure it's a GitHub URL
		if (!url.hostname.includes("github.com")) {
			throw new Error("Not a GitHub URL")
		}

		// Extract path segments
		const pathSegments = url.pathname.split("/").filter((segment) => segment.length > 0)

		// GitHub repository URLs have at least owner and repo in the path
		if (pathSegments.length < 2) {
			throw new Error("Invalid GitHub repository URL")
		}

		return {
			owner: pathSegments[0],
			repo: pathSegments[1],
		}
	} catch (error) {
		if (error instanceof Error) {
			throw new Error(`Failed to parse GitHub URL: ${error.message}`)
		}
		throw new Error("Failed to parse GitHub URL")
	}
}

/**
 * Retrieves the star count for a GitHub repository
 * @param githubUrl GitHub repository URL
 * @returns Promise with the star count number
 * @throws Error if the repository doesn't exist or there's an API error
 */
export async function getStarCount(githubUrl: string): Promise<number> {
	try {
		const { owner, repo } = parseGitHubUrl(githubUrl)
		const apiUrl = `https://api.github.com/repos/${owner}/${repo}`

		const response = await fetch(apiUrl, {
			headers: {
				Accept: "application/vnd.github.v3+json",
				"User-Agent": "HAI-Opensource-Client",
			},
		})

		if (!response.ok) {
			if (response.status === 404) {
				throw new Error(`Repository ${owner}/${repo} not found`)
			} else if (response.status === 403) {
				throw new Error("GitHub API rate limit exceeded")
			} else {
				throw new Error(`GitHub API error: ${response.status} ${response.statusText}`)
			}
		}

		const data = (await response.json()) as GitHubRepoData
		return data.stargazers_count
	} catch (error) {
		if (error instanceof Error) {
			throw error
		}
		throw new Error("Failed to get repository star count")
	}
}

/**
 * Retrieves the README.md content from a GitHub repository
 * @param githubUrl GitHub repository URL
 * @returns Promise with the README content as string
 * @throws Error if the README doesn't exist or there's an API error
 */
export async function getReadmeContent(githubUrl: string): Promise<string> {
	try {
		const { owner, repo } = parseGitHubUrl(githubUrl)
		const apiUrl = `https://api.github.com/repos/${owner}/${repo}/readme`

		const response = await fetch(apiUrl, {
			headers: {
				Accept: "application/vnd.github.v3+json",
				"User-Agent": "HAI-Opensource-Client",
			},
		})

		if (!response.ok) {
			if (response.status === 404) {
				throw new Error(`README not found for repository ${owner}/${repo}`)
			} else if (response.status === 403) {
				throw new Error("GitHub API rate limit exceeded")
			} else {
				throw new Error(`GitHub API error: ${response.status} ${response.statusText}`)
			}
		}

		const data = (await response.json()) as GitHubReadmeData

		// GitHub API returns README content as Base64 encoded
		if (data.encoding === "base64") {
			// Decode Base64 content
			return Buffer.from(data.content, "base64").toString("utf-8")
		}

		return data.content
	} catch (error) {
		if (error instanceof Error) {
			throw error
		}
		throw new Error("Failed to get repository README content")
	}
}
