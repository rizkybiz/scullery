package db

import (
	"context"
	"strings"
	"testing"
)

func TestConnectRequiresURL(t *testing.T) {
	_, err := Connect(context.Background(), "")
	if err == nil || !strings.Contains(err.Error(), "DATABASE_URL is required") {
		t.Fatalf("err = %v, want DATABASE_URL is required", err)
	}
}

func TestConnectRejectsMalformedURL(t *testing.T) {
	_, err := Connect(context.Background(), "not a url")
	if err == nil {
		t.Fatal("want an error for a malformed URL")
	}
}

func TestConnectFailsFastWhenUnreachable(t *testing.T) {
	// Port 1 on localhost refuses connections immediately.
	_, err := Connect(context.Background(), "postgres://u:p@127.0.0.1:1/db?sslmode=disable")
	if err == nil || !strings.Contains(err.Error(), "reach database") {
		t.Fatalf("err = %v, want a 'reach database' error", err)
	}
}
