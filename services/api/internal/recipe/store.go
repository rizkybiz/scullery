package recipe

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/rizkybiz/scullery-api/internal/dbgen"
)

// Store saves and loads recipes.
type Store struct {
	pool *pgxpool.Pool
}

func NewStore(pool *pgxpool.Pool) *Store {
	return &Store{pool: pool}
}

// Create validates a new recipe and saves it with its ingredients and steps in
// one transaction: either all of it is stored or none of it is.
//
// A request that breaks a rule returns a *ValidationError listing every problem;
// any other error is a failure of the system, not of the request.
func (s *Store) Create(ctx context.Context, in NewRecipe) (Recipe, error) {
	in = normalize(in)

	units, err := dbgen.New(s.pool).ListUnits(ctx)
	if err != nil {
		return Recipe{}, fmt.Errorf("list units: %w", err)
	}
	known := make(map[string]bool, len(units))
	for _, u := range units {
		known[u.Code] = true
	}
	if problems := validate(in, known); len(problems) > 0 {
		return Recipe{}, &ValidationError{Problems: problems}
	}

	return s.insert(ctx, in)
}

// insert writes an already-validated recipe in a single transaction.
func (s *Store) insert(ctx context.Context, in NewRecipe) (Recipe, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return Recipe{}, fmt.Errorf("begin: %w", err)
	}
	// After a successful Commit this is a harmless no-op; on any early return it
	// undoes everything written so far. Its own error is ignored on purpose: the
	// one that matters was already returned.
	defer tx.Rollback(ctx)
	q := dbgen.New(s.pool).WithTx(tx)

	// UUIDv7 ids sort by creation time, which keeps the primary-key index compact.
	recipeID, err := uuid.NewV7()
	if err != nil {
		return Recipe{}, fmt.Errorf("new id: %w", err)
	}
	stamps, err := q.CreateRecipe(ctx, dbgen.CreateRecipeParams{
		ID:          recipeID,
		Title:       in.Title,
		Description: in.Description,
		Servings:    in.Servings,
		YieldText:   in.YieldText,
		PrepMinutes: in.PrepMinutes,
		CookMinutes: in.CookMinutes,
		SourceUrl:   in.SourceURL,
		SourceName:  in.SourceName,
		Notes:       in.Notes,
		IsFavorite:  in.IsFavorite,
	})
	if err != nil {
		return Recipe{}, fmt.Errorf("insert recipe: %w", err)
	}

	out := Recipe{
		ID:          recipeID,
		Title:       in.Title,
		Description: in.Description,
		Servings:    in.Servings,
		YieldText:   in.YieldText,
		PrepMinutes: in.PrepMinutes,
		CookMinutes: in.CookMinutes,
		SourceURL:   in.SourceURL,
		SourceName:  in.SourceName,
		Notes:       in.Notes,
		IsFavorite:  in.IsFavorite,
		Ingredients: make([]Ingredient, len(in.Ingredients)),
		Steps:       make([]Step, len(in.Steps)),
		CreatedAt:   stamps.CreatedAt,
		UpdatedAt:   stamps.UpdatedAt,
	}

	for i, ing := range in.Ingredients {
		id, err := uuid.NewV7()
		if err != nil {
			return Recipe{}, fmt.Errorf("new id: %w", err)
		}
		saved := Ingredient{
			ID:          id,
			Position:    int32(i),
			Section:     ing.Section,
			RawText:     rawText(ing),
			QuantityMin: ing.QuantityMin,
			QuantityMax: ing.QuantityMax,
			UnitCode:    ing.UnitCode,
			Name:        ing.Name,
			Preparation: ing.Preparation,
			Note:        ing.Note,
			Optional:    ing.Optional,
		}
		if err := q.CreateIngredient(ctx, dbgen.CreateIngredientParams{
			ID:          saved.ID,
			RecipeID:    recipeID,
			Position:    saved.Position,
			Section:     saved.Section,
			RawText:     saved.RawText,
			QuantityMin: saved.QuantityMin,
			QuantityMax: saved.QuantityMax,
			UnitCode:    saved.UnitCode,
			Name:        saved.Name,
			Preparation: saved.Preparation,
			Note:        saved.Note,
			Optional:    saved.Optional,
		}); err != nil {
			return Recipe{}, fmt.Errorf("insert ingredient %d: %w", i, err)
		}
		out.Ingredients[i] = saved
	}

	for i, st := range in.Steps {
		id, err := uuid.NewV7()
		if err != nil {
			return Recipe{}, fmt.Errorf("new id: %w", err)
		}
		saved := Step{
			ID:           id,
			Position:     int32(i),
			Section:      st.Section,
			Instruction:  st.Instruction,
			TimerSeconds: st.TimerSeconds,
		}
		if err := q.CreateStep(ctx, dbgen.CreateStepParams{
			ID:           saved.ID,
			RecipeID:     recipeID,
			Position:     saved.Position,
			Section:      saved.Section,
			Instruction:  saved.Instruction,
			TimerSeconds: saved.TimerSeconds,
		}); err != nil {
			return Recipe{}, fmt.Errorf("insert step %d: %w", i, err)
		}
		out.Steps[i] = saved
	}

	if err := tx.Commit(ctx); err != nil {
		return Recipe{}, fmt.Errorf("commit: %w", err)
	}
	return out, nil
}
