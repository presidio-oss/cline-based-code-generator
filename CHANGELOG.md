# Changelog

## [3.0.2]

### Added

- Merged changes from Cline 3.2.0 (see [changelog](https://github.com/cline/cline/blob/main/CHANGELOG.md#320)). 
- Added copy to clipboard for HAI tasks
- Added ability to add custom instruction markdown files to the workspace
- Added ability to dynamically choose custom instructions while conversing
- Added inline editing (Ability to select a piece of code and edit it with HAI)

### Fixed

- Fixed AWS Bedrock session token preserved in the global state
- Fixed unnecessary LLM and embedding validation occurring on every indexing update
- Fixed issue causing the extension host to terminate unexpectedly
- Fixed LLM and embedding validation errors appearing on the welcome page post-installation
- Fixed embedding configuration incorrectly validating when an LLM model name is provided
- Fixed errors encountered during code context processing and indexing operations

## [3.0.1]

### Added

- Merged changes from Cline 3.0.0 (see [changelog](https://github.com/cline/cline/blob/main/CHANGELOG.md#300)).
- Introduced HAI tasks, integrating Specif AI.
- Added code indexing and context to identify relevant files during task execution.
- Enabled support for various embedding model provider.
- Implemented OWASP scanning for code changes during task execution.
- Added quick actions to the welcome page.