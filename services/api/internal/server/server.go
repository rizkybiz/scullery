// Package server wires the HTTP layer: a stdlib ServeMux with huma on top,
// which gives typed handlers and a generated OpenAPI spec.
package server

import (
	"context"
	"log/slog"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	"github.com/danielgtaylor/huma/v2/adapters/humago"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Deps are the things handlers need from the outside world. They are passed in
// (not created here) so tests can supply a test database and the OpenAPI spec
// can be generated with none.
type Deps struct {
	// Pool is the database connection pool. Nil only when routes are registered
	// without serving requests (spec generation, health-only tests); a handler
	// that needs the database must not be called then.
	Pool *pgxpool.Pool
}

// New builds the root HTTP handler, including middleware.
func New(logger *slog.Logger, version string, deps Deps) http.Handler {
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
