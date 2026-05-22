(function () {
  "use strict";

  var ME = window.MarkdownEditor = window.MarkdownEditor || {};

  function selectedRange(textarea) {
    var start;
    var end;

    if (!textarea || typeof textarea.selectionStart !== "number" || typeof textarea.selectionEnd !== "number") {
      return null;
    }

    start = textarea.selectionStart;
    end = textarea.selectionEnd;

    return {
      start: start,
      end: end,
      text: textarea.value.slice(start, end)
    };
  }

  function hasTextSelection(range) {
    if (!range) {
      return false;
    }

    if (range.mode === "wysiwyg") {
      return Boolean(String(range.text || "").trim());
    }

    return Boolean(range.end > range.start && String(range.text || "").trim());
  }

  function canUseAiSelection(mode, range) {
    return (mode === "markdown" || mode === "wysiwyg") && hasTextSelection(range);
  }

  function canUseMarkdownSelection(mode, range) {
    return canUseAiSelection(mode, range);
  }

  function canShowContextMenu(options) {
    options = options || {};

    return Boolean(
      options.event &&
      canUseAiSelection(options.mode, options.range) &&
      (
        (options.mode === "markdown" && options.event.target === options.textarea) ||
        (options.mode === "wysiwyg" && options.editor && options.editor.contains(options.event.target))
      )
    );
  }

  ME.markdownAiGuards = {
    canUseAiSelection: canUseAiSelection,
    canShowContextMenu: canShowContextMenu,
    canUseMarkdownSelection: canUseMarkdownSelection,
    hasTextSelection: hasTextSelection,
    selectedRange: selectedRange
  };
}());
