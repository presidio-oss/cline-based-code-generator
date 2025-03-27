import { ExpertData } from "../types/experts"
import { DOTNET_EXPERT_PROMPT } from "./experts/dotnetExpert"
import { DOCUMENTATION_EXPERT_PROMPT } from "./experts/documentationExpert"
import { GENAI_EXPERT_PROMPT } from "./experts/genaiExpert"
import { REACT_EXPERT_PROMPT } from "./experts/reactExpert"
import { TERRAFORM_EXPERT_PROMPT } from "./experts/terraformExpert"

// Import SVG icons
import { ReactComponent as ReactIconComponent } from "../assets/experts-icon/react.svg"
import { ReactComponent as DotNetIconComponent } from "../assets/experts-icon/dotnet.svg"
import { ReactComponent as TerraformIconComponent } from "../assets/experts-icon/terraform.svg"
import { ReactComponent as GenAIIconComponent } from "../assets/experts-icon/ai.svg"
import { ReactComponent as DocumentationIconComponent } from "../assets/experts-icon/docs.svg"

export const DEFAULT_EXPERTS: ExpertData[] = [
	{
		name: "React",
		prompt: REACT_EXPERT_PROMPT,
		isDefault: true,
		iconComponent: ReactIconComponent,
	},
	{
		name: ".NET",
		prompt: DOTNET_EXPERT_PROMPT,
		isDefault: true,
		iconComponent: DotNetIconComponent,
	},
	{
		name: "Terraform",
		prompt: TERRAFORM_EXPERT_PROMPT,
		isDefault: true,
		iconComponent: TerraformIconComponent,
	},
	{
		name: "GenAI",
		prompt: GENAI_EXPERT_PROMPT,
		isDefault: true,
		iconComponent: GenAIIconComponent,
	},
	{
		name: "Documentation",
		prompt: DOCUMENTATION_EXPERT_PROMPT,
		isDefault: true,
		iconComponent: DocumentationIconComponent,
	},
]
