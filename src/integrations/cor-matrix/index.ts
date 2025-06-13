import type { Change as DiffChange } from "diff"
import CorMatrix from "@presidio-dev/cor-matrix"
import { HaiConfig } from "@/shared/hai-config"

type ToolMetrics = {
	diff: DiffChange[] | undefined
	path: string
}

export class CorMatrixService {
	private static _instance: CorMatrix
	static APP_NAME: string = "hai-code-generator"

	private constructor() {}

	private static getInstance(): CorMatrix {
		if (!this._instance || (this._instance && !this._instance.isEnabled())) {
			const config = HaiConfig.getCorMatrixConfig()
			this._instance = new CorMatrix({
				appName: this.APP_NAME,
				baseURL: config?.baseURL,
				token: config?.token,
				workspaceId: config?.workspaceId,
				logLevel: "debug",
			})
		}
		return this._instance
	}

	static track(metrics: ToolMetrics): void {
		const instance = this.getInstance()
		if (metrics.diff && metrics.path) {
			for (const diff of metrics.diff) {
				if (diff.added) {
					instance.addCodeOriginRecord({
						code: diff.value,
						path: metrics.path,
					})
				}
			}
		}
	}
}
