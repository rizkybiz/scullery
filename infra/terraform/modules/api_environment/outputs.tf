output "url" {
  description = "The API's URL; also the audience of the ID token Vercel presents."
  value       = google_cloud_run_v2_service.api.uri
}

output "vercel_service_account_email" {
  description = "GCP_SERVICE_ACCOUNT_EMAIL for this environment"
  value       = google_service_account.vercel.email
}

output "migrate_job" {
  description = "The Cloud Run job that applies database migrations"
  value       = google_cloud_run_v2_job.migrate.name
}

output "database" {
  value = local.database_name
}
