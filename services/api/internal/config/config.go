// Package config loads runtime configuration from environment variables
// (12-factor: config lives in the environment, never in the codebase).
package config

import (
	"fmt"
	"log/slog"
	"os"
	"strings"
)

type Config struct {
	Port        string
	LogLevel    slog.Level
	DatabaseURL string // unused until the Postgres layer lands
}

// Load reads configuration from the environment, applying defaults.
func Load() (Config, error) {
	cfg := Config{
		Port:        getenv("PORT", "8080"),
		DatabaseURL: os.Getenv("DATABASE_URL"),
	}
	if err := cfg.LogLevel.UnmarshalText([]byte(strings.ToUpper(getenv("LOG_LEVEL", "info")))); err != nil {
		return Config{}, fmt.Errorf("invalid LOG_LEVEL: %w", err)
	}
	return cfg, nil
}

func getenv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
