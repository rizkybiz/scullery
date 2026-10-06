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

# One-time per clone: use the versioned git hooks (commit-msg, pre-commit).
.PHONY: hooks
hooks:
	git config core.hooksPath .githooks

# The same static checks and unit tests CI runs.
.PHONY: verify
verify:
	./scripts/ci/verify.sh
