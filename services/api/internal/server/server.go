// Package server wires the HTTP layer: a stdlib ServeMux with huma on top,
// which gives typed handlers and a generated OpenAPI spec.
package server

import (
	"context"
	"encoding/json"
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
	// Logger records errors that the API deliberately hides from callers (a
	// failed query becomes a generic 500). New sets it; do not set it yourself.
	Logger *slog.Logger
}

// New builds the root HTTP handler, including middleware.
func New(logger *slog.Logger, version string, deps Deps) http.Handler {
	deps.Logger = logger
	mux, _ := newAPI(version, deps)

	// Middleware wraps the mux; the first wrapper listed is the outermost.
	return chain(mux, recoverer(logger), requestLogger(logger))
}

// newAPI creates the mux and registers every route on it. Both the running
// server and the OpenAPI generator go through here, so the committed spec can
// never describe different routes than the server serves.
func newAPI(version string, deps Deps) (*http.ServeMux, huma.API) {
	mux := http.NewServeMux()
	cfg := huma.DefaultConfig("Scullery API", version)
	// huma's default adds a "$schema" property to every response body and a Link
	// header pointing at it. We publish openapi.json instead, so drop it: it would
	// only be noise in responses and in the web app's generated types.
	cfg.CreateHooks = nil
	api := humago.New(mux, cfg)

	registerHealth(api)
	registerUnits(api, deps)
	registerRecipes(api, deps)
	return mux, api
}

// specVersion is the version written into the committed openapi.json. It is a
// fixed placeholder, not the build version, so the file only changes when the
// API does.
const specVersion = "0.0.0"

// OpenAPI returns the API description as indented JSON. It needs no database:
// routes are registered but never called. The result is committed as
// openapi.json (make openapi), and the web app generates its types from it.
func OpenAPI() ([]byte, error) {
	_, api := newAPI(specVersion, Deps{})
	out, err := json.MarshalIndent(api.OpenAPI(), "", "  ")
	if err != nil {
		return nil, err
	}
	return append(out, '\n'), nil
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
