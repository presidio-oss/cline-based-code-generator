## Release Metadata

- **Extension Name**: HAI Build Code Generator
- **Extension Version**: [e.g., v1.2.3]

## Prerequisites

- Build and package the `.vsix` extension from the specified branch and install it in VS Code (recommended), or run in development mode (Extension Host) from the specified branch.
- Open the console to monitor logs: `Cmd+Shift+P → Toggle Developer Tools`.
- Monitor execution logs: Open the bottom control panel, select the “OUTPUT” tab, choose “HAI Build” from the dropdown next to Filter.

## References

- Please refer to the below schema for `.hai.config` 
    ```
    langfuse.apiUrl=
    langfuse.apiKey=
    langfuse.publicKey=
    posthog.url=
    posthog.apiKey=
    cormatrix.baseURL=
    cormatrix.token=
    cormatrix.workspaceId=
    ```
- Refer to the [Cor-Matrix setup guide](https://www.npmjs.com/package/@presidio-dev/cor-matrix) for configuring Cor-Matrix, and contact the team to obtain the API key. 

**General Note**: For all settings tests, verify both saved and unsaved states. After changing a setting, save, navigate away, and return to confirm persistence. Test with invalid inputs where applicable to ensure proper validation.

## 1. Installation and Activation

| Test Case | Description | Status (Pass/Fail/NA) | Observations |
|-----------|-------------|-----------------------|--------------|
| Install Extension | Install the extension from the VS Code Marketplace or a local `.vsix` file. | | |
| Activate Extension | Open VS Code and verify the extension activates without errors (check Output panel for HAI Build logs). | | |
| First-Time Setup | Verify the setup screen appears and functions correctly (e.g., valid/invalid credential validation, “Let’s Go” button). | | |
| Anonymous Reporting Banner | After setup, confirm the “Help improve HAI” banner for anonymous reporting appears. | | |

## 2. Settings - API Configuration

| Test Case | Description | Status (Pass/Fail/NA) | Observations |
|-----------|-------------|-----------------------|--------------|
| LLM Configuration | Enter random/invalid model names and versions, verify validation errors. Save valid/invalid configs, navigate away, and confirm persistence. | | |
| LLM Task Execution | Change LLM config, navigate to Home, run a simple task (e.g., “Hello”), and verify it executes correctly. | | |
| Plan and Act Configuration | Set different providers and models, verify persistence. Toggle Plan/Act in Home and confirm it reflects the configured setting. | | |
| Plan/Act Task Execution | Run a simple task (e.g., “Hello”) with Plan/Act toggled and verify correct behavior. | | |
| Embedding Configuration | Test configuration validity with different providers/models. Verify “Same as LLM” checkbox behavior when toggling Plan/Act. | | |
| Custom Instruction | Add a custom instruction, disable rules/workflows, run a simple task, and verify the instruction is applied. | | |

## 3. Settings - HAI Features

| Test Case | Description | Status (Pass/Fail/NA) | Observations |
|-----------|-------------|-----------------------|--------------|
| Code Indexing (Enabled, Context Enabled) | Start indexing with both enabled. Verify `.hai` folder creation, comment addition in files (first 50%), and `.faiss-context/docstore.json` updates (second 50%). | | |
| Code Indexing (Enabled, Context Disabled) | Start indexing with context disabled. Verify `.hai` folder creation and direct start at 50% for vectorization. Check `.faiss-context/docstore.json`. | | |
| Indexing Controls | During indexing, test Stop, Start, and Reset functionality. | | |
| Re-Indexing | Modify a file, verify re-indexing and context updates correctly. | | |
| Code Indexing Usage | Run a task (e.g., bug fix) in Home, verify `find_relevant_tools` queries the vector DB to find relevant files. | | |
| Secret Scanning | Attempt to access `.env` or secrets files included in scanning, verify access is blocked. | | |

## 4. Settings - General and Telemetry

| Test Case | Description | Status (Pass/Fail/NA) | Observations |
|-----------|-------------|-----------------------|--------------|
| Language Setting | Change language, run a sample task, and verify correct behavior. | | |
| Anonymous Reporting | Enable/disable anonymous reporting, verify in self-hosted Langfuse. | | |
| Telemetry Overrides | Create `.hai.config` with valid/invalid Langfuse credentials and verify override behavior. Test Cormatrix integration with valid credentials. | | |

## 5. Settings - Feature Toggles

| Test Case | Description | Status (Pass/Fail/NA) | Observations |
|-----------|-------------|-----------------------|--------------|
| Inline Editing | Enable inline editing, run a task on a file, and verify changes apply correctly. | | |
| Checkpoint | Enable checkpoint, run a task with multiple file changes, restore from checkpoints, and verify functionality. | | |
| MCP Marketplace | Enable MCP, verify marketplace tab appears. Disable and confirm it disappears. | | |

## 6. Settings - Browser

| Test Case | Description | Status (Pass/Fail/NA) | Observations |
|-----------|-------------|-----------------------|--------------|
| Browser Configuration | Modify browser settings (e.g., enable/disable tool, viewport size), save, and verify persistence. Run a browser-dependent task with a compatible LLM model. | | |

## 7. Settings - Debug

| Test Case | Description | Status (Pass/Fail/NA) | Observations |
|-----------|-------------|-----------------------|--------------|
| Settings JSON | Verify all settings are correctly populated in the JSON output. | | |
| Workspace Reset | Reset workspace state, repeat key tests (e.g., setup, LLM config, indexing), and verify consistent behavior. | | |

## 8. Feature Screens - Reset and Welcome

| Test Case | Description | Status (Pass/Fail/NA) | Observations |
|-----------|-------------|-----------------------|--------------|
| Reset Screen | After reset, verify new setup screen, test valid/invalid credentials, and check validation messages. | | |
| Welcome Navigation | Click “HAI Tasks,” “My Recent Tasks,” and Quick Example Starters, verify navigation works. | | |
| Auto-Approve Settings | Open auto-approve slide-in, enable/disable/favorite/unfavorite actions, reload workspace, and verify persistence. Run a task with auto-approve enabled. | | |
| Chat Inline Commands | Test `/newtask`, `/smol`, `/newrule`, `/reportbug` commands and verify functionality. | | |
| Chat @ Commands | Test `@` commands and verify correct behavior. | | |
| Image Upload | Upload an image, run a task based on it, and verify inference works. | | |
| HAI Rules | Create workspace/global rules, run a task, and verify rules are applied. | | |
| HAI Workflow | Create workspace/global workflows, use inline commands, and verify task follows workflow format. | | |
| Plan/Act Toggle | Test Plan/Act toggle with different model/provider combinations. | | |

## 9. Feature Screens - HAI Tasks

| Test Case | Description | Status (Pass/Fail/NA) | Observations |
|-----------|-------------|-----------------------|--------------|
| Task Import | Import tasks from a SpecifAI solution root folder, verify content loads correctly. | | |
| Task Navigation | Check navigation, view story/task, and verify content. | | |
| Task Persistence | Refresh/reopen workspace, verify tasks persist. | | |
| Fuzzy Search | Test fuzzy search functionality in HAI Tasks. | | |
| Task Execution | Execute a task, verify story/task details appear in Home chat field, and run successfully. | | |
| Mark as Complete | Complete a task, verify “Mark as Complete” button, and check mark appears in task listing. | | |
| Task Reset | Reset/clear HAI Tasks, load another solution, and verify functionality. | | |

## 10. Feature Screens - Experts

| Test Case | Description | Status (Pass/Fail/NA) | Observations |
|-----------|-------------|-----------------------|--------------|
| Existing Expert Navigation | Click an existing expert, verify instructions render correctly. | | |
| Existing Expert Usage | Select an expert in Home, run a task, and verify correct behavior. | | |
| Custom Expert (No Deepcrawl) | Create an expert with a documentation link, verify `.hai-experts/<expert-name>` folder and auto-generated instructions. Run a task using the expert. | | |
| Custom Expert (Deepcrawl) | Create an expert with deepcrawl, verify `.hai-experts/<expert-name>` vector DB. Run a task and verify `customExpertContext` tool and RAG query. | | |
| Deepcrawl Error Handling | Invalidate embedding configuration, use a deepcrawl expert, and verify warning message. | | |

## 11. Feature Screens - MCP (Marketplace)

| Test Case | Description | Status (Pass/Fail/NA) | Observations |
|-----------|-------------|-----------------------|--------------|
| MCP Installation | Search and install an MCP, verify smooth installation. | | |
| MCP Usage | Enable MCP, run a task in Home, and verify it triggers correctly. | | |
| Multiple MCP Servers | Configure multiple MCP servers, run a task consuming both, and verify performance. | | |

## 12. Feature Screens - Recent Tasks

| Test Case | Description | Status (Pass/Fail/NA) | Observations |
|-----------|-------------|-----------------------|--------------|
| Fuzzy Search and Filters | Test fuzzy search and filters in Recent Tasks. | | |
| Favorite/Unfavorite | Favorite/unfavorite tasks, reload workspace, and verify persistence. | | |
| Export/Delete Tasks | Export and delete individual/all tasks, verify functionality. | | |
| Resume Task | Select a task, resume operation, and verify checkpoints work. | | |
| Delete Icon Visibility | Verify delete icon appears only on hover for unfavorited tasks. | | |

## Tester Information

| Tester Name | Test Date | VS Code Version | OS | Installation Method | Notes |
|-------------|-----------|-----------------|----|---------------------|-------|
| [Tester's Name] | [e.g., July 30, 2025] | [e.g., 1.102.1 (Universal)] | [e.g., macOS, Sonoma] | [e.g., Dev build .vsix] |