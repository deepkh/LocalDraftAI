package remotefs

import (
	"bytes"
	"context"
	"errors"
	"io"
	"os"
	"strings"
	"testing"
)

type memoryAtomicFile struct {
	bytes.Buffer
	close func([]byte)
}

func (f *memoryAtomicFile) Close() error {
	f.close(append([]byte(nil), f.Bytes()...))
	return nil
}

func memoryAtomicOperations(files map[string][]byte, failReplacement bool) atomicWriteOperations {
	return atomicWriteOperations{
		chmod: func(string, os.FileMode) error { return nil },
		openExclusive: func(name string) (io.WriteCloser, error) {
			if _, found := files[name]; found {
				return nil, os.ErrExist
			}
			return &memoryAtomicFile{close: func(value []byte) { files[name] = value }}, nil
		},
		posixRename: func(string, string) error { return errors.ErrUnsupported },
		remove: func(name string) error {
			delete(files, name)
			return nil
		},
		rename: func(oldName, newName string) error {
			if failReplacement && strings.Contains(oldName, ".localdraft-") && !strings.Contains(oldName, ".localdraft-backup-") && newName == "/notes.md" {
				return errors.New("replacement failed")
			}
			value, found := files[oldName]
			if !found {
				return os.ErrNotExist
			}
			files[newName] = value
			delete(files, oldName)
			return nil
		},
	}
}

func TestAtomicWriteFallbackReplacesAndCleansBackup(t *testing.T) {
	files := map[string][]byte{"/notes.md": []byte("original")}
	if err := atomicWrite(context.Background(), memoryAtomicOperations(files, false), "/notes.md", []byte("updated"), 0o640, false); err != nil {
		t.Fatal(err)
	}
	if string(files["/notes.md"]) != "updated" {
		t.Fatalf("target = %q", files["/notes.md"])
	}
	if len(files) != 1 {
		t.Fatalf("temporary files remain: %#v", files)
	}
}

func TestAtomicWriteFallbackRollsBackAndCleansTemporaryFile(t *testing.T) {
	files := map[string][]byte{"/notes.md": []byte("original")}
	err := atomicWrite(context.Background(), memoryAtomicOperations(files, true), "/notes.md", []byte("updated"), 0o640, false)
	if err == nil {
		t.Fatal("expected replacement failure")
	}
	if string(files["/notes.md"]) != "original" {
		t.Fatalf("target = %q", files["/notes.md"])
	}
	if len(files) != 1 {
		t.Fatalf("temporary files remain: %#v", files)
	}
}
