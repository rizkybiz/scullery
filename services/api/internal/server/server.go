// Package server wires the HTTP layer: a stdlib ServeMux with huma on top,
// which gives typed handlers and a generated OpenAPI spec.
package server

import (
	"context"
	"log/slog"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	"github.com/danielgtaylor/huma/v2/adapters/humago"
)

// New builds the root HTTP handler, including middleware.
func New(logger *slog.Logger, version string) http.Handler {
	mux := http.NewServeMux()

	cfg := huma.DefaultConfig("Scullery API", version)
	api := humago.New(mux, cfg)

	registerHealth(api)

	// Middleware wraps the mux; the first wrapper listed is the outermost.
	return chain(mux, recoverer(logger), requestLogger(logger))
}

type healthOutput struct {
	Body struct {
		Status string `json:"status" example:"ok" doc:"Liveness status"`
	}
}

func registerHealth(api huma.API) {
	huma.Get(api, "/healthz", func(_ context.Context, _ *struct{}) (*healthOutput, error) {
		out := &healthOutput{}
		out.Body.Status = "ok"
		return out, nil
	})
}
