package recipe

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/rizkybiz/scullery-api/internal/dbgen"
)

// ErrNotFound is returned when no recipe has the requested id.
var ErrNotFound = errors.New("recipe not found")

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
	in, err := s.validated(ctx, in)
	if err != nil {
		return Recipe{}, err
	}
	return s.insert(ctx, in)
}

// validated normalizes a request and checks it against the rules, including the
// list of units in the database.
func (s *Store) validated(ctx context.Context, in NewRecipe) (NewRecipe, error) {
	in = normalize(in)

	units, err := dbgen.New(s.pool).ListUnits(ctx)
	if err != nil {
		return NewRecipe{}, fmt.Errorf("list units: %w", err)
	}
	known := make(map[string]bool, len(units))
	for _, u := range units {
		known[u.Code] = true
	}
	if problems := validate(in, known); len(problems) > 0 {
		return NewRecipe{}, &ValidationError{Problems: problems}
	}
	return in, nil
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

	out := recipeFrom(recipeID, in)
	out.CreatedAt, out.UpdatedAt = stamps.CreatedAt, stamps.UpdatedAt
	if out.Ingredients, out.Steps, err = writeChildren(ctx, q, recipeID, in); err != nil {
		return Recipe{}, err
	}

	if err := tx.Commit(ctx); err != nil {
		return Recipe{}, fmt.Errorf("commit: %w", err)
	}
	return out, nil
}

// recipeFrom builds the recipe-level part of the response from what was just
// saved. The caller fills in the timestamps and the child lists.
func recipeFrom(id uuid.UUID, in NewRecipe) Recipe {
	return Recipe{
		ID:          id,
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
	}
}

// writeChildren inserts a recipe's ingredients and steps, numbering them in the
// order given, and returns them as saved. It runs on the caller's transaction.
func writeChildren(ctx context.Context, q *dbgen.Queries, recipeID uuid.UUID, in NewRecipe) ([]Ingredient, []Step, error) {
	ingredients := make([]Ingredient, len(in.Ingredients))
	for i, ing := range in.Ingredients {
		id, err := uuid.NewV7()
		if err != nil {
			return nil, nil, fmt.Errorf("new id: %w", err)
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
			return nil, nil, fmt.Errorf("insert ingredient %d: %w", i, err)
		}
		ingredients[i] = saved
	}

	steps := make([]Step, len(in.Steps))
	for i, st := range in.Steps {
		id, err := uuid.NewV7()
		if err != nil {
			return nil, nil, fmt.Errorf("new id: %w", err)
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
			return nil, nil, fmt.Errorf("insert step %d: %w", i, err)
		}
		steps[i] = saved
	}
	return ingredients, steps, nil
}

// Get loads one recipe with its ingredients and steps, or ErrNotFound.
//
// The three reads run in one read-only, repeatable-read transaction, so they all
// see the same moment: a concurrent edit can never produce a recipe whose
// ingredients are from before the edit and whose steps are from after it.
func (s *Store) Get(ctx context.Context, id uuid.UUID) (Recipe, error) {
	q, done, err := s.beginRead(ctx)
	if err != nil {
		return Recipe{}, err
	}
	defer done()

	row, err := q.GetRecipe(ctx, id)
	if errors.Is(err, pgx.ErrNoRows) {
		return Recipe{}, ErrNotFound
	}
	if err != nil {
		return Recipe{}, fmt.Errorf("get recipe: %w", err)
	}
	ingredients, err := q.ListIngredients(ctx, id)
	if err != nil {
		return Recipe{}, fmt.Errorf("list ingredients: %w", err)
	}
	steps, err := q.ListSteps(ctx, id)
	if err != nil {
		return Recipe{}, fmt.Errorf("list steps: %w", err)
	}

	out := Recipe{
		ID:          row.ID,
		Title:       row.Title,
		Description: row.Description,
		Servings:    row.Servings,
		YieldText:   row.YieldText,
		PrepMinutes: row.PrepMinutes,
		CookMinutes: row.CookMinutes,
		SourceURL:   row.SourceUrl,
		SourceName:  row.SourceName,
		Notes:       row.Notes,
		IsFavorite:  row.IsFavorite,
		CreatedAt:   row.CreatedAt,
		UpdatedAt:   row.UpdatedAt,
		Ingredients: make([]Ingredient, len(ingredients)),
		Steps:       make([]Step, len(steps)),
	}
	for i, r := range ingredients {
		out.Ingredients[i] = Ingredient(r)
	}
	for i, r := range steps {
		out.Steps[i] = Step(r)
	}
	return out, nil
}

// beginRead starts a read-only, repeatable-read transaction: everything read
// through the returned queries sees one consistent moment. Call done when
// finished; there is nothing to commit.
func (s *Store) beginRead(ctx context.Context) (q *dbgen.Queries, done func(), err error) {
	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.RepeatableRead, AccessMode: pgx.ReadOnly})
	if err != nil {
		return nil, nil, fmt.Errorf("begin: %w", err)
	}
	return dbgen.New(s.pool).WithTx(tx), func() { _ = tx.Rollback(ctx) }, nil
}

// List returns one page of recipes matching the filters, and how many match in
// all. The page and the count are read together, so they agree with each other.
func (s *Store) List(ctx context.Context, p ListParams) (List, error) {
	p.Search = trimOptional(p.Search)

	q, done, err := s.beginRead(ctx)
	if err != nil {
		return List{}, err
	}
	defer done()

	rows, err := q.ListRecipes(ctx, dbgen.ListRecipesParams{
		Search:     p.Search,
		Favorite:   p.Favorite,
		PageSize:   p.Limit,
		PageOffset: p.Offset,
	})
	if err != nil {
		return List{}, fmt.Errorf("list recipes: %w", err)
	}
	total, err := q.CountRecipes(ctx, dbgen.CountRecipesParams{Search: p.Search, Favorite: p.Favorite})
	if err != nil {
		return List{}, fmt.Errorf("count recipes: %w", err)
	}

	out := List{Recipes: make([]Summary, len(rows)), Total: total, Limit: p.Limit, Offset: p.Offset}
	for i, r := range rows {
		out.Recipes[i] = Summary(r)
	}
	return out, nil
}
