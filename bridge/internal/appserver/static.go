package appserver

import (
	"net/http"
	"os"
	"path/filepath"
)

func staticHandler(webRoot string) (http.Handler, error) {
	root, err := filepath.Abs(webRoot)
	if err != nil {
		return nil, err
	}
	if _, err := os.Stat(filepath.Join(root, "src", "local_draft_ai.html")); err != nil {
		return nil, err
	}

	src := http.StripPrefix("/src/", http.FileServer(http.Dir(filepath.Join(root, "src"))))
	assets := http.StripPrefix("/assets/", http.FileServer(http.Dir(filepath.Join(root, "assets"))))
	return http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		response.Header().Set("X-Content-Type-Options", "nosniff")
		switch {
		case request.URL.Path == "/", request.URL.Path == "/index.html":
			http.Redirect(response, request, "/src/local_draft_ai.html", http.StatusTemporaryRedirect)
		case len(request.URL.Path) > len("/src/") && request.URL.Path[:len("/src/")] == "/src/":
			src.ServeHTTP(response, request)
		case len(request.URL.Path) > len("/assets/") && request.URL.Path[:len("/assets/")] == "/assets/":
			assets.ServeHTTP(response, request)
		default:
			http.NotFound(response, request)
		}
	}), nil
}
