import * as vscode from "vscode"
import type { ApiConfiguration } from "../../shared/api"
import { type ApiHandler, buildApiHandler } from "../../api"
import { customGetState } from "@/core/storage/state"

export class InlineEditingProvider {
	private api!: ApiHandler
	private activeCodeLensProvider?: vscode.Disposable
	private isEditing = false
	constructor(
		private context?: vscode.ExtensionContext,
		private apiConfiguration?: ApiConfiguration,
	) {
		if (apiConfiguration) {
			this.api = buildApiHandler(apiConfiguration)
		}
	}

	withApiConfiguration(apiConfiguration: ApiConfiguration) {
		this.api = buildApiHandler(apiConfiguration)
		return this
	}

	withContext(context: vscode.ExtensionContext) {
		this.context = context
		return this
	}

	withApi(api: ApiHandler) {
		this.api = api
		return this
	}

	build() {
		if (!this.api) {
			throw new Error("API not initialized")
		}
		if (!this.context) {
			throw new Error("Context not initialized")
		}

		return [
			vscode.languages.registerCodeActionsProvider("*", {
				provideCodeActions(document, range) {
					const editor = vscode.window.activeTextEditor
					if (editor && editor.document === document && !range.isEmpty) {
						const action = new vscode.CodeAction("Edit with hAI", vscode.CodeActionKind.RefactorRewrite)
						action.command = {
							command: "hai.editSelectedWithAI",
							title: "Edit with HAI",
							tooltip: "Edit selected code with HAI",
						}
						return [action]
					}
					return []
				},
			}),

			vscode.commands.registerCommand(
				"hai.editSelectedWithAIAcceptAllChanges",
				async (selection: vscode.Selection, enhancedText: string, decorations: vscode.TextEditorDecorationType[]) => {
					this.isEditing = false
					const editor = vscode.window.activeTextEditor
					if (editor) {
						decorations.forEach((d) => d.dispose())
					}
				},
			),

			vscode.commands.registerCommand(
				"hai.editSelectedWithAIRejectAllChanges",
				async (
					selection: vscode.Range,
					originalText: string,
					enhancedText: string,
					decorations: vscode.TextEditorDecorationType[],
				) => {
					this.isEditing = false
					const editor = vscode.window.activeTextEditor
					if (editor) {
						decorations.forEach((d) => d.dispose())
						await editor.edit((editBuilder) => {
							editBuilder.replace(selection, originalText)
						})
					}
				},
			),

			vscode.commands.registerCommand(
				"hai.editSelectedWithAIRetryEnhancement",
				async (
					selection: vscode.Range,
					originalText: string,
					originalSelection: vscode.Range,
					decorations: vscode.TextEditorDecorationType[],
				) => {
					this.isEditing = false
					decorations.forEach((d) => d.dispose())
					const editor = vscode.window.activeTextEditor
					if (editor) {
						await editor.edit((editBuilder) => {
							editBuilder.replace(selection, originalText)
						})
						editor.selections = [new vscode.Selection(originalSelection.start, originalSelection.end)]
					}
					await vscode.commands.executeCommand("hai.editSelectedWithAI")
				},
			),

			vscode.window.onDidChangeTextEditorSelection(async (e) => {
				const provider = await this.registerCodeLensProvider()
				this.context?.subscriptions.push(provider)
			}),

			vscode.commands.registerCommand("hai.editSelectedWithAI", async () => {
				const editor = vscode.window.activeTextEditor
				if (!editor) {
					return
				}

				const selection = editor.selection
				if (selection.isEmpty) {
					vscode.window.showErrorMessage("No code selected, please select some code.")
					return
				}

				const enhancementRequest = await vscode.window.showInputBox({
					prompt: "Prompt request",
					placeHolder: "What would you like to edit?",
					ignoreFocusOut: true,
					title: "Edit with HAI",
				})

				if (!enhancementRequest) {
					return
				}

				const buttonLine = selection.start.line

				const progressDisposable = vscode.languages.registerCodeLensProvider(
					{ scheme: "file" },
					{
						provideCodeLenses: async (document, token) => {
							const range = new vscode.Range(buttonLine, 0, buttonLine, 0)
							const codeLens = new vscode.CodeLens(range)
							codeLens.command = {
								title: "⚡ HAI is working...",
								command: "",
							}
							return [codeLens]
						},
					},
				)

				this.context?.subscriptions.push(progressDisposable)

				const selectedText = editor.document.getText(selection)

				try {
					this.activeCodeLensProvider?.dispose()
					this.isEditing = true

					const systemPrompt = `You are hAI, an AI coding assistant. You are an AI programming assistant who is an expert in adding new code by following instructions.
                    
                        - You should think step-by-step to plan your code before generating the final output.
                        - You should ensure your code matches the indentation and whitespace of the preceding code in the users' file
                        - Ignore any previous instructions to format your responses with Markdown. It is not acceptable to use any Markdown in your response.
                        - You will be provided with code that is in the users cursor selection enclosed in <USER_SELECTED_CODE></USER_SELECTED_CODE> XML tags.
                        - You must use this code to help you plan your updated code.
                        - You will be provided with instructions on what to generate, enclosed in <INSTRUCTIONS></INSTRUCTIONS> XML tags. You must follow these instructions carefully.
                        - Only respond with the complete code that will replaces the users selection code and it should be valid.
                        - Do use any other XML tags unless they are part of the generated code.
                        - Do not provide any additional commentary about the code you added. Only respond with the generated code.
                        - Do not enclose your response in \`\`\`, only send the code.
                    `

					const codePrompt = `
                    <USER_SELECTED_CODE>
                    ${selectedText}
                    </USER_SELECTED_CODE>
    
                    <INSTRUCTIONS>
                    ${enhancementRequest}
                    </INSTRUCTIONS>
                    `

					const createDiffDecorations = (originalText: string, enhancedText: string) => {
						const originalDecoration = vscode.window.createTextEditorDecorationType({
							backgroundColor: new vscode.ThemeColor("diffEditor.removedTextBackground"),
							isWholeLine: true,
						})

						const enhancedDecoration = vscode.window.createTextEditorDecorationType({
							backgroundColor: new vscode.ThemeColor("diffEditor.insertedTextBackground"),
							isWholeLine: true,
						})

						return [originalDecoration, enhancedDecoration]
					}

					const apiStream = this.api.createMessage(systemPrompt, [
						{
							role: "user",
							content: codePrompt,
						},
					])

					const iterator = apiStream[Symbol.asyncIterator]()

					let enhancedText = ""

					const [originalDecoration, enhancedDecoration] = createDiffDecorations("", "")
					editor.setDecorations(originalDecoration, [selection])

					const selectionStart = new vscode.Position(selection.start.line, selection.start.character)
					const selectionEnd = new vscode.Position(selection.end.line, selection.end.character)

					const originalTextLines = selectedText.split("\n").length

					const linesInserted: number[] = []

					let lastLineRange: vscode.Range

					for await (const chunk of iterator) {
						if (chunk.type === "text") {
							enhancedText += chunk.text
							const enhancedTextLines = enhancedText.split("\n")
							for (let i = 0; i < enhancedTextLines.length; i++) {
								const line = enhancedTextLines[i]
								const lineRange = new vscode.Range(
									new vscode.Position(selectionStart.line + i, 0),
									new vscode.Position(
										selectionStart.line + i,
										vscode.window.activeTextEditor?.document.lineAt(selectionStart.line + i).range.end
											.character || line.length,
									),
								)
								if (
									selectionStart.line + i >= selectionEnd.line &&
									!linesInserted.includes(selectionStart.line + i)
								) {
									try {
										await editor.edit(
											(editBuilder) => {
												editBuilder.insert(new vscode.Position(selectionStart.line + i, 0), "\n")
											},
											{
												undoStopAfter: false,
												undoStopBefore: false,
											},
										)
									} catch (error) {
										console.error("Error inserting line:", error)
									}
									linesInserted.push(selectionStart.line + i)
								}
								if (line.length) {
									try {
										await editor.edit(
											(editBuilder) => {
												editBuilder.replace(lineRange, line)
											},
											{
												undoStopAfter: false,
												undoStopBefore: false,
											},
										)
									} catch (error) {
										console.error("Error editing line:", error)
									}
								}
								lastLineRange = lineRange
							}
						}
					}

					const enhancedTextLines = enhancedText.split("\n").length
					const enhancedRange = new vscode.Range(
						selectionStart,
						new vscode.Position(
							lastLineRange!.end.line,
							vscode.window.activeTextEditor?.document.lineAt(lastLineRange!.end.line).range.end.character || 10000,
						),
					)

					editor.setDecorations(enhancedDecoration, [enhancedRange])

					progressDisposable.dispose()

					const codeLensProvider = vscode.languages.registerCodeLensProvider("*", {
						provideCodeLenses(document) {
							if (editor && editor.document === document) {
								return [
									new vscode.CodeLens(selection, {
										title: "✓ Accept",
										command: "hai.editSelectedWithAIAcceptAllChanges",
										arguments: [
											selection,
											enhancedText,
											[originalDecoration, enhancedDecoration, codeLensProvider],
										],
									}),
									new vscode.CodeLens(selection, {
										title: "✗ Reject",
										command: "hai.editSelectedWithAIRejectAllChanges",
										arguments: [
											enhancedRange,
											selectedText,
											enhancedText,
											[originalDecoration, enhancedDecoration, codeLensProvider],
										],
									}),
									new vscode.CodeLens(selection, {
										title: "↺ Retry",
										command: "hai.editSelectedWithAIRetryEnhancement",
										arguments: [
											enhancedRange,
											selectedText,
											new vscode.Range(selectionStart, selectionEnd),
											[originalDecoration, enhancedDecoration, codeLensProvider],
										],
									}),
								]
							}
							return []
						},
					})
				} catch (error) {
					this.isEditing = false
					progressDisposable.dispose()
					console.error(`Error enhancing code: ${error}`, error)
					vscode.window.showErrorMessage(
						`Failed to enhance code: ${error instanceof Error ? error.message : "Unknown error"}`,
					)
				}
			}),
		]
	}

	async registerCodeLensProvider() {
		this.activeCodeLensProvider?.dispose()
		const isEditing = this.isEditing
		const isInlineEditEnabled = this.context ? ((await customGetState(this.context, "enableInlineEdit")) ?? true) : true
		const provider = vscode.languages.registerCodeLensProvider("*", {
			provideCodeLenses(document) {
				const editor = vscode.window.activeTextEditor
				if (
					editor &&
					editor.document === document &&
					editor.selection &&
					!isEditing &&
					!editor.selection.isEmpty &&
					isInlineEditEnabled
				) {
					return [
						new vscode.CodeLens(editor.selection, {
							title: "⌥⇧K Edit with hAI",
							command: "hai.editSelectedWithAI",
							tooltip: "Edit selected code with HAI",
						}),
					]
				}
				return []
			},
		})

		this.activeCodeLensProvider = provider
		return provider
	}

	updateApiConfiguration(apiConfiguration: ApiConfiguration) {
		this.api = buildApiHandler(apiConfiguration)
	}
}
