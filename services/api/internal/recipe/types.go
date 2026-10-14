// Package recipe is the recipe domain: the types clients send and receive, the
// rules a recipe must satisfy, and the store that saves it.
//
// The types here are also the HTTP contract. Their struct tags (json, and huma's
// doc, minLength and so on) generate openapi.json, and huma enforces the simple
// rules from them before a handler runs. Rules that depend on several fields or
// on the database live in validate.go.
//
// They are deliberately not the generated database models (internal/dbgen): a
// recipe nests its ingredients and steps, a request carries no ids or
// timestamps, and the API should not change just because a column was added.
package recipe

import (
	"time"

	"github.com/google/uuid"
)

// NewRecipe is the request body for creating a recipe. Everything the client does
// not control is absent: ids, positions (the array order is the order),
// timestamps, and each ingredient's original text, which the server builds.
type NewRecipe struct {
	Title       string          `json:"title" minLength:"1" maxLength:"200" example:"Weeknight marinara" doc:"Name of the recipe. Must not be blank."`
	Description string          `json:"description,omitempty" maxLength:"5000" doc:"A sentence or two about the dish."`
	Servings    *float64        `json:"servings,omitempty" nullable:"true" exclusiveMinimum:"0" maximum:"999999" example:"4" doc:"How many people it feeds; used to scale quantities."`
	YieldText   *string         `json:"yield_text,omitempty" nullable:"true" maxLength:"200" example:"12 cookies" doc:"What it makes, when servings does not fit."`
	PrepMinutes *int32          `json:"prep_minutes,omitempty" nullable:"true" minimum:"0" maximum:"525600" example:"15"`
	CookMinutes *int32          `json:"cook_minutes,omitempty" nullable:"true" minimum:"0" maximum:"525600" example:"30"`
	SourceURL   *string         `json:"source_url,omitempty" nullable:"true" maxLength:"2000" doc:"Where the recipe came from, if it came from a web page."`
	SourceName  *string         `json:"source_name,omitempty" nullable:"true" maxLength:"200" example:"Grandma's card" doc:"Where it came from in words (a person, a book)."`
	Notes       string          `json:"notes,omitempty" maxLength:"20000" doc:"Free-form notes."`
	IsFavorite  bool            `json:"is_favorite,omitempty"`
	Ingredients []NewIngredient `json:"ingredients,omitempty" maxItems:"200" doc:"In the order they should be shown."`
	Steps       []NewStep       `json:"steps,omitempty" maxItems:"200" doc:"In the order they should be done."`
}

// NewIngredient is one ingredient line, entered as separate parts so shopping
// lists can later merge them. Quantity and unit are both optional ("salt, to
// taste"; "2 eggs").
type NewIngredient struct {
	Section     *string  `json:"section,omitempty" nullable:"true" maxLength:"200" example:"For the sauce" doc:"Heading this line is grouped under."`
	QuantityMin *float64 `json:"quantity_min,omitempty" nullable:"true" minimum:"0" maximum:"999999" example:"2" doc:"Amount, as a decimal (0.5, not 1/2)."`
	QuantityMax *float64 `json:"quantity_max,omitempty" nullable:"true" minimum:"0" maximum:"999999" example:"3" doc:"Top of a range such as 2-3 cloves. Needs quantity_min and must not be below it."`
	UnitCode    *string  `json:"unit_code,omitempty" nullable:"true" maxLength:"20" example:"tbsp" doc:"A code from GET /units."`
	Name        string   `json:"name" minLength:"1" maxLength:"200" example:"butter" doc:"The ingredient as written. Must not be blank."`
	Preparation *string  `json:"preparation,omitempty" nullable:"true" maxLength:"200" example:"softened"`
	Note        *string  `json:"note,omitempty" nullable:"true" maxLength:"500"`
	Optional    bool     `json:"optional,omitempty"`
}

// NewStep is one instruction.
type NewStep struct {
	Section      *string `json:"section,omitempty" nullable:"true" maxLength:"200"`
	Instruction  string  `json:"instruction" minLength:"1" maxLength:"5000" example:"Simmer for 20 minutes." doc:"Must not be blank."`
	TimerSeconds *int32  `json:"timer_seconds,omitempty" nullable:"true" minimum:"1" maximum:"86400" example:"1200" doc:"Lets cooking mode offer a timer for this step."`
}

// Recipe is a saved recipe, as returned to clients.
type Recipe struct {
	ID          uuid.UUID    `json:"id" format:"uuid"`
	Title       string       `json:"title"`
	Description string       `json:"description"`
	Servings    *float64     `json:"servings" nullable:"true"`
	YieldText   *string      `json:"yield_text" nullable:"true"`
	PrepMinutes *int32       `json:"prep_minutes" nullable:"true"`
	CookMinutes *int32       `json:"cook_minutes" nullable:"true"`
	SourceURL   *string      `json:"source_url" nullable:"true"`
	SourceName  *string      `json:"source_name" nullable:"true"`
	Notes       string       `json:"notes"`
	IsFavorite  bool         `json:"is_favorite"`
	Ingredients []Ingredient `json:"ingredients" nullable:"false" doc:"Always present, possibly empty."`
	Steps       []Step       `json:"steps" nullable:"false" doc:"Always present, possibly empty."`
	CreatedAt   time.Time    `json:"created_at"`
	UpdatedAt   time.Time    `json:"updated_at"`
}

// Ingredient is a saved ingredient line.
type Ingredient struct {
	ID          uuid.UUID `json:"id" format:"uuid"`
	Position    int32     `json:"position" doc:"0-based place in the list."`
	Section     *string   `json:"section" nullable:"true"`
	RawText     string    `json:"raw_text" example:"2-3 clove garlic, minced" doc:"The line as a person would write it, built from the parts."`
	QuantityMin *float64  `json:"quantity_min" nullable:"true"`
	QuantityMax *float64  `json:"quantity_max" nullable:"true"`
	UnitCode    *string   `json:"unit_code" nullable:"true"`
	Name        string    `json:"name"`
	Preparation *string   `json:"preparation" nullable:"true"`
	Note        *string   `json:"note" nullable:"true"`
	Optional    bool      `json:"optional"`
}

// Step is a saved instruction.
type Step struct {
	ID           uuid.UUID `json:"id" format:"uuid"`
	Position     int32     `json:"position" doc:"0-based place in the list."`
	Section      *string   `json:"section" nullable:"true"`
	Instruction  string    `json:"instruction"`
	TimerSeconds *int32    `json:"timer_seconds" nullable:"true"`
}

// Summary is a recipe as shown in a list: enough to browse by, without the
// ingredients and steps. Fetch the whole recipe by id when one is opened.
type Summary struct {
	ID          uuid.UUID `json:"id" format:"uuid"`
	Title       string    `json:"title"`
	Description string    `json:"description"`
	Servings    *float64  `json:"servings" nullable:"true"`
	YieldText   *string   `json:"yield_text" nullable:"true"`
	PrepMinutes *int32    `json:"prep_minutes" nullable:"true"`
	CookMinutes *int32    `json:"cook_minutes" nullable:"true"`
	IsFavorite  bool      `json:"is_favorite"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// List is one page of recipes.
type List struct {
	Recipes []Summary `json:"recipes" nullable:"false" doc:"This page, best match first when searching, otherwise alphabetical."`
	Total   int64     `json:"total" doc:"How many recipes match the filters in all, across every page."`
	Limit   int32     `json:"limit" doc:"The page size that was used."`
	Offset  int32     `json:"offset" doc:"How many matching recipes were skipped."`
}

// ListParams selects which recipes to list.
type ListParams struct {
	Search   *string // words to look for in titles and descriptions; blank means no search
	Favorite *bool   // only favorites (true), only non-favorites (false), or all (nil)
	Limit    int32
	Offset   int32
}
