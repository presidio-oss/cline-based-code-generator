import {
	GuardrailsEngine,
	injectionGuard,
	leakageGuard,
	MessageType,
	Pattern,
	piiGuard,
	secretGuard,
	SelectionType,
} from "@presidio-dev/hai-guardrails"
import * as vscode from "vscode"
import { customGetState, customUpdateState } from "../../core/storage/state"

// Define a type for our guardrails configuration
export interface GuardrailsConfig {
	injection: {
		name: string
		threshold: number
	}
	pii: {
		name: string
		selection: SelectionType
		mode: string
	}
	secret: {
		name: string
		selection: SelectionType
		mode: string
	}
	leakage: {
		name: string
		roles: MessageType[]
		threshold: number
	}
}

export class Guardrails extends GuardrailsEngine {
	public static MESSAGE = "Message blocked by Hai Guardrails filter."
	private context: vscode.ExtensionContext
	public guardsConfig: GuardrailsConfig

	// Default configuration that will be used if no config is found in state
	public static DEFAULT_GUARDS_CONFIG: GuardrailsConfig = {
		injection: {
			name: "Prompt Injection",
			threshold: 0.75,
		},
		pii: {
			name: "PII",
			selection: SelectionType.All,
			mode: "redact",
		},
		secret: {
			name: "Secrets",
			selection: SelectionType.All,
			mode: "block",
		},
		leakage: {
			name: "Prompt Leakage",
			roles: ["user"],
			threshold: 0.75,
		},
	}

	constructor(context: vscode.ExtensionContext) {
		// Initially create with default guards, will be updated after loading config
		const guards = Guardrails.createGuards(Guardrails.DEFAULT_GUARDS_CONFIG)
		super({ guards })

		this.context = context
		this.guardsConfig = Guardrails.DEFAULT_GUARDS_CONFIG

		// Load configuration asynchronously
		this.loadGuardsConfig().then(() => {
			// Update guards after loading config
			this.updateGuards()
		})
	}

	private async loadGuardsConfig(): Promise<void> {
		const storedConfig = (await customGetState(this.context, "guardrailsConfig")) as GuardrailsConfig | undefined
		if (storedConfig) {
			this.guardsConfig = storedConfig
		} else {
			// If no config exists in storage, save the default one
			await this.saveGuardsConfig()
		}
	}

	private async saveGuardsConfig(): Promise<void> {
		await customUpdateState(this.context, "guardrailsConfig", this.guardsConfig)
	}

	private updateGuards(): void {
		Guardrails.createGuards(this.guardsConfig)
	}

	private static createGuards(config: GuardrailsConfig) {
		return [
			injectionGuard({ roles: ["user"] }, { mode: "heuristic", threshold: config.injection.threshold }),
			piiGuard({
				selection: config.pii.selection,
				mode: config.pii.mode as "redact" | "block",
				patterns: [
					{
						id: "Email-pattern",
						name: "Email pattern",
						description: "Redact email in all combinations of special characters",
						regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
						replacement: "####",
					},
				],
			}),
			secretGuard({
				selection: config.secret.selection,
				mode: config.secret.mode as "redact" | "block",
			}),
			leakageGuard({ roles: config.leakage.roles }, { mode: "heuristic", threshold: config.leakage.threshold }),
		]
	}

	get activeGuards() {
		const guards = Object.keys(this.guardsConfig).map((key) => {
			const config = this.guardsConfig[key as keyof GuardrailsConfig]
			const hasThreshold = "threshold" in config
			const hasMode = "mode" in config
			return {
				key: key,
				name: config.name,
				hasThreshold: hasThreshold,
				threshold: hasThreshold ? (config as any).threshold : undefined,
				mode: hasMode ? (config as any).mode : undefined,
			}
		})

		guards.sort((a, b) => {
			return a.hasThreshold === b.hasThreshold ? 0 : a.hasThreshold ? -1 : 1
		})

		return guards
	}

	public async updateThreshold(guardKey: "injection" | "leakage", newThreshold: number): Promise<void> {
		const guard = this.guardsConfig[guardKey]
		if (!guard) {
			console.error(`Guard ${guardKey} not found.`)
			return
		}

		if ("threshold" in guard) {
			guard.threshold = newThreshold
			await this.saveGuardsConfig()
			this.updateGuards()
			console.log(`Threshold for ${guardKey} guard updated to ${newThreshold}`)
		}
	}
	public async updateMode(guardKey: "secret" | "pii", mode: string): Promise<void> {
		const guard = this.guardsConfig[guardKey]
		if (!guard) {
			console.error(`Guard ${guardKey} not found.`)
			return
		}

		if ("mode" in guard) {
			guard.mode = mode
			await this.saveGuardsConfig()
			this.updateGuards()
			console.log(`Mode for ${guardKey} guard updated to ${mode}`)
		}
	}
}
