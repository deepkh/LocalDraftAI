package config

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"regexp"
	"strings"
)

var profileIDPattern = regexp.MustCompile(`^[a-z0-9][a-z0-9._-]{0,63}$`)
var unsafeIDCharacters = regexp.MustCompile(`[^a-z0-9]+`)

type AuthProfile struct {
	UseAgent      bool   `json:"useAgent"`
	IdentityFile  string `json:"identityFile"`
	AllowPassword bool   `json:"allowPassword"`
}

type Profile struct {
	ID                string      `json:"id"`
	Label             string      `json:"label"`
	Host              string      `json:"host"`
	Port              int         `json:"port"`
	User              string      `json:"user"`
	Auth              AuthProfile `json:"auth"`
	KnownHostsFile    string      `json:"knownHostsFile"`
	DefaultRemotePath string      `json:"defaultRemotePath"`
	Source            string      `json:"source"`
}

func (p *Profile) Normalize(generateID bool) error {
	p.ID = strings.TrimSpace(strings.ToLower(p.ID))
	p.Label = strings.TrimSpace(p.Label)
	p.Host = strings.TrimSpace(p.Host)
	p.User = strings.TrimSpace(p.User)
	p.Auth.IdentityFile = strings.TrimSpace(p.Auth.IdentityFile)
	p.KnownHostsFile = strings.TrimSpace(p.KnownHostsFile)
	p.DefaultRemotePath = strings.TrimSpace(p.DefaultRemotePath)
	if p.Port == 0 {
		p.Port = 22
	}
	if p.Source == "" {
		p.Source = "manual"
	}
	if p.ID == "" && generateID {
		id, err := GenerateProfileID(firstNonEmpty(p.Label, p.Host, "connection"))
		if err != nil {
			return err
		}
		p.ID = id
	}
	if !profileIDPattern.MatchString(p.ID) {
		return errors.New("connection id must use lowercase letters, numbers, dots, underscores, or dashes")
	}
	if p.Label == "" || p.Host == "" || p.User == "" {
		return errors.New("connection name, host, and user are required")
	}
	if p.Port < 1 || p.Port > 65535 {
		return errors.New("connection port must be between 1 and 65535")
	}
	if p.Source != "manual" && p.Source != "openssh" {
		return errors.New("unsupported connection profile source")
	}
	return nil
}

func GenerateProfileID(label string) (string, error) {
	base := strings.Trim(unsafeIDCharacters.ReplaceAllString(strings.ToLower(label), "-"), "-")
	if base == "" {
		base = "connection"
	}
	if len(base) > 48 {
		base = strings.TrimRight(base[:48], "-")
	}
	random := make([]byte, 5)
	if _, err := rand.Read(random); err != nil {
		return "", fmt.Errorf("generate connection id: %w", err)
	}
	return base + "-" + hex.EncodeToString(random), nil
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if value != "" {
			return value
		}
	}
	return ""
}
