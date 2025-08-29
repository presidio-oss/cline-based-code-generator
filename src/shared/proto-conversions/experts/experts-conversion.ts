import { ExpertData as LocalExpertData, DocumentStatus as LocalDocumentStatus } from "@shared/experts"
import { ExpertData as ProtoExpertData, DocumentStatus as ProtoDocumentStatus } from "@shared/proto/cline/state"

/**
 * Converts proto DocumentStatus to local DocumentStatus
 */
export function convertProtoDocumentStatus(protoStatus?: ProtoDocumentStatus): LocalDocumentStatus | undefined {
	if (protoStatus === undefined) {
		return undefined
	}

	switch (protoStatus) {
		case ProtoDocumentStatus.DOCUMENT_PENDING:
			return LocalDocumentStatus.PENDING
		case ProtoDocumentStatus.DOCUMENT_PROCESSING:
			return LocalDocumentStatus.PROCESSING
		case ProtoDocumentStatus.DOCUMENT_COMPLETED:
			return LocalDocumentStatus.COMPLETED
		case ProtoDocumentStatus.DOCUMENT_FAILED:
			return LocalDocumentStatus.FAILED
		default:
			return undefined
	}
}

/**
 * Converts local DocumentStatus to proto DocumentStatus
 */
export function convertLocalDocumentStatusToProto(localStatus?: LocalDocumentStatus): ProtoDocumentStatus | undefined {
	if (localStatus === undefined) {
		return undefined
	}

	switch (localStatus) {
		case LocalDocumentStatus.PENDING:
			return ProtoDocumentStatus.DOCUMENT_PENDING
		case LocalDocumentStatus.PROCESSING:
			return ProtoDocumentStatus.DOCUMENT_PROCESSING
		case LocalDocumentStatus.COMPLETED:
			return ProtoDocumentStatus.DOCUMENT_COMPLETED
		case LocalDocumentStatus.FAILED:
			return ProtoDocumentStatus.DOCUMENT_FAILED
		default:
			return undefined
	}
}

/**
 * Converts proto ExpertData to local ExpertData
 */
export function convertProtoToLocalExpertData(protoExpert: ProtoExpertData): LocalExpertData {
	return {
		name: protoExpert.name,
		prompt: protoExpert.prompt,
		isDefault: protoExpert.isDefault,
		createdAt: protoExpert.createdAt,
		iconComponent: protoExpert.iconComponent,
		documentLinks:
			protoExpert.documentLinks?.map((link) => ({
				url: link.url,
				status: convertProtoDocumentStatus(link.status),
				processedAt: link.processedAt,
				filename: link.filename,
				error: link.error || undefined,
			})) || [],
		deepCrawl: protoExpert.deepCrawl,
		maxDepth: protoExpert.maxDepth,
		maxPages: protoExpert.maxPages,
		crawlTimeout: protoExpert.crawlTimeout,
	}
}

/**
 * Converts local ExpertData to proto ExpertData
 */
export function convertLocalToProtoExpertData(localExpert: LocalExpertData): ProtoExpertData {
	return ProtoExpertData.create({
		name: localExpert.name,
		prompt: localExpert.prompt,
		isDefault: localExpert.isDefault,
		createdAt: localExpert.createdAt,
		iconComponent: localExpert.iconComponent,
		documentLinks:
			localExpert.documentLinks?.map((link) => ({
				url: link.url,
				status: convertLocalDocumentStatusToProto(link.status),
				processedAt: link.processedAt,
				filename: link.filename,
				error: link.error || undefined,
			})) || [],
		deepCrawl: localExpert.deepCrawl,
		maxDepth: localExpert.maxDepth,
		maxPages: localExpert.maxPages,
		crawlTimeout: localExpert.crawlTimeout,
	})
}
