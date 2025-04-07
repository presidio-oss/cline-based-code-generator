import React from "react"
import { z } from "zod"

// Define the Zod schema for ExpertData
export const ExpertDataSchema = z.object({
	name: z.string().min(1, "Expert name is required"), // Primary identifier, non-empty string
	prompt: z.string().min(1, "Prompt is required"), // Non-empty string
	isDefault: z.boolean().optional(), // Optional boolean
	createdAt: z.string().optional(), // Optional UTC timestamp
	fileUpload: z.boolean().optional(),
	filePath: z.string().optional(),
	iconPath: z.string().optional(),
	// For iconComponent, we'll use unknown type and cast it since Zod doesn't directly validate React component types
	iconComponent: z.unknown().optional(),
})

// Create a type from the schema
export type ExpertDataType = z.infer<typeof ExpertDataSchema>

// Original interface - keep for backward compatibility
export interface ExpertData {
	name: string // Primary identifier
	prompt: string
	isDefault?: boolean
	createdAt?: string // UTC timestamp
	fileUpload?: boolean
	filePath?: string
	iconPath?: string
	iconComponent?: React.ComponentType<React.SVGProps<SVGSVGElement>>
}
