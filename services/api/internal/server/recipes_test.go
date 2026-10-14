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

type listBody struct {
	Recipes []struct {
		ID         string `json:"id"`
		Title      string `json:"title"`
		IsFavorite bool   `json:"is_favorite"`
	} `json:"recipes"`
	Total  int `json:"total"`
	Limit  int `json:"limit"`
	Offset int `json:"offset"`
}

func listRecipes(t *testing.T, h http.Handler, query string) (listBody, *httptest.ResponseRecorder) {
	t.Helper()
	rec := getPath(h, "/recipes"+query)
	var body listBody
	if rec.Code == http.StatusOK {
		if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
			t.Fatalf("decode: %v: %s", err, rec.Body)
		}
	}
	return body, rec
}

func TestListRecipesWhenEmptyReturnsAnEmptyList(t *testing.T) {
	h, _ := newTestServer(t)

	body, rec := listRecipes(t, h, "")

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d: %s", rec.Code, rec.Body)
	}
	if !strings.Contains(rec.Body.String(), `"recipes":[]`) {
		t.Errorf("want an empty list, not null, in: %s", rec.Body)
	}
	if body.Total != 0 || body.Limit != 50 || body.Offset != 0 {
		t.Errorf("got %+v, want total 0 with the default limit 50 and offset 0", body)
	}
}

func TestListRecipesSearchFilterAndPaging(t *testing.T) {
	h, _ := newTestServer(t)
	for _, r := range []map[string]any{
		{"title": "Garlic bread", "is_favorite": true},
		{"title": "Tomato soup"},
		{"title": "Garlic butter shrimp"},
		{"title": "Lemon cake", "is_favorite": true},
	} {
		if rec := postJSON(t, h, "/recipes", r); rec.Code != http.StatusCreated {
			t.Fatalf("seed: %d %s", rec.Code, rec.Body)
		}
	}

	t.Run("search", func(t *testing.T) {
		body, _ := listRecipes(t, h, "?q=garlic")
		if body.Total != 2 || len(body.Recipes) != 2 {
			t.Errorf("garlic: %+v, want 2", body)
		}
	})
	t.Run("search with spaces and quotes needs URL encoding but works", func(t *testing.T) {
		body, _ := listRecipes(t, h, "?q=%22tomato+soup%22")
		if body.Total != 1 || body.Recipes[0].Title != "Tomato soup" {
			t.Errorf("phrase: %+v", body)
		}
	})
	t.Run("favorites only", func(t *testing.T) {
		body, _ := listRecipes(t, h, "?favorite=true")
		if body.Total != 2 {
			t.Errorf("favorites: %+v, want 2", body)
		}
		for _, r := range body.Recipes {
			if !r.IsFavorite {
				t.Errorf("%q is not a favorite", r.Title)
			}
		}
	})
	t.Run("non-favorites only", func(t *testing.T) {
		if body, _ := listRecipes(t, h, "?favorite=false"); body.Total != 2 {
			t.Errorf("non-favorites: %+v, want 2", body)
		}
	})
	t.Run("search and filter together", func(t *testing.T) {
		body, _ := listRecipes(t, h, "?q=garlic&favorite=true")
		if body.Total != 1 || body.Recipes[0].Title != "Garlic bread" {
			t.Errorf("garlic favorites: %+v", body)
		}
	})
	t.Run("paging echoes limit and offset and keeps the total", func(t *testing.T) {
		body, _ := listRecipes(t, h, "?limit=2&offset=2")
		if len(body.Recipes) != 2 || body.Total != 4 || body.Limit != 2 || body.Offset != 2 {
			t.Errorf("page 2: %+v", body)
		}
		// Alphabetical: Garlic bread, Garlic butter shrimp, Lemon cake, Tomato soup.
		if body.Recipes[0].Title != "Lemon cake" || body.Recipes[1].Title != "Tomato soup" {
			t.Errorf("page 2 titles: %+v", body.Recipes)
		}
	})
}

func TestListRecipesRejectsBadParameters(t *testing.T) {
	h, _ := newTestServer(t)
	for _, query := range []string{
		"?limit=0", "?limit=101", "?limit=abc", "?offset=-1", "?favorite=maybe",
		"?q=" + strings.Repeat("x", 201),
	} {
		t.Run(query[:min(len(query), 20)], func(t *testing.T) {
			if rec := getPath(h, "/recipes"+query); rec.Code != http.StatusUnprocessableEntity {
				t.Errorf("status = %d, want 422: %s", rec.Code, rec.Body)
			}
		})
	}
}

func TestListRecipesHidesDatabaseErrors(t *testing.T) {
	h, pool := newTestServer(t)
	pool.Close()

	rec := getPath(h, "/recipes")

	if rec.Code != http.StatusInternalServerError || strings.Contains(rec.Body.String(), "closed pool") {
		t.Fatalf("status = %d body = %s, want a generic 500", rec.Code, rec.Body)
	}
}

func putJSON(t *testing.T, h http.Handler, path string, body any) *httptest.ResponseRecorder {
	t.Helper()
	raw, err := json.Marshal(body)
	if err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest(http.MethodPut, path, bytes.NewReader(raw))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

// createdID creates a recipe through the API and returns its id.
func createdID(t *testing.T, h http.Handler, body map[string]any) string {
	t.Helper()
	rec := postJSON(t, h, "/recipes", body)
	if rec.Code != http.StatusCreated {
		t.Fatalf("create: %d %s", rec.Code, rec.Body)
	}
	var out struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatal(err)
	}
	return out.ID
}

func TestReplaceRecipe(t *testing.T) {
	h, _ := newTestServer(t)
	id := createdID(t, h, map[string]any{
		"title":       "Old",
		"servings":    2,
		"ingredients": []map[string]any{{"name": "old a"}, {"name": "old b"}},
		"steps":       []map[string]any{{"instruction": "old"}},
	})

	rec := putJSON(t, h, "/recipes/"+id, map[string]any{
		"title":       "New",
		"ingredients": []map[string]any{{"name": "new a", "quantity_min": 1, "unit_code": "cup"}},
	})

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200: %s", rec.Code, rec.Body)
	}
	var got struct {
		ID          string           `json:"id"`
		Title       string           `json:"title"`
		Servings    *float64         `json:"servings"`
		Ingredients []map[string]any `json:"ingredients"`
		Steps       []map[string]any `json:"steps"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	if got.ID != id || got.Title != "New" || got.Servings != nil {
		t.Errorf("got %+v, want the same id, the new title and servings cleared", got)
	}
	if len(got.Ingredients) != 1 || got.Ingredients[0]["raw_text"] != "1 cup new a" || len(got.Steps) != 0 {
		t.Errorf("lists not replaced: %+v / %+v", got.Ingredients, got.Steps)
	}

	// A later GET sees exactly what PUT returned.
	if again := getPath(h, "/recipes/"+id); again.Body.String() != rec.Body.String() {
		t.Errorf("GET differs from the PUT response\n put: %s\n get: %s", rec.Body, again.Body)
	}
}

func TestReplaceRecipeUnknownIDIs404(t *testing.T) {
	h, pool := newTestServer(t)

	rec := putJSON(t, h, "/recipes/0198f3a2-0000-7000-8000-000000000000", map[string]any{"title": "Ghost"})

	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404: %s", rec.Code, rec.Body)
	}
	if n := recipeCount(t, pool); n != 0 {
		t.Errorf("PUT to an unknown id created %d recipe(s); it must never create", n)
	}
}

func TestReplaceRecipeRejectsBadInputAndKeepsTheOldOne(t *testing.T) {
	h, _ := newTestServer(t)
	id := createdID(t, h, map[string]any{"title": "Keep me"})

	rec := putJSON(t, h, "/recipes/"+id, map[string]any{
		"title":       " ",
		"ingredients": []map[string]any{{"name": "a", "unit_code": "nope"}},
	})

	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d, want 422: %s", rec.Code, rec.Body)
	}
	for _, loc := range []string{"body.title", "body.ingredients[0].unit_code"} {
		if !strings.Contains(rec.Body.String(), loc) {
			t.Errorf("no error reported at %s: %s", loc, rec.Body)
		}
	}
	if !strings.Contains(getPath(h, "/recipes/"+id).Body.String(), `"title":"Keep me"`) {
		t.Error("the recipe changed despite the rejected edit")
	}
}

func TestReplaceRecipeMalformedIDIs422(t *testing.T) {
	h, _ := newTestServer(t)

	if rec := putJSON(t, h, "/recipes/not-a-uuid", map[string]any{"title": "x"}); rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d, want 422: %s", rec.Code, rec.Body)
	}
}

func TestReplaceRecipeHidesDatabaseErrors(t *testing.T) {
	h, pool := newTestServer(t)
	pool.Close()

	rec := putJSON(t, h, "/recipes/0198f3a2-0000-7000-8000-000000000000", map[string]any{"title": "x"})

	if rec.Code != http.StatusInternalServerError || strings.Contains(rec.Body.String(), "closed pool") {
		t.Fatalf("status = %d body = %s, want a generic 500", rec.Code, rec.Body)
	}
}

func deletePath(h http.Handler, path string) *httptest.ResponseRecorder {
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodDelete, path, nil))
	return rec
}

func TestDeleteRecipe(t *testing.T) {
	h, pool := newTestServer(t)
	id := createdID(t, h, map[string]any{
		"title":       "Doomed",
		"ingredients": []map[string]any{{"name": "a"}},
		"steps":       []map[string]any{{"instruction": "x"}},
	})
	keep := createdID(t, h, map[string]any{"title": "Keep"})

	rec := deletePath(h, "/recipes/"+id)

	if rec.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want 204: %s", rec.Code, rec.Body)
	}
	if rec.Body.Len() != 0 {
		t.Errorf("a 204 must have no body, got %q", rec.Body)
	}
	if got := getPath(h, "/recipes/"+id); got.Code != http.StatusNotFound {
		t.Errorf("GET after delete = %d, want 404", got.Code)
	}
	if got := getPath(h, "/recipes/"+keep); got.Code != http.StatusOK {
		t.Errorf("the other recipe: GET = %d, want 200", got.Code)
	}
	if n := recipeCount(t, pool); n != 1 {
		t.Errorf("recipes left = %d, want 1", n)
	}
}

func TestDeleteRecipeUnknownIDIs404(t *testing.T) {
	h, _ := newTestServer(t)

	if rec := deletePath(h, "/recipes/0198f3a2-0000-7000-8000-000000000000"); rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404: %s", rec.Code, rec.Body)
	}
}

func TestDeleteRecipeTwiceIs404ThenNothingChanges(t *testing.T) {
	h, _ := newTestServer(t)
	id := createdID(t, h, map[string]any{"title": "Once"})

	first := deletePath(h, "/recipes/"+id)
	second := deletePath(h, "/recipes/"+id)

	if first.Code != http.StatusNoContent || second.Code != http.StatusNotFound {
		t.Errorf("statuses = %d then %d, want 204 then 404", first.Code, second.Code)
	}
}

func TestDeleteRecipeUsedAsSubRecipeIs409(t *testing.T) {
	h, pool := newTestServer(t)
	dough := createdID(t, h, map[string]any{"title": "Pizza dough"})
	pizza := createdID(t, h, map[string]any{"title": "Pizza", "ingredients": []map[string]any{{"name": "pizza dough"}}})
	// The API cannot set sub_recipe_id yet; link them directly.
	if _, err := pool.Exec(context.Background(), `UPDATE ingredient SET sub_recipe_id = $1 WHERE recipe_id = $2`, dough, pizza); err != nil {
		t.Fatal(err)
	}

	rec := deletePath(h, "/recipes/"+dough)

	if rec.Code != http.StatusConflict {
		t.Fatalf("status = %d, want 409: %s", rec.Code, rec.Body)
	}
	if !strings.Contains(rec.Body.String(), "another recipe") {
		t.Errorf("the message should say why: %s", rec.Body)
	}
	if got := getPath(h, "/recipes/"+dough); got.Code != http.StatusOK {
		t.Errorf("the refused delete removed the recipe: GET = %d", got.Code)
	}
}

func TestDeleteRecipeMalformedIDIs422(t *testing.T) {
	h, _ := newTestServer(t)

	if rec := deletePath(h, "/recipes/not-a-uuid"); rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d, want 422: %s", rec.Code, rec.Body)
	}
}

func TestDeleteRecipeHidesDatabaseErrors(t *testing.T) {
	h, pool := newTestServer(t)
	pool.Close()

	rec := deletePath(h, "/recipes/0198f3a2-0000-7000-8000-000000000000")

	if rec.Code != http.StatusInternalServerError || strings.Contains(rec.Body.String(), "closed pool") {
		t.Fatalf("status = %d body = %s, want a generic 500", rec.Code, rec.Body)
	}
}
