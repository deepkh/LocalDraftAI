(function () {
  "use strict";

  var ME = window.MarkdownEditor = window.MarkdownEditor || {};
  var clamp = ME.utils.clamp;

  function createResizer(context) {
    var workspace = context.workspace;
    var paneResizer = context.paneResizer;

    function isWideLayout() {
      return window.matchMedia("(min-width: 941px)").matches;
    }

    function updateResizerValue(leftWidth) {
      var rect = workspace.getBoundingClientRect();
      var resizerWidth = paneResizer.offsetWidth || 12;
      var available = Math.max(rect.width - resizerWidth, 1);
      var percent = Math.round((leftWidth / available) * 100);

      paneResizer.setAttribute("aria-valuenow", String(clamp(percent, 25, 75)));
    }

    function setEditorWidth(leftWidth) {
      if (!context.isSplitView() || !isWideLayout()) {
        return;
      }

      var rect = workspace.getBoundingClientRect();
      var resizerWidth = paneResizer.offsetWidth || 12;
      var available = Math.max(rect.width - resizerWidth, 1);
      var minEditor = Math.min(320, available * 0.7);
      var minMarkdown = Math.min(320, available * 0.7);
      var minWidth = Math.min(minEditor, available * 0.45);
      var maxWidth = Math.max(minWidth, available - minMarkdown);
      var nextWidth = clamp(leftWidth, minWidth, maxWidth);

      workspace.style.setProperty("--editor-width", nextWidth + "px");
      updateResizerValue(nextWidth);
    }

    function resizeFromPointer(clientX) {
      var rect = workspace.getBoundingClientRect();
      setEditorWidth(clientX - rect.left);
    }

    function resizeByKeyboard(delta) {
      var rect = workspace.getBoundingClientRect();
      var currentWidth = workspace.querySelector(".wysiwyg-pane").getBoundingClientRect().width;
      var resizerWidth = paneResizer.offsetWidth || 12;

      if (delta === "home") {
        setEditorWidth((rect.width - resizerWidth) * 0.35);
      } else if (delta === "end") {
        setEditorWidth((rect.width - resizerWidth) * 0.65);
      } else {
        setEditorWidth(currentWidth + delta);
      }
    }

    function bindEvents() {
      paneResizer.addEventListener("pointerdown", function (event) {
        if (!context.isSplitView() || !isWideLayout()) {
          return;
        }

        event.preventDefault();
        paneResizer.setPointerCapture(event.pointerId);
        paneResizer.classList.add("is-dragging");
        document.body.classList.add("is-resizing");
        resizeFromPointer(event.clientX);
      });

      paneResizer.addEventListener("pointermove", function (event) {
        if (!paneResizer.classList.contains("is-dragging")) {
          return;
        }

        event.preventDefault();
        resizeFromPointer(event.clientX);
      });

      paneResizer.addEventListener("pointerup", function (event) {
        paneResizer.classList.remove("is-dragging");
        document.body.classList.remove("is-resizing");

        if (paneResizer.hasPointerCapture(event.pointerId)) {
          paneResizer.releasePointerCapture(event.pointerId);
        }
      });

      paneResizer.addEventListener("pointercancel", function (event) {
        paneResizer.classList.remove("is-dragging");
        document.body.classList.remove("is-resizing");

        if (paneResizer.hasPointerCapture(event.pointerId)) {
          paneResizer.releasePointerCapture(event.pointerId);
        }
      });

      paneResizer.addEventListener("keydown", function (event) {
        if (!context.isSplitView() || !isWideLayout()) {
          return;
        }

        if (event.key === "ArrowLeft") {
          event.preventDefault();
          resizeByKeyboard(-32);
        } else if (event.key === "ArrowRight") {
          event.preventDefault();
          resizeByKeyboard(32);
        } else if (event.key === "Home") {
          event.preventDefault();
          resizeByKeyboard("home");
        } else if (event.key === "End") {
          event.preventDefault();
          resizeByKeyboard("end");
        }
      });
    }

    return {
      bindEvents: bindEvents,
      updateValue: updateResizerValue
    };
  }

  ME.resizer = {
    create: createResizer
  };
}());
