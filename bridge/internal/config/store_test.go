package config

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func testPaths(t *testing.T) Paths {
	directory := t.TempDir()
	return Paths{
		Directory:       directory,
		ConnectionsFile: filepath.Join(directory, "connections.json"),
		KnownHostsFile:  filepath.Join(directory, "known_hosts"),
		OpenSSHConfig:   filepath.Join(directory, "ssh_config"),
	}
}

func TestProfileStoreAtomicRoundTrip(t *testing.T) {
	paths := testPaths(t)
	store := NewStore(paths)
	created, err := store.Create(Profile{
		Label: "Home Server",
		Host:  "192.0.2.4",
		Port:  22,
		User:  "gary",
		Auth: AuthProfile{
			UseAgent:      true,
			IdentityFile:  "~/.ssh/id_ed25519",
			AllowPassword: true,
		},
		DefaultRemotePath: "/home/gary/notes",
	})
	if err != nil {
		t.Fatal(err)
	}
	if created.ID == "" || created.Source != "manual" {
		t.Fatalf("created profile = %#v", created)
	}
	profiles, err := store.List()
	if err != nil || len(profiles) != 1 || profiles[0].ID != created.ID {
		t.Fatalf("profiles = %#v, error = %v", profiles, err)
	}
	created.Label = "Updated"
	if _, err := store.Update(created); err != nil {
		t.Fatal(err)
	}
	if err := store.Remove(created.ID); err != nil {
		t.Fatal(err)
	}
	profiles, err = store.List()
	if err != nil || len(profiles) != 0 {
		t.Fatalf("profiles after remove = %#v, error = %v", profiles, err)
	}
	if runtime.GOOS != "windows" {
		info, err := os.Stat(paths.ConnectionsFile)
		if err != nil {
			t.Fatal(err)
		}
		if info.Mode().Perm() != 0o600 {
			t.Fatalf("connections permissions = %o", info.Mode().Perm())
		}
	}
	payload, err := os.ReadFile(paths.ConnectionsFile)
	if err != nil {
		t.Fatal(err)
	}
	for _, forbidden := range []string{"password", "passphrase", "privateKey"} {
		if strings.Contains(string(payload), forbidden) {
			t.Fatalf("profile file contains forbidden field %q", forbidden)
		}
	}
}

func TestOpenSSHHostDiscovery(t *testing.T) {
	paths := testPaths(t)
	contents := `
Host home-server
  HostName 192.0.2.20
  User gary
  Port 2222
  IdentityFile ~/.ssh/home_ed25519
  IdentitiesOnly yes
  UserKnownHostsFile ~/.ssh/known_hosts_test

Host wildcard-*
  HostName ignored.example

Host *
  User fallback
  Port 22

Match host home-server
  User ignored-match
`
	if err := os.WriteFile(paths.OpenSSHConfig, []byte(contents), 0o600); err != nil {
		t.Fatal(err)
	}
	hosts, err := ListOpenSSHHosts(paths.OpenSSHConfig)
	if err != nil {
		t.Fatal(err)
	}
	if len(hosts) != 1 {
		t.Fatalf("hosts = %#v", hosts)
	}
	host := hosts[0]
	if host.Label != "home-server" || host.Host != "192.0.2.20" || host.Port != 2222 || host.User != "gary" {
		t.Fatalf("host = %#v", host)
	}
	if host.Auth.UseAgent || host.Auth.IdentityFile != "~/.ssh/home_ed25519" {
		t.Fatalf("auth = %#v", host.Auth)
	}
	if host.Source != "openssh" || !strings.HasPrefix(host.ID, "openssh-home-server-") {
		t.Fatalf("source/id = %#v", host)
	}
}

func TestExpandUserPathRejectsOtherUsers(t *testing.T) {
	if _, err := ExpandUserPath("~other/.ssh/id"); err == nil {
		t.Fatal("another user's path was accepted")
	}
}
