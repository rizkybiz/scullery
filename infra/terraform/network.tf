# A private network for the API and its database, so the database has no address on the
# public internet at all.
#
#   Cloud Run (Direct VPC egress) --> subnet --> VPC --(peering)--> Cloud SQL's private IP
#
# Cloud Run services and jobs get an address in the subnet and reach the database over
# plain TCP on the private network. Only Google's managed Cloud SQL network is peered in.

resource "google_compute_network" "scullery" {
  name                    = "scullery"
  auto_create_subnetworks = false # one subnet, chosen by us, in the one region we use

  depends_on = [google_project_service.apis]
}

# Cloud Run takes its addresses from here. Each running instance uses about four (twice
# that while scaling), a job task uses one, so a /24 (254 addresses) is far more than a
# demo needs. A /26 is the smallest Direct VPC egress accepts.
resource "google_compute_subnetwork" "scullery" {
  name          = "scullery-${var.region}"
  region        = var.region
  network       = google_compute_network.scullery.id
  ip_cidr_range = "10.10.0.0/24"

  # Lets the private network reach Google APIs (Secret Manager, for one) without a public IP.
  private_ip_google_access = true
}

# Private services access: a range of addresses reserved for Google's managed services
# (Cloud SQL) and a peering between this network and Google's. The database's private IP
# is taken from this range. Google asks for at least a /24.
resource "google_compute_global_address" "private_services" {
  name          = "scullery-private-services"
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = 24
  network       = google_compute_network.scullery.id
}

resource "google_service_networking_connection" "private_services" {
  network                 = google_compute_network.scullery.id
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.private_services.name]

  # Destroying the peering while a Cloud SQL instance still uses it fails; abandoning it
  # on destroy lets the instance go first, and Google removes the peering with the network.
  deletion_policy = "ABANDON"
}
