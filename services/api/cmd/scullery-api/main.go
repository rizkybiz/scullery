package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/rizkybiz/scullery-api/internal/config"
	"github.com/rizkybiz/scullery-api/internal/db"
	"github.com/rizkybiz/scullery-api/internal/migrate"
	"github.com/rizkybiz/scullery-api/internal/server"
)

// version is overridden at build time: -ldflags "-X main.version=1.2.3"
var version = "dev"

func main() {
	if err := run(); err != nil {
		slog.Error("fatal", "error", err)
		os.Exit(1)
	}
}

func run() error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}

	// Logs are JSON on stdout; the platform (Loki) handles collection.
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: cfg.LogLevel}))
	slog.SetDefault(logger)

	// Admin process: `scullery-api migrate up|down|status`.
	if len(os.Args) > 1 {
		if os.Args[1] != "migrate" || len(os.Args) != 3 {
			return fmt.Errorf("usage: scullery-api [migrate up|down|status]")
		}
		return migrate.Run(context.Background(), cfg.DatabaseURL, os.Args[2], os.Stdout)
	}

	// Disposability: stop gracefully on SIGINT/SIGTERM.
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	// Fail fast: a wrong DATABASE_URL or an unreachable database should stop the
	// process at startup, where a deploy notices, not on the first request.
	pool, err := db.Connect(ctx, cfg.DatabaseURL)
	if err != nil {
		return err
	}
	defer pool.Close()

	srv := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           server.New(logger, version),
		ReadHeaderTimeout: 5 * time.Second,
	}

	errCh := make(chan error, 1)
	go func() {
		logger.Info("listening", "addr", srv.Addr, "version", version)
		errCh <- srv.ListenAndServe()
	}()

	select {
	case err := <-errCh:
		if !errors.Is(err, http.ErrServerClosed) {
			return err
		}
	case <-ctx.Done():
		logger.Info("shutting down")
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		return srv.Shutdown(shutdownCtx)
	}
	return nil
}
