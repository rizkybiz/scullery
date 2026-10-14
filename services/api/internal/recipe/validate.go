package recipe

import (
	"fmt"
	"strconv"
	"strings"
)

// Problem is one thing wrong with a request. Location uses the same form huma
// uses for its own validation errors, so clients see one consistent shape.
type Problem struct {
	Location string
	Message  string
}

// ValidationError carries every problem found, not just the first, so a form
// can show them all at once.
type ValidationError struct {
	Problems []Problem
}

func (e *ValidationError) Error() string {
	return fmt.Sprintf("invalid recipe: %d problem(s), first: %s: %s",
		len(e.Problems), e.Problems[0].Location, e.Problems[0].Message)
}

// normalize trims whitespace and turns blank optional text into nil, so "" and
// "   " are stored as "not given" rather than as empty strings.
func normalize(in NewRecipe) NewRecipe {
	in.Title = strings.TrimSpace(in.Title)
	in.Description = strings.TrimSpace(in.Description)
	in.Notes = strings.TrimSpace(in.Notes)
	in.YieldText = trimOptional(in.YieldText)
	in.SourceURL = trimOptional(in.SourceURL)
	in.SourceName = trimOptional(in.SourceName)

	// Copy the slices so the caller's request is left untouched.
	in.Ingredients = append([]NewIngredient(nil), in.Ingredients...)
	for i := range in.Ingredients {
		ing := &in.Ingredients[i]
		ing.Name = strings.TrimSpace(ing.Name)
		ing.Section = trimOptional(ing.Section)
		ing.UnitCode = trimOptional(ing.UnitCode)
		ing.Preparation = trimOptional(ing.Preparation)
		ing.Note = trimOptional(ing.Note)
	}
	in.Steps = append([]NewStep(nil), in.Steps...)
	for i := range in.Steps {
		st := &in.Steps[i]
		st.Instruction = strings.TrimSpace(st.Instruction)
		st.Section = trimOptional(st.Section)
	}
	return in
}

func trimOptional(s *string) *string {
	if s == nil {
		return nil
	}
	t := strings.TrimSpace(*s)
	if t == "" {
		return nil
	}
	return &t
}

// validate checks the rules that need more than one field, or the database's
// list of units. Simple per-field rules (lengths, ranges, required) are enforced
// earlier by huma from the struct tags. Expects normalized input.
func validate(in NewRecipe, units map[string]bool) []Problem {
	var problems []Problem
	add := func(loc, msg string) { problems = append(problems, Problem{Location: loc, Message: msg}) }

	if in.Title == "" {
		add("body.title", "must not be blank")
	}

	for i, ing := range in.Ingredients {
		at := func(field string) string { return fmt.Sprintf("body.ingredients[%d].%s", i, field) }

		if ing.Name == "" {
			add(at("name"), "must not be blank")
		}
		if ing.UnitCode != nil && !units[*ing.UnitCode] {
			add(at("unit_code"), fmt.Sprintf("unknown unit %q (see GET /units)", *ing.UnitCode))
		}
		switch {
		case ing.QuantityMax != nil && ing.QuantityMin == nil:
			add(at("quantity_max"), "needs quantity_min as well")
		case ing.QuantityMax != nil && *ing.QuantityMax < *ing.QuantityMin:
			add(at("quantity_max"), "must not be less than quantity_min")
		}
	}

	for i, st := range in.Steps {
		if st.Instruction == "" {
			add(fmt.Sprintf("body.steps[%d].instruction", i), "must not be blank")
		}
	}
	return problems
}

// rawText builds the stored "as written" line from an ingredient's parts, for
// example "2-3 clove garlic, minced". The parts are authoritative; this is the
// fallback text for display and for the imports that will later supply their own.
func rawText(ing NewIngredient) string {
	var parts []string
	if ing.QuantityMin != nil {
		q := formatQuantity(*ing.QuantityMin)
		if ing.QuantityMax != nil {
			q += "-" + formatQuantity(*ing.QuantityMax)
		}
		parts = append(parts, q)
	}
	if ing.UnitCode != nil {
		parts = append(parts, strings.ReplaceAll(*ing.UnitCode, "_", " "))
	}
	parts = append(parts, ing.Name)

	text := strings.Join(parts, " ")
	if ing.Preparation != nil {
		text += ", " + *ing.Preparation
	}
	if ing.Optional {
		text += " (optional)"
	}
	return text
}

// formatQuantity prints 2 as "2" and 0.5 as "0.5", with no trailing zeros.
func formatQuantity(q float64) string {
	return strconv.FormatFloat(q, 'f', -1, 64)
}
