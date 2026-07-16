package sshconn

import (
	"context"
	"errors"
	"fmt"
	"net"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"golang.org/x/crypto/ssh"
	"golang.org/x/crypto/ssh/knownhosts"

	bridgeconfig "localdraftai/bridge/internal/config"
)

type HostKeyPrompt struct {
	Host        string `json:"host"`
	Address     string `json:"address"`
	Algorithm   string `json:"algorithm"`
	Fingerprint string `json:"fingerprint"`
}

type HostKeyChangedError struct {
	Host                 string   `json:"host"`
	Address              string   `json:"address"`
	ExpectedFingerprints []string `json:"expectedFingerprints"`
	ReceivedFingerprint  string   `json:"receivedFingerprint"`
}

type HostKeyUnknownError struct{}

func (e *HostKeyUnknownError) Error() string {
	return "the SSH host key was not trusted"
}

func (e *HostKeyChangedError) Error() string {
	return "the SSH host key has changed"
}

type hostKeyPrompter func(context.Context, HostKeyPrompt) (bool, error)

type HostKeyVerifier struct {
	managedFile string
	mu          sync.Mutex
}

func NewHostKeyVerifier(managedFile string) *HostKeyVerifier {
	return &HostKeyVerifier{managedFile: managedFile}
}

func (v *HostKeyVerifier) Callback(ctx context.Context, profile bridgeconfig.Profile, prompt hostKeyPrompter) ssh.HostKeyCallback {
	return func(hostname string, remote net.Addr, key ssh.PublicKey) error {
		files := []string{}
		if fileExists(v.managedFile) {
			files = append(files, v.managedFile)
		}
		if profile.KnownHostsFile != "" {
			external, err := bridgeconfig.ExpandUserPath(strings.Fields(profile.KnownHostsFile)[0])
			if err == nil && fileExists(external) && external != v.managedFile {
				files = append(files, external)
			}
		}
		if len(files) > 0 {
			callback, err := knownhosts.New(files...)
			if err != nil {
				return err
			}
			err = callback(hostname, remote, key)
			if err == nil {
				return nil
			}
			var keyError *knownhosts.KeyError
			if !errors.As(err, &keyError) {
				return err
			}
			if len(keyError.Want) > 0 {
				expected := make([]string, 0, len(keyError.Want))
				for _, known := range keyError.Want {
					expected = append(expected, ssh.FingerprintSHA256(known.Key))
				}
				return &HostKeyChangedError{
					Host:                 profile.Label,
					Address:              remote.String(),
					ExpectedFingerprints: expected,
					ReceivedFingerprint:  ssh.FingerprintSHA256(key),
				}
			}
		}

		trusted, err := prompt(ctx, HostKeyPrompt{
			Host:        profile.Label,
			Address:     remote.String(),
			Algorithm:   key.Type(),
			Fingerprint: ssh.FingerprintSHA256(key),
		})
		if err != nil {
			return err
		}
		if !trusted {
			return &HostKeyUnknownError{}
		}
		return v.append(hostname, key)
	}
}

func (v *HostKeyVerifier) append(address string, key ssh.PublicKey) error {
	v.mu.Lock()
	defer v.mu.Unlock()
	if err := os.MkdirAll(filepath.Dir(v.managedFile), 0o700); err != nil {
		return err
	}
	if err := os.Chmod(filepath.Dir(v.managedFile), 0o700); err != nil && !errors.Is(err, os.ErrPermission) {
		return err
	}
	file, err := os.OpenFile(v.managedFile, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o600)
	if err != nil {
		return err
	}
	defer file.Close()
	if err := file.Chmod(0o600); err != nil {
		return err
	}
	line := knownhosts.Line([]string{knownhosts.Normalize(address)}, key)
	if _, err := fmt.Fprintln(file, line); err != nil {
		return err
	}
	return file.Sync()
}

func fileExists(path string) bool {
	if path == "" {
		return false
	}
	info, err := os.Stat(path)
	return err == nil && !info.IsDir()
}
