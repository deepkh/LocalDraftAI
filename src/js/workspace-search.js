(function () {
  "use strict";

  var ME = window.MarkdownEditor = window.MarkdownEditor || {};

  var DEFAULT_MAX_MATCHES_PER_FILE = 5;
  var DEFAULT_MAX_RESULTS = 100;

  function normalizeQuery(query) {
    return String(query || "").trim();
  }

  function createPreview(line, query, maxLength) {
    var text = String(line || "").replace(/\s+/g, " ").trim();
    var normalizedQuery = normalizeQuery(query).toLowerCase();
    var index = normalizedQuery ? text.toLowerCase().indexOf(normalizedQuery) : -1;
    var limit = Number(maxLength) || 140;
    var start = 0;
    var end;

    if (text.length <= limit) {
      return text;
    }

    if (index !== -1) {
      start = Math.max(0, index - Math.floor(limit / 3));
    }
    end = Math.min(text.length, start + limit);
    start = Math.max(0, end - limit);

    return (start > 0 ? "..." : "") + text.slice(start, end) + (end < text.length ? "..." : "");
  }

  function findLineMatches(text, query, options) {
    var normalizedQuery = normalizeQuery(query);
    var maxMatches = options && options.maxMatchesPerFile ? options.maxMatchesPerFile : DEFAULT_MAX_MATCHES_PER_FILE;
    var lines;
    var lowerQuery;
    var matches = [];
    var i;
    var line;
    var index;

    if (!normalizedQuery) {
      return matches;
    }

    lines = String(text || "").split(/\r?\n/);
    lowerQuery = normalizedQuery.toLowerCase();
    for (i = 0; i < lines.length; i += 1) {
      line = lines[i];
      index = line.toLowerCase().indexOf(lowerQuery);
      if (index === -1) {
        continue;
      }
      matches.push({
        column: index,
        line: i + 1,
        preview: createPreview(line, normalizedQuery),
        text: line
      });
      if (matches.length >= maxMatches) {
        break;
      }
    }

    return matches;
  }

  async function readFileText(fileItem) {
    var file;

    if (typeof fileItem.text === "string") {
      return fileItem.text;
    }
    if (!fileItem.handle || typeof fileItem.handle.getFile !== "function") {
      return "";
    }

    file = await fileItem.handle.getFile();
    return file.text();
  }

  async function searchFiles(files, query, options) {
    var normalizedQuery = normalizeQuery(query);
    var maxResults = options && options.maxResults ? options.maxResults : DEFAULT_MAX_RESULTS;
    var maxMatchesPerFile = options && options.maxMatchesPerFile ? options.maxMatchesPerFile : DEFAULT_MAX_MATCHES_PER_FILE;
    var results = [];
    var limited = false;
    var i;
    var fileItem;
    var matches;
    var text;
    var j;

    if (!normalizedQuery) {
      return {
        limited: false,
        query: normalizedQuery,
        results: []
      };
    }

    for (i = 0; i < (files || []).length; i += 1) {
      fileItem = files[i];
      if (!fileItem || !(ME.workspaceStore && ME.workspaceStore.isMarkdownFile(fileItem.path || fileItem.name))) {
        continue;
      }

      text = await readFileText(fileItem);
      matches = findLineMatches(text, normalizedQuery, {
        maxMatchesPerFile: maxMatchesPerFile
      });

      for (j = 0; j < matches.length; j += 1) {
        results.push({
          column: matches[j].column,
          line: matches[j].line,
          path: fileItem.path || fileItem.name || "",
          preview: matches[j].preview,
          text: matches[j].text
        });
        if (results.length >= maxResults) {
          limited = true;
          return {
            limited: limited,
            query: normalizedQuery,
            results: results
          };
        }
      }
    }

    return {
      limited: limited,
      query: normalizedQuery,
      results: results
    };
  }

  ME.workspaceSearch = {
    createPreview: createPreview,
    findLineMatches: findLineMatches,
    normalizeQuery: normalizeQuery,
    searchFiles: searchFiles
  };
}());
