import {
	GuardrailsEngine,
	injectionGuard,
	leakageGuard,
	Pattern,
	piiGuard,
	secretGuard,
	SelectionType,
} from "@presidio-dev/hai-guardrails"

export class Guardrails extends GuardrailsEngine {
	public static MESSAGE = "Message blocked by Hai Guardrails filter."
	public static _guardsConfig = {
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

	constructor() {
		const guards = Guardrails.createGuards()
		super({ guards })
	}

	private static createGuards() {
		// Since GUARDS_CONFIG is static, it's valid to access here
		return [
			injectionGuard({ roles: ["user"] }, { mode: "heuristic", threshold: Guardrails._guardsConfig.injection.threshold }),
			piiGuard({
				selection: Guardrails._guardsConfig.pii.selection,
				mode: "redact",
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
				selection: Guardrails._guardsConfig.secret.selection,
				mode: "block",
			}),
			leakageGuard({ roles: ["user"] }, { mode: "heuristic", threshold: Guardrails._guardsConfig.leakage.threshold }),
		]
	}

	get activeGuards() {
		const guards = Object.keys(Guardrails._guardsConfig).map((key) => {
			const config = Guardrails._guardsConfig[key as keyof typeof Guardrails._guardsConfig]
			const hasThreshold = "threshold" in config
			const hasMode = "mode" in config
			return {
				key: key,
				name: config.name,
				hasThreshold: hasThreshold,
				threshold: hasThreshold ? config.threshold : undefined,
				mode: hasMode ? config.mode : undefined,
			}
		})

		guards.sort((a, b) => {
			return a.hasThreshold === b.hasThreshold ? 0 : a.hasThreshold ? -1 : 1
		})

		return guards
	}

	public async updateThreshold(guardKey: "injection" | "leakage", newThreshold: number): Promise<void> {
		const guard = Guardrails._guardsConfig[guardKey]
		if (!guard) {
			console.error(`Guard ${guardKey} not found.`)
			return
		}
		guard.threshold = newThreshold
		console.log(`Threshold for ${guardKey} guard updated to ${newThreshold}`)
		Guardrails.createGuards()
	}

	public async updateMode(guardKey: "secret" | "pii", mode: string): Promise<void> {
		const guard = Guardrails._guardsConfig[guardKey]
		if (!guard) {
			console.error(`Guard ${guardKey} not found.`)
			return
		}
		guard.mode = mode
		console.log(`Mode for ${guardKey} guard updated to ${mode}`)
		Guardrails.createGuards()
	}
}
