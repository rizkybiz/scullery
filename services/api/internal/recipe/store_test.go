package recipe

import (
	"context"
	"encoding/json"
	"errors"
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
