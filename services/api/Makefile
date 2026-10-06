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
