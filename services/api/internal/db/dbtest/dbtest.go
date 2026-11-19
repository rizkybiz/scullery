// Package dbtest gives tests a real, freshly migrated PostgreSQL database.
//
// Tests run against a real Postgres rather than a mock because the behaviour
// worth testing lives in the database: constraints, cascades, deferred unique
// keys, full-text search. Each test gets its own database, so tests cannot
// affect each other and can run in parallel.
//
// scripts/ci/verify.sh (make verify) starts a throwaway Postgres and sets
// TEST_DATABASE_URL for you. To run `go test` directly, point it at any server
// you may create databases on:
//
//	TEST_DATABASE_URL=postgres://scullery:scullery@127.0.0.1:55432/postgres?sslmode=disable
//
// When it is unset, tests that need a database skip locally but fail under CI
// (CI=true), so a misconfigured pipeline cannot pass by silently skipping them.
package dbtest

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"io"
	"net/url"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/rizkybiz/scullery/services/api/internal/db"
	"github.com/rizkybiz/scullery/services/api/internal/migrate"
)

const envURL = "TEST_DATABASE_URL"

// New creates a database named test_<random>, applies every migration, and
// returns a pool connected to it. The database is dropped when the test ends.
func New(t testing.TB) *pgxpool.Pool {
	t.Helper()

	adminURL := os.Getenv(envURL)
	if adminURL == "" {
		if os.Getenv("CI") != "" {
			t.Fatalf("%s must be set in CI so database tests actually run", envURL)
		}
		t.Skipf("%s is not set; skipping the database test", envURL)
	}

	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()

	name := "test_" + randomHex(t)
	admin(ctx, t, adminURL, `CREATE DATABASE `+pgx.Identifier{name}.Sanitize())
	t.Cleanup(func() {
		// Fresh context: the test's own may already be done.
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		// FORCE disconnects any connection the test leaked, so the drop cannot hang.
		admin(ctx, t, adminURL, `DROP DATABASE IF EXISTS `+pgx.Identifier{name}.Sanitize()+` WITH (FORCE)`)
	})

	testURL := withDatabase(t, adminURL, name)
	if err := migrate.Run(ctx, testURL, "up", io.Discard); err != nil {
		t.Fatalf("migrate test database: %v", err)
	}

	pool, err := db.Connect(ctx, testURL)
	if err != nil {
		t.Fatalf("connect to test database: %v", err)
	}
	// Registered after the drop above, so it runs first (cleanups are last in,
	// first out): the pool closes before the database is dropped.
	t.Cleanup(pool.Close)
	return pool
}

// admin runs one statement on the server's maintenance database.
func admin(ctx context.Context, t testing.TB, adminURL, statement string) {
	t.Helper()
	conn, err := pgx.Connect(ctx, adminURL)
	if err != nil {
		t.Fatalf("connect to %s: %v", envURL, err)
	}
	defer conn.Close(ctx)
	if _, err := conn.Exec(ctx, statement); err != nil {
		t.Fatalf("%s: %v", statement, err)
	}
}

// withDatabase returns rawURL pointing at a different database name.
func withDatabase(t testing.TB, rawURL, name string) string {
	t.Helper()
	u, err := url.Parse(rawURL)
	if err != nil {
		t.Fatalf("parse %s: %v", envURL, err)
	}
	u.Path = "/" + name
	return u.String()
}

func randomHex(t testing.TB) string {
	t.Helper()
	b := make([]byte, 6)
	if _, err := rand.Read(b); err != nil {
		t.Fatalf("random name: %v", err)
	}
	return hex.EncodeToString(b)
}
