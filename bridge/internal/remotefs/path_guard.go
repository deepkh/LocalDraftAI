package remotefs

import (
	"errors"
	"os"
	"path"
	"regexp"
	"strings"

	"github.com/pkg/sftp"
)

var windowsDrivePath = regexp.MustCompile(`^[A-Za-z]:`)

func validateAbsolutePath(value string) error {
	if value == "" || !strings.HasPrefix(value, "/") || strings.Contains(value, `\`) || strings.ContainsRune(value, 0) || windowsDrivePath.MatchString(value) {
		return invalidPath("An absolute POSIX remote path is required.")
	}
	return nil
}

func validateRelativePath(value string, allowEmpty bool) (string, error) {
	if value == "" && allowEmpty {
		return "", nil
	}
	if value == "" || strings.HasPrefix(value, "/") || strings.Contains(value, `\`) || strings.ContainsRune(value, 0) || windowsDrivePath.MatchString(value) {
		return "", invalidPath("A workspace-relative POSIX path is required.")
	}
	parts := strings.Split(value, "/")
	for _, part := range parts {
		if part == "" || part == "." || part == ".." {
			return "", invalidPath("Remote workspace paths cannot contain empty, dot, or dot-dot components.")
		}
	}
	return strings.Join(parts, "/"), nil
}

func guardExisting(client *sftp.Client, workspace Workspace, relativePath string, allowRoot bool) (string, string, error) {
	normalized, err := validateRelativePath(relativePath, allowRoot)
	if err != nil {
		return "", "", err
	}
	candidate := workspace.RootPath
	if normalized != "" {
		candidate = path.Join(workspace.RootPath, normalized)
	}
	resolved, err := client.RealPath(candidate)
	if err != nil {
		return "", "", mapFilesystemError(err, "The remote resource was not found.")
	}
	resolved, err = resolveSymlinks(client, resolved)
	if err != nil {
		return "", "", err
	}
	if !withinRoot(workspace.RootPath, resolved) {
		return "", "", &Error{Code: "PATH_OUTSIDE_WORKSPACE", Message: "The remote path resolves outside the workspace."}
	}
	return normalized, resolved, nil
}

func guardNewTarget(client *sftp.Client, workspace Workspace, relativePath string) (string, string, string, error) {
	normalized, err := validateRelativePath(relativePath, false)
	if err != nil {
		return "", "", "", err
	}
	parentRelative := path.Dir(normalized)
	if parentRelative == "." {
		parentRelative = ""
	}
	_, resolvedParent, err := guardExisting(client, workspace, parentRelative, true)
	if err != nil {
		return "", "", "", err
	}
	info, err := client.Stat(resolvedParent)
	if err != nil {
		return "", "", "", mapFilesystemError(err, "The remote parent directory was not found.")
	}
	if !info.IsDir() {
		return "", "", "", &Error{Code: "INVALID_PATH", Message: "The remote parent path is not a directory."}
	}
	target := path.Join(resolvedParent, path.Base(normalized))
	if !withinRoot(workspace.RootPath, target) {
		return "", "", "", &Error{Code: "PATH_OUTSIDE_WORKSPACE", Message: "The remote path resolves outside the workspace."}
	}
	return normalized, resolvedParent, target, nil
}

func validateName(value string) error {
	if value == "" || value == "." || value == ".." || strings.Contains(value, "/") || strings.Contains(value, `\`) || strings.ContainsRune(value, 0) {
		return invalidPath("A single remote file or folder name is required.")
	}
	return nil
}

func resolveSymlinks(client *sftp.Client, absolutePath string) (string, error) {
	const maximumSymlinks = 40
	remaining := strings.Split(strings.TrimPrefix(path.Clean(absolutePath), "/"), "/")
	resolved := "/"
	symlinks := 0

	for len(remaining) > 0 {
		component := remaining[0]
		remaining = remaining[1:]
		if component == "" || component == "." {
			continue
		}
		candidate := path.Join(resolved, component)
		info, err := client.Lstat(candidate)
		if err != nil {
			return "", mapFilesystemError(err, "The remote resource was not found.")
		}
		if info.Mode()&os.ModeSymlink == 0 {
			resolved = candidate
			continue
		}
		symlinks++
		if symlinks > maximumSymlinks {
			return "", &Error{Code: "INVALID_PATH", Message: "The remote path contains too many symbolic links."}
		}
		target, err := client.ReadLink(candidate)
		if err != nil {
			return "", mapFilesystemError(err, "Could not resolve the remote symbolic link.")
		}
		if !strings.HasPrefix(target, "/") {
			target = path.Join(path.Dir(candidate), target)
		}
		target = path.Clean(target)
		remaining = append(strings.Split(strings.TrimPrefix(target, "/"), "/"), remaining...)
		resolved = "/"
	}
	return path.Clean(resolved), nil
}

func withinRoot(root, candidate string) bool {
	cleanRoot := path.Clean(root)
	cleanCandidate := path.Clean(candidate)

	if cleanRoot == "/" {
		return strings.HasPrefix(cleanCandidate, "/")
	}
	return cleanCandidate == cleanRoot || strings.HasPrefix(cleanCandidate, cleanRoot+"/")
}

func isNotExist(err error) bool {
	return errors.Is(err, os.ErrNotExist)
}

func isPermission(err error) bool {
	return errors.Is(err, os.ErrPermission)
}

func isExist(err error) bool {
	return errors.Is(err, os.ErrExist)
}
