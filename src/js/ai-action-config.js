(function () {
  "use strict";

  var ME = window.MarkdownEditor = window.MarkdownEditor || {};
  var defaults = ME.aiActionDefaults;
  var REASONING_MODES = ["auto", "off", "low", "medium", "high", "xhigh"];
  var OUTPUT_MODES = ["replace-selection", "insert-after-selection", "show-only"];
  var currentConfig = null;
  var currentYaml = defaults ? defaults.defaultYaml : "";
  var loadPromise = null;
  var warning = "";

  function parser() {
    return window.jsyaml;
  }

  function configError(message) {
    var error = new Error(message);
    error.name = "AIActionConfigError";
    return error;
  }

  function parseYaml(yamlText) {
    var value;

    if (!parser() || typeof parser().load !== "function") {
      throw configError("The local YAML parser is unavailable. Reload the app and try again.");
    }

    try {
      value = parser().load(String(yamlText || ""));
    } catch (error) {
      throw configError("YAML parse error: " + error.message);
    }

    return value;
  }

  function validateConfig(config) {
    var ids = Object.create(null);

    if (!config || typeof config !== "object" || Array.isArray(config)) {
      throw configError("AI Actions config must be a YAML object.");
    }
    if (typeof config.version !== "number" || !Number.isFinite(config.version)) {
      throw configError("Config field 'version' must be a number.");
    }
    if (!Array.isArray(config.actions)) {
      throw configError("Config field 'actions' must be an array.");
    }

    config.actions.forEach(function (action, index) {
      var prefix = "Action " + (index + 1);
      var id;
      var reasoningMode;

      if (!action || typeof action !== "object" || Array.isArray(action)) {
        throw configError(prefix + " must be an object.");
      }

      id = String(action.id || "").trim();
      if (!id) {
        throw configError(prefix + " is missing required field 'id'.");
      }
      if (ids[id]) {
        throw configError("Duplicate action id: " + id + ".");
      }
      ids[id] = true;

      if (!String(action.label || "").trim()) {
        throw configError("Action '" + id + "' is missing required field 'label'.");
      }
      if (!String(action.prompt || "").trim()) {
        throw configError("Action '" + id + "' is missing required field 'prompt'.");
      }

      reasoningMode = action.reasoningDefault === undefined ? "low" : String(action.reasoningDefault).toLowerCase();
      if (REASONING_MODES.indexOf(reasoningMode) === -1) {
        throw configError("Action '" + id + "' has invalid reasoningDefault '" + action.reasoningDefault + "'.");
      }
      if (action.outputMode !== undefined && OUTPUT_MODES.indexOf(String(action.outputMode)) === -1) {
        throw configError("Action '" + id + "' has invalid outputMode '" + action.outputMode + "'.");
      }
    });

    return config;
  }

  function normalizeConfig(config) {
    return Object.assign({}, config, {
      actions: config.actions.map(function (action) {
        return Object.assign({}, action, {
          category: String(action.category || "Custom").trim() || "Custom",
          enabled: action.enabled !== false,
          id: String(action.id).trim(),
          inputMode: String(action.inputMode || "selection"),
          label: String(action.label).trim(),
          outputMode: String(action.outputMode || "replace-selection"),
          prompt: String(action.prompt),
          promptType: String(action.promptType || action.id),
          reasoningDefault: String(action.reasoningDefault || "low").toLowerCase(),
          requiresSelection: action.requiresSelection !== false
        });
      })
    });
  }

  function dumpYaml(config) {
    validateConfig(config);
    if (!parser() || typeof parser().dump !== "function") {
      throw configError("The local YAML parser is unavailable. Reload the app and try again.");
    }
    return parser().dump(config, {
      lineWidth: 100,
      noRefs: true
    });
  }

  function dispatchChanged() {
    if (typeof window.dispatchEvent !== "function") {
      return;
    }
    if (typeof window.CustomEvent === "function") {
      window.dispatchEvent(new window.CustomEvent("localdraftai:ai-actions-changed"));
    }
  }

  function reloadFromYaml(yamlText) {
    var parsed = parseYaml(yamlText);
    validateConfig(parsed);
    currentConfig = normalizeConfig(parsed);
    currentYaml = String(yamlText);
    warning = "";
    dispatchChanged();
    return currentConfig;
  }

  function get(actionId) {
    var actions = currentConfig && currentConfig.actions || [];
    return actions.filter(function (action) {
      return action.id === actionId;
    })[0] || null;
  }

  function groups() {
    var grouped = [];
    var byLabel = Object.create(null);

    (currentConfig && currentConfig.actions || []).forEach(function (action) {
      var group;
      if (!action.enabled) {
        return;
      }
      group = byLabel[action.category];
      if (!group) {
        group = { label: action.category, actions: [] };
        byLabel[action.category] = group;
        grouped.push(group);
      }
      group.actions.push(action);
    });

    return grouped;
  }

  function renderPrompt(action, context) {
    var values = context || {};
    return String(action && action.prompt || "").replace(/\{\{(selection|document|documentTitle|userPrompt)\}\}/g, function (match, key) {
      return values[key] === undefined || values[key] === null ? "" : String(values[key]);
    });
  }

  function buildMessages(actionId, selectedText, context) {
    var action = get(actionId);
    var promptContext = Object.assign({}, context || {}, { selection: String(selectedText || "") });

    if (!action) {
      throw new Error("Unknown AI action.");
    }

    return [
      { role: "system", content: renderPrompt(action, promptContext) },
      { role: "user", content: "Selected Markdown:\n\n" + String(selectedText || "") }
    ];
  }

  function defaultReasoningMode(actionId) {
    var action = get(actionId);
    return action ? action.reasoningDefault : "low";
  }

  async function load() {
    if (loadPromise) {
      return loadPromise;
    }

    loadPromise = (async function () {
      var yamlText;
      var lastGood;

      try {
        yamlText = ME.aiActionConfigStore
          ? await ME.aiActionConfigStore.loadYaml()
          : defaults.defaultYaml;
        return reloadFromYaml(yamlText);
      } catch (error) {
        warning = error.message;
        console.warn("LocalDraftAI could not load the saved AI Actions config.", error);
      }

      try {
        lastGood = ME.aiActionConfigStore && await ME.aiActionConfigStore.loadLastGoodYaml();
        if (lastGood) {
          reloadFromYaml(lastGood);
          warning = "The saved AI Actions YAML was invalid. The last good config was restored.";
          return currentConfig;
        }
      } catch (lastGoodError) {
        console.warn("LocalDraftAI could not load the last good AI Actions config.", lastGoodError);
      }

      reloadFromYaml(defaults.defaultYaml);
      warning = "The saved AI Actions YAML could not be loaded. Defaults are active.";
      return currentConfig;
    }());

    return loadPromise;
  }

  ME.aiActionConfig = {
    buildMessages: buildMessages,
    currentYaml: function () { return currentYaml; },
    defaultReasoningMode: defaultReasoningMode,
    dumpYaml: dumpYaml,
    get: get,
    groups: groups,
    load: load,
    normalizeConfig: normalizeConfig,
    parseYaml: parseYaml,
    reloadFromYaml: reloadFromYaml,
    renderPrompt: renderPrompt,
    validateConfig: validateConfig,
    warning: function () { return warning; }
  };

  try {
    reloadFromYaml(currentYaml);
  } catch (error) {
    warning = error.message;
    console.warn("LocalDraftAI AI Actions defaults could not be parsed.", error);
  }
}());
