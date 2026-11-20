# One Cloud SQL instance holds a separate database for each environment (staging and
# production), each with its own user. That is the cost-saving trade-off: less isolation
# than one instance each, one small bill instead of two. The databases themselves are
# created with their environment, not here.

resource "google_sql_database_instance" "scullery" {
  name             = "scullery"
  region           = var.region
  database_version = "POSTGRES_17" # the version the API and its migrations are tested on

  # So `terraform destroy` can tear the demo down after the interview. A real customer's
  # instance would keep both of these on.
  deletion_protection = false

  settings {
    edition                     = "ENTERPRISE"
    tier                        = "db-f1-micro" # shared-core: the cheapest, and it has no SLA
    availability_type           = "ZONAL"       # no standby; high availability would double the cost
    disk_type                   = "PD_SSD"
    disk_size                   = 10 # GB
    deletion_protection_enabled = false

    ip_configuration {
      ipv4_enabled    = false # no public address at all
      private_network = google_compute_network.scullery.id
      ssl_mode        = "ENCRYPTED_ONLY" # refuse connections that are not TLS-encrypted
    }

    backup_configuration {
      enabled    = true
      start_time = "05:00" # UTC, the small hours in the US
    }
  }

  # The peering must exist before the instance can take a private address from it.
  depends_on = [google_service_networking_connection.private_services]
}
