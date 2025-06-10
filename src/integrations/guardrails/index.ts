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
		mode: string
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
		mode: string
	}
}

export const Default_GuardsConfig = {
	injection: {
		name: "Prompt Injection",
		threshold: 1,
		mode: "heuristic",
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
		mode: "heuristic",
		roles: ["user"],
		threshold: 1,
	},
}

export class Guardrails extends GuardrailsEngine {
	public static MESSAGE = "Message blocked by HAI Guardrails filter."
	private context: vscode.ExtensionContext

	// Default configuration that will be used if no config is found in state
	public static DEFAULT_GUARDS_CONFIG: GuardrailsConfig = {
		injection: {
			name: "Prompt Injection",
			threshold: 1,
			mode: "heuristic",
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
			mode: "heuristic",
			roles: ["user"],
			threshold: 1,
		},
	}

	constructor(context: vscode.ExtensionContext) {
		// Initially create with default guards, will be updated after loading config
		const guards = Guardrails.createGuards(Guardrails.DEFAULT_GUARDS_CONFIG)
		super({ guards })

		this.context = context

		// Load configuration asynchronously
		this.loadGuardsConfig().then(() => {
			// Update guards after loading config
			this.updateGuards()
		})
	}

	private async loadGuardsConfig(): Promise<void> {
		const storedConfig = (await customGetState(this.context, "guardrailsConfig")) as GuardrailsConfig | undefined
		if (storedConfig) {
			Guardrails.DEFAULT_GUARDS_CONFIG = storedConfig
		} else {
			// If no config exists in storage, save the default one
			await this.saveGuardsConfig()
		}
	}

	private async saveGuardsConfig(): Promise<void> {
		await customUpdateState(this.context, "guardrailsConfig", Guardrails.DEFAULT_GUARDS_CONFIG)
	}

	private updateGuards(): void {
		Guardrails.createGuards(Guardrails.DEFAULT_GUARDS_CONFIG)
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
		const guards = Object.keys(Guardrails.DEFAULT_GUARDS_CONFIG).map((key) => {
			const config = Guardrails.DEFAULT_GUARDS_CONFIG[key as keyof GuardrailsConfig]
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

	public async updateGuard(
		guardUpdates: Array<{
			guardKey: keyof GuardrailsConfig
			updates: { threshold?: number; mode?: string }
		}>,
	): Promise<void> {
		let hasAnyUpdates = 0
		const allChanges: string[] = []

		for (const { guardKey, updates } of guardUpdates) {
			const guard = Guardrails.DEFAULT_GUARDS_CONFIG[guardKey]
			if (!guard) {
				console.error(`Guard ${guardKey} not found.`)
				continue
			}

			const changes: string[] = []

			// Update threshold if provided and guard supports it
			if (updates.threshold !== undefined && "threshold" in guard) {
				guard.threshold = updates.threshold
				console.log(`Updating ${guardKey} threshold to ${guard.threshold}`)
				hasAnyUpdates++
				changes.push(`threshold to ${updates.threshold}`)
			}

			// Update mode if provided and guard supports it
			if (updates.mode !== undefined && "mode" in guard) {
				guard.mode = updates.mode
				hasAnyUpdates++
				changes.push(`mode to ${updates.mode}`)
			}

			allChanges.push(`${guardKey}: ${changes.join(", ")}`)
		}

		if (hasAnyUpdates > 0) {
			await this.saveGuardsConfig()
			this.updateGuards()
			console.log(`Updated guards: ${allChanges.join(" | ")}`)
		} else {
			console.warn(`No valid updates provided for any guards`)
		}
	}

	public async applyPiiAndSecretGuards(content: string): Promise<string> {
		let engine = new GuardrailsEngine({
			guards: [
				secretGuard({
					selection: Guardrails.DEFAULT_GUARDS_CONFIG.secret.selection,
					mode: Guardrails.DEFAULT_GUARDS_CONFIG.secret.mode as "redact" | "block",
				}),
				piiGuard({
					selection: Guardrails.DEFAULT_GUARDS_CONFIG.pii.selection,
					mode: Guardrails.DEFAULT_GUARDS_CONFIG.pii.mode as "redact" | "block",
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
			],
		})
		let results = await engine.run([{ role: "user", content }])
		return results.messages[0].content
	}
}
