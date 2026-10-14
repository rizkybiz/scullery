VERSION ?= dev

.PHONY: run test vet build
run:
	go run ./cmd/scullery-api

test:
	go test ./...

vet:
	go vet ./...

build:
	CGO_ENABLED=0 go build -ldflags "-X main.version=$(VERSION)" -o bin/scullery-api ./cmd/scullery-api

.PHONY: up down migrate-up migrate-status
up:
	docker compose up --build -d

down:
	docker compose down

# Run migrations against the local compose Postgres.
migrate-up:
	DATABASE_URL="postgres://scullery:scullery@localhost:5432/scullery?sslmode=disable" go run ./cmd/scullery-api migrate up

migrate-status:
	DATABASE_URL="postgres://scullery:scullery@localhost:5432/scullery?sslmode=disable" go run ./cmd/scullery-api migrate status

# Regenerate the typed query code in internal/dbgen from the SQL in
# internal/dbgen/queries. sqlc is pinned in tools/go.mod, so there is nothing to
# install; the first run compiles it (about a minute) and later runs are fast.
.PHONY: sqlc
sqlc:
	go tool -modfile=tools/go.mod sqlc generate

# Regenerate the committed API description. The web app generates its types from
# openapi.json, and a test fails if the file is out of date.
.PHONY: openapi
openapi:
	go run ./cmd/scullery-api openapi > openapi.json.tmp && mv openapi.json.tmp openapi.json

# One-time per clone: use the versioned git hooks (commit-msg, pre-commit).
.PHONY: hooks
hooks:
	git config core.hooksPath .githooks

# The same static checks and unit tests CI runs.
.PHONY: verify
verify:
	./scripts/ci/verify.sh
