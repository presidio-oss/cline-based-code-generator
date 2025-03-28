import { ExpertData } from "../types/experts"
import { DOTNET_EXPERT_PROMPT } from "./experts/dotnetExpert"
import { TERRAFORM_EXPERT_PROMPT } from "./experts/terraformExpert"
import { NODEJS_EXPERT_PROMPT } from "./experts/nodejsExpert"
import { GOLANG_EXPERT_PROMPT } from "./experts/golangExpert"

// Import SVG icons

import { ReactComponent as DotNetIconComponent } from "../assets/experts-icon/dotnet.svg"
import { ReactComponent as TerraformIconComponent } from "../assets/experts-icon/terraform.svg"
import { ReactComponent as NodeJsIconComponent } from "../assets/experts-icon/nodejs.svg"
import { ReactComponent as GoIconComponent } from "../assets/experts-icon/golang.svg"

export const DEFAULT_EXPERTS: ExpertData[] = [
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
		name: "Node.js",
		prompt: NODEJS_EXPERT_PROMPT,
		isDefault: true,
		iconComponent: NodeJsIconComponent,
	},
	{
		name: "Go",
		prompt: GOLANG_EXPERT_PROMPT,
		isDefault: true,
		iconComponent: GoIconComponent,
	},
]
