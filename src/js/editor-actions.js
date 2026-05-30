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

    function insertTextareaBlock(block) {
      var range = selectedTextareaRange();
      var before = markdownEditor.value.slice(0, range.start);
      var after = markdownEditor.value.slice(range.end);
      var prefix = before && !/\n\n$/.test(before) ? (/\n$/.test(before) ? "\n" : "\n\n") : "";
      var suffix = after && !/^\n\n/.test(after) ? (/^\n/.test(after) ? "\n" : "\n\n") : "";
      var replacement = prefix + block + suffix;
      var selectionStart = range.start + prefix.length;
      var selectionEnd = selectionStart + block.length;

      markdownEditor.setRangeText(replacement, range.start, range.end, "end");
      markdownEditor.selectionStart = selectionStart;
      markdownEditor.selectionEnd = selectionEnd;
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

    function indentMarkdownLines(lines) {
      return lines.split("\n").map(function (line) {
        return line.trim() ? "  " + line : line;
      }).join("\n");
    }

    function outdentMarkdownLines(lines) {
      return lines.split("\n").map(function (line) {
        return line.replace(/^(?: {1,2}|\t)/, "");
      }).join("\n");
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

      if (action === "horizontalRule") {
        insertTextareaBlock("---");
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
            var match = line.match(/^(\s*)[-*+]\s+(.*)$/);
            return match ? match[1] + match[2] : line.replace(/^(\s*)/, "$1- ");
          }).join("\n");
        });
        return;
      }

      if (action === "orderedList") {
        replaceCurrentLines(function (lines) {
          var order = 1;
          return lines.split("\n").map(function (line) {
            var match = line.match(/^(\s*)\d+[.)]\s+(.*)$/);
            if (match) {
              return match[1] + match[2];
            }
            return line.replace(/^(\s*)/, function (indent) {
              var marker = indent + order + ". ";
              order += 1;
              return marker;
            });
          }).join("\n");
        });
        return;
      }

      if (action === "indentList") {
        replaceCurrentLines(indentMarkdownLines);
        return;
      }

      if (action === "outdentList") {
        replaceCurrentLines(outdentMarkdownLines);
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
      } else if (action === "indentList") {
        execWysiwyg("indent");
      } else if (action === "outdentList") {
        execWysiwyg("outdent");
      } else if (action === "blockquote") {
        execWysiwyg("formatBlock", "BLOCKQUOTE");
      } else if (action === "codeBlock") {
        execWysiwyg("formatBlock", "PRE");
      } else if (action === "code") {
        wrapWysiwygSelectionWithCode();
      } else if (action === "link") {
        createWysiwygLink();
      } else if (action === "horizontalRule") {
        insertWysiwygHorizontalRule();
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

    function wysiwygBlockForRange(range) {
      var node = range && range.startContainer;

      if (node && node.nodeType === Node.TEXT_NODE) {
        node = node.parentNode;
      }

      while (node && node !== wysiwygEditor) {
        if (
          node.nodeType === Node.ELEMENT_NODE &&
          /^(blockquote|div|h[1-6]|li|ol|p|pre|ul)$/i.test(node.tagName)
        ) {
          return node;
        }
        node = node.parentNode;
      }

      return null;
    }

    function insertWysiwygHorizontalRule() {
      var selection;
      var range;
      var block;
      var hr = document.createElement("hr");
      var after = document.createElement("p");
      var caret = document.createRange();

      wysiwygEditor.focus();
      selection = window.getSelection();
      range = selection && selection.rangeCount ? selection.getRangeAt(0) : null;

      if (!isSelectionInsideWysiwyg(range)) {
        range = document.createRange();
        range.selectNodeContents(wysiwygEditor);
        range.collapse(false);
      }

      block = wysiwygBlockForRange(range);
      if (block && block.parentNode) {
        if (!range.collapsed) {
          range.deleteContents();
        }
        block.parentNode.insertBefore(hr, block.nextSibling);
      } else {
        range.deleteContents();
        range.insertNode(hr);
      }

      after.appendChild(document.createElement("br"));
      hr.parentNode.insertBefore(after, hr.nextSibling);
      caret.setStart(after, 0);
      caret.collapse(true);

      selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(caret);
      context.scheduleSyncFromWysiwyg();
    }

    function captureSelection() {
      var selection;
      var range;
      var container;
      var text;

      if (document.activeElement === markdownEditor) {
        return selectedTextareaRange();
      }

      selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) {
        if (context.getActiveMode() === "markdown") {
          return selectedTextareaRange();
        }
        return {
          mode: "wysiwyg",
          range: null
        };
      }

      range = selection.getRangeAt(0);
      if (!isSelectionInsideWysiwyg(range)) {
        return selectedTextareaRange();
      }

      container = document.createElement("div");
      container.appendChild(range.cloneContents());
      text = ME.markdown.htmlToMarkdown(container) || selection.toString();
      return {
        mode: "wysiwyg",
        range: range.cloneRange(),
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
