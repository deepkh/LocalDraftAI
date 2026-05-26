(function () {
  "use strict";

  var ME = window.MarkdownEditor = window.MarkdownEditor || {};
  var DEFAULT_REASONING = {
    enabled: true,
    effort: "medium",
    showSummary: false,
    tokenBudget: 2048
  };
  var EFFORTS = ["off", "minimal", "low", "medium", "high", "xhigh"];

  function boolValue(value, fallback) {
    if (value === true || value === "true") {
      return true;
    }

    if (value === false || value === "false") {
      return false;
    }

    return fallback;
  }

  function effortValue(value) {
    var effort = String(value || DEFAULT_REASONING.effort).toLowerCase();

    return EFFORTS.indexOf(effort) > -1 ? effort : DEFAULT_REASONING.effort;
  }

  function tokenBudgetValue(value) {
    var parsed = Number(value);

    if (!Number.isFinite(parsed) || parsed <= 0) {
      return DEFAULT_REASONING.tokenBudget;
    }

    return Math.max(128, Math.floor(parsed));
  }

  function normalize(reasoning) {
    var source = reasoning || {};
    var effort = effortValue(source.effort);
    var enabled = boolValue(source.enabled, DEFAULT_REASONING.enabled);

    if (effort === "off") {
      enabled = false;
    }

    return {
      enabled: enabled,
      effort: enabled ? effort : "off",
      showSummary: boolValue(source.showSummary, DEFAULT_REASONING.showSummary),
      tokenBudget: tokenBudgetValue(source.tokenBudget)
    };
  }

  function providerEffort(reasoning, options) {
    var normalized = normalize(reasoning);
    var effort = normalized.effort;

    if (!normalized.enabled) {
      return "off";
    }

    options = options || {};

    if (effort === "minimal" && options.minimalAs) {
      return options.minimalAs;
    }

    if (effort === "xhigh" && options.xhighAs) {
      return options.xhighAs;
    }

    if (options.allowed && options.allowed.indexOf(effort) === -1) {
      if (effort === "xhigh" && options.allowed.indexOf("high") > -1) {
        return "high";
      }

      if (effort === "minimal" && options.allowed.indexOf("low") > -1) {
        return "low";
      }

      return options.allowed[0] || "medium";
    }

    return effort;
  }

  function openAiReasoning(reasoning) {
    var normalized = normalize(reasoning);
    var payload;

    if (!normalized.enabled) {
      return null;
    }

    payload = {
      effort: providerEffort(normalized, {
        allowed: ["minimal", "low", "medium", "high", "xhigh"]
      })
    };

    if (normalized.showSummary) {
      payload.summary = "auto";
    }

    return payload;
  }

  function openAiCompatibleReasoningEffort(reasoning) {
    var normalized = normalize(reasoning);

    if (!normalized.enabled) {
      return "";
    }

    return providerEffort(normalized, {
      allowed: ["low", "medium", "high"],
      minimalAs: "low",
      xhighAs: "high"
    });
  }

  function ollamaThink(reasoning) {
    var normalized = normalize(reasoning);

    if (!normalized.enabled) {
      return false;
    }

    return providerEffort(normalized, {
      allowed: ["low", "medium", "high"],
      minimalAs: "low",
      xhighAs: "high"
    });
  }

  function claudeThinking(reasoning) {
    var normalized = normalize(reasoning);

    if (!normalized.enabled) {
      return null;
    }

    return {
      type: "adaptive",
      effort: providerEffort(normalized, {
        allowed: ["low", "medium", "high"],
        minimalAs: "low",
        xhighAs: "high"
      })
    };
  }

  function geminiThinkingConfig(model, reasoning) {
    var normalized = normalize(reasoning);
    var effort;
    var config;

    if (!normalized.enabled) {
      return null;
    }

    effort = providerEffort(normalized, {
      allowed: ["minimal", "low", "medium", "high"],
      xhighAs: "high"
    });

    if (/gemini-?2\.5/i.test(String(model || ""))) {
      config = {
        thinking_budget: normalized.tokenBudget || -1
      };
    } else {
      config = {
        thinking_level: effort
      };
    }

    if (normalized.showSummary) {
      config.include_thoughts = true;
    }

    return config;
  }

  function label(reasoning) {
    var normalized = normalize(reasoning);

    if (!normalized.enabled) {
      return "Off";
    }

    return {
      minimal: "Minimal",
      low: "Low",
      medium: "Medium",
      high: "High",
      xhigh: "Extra High"
    }[normalized.effort] || "Medium";
  }

  ME.aiReasoning = {
    DEFAULT_REASONING: DEFAULT_REASONING,
    EFFORTS: EFFORTS.slice(),
    claudeThinking: claudeThinking,
    geminiThinkingConfig: geminiThinkingConfig,
    label: label,
    normalize: normalize,
    ollamaThink: ollamaThink,
    openAiCompatibleReasoningEffort: openAiCompatibleReasoningEffort,
    openAiReasoning: openAiReasoning,
    providerEffort: providerEffort
  };
}());
