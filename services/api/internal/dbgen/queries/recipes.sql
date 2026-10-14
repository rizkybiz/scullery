-- name: CreateRecipe :one
-- Only the columns the database fills in come back; everything else the caller
-- already has, because it just supplied it.
INSERT INTO recipe (
    id, title, description, servings, yield_text, prep_minutes, cook_minutes,
    source_url, source_name, notes, is_favorite
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11
)
RETURNING created_at, updated_at;

-- name: CreateIngredient :exec
-- food_id and sub_recipe_id are left NULL: matching an ingredient to the
-- canonical food table, and sub-recipes, come later.
INSERT INTO ingredient (
    id, recipe_id, position, section, raw_text, quantity_min, quantity_max,
    unit_code, name, preparation, note, optional
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12
);

-- name: CreateStep :exec
INSERT INTO step (id, recipe_id, position, section, instruction, timer_seconds)
VALUES ($1, $2, $3, $4, $5, $6);
