export const HaiBuildDefaults = {
	defaultContextDirectory: ".hai",
	defaultContextAdditionConcurrency: 10,
	defaultContextAdditionSystemPrompt: `You are a world-class software engineer. You are provided with the following code files. 
        Please add detailed comments to the code files and use the respective language's doc format if possible.
        File name and the application context are provided to give you the background information.
        ALWAYS GIVE THE COMPLETE CODE. DO NOT USE \`\`\` AS A PLACEHOLDER,
        Give only the code with comments as output. Don't include any other content or file name or \`\`\`\ or the language name.`,
	defaultCodeScannerSystemPrompt: `You are a world-call security analyst and you hold a PhD in the Cyber Security & Software Engineering and you have a decades of experience in this filed. You are given with the piece of code now it's your job to analyze the given code for potential security vulnerabilities based on the OWASP Top 10 list:
1. Broken Access Control 
2. Cryptographic Failures 
3. Injection 
4. Insecure Design 
5. Security Misconfiguration 
6. Vulnerable and Outdated Components 
7. Identification and Authentication Failures 
8. Software and Data Integrity Failures 
9. Security Logging and Monitoring Failures
10. Server-Side Request Forgery 

After analyzing the code if issue found List the specific issues found in the code. If no issue found state that "no issue was found"

Do not include additional context, information or explanation in response.`,
	defaultCodeScannerMaxRetry: 3,
	defaultDirsToIgnore: [
		"node_modules",
		"__pycache__",
		"env",
		"venv",
		"target/dependency",
		"build/dependencies",
		"dist",
		"out",
		"bundle",
		"vendor",
		"tmp",
		"temp",
		"deps",
		"pkg",
		"Pods",
		".git",

		// Java
		"target",
		"build",
		"bin",
		".idea",
		".project",
		".classpath",
		".settings",
		".gradle",
		"lib",
		"logs",
		"dependency",
		"coverage",
		"*.iml",
		".factorypath",
		".mvn",
		"classes",
		".metadata",
		"pmd.xml",
		"coverage-reports",
		"test-output",
		"dependency-reduced-pom.xml",

		//.NET
		"obj",
		"packages",
		"TestResults",
		"artifacts",
		"publish",
		".vs",
		"app.publish",
		"_ReSharper.Cache",
		"*.user",
		"*.suo",
		".dotnet",
		".msbuild",
		".nuget",

		//Go lang
		"__debug_bin",
		"debug",
		"coverage.out",
		"coverage.html",
		"coverage.txt",
		"*.exe",
		"*.dll",
		"*.so",
		"*.dylib",
		"*.test",
		"*.out",
		"go.work",
	],
	defaultRepoHashFileName: "hai.repo.hash",
	defaultSecretFilesPatternToIgnore: [".env*", ".npmrc", ".ssh/id_*", ".aws/credentials"],
}
