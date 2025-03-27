import React from "react"
export interface ExpertData {
	name: string // Primary identifier
	prompt: string
	isDefault: boolean
	createdAt?: string // UTC timestamp
	fileUpload?: boolean
	filePath?: string
	iconPath?: string
	iconComponent?: React.ComponentType<React.SVGProps<SVGSVGElement>>
}
