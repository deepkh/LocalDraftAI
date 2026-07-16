package logbuffer

import (
	"sync"
	"time"
)

// Entry is deliberately structured so callers never need to include request
// bodies, secrets, cookies, tokens, or document contents in bridge logs.
type Entry struct {
	Timestamp time.Time `json:"timestamp"`
	Level     string    `json:"level"`
	Category  string    `json:"category"`
	Message   string    `json:"message"`
}

type Buffer struct {
	mu      sync.RWMutex
	entries []Entry
	limit   int
}

func New(limit int) *Buffer {
	if limit < 1 {
		limit = 200
	}
	return &Buffer{limit: limit}
}

func (b *Buffer) Append(level, category, message string) Entry {
	entry := Entry{
		Timestamp: time.Now().UTC(),
		Level:     level,
		Category:  category,
		Message:   message,
	}
	b.mu.Lock()
	defer b.mu.Unlock()
	b.entries = append(b.entries, entry)
	if overflow := len(b.entries) - b.limit; overflow > 0 {
		copy(b.entries, b.entries[overflow:])
		b.entries = b.entries[:b.limit]
	}
	return entry
}

func (b *Buffer) Entries() []Entry {
	b.mu.RLock()
	defer b.mu.RUnlock()
	entries := make([]Entry, len(b.entries))
	copy(entries, b.entries)
	return entries
}
