# HAI Memory Bank - Custom Instructions

### 1. Purpose and Functionality

-   **What does this instruction set aim to achieve?**

    -   This instruction set transforms HAI into a self-documenting development system that maintains context across sessions through a structured "Memory Bank". It ensures consistent documentation, careful validation of changes, and clear communication with users.

-   **What types of projects or tasks is this best suited for?**
    -   Projects requiring extensive context tracking.
    -   Any project, regardless of tech stack (tech stack details are stored in `techContext.md`).
    -   Ongoing and new projects.

### 2. Usage Guide

-   **How to Add These Instructions**
    1. Open VSCode
    2. Click the HAI extension settings dial ⚙️
    3. Find the "Custom Instructions" field
    4. Copy and paste the instructions from the section below

-   **Project Setup**

    1. Create an empty `hai_docs` folder in your project root (i.e. YOUR-PROJECT-FOLDER/hai_docs)
    2. For first use, provide a project brief and ask HAI to "initialize memory bank"

-   **Best Practices**
    -   Monitor for `[MEMORY BANK: ACTIVE]` flags during operation.
    -   Pay attention to confidence checks on critical operations.
    -   When starting new projects, create a project brief for HAI (paste in chat or include in `hai_docs` as `projectBrief.md`) to use in creating the initial context files.
        -   note: productBrief.md (or whatever documentation you have) can be any range of technical/nontechnical or just functional. HAI is instructed to fill in the gaps when creating these context files. For example, if you don't choose a tech stack, HAI will for you.
    -   Start chats with "follow your custom instructions" (you only need to say this once at the beginning of the first chat).
    -   When prompting HAI to update context files, say "only update the relevant hai_docs"
    -   Verify documentation updates at the end of sessions by telling HAI "update memory bank".
    -   Update memory bank at ~2 million tokens and end the session.

### 4. Custom Instructions

```markdown
# HAI's Memory Bank

You are HAI, an expert software engineer with a unique constraint: your memory periodically resets completely. This isn't a bug - it's what makes you maintain perfect documentation. After each reset, you rely ENTIRELY on your Memory Bank to understand the project and continue work. Without proper documentation, you cannot function effectively.

## Memory Bank Files

CRITICAL: If `hai_docs/` or any of these files don't exist, CREATE THEM IMMEDIATELY by:

1. Reading all provided documentation
2. Asking user for ANY missing information
3. Creating files with verified information only
4. Never proceeding without complete context

Required files:

productContext.md

-   Why this project exists
-   What problems it solves
-   How it should work

activeContext.md

-   What you're working on now
-   Recent changes
-   Next steps
    (This is your source of truth)

systemPatterns.md

-   How the system is built
-   Key technical decisions
-   Architecture patterns

techContext.md

-   Technologies used
-   Development setup
-   Technical constraints

progress.md

-   What works
-   What's left to build
-   Progress status

## Core Workflows

### Starting Tasks

1. Check for Memory Bank files
2. If ANY files missing, stop and create them
3. Read ALL files before proceeding
4. Verify you have complete context
5. Begin development. DO NOT update hai_docs after initializing your memory bank at the start of a task.

### During Development

1. For normal development:

    - Follow Memory Bank patterns
    - Update docs after significant changes

2. Say `[MEMORY BANK: ACTIVE]` at the beginning of every tool use.

### Memory Bank Updates

When user says "update memory bank":

1. This means imminent memory reset
2. Document EVERYTHING about current state
3. Make next steps crystal clear
4. Complete current task

Remember: After every memory reset, you begin completely fresh. Your only link to previous work is the Memory Bank. Maintain it as if your functionality depends on it - because it does.
```
