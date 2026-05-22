(function () {
  "use strict";

  var ME = window.MarkdownEditor = window.MarkdownEditor || {};

  function restoreTokens(value, tokens) {
    return String(value || "").replace(/\u0000AITOKEN(\d+)\u0000/g, function (match, index) {
      return tokens[Number(index)] || match;
    });
  }

  function protectMarkdownRanges(value, transform) {
    var tokens = [];
    var text = String(value || "");

    function save(match) {
      var token = "\u0000AITOKEN" + tokens.length + "\u0000";
      tokens.push(match);
      return token;
    }

    text = text.replace(/(^|\n)```[^\n]*(?:\n(?!```)[^\n]*)*(?:\n```[^\n]*)?/g, save);
    text = text.replace(/`[^`\n]*`/g, save);
    text = text.replace(/!?\[[^\]\n]*\]\([^)]+\)/g, save);
    text = text.replace(/\b(?:https?|mailto):[^\s)]+/g, save);

    return restoreTokens(transform(text), tokens);
  }

  function preserveCase(source, replacement) {
    if (source === source.toUpperCase()) {
      return replacement.toUpperCase();
    }

    if (source.charAt(0) === source.charAt(0).toUpperCase()) {
      return replacement.charAt(0).toUpperCase() + replacement.slice(1);
    }

    return replacement;
  }

  function replaceWord(value, word, replacement) {
    return value.replace(new RegExp("\\b" + word + "\\b", "gi"), function (match) {
      return preserveCase(match, replacement);
    });
  }

  function correctGrammar(value) {
    return protectMarkdownRanges(value, function (text) {
      var result = text;

      result = replaceWord(result, "teh", "the");
      result = replaceWord(result, "recieve", "receive");
      result = replaceWord(result, "seperate", "separate");
      result = replaceWord(result, "occured", "occurred");
      result = replaceWord(result, "wich", "which");
      result = replaceWord(result, "dont", "do not");
      result = replaceWord(result, "cant", "cannot");
      result = result.replace(/\bi\b/g, "I");
      result = result.replace(/[ \t]+([,.;:!?])/g, "$1");
      result = result.replace(/([.!?]) {2,}/g, "$1 ");

      return result;
    });
  }

  function improveWording(value) {
    return protectMarkdownRanges(correctGrammar(value), function (text) {
      return text
        .replace(/\bis used to\b/gi, "helps")
        .replace(/\bmake markdown better\b/gi, "improve Markdown")
        .replace(/\bfix wrong things\b/gi, "fix common issues")
        .replace(/\bbad markdown\b/gi, "invalid Markdown")
        .replace(/\ba lot of\b/gi, "many")
        .replace(/\bin order to\b/gi, "to");
    });
  }

  function makeProfessional(value) {
    return protectMarkdownRanges(improveWording(value), function (text) {
      return text
        .replace(/\buseful\b/gi, "valuable")
        .replace(/\bfix\b/gi, "resolve")
        .replace(/\bget\b/gi, "receive")
        .replace(/\bshow\b/gi, "display")
        .replace(/\bmake sure\b/gi, "ensure");
    });
  }

  function stripMarkdownMarkers(value) {
    return String(value || "")
      .replace(/^#{1,6}\s+/gm, "")
      .replace(/^>\s?/gm, "")
      .replace(/^\s*[-*+]\s+/gm, "")
      .replace(/^\s*\d+[.)]\s+/gm, "")
      .replace(/(\*\*|__)(.*?)\1/g, "$2")
      .replace(/(^|[^\w*])\*([^*\n]+)\*/g, "$1$2")
      .replace(/(^|[^\w_])_([^_\n]+)_/g, "$1$2")
      .replace(/`([^`\n]+)`/g, "$1")
      .replace(/\[([^\]\n]+)\]\([^)]+\)/g, "$1");
  }

  function sentenceCandidates(value) {
    var compact = stripMarkdownMarkers(value)
      .replace(/\s+/g, " ")
      .trim();

    if (!compact) {
      return [];
    }

    return (compact.match(/[^.!?]+[.!?]?/g) || []).filter(function (item) {
      return item.trim().length > 0;
    });
  }

  function summarize(value) {
    var lines = String(value || "").split("\n").filter(function (line) {
      return line.trim();
    });
    var bullets = lines.filter(function (line) {
      return /^\s*(?:[-*+]|\d+[.)])\s+/.test(line);
    }).slice(0, 3).map(function (line) {
      return line.replace(/^\s*(?:[-*+]|\d+[.)])\s+/, "").trim();
    });

    if (!bullets.length) {
      bullets = sentenceCandidates(value).slice(0, 3);
    }

    if (!bullets.length) {
      return "";
    }

    return bullets.map(function (item) {
      return "- " + item.replace(/\s+/g, " ").trim();
    }).join("\n");
  }

  function makeShorter(value) {
    return protectMarkdownRanges(improveWording(value), function (text) {
      return text
        .replace(/\bThis feature allows the user to\b/gi, "Users can")
        .replace(/\bThis feature lets users\b/gi, "Users can")
        .replace(/\bwith better grammar and cleaner wording\b/gi, "with cleaner grammar and wording")
        .replace(/\bvery\b/gi, "")
        .replace(/\breally\b/gi, "")
        .replace(/\bcurrently\b/gi, "")
        .replace(/\s{2,}/g, " ")
        .replace(/[ \t]+\n/g, "\n")
        .trim();
    });
  }

  function beautifyMarkdown(value) {
    return String(value || "")
      .replace(/\r\n?/g, "\n")
      .split("\n")
      .map(function (line) {
        return line
          .replace(/[ \t]+$/g, "")
          .replace(/^(#{1,6})([^\s#])/g, "$1 $2")
          .replace(/^(\s*)[*+]\s+/g, "$1- ")
          .replace(/^(\s*)>\s*/g, "$1> ");
      })
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function fixMarkdownSyntax(value) {
    var text = beautifyMarkdown(value);
    var fenceCount = (text.match(/^```/gm) || []).length;

    if (fenceCount % 2 === 1) {
      text += "\n```";
    }

    return text;
  }

  function runAction(actionId, value) {
    if (actionId === "correctGrammar") {
      return correctGrammar(value);
    }

    if (actionId === "improveWording") {
      return improveWording(value);
    }

    if (actionId === "makeProfessional") {
      return makeProfessional(value);
    }

    if (actionId === "summarize") {
      return summarize(value);
    }

    if (actionId === "makeShorter") {
      return makeShorter(value);
    }

    if (actionId === "beautifyMarkdown") {
      return beautifyMarkdown(value);
    }

    if (actionId === "fixMarkdownSyntax") {
      return fixMarkdownSyntax(value);
    }

    return String(value || "");
  }

  ME.markdownRepair = {
    runAction: runAction
  };
}());
