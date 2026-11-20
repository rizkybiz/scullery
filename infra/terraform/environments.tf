# Each environment of the API is one instance of the same module, so staging and production
# cannot drift apart. Only the name, and which Vercel environments may call it, differ.

module "staging" {
  source = "./modules/api_environment"

  name   = "staging"
  region = var.region

  network             = google_compute_network.scullery.name
  subnetwork          = google_compute_subnetwork.scullery.name
  database_instance   = google_sql_database_instance.scullery.name
  database_private_ip = google_sql_database_instance.scullery.private_ip_address

  image                  = var.api_image
  workload_identity_pool = google_iam_workload_identity_pool.vercel.name

  # Preview deployments, and a developer's machine (its Vercel token says "development").
  # Production deployments are NOT allowed here, and previews cannot reach production.
  vercel_environments = ["development", "preview"]

  depends_on = [google_project_service.apis]
}
