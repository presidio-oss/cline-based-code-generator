---
"hai-build-code-generator": patch
---

Added a check to ensure telemetry is enabled before initializing or creating Langfuse traces. This prevents unintended data collection when telemetry is turned off.
