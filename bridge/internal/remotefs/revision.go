package remotefs

import (
	"crypto/sha256"
	"encoding/hex"
	"os"
)

func revisionForBytes(info os.FileInfo, payload []byte) Revision {
	hash := sha256.Sum256(payload)
	return Revision{
		Size:    int64(len(payload)),
		MtimeMs: info.ModTime().UnixMilli(),
		Hash:    hex.EncodeToString(hash[:]),
	}
}
