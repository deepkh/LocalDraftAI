package remotefs

import (
	"context"
	"path"
	"sort"
	"strings"
	"unicode/utf8"
)

const (
	MaximumSearchResults = 500
	MaximumSearchFiles   = 20000
	maximumPreviewRunes  = 240
)

var searchableTextExtensions = map[string]struct{}{
	".md": {}, ".markdown": {}, ".txt": {}, ".log": {}, ".json": {}, ".yml": {}, ".yaml": {},
}

func isSearchableTextPath(value string) bool {
	_, supported := searchableTextExtensions[strings.ToLower(path.Ext(value))]
	return supported
}

func searchPreview(line string) string {
	value := strings.TrimSpace(line)
	runes := []rune(value)
	if len(runes) <= maximumPreviewRunes {
		return value
	}
	return string(runes[:maximumPreviewRunes-3]) + "..."
}

func searchLine(line, query string, caseSensitive bool) int {
	searchValue := line
	searchQuery := query

	if !caseSensitive {
		searchValue = strings.ToLower(line)
		searchQuery = strings.ToLower(query)
	}
	index := strings.Index(searchValue, searchQuery)
	if index < 0 {
		return -1
	}
	return utf8.RuneCountInString(searchValue[:index])
}

func (s *Service) SearchText(ctx context.Context, workspaceID, query string, options SearchOptions) (SearchResult, error) {
	client, workspace, err := s.clientAndWorkspace(workspaceID)
	if err != nil {
		return SearchResult{}, err
	}
	query = strings.TrimSpace(query)
	maximumResults := options.MaxResults
	if maximumResults <= 0 || maximumResults > MaximumSearchResults {
		maximumResults = MaximumSearchResults
	}
	result := SearchResult{Matches: make([]SearchMatch, 0)}
	if query == "" {
		return result, nil
	}

	stack := []string{""}
	for len(stack) > 0 {
		if err := ctx.Err(); err != nil {
			return SearchResult{}, connectionLost(err)
		}
		directoryPath := stack[len(stack)-1]
		stack = stack[:len(stack)-1]
		_, resolved, err := guardExisting(client, workspace, directoryPath, true)
		if err != nil {
			result.WarningCount++
			continue
		}
		entries, err := client.ReadDir(resolved)
		if err != nil {
			result.WarningCount++
			continue
		}
		sort.Slice(entries, func(left, right int) bool { return entries[left].Name() < entries[right].Name() })
		if len(entries) > MaximumDirectorySize {
			result.Truncated = true
			entries = entries[:MaximumDirectorySize]
		}
		for _, entry := range entries {
			if err := ctx.Err(); err != nil {
				return SearchResult{}, connectionLost(err)
			}
			if entry.Name() == "." || entry.Name() == ".." {
				continue
			}
			relativePath := entry.Name()
			if directoryPath != "" {
				relativePath = directoryPath + "/" + entry.Name()
			}
			if entry.IsDir() {
				stack = append(stack, relativePath)
				continue
			}
			if !entry.Mode().IsRegular() {
				continue
			}
			result.FilesVisited++
			if result.FilesVisited > MaximumSearchFiles {
				result.FilesVisited = MaximumSearchFiles
				result.Truncated = true
				return result, nil
			}
			if !isSearchableTextPath(relativePath) {
				continue
			}
			if entry.Size() > MaximumTextFileSize {
				result.WarningCount++
				continue
			}
			_, _, _, payload, err := readFileBytes(ctx, client, workspace, relativePath)
			if err != nil || !utf8.Valid(payload) {
				result.WarningCount++
				continue
			}
			for lineIndex, line := range strings.Split(string(payload), "\n") {
				line = strings.TrimSuffix(line, "\r")
				column := searchLine(line, query, options.CaseSensitive)
				if column < 0 {
					continue
				}
				result.Matches = append(result.Matches, SearchMatch{
					Path: relativePath, Line: lineIndex + 1, Column: column, Preview: searchPreview(line),
				})
				if len(result.Matches) >= maximumResults {
					result.Truncated = true
					return result, nil
				}
			}
		}
	}
	return result, nil
}
