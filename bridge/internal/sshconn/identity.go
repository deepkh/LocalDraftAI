package sshconn

import (
	"context"
	"errors"
	"fmt"
	"io"
	"os"

	"golang.org/x/crypto/ssh"

	bridgeconfig "localdraftai/bridge/internal/config"
)

const maximumIdentityFileSize = 16 << 20

func identityAuthentication(ctx context.Context, profile bridgeconfig.Profile, prompt secretPrompter) (ssh.AuthMethod, error) {
	identityPath, err := bridgeconfig.ExpandUserPath(profile.Auth.IdentityFile)
	if err != nil {
		return nil, err
	}
	if identityPath == "" {
		return nil, nil
	}
	return ssh.PublicKeysCallback(func() ([]ssh.Signer, error) {
		signer, err := loadIdentitySigner(ctx, identityPath, prompt)
		if err != nil {
			return nil, err
		}
		return []ssh.Signer{signer}, nil
	}), nil
}

func loadIdentitySigner(ctx context.Context, identityPath string, prompt secretPrompter) (ssh.Signer, error) {
	file, err := os.Open(identityPath)
	if err != nil {
		return nil, fmt.Errorf("open identity file: %w", err)
	}
	defer file.Close()
	info, err := file.Stat()
	if err != nil {
		return nil, err
	}
	if info.Size() > maximumIdentityFileSize {
		return nil, errors.New("identity file is too large")
	}
	payload := make([]byte, info.Size())
	if _, err := io.ReadFull(file, payload); err != nil {
		return nil, err
	}
	signer, err := ssh.ParsePrivateKey(payload)
	if _, missing := err.(*ssh.PassphraseMissingError); missing {
		passphrase, promptErr := prompt(ctx, "passphrase", "Enter the passphrase for "+identityPath)
		if promptErr != nil {
			zeroBytes(payload)
			return nil, promptErr
		}
		signer, err = ssh.ParsePrivateKeyWithPassphrase(payload, passphrase)
		zeroBytes(passphrase)
	}
	zeroBytes(payload)
	if err != nil {
		return nil, fmt.Errorf("parse identity file: %w", err)
	}
	return signer, nil
}

func zeroBytes(value []byte) {
	for index := range value {
		value[index] = 0
	}
}
