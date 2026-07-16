package sshconn

import "time"

func (m *Manager) startKeepalive(connection *Connection) {
	interval := m.config.KeepaliveInterval
	maximumFailures := m.config.KeepaliveFailures
	go func() {
		ticker := time.NewTicker(interval)
		defer ticker.Stop()
		failures := 0
		for {
			select {
			case <-connection.stop:
				return
			case <-ticker.C:
				client, _ := connection.clients()
				if client == nil {
					return
				}
				_, _, err := client.SendRequest("keepalive@openssh.com", true, nil)
				if err == nil {
					failures = 0
					continue
				}
				failures++
				if failures < maximumFailures {
					continue
				}
				connection.closeClients()
				m.setState(connection, StateDisconnected, "CONNECTION_LOST", "The SSH connection was lost.")
				m.emit("connection.error", map[string]any{
					"connectionId": connection.profile.ID,
					"code":         "CONNECTION_LOST",
					"message":      "The SSH connection was lost.",
					"retryable":    true,
				})
				m.startAutomaticReconnect(connection.profile.ID)
				return
			}
		}
	}()
}
