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

variable "api_image" {
  description = "The API image to run, pinned by digest. Set in api_image.auto.tfvars (committed): changing the file IS the deploy, and git shows what ran when."
  type        = string

  validation {
    condition     = can(regex("@sha256:[0-9a-f]{64}$", var.api_image))
    error_message = "Use the image's digest (…@sha256:<64 hex>), not a tag: a tag can be overwritten, a digest cannot."
  }
}
