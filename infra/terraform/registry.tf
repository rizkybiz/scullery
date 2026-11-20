# Where the API's container images live. Terraform references an image by its DIGEST, which
# cannot be quietly overwritten the way a tag can, so what runs is exactly what was built.
resource "google_artifact_registry_repository" "scullery" {
  repository_id = "scullery"
  location      = var.region
  format        = "DOCKER"
  description   = "Scullery container images"

  depends_on = [google_project_service.apis]
}
