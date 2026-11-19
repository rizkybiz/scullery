# The Google APIs this setup uses. Enabling them is idempotent; they stay enabled on
# destroy so tearing down this config cannot break anything else in the project.
locals {
  apis = [
    "run.googleapis.com",                  # Cloud Run
    "iam.googleapis.com",                  # service accounts, workload identity pools
    "iamcredentials.googleapis.com",       # minting tokens for a service account
    "sts.googleapis.com",                  # exchanging Vercel's token for a Google one
    "cloudresourcemanager.googleapis.com", # project lookups used by the above
  ]
}

resource "google_project_service" "apis" {
  for_each           = toset(local.apis)
  service            = each.value
  disable_on_destroy = false
}

data "google_project" "this" {
  project_id = var.project_id
}
