package recipe

import (
	"context"
	"encoding/json"
	"errors"
	"slices"
	"strings"
	"testing"

	"github.com/google/uuid"

	"github.com/rizkybiz/scullery-api/internal/db/dbtest"
)

func count(t *testing.T, s *Store, table string) int {
	t.Helper()
	var n int
	if err := s.pool.QueryRow(context.Background(), `SELECT count(*) FROM `+table).Scan(&n); err != nil {
		t.Fatal(err)
	}
	return n
}

func TestCreateSavesRecipeIngredientsAndSteps(t *testing.T) {
	ctx := context.Background()
	s := NewStore(dbtest.New(t))

	got, err := s.Create(ctx, NewRecipe{
		Title:       "  Garlic bread  ",
		Servings:    ptr(4.0),
		IsFavorite:  true,
		Ingredients: []NewIngredient{{Name: "butter", QuantityMin: ptr(2.0), UnitCode: ptr("tbsp"), Preparation: ptr("softened")}, {Name: "garlic", QuantityMin: ptr(2.0), QuantityMax: ptr(3.0), UnitCode: ptr("clove")}},
		Steps:       []NewStep{{Instruction: "Mix."}, {Instruction: "Bake.", TimerSeconds: ptr(int32(600))}},
	})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}

	if got.ID.Version() != 7 {
		t.Errorf("recipe id version = %d, want 7", got.ID.Version())
	}
	if got.Title != "Garlic bread" {
		t.Errorf("title = %q, want it trimmed", got.Title)
	}
	if got.CreatedAt.IsZero() || got.UpdatedAt.IsZero() {
		t.Error("timestamps were not filled in by the database")
	}
	if len(got.Ingredients) != 2 || got.Ingredients[0].Position != 0 || got.Ingredients[1].Position != 1 {
		t.Fatalf("ingredients = %+v, want positions 0 and 1 in the order sent", got.Ingredients)
	}
	if got.Ingredients[0].RawText != "2 tbsp butter, softened" || got.Ingredients[1].RawText != "2-3 clove garlic" {
		t.Errorf("raw text = %q / %q", got.Ingredients[0].RawText, got.Ingredients[1].RawText)
	}

	// What was returned is what was stored.
	var title, raw string
	var pos int32
	if err := s.pool.QueryRow(ctx, `SELECT title FROM recipe WHERE id = $1`, got.ID).Scan(&title); err != nil || title != "Garlic bread" {
		t.Fatalf("stored title = %q, err %v", title, err)
	}
	if err := s.pool.QueryRow(ctx,
		`SELECT position, raw_text FROM ingredient WHERE recipe_id = $1 AND name = 'garlic'`, got.ID).Scan(&pos, &raw); err != nil {
		t.Fatal(err)
	}
	if pos != 1 || raw != "2-3 clove garlic" {
		t.Errorf("stored garlic = position %d, %q", pos, raw)
	}
	if n := count(t, s, "step"); n != 2 {
		t.Errorf("stored steps = %d, want 2", n)
	}
}

func TestCreateWithNoIngredientsOrStepsReturnsEmptyLists(t *testing.T) {
	s := NewStore(dbtest.New(t))
	got, err := s.Create(context.Background(), NewRecipe{Title: "Placeholder"})
	if err != nil {
		t.Fatal(err)
	}
	if got.Ingredients == nil || got.Steps == nil {
		t.Error("lists must be empty, not nil, so they encode as [] and not null")
	}
}

func TestCreateRejectsInvalidRecipeWithoutSavingAnything(t *testing.T) {
	s := NewStore(dbtest.New(t))

	_, err := s.Create(context.Background(), NewRecipe{
		Title:       "Bad",
		Ingredients: []NewIngredient{{Name: "x", UnitCode: ptr("nonsense")}},
	})
	var invalid *ValidationError
	if !errors.As(err, &invalid) {
		t.Fatalf("err = %v, want a *ValidationError", err)
	}
	if n := count(t, s, "recipe"); n != 0 {
		t.Errorf("recipes saved = %d, want 0", n)
	}
}

// If something fails halfway, the recipe row written first must not survive.
// Validation normally stops bad data before it gets here, so this calls insert
// directly with a quantity too large for the column to force a database error
// after the recipe row and the first ingredient have already been written.
func TestInsertRollsBackEverythingOnFailure(t *testing.T) {
	s := NewStore(dbtest.New(t))

	_, err := s.insert(context.Background(), NewRecipe{
		Title: "Half written",
		Ingredients: []NewIngredient{
			{Name: "fine"},
			{Name: "too much", QuantityMin: ptr(99999999.0)}, // numeric(10,4) overflows
		},
		Steps: []NewStep{{Instruction: "never reached"}},
	})
	if err == nil {
		t.Fatal("want an error from the oversized quantity")
	}
	for _, table := range []string{"recipe", "ingredient", "step"} {
		if n := count(t, s, table); n != 0 {
			t.Errorf("%s rows left behind = %d, want 0 (the transaction should have rolled back)", table, n)
		}
	}
}

func TestGetReturnsWhatCreateSaved(t *testing.T) {
	ctx := context.Background()
	s := NewStore(dbtest.New(t))

	created, err := s.Create(ctx, NewRecipe{
		Title:       "Garlic bread",
		Description: "Crisp outside, soft inside.",
		Servings:    ptr(4.0),
		YieldText:   ptr("1 loaf"),
		Ingredients: []NewIngredient{{Name: "butter", QuantityMin: ptr(2.0), UnitCode: ptr("tbsp")}, {Name: "garlic", QuantityMin: ptr(2.0), QuantityMax: ptr(3.0), UnitCode: ptr("clove"), Section: ptr("Topping")}, {Name: "salt"}},
		Steps:       []NewStep{{Instruction: "Mix."}, {Instruction: "Bake.", TimerSeconds: ptr(int32(600))}},
	})
	if err != nil {
		t.Fatal(err)
	}

	got, err := s.Get(ctx, created.ID)
	if err != nil {
		t.Fatalf("Get: %v", err)
	}

	// Compare as JSON: that is what clients see, and it avoids false differences
	// from time.Time's internal representation.
	want, _ := json.Marshal(created)
	have, _ := json.Marshal(got)
	if string(want) != string(have) {
		t.Errorf("Get differs from what Create returned\n create: %s\n get:    %s", want, have)
	}
}

func TestGetReturnsIngredientsAndStepsInPositionOrder(t *testing.T) {
	ctx := context.Background()
	s := NewStore(dbtest.New(t))
	created, err := s.Create(ctx, NewRecipe{
		Title:       "Ordered",
		Ingredients: []NewIngredient{{Name: "a"}, {Name: "b"}, {Name: "c"}},
		Steps:       []NewStep{{Instruction: "one"}, {Instruction: "two"}, {Instruction: "three"}},
	})
	if err != nil {
		t.Fatal(err)
	}
	// Reverse the stored positions so row order on disk differs from list order.
	// The unique constraint is deferred, so a reversal is allowed in one statement.
	for _, table := range []string{"ingredient", "step"} {
		if _, err := s.pool.Exec(ctx, `UPDATE `+table+` SET position = 2 - position WHERE recipe_id = $1`, created.ID); err != nil {
			t.Fatal(err)
		}
	}

	got, err := s.Get(ctx, created.ID)
	if err != nil {
		t.Fatal(err)
	}
	if got.Ingredients[0].Name != "c" || got.Ingredients[2].Name != "a" || got.Steps[0].Instruction != "three" {
		t.Errorf("not in position order: %+v / %+v", got.Ingredients, got.Steps)
	}
}

func TestGetUnknownRecipeIsNotFound(t *testing.T) {
	s := NewStore(dbtest.New(t))

	_, err := s.Get(context.Background(), uuid.New())

	if !errors.Is(err, ErrNotFound) {
		t.Fatalf("err = %v, want ErrNotFound", err)
	}
}

// seed saves recipes with the given titles; favorites are marked by a "*" prefix
// that is stripped from the title.
func seed(t *testing.T, s *Store, titles ...string) {
	t.Helper()
	for _, title := range titles {
		fav := strings.HasPrefix(title, "*")
		if _, err := s.Create(context.Background(), NewRecipe{Title: strings.TrimPrefix(title, "*"), IsFavorite: fav}); err != nil {
			t.Fatalf("seed %q: %v", title, err)
		}
	}
}

func titles(l List) []string {
	out := make([]string, len(l.Recipes))
	for i, r := range l.Recipes {
		out[i] = r.Title
	}
	return out
}

func TestListIsAlphabeticalAndCaseInsensitive(t *testing.T) {
	s := NewStore(dbtest.New(t))
	seed(t, s, "banana bread", "Apple pie", "cherry tart")

	got, err := s.List(context.Background(), ListParams{Limit: 10})
	if err != nil {
		t.Fatal(err)
	}

	if !slices.Equal(titles(got), []string{"Apple pie", "banana bread", "cherry tart"}) {
		t.Errorf("titles = %v", titles(got))
	}
	if got.Total != 3 {
		t.Errorf("total = %d, want 3", got.Total)
	}
}

func TestListOfNothingIsAnEmptyListNotNull(t *testing.T) {
	s := NewStore(dbtest.New(t))

	got, err := s.List(context.Background(), ListParams{Limit: 10})

	if err != nil {
		t.Fatal(err)
	}
	if got.Recipes == nil || len(got.Recipes) != 0 || got.Total != 0 {
		t.Errorf("got %+v, want an empty non-nil list and total 0", got)
	}
}

func TestListPagesDoNotOverlapAndTotalCoversAllPages(t *testing.T) {
	s := NewStore(dbtest.New(t))
	seed(t, s, "a", "b", "c", "d", "e")
	ctx := context.Background()

	var all []string
	for offset := int32(0); offset < 6; offset += 2 {
		page, err := s.List(ctx, ListParams{Limit: 2, Offset: offset})
		if err != nil {
			t.Fatal(err)
		}
		if page.Total != 5 {
			t.Errorf("offset %d: total = %d, want 5 on every page", offset, page.Total)
		}
		all = append(all, titles(page)...)
	}

	if !slices.Equal(all, []string{"a", "b", "c", "d", "e"}) {
		t.Errorf("pages concatenated = %v, want each recipe exactly once, in order", all)
	}
}

func TestListOffsetPastTheEndIsEmptyButKeepsTheTotal(t *testing.T) {
	s := NewStore(dbtest.New(t))
	seed(t, s, "a", "b")

	got, err := s.List(context.Background(), ListParams{Limit: 10, Offset: 50})

	if err != nil {
		t.Fatal(err)
	}
	if len(got.Recipes) != 0 || got.Total != 2 {
		t.Errorf("got %d recipes, total %d; want none and 2", len(got.Recipes), got.Total)
	}
}

func TestListSearch(t *testing.T) {
	s := NewStore(dbtest.New(t))
	seed(t, s, "Garlic bread", "Tomato soup", "Chocolate cake", "Lemon cake", "Garlic butter shrimp")
	ctx := context.Background()

	tests := []struct {
		name   string
		search string
		want   []string
	}{
		{"a word", "garlic", []string{"Garlic bread", "Garlic butter shrimp"}},
		{"stemming: plural finds singular", "tomatoes", []string{"Tomato soup"}},
		{"exclusion", "cake -chocolate", []string{"Lemon cake"}},
		{"quoted phrase", `"tomato soup"`, []string{"Tomato soup"}},
		{"no match", "pizza", []string{}},
		{"blank means no search", "   ", []string{"Chocolate cake", "Garlic bread", "Garlic butter shrimp", "Lemon cake", "Tomato soup"}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := s.List(ctx, ListParams{Search: ptr(tt.search), Limit: 10})
			if err != nil {
				t.Fatal(err)
			}
			if !slices.Equal(titles(got), tt.want) {
				t.Errorf("titles = %v, want %v", titles(got), tt.want)
			}
			if got.Total != int64(len(tt.want)) {
				t.Errorf("total = %d, want %d (the count must use the same filter)", got.Total, len(tt.want))
			}
		})
	}
}

func TestListSearchPutsTheBestMatchFirst(t *testing.T) {
	s := NewStore(dbtest.New(t))
	ctx := context.Background()
	// Alphabetically "Aardvark" would come first; the better match must beat that.
	if _, err := s.Create(ctx, NewRecipe{Title: "Aardvark stew", Description: "Contains a little garlic."}); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Create(ctx, NewRecipe{Title: "Garlic garlic garlic", Description: "All about garlic."}); err != nil {
		t.Fatal(err)
	}

	got, err := s.List(ctx, ListParams{Search: ptr("garlic"), Limit: 10})

	if err != nil {
		t.Fatal(err)
	}
	if !slices.Equal(titles(got), []string{"Garlic garlic garlic", "Aardvark stew"}) {
		t.Errorf("titles = %v, want the stronger match first", titles(got))
	}
}

func TestListFavoriteFilter(t *testing.T) {
	s := NewStore(dbtest.New(t))
	seed(t, s, "*Keeper", "Meh", "*Also good")
	ctx := context.Background()

	yes, err := s.List(ctx, ListParams{Favorite: ptr(true), Limit: 10})
	if err != nil {
		t.Fatal(err)
	}
	no, err := s.List(ctx, ListParams{Favorite: ptr(false), Limit: 10})
	if err != nil {
		t.Fatal(err)
	}

	if !slices.Equal(titles(yes), []string{"Also good", "Keeper"}) || yes.Total != 2 {
		t.Errorf("favorites = %v (total %d)", titles(yes), yes.Total)
	}
	if !slices.Equal(titles(no), []string{"Meh"}) || no.Total != 1 {
		t.Errorf("non-favorites = %v (total %d)", titles(no), no.Total)
	}
}
