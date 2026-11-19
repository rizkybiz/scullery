# How a request from Vercel proves who it is to Google Cloud, with no stored secret.
#
#   Vercel function --(OIDC token, minted by Vercel)--> Google STS
#     --(trust check: issuer, audience, owner, project)--> short-lived Google credential
#     --(impersonate)--> service account --(ID token for Cloud Run)--> Cloud Run
#
# Nothing here is a password. A leaked deployment can only act as the service account
# below, which can do exactly one thing: call the services it is granted run.invoker on.

resource "google_iam_workload_identity_pool" "vercel" {
  workload_identity_pool_id = "vercel"
  display_name              = "Vercel"
  description               = "Identities issued by Vercel's OIDC provider"

  depends_on = [google_project_service.apis]
}

resource "google_iam_workload_identity_pool_provider" "vercel" {
  workload_identity_pool_id          = google_iam_workload_identity_pool.vercel.workload_identity_pool_id
  workload_identity_pool_provider_id = "vercel-oidc"
  display_name                       = "Vercel OIDC (team)"

  # Copy the token's claims into attributes Google can match on.
  attribute_mapping = {
    "google.subject"        = "assertion.sub"
    "attribute.owner"       = "assertion.owner"
    "attribute.project"     = "assertion.project"
    "attribute.environment" = "assertion.environment"
  }

  # The provider accepts tokens only from THIS team's THIS project. Anyone else's Vercel
  # token is rejected here, before any service account is involved.
  attribute_condition = "assertion.owner == '${var.vercel_team_slug}' && assertion.project == '${var.vercel_project_name}'"

  oidc {
    issuer_uri        = "https://oidc.vercel.com/${var.vercel_team_slug}"
    allowed_audiences = ["https://vercel.com/${var.vercel_team_slug}"]
  }
}

# The identity Vercel acts as. For the spike there is one; staging and production get
# their own so that a preview deployment can never reach production.
resource "google_service_account" "spike_caller" {
  account_id   = "vercel-spike-caller"
  display_name = "Vercel (spike): calls the spike Cloud Run service"

  depends_on = [google_project_service.apis]
}

# Who may act as that service account: only tokens whose `environment` claim is
# "development", which is what `vercel env pull` / `vercel dev` produce locally. Preview
# and production are deliberately not trusted by the spike.
resource "google_service_account_iam_member" "spike_trust" {
  service_account_id = google_service_account.spike_caller.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.vercel.name}/attribute.environment/development"
}
