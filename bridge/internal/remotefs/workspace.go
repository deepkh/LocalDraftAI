package remotefs

import "time"

type Workspace struct {
	ID           string `json:"workspaceId"`
	ConnectionID string `json:"connectionId"`
	RootPath     string `json:"rootPath"`
	Name         string `json:"name"`
}

type Revision struct {
	Size    int64  `json:"size"`
	MtimeMs int64  `json:"mtimeMs"`
	Hash    string `json:"hash"`
}

type DirectoryEntry struct {
	Kind     string   `json:"kind"`
	Name     string   `json:"name"`
	Path     string   `json:"path"`
	Revision Revision `json:"revision"`
}

type TextFile struct {
	Path     string   `json:"path"`
	Text     string   `json:"text"`
	Revision Revision `json:"revision"`
}

type Status struct {
	Workspace Workspace `json:"workspace"`
	Available bool      `json:"available"`
	CheckedAt time.Time `json:"checkedAt"`
}
