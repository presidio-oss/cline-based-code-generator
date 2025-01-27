import os from 'os'
import { join } from 'node:path'
import * as vscode from 'vscode'
import { directoryExists, downloadFile, fileExists, unzip } from './runtime-downloader'
import { mkdirSync, rmdirSync } from 'node:fs'

async function downloadFaiss({
    faissDownloadPath,
    faissFilename,
    faissURL,
}: {
    faissDownloadPath: string
    faissFilename: string
    faissURL: string
}): Promise<boolean> {

    console.log('faiss', `downloading faiss from ${faissURL}`)

    const abortController = new AbortController()

    mkdirSync(faissDownloadPath, { recursive: true })

    try {

        const faissZipFile = join(faissDownloadPath, faissFilename)

        const buildPath = join(faissDownloadPath, 'build');

        if (directoryExists(buildPath)) {
            console.log('faiss', 'Removing existing build directory');
            rmdirSync(buildPath, { recursive: true });
        }

        if (fileExists(faissZipFile)) {
            console.log('faiss', 'faiss already downloaded, reusing')
            await unzip(faissZipFile, faissDownloadPath)
            return false
        }

        console.log('faiss', `faissZipFile: ${faissZipFile}`)

        await downloadFile(faissURL, faissZipFile, abortController.signal)

        console.log('faiss', `downloaded faiss to ${faissDownloadPath}`)

        await unzip(faissZipFile, faissDownloadPath)

        console.log('faiss', `extracted faiss to ${faissDownloadPath}`)

        return true
    } catch (err) {
        console.error('faiss', err)
        return false
    }
}

export async function ensureFaissPlatformDeps() {
    const platform = os.platform()
    const arch = os.arch()
    const supportedPlatforms = ['darwin', 'linux', 'linuxmusl', 'win32']
    const supportedArchs = ['x64', 'arm64']
    if (!supportedPlatforms.includes(platform) || !supportedArchs.includes(arch)) {
        throw new Error(`Unsupported platform: ${platform} ${arch}`)
    }
    const downloadUrl = `https://github.com/ewfian/faiss-node/releases/download/v0.5.1/faiss-node-v0.5.1-napi-v8-${platform}-${arch}.tar.gz`

    const extensionPath = vscode.extensions.getExtension('presidio-inc.hai-build-code-generator')?.extensionPath

    console.log('faiss', `extensionPath: ${extensionPath}`)

    if (!extensionPath) {
        return false
    }

    return await downloadFaiss({
        faissDownloadPath: join(extensionPath, 'node_modules', 'faiss-node'),
        faissFilename: `faiss-node-v0.5.1-napi-v8-${platform}-${arch}.tar.gz`,
        faissURL: downloadUrl,
    })
}