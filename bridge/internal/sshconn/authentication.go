package sshconn

import (
	"context"
	"strings"

	"golang.org/x/crypto/ssh"

	bridgeconfig "localdraftai/bridge/internal/config"
)

type secretPrompter func(context.Context, string, string) ([]byte, error)

func publicAuthenticationMethods(ctx context.Context, profile bridgeconfig.Profile, prompt secretPrompter) ([]ssh.AuthMethod, func(), error) {
	methods := []ssh.AuthMethod{}
	closeAgent := func() {}
	if profile.Auth.UseAgent {
		method, closeConnection, err := agentAuthentication()
		if err == nil && method != nil {
			methods = append(methods, method)
			closeAgent = closeConnection
		}
	}
	identityMethod, err := identityAuthentication(ctx, profile, prompt)
	if err != nil {
		closeAgent()
		return nil, func() {}, err
	}
	if identityMethod != nil {
		methods = append(methods, identityMethod)
	}
	return methods, closeAgent, nil
}

func isAuthenticationFailure(err error) bool {
	message := strings.ToLower(errString(err))
	return strings.Contains(message, "unable to authenticate") ||
		strings.Contains(message, "no supported methods remain") ||
		strings.Contains(message, "permission denied") ||
		strings.Contains(message, "identity file") ||
		strings.Contains(message, "private key") ||
		strings.Contains(message, "passphrase")
}

func errString(err error) string {
	if err == nil {
		return ""
	}
	return err.Error()
}
