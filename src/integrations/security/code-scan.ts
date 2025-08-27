import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { isBinaryFileSync } from "isbinaryfile"
import { buildApiHandler } from "../../api"
import { ApiConfiguration } from "../../shared/api"
import { getApiStreamResponse } from "../code-prep/helper"
import { HaiBuildDefaults } from "../../shared/haiDefaults"
import { fileExists } from "../../utils/runtime-downloader"
import { Mode } from "@/shared/storage/types"

export class CodeScanner {
	private apiConfig!: ApiConfiguration
	private systemPrompt: string
	private maxRetry: number
	private currentMode!: Mode

	constructor() {
		this.systemPrompt = HaiBuildDefaults.defaultCodeScannerSystemPrompt
		this.maxRetry = HaiBuildDefaults.defaultCodeScannerMaxRetry
	}

	withApiConfig(apiConfig: ApiConfiguration) {
		this.apiConfig = apiConfig
		return this
	}

	withCurrentMode(mode: Mode) {
		this.currentMode = mode
		return this
	}

	withSystemPrompt(prompt: string) {
		this.systemPrompt = prompt
		return this
	}

	build(): CodeScanner {
		if (!this.apiConfig) {
			throw new Error("API configuration is required before building the CodeScanner.")
		}
		return this
	}

	scanCode(code: string, maxRetry: number = this.maxRetry): Promise<string> {
		const executeScan = (retryCount: number): Promise<string> => {
			return new Promise((resolve) => {
				const llmApi = buildApiHandler(this.apiConfig, this.currentMode)
				const userPrompt = `<code>${code}</code>`
				const apiStream = llmApi.createMessage(this.systemPrompt, [
					{
						role: "user",
						content: userPrompt,
					},
				])
				getApiStreamResponse(apiStream)
					.then((response) => resolve(response))
					.catch((error) => {
						if (retryCount > 0) {
							resolve(executeScan(retryCount - 1))
						} else {
							resolve(`Unable to scan code for code for potential security vulnerabilities, skipped the code scan`)
						}
					})
			})
		}

		return executeScan(maxRetry)
	}

	scanFile(filePath: string, cwd?: string): Promise<string> {
		if (cwd) {
			filePath = resolve(cwd, filePath)
		}
		if (!fileExists(filePath)) {
			return Promise.resolve(`File not found, skipped the code scan`)
		}
		if (isBinaryFileSync(filePath)) {
			return Promise.resolve(`Binary file detected, skipped the code scan`)
		}
		const fileContent = readFileSync(filePath, "utf-8")
		return this.scanCode(fileContent)
	}

	scanFiles(filePaths: string[], cwd?: string, concurrency: number = 5): Promise<{ path: string; result: string }[]> {
		let index = 0
		const results: { path: string; result: string }[] = []

		const executeConcurrentScans = (): Promise<void> => {
			if (index >= filePaths.length) {
				return Promise.resolve()
			}

			const currentBatch = filePaths.slice(index, index + concurrency)
			index += concurrency

			return Promise.all(
				currentBatch.map((filePath) => this.scanFile(filePath, cwd).then((result) => ({ path: filePath, result }))),
			).then((batchResults) => {
				results.push(...batchResults)
				return executeConcurrentScans()
			})
		}

		return executeConcurrentScans().then(() => results)
	}
}

// Example Usage

// const llmApiConfig: ApiConfiguration = {
//     apiProvider: 'openai-native',
//     apiModelId: 'gpt-4o',
//     openAiNativeApiKey: 'sk-proj-'
// };

// const codeScanner = new CodeScanner()
//     .withApiConfig(llmApiConfig)
//     .build()

// const code = `import * as assert from 'assert';

// // You can import and use all API from the 'vscode' module
// // as well as import your extension to test it
// import * as vscode from 'vscode';
// // import * as myExtension from '../../extension';

// suite('Extension Test Suite', () => {
// 	vscode.window.showInformationMessage('Start all tests.');

// 	test('Sample test', () => {
// 		assert.strictEqual(-1, [1, 2, 3].indexOf(5));
// 		assert.strictEqual(-1, [1, 2, 3].indexOf(0));
// 	});
// });
// `;

// codeScanner.scanCode(code).then(result => console.log(result)).catch(err => console.error(err));
