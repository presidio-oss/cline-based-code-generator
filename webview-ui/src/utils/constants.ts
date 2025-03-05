export const MAIN_CARDS = [
	{
		name: "View Hai Tasks",
		icon: "add",
		title: "HAI Tasks",
		description: "Explore detailed information about your HAI tasks.",
	},
	{
		name: "View Conversation",
		icon: "history",
		title: "My Recent Tasks",
		description: "Review and manage your recent activities.",
	},
]

export const FEATURE_TILES = [
	{
		icon: "type-hierarchy",
		title: "Explain Project Structure",
		description: "Understand codebase architecture and patterns.",
		context:
			"Analyze the project structure, folder organization, dependencies, and architectural patterns used. Identify key components, their relationships, and the overall design philosophy. Consider modularity, scalability, and code organization principles.",
	},
	{
		icon: "shield",
		title: "Perform Security Scan",
		description: "Identify vulnerabilities and security issues.",
		context:
			"Review code for common security vulnerabilities including but not limited to: SQL injection, XSS attacks, CSRF vulnerabilities, authentication issues, insecure dependencies, hardcoded credentials, and unsafe data handling. Provide specific recommendations based on current security best practices.",
	},
	{
		icon: "book",
		title: "Autogenerate Documentation",
		description: "Create comprehensive code documentation.",
		context:
			"Generate detailed documentation covering code functionality, API endpoints, component interfaces, data models, and usage examples. Include setup instructions, configuration options, and deployment guidelines. Document important architectural decisions and key business logic implementations.",
	},
	{
		icon: "beaker",
		title: "Generate Unit Tests",
		description: "Create test cases and improve code coverage.",
		context:
			"Generate unit tests focusing on edge cases, error handling, and business logic validation. Include tests for different input scenarios, boundary conditions, and error paths. Consider integration points, mocking strategies, and test coverage goals. Follow testing best practices for the specific framework or language being used.",
	},
]

export const CREATE_HAI_RULES_PROMPT = `Create a .hairules file for my project. It should include the following sections:

1. Code Style & Patterns: 
Include coding standards, architectural patterns, and best practices (e.g., repository pattern, composition over inheritance).

2. Testing Standards: 
Outline requirements for unit, integration, and end-to-end testing.

3. Security: 
Define rules to protect sensitive information, such as ignoring .env files and using environment variables for secrets.

4. Documentation Requirements: 
Specify guidelines for keeping README.md in sync and maintaining a changelog.

Place the .hairules file in the root directory of the project. Ensure it is well-structured and adheres to the project's needs.`

export const HAI_RULES_PATH = ".hairules"
