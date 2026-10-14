package dbtest_test

import (
	"context"
	"testing"

	"github.com/google/uuid"

	"github.com/rizkybiz/scullery-api/internal/db/dbtest"
	"github.com/rizkybiz/scullery-api/internal/dbgen"
)

func TestNewReturnsAMigratedDatabase(t *testing.T) {
	pool := dbtest.New(t)

	units, err := dbgen.New(pool).ListUnits(context.Background())
	if err != nil {
		t.Fatalf("ListUnits: %v", err)
	}
	// The migration seeds the units, so a migrated database has them.
	if len(units) == 0 {
		t.Fatal("no units: migrations were not applied")
	}

	// Ordered by dimension, then smallest to largest; count units have no factor.
	first := units[0]
	if first.Dimension != "count" || first.BaseFactor != nil {
		t.Errorf("first unit = %+v, want a count unit with no base factor", first)
	}
	byCode := map[string]dbgen.Unit{}
	for _, u := range units {
		byCode[u.Code] = u
	}
	tbsp, ok := byCode["tbsp"]
	if !ok || tbsp.BaseFactor == nil || *tbsp.BaseFactor < 14.7 || *tbsp.BaseFactor > 14.8 {
		t.Errorf("tbsp = %+v, want a volume unit of about 14.79 ml", tbsp)
	}
}

func TestDatabasesAreIsolated(t *testing.T) {
	ctx := context.Background()
	a, b := dbtest.New(t), dbtest.New(t)

	if _, err := a.Exec(ctx, `INSERT INTO recipe (id, title) VALUES ($1, 'only in a')`, uuid.New()); err != nil {
		t.Fatalf("insert into a: %v", err)
	}

	var inA, inB int
	if err := a.QueryRow(ctx, `SELECT count(*) FROM recipe`).Scan(&inA); err != nil {
		t.Fatal(err)
	}
	if err := b.QueryRow(ctx, `SELECT count(*) FROM recipe`).Scan(&inB); err != nil {
		t.Fatal(err)
	}
	if inA != 1 || inB != 0 {
		t.Errorf("recipes: a=%d b=%d, want a=1 b=0", inA, inB)
	}
}
