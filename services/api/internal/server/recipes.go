package server

import (
	"context"
	"errors"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"

	"github.com/rizkybiz/scullery-api/internal/recipe"
)

type createRecipeInput struct {
	Body recipe.NewRecipe
}

type createRecipeOutput struct {
	Body recipe.Recipe
}

type getRecipeInput struct {
	ID uuid.UUID `path:"id" format:"uuid" doc:"The recipe's id, as returned when it was created."`
}

type getRecipeOutput struct {
	Body recipe.Recipe
}

func registerRecipes(api huma.API, deps Deps) {
	store := recipe.NewStore(deps.Pool)

	huma.Register(api, huma.Operation{
		OperationID: "create-recipe",
		Method:      http.MethodPost,
		Path:        "/recipes",
		Summary:     "Create a recipe",
		Description: "Saves a recipe with its ingredients and steps in one step: either all of it is stored or none of it. " +
			"Ingredients and steps are numbered in the order they are sent.",
		Tags:          []string{"recipes"},
		DefaultStatus: http.StatusCreated,
		Errors:        []int{http.StatusUnprocessableEntity},
	}, func(ctx context.Context, in *createRecipeInput) (*createRecipeOutput, error) {
		saved, err := store.Create(ctx, in.Body)

		var invalid *recipe.ValidationError
		switch {
		case errors.As(err, &invalid):
			return nil, validationProblem(invalid)
		case err != nil:
			deps.Logger.ErrorContext(ctx, "create recipe", "error", err)
			return nil, huma.Error500InternalServerError("could not save the recipe")
		}
		return &createRecipeOutput{Body: saved}, nil
	})

	huma.Register(api, huma.Operation{
		OperationID: "get-recipe",
		Method:      http.MethodGet,
		Path:        "/recipes/{id}",
		Summary:     "Get a recipe",
		Description: "Returns one recipe with its ingredients and steps, in order.",
		Tags:        []string{"recipes"},
		Errors:      []int{http.StatusNotFound},
	}, func(ctx context.Context, in *getRecipeInput) (*getRecipeOutput, error) {
		found, err := store.Get(ctx, in.ID)

		switch {
		case errors.Is(err, recipe.ErrNotFound):
			return nil, huma.Error404NotFound("recipe not found")
		case err != nil:
			deps.Logger.ErrorContext(ctx, "get recipe", "id", in.ID, "error", err)
			return nil, huma.Error500InternalServerError("could not load the recipe")
		}
		return &getRecipeOutput{Body: found}, nil
	})
}

// validationProblem turns the store's list of problems into a 422 whose details
// use the same shape and locations as huma's own request validation, so a client
// handles both the same way.
func validationProblem(v *recipe.ValidationError) error {
	details := make([]error, len(v.Problems))
	for i, p := range v.Problems {
		details[i] = &huma.ErrorDetail{Message: p.Message, Location: p.Location}
	}
	return huma.Error422UnprocessableEntity("validation failed", details...)
}
