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
	public static MESSAGE = "⚠️ Message blocked by Hai Guardrails filter."
	private static _guardsConfig = {
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
		if (Guardrails._guardsConfig[guardKey]) {
			Guardrails._guardsConfig[guardKey].threshold = newThreshold
			console.log(`Threshold for ${guardKey} guard updated to ${newThreshold}`)
		} else {
			console.error(`Guard ${guardKey} not found.`)
		}
		Guardrails.createGuards()
	}

	public async updateMode(guardKey: "secret" | "pii", mode: string): Promise<void> {
		if (Guardrails._guardsConfig[guardKey]) {
			Guardrails._guardsConfig[guardKey].mode = mode
			console.log(`Mode for ${guardKey} guard updated to ${mode}`)
		} else {
			console.error(`Guard ${guardKey} not found.`)
		}
		Guardrails.createGuards()
	}
}
