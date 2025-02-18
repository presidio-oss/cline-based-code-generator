import { HaiBuildDefaults } from "../../shared/haiDefaults"

export const DefaultSecretFilesPatternToIgnore = HaiBuildDefaults.defaultSecretFilesPatternToIgnore

export function isCommandIncludedInSecretScanning(command?: string, userPatterns?: string[]): boolean {
	if (!command) {
		return false
	}

	const patterns = userPatterns ? userPatterns : DefaultSecretFilesPatternToIgnore

	const isSecretFileName = patterns.some((pattern) => {
		// Convert glob pattern to regex
		const regexPattern = pattern.replace(".", "\\.").replace("*", ".*")
		return new RegExp(`^${regexPattern}$`).test(command)
	})

	return isSecretFileName
}

export function isSecretFile(filePath: string, userPatterns?: string[]): boolean {
	const normalizedPath = filePath.replace(/\\/g, "/")

	const fileName = normalizedPath.split("/").pop() || ""

	const patterns = userPatterns ? userPatterns : DefaultSecretFilesPatternToIgnore

	// Check if filename matches any pattern in DefaultSecretFilesPatternToIgnore
	const isSecretFileName = patterns.some((pattern) => {
		// Convert glob pattern to regex
		const regexPattern = pattern.replace(".", "\\.").replace("*", ".*")
		return new RegExp(`^${regexPattern}$`).test(fileName)
	})

	return isSecretFileName
}

interface SecretDetectionResult {
	detected: boolean
	types: string[]
}

interface SecretPattern {
	type: string
	regex: RegExp
}

function detectSecrets(input: string): SecretDetectionResult {
	const secretPatterns: SecretPattern[] = [
		{
			type: "AWS Access Key",
			regex: /AKIA[0-9A-Z]{16}/,
		},
		{
			type: "GitHub Token",
			regex: /ghp_[A-Za-z0-9]{36}/,
		},
		{
			type: "AWS Secret Key",
			regex: /(?<![A-Za-z0-9])[A-Za-z0-9/+=]{40}(?![A-Za-z0-9])/,
		},
	]

	const detectedTypes: string[] = []

	for (const pattern of secretPatterns) {
		if (pattern.regex.test(input)) {
			detectedTypes.push(pattern.type)
		}
	}

	return {
		detected: detectedTypes.length > 0,
		types: detectedTypes,
	}
}
