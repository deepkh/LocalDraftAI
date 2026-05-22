(function () {
  "use strict";

  var ME = window.MarkdownEditor = window.MarkdownEditor || {};

  var ACTIONS = {
    correctGrammar: {
      label: "Correct Grammar",
      promptType: "grammar",
      requiresSelection: true,
      prompt: [
        "You are editing Markdown text.",
        "",
        "Task:",
        "Correct grammar and spelling only.",
        "",
        "Rules:",
        "- Preserve Markdown structure.",
        "- Do not change code blocks.",
        "- Do not change inline code.",
        "- Do not change URLs.",
        "- Do not change image paths.",
        "- Do not change heading levels.",
        "- Return only the corrected Markdown."
      ].join("\n")
    },
    improveWording: {
      label: "Improve Wording",
      promptType: "improve_wording",
      requiresSelection: true,
      prompt: [
        "You are editing Markdown text.",
        "",
        "Task:",
        "Improve the wording and clarity of the selected text.",
        "",
        "Rules:",
        "- Keep the original meaning.",
        "- Keep the tone natural.",
        "- Preserve Markdown structure.",
        "- Do not modify code blocks, inline code, links, or image paths.",
        "- Return only the improved Markdown."
      ].join("\n")
    },
    makeProfessional: {
      label: "Make Professional",
      promptType: "professional",
      requiresSelection: true,
      prompt: [
        "You are editing Markdown text.",
        "",
        "Task:",
        "Rewrite the selected text in a professional technical documentation style.",
        "",
        "Rules:",
        "- Keep the original meaning.",
        "- Use clear and professional wording.",
        "- Preserve Markdown structure.",
        "- Do not modify code blocks, inline code, links, or image paths.",
        "- Return only the rewritten Markdown."
      ].join("\n")
    },
    summarize: {
      label: "Summarize",
      promptType: "summarize",
      requiresSelection: true,
      prompt: [
        "You are editing Markdown text.",
        "",
        "Task:",
        "Summarize the selected Markdown content.",
        "",
        "Rules:",
        "- Keep the result in Markdown format.",
        "- Preserve important technical details.",
        "- Prefer concise bullet points.",
        "- Do not invent new information.",
        "- Return only the summary."
      ].join("\n")
    },
    makeShorter: {
      label: "Make Shorter",
      promptType: "shorten",
      requiresSelection: true,
      prompt: [
        "You are editing Markdown text.",
        "",
        "Task:",
        "Make the selected text shorter.",
        "",
        "Rules:",
        "- Preserve the main meaning.",
        "- Remove unnecessary words.",
        "- Keep important technical details.",
        "- Preserve Markdown structure where possible.",
        "- Do not modify code blocks, inline code, links, or image paths.",
        "- Return only the shortened Markdown."
      ].join("\n")
    },
    beautifyMarkdown: {
      label: "Beautify Markdown",
      promptType: "beautify_markdown",
      requiresSelection: true,
      prompt: [
        "You are editing Markdown text.",
        "",
        "Task:",
        "Beautify Markdown formatting without changing meaning.",
        "",
        "Rules:",
        "- Preserve Markdown structure and content.",
        "- Normalize spacing and common Markdown markers.",
        "- Do not modify code blocks, inline code, links, or image paths.",
        "- Return only the beautified Markdown."
      ].join("\n")
    },
    fixMarkdownSyntax: {
      label: "Fix Markdown Syntax",
      promptType: "fix_markdown",
      requiresSelection: true,
      prompt: [
        "You are editing Markdown text.",
        "",
        "Task:",
        "Fix broken Markdown syntax.",
        "",
        "Rules:",
        "- Preserve the original meaning.",
        "- Repair common heading, list, quote, and fenced-code syntax.",
        "- Do not modify code block content, inline code, links, or image paths.",
        "- Return only the fixed Markdown."
      ].join("\n")
    }
  };

  var ACTION_GROUPS = [
    {
      label: "AI Assistant",
      actions: [
        "correctGrammar",
        "improveWording",
        "makeProfessional",
        "summarize",
        "makeShorter"
      ]
    },
    {
      label: "Markdown",
      actions: [
        "beautifyMarkdown",
        "fixMarkdownSyntax"
      ]
    }
  ];

  Object.keys(ACTIONS).forEach(function (actionId) {
    ACTIONS[actionId].id = actionId;
  });

  function get(actionId) {
    return ACTIONS[actionId] || null;
  }

  function groups() {
    return ACTION_GROUPS.map(function (group) {
      return {
        label: group.label,
        actions: group.actions.map(get).filter(Boolean)
      };
    });
  }

  function buildMessages(actionId, selectedText) {
    var action = get(actionId);

    if (!action) {
      throw new Error("Unknown AI action.");
    }

    return [
      {
        role: "system",
        content: action.prompt
      },
      {
        role: "user",
        content: "Selected Markdown:\n\n" + String(selectedText || "")
      }
    ];
  }

  ME.aiActions = {
    buildMessages: buildMessages,
    get: get,
    groups: groups
  };
}());
