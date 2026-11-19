# A stand-in for the real API: Google's public "hello" image, which just answers 200.
# The point is not what it says, it is who it will answer: Cloud Run requires an
# identity token on every request, and only the service account below is allowed in.
resource "google_cloud_run_v2_service" "spike" {
  name                = "scullery-spike"
  location            = var.region
  deletion_protection = false # this is a throwaway; the real service will not be

  template {
    scaling {
      min_instance_count = 0 # scale to zero when idle, so it costs nothing at rest
      max_instance_count = 1
    }
    containers {
      image = "us-docker.pkg.dev/cloudrun/container/hello"
    }
  }

  depends_on = [google_project_service.apis]
}

# There is deliberately no binding for "allUsers": without one, Cloud Run rejects every
# caller that does not present a valid identity token for an allowed principal.
resource "google_cloud_run_v2_service_iam_member" "spike_invoker" {
  name     = google_cloud_run_v2_service.spike.name
  location = google_cloud_run_v2_service.spike.location
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.spike_caller.email}"
}
