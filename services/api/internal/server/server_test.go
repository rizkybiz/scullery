package server

import (
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
)

func TestHealthz(t *testing.T) {
	h := New(slog.New(slog.NewTextHandler(io.Discard, nil)), "test", Deps{})

	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/healthz", nil))

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	if body := rec.Body.String(); !strings.Contains(body, `"status":"ok"`) {
		t.Fatalf("body = %q, want status ok", body)
	}
	if body := rec.Body.String(); !strings.Contains(body, `"version":"test"`) {
		t.Fatalf("body = %q, want the build version", body)
	}
}

func TestOpenAPIServed(t *testing.T) {
	h := New(slog.New(slog.NewTextHandler(io.Discard, nil)), "test", Deps{})

	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/openapi.json", nil))

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
}

// The committed openapi.json is the contract the web app generates its types
// from, so it must match what the server actually serves.
func TestCommittedOpenAPIIsCurrent(t *testing.T) {
	want, err := OpenAPI()
	if err != nil {
		t.Fatalf("OpenAPI: %v", err)
	}
	got, err := os.ReadFile("../../openapi.json")
	if err != nil {
		t.Fatalf("read openapi.json: %v (run: make openapi)", err)
	}
	if string(got) != string(want) {
		t.Fatal("openapi.json is out of date; run: make openapi, then commit it")
	}
}
