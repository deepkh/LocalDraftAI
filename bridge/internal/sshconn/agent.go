package sshconn

import (
	"errors"
	"net"
	"os"

	"golang.org/x/crypto/ssh"
	"golang.org/x/crypto/ssh/agent"
)

func agentAuthentication() (ssh.AuthMethod, func(), error) {
	socket := os.Getenv("SSH_AUTH_SOCK")
	if socket == "" {
		return nil, func() {}, errors.New("ssh-agent is not configured")
	}
	connection, err := net.Dial("unix", socket)
	if err != nil {
		return nil, func() {}, err
	}
	closeAgent := func() { _ = connection.Close() }
	signers, err := agent.NewClient(connection).Signers()
	if err != nil {
		closeAgent()
		return nil, func() {}, err
	}
	if len(signers) == 0 {
		closeAgent()
		return nil, func() {}, errors.New("ssh-agent has no identities")
	}
	return ssh.PublicKeys(signers...), closeAgent, nil
}
