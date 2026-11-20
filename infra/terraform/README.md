# Infrastructure (Terraform)

Google Cloud resources for Scullery, and the trust that lets a Vercel deployment call them
without a stored secret.

**Status:** the sign-in chain is proven with a stand-in service (Google's public "hello"
image), and the foundation for the real API is in place: a private network, a registry, and a
Cloud SQL instance with no public address. The API's Cloud Run services and databases are
built on top of this next, and the stand-in is then removed.

## How a request from Vercel is allowed in

```
Vercel function
  1. gets an OIDC token from Vercel (short-lived, says which team/project/environment it is)
  2. sends it to Google's Security Token Service
       -> checked against the workload identity pool (vercel_auth.tf):
          issuer, audience, team and project must match
  3. acts as a service account and asks Google for an ID token for the Cloud Run URL
  4. calls Cloud Run with  Authorization: Bearer <ID token>
       -> Cloud Run checks the token and that the service account has run.invoker
```

No password or key is stored anywhere. A leaked deployment can act only as the service
account, which can do exactly one thing: call the services it was granted `run.invoker` on.
The app side of this is `apps/web/src/lib/api/gcp-auth.ts`.

## What is created

| File | Creates |
|---|---|
| `apis.tf` | the Google APIs in use (Cloud Run, IAM, STS, IAM Credentials) |
| `vercel_auth.tf` | workload identity pool + Vercel OIDC provider, the service account, and who may act as it |
| `spike.tf` | the Cloud Run service (requires sign-in, no public access) and its invoker grant |
| `network.tf` | a private network and subnet; the reserved range and peering that give Cloud SQL a private IP |
| `registry.tf` | the Artifact Registry repository for the API's container images |
| `database.tf` | the Cloud SQL instance: Postgres 17, `db-f1-micro`, **private IP only**, TLS required, daily backups |
| `outputs.tf` | the values the app needs, as environment variables |

The provider is pinned exactly (`versions.tf`) and `.terraform.lock.hcl` is committed.

## Trust is narrow on purpose

- The provider only accepts tokens from **this** Vercel team's **this** project
  (`attribute_condition` in `vercel_auth.tf`).
- The spike's service account is usable only by tokens whose `environment` claim is
  `development`, which is what `vercel env pull` produces locally. Preview and production
  are not trusted by the spike. The real setup gives staging and production their own service
  accounts, so a preview deployment can never reach production.
- Renaming the Vercel team or project changes the token's issuer, audience and subject, and
  breaks this trust until the variables are updated.

## Run it

You need `gcloud` logged in (`gcloud auth login` and `gcloud auth application-default login`),
Terraform, and a Google Cloud project with billing enabled.

```sh
cd infra/terraform
echo 'project_id = "<your-project-id>"' > terraform.tfvars   # git-ignored
terraform init
terraform plan -out=spike.tfplan
terraform apply spike.tfplan
```

The outputs map to the app's environment variables (all four or none):

| Output | Environment variable |
|---|---|
| `project_number` | `GCP_PROJECT_NUMBER` |
| `workload_identity_pool_id` | `GCP_WORKLOAD_IDENTITY_POOL_ID` |
| `workload_identity_provider_id` | `GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID` |
| `service_account_email` | `GCP_SERVICE_ACCOUNT_EMAIL` |

## What was checked

| Request | Result |
|---|---|
| no credentials | 403 |
| a made-up token | 401 |
| a valid Vercel identity, through `gcp-auth.ts` | 200 |
| the same identity with a token for a different audience | 401 |

A token takes about 600 ms to obtain and is then cached until five minutes before it expires.

**Allow a couple of minutes after `apply`.** A first call made about a minute after the IAM
grants were created failed with `getOpenIdToken denied`; the same call succeeded without any
change a little over a minute later. IAM changes are eventually consistent.

## Costs

The Cloud SQL instance is the first paid resource and bills from the moment it exists
(roughly $10 to $15 a month: a shared-core instance, 10 GB of SSD and backups; the exact
figures are checked on the billing page, not assumed). It has no public address, so there is
no IPv4 charge. Everything else is free or within a free tier: Cloud Run scales to zero, the
network and peering are free, and Artifact Registry gives 0.5 GB. Between work sessions the
instance can be stopped to pause its compute charge (storage keeps billing). Tear it all down
with `terraform destroy`; the enabled APIs are deliberately left on.

## Why the database is private

The instance has `ipv4_enabled = false`, so there is no address on the public internet to
attack or to misconfigure, and no allow-list to keep tidy. Cloud Run reaches it by joining the
private network (Direct VPC egress) and connecting over TCP to its private IP, with TLS
required. A real customer's production setup would look the same; this demo's weaker points
are elsewhere (one shared instance, shared-core with no SLA, no standby).

**Checked directly with `gcloud` after the apply:** `POSTGRES_17`, `db-f1-micro`, Enterprise,
zonal, 10 GB SSD, backups on, a single address of type `PRIVATE`, `sslMode: ENCRYPTED_ONLY`.
The first creation took about ten minutes.

## Not done yet

State is local (git-ignored, because it can hold secrets). Moving it to a Cloud Storage
bucket is needed once more than one person or pipeline applies this.
