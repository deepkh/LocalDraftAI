package protocol

const (
	ParseErrorCode     = -32700
	InvalidRequestCode = -32600
	MethodNotFoundCode = -32601
	InvalidParamsCode  = -32602
	InternalErrorCode  = -32603
)

type ErrorData struct {
	Code      string `json:"code,omitempty"`
	Retryable bool   `json:"retryable"`
	Details   any    `json:"details,omitempty"`
}

type Error struct {
	Code    int        `json:"code"`
	Message string     `json:"message"`
	Data    *ErrorData `json:"data,omitempty"`
}

func NewError(code int, message string) *Error {
	return &Error{Code: code, Message: message}
}

func NewStorageError(code int, storageCode, message string, retryable bool, details any) *Error {
	return &Error{
		Code:    code,
		Message: message,
		Data: &ErrorData{
			Code:      storageCode,
			Retryable: retryable,
			Details:   details,
		},
	}
}
