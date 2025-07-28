---
"hai-build-code-generator": patch
---

Resolved the langfuse trace not found issue by updating the esbuild.js configuration to include the langfuse environment variables during the build process. This ensures that langfuse traces are correctly initialized at runtime by making the API and public keys available in the client bundle.
