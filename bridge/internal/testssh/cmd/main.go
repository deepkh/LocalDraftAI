package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"net"
	"os"
	"os/signal"
	"path/filepath"
	"strconv"
	"syscall"

	bridgeconfig "localdraftai/bridge/internal/config"
	"localdraftai/bridge/internal/testssh"
)

func main() {
	root := flag.String("root", "", "remote filesystem root")
	configDir := flag.String("config-dir", "", "bridge test configuration directory")
	flag.Parse()
	if *root == "" || *configDir == "" {
		fmt.Fprintln(os.Stderr, "root and config-dir are required")
		os.Exit(2)
	}
	server, err := testssh.Start(testssh.Options{Root: *root})
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	defer server.Close()
	paths, err := bridgeconfig.ResolvePaths(*configDir)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	identityPath := filepath.Join(*configDir, "test_identity")
	if err := server.WriteIdentityFile(identityPath, nil); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	host, portText, err := net.SplitHostPort(server.Address)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	port, err := strconv.Atoi(portText)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	profile, err := bridgeconfig.NewStore(paths).Create(bridgeconfig.Profile{
		ID:                "e2e-remote",
		Label:             "E2E Remote",
		Host:              host,
		Port:              port,
		User:              server.User,
		DefaultRemotePath: *root,
		Auth: bridgeconfig.AuthProfile{
			IdentityFile: identityPath,
		},
	})
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	if err := json.NewEncoder(os.Stdout).Encode(map[string]any{
		"connectionId": profile.ID,
		"label":        profile.Label,
		"root":         *root,
	}); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	signals := make(chan os.Signal, 1)
	signal.Notify(signals, os.Interrupt, syscall.SIGTERM)
	<-signals
}
