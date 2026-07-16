package config

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"os"
	"sort"
	"strconv"
	"strings"

	sshconfig "github.com/kevinburke/ssh_config"
)

func ListOpenSSHHosts(path string) ([]Profile, error) {
	file, err := os.Open(path)
	if errors.Is(err, os.ErrNotExist) {
		return []Profile{}, nil
	}
	if err != nil {
		return nil, err
	}
	defer file.Close()
	parsed, err := sshconfig.Decode(file)
	if err != nil {
		return nil, err
	}
	seen := make(map[string]bool)
	profiles := []Profile{}
	for _, host := range parsed.Hosts {
		if strings.HasPrefix(strings.ToLower(strings.TrimSpace(host.String())), "match ") {
			continue
		}
		for _, pattern := range host.Patterns {
			alias := strings.TrimSpace(pattern.String())
			if alias == "" || alias == "*" || strings.ContainsAny(alias, "*?!") || seen[alias] {
				continue
			}
			seen[alias] = true
			profile, err := profileFromOpenSSH(parsed, alias)
			if err != nil {
				continue
			}
			profiles = append(profiles, profile)
		}
	}
	sort.Slice(profiles, func(left, right int) bool { return profiles[left].Label < profiles[right].Label })
	return profiles, nil
}

func profileFromOpenSSH(parsed *sshconfig.Config, alias string) (Profile, error) {
	get := func(key string) string {
		value, _ := parsed.Get(alias, key)
		return strings.TrimSpace(value)
	}
	port := 22
	if configuredPort, err := strconv.Atoi(get("Port")); err == nil && configuredPort > 0 {
		port = configuredPort
	}
	identity := get("IdentityFile")
	identitiesOnly := strings.EqualFold(get("IdentitiesOnly"), "yes")
	hash := sha256.Sum256([]byte(alias))
	base := strings.Trim(unsafeIDCharacters.ReplaceAllString(strings.ToLower(alias), "-"), "-")
	if base == "" {
		base = "host"
	}
	if len(base) > 40 {
		base = strings.TrimRight(base[:40], "-")
	}
	profile := Profile{
		ID:             "openssh-" + base + "-" + hex.EncodeToString(hash[:4]),
		Label:          alias,
		Host:           firstNonEmpty(get("HostName"), alias),
		Port:           port,
		User:           get("User"),
		KnownHostsFile: get("UserKnownHostsFile"),
		Auth: AuthProfile{
			UseAgent:      !identitiesOnly,
			IdentityFile:  identity,
			AllowPassword: true,
		},
		Source: "openssh",
	}
	if profile.User == "" {
		profile.User = os.Getenv("USER")
	}
	if err := profile.Normalize(false); err != nil {
		return Profile{}, err
	}
	return profile, nil
}
