# These are configuration, not secrets. The app reads them as environment variables.
output "spike_url" {
  description = "Cloud Run URL of the spike service; also the audience of the ID token."
  value       = google_cloud_run_v2_service.spike.uri
}

output "service_account_email" {
  description = "GCP_SERVICE_ACCOUNT_EMAIL"
  value       = google_service_account.spike_caller.email
}

output "workload_identity_pool_id" {
  description = "GCP_WORKLOAD_IDENTITY_POOL_ID"
  value       = google_iam_workload_identity_pool.vercel.workload_identity_pool_id
}

output "workload_identity_provider_id" {
  description = "GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID"
  value       = google_iam_workload_identity_pool_provider.vercel.workload_identity_pool_provider_id
}

output "project_number" {
  description = "GCP_PROJECT_NUMBER"
  value       = data.google_project.this.number
}

output "database_instance" {
  description = "Cloud SQL instance name"
  value       = google_sql_database_instance.scullery.name
}

output "database_private_ip" {
  description = "The database's address on the private network (not reachable from the internet)"
  value       = google_sql_database_instance.scullery.private_ip_address
}

output "image_repository" {
  description = "Where API images are pushed"
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.scullery.repository_id}"
}
