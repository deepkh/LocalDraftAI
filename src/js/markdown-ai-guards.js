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
    return Boolean(range && range.end > range.start && String(range.text || "").trim());
  }

  function canUseMarkdownSelection(mode, range) {
    return mode === "markdown" && hasTextSelection(range);
  }

  function canShowContextMenu(options) {
    options = options || {};

    return Boolean(
      options.event &&
      options.event.target === options.textarea &&
      canUseMarkdownSelection(options.mode, options.range)
    );
  }

  ME.markdownAiGuards = {
    canShowContextMenu: canShowContextMenu,
    canUseMarkdownSelection: canUseMarkdownSelection,
    hasTextSelection: hasTextSelection,
    selectedRange: selectedRange
  };
}());
