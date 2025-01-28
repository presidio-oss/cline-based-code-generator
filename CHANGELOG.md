# Changelog

## [3.0.2] - YYYY-MM-DD

### Added

- Merged changes from Cline 3.2.0 (see [changelog](https://github.com/cline/cline/blob/main/CHANGELOG.md#320)). 
- Added copy to clipboard for HAI tasks
- Added ability to add custom instruction markdown files to the workspace
- Added ability to dynamically choose custom instructions while conversing

### Fixed

- Fixed AWS Bedrock session token preserved in the global state

## [3.0.1] - 2024-12-20

### Added

- Merged changes from Cline 3.0.0 (see [changelog](https://github.com/cline/cline/blob/main/CHANGELOG.md#300)).
- Introduced HAI tasks, integrating Specif AI.
- Added code indexing and context to identify relevant files during task execution.
- Enabled support for various embedding model provider.
- Implemented OWASP scanning for code changes during task execution.
- Added quick actions to the welcome page.