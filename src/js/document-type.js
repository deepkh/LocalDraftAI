(function () {
  "use strict";

  var ME = window.MarkdownEditor = window.MarkdownEditor || {};

  var DOCUMENT_TYPES = [
    {
      id: "markdown",
      label: "Markdown",
      indicator: "MD",
      extensions: [".md", ".markdown"],
      mimeTypes: ["text/markdown"],
      allowWysiwyg: true,
      allowFormattingToolbar: true,
      allowMarkdownCommands: true,
      allowAiReplacement: true,
      validationType: null,
      defaultExtension: ".md"
    },
    {
      id: "text",
      label: "Plain Text",
      indicator: "TXT",
      extensions: [".txt", ".log"],
      mimeTypes: ["text/plain"],
      allowWysiwyg: false,
      allowFormattingToolbar: false,
      allowMarkdownCommands: false,
      allowAiReplacement: true,
      validationType: null,
      defaultExtension: ".txt"
    },
    {
      id: "json",
      label: "JSON",
      indicator: "{}",
      extensions: [".json"],
      mimeTypes: ["application/json"],
      allowWysiwyg: false,
      allowFormattingToolbar: false,
      allowMarkdownCommands: false,
      allowAiReplacement: false,
      validationType: "json",
      defaultExtension: ".json"
    },
    {
      id: "yaml",
      label: "YAML",
      indicator: "YML",
      extensions: [".yml", ".yaml"],
      mimeTypes: ["text/plain"],
      allowWysiwyg: false,
      allowFormattingToolbar: false,
      allowMarkdownCommands: false,
      allowAiReplacement: false,
      validationType: "yaml",
      defaultExtension: ".yml"
    }
  ];

  function cloneDescriptor(descriptor) {
    if (!descriptor) {
      return null;
    }

    return {
      id: descriptor.id,
      label: descriptor.label,
      indicator: descriptor.indicator,
      extensions: descriptor.extensions.slice(),
      mimeTypes: descriptor.mimeTypes.slice(),
      allowWysiwyg: descriptor.allowWysiwyg,
      allowFormattingToolbar: descriptor.allowFormattingToolbar,
      allowMarkdownCommands: descriptor.allowMarkdownCommands,
      allowAiReplacement: descriptor.allowAiReplacement,
      validationType: descriptor.validationType,
      defaultExtension: descriptor.defaultExtension
    };
  }

  function extensionForName(fileName) {
    var match = String(fileName || "").trim().match(/(\.[^./\\]+)$/);

    return match ? match[1].toLowerCase() : "";
  }

  function getDocumentTypeById(typeId) {
    var normalizedId = String(typeId || "").toLowerCase();
    var descriptor = DOCUMENT_TYPES.find(function (candidate) {
      return candidate.id === normalizedId;
    });

    return cloneDescriptor(descriptor);
  }

  function getDocumentTypeForName(fileName) {
    var extension = extensionForName(fileName);
    var descriptor = DOCUMENT_TYPES.find(function (candidate) {
      return candidate.extensions.indexOf(extension) !== -1;
    });

    return cloneDescriptor(descriptor);
  }

  function isSupportedFileName(fileName) {
    return Boolean(getDocumentTypeForName(fileName));
  }

  function getSupportedExtensions() {
    return DOCUMENT_TYPES.reduce(function (extensions, descriptor) {
      return extensions.concat(descriptor.extensions);
    }, []);
  }

  function getFilePickerTypes() {
    var accept = {};

    DOCUMENT_TYPES.forEach(function (descriptor) {
      descriptor.mimeTypes.forEach(function (mimeType) {
        accept[mimeType] = (accept[mimeType] || []).concat(descriptor.extensions.filter(function (extension) {
          return (accept[mimeType] || []).indexOf(extension) === -1;
        }));
      });
    });

    return [{
      description: "Markdown and plain-text documents",
      accept: accept
    }];
  }

  function getDefaultFileName(typeId) {
    var descriptor = getDocumentTypeById(typeId) || getDocumentTypeById("markdown");

    return "Untitled" + descriptor.defaultExtension;
  }

  function allowsWysiwyg(typeId) {
    var descriptor = getDocumentTypeById(typeId);

    return Boolean(descriptor && descriptor.allowWysiwyg);
  }

  function allowsMarkdownCommands(typeId) {
    var descriptor = getDocumentTypeById(typeId);

    return Boolean(descriptor && descriptor.allowMarkdownCommands);
  }

  function allowsFormattingToolbar(typeId) {
    var descriptor = getDocumentTypeById(typeId);

    return Boolean(descriptor && descriptor.allowFormattingToolbar);
  }

  function allowsAiReplacement(typeId) {
    var descriptor = getDocumentTypeById(typeId);

    return Boolean(descriptor && descriptor.allowAiReplacement);
  }

  ME.documentType = {
    allowsAiReplacement: allowsAiReplacement,
    allowsFormattingToolbar: allowsFormattingToolbar,
    allowsMarkdownCommands: allowsMarkdownCommands,
    allowsWysiwyg: allowsWysiwyg,
    extensionForName: extensionForName,
    getDefaultFileName: getDefaultFileName,
    getDocumentTypeById: getDocumentTypeById,
    getDocumentTypeForName: getDocumentTypeForName,
    getFilePickerTypes: getFilePickerTypes,
    getSupportedExtensions: getSupportedExtensions,
    isSupportedFileName: isSupportedFileName
  };
}());
