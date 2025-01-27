# HAI API

The HAI extension exposes an API that can be used by other extensions. To use this API in your extension:

1. Copy `src/extension-api/hai.d.ts` to your extension's source directory.
2. Include `hai.d.ts` in your extension's compilation.
3. Get access to the API with the following code:

    ```ts
    const haiExtension = vscode.extensions.getExtension<HaiAPI>("presidio-inc.hai-build-code-generator")

    if (!haiExtension?.isActive) {
    	throw new Error("HAI extension is not activated")
    }

    const hai = haiExtension.exports

    if (hai) {
    	// Now you can use the API

    	// Set custom instructions
    	await hai.setCustomInstructions("Talk like a pirate")

    	// Get custom instructions
    	const instructions = await hai.getCustomInstructions()
    	console.log("Current custom instructions:", instructions)

    	// Start a new task with an initial message
    	await hai.startNewTask("Hello, HAI! Let's make a new project...")

    	// Start a new task with an initial message and images
    	await hai.startNewTask("Use this design language", ["data:image/webp;base64,..."])

    	// Send a message to the current task
    	await hai.sendMessage("Can you fix the @problems?")

    	// Simulate pressing the primary button in the chat interface (e.g. 'Save' or 'Proceed While Running')
    	await hai.pressPrimaryButton()

    	// Simulate pressing the secondary button in the chat interface (e.g. 'Reject')
    	await hai.pressSecondaryButton()
    } else {
    	console.error("HAI API is not available")
    }
    ```

    **Note:** To ensure that the `presidio-inc.hai-build-code-generato` extension is activated before your extension, add it to the `extensionDependencies` in your `package.json`:

    ```json
    "extensionDependencies": [
        "presidio-inc.hai-build-code-generator"
    ]
    ```

For detailed information on the available methods and their usage, refer to the `hai.d.ts` file.
