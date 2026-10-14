package server

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/rizkybiz/scullery-api/internal/db/dbtest"
)

func newTestServer(t *testing.T) (http.Handler, *pgxpool.Pool) {
	t.Helper()
	pool := dbtest.New(t)
	return New(slog.New(slog.NewTextHandler(io.Discard, nil)), "test", Deps{Pool: pool}), pool
}

func postJSON(t *testing.T, h http.Handler, path string, body any) *httptest.ResponseRecorder {
	t.Helper()
	raw, err := json.Marshal(body)
	if err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest(http.MethodPost, path, bytes.NewReader(raw))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

func recipeCount(t *testing.T, pool *pgxpool.Pool) int {
	t.Helper()
	var n int
	if err := pool.QueryRow(context.Background(), `SELECT count(*) FROM recipe`).Scan(&n); err != nil {
		t.Fatal(err)
	}
	return n
}

func TestCreateRecipe(t *testing.T) {
	h, pool := newTestServer(t)

	rec := postJSON(t, h, "/recipes", map[string]any{
		"title":    "Garlic bread",
		"servings": 4,
		"ingredients": []map[string]any{
			{"name": "butter", "quantity_min": 2, "unit_code": "tbsp", "preparation": "softened"},
			{"name": "garlic", "quantity_min": 2, "quantity_max": 3, "unit_code": "clove", "preparation": "minced"},
			{"name": "salt", "note": "to taste"},
		},
		"steps": []map[string]any{
			{"instruction": "Mix."},
			{"instruction": "Bake.", "timer_seconds": 600},
		},
	})

	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d, want 201: %s", rec.Code, rec.Body)
	}
	var got struct {
		ID          string   `json:"id"`
		Title       string   `json:"title"`
		Servings    *float64 `json:"servings"`
		YieldText   *string  `json:"yield_text"`
		CreatedAt   string   `json:"created_at"`
		Ingredients []struct {
			ID       string `json:"id"`
			Position int    `json:"position"`
			RawText  string `json:"raw_text"`
			UnitCode *string
		} `json:"ingredients"`
		Steps []struct {
			Position     int    `json:"position"`
			Instruction  string `json:"instruction"`
			TimerSeconds *int   `json:"timer_seconds"`
		} `json:"steps"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatalf("decode: %v: %s", err, rec.Body)
	}

	if got.ID == "" || got.CreatedAt == "" {
		t.Errorf("server-generated fields missing: id=%q created_at=%q", got.ID, got.CreatedAt)
	}
	if got.Title != "Garlic bread" || got.Servings == nil || *got.Servings != 4 {
		t.Errorf("recipe = %+v", got)
	}
	if got.YieldText != nil {
		t.Errorf("yield_text = %v, want null", *got.YieldText)
	}
	wantRaw := []string{"2 tbsp butter, softened", "2-3 clove garlic, minced", "salt"}
	for i, want := range wantRaw {
		ing := got.Ingredients[i]
		if ing.Position != i || ing.RawText != want || ing.ID == "" {
			t.Errorf("ingredient %d = %+v, want position %d and raw_text %q", i, ing, i, want)
		}
	}
	if len(got.Steps) != 2 || got.Steps[1].Position != 1 || got.Steps[1].TimerSeconds == nil || *got.Steps[1].TimerSeconds != 600 {
		t.Errorf("steps = %+v", got.Steps)
	}
	if n := recipeCount(t, pool); n != 1 {
		t.Errorf("stored recipes = %d, want 1", n)
	}
}

func TestCreateRecipeWithOnlyATitleReturnsEmptyLists(t *testing.T) {
	h, _ := newTestServer(t)

	rec := postJSON(t, h, "/recipes", map[string]any{"title": "Placeholder"})

	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d, want 201: %s", rec.Code, rec.Body)
	}
	body := rec.Body.String()
	if !strings.Contains(body, `"ingredients":[]`) || !strings.Contains(body, `"steps":[]`) {
		t.Errorf("want empty lists, not null, in: %s", body)
	}
}

func TestCreateRecipeRejectsBadInput(t *testing.T) {
	tests := []struct {
		name string
		body map[string]any
		want []string // error locations that must be reported
	}{
		// huma reports a missing required field at the parent object, naming the
		// field in the message, rather than at the field itself.
		{"missing title", map[string]any{}, []string{"body"}},
		{"blank title", map[string]any{"title": "   "}, []string{"body.title"}},
		{"zero servings", map[string]any{"title": "x", "servings": 0}, []string{"body.servings"}},
		{"negative quantity", map[string]any{"title": "x", "ingredients": []map[string]any{{"name": "a", "quantity_min": -1}}}, []string{"body.ingredients[0].quantity_min"}},
		{"unknown unit", map[string]any{"title": "x", "ingredients": []map[string]any{{"name": "a"}, {"name": "b", "unit_code": "nope"}}}, []string{"body.ingredients[1].unit_code"}},
		{"range without minimum", map[string]any{"title": "x", "ingredients": []map[string]any{{"name": "a", "quantity_max": 3}}}, []string{"body.ingredients[0].quantity_max"}},
		{"range backwards", map[string]any{"title": "x", "ingredients": []map[string]any{{"name": "a", "quantity_min": 3, "quantity_max": 2}}}, []string{"body.ingredients[0].quantity_max"}},
		{"blank ingredient name", map[string]any{"title": "x", "ingredients": []map[string]any{{"name": " "}}}, []string{"body.ingredients[0].name"}},
		{"blank step", map[string]any{"title": "x", "steps": []map[string]any{{"instruction": ""}}}, []string{"body.steps[0].instruction"}},
		{"timer of zero", map[string]any{"title": "x", "steps": []map[string]any{{"instruction": "a", "timer_seconds": 0}}}, []string{"body.steps[0].timer_seconds"}},
		{"all problems reported together", map[string]any{"title": " ", "ingredients": []map[string]any{{"name": "a", "unit_code": "nope"}}, "steps": []map[string]any{{"instruction": " "}}},
			[]string{"body.title", "body.ingredients[0].unit_code", "body.steps[0].instruction"}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			h, pool := newTestServer(t)

			rec := postJSON(t, h, "/recipes", tt.body)

			if rec.Code != http.StatusUnprocessableEntity {
				t.Fatalf("status = %d, want 422: %s", rec.Code, rec.Body)
			}
			var problem struct {
				Errors []struct {
					Location string `json:"location"`
					Message  string `json:"message"`
				} `json:"errors"`
			}
			if err := json.Unmarshal(rec.Body.Bytes(), &problem); err != nil {
				t.Fatalf("decode: %v: %s", err, rec.Body)
			}
			reported := map[string]bool{}
			for _, e := range problem.Errors {
				reported[e.Location] = true
			}
			for _, loc := range tt.want {
				if !reported[loc] {
					t.Errorf("no error reported at %s; got %+v", loc, problem.Errors)
				}
			}
			if n := recipeCount(t, pool); n != 0 {
				t.Errorf("a rejected request saved %d recipe(s)", n)
			}
		})
	}
}

func TestCreateRecipeHidesDatabaseErrors(t *testing.T) {
	h, pool := newTestServer(t)
	pool.Close() // every query now fails

	rec := postJSON(t, h, "/recipes", map[string]any{"title": "x"})

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("status = %d, want 500: %s", rec.Code, rec.Body)
	}
	if strings.Contains(rec.Body.String(), "closed pool") {
		t.Errorf("response leaks the database error: %s", rec.Body)
	}
}

func getPath(h http.Handler, path string) *httptest.ResponseRecorder {
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, path, nil))
	return rec
}

func TestGetRecipeReturnsWhatWasCreated(t *testing.T) {
	h, _ := newTestServer(t)
	created := postJSON(t, h, "/recipes", map[string]any{
		"title":       "Garlic bread",
		"ingredients": []map[string]any{{"name": "butter", "quantity_min": 2, "unit_code": "tbsp"}, {"name": "garlic"}},
		"steps":       []map[string]any{{"instruction": "Mix."}, {"instruction": "Bake."}},
	})
	if created.Code != http.StatusCreated {
		t.Fatalf("create status = %d: %s", created.Code, created.Body)
	}
	var id struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(created.Body.Bytes(), &id); err != nil {
		t.Fatal(err)
	}

	rec := getPath(h, "/recipes/"+id.ID)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200: %s", rec.Code, rec.Body)
	}
	if rec.Body.String() != created.Body.String() {
		t.Errorf("GET differs from the create response\n create: %s\n get:    %s", created.Body, rec.Body)
	}
}

func TestGetRecipeUnknownIDIs404(t *testing.T) {
	h, _ := newTestServer(t)

	rec := getPath(h, "/recipes/0198f3a2-0000-7000-8000-000000000000")

	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404: %s", rec.Code, rec.Body)
	}
	if ct := rec.Header().Get("Content-Type"); !strings.HasPrefix(ct, "application/problem+json") {
		t.Errorf("content type = %q, want problem+json", ct)
	}
}

func TestGetRecipeMalformedIDIs422(t *testing.T) {
	h, _ := newTestServer(t)

	rec := getPath(h, "/recipes/not-a-uuid")

	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d, want 422: %s", rec.Code, rec.Body)
	}
}

func TestGetRecipeHidesDatabaseErrors(t *testing.T) {
	h, pool := newTestServer(t)
	pool.Close()

	rec := getPath(h, "/recipes/0198f3a2-0000-7000-8000-000000000000")

	if rec.Code != http.StatusInternalServerError || strings.Contains(rec.Body.String(), "closed pool") {
		t.Fatalf("status = %d body = %s, want a generic 500", rec.Code, rec.Body)
	}
}
