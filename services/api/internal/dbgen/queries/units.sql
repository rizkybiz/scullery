-- name: ListUnits :many
-- Units for the ingredient dropdown, grouped by kind and ordered smallest to
-- largest within a kind where that is meaningful (count units have no factor).
SELECT code, name, dimension, base_factor
FROM unit
ORDER BY dimension, base_factor NULLS LAST, name;
