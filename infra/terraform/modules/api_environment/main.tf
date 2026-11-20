# One environment of the API: its own database and database user, its own password in
# Secret Manager, its own Cloud Run service and migration job, and its own service
# account that Vercel acts as. Staging and production are two instances of this module,
# so they cannot drift apart.

locals {
  prefix        = "scullery-api-${var.name}"
  database_name = "scullery_${var.name}"
  user_name     = "scullery_${var.name}"
}

# ---------------------------------------------------------------- the database

resource "google_sql_database" "this" {
  name     = local.database_name
  instance = var.database_instance
}

# Letters and digits only, so the password can sit in a connection URL without escaping.
# It exists only in Terraform's state and in Secret Manager; no person ever sees it.
resource "random_password" "database" {
  length  = 32
  special = false
}

resource "google_sql_user" "this" {
  name     = local.user_name
  instance = var.database_instance
  password = random_password.database.result
}

# The whole connection string is the secret, so nothing else needs the password. The
# address is private (10.x) and TLS is required by the instance; sslmode=require makes the
# client insist on it too.
resource "google_secret_manager_secret" "database_url" {
  secret_id = "${local.prefix}-database-url"

  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_version" "database_url" {
  secret      = google_secret_manager_secret.database_url.id
  secret_data = "postgres://${local.user_name}:${random_password.database.result}@${var.database_private_ip}:5432/${local.database_name}?sslmode=require"
}

# --------------------------------------------------------- who the API runs as

resource "google_service_account" "runtime" {
  account_id   = local.prefix
  display_name = "Scullery API (${var.name}): the identity the service runs as"
}

# The only thing it may do: read its own database URL.
resource "google_secret_manager_secret_iam_member" "runtime_reads_database_url" {
  secret_id = google_secret_manager_secret.database_url.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.runtime.email}"
}

# --------------------------------------------------------------- the API itself

resource "google_cloud_run_v2_service" "api" {
  name                = local.prefix
  location            = var.region
  deletion_protection = false # so the demo can be torn down
  ingress             = "INGRESS_TRAFFIC_ALL"

  template {
    service_account       = google_service_account.runtime.email
    execution_environment = "EXECUTION_ENVIRONMENT_GEN2"
    timeout               = "30s"

    scaling {
      min_instance_count = var.min_instances
      max_instance_count = var.max_instances
    }

    # Direct VPC egress: the instance gets an address in our subnet and reaches the database's
    # private IP. Only traffic to private ranges goes through the network.
    vpc_access {
      egress = "PRIVATE_RANGES_ONLY"
      network_interfaces {
        network    = var.network
        subnetwork = var.subnetwork
      }
    }

    containers {
      image = var.image

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
      }

      env {
        name  = "LOG_LEVEL"
        value = "info"
      }
      env {
        name = "DATABASE_URL"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.database_url.secret_id
            version = google_secret_manager_secret_version.database_url.version
          }
        }
      }

      # The API connects to the database on startup and exits if it cannot, so a revision
      # with a broken database setting never becomes ready and the deploy fails loudly.
      # The path is /health, not /healthz: Cloud Run reserves /healthz (paths ending in "z"),
      # and the API serves it at /health for that reason.
      startup_probe {
        http_get {
          path = "/health"
        }
        period_seconds    = 3
        timeout_seconds   = 3
        failure_threshold = 20
      }
    }
  }

  depends_on = [
    google_secret_manager_secret_iam_member.runtime_reads_database_url,
    google_sql_database.this,
    google_sql_user.this,
  ]
}

# ---------------------------------------------------------------- migrations

# An admin process (12-factor): the same image run once with `migrate up`. It is run by
# hand (or by CI later) after a deploy, never automatically on startup.
resource "google_cloud_run_v2_job" "migrate" {
  name                = "scullery-migrate-${var.name}"
  location            = var.region
  deletion_protection = false

  template {
    template {
      service_account = google_service_account.runtime.email
      max_retries     = 0 # a failed migration must be looked at, not retried blindly
      timeout         = "300s"

      vpc_access {
        egress = "PRIVATE_RANGES_ONLY"
        network_interfaces {
          network    = var.network
          subnetwork = var.subnetwork
        }
      }

      containers {
        image = var.image
        args  = ["migrate", "up"]

        env {
          name = "DATABASE_URL"
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.database_url.secret_id
              version = google_secret_manager_secret_version.database_url.version
            }
          }
        }
      }
    }
  }

  depends_on = [
    google_secret_manager_secret_iam_member.runtime_reads_database_url,
    google_sql_database.this,
    google_sql_user.this,
  ]
}

# -------------------------------------------- who may call it: Vercel, and only so

# The identity a Vercel deployment acts as to call THIS environment's API.
resource "google_service_account" "vercel" {
  account_id   = "vercel-${var.name}"
  display_name = "Vercel calling the ${var.name} API"
}

# Which Vercel environments may act as it, by the token's `environment` claim. Staging is
# reachable from preview deployments (and from a developer's machine); production only from
# production deployments, so a preview can never reach production.
resource "google_service_account_iam_member" "vercel_trust" {
  for_each = var.vercel_environments

  service_account_id = google_service_account.vercel.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${var.workload_identity_pool}/attribute.environment/${each.value}"
}

# That service account may call this API, and nothing else here has a binding for "allUsers",
# so everyone else is refused.
resource "google_cloud_run_v2_service_iam_member" "vercel_invokes" {
  name     = google_cloud_run_v2_service.api.name
  location = google_cloud_run_v2_service.api.location
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.vercel.email}"
}
