package protocol

import "encoding/json"

type Response struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id"`
	Result  any             `json:"result,omitempty"`
	Error   *Error          `json:"error,omitempty"`
}

func Success(id json.RawMessage, result any) Response {
	return Response{JSONRPC: Version, ID: responseID(id), Result: result}
}

func Failure(id json.RawMessage, rpcError *Error) Response {
	return Response{JSONRPC: Version, ID: responseID(id), Error: rpcError}
}

func responseID(id json.RawMessage) json.RawMessage {
	if len(id) == 0 {
		return json.RawMessage("null")
	}
	return id
}
