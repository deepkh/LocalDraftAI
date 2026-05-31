(function () {
  "use strict";

  var ME = window.MarkdownEditor = window.MarkdownEditor || {};

  function normalizePath(path) {
    var parts = [];

    String(path || "").split("/").forEach(function (part) {
      if (!part || part === ".") {
        return;
      }
      if (part === "..") {
        parts.pop();
        return;
      }
      parts.push(part);
    });

    return parts.join("/");
  }

  function dirname(path) {
    var normalized = normalizePath(path);
    var index = normalized.lastIndexOf("/");

    return index === -1 ? "" : normalized.slice(0, index);
  }

  function basename(path) {
    var normalized = normalizePath(path);
    var index = normalized.lastIndexOf("/");

    return index === -1 ? normalized : normalized.slice(index + 1);
  }

  function isExternalLink(target) {
    return /^[a-z][a-z0-9+.-]*:/i.test(String(target || "")) || /^\/\//.test(String(target || ""));
  }

  function stripHashAndQuery(target) {
    return String(target || "").split("#")[0].split("?")[0];
  }

  function extractMarkdownLinks(markdownText) {
    var links = [];
    var pattern = /(!)?\[[^\]]*]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
    var match;
    var target;

    while ((match = pattern.exec(String(markdownText || "")))) {
      if (match[1]) {
        continue;
      }
      target = stripHashAndQuery(match[2]);
      if (!target || isExternalLink(target)) {
        continue;
      }
      if (!(ME.workspaceStore && ME.workspaceStore.isMarkdownFile(target))) {
        continue;
      }
      links.push(target);
    }

    return links;
  }

  function resolveRelativeMarkdownPath(fromPath, target) {
    var cleanTarget = stripHashAndQuery(target);

    if (!cleanTarget || isExternalLink(cleanTarget)) {
      return "";
    }
    if (/^\//.test(cleanTarget)) {
      return normalizePath(cleanTarget.replace(/^\/+/, ""));
    }

    return normalizePath(dirname(fromPath) + "/" + cleanTarget);
  }

  function isPlanFile(path) {
    var normalized = normalizePath(path);
    var name = basename(normalized);

    if (!/\.(md|markdown)$/i.test(name)) {
      return false;
    }

    return /^plans\//i.test(normalized) ||
      /^Plan_/i.test(name) ||
      /_Plan\.(md|markdown)$/i.test(name) ||
      /plan/i.test(name);
  }

  function uniqueByPath(items) {
    var seen = {};
    var result = [];

    (items || []).forEach(function (item) {
      if (!item || !item.path || seen[item.path]) {
        return;
      }
      seen[item.path] = true;
      result.push(item);
    });

    return result;
  }

  function fileLookup(files) {
    var lookup = {};

    (files || []).forEach(function (file) {
      lookup[file.path] = file;
    });

    return lookup;
  }

  function toRelatedItem(path, lookup, extras) {
    var file = lookup[path];
    var item = {
      exists: Boolean(file),
      name: basename(path),
      path: path
    };
    var key;

    extras = extras || {};
    for (key in extras) {
      if (Object.prototype.hasOwnProperty.call(extras, key)) {
        item[key] = extras[key];
      }
    }

    return item;
  }

  function getRelatedFiles(options) {
    var files = options && options.files ? options.files : [];
    var activePath = options && options.activePath ? options.activePath : "";
    var markdownText = options && options.markdownText ? options.markdownText : "";
    var recentPaths = options && options.recentPaths ? options.recentPaths : [];
    var lookup = fileLookup(files);
    var activeDir = dirname(activePath);
    var sameFolder = [];
    var linked = [];
    var recent = [];
    var plans = [];

    if (!activePath) {
      return {
        activePath: "",
        linked: [],
        plans: files.filter(function (file) {
          return isPlanFile(file.path);
        }).map(function (file) {
          return toRelatedItem(file.path, lookup);
        }).slice(0, 12),
        recent: [],
        sameFolder: []
      };
    }

    files.forEach(function (file) {
      if (file.path !== activePath && dirname(file.path) === activeDir) {
        sameFolder.push(toRelatedItem(file.path, lookup));
      }
      if (isPlanFile(file.path) && file.path !== activePath) {
        plans.push(toRelatedItem(file.path, lookup));
      }
    });

    linked = extractMarkdownLinks(markdownText).map(function (target) {
      var resolved = resolveRelativeMarkdownPath(activePath, target);

      return resolved ? toRelatedItem(resolved, lookup) : null;
    }).filter(Boolean);

    recent = recentPaths.filter(function (path) {
      return path && path !== activePath;
    }).map(function (path) {
      return toRelatedItem(path, lookup);
    });

    return {
      activePath: activePath,
      linked: uniqueByPath(linked).slice(0, 12),
      plans: uniqueByPath(plans).slice(0, 12),
      recent: uniqueByPath(recent).slice(0, 8),
      sameFolder: uniqueByPath(sameFolder).slice(0, 12)
    };
  }

  ME.workspaceRelated = {
    basename: basename,
    dirname: dirname,
    extractMarkdownLinks: extractMarkdownLinks,
    getRelatedFiles: getRelatedFiles,
    isPlanFile: isPlanFile,
    normalizePath: normalizePath,
    resolveRelativeMarkdownPath: resolveRelativeMarkdownPath
  };
}());
