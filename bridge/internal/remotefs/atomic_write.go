package remotefs

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"io"
	"os"
	"path"

	"github.com/pkg/sftp"
)

type atomicWriteOperations struct {
	chmod         func(string, os.FileMode) error
	openExclusive func(string) (io.WriteCloser, error)
	posixRename   func(string, string) error
	remove        func(string) error
	rename        func(string, string) error
}

func clientAtomicWriteOperations(client *sftp.Client) atomicWriteOperations {
	return atomicWriteOperations{
		chmod: client.Chmod,
		openExclusive: func(name string) (io.WriteCloser, error) {
			return client.OpenFile(name, os.O_WRONLY|os.O_CREATE|os.O_EXCL)
		},
		posixRename: client.PosixRename,
		remove:      client.Remove,
		rename:      client.Rename,
	}
}

func atomicWrite(ctx context.Context, operations atomicWriteOperations, target string, payload []byte, mode os.FileMode, requireAbsent bool) error {
	temporary, err := randomSiblingPath(target, "localdraft", ".tmp")
	if err != nil {
		return err
	}
	temporaryExists := false
	reservedTarget := false
	replaced := false
	defer func() {
		if temporaryExists {
			_ = operations.remove(temporary)
		}
		if reservedTarget && !replaced {
			_ = operations.remove(target)
		}
	}()

	file, err := operations.openExclusive(temporary)
	if err != nil {
		return err
	}
	temporaryExists = true
	_, writeErr := io.Copy(file, bytes.NewReader(payload))
	closeErr := file.Close()
	if writeErr != nil {
		return writeErr
	}
	if closeErr != nil {
		return closeErr
	}
	if err := ctx.Err(); err != nil {
		return err
	}
	if err := operations.chmod(temporary, mode.Perm()); err != nil {
		return err
	}

	if requireAbsent {
		reservation, err := operations.openExclusive(target)
		if err != nil {
			return err
		}
		if err := reservation.Close(); err != nil {
			_ = operations.remove(target)
			return err
		}
		reservedTarget = true
	}

	err = operations.posixRename(temporary, target)
	if err == nil {
		temporaryExists = false
		reservedTarget = false
		replaced = true
		return nil
	}
	if !isOperationUnsupported(err) {
		return err
	}

	backup, err := randomSiblingPath(target, "localdraft-backup", ".bak")
	if err != nil {
		return err
	}
	if err := operations.rename(target, backup); err != nil {
		return err
	}
	reservedTarget = false
	if err := operations.rename(temporary, target); err != nil {
		rollbackErr := operations.rename(backup, target)
		if rollbackErr != nil {
			return errors.Join(err, rollbackErr)
		}
		return err
	}
	temporaryExists = false
	replaced = true
	_ = operations.remove(backup)
	return nil
}

func randomSiblingPath(target, marker, suffix string) (string, error) {
	value := make([]byte, 12)
	if _, err := rand.Read(value); err != nil {
		return "", err
	}
	return path.Join(path.Dir(target), "."+path.Base(target)+"."+marker+"-"+hex.EncodeToString(value)+suffix), nil
}

func isOperationUnsupported(err error) bool {
	var statusError *sftp.StatusError

	if errors.Is(err, errors.ErrUnsupported) {
		return true
	}
	return errors.As(err, &statusError) && statusError.FxCode() == sftp.ErrSSHFxOpUnsupported
}
