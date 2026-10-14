package recipe

import (
	"strings"
	"testing"
)

func ptr[T any](v T) *T { return &v }

func TestRawText(t *testing.T) {
	tests := []struct {
		name string
		in   NewIngredient
		want string
	}{
		{"name only", NewIngredient{Name: "salt"}, "salt"},
		{"quantity and unit", NewIngredient{QuantityMin: ptr(2.0), UnitCode: ptr("tbsp"), Name: "butter"}, "2 tbsp butter"},
		{"fraction as decimal", NewIngredient{QuantityMin: ptr(0.5), UnitCode: ptr("cup"), Name: "sugar"}, "0.5 cup sugar"},
		{"range with preparation", NewIngredient{QuantityMin: ptr(2.0), QuantityMax: ptr(3.0), UnitCode: ptr("clove"), Name: "garlic", Preparation: ptr("minced")}, "2-3 clove garlic, minced"},
		{"unit code with underscore", NewIngredient{QuantityMin: ptr(8.0), UnitCode: ptr("fl_oz"), Name: "milk"}, "8 fl oz milk"},
		{"count without unit", NewIngredient{QuantityMin: ptr(2.0), Name: "eggs"}, "2 eggs"},
		{"optional", NewIngredient{Name: "parsley", Optional: true}, "parsley (optional)"},
		{"no trailing zeros", NewIngredient{QuantityMin: ptr(1.25), Name: "x"}, "1.25 x"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := rawText(tt.in); got != tt.want {
				t.Errorf("rawText = %q, want %q", got, tt.want)
			}
		})
	}
}

func TestNormalizeTrimsAndDropsBlankOptionals(t *testing.T) {
	in := NewRecipe{
		Title:       "  Soup  ",
		YieldText:   ptr("   "),
		SourceName:  ptr(" Gran "),
		Ingredients: []NewIngredient{{Name: " leek ", Section: ptr(""), UnitCode: ptr(" g ")}},
		Steps:       []NewStep{{Instruction: " Chop. "}},
	}
	out := normalize(in)

	if out.Title != "Soup" || out.YieldText != nil || *out.SourceName != "Gran" {
		t.Errorf("recipe not normalized: %+v", out)
	}
	ing := out.Ingredients[0]
	if ing.Name != "leek" || ing.Section != nil || *ing.UnitCode != "g" {
		t.Errorf("ingredient not normalized: %+v", ing)
	}
	if out.Steps[0].Instruction != "Chop." {
		t.Errorf("step not normalized: %+v", out.Steps[0])
	}
	// The caller's request must not be modified.
	if in.Ingredients[0].Name != " leek " || in.Steps[0].Instruction != " Chop. " {
		t.Errorf("normalize modified its input: %+v", in)
	}
}

func TestValidate(t *testing.T) {
	units := map[string]bool{"g": true, "tbsp": true}

	tests := []struct {
		name string
		in   NewRecipe
		want map[string]string // location -> substring of message
	}{
		{"valid", NewRecipe{Title: "Soup", Ingredients: []NewIngredient{{Name: "leek", UnitCode: ptr("g"), QuantityMin: ptr(1.0), QuantityMax: ptr(2.0)}}}, nil},
		{"blank title", NewRecipe{Title: ""}, map[string]string{"body.title": "blank"}},
		{"blank ingredient name", NewRecipe{Title: "x", Ingredients: []NewIngredient{{Name: "ok"}, {Name: ""}}}, map[string]string{"body.ingredients[1].name": "blank"}},
		{"unknown unit", NewRecipe{Title: "x", Ingredients: []NewIngredient{{Name: "a", UnitCode: ptr("pinchy")}}}, map[string]string{"body.ingredients[0].unit_code": "unknown unit"}},
		{"max without min", NewRecipe{Title: "x", Ingredients: []NewIngredient{{Name: "a", QuantityMax: ptr(3.0)}}}, map[string]string{"body.ingredients[0].quantity_max": "needs quantity_min"}},
		{"max below min", NewRecipe{Title: "x", Ingredients: []NewIngredient{{Name: "a", QuantityMin: ptr(3.0), QuantityMax: ptr(2.0)}}}, map[string]string{"body.ingredients[0].quantity_max": "less than"}},
		{"equal range is fine", NewRecipe{Title: "x", Ingredients: []NewIngredient{{Name: "a", QuantityMin: ptr(2.0), QuantityMax: ptr(2.0)}}}, nil},
		{"blank step", NewRecipe{Title: "x", Steps: []NewStep{{Instruction: "ok"}, {Instruction: ""}}}, map[string]string{"body.steps[1].instruction": "blank"}},
		{"reports every problem", NewRecipe{Title: "", Ingredients: []NewIngredient{{Name: ""}}, Steps: []NewStep{{Instruction: ""}}},
			map[string]string{"body.title": "blank", "body.ingredients[0].name": "blank", "body.steps[0].instruction": "blank"}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := map[string]string{}
			for _, p := range validate(normalize(tt.in), units) {
				got[p.Location] = p.Message
			}
			if len(got) != len(tt.want) {
				t.Fatalf("problems = %v, want locations %v", got, tt.want)
			}
			for loc, sub := range tt.want {
				if msg, ok := got[loc]; !ok || !strings.Contains(msg, sub) {
					t.Errorf("at %s: got %q, want it to mention %q", loc, msg, sub)
				}
			}
		})
	}
}
