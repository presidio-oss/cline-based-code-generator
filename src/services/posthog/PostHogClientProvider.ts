import { PostHog } from "posthog-node"
import { posthogConfig } from "../../shared/services/config/posthog-config"
import { HaiConfig } from "@/shared/hai-config"

class PostHogClientProvider {
	private static instance: PostHogClientProvider
	private client: PostHog

	private constructor() {
		const config = posthogConfig
		this.client = new PostHog(config.apiKey, {
			host: config.host,
			enableExceptionAutocapture: false,
		})
	}

	public async initPostHogClient() {
		const config = await HaiConfig.getPostHogConfig()
		const apiKey = config && config.apiKey ? config.apiKey : posthogConfig.apiKey
		const host = config && config.url ? config.url : posthogConfig.host

		this.client = new PostHog(apiKey, {
			host,
			enableExceptionAutocapture: false,
		})

		return this.client
	}

	public static getInstance(): PostHogClientProvider {
		if (!PostHogClientProvider.instance) {
			PostHogClientProvider.instance = new PostHogClientProvider()
		}
		return PostHogClientProvider.instance
	}

	public getClient(): PostHog {
		return this.client
	}

	public async shutdown(): Promise<void> {
		await this.client.shutdown()
	}
}

export const posthogClientProvider = PostHogClientProvider.getInstance()
