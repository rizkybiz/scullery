terraform {
  required_version = ">= 1.14.0"

  # State is local for now (and ignored by git: state can hold secrets). It moves to a
  # Cloud Storage bucket when more than one person or pipeline needs it.
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "8.12.0" # pinned exactly, like the npm dependencies
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}
