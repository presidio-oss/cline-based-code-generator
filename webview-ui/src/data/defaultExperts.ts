import { ExpertData } from "../types/experts"
import { DOTNET_EXPERT_PROMPT } from "./experts/dotnetExpert"
import { GENAI_EXPERT_PROMPT } from "./experts/genaiExpert"
import { REACT_EXPERT_PROMPT } from "./experts/reactExpert"
import { TERRAFORM_EXPERT_PROMPT } from "./experts/terraformExpert"

export const DEFAULT_EXPERTS: ExpertData[] = [
	{
		name: "React",
		prompt: REACT_EXPERT_PROMPT,
		isDefault: true,
	},
	{
		name: ".NET",
		prompt: DOTNET_EXPERT_PROMPT,
		isDefault: true,
	},
	{
		name: "Terraform",
		prompt: TERRAFORM_EXPERT_PROMPT,
		isDefault: true,
	},
	{
		name: "GenAI",
		prompt: GENAI_EXPERT_PROMPT,
		isDefault: true,
	},
]
