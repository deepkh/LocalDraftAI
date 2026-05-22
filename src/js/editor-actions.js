(function () {
  "use strict";

  var ME = window.MarkdownEditor = window.MarkdownEditor || {};
  var sanitizeUrl = ME.utils.sanitizeUrl;
  var sanitizeImageUrl = ME.utils.sanitizeImageUrl;
  var escapeAttribute = ME.utils.escapeAttribute;

  function createEditorActions(context) {
    var wysiwygEditor = context.wysiwygEditor;
    var markdownEditor = context.markdownEditor;
    var formatBlock = context.formatBlock;

    function execWysiwyg(command, value) {
      wysiwygEditor.focus();
      document.execCommand(command, false, value || null);
      context.scheduleSyncFromWysiwyg();
    }

    function selectedTextareaRange() {
      var value = markdownEditor.value.slice(markdownEditor.selectionStart, markdownEditor.selectionEnd);

      return {
        mode: "markdown",
        start: markdownEditor.selectionStart,
        end: markdownEditor.selectionEnd,
        text: value,
        value: value
      };
    }

    function wrapTextareaSelection(before, after, placeholder) {
      var range = selectedTextareaRange();
      var selected = range.value || placeholder || "";
      var value = before + selected + after;
      markdownEditor.setRangeText(value, range.start, range.end, "end");
      markdownEditor.selectionStart = range.start + before.length;
      markdownEditor.selectionEnd = range.start + before.length + selected.length;
      context.setMarkdown(markdownEditor.value, "textarea");
      markdownEditor.focus();
    }

    function lineRange() {
      var value = markdownEditor.value;
      var start = markdownEditor.selectionStart;
      var end = markdownEditor.selectionEnd;
      var lineStart = value.lastIndexOf("\n", start - 1) + 1;
      var lineEnd = value.indexOf("\n", end);
      if (lineEnd === -1) {
        lineEnd = value.length;
      }
      return {
        start: lineStart,
        end: lineEnd,
        value: value.slice(lineStart, lineEnd)
      };
    }

    function replaceCurrentLines(transform) {
      var range = lineRange();
      var replacement = transform(range.value);
      markdownEditor.setRangeText(replacement, range.start, range.end, "select");
      context.setMarkdown(markdownEditor.value, "textarea");
      markdownEditor.focus();
    }

    function applyMarkdownFormat(value) {
      replaceCurrentLines(function (lines) {
        return lines.split("\n").map(function (line) {
          var text = line.replace(/^#{1,6}\s+/, "");
          return value === "P" ? text : "#".repeat(Number(value.charAt(1))) + " " + text;
        }).join("\n");
      });
    }

    function applyMarkdownAction(action) {
      if (action === "bold") {
        wrapTextareaSelection("**", "**", "bold");
        return;
      }

      if (action === "italic") {
        wrapTextareaSelection("*", "*", "italic");
        return;
      }

      if (action === "code") {
        wrapTextareaSelection("`", "`", "code");
        return;
      }

      if (action === "codeBlock") {
        wrapTextareaSelection("```\n", "\n```", "code");
        return;
      }

      if (action === "link") {
        var url = window.prompt("URL");
        if (!url) {
          return;
        }
        var safeUrl = sanitizeUrl(url);
        if (!safeUrl) {
          return;
        }
        wrapTextareaSelection("[", "](" + safeUrl + ")", "link");
        return;
      }

      if (action === "blockquote") {
        replaceCurrentLines(function (lines) {
          return lines.split("\n").map(function (line) {
            return line.indexOf("> ") === 0 ? line.replace(/^>\s?/, "") : "> " + line;
          }).join("\n");
        });
        return;
      }

      if (action === "unorderedList") {
        replaceCurrentLines(function (lines) {
          return lines.split("\n").map(function (line) {
            return /^\s*[-*+]\s+/.test(line) ? line.replace(/^\s*[-*+]\s+/, "") : "- " + line;
          }).join("\n");
        });
        return;
      }

      if (action === "orderedList") {
        replaceCurrentLines(function (lines) {
          return lines.split("\n").map(function (line, index) {
            return /^\s*\d+[.)]\s+/.test(line) ? line.replace(/^\s*\d+[.)]\s+/, "") : (index + 1) + ". " + line;
          }).join("\n");
        });
        return;
      }

      if (action === "undo" || action === "redo") {
        context.applyHistoryStep(action === "undo" ? -1 : 1);
      }
    }

    function createWysiwygLink() {
      var url = window.prompt("URL");
      if (!url) {
        return;
      }

      var safeUrl = sanitizeUrl(url);
      if (!safeUrl) {
        return;
      }

      execWysiwyg("createLink", safeUrl);
    }

    function wrapWysiwygSelectionWithCode() {
      wysiwygEditor.focus();
      var selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) {
        return;
      }

      var range = selection.getRangeAt(0);
      if (range.collapsed) {
        var code = document.createElement("code");
        code.textContent = "code";
        range.insertNode(code);
        range.selectNodeContents(code);
        selection.removeAllRanges();
        selection.addRange(range);
      } else {
        var wrapper = document.createElement("code");
        try {
          range.surroundContents(wrapper);
        } catch (error) {
          var fragment = range.extractContents();
          wrapper.appendChild(fragment);
          range.insertNode(wrapper);
        }
      }
      context.scheduleSyncFromWysiwyg();
    }

    function applyToolbarAction(action) {
      if (action === "undo" || action === "redo") {
        context.applyHistoryStep(action === "undo" ? -1 : 1);
        return;
      }

      if (context.getActiveMode() === "markdown") {
        applyMarkdownAction(action);
        return;
      }

      if (action === "bold") {
        execWysiwyg("bold");
      } else if (action === "italic") {
        execWysiwyg("italic");
      } else if (action === "unorderedList") {
        execWysiwyg("insertUnorderedList");
      } else if (action === "orderedList") {
        execWysiwyg("insertOrderedList");
      } else if (action === "blockquote") {
        execWysiwyg("formatBlock", "BLOCKQUOTE");
      } else if (action === "codeBlock") {
        execWysiwyg("formatBlock", "PRE");
      } else if (action === "code") {
        wrapWysiwygSelectionWithCode();
      } else if (action === "link") {
        createWysiwygLink();
      }
    }

    function restoreTextareaSelection(range) {
      if (!range || range.mode !== "markdown") {
        return;
      }

      markdownEditor.selectionStart = range.start;
      markdownEditor.selectionEnd = range.end;
    }

    function insertTextIntoTextarea(text, savedSelection) {
      if (savedSelection && savedSelection.mode === "markdown") {
        restoreTextareaSelection(savedSelection);
      }

      var range = selectedTextareaRange();
      markdownEditor.setRangeText(text, range.start, range.end, "end");
      context.setMarkdown(markdownEditor.value, "textarea");
      markdownEditor.focus();
    }

    function isSelectionInsideWysiwyg(range) {
      return Boolean(
        range &&
        wysiwygEditor.contains(range.commonAncestorContainer)
      );
    }

    function restoreWysiwygSelection(savedSelection) {
      var selection;

      if (!savedSelection || savedSelection.mode !== "wysiwyg" || !savedSelection.range) {
        return;
      }

      selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(savedSelection.range);
    }

    function insertHtmlAtSelection(html, savedSelection) {
      wysiwygEditor.focus();
      restoreWysiwygSelection(savedSelection);
      document.execCommand("insertHTML", false, html);
      context.scheduleSyncFromWysiwyg();
    }

    function captureSelection() {
      var selection;
      var range;
      var container;
      var text;

      if (context.getActiveMode() === "markdown") {
        return selectedTextareaRange();
      }

      selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) {
        return {
          mode: "wysiwyg",
          range: null
        };
      }

      range = selection.getRangeAt(0);
      container = document.createElement("div");
      container.appendChild(range.cloneContents());
      text = ME.markdown.htmlToMarkdown(container) || selection.toString();
      return {
        mode: "wysiwyg",
        range: isSelectionInsideWysiwyg(range) ? range.cloneRange() : null,
        text: text,
        value: text
      };
    }

    function placeWysiwygCaretAtPoint(clientX, clientY) {
      var range = null;
      var position;
      var selection;

      if (document.caretRangeFromPoint) {
        range = document.caretRangeFromPoint(clientX, clientY);
      } else if (document.caretPositionFromPoint) {
        position = document.caretPositionFromPoint(clientX, clientY);
        if (position) {
          range = document.createRange();
          range.setStart(position.offsetNode, position.offset);
          range.collapse(true);
        }
      }

      if (!isSelectionInsideWysiwyg(range)) {
        return;
      }

      selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      wysiwygEditor.focus();
    }

    function markdownImageAlt(value) {
      return String(value || "image")
        .replace(/[\r\n\[\]]+/g, " ")
        .replace(/\s+/g, " ")
        .trim() || "image";
    }

    function markdownImageSyntax(image) {
      return "![" + markdownImageAlt(image.alt) + "](" + image.src + ")";
    }

    function imageHtml(image) {
      var src = sanitizeImageUrl(image.src);
      var displaySrc = sanitizeImageUrl(image.displaySrc || image.src);

      if (!src || !displaySrc) {
        return "";
      }

      return (
        '<img src="' + escapeAttribute(displaySrc) + '" alt="' + escapeAttribute(markdownImageAlt(image.alt)) + '" data-md-src="' + escapeAttribute(src) + '">'
      );
    }

    function insertMarkdownImages(images, savedSelection) {
      var markdownText = images.map(markdownImageSyntax).join("\n");
      var html;

      if (!markdownText) {
        return;
      }

      if ((savedSelection && savedSelection.mode === "markdown") || context.getActiveMode() === "markdown") {
        insertTextIntoTextarea(markdownText, savedSelection);
        return;
      }

      html = images.map(imageHtml).filter(Boolean).join("<br>");
      if (html) {
        insertHtmlAtSelection(html, savedSelection);
      }
    }

    function updateFormatSelect() {
      if (context.getActiveMode() !== "wysiwyg") {
        return;
      }

      var block = document.queryCommandValue("formatBlock");
      var normalized = String(block || "P").replace(/[<>]/g, "").toUpperCase();
      if (!/^(P|H1|H2|H3|H4)$/.test(normalized)) {
        normalized = "P";
      }
      formatBlock.value = normalized;
    }

    return {
      applyMarkdownFormat: applyMarkdownFormat,
      applyToolbarAction: applyToolbarAction,
      captureSelection: captureSelection,
      execWysiwyg: execWysiwyg,
      insertHtmlAtSelection: insertHtmlAtSelection,
      insertMarkdownImages: insertMarkdownImages,
      insertTextIntoTextarea: insertTextIntoTextarea,
      placeWysiwygCaretAtPoint: placeWysiwygCaretAtPoint,
      updateFormatSelect: updateFormatSelect
    };
  }

  ME.editorActions = {
    create: createEditorActions
  };
}());
