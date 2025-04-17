import { z } from "zod"

export const DocumentStatus = z.enum(["pending", "processing", "completed", "failed"])

export const DocumentLinkSchema = z.object({
	url: z.string().trim().url("Must be a valid URL"),
	filename: z.string().trim().optional(),
	status: DocumentStatus.optional(),
	processedAt: z.string().trim().optional(),
	error: z.string().nullable().optional(),
})

export type DocumentLink = z.infer<typeof DocumentLinkSchema>

export const ExpertDataSchema = z.object({
	name: z.string().trim().min(1, "Expert name is required"),
	prompt: z.string().trim().min(1, "Prompt is required"),
	isDefault: z.boolean().optional(),
	createdAt: z.string().trim().optional(),
	fileUpload: z.boolean().optional(),
	filePath: z.string().trim().optional(),
	iconPath: z.string().trim().optional(),
	iconComponent: z.unknown().optional(),
	documentLinks: z.array(DocumentLinkSchema).optional(),
})

export type ExpertDataType = z.infer<typeof ExpertDataSchema>

export interface ExpertData {
	name: string
	prompt: string
	isDefault?: boolean
	createdAt?: string
	fileUpload?: boolean
	filePath?: string
	iconPath?: string
	iconComponent?: any
	documentLinks?: DocumentLink[]
}
