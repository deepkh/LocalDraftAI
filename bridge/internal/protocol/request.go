package protocol

import "encoding/json"

const Version = "2.0"

type Request struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id,omitempty"`
	Method  string          `json:"method"`
	Params  json.RawMessage `json:"params,omitempty"`
}

func (r Request) IsNotification() bool {
	return len(r.ID) == 0
}

func (r Request) Valid() bool {
	return r.JSONRPC == Version && r.Method != ""
}
