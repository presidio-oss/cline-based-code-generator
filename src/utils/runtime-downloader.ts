import { accessSync, createWriteStream, statSync } from "node:fs"
import axios from "axios"
import { x as extract } from "tar"

export function pathExists(path: string): boolean {
	try {
		accessSync(path)
		return true
	} catch {
		return false
	}
}

export function fileExists(path: string): boolean {
	try {
		const stat = statSync(path)
		return stat.isFile()
	} catch (err: any) {
		return false
	}
}

export function directoryExists(path: string): boolean {
	try {
		const stat = statSync(path)
		return stat.isDirectory()
	} catch (err: any) {
		return false
	}
}

export async function downloadFile(
	url: string,
	outputPath: string,
	signal?: AbortSignal,
	onProgress?: (progress: { loaded: number; total: number; percent: number }) => void,
): Promise<void> {
	const response = await axios({
		url,
		method: "GET",
		responseType: "stream",
		maxRedirects: 10,
		signal: signal,
	})
	const total = parseInt(response.headers["content-length"], 10)

	let loaded = 0

	const stream = createWriteStream(outputPath, { autoClose: true, flags: "w" })
	response.data.on("data", (chunk: any) => {
		loaded += chunk.length
		const percent = Math.floor((loaded / total) * 100)
		onProgress && onProgress({ loaded, total, percent })
	})
	response.data.pipe(stream)

	await new Promise((resolve, reject) => {
		stream.on("finish", resolve)
		stream.on("error", reject)
		stream.on("close", () => {
			if (!stream.writableFinished) {
				reject(new Error("Stream closed before finishing"))
			}
		})
	})
}

export async function unzip(zipFile: string, destinationDir: string): Promise<void> {
	await extract({
		file: zipFile,
		cwd: destinationDir,
	})
}
