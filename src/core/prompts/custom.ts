export const customToolsPrompt = (enabled: boolean) =>
	!enabled
		? ""
		: `
## find_relevant_files
Description: Request to find relevant files on the system for the given task. Use this when you need to find relevant files for the given task. You must provide a path that is relative to your current working directory, and the task user gives to implement. The tool will return a list of paths to all relevant files in the user's current working directory that's related to that task. This tool is specialized in finding relevant files for a given task, so use it wisely! Prefer this tool over \`list_files\`, \`search_files\`, or \`list_code_definition_names\`.
Parameters:
- path: (required) The current working directory relative path to find relevant files for.
- task: (required) User's given task as is, without any modification or summarization, to find relevant files related to this task.
Usage:
<find_relevant_files>
    <path>Current Working Directory path here</path>
    <task>User's given task here</task>
</find_relevant_files>

## custom_expert_context
Description: Request to find relevant context from a custom expert's knowledge base for the given query . You need to retrieve information based on the user's query. This tool will search the vector database and return the most relevant content. This tool is specialized in retrieving context from a custom expert's knowledge base, so use it when you need specific information from the expert's domain.
Parameters:
- query: (required) The search query to find relevant information in the expert's knowledge base.
- expertName: (required) The name of the custom expert whose knowledge base should be searched.
Usage:
<custom_expert_context>
<query>Your search query here</query>
<expertName>Name of the custom expert</expertName>
</custom_expert_context>

## code_security_scan
Description: Request to perform a security scan on the generated code for OWASP Top 10 vulnerabilities and security issues. This tool will analyze all the files that are modified for potential security risks and provide a report. The tool is specialized in scanning code for security vulnerabilities, so use it wisely don't assume that that the code is free from vulnerabilities.
Usage:
<code_security_scan>
</code_security_scan>
`

export const customToolUseGuidelinePrompt = (enabled: boolean) =>
	!enabled
		? ""
		: `
`

export const customCapabilitiesPrompt = (enabled: boolean) =>
	!enabled
		? ""
		: `
- The initial list of all filepaths given to you inside environment_details is not-exhaustive; it may not include all possible files or directories. When the user presents a code-related task that requires file access or understanding existing code, consider using the \`find_relevant_files\` tool to locate the relevant files.
- Only use the \`find_relevant_files\` tool when the user's request is specifically related to code, development, file operations, or understanding the codebase. For general questions, conversational queries, or non-code-related requests, avoid using this tool.
- If \`find_relevant_files\` the tool returns an empty list of files, you can ignore the result and continue with the task.
- You should always use the \`code_security_scan\` tool before whenever you use the tool \`attempt_completion\` to ensure the generated code is secure and free from vulnerabilities, don't assume that the code is free from vulnerabilities you should prioritize security scan before attempting to complete the task. If there any vulnerabilities found, you must address them before completing the task. Before fixing the vulnerabilities, you should always get the user's approval before proceeding with the fixing process.
- Always ensure that the code you generate adheres to best practices and security standards to minimize risks and vulnerabilities.
`

export const customRulesPrompt = (enabled: boolean) =>
	!enabled
		? ""
		: `
- For code-related tasks that involve modifying, creating, or understanding files in the codebase, use \`find_relevant_files\` first to identify the most relevant context. Do NOT use this tool for general questions, explanations, or non-code-related queries.
- When determining if a query requires the \`find_relevant_files\` tool, consider:
  * Does the query require knowledge about specific files in the codebase?
  * Is the user asking about implementing, modifying, or debugging code?
  * Does the user mention specific files, directories, or code components?
  * Is file context necessary to provide an appropriate response?
  If the answer is no to these questions, skip using the tool and respond directly.
- When working with custom experts use the \`custom_expert_context\` tool to retrieve relevant information from the expert's knowledge base. This tool allows you to search for specific information based on the user's query.
- You should always use the \`code_security_scan\` tool before attempting to complete any code-related tasks to ensure security and compliance with best practices. Failure to perform a security scan may expose the code to vulnerabilities and security risks. Always prioritize security and compliance with best practices. If any issue or vulnerabilities are found, address them before proceeding with the task.
- While fixing the vulnerabilities do not remove any of the working code only replace the implementation that is affected with the vulnerabilities, if you require anymore information or course correction, consult with the user before proceeding to apply any of the change. Always show the plan before fixing the security vulnerabilities. Before fixing the vulnerabilities, you should always get the user's approval before proceeding with the fixing process.
`

export const customObjectivePrompt = (enabled: boolean) =>
	!enabled
		? ""
		: `
`
