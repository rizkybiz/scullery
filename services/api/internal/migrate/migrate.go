// Package migrate runs the embedded goose migrations. It is invoked as a
// one-off admin process (`scullery-api migrate up`), not on every app start.
package migrate

import (
	"context"
	"database/sql"
	"fmt"
	"io"

	"github.com/pressly/goose/v3"

	_ "github.com/jackc/pgx/v5/stdlib" // registers the "pgx" database/sql driver

	"github.com/rizkybiz/scullery/services/api/migrations"
)

// Run executes a migrate subcommand: up, down (one step) or status.
func Run(ctx context.Context, databaseURL, command string, out io.Writer) error {
	if databaseURL == "" {
		return fmt.Errorf("DATABASE_URL is required")
	}
	db, err := sql.Open("pgx", databaseURL)
	if err != nil {
		return err
	}
	defer db.Close()

	provider, err := goose.NewProvider(goose.DialectPostgres, db, migrations.FS)
	if err != nil {
		return err
	}

	switch command {
	case "up":
		results, err := provider.Up(ctx)
		if err != nil {
			return err
		}
		if len(results) == 0 {
			fmt.Fprintln(out, "no migrations to apply")
		}
		for _, r := range results {
			fmt.Fprintf(out, "applied %s (%s)\n", r.Source.Path, r.Duration)
		}
	case "down":
		r, err := provider.Down(ctx)
		if err != nil {
			return err
		}
		fmt.Fprintf(out, "rolled back %s (%s)\n", r.Source.Path, r.Duration)
	case "status":
		statuses, err := provider.Status(ctx)
		if err != nil {
			return err
		}
		for _, s := range statuses {
			fmt.Fprintf(out, "%-8s %s\n", s.State, s.Source.Path)
		}
	default:
		return fmt.Errorf("unknown migrate command %q (want up, down or status)", command)
	}
	return nil
}
