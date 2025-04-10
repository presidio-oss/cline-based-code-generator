import React from "react"
import { z } from "zod"

// Define document link schema
export const DocumentLinkSchema = z.object({
	url: z.string().url("Must be a valid URL"),
	filename: z.string().optional(),
	status: z.enum(["pending", "processing", "completed", "failed"]).optional(),
	processedAt: z.string().optional(),
	error: z.string().nullable().optional(),
})

export type DocumentLink = z.infer<typeof DocumentLinkSchema>

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
	documentLinks: z.array(DocumentLinkSchema).optional(),
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
	documentLinks?: DocumentLink[]
}
