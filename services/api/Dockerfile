# Both base images are pinned by DIGEST, not only by tag. A tag moves, and a cached copy can lag
# behind it: `golang:1.26` had already become 1.26.11 while a cached 1.26.8 kept being used, and
# the deployed image shipped nine known vulnerabilities in the Go standard library (see "Image
# supply chain" in README.md). A digest cannot move. To update, change a digest on purpose and
# re-scan; the README shows how.
FROM golang:1.26.11@sha256:4165ee6bf3b7811fd7b40373290405c83d0167dcb87ee5f29c427cdcef45ff8f AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
ARG VERSION=dev
RUN CGO_ENABLED=0 go build -ldflags "-X main.version=${VERSION}" -o /out/scullery-api ./cmd/scullery-api

# Signed by Google (verified with cosign when pinned); contains no shell or package manager.
FROM gcr.io/distroless/static-debian12:nonroot@sha256:afa5c872c891853ca7fcf1f12c3edb23f7eeef36189728842dd51042ff57f7ab
COPY --from=build /out/scullery-api /scullery-api
EXPOSE 8080
ENTRYPOINT ["/scullery-api"]
