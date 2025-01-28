import { ChildProcessWithoutNullStreams, spawn } from "child_process"

interface ResponseListener {
	resolve: (value?: any) => void
	reject: (reason?: any) => void
}

interface BinaryPath {
	path: string
	args?: any[]
}

interface JsonRpcRequest {
	id: number
	method?: string
	params?: any[]
}

interface JsonRpcResponse {
	id?: number
	result?: any[]
	error?: any
}

class JsonRpcClient {
	serverProcess: ChildProcessWithoutNullStreams
	responseListeners: Record<number, ResponseListener>
	requestId: number

	constructor(binary: BinaryPath) {
		this.serverProcess = spawn(binary.path, binary.args ?? [])
		this.serverProcess.stdout.setEncoding("utf8")
		this.responseListeners = {}
		this.requestId = 1

		this.serverProcess.stdout.on("data", (data) => {
			const responses = data.trim().split("\n")
			for (let response of responses) {
				try {
					const jsonResponse = JSON.parse(response)
					const { id, result, error } = jsonResponse
					const callback = this.responseListeners[id]
					if (callback) {
						delete this.responseListeners[id]
						if (error) {
							callback.reject(error)
						} else {
							callback.resolve(result)
						}
					}
				} catch (error) {
					console.error("Error parsing response:", error)
				}
			}
		})
	}

	rpcCall<T extends unknown>(method: string, params?: any[]) {
		return new Promise<T>((resolve, reject) => {
			const id = this.requestId++
			const request = JSON.stringify({
				jsonrpc: "2.0",
				method,
				params: params ?? [],
				id,
			})
			this.responseListeners[id] = { resolve, reject }
			this.serverProcess.stdin.write(request + "\n")
		})
	}

	close() {
		this.serverProcess.stdin.end()
		this.serverProcess.kill()
	}
}

// Example Usage
// (async () => {
//     const client = new JsonRpcClient({
//         path: '/Users/presidio/Desktop/git/jarvis-gitlab/jarvis-code-generator/venv/bin/python',
//         args: ['/Users/presidio/Desktop/git/jarvis-gitlab/jarvis-code-generator/src/cli.py', '--rpc']
//     });
//     await client.rpcCall<String>("version").then(console.log).catch(console.error);
//     await client.rpcCall<String>("model").then(console.log).catch(console.error);
//     await client.rpcCall<Array<String>>("find_files", [
//         'implement a test case to validate that extension is activated',
//         '/Users/presidio/Desktop/git/jarvis-gitlab/hai-vscode-plugin-v2/src'
//     ]).then(console.log).catch(console.error);
//     client.close();
// })();
