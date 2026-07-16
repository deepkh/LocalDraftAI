package config

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
)

type Paths struct {
	Directory       string
	ConnectionsFile string
	KnownHostsFile  string
	OpenSSHConfig   string
}

func ResolvePaths(configDir string) (Paths, error) {
	if configDir == "" {
		userConfigDir, err := os.UserConfigDir()
		if err != nil {
			return Paths{}, err
		}
		configDir = filepath.Join(userConfigDir, "LocalDraftAI")
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return Paths{}, err
	}
	return Paths{
		Directory:       configDir,
		ConnectionsFile: filepath.Join(configDir, "connections.json"),
		KnownHostsFile:  filepath.Join(configDir, "known_hosts"),
		OpenSSHConfig:   filepath.Join(home, ".ssh", "config"),
	}, nil
}

func ExpandUserPath(value string) (string, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return "", nil
	}
	if value == "~" || strings.HasPrefix(value, "~/") || strings.HasPrefix(value, `~\`) {
		home, err := os.UserHomeDir()
		if err != nil {
			return "", err
		}
		if value == "~" {
			return home, nil
		}
		return filepath.Join(home, value[2:]), nil
	}
	if strings.HasPrefix(value, "~") {
		return "", errors.New("another user's home directory is not supported")
	}
	return value, nil
}
