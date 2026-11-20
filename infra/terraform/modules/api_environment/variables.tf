variable "name" {
  description = "The environment's name, e.g. staging or production. It becomes part of every resource name."
  type        = string
}

variable "region" {
  type = string
}

variable "network" {
  description = "Name of the private network Cloud Run joins."
  type        = string
}

variable "subnetwork" {
  description = "Name of the subnet Cloud Run takes its addresses from."
  type        = string
}

variable "database_instance" {
  description = "Name of the Cloud SQL instance this environment's database lives on."
  type        = string
}

variable "database_private_ip" {
  description = "The instance's private address, which the API connects to."
  type        = string
}

variable "image" {
  description = "The API image, pinned by digest (registry/path/api@sha256:...)."
  type        = string

  validation {
    condition     = can(regex("@sha256:[0-9a-f]{64}$", var.image))
    error_message = "Use the image's digest (…@sha256:<64 hex>), not a tag: a tag can be overwritten, a digest cannot."
  }
}

variable "workload_identity_pool" {
  description = "Full name of the workload identity pool that trusts Vercel (its `name` attribute)."
  type        = string
}

variable "vercel_environments" {
  description = "Which Vercel environments (the token's `environment` claim) may call THIS environment's API."
  type        = set(string)
}

variable "min_instances" {
  description = "0 means the API scales to zero when idle (free, with a cold start); 1 keeps one warm."
  type        = number
  default     = 0
}

variable "max_instances" {
  description = "Kept low on purpose: a shared-core database allows few connections."
  type        = number
  default     = 2
}
