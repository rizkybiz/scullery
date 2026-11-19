package server

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	"github.com/rizkybiz/scullery/services/api/internal/dbgen"
)

// unit is one unit of measure as the API presents it. It is deliberately its own
// type rather than dbgen.Unit: the HTTP contract should not change just because
// the database layer is regenerated.
type unit struct {
	Code       string   `json:"code" example:"tbsp" doc:"Short identifier. Ingredients refer to a unit by this code."`
	Name       string   `json:"name" example:"tablespoon" doc:"Name to show to people."`
	Dimension  string   `json:"dimension" enum:"volume,mass,count" doc:"What the unit measures. Only units of the same dimension can be added together."`
	BaseFactor *float64 `json:"base_factor" nullable:"true" example:"14.786765" doc:"How many millilitres (volume) or grams (mass) one unit is. Null for count units, which never convert."`
}

type listUnitsOutput struct {
	Body struct {
		Units []unit `json:"units" doc:"Every unit, grouped by dimension and ordered smallest to largest within it."`
	}
}

func registerUnits(api huma.API, deps Deps) {
	huma.Register(api, huma.Operation{
		OperationID: "list-units",
		Method:      http.MethodGet,
		Path:        "/units",
		Summary:     "List units of measure",
		Description: "Reference data for the ingredient form's unit dropdown.",
		Tags:        []string{"units"},
	}, func(ctx context.Context, _ *struct{}) (*listUnitsOutput, error) {
		rows, err := dbgen.New(deps.Pool).ListUnits(ctx)
		if err != nil {
			deps.Logger.ErrorContext(ctx, "list units", "error", err)
			return nil, huma.Error500InternalServerError("could not list units")
		}

		out := &listUnitsOutput{}
		out.Body.Units = make([]unit, len(rows))
		for i, r := range rows {
			// A conversion, not a copy: Go allows it between structs with identical
			// fields (tags are ignored), so adding a column to the unit table stops
			// this compiling until someone decides whether the API should expose it.
			out.Body.Units[i] = unit(r)
		}
		return out, nil
	})
}
