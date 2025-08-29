# Changelog

## [3.7.3]

### Added

-   Added support for Claude Sonnet 4 with a 1 million token context window and tiered pricing.

## [3.7.2]

### Added

-   Added support for the Amazon Titan Embed Text V2 model.
-   Made the embedding configuration optional with the new `none` attribute.
-   Introduced new expert integrations: AWS CDK, CloudFormation, Docker, GitHub Actions, Helm, Kubernetes, and Serverless Framework.

### Fixed

-   Resolved an issue where the Specifai MCP Server was not visible in the marketplace after being uninstalled.
-   Fixed problems with default Langfuse tracing not functioning correctly.
-   Ensured proper removal of expert document links from the vector store.

## [3.7.1]

### Fixed

-   Fixed an issue where LLM validation could become stuck in the welcome state, preventing further progress.

## [3.7.0]

### Added

-   Add optional CorMatrix integration for AI code origin tracking
-   Added DeepCrawl and `custom_expert_context` tool for expert-specific RAG by recursively retrieving and storing sublinks in the vector DB

### Fixed

-   Fixed an issue where the `find_relevant_files` tool was not triggered even when indexing was enabled

## [3.6.0]

### Added

-   Merged changes from Cline 3.17.5 (see [changelog](https://github.com/cline/cline/blob/main/CHANGELOG.md#3175)).

## [3.5.2]

### Added

-   Added `.hai.config` to support external overrides for telemetry configuration

## [3.5.1]

### Fixed

-   Replaced `baseUrl` with `endpoint` for AzureOpenAI to eliminate the need to manually append `/openai` to the URL.

## [3.5.0]

### Added

-   Merged changes from Cline 3.15.1 (see [changelog](https://github.com/cline/cline/blob/main/CHANGELOG.md#3151)).

## [3.4.3]

### Fixed

-   Updated AzureOpenAI (OpenAI-Compatible) to support URLs with domains other than .com.
-   Resolved an issue where chat-related quick action tiles failed to populate the message input with the intended task. The input field now accurately reflects the selected chat action.
-   Refined the usage behavior of the find_relevant_files tool to avoid triggering on general queries.
-   Replaced the AutoSave feature in settings with a clear 'Done' button to explicitly save configuration changes, providing better user clarity and control.
-   Fixed an issue where the welcome view was not displayed when resetting the application state.
-   Disabled the prompt cache by default.
-   Changed anonymous usage report permission to be set globally instead of at the workspace level.

## [3.4.2]

### Fixed

-   Fix the expert icon rendering to correctly display the provided image, or fallback to a default icon if the image is unavailable.

## [3.4.1]

### Enhancements

-   Marking the HAI tasks as 'Completed' upon successful execution.
-   Modified default experts folder structure for easier contribution.

### Fixed

-   Fixed issue with HTML rendering during fuzzy search.
-   Fixed Inline edit not working.
-   Typo fix in system prompt.

## [3.4.0]

### Added

-   Ability to add reference document link for custom experts.

### Fixed

-   Fixed plan mode tool name issue with plan_mode_response.

## [3.3.2]

### Enhancements

-   Fixed an issue where the find-files-agent returned empty files even after indexing.
-   Enabled prompt caching by default for Bedrock.
-   Set the V3 prompt as the default in settings.

## [3.3.1]

### Enhancements

-   Implemented token tracking usage through telemetry
-   Integrated Specifai MCP server.
-   Automatically sync custom experts when users manually update or delete experts.
-   Added validation to ensure the file exists before deleting it from the context directory.
-   Added schema validation for expert data.
-   Refactored the code to support installation and integration with any custom MCP server.

## [3.3.0]

### Added

-   Implemented the Experts feature, allowing users to create their own expert or utilize an existing one.

## [3.2.0]

### Added

-   Added system prompt optimization

### Fixed

-   Removed random gif in notify for dev release

## [3.1.1]

### Added

-   Merged changes from Cline 3.4.0 (see [changelog](https://github.com/cline/cline/blob/main/CHANGELOG.md#340)).
-   Added feature to prevent reading sensitive files
-   Added autosave settings
-   Added an option to enable or disable the inline editing feature from settings

### Enhancements

-   Updated code indexing notification with user controls and a privacy warning
-   Removed custom instructions upload and added quick start for .hairules

## [3.1.0]

### Added

-   Merged changes from Cline 3.2.13 (see [changelog](https://github.com/cline/cline/blob/main/CHANGELOG.md#3213)).
-   Introduced the experimental Ollama embedding provider.
-   Added functionality to start, stop, and reset indexing for a better user experience.

### Fixed

-   Fixed multiple code indexing background tasks being triggered.
-   Fixed an undefined issue in custom instructions (when no workspace is present).
-   Fixed the faiss-node import issue.

## [3.0.2]

### Added

-   Merged changes from Cline 3.2.0 (see [changelog](https://github.com/cline/cline/blob/main/CHANGELOG.md#320)).
-   Added copy to clipboard for HAI tasks
-   Added ability to add custom instruction markdown files to the workspace
-   Added ability to dynamically choose custom instructions while conversing
-   Added inline editing (Ability to select a piece of code and edit it with HAI)

### Fixed

-   Fixed AWS Bedrock session token preserved in the global state
-   Fixed unnecessary LLM and embedding validation occurring on every indexing update
-   Fixed issue causing the extension host to terminate unexpectedly
-   Fixed LLM and embedding validation errors appearing on the welcome page post-installation
-   Fixed embedding configuration incorrectly validating when an LLM model name is provided
-   Fixed errors encountered during code context processing and indexing operations

## [3.0.1]

### Added

-   Merged changes from Cline 3.0.0 (see [changelog](https://github.com/cline/cline/blob/main/CHANGELOG.md#300)).
-   Introduced HAI tasks, integrating Specif AI.
-   Added code indexing and context to identify relevant files during task execution.
-   Enabled support for various embedding model provider.
-   Implemented OWASP scanning for code changes during task execution.
-   Added quick actions to the welcome page.
