package appserver

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"net/http"
	"sync"
	"time"
)

const sessionCookieName = "localdraft_bridge_session"

type sessionStore struct {
	mu               sync.Mutex
	startupTokenHash [sha256.Size]byte
	startupTokenUsed bool
	sessions         map[[sha256.Size]byte]time.Time
	sessionLifetime  time.Duration
}

func newSessionStore(startupToken string, lifetime time.Duration) *sessionStore {
	if lifetime <= 0 {
		lifetime = 12 * time.Hour
	}
	return &sessionStore{
		startupTokenHash: sha256.Sum256([]byte(startupToken)),
		sessions:         make(map[[sha256.Size]byte]time.Time),
		sessionLifetime:  lifetime,
	}
}

func randomToken(byteCount int) (string, error) {
	value := make([]byte, byteCount)
	if _, err := rand.Read(value); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(value), nil
}

func (s *sessionStore) exchangeStartupToken(token string) (string, bool) {
	provided := sha256.Sum256([]byte(token))
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.startupTokenUsed || subtle.ConstantTimeCompare(provided[:], s.startupTokenHash[:]) != 1 {
		return "", false
	}
	sessionToken, err := randomToken(32)
	if err != nil {
		return "", false
	}
	s.startupTokenUsed = true
	s.startupTokenHash = [sha256.Size]byte{}
	s.sessions[sha256.Sum256([]byte(sessionToken))] = time.Now().Add(s.sessionLifetime)
	return sessionToken, true
}

func (s *sessionStore) validRequest(request *http.Request) bool {
	cookie, err := request.Cookie(sessionCookieName)
	if err != nil || cookie.Value == "" {
		return false
	}
	hash := sha256.Sum256([]byte(cookie.Value))
	now := time.Now()
	s.mu.Lock()
	defer s.mu.Unlock()
	expiresAt, ok := s.sessions[hash]
	if !ok || now.After(expiresAt) {
		delete(s.sessions, hash)
		return false
	}
	return true
}

func (s *Server) handleSession(response http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodGet {
		response.Header().Set("Allow", http.MethodGet)
		http.Error(response, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	sessionToken, ok := s.sessions.exchangeStartupToken(request.URL.Query().Get("token"))
	if !ok {
		http.Error(response, "Invalid or expired startup token", http.StatusUnauthorized)
		return
	}
	http.SetCookie(response, &http.Cookie{
		Name:     sessionCookieName,
		Value:    sessionToken,
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteStrictMode,
		Secure:   false,
		MaxAge:   int(s.config.SessionLifetime.Seconds()),
	})
	response.Header().Set("Cache-Control", "no-store")
	http.Redirect(response, request, "/src/local_draft_ai.html", http.StatusSeeOther)
}
