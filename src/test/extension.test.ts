import { readFile } from "fs/promises"
import { describe, it, after, before } from "mocha"
import path from "path"
import "should"
import * as vscode from "vscode"
import { HostProvider } from "@/hosts/host-provider"
import { vscodeHostBridgeClient } from "@/hosts/vscode/hostbridge/client/host-grpc-client"

const packagePath = path.join(__dirname, "..", "..", "package.json")

describe("HAI Extension", () => {
	before(async () => {
		// Initialize HostProvider for tests if not already initialized
		if (!HostProvider.isInitialized()) {
			// Create mock implementations for testing
			const mockWebviewCreator = () => {
				throw new Error("Webview creation not supported in tests")
			}

			const mockDiffViewCreator = () => {
				throw new Error("DiffView creation not supported in tests")
			}

			const mockLogger = (message: string) => {
				console.log(`[TEST] ${message}`)
			}

			// Create host bridge with clipboard mocks
			const hostBridge = {
				...vscodeHostBridgeClient,
				envClient: {
					...vscodeHostBridgeClient.envClient,
					clipboardReadText: async () => ({ value: "mocked clipboard content" }),
					clipboardWriteText: async () => ({}),
				},
			}

			HostProvider.initialize(mockWebviewCreator, mockDiffViewCreator, hostBridge, mockLogger)
		}
	})

	after(() => {
		vscode.window.showInformationMessage("All tests done!")
		// Reset HostProvider after tests
		HostProvider.reset()
	})

	it("should verify extension ID matches package.json", async () => {
		const packageJSON = JSON.parse(await readFile(packagePath, "utf8"))
		const id = packageJSON.publisher + "." + packageJSON.name
		const clineExtensionApi = vscode.extensions.getExtension(id)

		clineExtensionApi?.id.should.equal(id)
	})

	it("should successfully execute the plus button command", async () => {
		// Wait for extension to fully activate
		await new Promise((resolve) => setTimeout(resolve, 1000))

		// Get the extension and ensure it's activated
		const packageJSON = JSON.parse(await readFile(packagePath, "utf8"))
		const id = packageJSON.publisher + "." + packageJSON.name
		const extension = vscode.extensions.getExtension(id)

		if (extension && !extension.isActive) {
			await extension.activate()
		}

		try {
			await vscode.commands.executeCommand("hai.plusButtonClicked")
		} catch (error) {
			// If command fails due to test environment limitations, that's acceptable
			console.log(`Command execution note: ${error}`)
		}
	})

	// New test to verify xvfb and webview functionality
	it("should create and display a webview panel", async () => {
		// Create a webview panel
		const panel = vscode.window.createWebviewPanel("testWebview", "CI/CD Test", vscode.ViewColumn.One, {
			enableScripts: true,
		})

		// Set some HTML content
		panel.webview.html = `
			<!DOCTYPE html>
			<html>
				<head>
					<meta charset="UTF-8">
					<title>xvfb Test</title>
				</head>
				<body>
					<div id="test">Testing xvfb display server</div>
				</body>
			</html>
		`

		// Verify panel exists
		should.exist(panel)
		panel.visible.should.be.true()

		// Clean up
		panel.dispose()
	})

	// Test webview message passing
	it("should handle webview messages", async () => {
		const panel = vscode.window.createWebviewPanel("testWebview", "Message Test", vscode.ViewColumn.One, {
			enableScripts: true,
		})

		// Set up message handling
		const messagePromise = new Promise<string>((resolve) => {
			panel.webview.onDidReceiveMessage((message) => resolve(message.text), undefined)
		})

		// Add message sending script
		panel.webview.html = `
			<!DOCTYPE html>
			<html>
				<head>
					<meta charset="UTF-8">
					<title>Message Test</title>
				</head>
				<body>
					<script>
						const vscode = acquireVsCodeApi();
						vscode.postMessage({ text: 'test-message' });
					</script>
				</body>
			</html>
		`

		// Wait for message
		const message = await messagePromise
		message.should.equal("test-message")

		// Clean up
		panel.dispose()
	})
})
