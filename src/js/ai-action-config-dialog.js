(function () {
  "use strict";

  var ME = window.MarkdownEditor = window.MarkdownEditor || {};

  function createDialog(context) {
    var overlay = context.overlay;
    var dialog = context.dialog;
    var editor = context.editor;
    var status = context.status;
    var importInput = context.importInput;
    var busy = false;

    function setStatus(message, type) {
      status.textContent = message || "";
      status.dataset.status = type || "";
    }

    function validate() {
      var config = ME.aiActionConfig.parseYaml(editor.value);
      var enabled;
      var disabled;

      ME.aiActionConfig.validateConfig(config);
      enabled = config.actions.filter(function (action) { return action.enabled !== false; }).length;
      disabled = config.actions.length - enabled;
      setStatus("Valid AI Actions config. " + enabled + " enabled actions, " + disabled + " disabled actions.", "success");
      return config;
    }

    function showError(error) {
      setStatus(error && error.message ? error.message : "Could not update AI Actions.", "error");
    }

    function open() {
      var configWarning = ME.aiActionConfig.warning();
      var storageWarning = ME.aiActionConfigStore.warning();

      editor.value = ME.aiActionConfig.currentYaml() || ME.aiActionDefaults.defaultYaml;
      overlay.hidden = false;
      setStatus(
        configWarning || storageWarning || "Changes are stored locally in this browser.",
        configWarning || storageWarning ? "error" : "info"
      );
      window.requestAnimationFrame(function () { editor.focus(); });
    }

    function close() {
      if (busy) {
        return;
      }
      overlay.hidden = true;
      if (context.focusAfterClose) {
        context.focusAfterClose();
      }
    }

    async function save() {
      var yamlText = editor.value;

      try {
        validate();
        busy = true;
        setStatus("Saving AI Actions config.", "info");
        await ME.aiActionConfigStore.saveYaml(yamlText);
        ME.aiActionConfig.reloadFromYaml(yamlText);
        setStatus("AI Actions config saved. Menus have been updated.", "success");
      } catch (error) {
        showError(error);
      } finally {
        busy = false;
      }
    }

    async function exportYaml() {
      var blob;
      var url;
      var link;

      try {
        validate();
        blob = new Blob([editor.value], { type: "text/yaml;charset=utf-8" });
        url = URL.createObjectURL(blob);
        link = document.createElement("a");
        link.href = url;
        link.download = "localdraft-ai-actions.yml";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        setStatus("AI Actions YAML exported.", "success");
      } catch (error) {
        showError(error);
      }
    }

    async function importYaml() {
      var file = importInput.files && importInput.files[0];
      try {
        editor.value = await ME.aiActionConfigStore.importYaml(file);
        setStatus("YAML imported. Click Save to apply.", "success");
      } catch (error) {
        showError(error);
      } finally {
        importInput.value = "";
      }
    }

    function resetDefaults() {
      if (!window.confirm("Replace the editor contents with the default AI Actions YAML? Changes are not applied until you click Save.")) {
        return;
      }
      editor.value = ME.aiActionDefaults.defaultYaml;
      setStatus("Defaults loaded. Click Save to apply.", "success");
    }

    function handleEscape(event) {
      if (event.key === "Escape" && !overlay.hidden) {
        event.preventDefault();
        close();
      }
    }

    function bindEvents() {
      context.validateButton.addEventListener("click", function () {
        try { validate(); } catch (error) { showError(error); }
      });
      context.saveButton.addEventListener("click", save);
      context.exportButton.addEventListener("click", exportYaml);
      context.importButton.addEventListener("click", function () { importInput.click(); });
      importInput.addEventListener("change", importYaml);
      context.resetButton.addEventListener("click", resetDefaults);
      context.cancelButton.addEventListener("click", close);
      context.closeButton.addEventListener("click", close);
      overlay.addEventListener("click", function (event) {
        if (event.target === overlay) {
          close();
        }
      });
      document.addEventListener("keydown", handleEscape);
    }

    return {
      bindEvents: bindEvents,
      close: close,
      isOpen: function () { return !overlay.hidden; },
      open: open,
      validate: validate
    };
  }

  ME.aiActionConfigDialog = {
    create: createDialog
  };
}());
