package config

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"sort"
	"sync"
)

type profileFile struct {
	Version  int       `json:"version"`
	Profiles []Profile `json:"profiles"`
}

type Store struct {
	mu    sync.Mutex
	paths Paths
}

func NewStore(paths Paths) *Store {
	return &Store{paths: paths}
}

func (s *Store) List() ([]Profile, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.loadLocked()
}

func (s *Store) Get(id string) (Profile, bool, error) {
	profiles, err := s.List()
	if err != nil {
		return Profile{}, false, err
	}
	for _, profile := range profiles {
		if profile.ID == id {
			return profile, true, nil
		}
	}
	return Profile{}, false, nil
}

func (s *Store) Create(profile Profile) (Profile, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := profile.Normalize(true); err != nil {
		return Profile{}, err
	}
	profile.Source = "manual"
	profiles, err := s.loadLocked()
	if err != nil {
		return Profile{}, err
	}
	for _, existing := range profiles {
		if existing.ID == profile.ID {
			return Profile{}, errors.New("a connection with this id already exists")
		}
	}
	profiles = append(profiles, profile)
	return profile, s.writeLocked(profiles)
}

func (s *Store) Update(profile Profile) (Profile, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := profile.Normalize(false); err != nil {
		return Profile{}, err
	}
	profile.Source = "manual"
	profiles, err := s.loadLocked()
	if err != nil {
		return Profile{}, err
	}
	for index := range profiles {
		if profiles[index].ID == profile.ID {
			profiles[index] = profile
			return profile, s.writeLocked(profiles)
		}
	}
	return Profile{}, errors.New("connection profile was not found")
}

func (s *Store) Remove(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	profiles, err := s.loadLocked()
	if err != nil {
		return err
	}
	next := profiles[:0]
	found := false
	for _, profile := range profiles {
		if profile.ID == id {
			found = true
			continue
		}
		next = append(next, profile)
	}
	if !found {
		return errors.New("connection profile was not found")
	}
	return s.writeLocked(next)
}

func (s *Store) loadLocked() ([]Profile, error) {
	file, err := os.Open(s.paths.ConnectionsFile)
	if errors.Is(err, os.ErrNotExist) {
		return []Profile{}, nil
	}
	if err != nil {
		return nil, err
	}
	defer file.Close()
	decoder := json.NewDecoder(io.LimitReader(file, 2<<20))
	decoder.DisallowUnknownFields()
	var stored profileFile
	if err := decoder.Decode(&stored); err != nil {
		return nil, fmt.Errorf("read connections: %w", err)
	}
	profiles := make([]Profile, 0, len(stored.Profiles))
	for _, profile := range stored.Profiles {
		if err := profile.Normalize(false); err != nil {
			return nil, fmt.Errorf("invalid connection profile: %w", err)
		}
		profiles = append(profiles, profile)
	}
	sort.Slice(profiles, func(left, right int) bool { return profiles[left].Label < profiles[right].Label })
	return profiles, nil
}

func (s *Store) writeLocked(profiles []Profile) error {
	if err := os.MkdirAll(s.paths.Directory, 0o700); err != nil {
		return err
	}
	if err := os.Chmod(s.paths.Directory, 0o700); err != nil && !errors.Is(err, os.ErrPermission) {
		return err
	}
	payload, err := json.MarshalIndent(profileFile{Version: 1, Profiles: profiles}, "", "  ")
	if err != nil {
		return err
	}
	payload = append(payload, '\n')
	temporary, err := os.CreateTemp(s.paths.Directory, ".connections-*.tmp")
	if err != nil {
		return err
	}
	temporaryName := temporary.Name()
	defer os.Remove(temporaryName)
	if err := temporary.Chmod(0o600); err != nil {
		temporary.Close()
		return err
	}
	if _, err := temporary.Write(payload); err != nil {
		temporary.Close()
		return err
	}
	if err := temporary.Sync(); err != nil {
		temporary.Close()
		return err
	}
	if err := temporary.Close(); err != nil {
		return err
	}
	if err := os.Rename(temporaryName, s.paths.ConnectionsFile); err != nil {
		return err
	}
	return os.Chmod(s.paths.ConnectionsFile, 0o600)
}

func (s *Store) Paths() Paths {
	return s.paths
}
