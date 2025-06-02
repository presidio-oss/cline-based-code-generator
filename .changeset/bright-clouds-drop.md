---
"hai-build-code-generator": patch
---

Resolved an issue where buildContextOptions was undefined, which caused useIndex to default to false. As a result, the find_relevant_tools custom tool prompt was not being rendered.This fix ensures buildContextOptions is properly initialized before being accessed, restoring expected behavior in the tool selection flow.
