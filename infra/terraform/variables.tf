variable "project_id" {
  description = "The Google Cloud project ID that holds everything. Set it in terraform.tfvars (git-ignored)."
  type        = string
}

variable "region" {
  description = "Where Cloud Run runs. us-east1 is near Vercel's default function region (iad1, Washington DC)."
  type        = string
  default     = "us-east1"
}

variable "vercel_team_slug" {
  description = "The Vercel team slug. It appears in the OIDC token's issuer, audience and subject, so renaming the team breaks the trust below."
  type        = string
  default     = "jdefrank"
}

variable "vercel_project_name" {
  description = "The Vercel project name (the token's `project` claim). Renaming the project breaks the trust below."
  type        = string
  default     = "scullery"
}
