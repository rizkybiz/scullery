package server

import (
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/rizkybiz/scullery/services/api/internal/db/dbtest"
)

func TestListUnits(t *testing.T) {
	pool := dbtest.New(t)
	h := New(slog.New(slog.NewTextHandler(io.Discard, nil)), "test", Deps{Pool: pool})

	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/units", nil))

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200: %s", rec.Code, rec.Body)
	}
	// Decode loosely so the test sees the JSON the client sees, including nulls.
	var body struct {
		Units []map[string]any `json:"units"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode: %v: %s", err, rec.Body)
	}

	// The migration seeds 22 units.
	if len(body.Units) != 22 {
		t.Fatalf("got %d units, want 22", len(body.Units))
	}

	// Ordered by dimension, then name, with count units (no factor) first.
	first := body.Units[0]
	if first["code"] != "bunch" || first["dimension"] != "count" {
		t.Errorf("first unit = %v, want the count unit 'bunch'", first)
	}
	if v, present := first["base_factor"]; !present || v != nil {
		t.Errorf("count unit base_factor = %v (present=%v), want an explicit null", v, present)
	}

	var tbsp map[string]any
	for _, u := range body.Units {
		if u["code"] == "tbsp" {
			tbsp = u
		}
	}
	if tbsp == nil || tbsp["name"] != "tablespoon" || tbsp["dimension"] != "volume" {
		t.Fatalf("tbsp = %v, want tablespoon / volume", tbsp)
	}
	if f, _ := tbsp["base_factor"].(float64); f < 14.78 || f > 14.79 {
		t.Errorf("tbsp base_factor = %v, want about 14.786765 ml", tbsp["base_factor"])
	}
}

func TestListUnitsHidesDatabaseErrors(t *testing.T) {
	pool := dbtest.New(t)
	h := New(slog.New(slog.NewTextHandler(io.Discard, nil)), "test", Deps{Pool: pool})
	pool.Close() // every query now fails

	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/units", nil))

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("status = %d, want 500", rec.Code)
	}
	if ct := rec.Header().Get("Content-Type"); !strings.HasPrefix(ct, "application/problem+json") {
		t.Errorf("content type = %q, want problem+json", ct)
	}
	// The caller gets a generic message, never the driver's error text.
	if strings.Contains(rec.Body.String(), "closed pool") {
		t.Errorf("response leaks the database error: %s", rec.Body)
	}
}
