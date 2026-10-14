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

type replaceRecipeInput struct {
	ID   uuid.UUID `path:"id" format:"uuid" doc:"The recipe to overwrite."`
	Body recipe.NewRecipe
}

type replaceRecipeOutput struct {
	Body recipe.Recipe
}

type listRecipesInput struct {
	Q        string `query:"q" maxLength:"200" doc:"Words to look for in titles and descriptions. Supports \"quoted phrases\" and -excluded words. Best matches come first; without it, recipes are alphabetical."`
	Favorite string `query:"favorite" enum:"true,false" doc:"true for only favorites, false for only the rest. Leave out for all."`
	Limit    int32  `query:"limit" default:"50" minimum:"1" maximum:"100" doc:"Page size."`
	Offset   int32  `query:"offset" default:"0" minimum:"0" doc:"How many matching recipes to skip."`
}

type listRecipesOutput struct {
	Body recipe.List
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

	huma.Register(api, huma.Operation{
		OperationID: "replace-recipe",
		Method:      http.MethodPut,
		Path:        "/recipes/{id}",
		Summary:     "Replace a recipe",
		Description: "Overwrites the recipe with the one sent: every field, and the whole ingredient and step lists. " +
			"Anything left out is cleared, so send the complete recipe. It keeps its id and creation time. " +
			"If two people save at the same moment, the later save wins.",
		Tags:   []string{"recipes"},
		Errors: []int{http.StatusNotFound},
	}, func(ctx context.Context, in *replaceRecipeInput) (*replaceRecipeOutput, error) {
		saved, err := store.Replace(ctx, in.ID, in.Body)

		var invalid *recipe.ValidationError
		switch {
		case errors.As(err, &invalid):
			return nil, validationProblem(invalid)
		case errors.Is(err, recipe.ErrNotFound):
			return nil, huma.Error404NotFound("recipe not found")
		case err != nil:
			deps.Logger.ErrorContext(ctx, "replace recipe", "id", in.ID, "error", err)
			return nil, huma.Error500InternalServerError("could not save the recipe")
		}
		return &replaceRecipeOutput{Body: saved}, nil
	})

	huma.Register(api, huma.Operation{
		OperationID: "list-recipes",
		Method:      http.MethodGet,
		Path:        "/recipes",
		Summary:     "List recipes",
		Description: "One page of recipes, each without its ingredients and steps (fetch a recipe by id for those). " +
			"`total` counts every match across all pages, so a screen can show \"21-40 of 134\".",
		Tags:   []string{"recipes"},
		Errors: []int{http.StatusUnprocessableEntity},
	}, func(ctx context.Context, in *listRecipesInput) (*listRecipesOutput, error) {
		// huma does not support pointer query parameters, so "not given" arrives as
		// an empty string; turn it back into nil for the store.
		var favorite *bool
		if in.Favorite != "" {
			v := in.Favorite == "true"
			favorite = &v
		}
		page, err := store.List(ctx, recipe.ListParams{
			Search:   &in.Q,
			Favorite: favorite,
			Limit:    in.Limit,
			Offset:   in.Offset,
		})
		if err != nil {
			deps.Logger.ErrorContext(ctx, "list recipes", "error", err)
			return nil, huma.Error500InternalServerError("could not list recipes")
		}
		return &listRecipesOutput{Body: page}, nil
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
