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

    function closestElement(node, selector, boundary) {
      var current = node && node.nodeType === Node.ELEMENT_NODE
        ? node
        : node && node.parentElement;

      while (current && current !== boundary) {
        if (current.matches && current.matches(selector)) {
          return current;
        }
        current = current.parentElement;
      }

      return null;
    }

    function rangeIntersectsNodeSafe(range, node) {
      try {
        return range.intersectsNode(node);
      } catch (error) {
        return false;
      }
    }

    function getSelectedListItems(range) {
      return Array.prototype.slice.call(wysiwygEditor.querySelectorAll("li"))
        .filter(function (item) {
          return rangeIntersectsNodeSafe(range, item) && String(item.textContent || "").trim();
        });
    }

    function hasSelectedListAncestor(item, selectedItems) {
      var current = item.parentElement;

      while (current && current !== wysiwygEditor) {
        if (current.tagName && current.tagName.toLowerCase() === "li" && selectedItems.indexOf(current) !== -1) {
          return true;
        }
        current = current.parentElement;
      }

      return false;
    }

    function topSelectedListItems(items) {
      return items.filter(function (item) {
        return !hasSelectedListAncestor(item, items);
      });
    }

    function selectedListItemsToMarkdownFragment(items) {
      var root = document.createElement("div");
      var currentParent = null;
      var currentList = null;

      topSelectedListItems(items).forEach(function (item) {
        var parent = item.parentElement;

        if (!parent || !/^(ul|ol)$/i.test(parent.tagName || "")) {
          return;
        }

        if (parent !== currentParent) {
          currentParent = parent;
          currentList = document.createElement(parent.tagName.toLowerCase());
          root.appendChild(currentList);
        }

        currentList.appendChild(item.cloneNode(true));
      });

      return ME.markdown.htmlToMarkdown(root);
    }

    function replacementRangeForListItems(items) {
      var selectedItems = topSelectedListItems(items);
      var range;

      if (!selectedItems.length) {
        return null;
      }

      range = document.createRange();
      range.setStartBefore(selectedItems[0]);
      range.setEndAfter(selectedItems[selectedItems.length - 1]);
      return range;
    }

    function isPartialSingleListItemSelection(range, items, selectionText) {
      var startItem;
      var endItem;
      var itemText;

      if (items.length !== 1) {
        return false;
      }

      startItem = closestElement(range.startContainer, "li", wysiwygEditor);
      endItem = closestElement(range.endContainer, "li", wysiwygEditor);
      if (!startItem || startItem !== endItem || startItem !== items[0]) {
        return false;
      }

      itemText = String(startItem.textContent || "").replace(/\s+/g, " ").trim();
      return String(selectionText || "").replace(/\s+/g, " ").trim() !== itemText;
    }

    function serializeWysiwygRangeToMarkdown(range, selectionText) {
      var items = getSelectedListItems(range);
      var container;
      var markdownText;

      if (items.length && isPartialSingleListItemSelection(range, items, selectionText)) {
        return {
          captureMethod: "dom-list-partial-text",
          replacementRange: range.cloneRange(),
          text: selectionText
        };
      }

      if (items.length) {
        markdownText = selectedListItemsToMarkdownFragment(items);
        if (markdownText) {
          return {
            captureMethod: "dom-list-aware-markdown",
            replacementRange: replacementRangeForListItems(items),
            text: markdownText
          };
        }
      }

      container = document.createElement("div");
      container.appendChild(range.cloneContents());
      return {
        captureMethod: "dom-markdown",
        replacementRange: range.cloneRange(),
        text: ME.markdown.htmlToMarkdown(container) || selectionText
      };
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

    function isParagraphLikeBlock(node) {
      return Boolean(node && node.nodeType === Node.ELEMENT_NODE && /^(div|p)$/i.test(node.tagName));
    }

    function isRangeAtEndOfBlock(range, block) {
      var postRange;

      if (!range || !block || !block.contains(range.startContainer)) {
        return false;
      }

      postRange = range.cloneRange();
      postRange.selectNodeContents(block);
      postRange.setStart(range.startContainer, range.startOffset);
      return postRange.toString().length === 0;
    }

    function htmlIsHeadingFragment(html) {
      var doc = new DOMParser().parseFromString(String(html || ""), "text/html");
      var meaningful = Array.prototype.filter.call(doc.body.childNodes, function (child) {
        return child.nodeType === Node.ELEMENT_NODE ||
          (child.nodeType === Node.TEXT_NODE && /\S/.test(child.nodeValue || ""));
      });

      return Boolean(meaningful.length) && meaningful.every(function (child) {
        return child.nodeType === Node.ELEMENT_NODE && /^h[1-6]$/i.test(child.tagName);
      });
    }

    function shouldInsertHeadingHtmlAsText(range, html) {
      var block = wysiwygBlockForRange(range);

      return Boolean(
        range &&
        range.collapsed &&
        isParagraphLikeBlock(block) &&
        (block.textContent || "").trim() &&
        isRangeAtEndOfBlock(range, block) &&
        htmlIsHeadingFragment(html)
      );
    }

    function clipboardApi() {
      return window.navigator && window.navigator.clipboard ? window.navigator.clipboard : null;
    }

    function blobFromText(text, type) {
      return new Blob([String(text || "")], { type: type });
    }

    function fallbackCopyText(text) {
      var textarea;
      var selection;
      var selectedRange = null;

      if (!document.body || typeof document.execCommand !== "function") {
        return false;
      }

      selection = window.getSelection ? window.getSelection() : null;
      if (selection && selection.rangeCount) {
        selectedRange = selection.getRangeAt(0).cloneRange();
      }

      textarea = document.createElement("textarea");
      textarea.value = String(text || "");
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      textarea.style.top = "0";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();

      try {
        return document.execCommand("copy");
      } finally {
        document.body.removeChild(textarea);
        if (selectedRange && selection) {
          selection.removeAllRanges();
          selection.addRange(selectedRange);
        }
      }
    }

    function fallbackCopyHtml(html, plainText) {
      var container;
      var range;
      var selection;
      var selectedRange = null;

      if (!document.body || typeof document.execCommand !== "function") {
        return fallbackCopyText(plainText);
      }

      selection = window.getSelection();
      if (selection && selection.rangeCount) {
        selectedRange = selection.getRangeAt(0).cloneRange();
      }

      container = document.createElement("div");
      container.contentEditable = "true";
      container.style.position = "fixed";
      container.style.left = "-9999px";
      container.style.top = "0";
      container.innerHTML = String(html || "");
      if (!container.innerHTML) {
        container.textContent = String(plainText || "");
      }
      document.body.appendChild(container);

      range = document.createRange();
      range.selectNodeContents(container);
      selection.removeAllRanges();
      selection.addRange(range);

      try {
        return document.execCommand("copy");
      } finally {
        selection.removeAllRanges();
        if (selectedRange) {
          selection.addRange(selectedRange);
        }
        document.body.removeChild(container);
      }
    }

    function writeTextToClipboard(text) {
      var clipboard = clipboardApi();

      if (clipboard && typeof clipboard.writeText === "function") {
        return clipboard.writeText(String(text || "")).catch(function () {
          if (!fallbackCopyText(text)) {
            throw new Error("Clipboard write failed.");
          }
        });
      }

      return fallbackCopyText(text)
        ? Promise.resolve()
        : Promise.reject(new Error("Clipboard API is not available."));
    }

    function writeHtmlToClipboard(html, plainText) {
      var clipboard = clipboardApi();

      if (
        clipboard &&
        typeof clipboard.write === "function" &&
        window.ClipboardItem
      ) {
        return clipboard.write([
          new window.ClipboardItem({
            "text/html": blobFromText(html, "text/html"),
            "text/plain": blobFromText(plainText, "text/plain")
          })
        ]).catch(function () {
          if (!fallbackCopyHtml(html, plainText)) {
            throw new Error("Clipboard write failed.");
          }
        });
      }

      return fallbackCopyHtml(html, plainText)
        ? Promise.resolve()
        : writeTextToClipboard(plainText);
    }

    function selectedWysiwygClipboardData(savedSelection) {
      var selection;
      var range;
      var container = document.createElement("div");

      wysiwygEditor.focus();
      restoreWysiwygSelection(savedSelection);
      selection = window.getSelection();
      range = selection && selection.rangeCount ? selection.getRangeAt(0) : null;
      if (!isSelectionInsideWysiwyg(range) || range.collapsed) {
        return {
          html: "",
          text: ""
        };
      }

      container.appendChild(range.cloneContents());
      return {
        html: container.innerHTML,
        text: selection.toString()
      };
    }

    function copySelectionToClipboard(savedSelection) {
      var text;
      var data;

      if ((savedSelection && savedSelection.mode === "markdown") || context.getActiveMode() === "markdown") {
        restoreTextareaSelection(savedSelection);
        text = selectedTextareaRange().text;
        return writeTextToClipboard(text);
      }

      data = selectedWysiwygClipboardData(savedSelection);
      return writeHtmlToClipboard(data.html, data.text);
    }

    function cutSelectionToClipboard(savedSelection) {
      if ((savedSelection && savedSelection.mode === "markdown") || context.getActiveMode() === "markdown") {
        restoreTextareaSelection(savedSelection);
        var range = selectedTextareaRange();
        if (!range.text) {
          return Promise.resolve();
        }

        return writeTextToClipboard(range.text).then(function () {
          markdownEditor.setRangeText("", range.start, range.end, "start");
          context.setMarkdown(markdownEditor.value, "textarea");
          markdownEditor.focus();
        });
      }

      return copySelectionToClipboard(savedSelection).then(function () {
        var selection;
        var range;

        wysiwygEditor.focus();
        restoreWysiwygSelection(savedSelection);
        selection = window.getSelection();
        range = selection && selection.rangeCount ? selection.getRangeAt(0) : null;
        if (!isSelectionInsideWysiwyg(range) || range.collapsed) {
          return;
        }

        range.deleteContents();
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
        context.scheduleSyncFromWysiwyg();
      });
    }

    function textFromHtml(html) {
      var container = document.createElement("div");
      container.innerHTML = String(html || "");
      return container.textContent || "";
    }

    function readClipboardData() {
      var clipboard = clipboardApi();

      if (clipboard && typeof clipboard.read === "function") {
        return clipboard.read().then(function (items) {
          var htmlPromise = Promise.resolve("");
          var textPromise = Promise.resolve("");

          items.some(function (item) {
            if (item.types && item.types.indexOf("text/html") !== -1) {
              htmlPromise = item.getType("text/html").then(function (blob) {
                return blob.text();
              });
            }

            if (item.types && item.types.indexOf("text/plain") !== -1) {
              textPromise = item.getType("text/plain").then(function (blob) {
                return blob.text();
              });
            }

            return item.types && (item.types.indexOf("text/html") !== -1 || item.types.indexOf("text/plain") !== -1);
          });

          return Promise.all([htmlPromise, textPromise]).then(function (values) {
            return {
              html: values[0] || "",
              text: values[1] || ""
            };
          });
        }).catch(function () {
          if (typeof clipboard.readText === "function") {
            return clipboard.readText().then(function (text) {
              return {
                html: "",
                text: text
              };
            });
          }
          throw new Error("Clipboard read failed.");
        });
      }

      if (clipboard && typeof clipboard.readText === "function") {
        return clipboard.readText().then(function (text) {
          return {
            html: "",
            text: text
          };
        });
      }

      return Promise.reject(new Error("Clipboard API is not available."));
    }

    function pasteFromClipboard(savedSelection) {
      return readClipboardData().then(function (data) {
        var text = data.text || (data.html ? textFromHtml(data.html) : "");

        if ((savedSelection && savedSelection.mode === "markdown") || context.getActiveMode() === "markdown") {
          insertTextIntoTextarea(text, savedSelection);
          return;
        }

        wysiwygEditor.focus();
        restoreWysiwygSelection(savedSelection);
        if (data.html) {
          insertHtmlAtSelection(ME.markdown.sanitizePastedHtml(data.html), savedSelection);
          return;
        }

        if (text) {
          document.execCommand("insertText", false, text);
          context.scheduleSyncFromWysiwyg();
        }
      });
    }

    function applyClipboardAction(action, savedSelection) {
      if (action === "copy") {
        return copySelectionToClipboard(savedSelection);
      }

      if (action === "cut") {
        return cutSelectionToClipboard(savedSelection);
      }

      if (action === "paste") {
        return pasteFromClipboard(savedSelection);
      }

      return Promise.resolve();
    }

    function insertHtmlAtSelection(html, savedSelection) {
      var selection;
      var range;

      wysiwygEditor.focus();
      restoreWysiwygSelection(savedSelection);
      selection = window.getSelection();
      range = selection && selection.rangeCount ? selection.getRangeAt(0) : null;

      if (shouldInsertHeadingHtmlAsText(range, html)) {
        document.execCommand("insertText", false, textFromHtml(html));
        context.scheduleSyncFromWysiwyg();
        return;
      }

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
      var captured;
      var selectionText;

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

      selectionText = selection.toString();
      captured = serializeWysiwygRangeToMarkdown(range, selectionText);
      return {
        captureMethod: captured.captureMethod,
        contentType: "text/markdown-fragment",
        mode: "wysiwyg",
        range: captured.replacementRange || range.cloneRange(),
        text: captured.text,
        value: captured.text
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
      applyClipboardAction: applyClipboardAction,
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
