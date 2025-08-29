// Public PostHog key (safe for open source)
const posthogProdConfig = {
	apiKey: "api-key",
	host: "url",
	uiHost: "ui-host",
}

// Public PostHog key for Development Environment project
const posthogDevEnvConfig = {
	apiKey: "api-key",
	host: "url",
	uiHost: "ui-host",
}

export const posthogConfig = process.env.IS_DEV === "true" ? posthogDevEnvConfig : posthogProdConfig
