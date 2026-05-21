(function () {
  "use strict";

  var ME = window.MarkdownEditor = window.MarkdownEditor || {};
  var utils = ME.utils;
  var clamp = utils.clamp;
  var normalizeViewportText = utils.normalizeViewportText;
  var textContent = utils.textContent;

  function createViewport(context) {
    var pendingModeSwitchAnchor = null;
    var latestEditorViewportAnchor = null;
    var viewportTrackTimer = 0;
    var wysiwygEditor = context.wysiwygEditor;
    var markdownEditor = context.markdownEditor;

    function hasInternalScroll(element) {
      return element.scrollHeight - element.clientHeight > 1;
    }

    function getScrollRatio(element) {
      if (hasInternalScroll(element)) {
        var maxElementScroll = Math.max(element.scrollHeight - element.clientHeight, 0);
        return maxElementScroll ? element.scrollTop / maxElementScroll : 0;
      }

      var root = document.scrollingElement || document.documentElement;
      var maxPageScroll = Math.max(root.scrollHeight - window.innerHeight, 0);
      return maxPageScroll ? window.scrollY / maxPageScroll : 0;
    }

    function restoreScrollRatio(element, ratio) {
      if (hasInternalScroll(element)) {
        var maxElementScroll = Math.max(element.scrollHeight - element.clientHeight, 0);
        element.scrollTop = maxElementScroll * clamp(ratio || 0, 0, 1);
        return;
      }

      var root = document.scrollingElement || document.documentElement;
      var maxPageScroll = Math.max(root.scrollHeight - window.innerHeight, 0);
      window.scrollTo(window.scrollX, maxPageScroll * clamp(ratio || 0, 0, 1));
    }

    function getStickyViewportTop() {
      var topbar = document.querySelector(".topbar");
      return topbar ? Math.max(topbar.getBoundingClientRect().bottom, 0) : 0;
    }

    function getEditorViewportTop(element) {
      var rect = element.getBoundingClientRect();
      var styles = window.getComputedStyle(element);
      var paddingTop = parseFloat(styles.paddingTop) || 0;

      return Math.max(rect.top + paddingTop, getStickyViewportTop(), 0);
    }

    function getMarkdownLineHeight() {
      var styles = window.getComputedStyle(markdownEditor);
      var lineHeight = parseFloat(styles.lineHeight);

      if (!lineHeight) {
        lineHeight = parseFloat(styles.fontSize) * 1.45;
      }

      return lineHeight || 20;
    }

    function getMarkdownTopLine() {
      var lineHeight = getMarkdownLineHeight();
      var rect = markdownEditor.getBoundingClientRect();
      var styles = window.getComputedStyle(markdownEditor);
      var paddingTop = parseFloat(styles.paddingTop) || 0;
      var visibleTop = getEditorViewportTop(markdownEditor);
      var rawLine = (markdownEditor.scrollTop + visibleTop - rect.top - paddingTop) / lineHeight;

      return {
        line: Math.max(0, Math.floor(rawLine)),
        lineOffset: rawLine - Math.floor(rawLine)
      };
    }

    function getWysiwygAnchorElements() {
      return Array.prototype.slice.call(wysiwygEditor.querySelectorAll("[data-md-line]"));
    }

    function getWysiwygTextAnchorElements() {
      return Array.prototype.slice.call(
        wysiwygEditor.querySelectorAll("h1, h2, h3, h4, h5, h6, p, li, pre, blockquote, div, section, article")
      );
    }

    function elementMarkdownLine(element) {
      var line = Number(element.getAttribute("data-md-line"));
      return Number.isFinite(line) ? line : null;
    }

    function elementTextHint(element) {
      if (!element) {
        return "";
      }

      return normalizeViewportText(textContent(element)).slice(0, 160);
    }

    function findTopViewportElement(elements, targetY, lineResolver) {
      var containing = null;
      var below = null;
      var lastAbove = null;

      elements.forEach(function (element, index) {
        var line = lineResolver ? lineResolver(element) : null;
        var rect;

        if (lineResolver && line == null) {
          return;
        }

        rect = element.getBoundingClientRect();
        if (rect.height <= 0 || !elementTextHint(element)) {
          return;
        }

        if (rect.top <= targetY + 1 && rect.bottom >= targetY) {
          if (!containing || rect.height < containing.rect.height) {
            containing = { element: element, index: index, line: line, rect: rect };
          }
        } else if (rect.top > targetY) {
          if (!below || rect.top < below.rect.top) {
            below = { element: element, index: index, line: line, rect: rect };
          }
        } else {
          lastAbove = { element: element, index: index, line: line, rect: rect };
        }
      });

      return containing || below || lastAbove || null;
    }

    function getWysiwygTopBlockIndex() {
      var targetY = getEditorViewportTop(wysiwygEditor);
      var lineAnchor = findTopViewportElement(getWysiwygAnchorElements(), targetY, elementMarkdownLine);
      var textAnchor = lineAnchor || findTopViewportElement(getWysiwygTextAnchorElements(), targetY);
      var anchor = lineAnchor || textAnchor;

      if (!anchor) {
        return null;
      }

      return {
        blockIndex: lineAnchor ? lineAnchor.index : null,
        blockRatio: clamp((targetY - anchor.rect.top) / anchor.rect.height, 0, 1),
        line: lineAnchor ? lineAnchor.line : null,
        textHint: elementTextHint(anchor.element)
      };
    }

    function captureEditorViewport() {
      if (context.getActiveMode() === "markdown") {
        var markdownAnchor = getMarkdownTopLine();
        return {
          mode: "markdown",
          line: markdownAnchor.line,
          lineOffset: markdownAnchor.lineOffset,
          scrollRatio: getScrollRatio(markdownEditor)
        };
      }

      var blockAnchor = getWysiwygTopBlockIndex();
      return {
        mode: "wysiwyg",
        line: blockAnchor ? blockAnchor.line : null,
        blockIndex: blockAnchor ? blockAnchor.blockIndex : null,
        blockRatio: blockAnchor ? blockAnchor.blockRatio : 0,
        textHint: blockAnchor ? blockAnchor.textHint : "",
        scrollRatio: getScrollRatio(wysiwygEditor)
      };
    }

    function rememberEditorViewport() {
      latestEditorViewportAnchor = captureEditorViewport();
    }

    function scheduleViewportTracking() {
      window.cancelAnimationFrame(viewportTrackTimer);
      viewportTrackTimer = window.requestAnimationFrame(rememberEditorViewport);
    }

    function markdownLineSearchText(line) {
      var text = String(line || "");

      text = text.replace(/^\s{0,3}#{1,6}\s+/, "");
      text = text.replace(/^\s{0,3}>\s?/, "");
      text = text.replace(/^\s*[-*+]\s+/, "");
      text = text.replace(/^\s*\d+[.)]\s+/, "");
      text = text.replace(/\[([^\]\n]+)\]\([^)]+\)/g, "$1");
      text = text.replace(/`([^`\n]+)`/g, "$1");
      text = text.replace(/(\*\*|__)(.+?)\1/g, "$2");
      text = text.replace(/(^|[^\w*])\*([^*\n]+)\*/g, "$1$2");
      text = text.replace(/(^|[^\w_])_([^_\n]+)_/g, "$1$2");

      return normalizeViewportText(text);
    }

    function findMarkdownLineByTextHint(anchor) {
      var hint = normalizeViewportText(anchor && anchor.textHint);
      var lines;
      var expectedLine;
      var matches = [];

      if (!hint || hint.length < 3) {
        return null;
      }

      lines = String(context.getMarkdownText() || "").split("\n");
      expectedLine = typeof anchor.line === "number"
        ? anchor.line
        : Math.round((lines.length - 1) * clamp(anchor.scrollRatio || 0, 0, 1));
      hint = hint.toLowerCase();

      lines.forEach(function (line, index) {
        var candidate = markdownLineSearchText(line).toLowerCase();
        var isMatch = false;

        if (!candidate) {
          return;
        }

        if (candidate === hint || candidate.indexOf(hint) !== -1) {
          isMatch = true;
        } else if (candidate.length >= 12 && hint.indexOf(candidate) !== -1) {
          isMatch = true;
        }

        if (isMatch) {
          matches.push(index);
        }
      });

      if (!matches.length) {
        return null;
      }

      return matches.reduce(function (best, line) {
        return Math.abs(line - expectedLine) < Math.abs(best - expectedLine) ? line : best;
      }, matches[0]);
    }

    function restoreMarkdownScroll(anchor) {
      var resolvedLine = anchor && anchor.mode === "wysiwyg" ? findMarkdownLineByTextHint(anchor) : null;

      if (resolvedLine == null && anchor && typeof anchor.line === "number") {
        resolvedLine = anchor.line;
      }

      if (typeof resolvedLine === "number") {
        var lineCount = String(context.getMarkdownText() || "").split("\n").length;
        var line = clamp(resolvedLine, 0, Math.max(lineCount - 1, 0));
        var lineTop = (line + (anchor.lineOffset || 0)) * getMarkdownLineHeight();
        var rect;
        var styles;
        var paddingTop;
        var targetY;

        if (hasInternalScroll(markdownEditor)) {
          markdownEditor.scrollTop = lineTop;
        }

        rect = markdownEditor.getBoundingClientRect();
        styles = window.getComputedStyle(markdownEditor);
        paddingTop = parseFloat(styles.paddingTop) || 0;
        targetY = rect.top + paddingTop + lineTop - markdownEditor.scrollTop;
        window.scrollTo(window.scrollX, window.scrollY + targetY - getEditorViewportTop(markdownEditor));

        if (hasInternalScroll(markdownEditor)) {
          markdownEditor.scrollTop = lineTop;
        }
        return;
      }

      restoreScrollRatio(markdownEditor, anchor ? anchor.scrollRatio : 0);
    }

    function findWysiwygBlockForLine(line) {
      var elements = getWysiwygAnchorElements();
      var selected = null;

      elements.forEach(function (element) {
        var elementLine = elementMarkdownLine(element);

        if (elementLine == null || elementLine > line) {
          return;
        }

        if (!selected || elementLine > selected.line) {
          selected = { element: element, line: elementLine };
        } else if (selected.line === elementLine) {
          var currentRect = element.getBoundingClientRect();
          var selectedRect = selected.element.getBoundingClientRect();
          if (currentRect.height > 0 && currentRect.height < selectedRect.height) {
            selected = { element: element, line: elementLine };
          }
        }
      });

      return selected ? selected.element : elements[0] || null;
    }

    function restoreWysiwygScroll(anchor) {
      if (anchor && typeof anchor.line === "number") {
        var block = findWysiwygBlockForLine(anchor.line);

        if (block) {
          var blockRect = block.getBoundingClientRect();
          var blockOffset = blockRect.top - getEditorViewportTop(wysiwygEditor);
          var targetOffset = blockOffset + (anchor.blockRatio || 0) * blockRect.height;

          if (hasInternalScroll(wysiwygEditor)) {
            wysiwygEditor.scrollTop += targetOffset;
          } else {
            window.scrollTo(window.scrollX, window.scrollY + targetOffset);
          }
          return;
        }
      }

      restoreScrollRatio(wysiwygEditor, anchor ? anchor.scrollRatio : 0);
    }

    function restoreEditorViewport(anchor) {
      if (context.getActiveMode() === "markdown") {
        restoreMarkdownScroll(anchor);
      } else {
        restoreWysiwygScroll(anchor);
      }
    }

    function prepareModeSwitchAnchor() {
      pendingModeSwitchAnchor = captureEditorViewport();
    }

    function consumeModeSwitchAnchor() {
      var activeMode = context.getActiveMode();
      var viewportAnchor =
        pendingModeSwitchAnchor ||
        (latestEditorViewportAnchor && latestEditorViewportAnchor.mode === activeMode
          ? latestEditorViewportAnchor
          : captureEditorViewport());

      pendingModeSwitchAnchor = null;
      return viewportAnchor;
    }

    return {
      consumeModeSwitchAnchor: consumeModeSwitchAnchor,
      prepareModeSwitchAnchor: prepareModeSwitchAnchor,
      remember: rememberEditorViewport,
      restore: restoreEditorViewport,
      scheduleTracking: scheduleViewportTracking
    };
  }

  ME.viewport = {
    create: createViewport
  };
}());
