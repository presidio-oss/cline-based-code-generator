---
"hai-build-code-generator": minor
---

This PR standardizes the ignore file naming convention across the codebase by replacing all instances of `.haiignore` with `.clineignore`. This includes updates to the file watcher patterns, error messages, documentation, and related test files. This is a breaking change that requires users with existing `.haiignore` files to rename them to `.clineignore`, though no changes to file contents are needed. The change aligns with our current branding and improves consistency in configuration file naming
