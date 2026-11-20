# Infrastructure (Terraform)

Google Cloud resources for Scullery, and the trust that lets a Vercel deployment call them
without a stored secret.

**Status:** the sign-in chain is proven, and the **staging** environment of the real API is
running: a private network, a registry, a Cloud SQL instance with no public address, and the
Go API on Cloud Run, reached over that private network. Production is the same module with a
different name, and is next. The stand-in "spike" service is removed once that is done.

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
| `environments.tf` | one instance of the module below per environment (staging today) |
| `modules/api_environment/` | one environment of the API: its database and user, a generated password in Secret Manager, a Cloud Run service on the private network, a migration job, and the service account Vercel acts as |
| `api_image.auto.tfvars` | the API image that runs, pinned by digest. Committed: changing it is the deploy, and git shows what ran when |
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

## Deploying an image

The image is built and pushed by hand for now (CI comes later), then pinned by digest:

```sh
IMAGE=us-east1-docker.pkg.dev/<project>/scullery/api ; TAG=$(git rev-parse --short HEAD)
docker build --platform linux/amd64 --build-arg VERSION=$TAG -t $IMAGE:$TAG services/api
docker push $IMAGE:$TAG
gcloud artifacts docker images describe $IMAGE:$TAG --format='value(image_summary.fully_qualified_digest)'
```

Put that digest in `api_image.auto.tfvars`, then `terraform plan` and `apply`. A digest cannot be
overwritten the way a tag can, so what runs is exactly what was built. The digest of an image
built with Docker's default settings is an OCI *index* holding the `linux/amd64` image plus a
build-provenance attestation, a signed record of how it was built. Then run the migrations:

```sh
gcloud run jobs execute scullery-migrate-staging --region us-east1 --wait
```

## What was checked on staging

Through the real Vercel-identity chain, with the production `gcp-auth.ts`:

| Request | Result |
|---|---|
| no credentials | 403 |
| a made-up token | 401 |
| a valid Vercel identity | 200, 22 units read from the private database |
| the same identity, token meant for another audience | 401 |
| the spike's service account calling staging | 403 (separate services, separate identities) |
| create, read back and delete a recipe | 201, 200, 204: writes work over the private network |
| a warm database query, from a laptop | about 54 ms |

The migration job ran `0001_init.sql` in 85 ms. The database user was created through Cloud
SQL's API, which let it create tables in the `public` schema without extra grants. The flip
side is that such users are members of `cloudsqlsuperuser`, so staging and production share a
more powerful role than a tightly scoped one; dedicated roles created with SQL would be the
next step for a real customer.

## Things that went wrong, and what they taught

- **Second-generation Cloud Run needs at least 512 MiB.** The first apply, with 256 MiB, failed
  at the service. It was raised to 512 MiB (the cause is inferred from the state and the fix;
  the error text was not kept). Terraform had recorded everything created before the failure,
  so the second apply created only the two missing resources.
- **`/healthz` is unreachable on Cloud Run.** Google's front end answers it with its own 404
  *before* authentication, so an unauthenticated request got 404 instead of 403, and the
  service's own health endpoint cannot be called from outside. Paths ending in `z` can be
  reserved ([known issues](https://docs.cloud.google.com/run/docs/known-issues)). The startup
  probe still works, because it runs inside the platform. The first negative tests used this
  path and proved nothing; they were redone on `/units`. **Fixed** by renaming the endpoint to
  `/health` (API, web client and the probe changed together). Verified through the real chain:
  no credentials now gets 403, a made-up token 401, a valid identity 200 with the version of
  the commit that was built, and the old `/healthz` still gets Google's 404.
- **A rollout is safe by construction.** Changing the image makes Cloud Run create a new
  revision and send traffic to it only once it passes the startup probe; the previous revision
  stays available, so a bad image does not take the service down.
- **IAM is eventually consistent.** Allow a minute or two after granting a role.

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
