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

-- name: GetRecipe :one
-- Named columns, not SELECT *: the table also holds the full-text index and the
-- raw import payload, which are not part of what the API returns.
SELECT id, title, description, servings, yield_text, prep_minutes, cook_minutes,
       source_url, source_name, notes, is_favorite, created_at, updated_at
FROM recipe
WHERE id = $1;

-- name: ListIngredients :many
SELECT id, position, section, raw_text, quantity_min, quantity_max, unit_code,
       name, preparation, note, optional
FROM ingredient
WHERE recipe_id = $1
ORDER BY position;

-- name: ListSteps :many
SELECT id, position, section, instruction, timer_seconds
FROM step
WHERE recipe_id = $1
ORDER BY position;

-- name: ListRecipes :many
-- One page of recipes, for the browse screen. The two optional filters are NULL
-- when not given. With a search term the best matches come first; without one,
-- recipes are alphabetical. `id` breaks ties so paging is stable.
-- Search covers what the generated `search` column indexes: title and description.
SELECT id, title, description, servings, yield_text, prep_minutes, cook_minutes,
       is_favorite, updated_at
FROM recipe
WHERE (sqlc.narg('search')::text IS NULL
        OR search @@ websearch_to_tsquery('english', sqlc.narg('search')::text))
  AND (sqlc.narg('favorite')::boolean IS NULL
        OR is_favorite = sqlc.narg('favorite')::boolean)
ORDER BY
    CASE WHEN sqlc.narg('search')::text IS NULL
         THEN 0
         ELSE -ts_rank(search, websearch_to_tsquery('english', sqlc.narg('search')::text))
    END,
    lower(title),
    id
LIMIT sqlc.arg('page_size') OFFSET sqlc.arg('page_offset');

-- name: CountRecipes :one
-- How many recipes match the same filters, ignoring paging, so a screen can show
-- "21-40 of 134".
SELECT count(*)
FROM recipe
WHERE (sqlc.narg('search')::text IS NULL
        OR search @@ websearch_to_tsquery('english', sqlc.narg('search')::text))
  AND (sqlc.narg('favorite')::boolean IS NULL
        OR is_favorite = sqlc.narg('favorite')::boolean);

-- name: UpdateRecipe :one
-- Overwrites every field a client controls. source_data and image_id are not
-- touched: the API does not expose them yet, so an edit must not erase them.
-- updated_at is set by the table's trigger; created_at is kept.
UPDATE recipe SET
    title        = $2,
    description  = $3,
    servings     = $4,
    yield_text   = $5,
    prep_minutes = $6,
    cook_minutes = $7,
    source_url   = $8,
    source_name  = $9,
    notes        = $10,
    is_favorite  = $11
WHERE id = $1
RETURNING created_at, updated_at;

-- name: DeleteIngredients :exec
DELETE FROM ingredient WHERE recipe_id = $1;

-- name: DeleteSteps :exec
DELETE FROM step WHERE recipe_id = $1;

-- name: DeleteRecipe :execrows
-- Its ingredients, steps, tag links and tool links go with it (ON DELETE CASCADE).
-- The one thing that blocks it is another recipe using this one as a sub-recipe.
DELETE FROM recipe WHERE id = $1;
