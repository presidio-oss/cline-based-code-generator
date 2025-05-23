import Watcher from "watcher"
import * as path from "path"
import * as fs from "fs/promises"
import ignore from "ignore"
import { HaiBuildDefaults } from "../../shared/haiDefaults"
import { FileOperations } from "../../utils/constants"
import { Controller } from "../../core/controller"
import { GlobalFileNames } from "../../global-constants"

class HaiFileSystemWatcher {
	private sourceFolder: string
	private ig: ReturnType<typeof ignore>
	private providerRef: WeakRef<Controller>
	private watcher: Watcher | undefined

	constructor(provider: Controller, sourceFolder: string) {
		this.sourceFolder = sourceFolder
		this.providerRef = new WeakRef(provider)
		this.ig = ignore()
		this.initializeWatcher().then()
	}

	private async loadGitIgnore() {
		try {
			const gitignorePath = path.join(this.sourceFolder, ".gitignore")
			const content = await fs.readFile(gitignorePath, "utf-8")

			this.ig.add(
				content
					.split("\n")
					.filter((line) => line.trim() && !line.startsWith("#")),
			)
		} catch (error) {
			console.log("HaiFileSystemWatcher No .gitignore found, using default exclusions.")
		}

		this.ig.add([...HaiBuildDefaults.defaultDirsToIgnore, HaiBuildDefaults.defaultContextDirectory])
	}

	private async initializeWatcher() {
		await this.loadGitIgnore()

		this.watcher = new Watcher(this.sourceFolder, {
			recursive: true,
			debounce: 1000,
			ignoreInitial: true,
			ignore: (targetPath: string) => {
				if (!targetPath || targetPath.trim() === "") {
					console.warn("HaiFileSystemWatcher Ignoring empty or invalid path.")
					return true
				}

				const relativePath = path.relative(this.sourceFolder, targetPath)
				if (relativePath.startsWith("..")) {
					console.warn(`HaiFileSystemWatcher Path ${targetPath} is outside the workspace folder.`)
					return true
				}

				if (relativePath === "") {
					return false
				}
				const isIgnored = this.ig.ignores(relativePath)
				return isIgnored
			},
		})

		this.watcher.on("unlink", (filePath) => {
			console.log("HaiFileSystemWatcher File deleted", filePath)

			// Check for the experts
			if (filePath.includes(GlobalFileNames.experts)) {
				this.providerRef.deref()?.loadExperts()
			}

			this.providerRef.deref()?.invokeReindex([filePath], FileOperations.Delete)
		})

		this.watcher.on("add", (filePath) => {
			console.log("HaiFileSystemWatcher File added", filePath)

			// Check for the experts
			if (filePath.includes(GlobalFileNames.experts)) {
				this.providerRef.deref()?.loadExperts()
			}

			this.providerRef.deref()?.invokeReindex([filePath], FileOperations.Create)
		})

		this.watcher.on("change", (filePath) => {
			console.log("HaiFileSystemWatcher File changes", filePath)
			// Check for the experts
			if (filePath.includes(GlobalFileNames.experts)) {
				this.providerRef.deref()?.loadExperts()
			}
			this.providerRef.deref()?.invokeReindex([filePath], FileOperations.Change)
		})
	}

	async dispose() {
		this.watcher?.close()
	}
}

export default HaiFileSystemWatcher
