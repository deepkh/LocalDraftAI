const assert = require("node:assert/strict");

global.window = {};

require("../../src/js/utils.js");
require("../../src/js/markdown.js");

const markdown = window.MarkdownEditor.markdown;

global.Node = {
  ELEMENT_NODE: 1,
  TEXT_NODE: 3
};

function runTest(name, callback) {
  try {
    callback();
    console.log("ok - " + name);
  } catch (error) {
    console.error("not ok - " + name);
    throw error;
  }
}

function textNode(value) {
  return {
    nodeType: Node.TEXT_NODE,
    nodeValue: value
  };
}

function elementNode(tagName, attributes, children) {
  const node = {
    childNodes: children || [],
    children: (children || []).filter((child) => child.nodeType === Node.ELEMENT_NODE),
    getAttribute(name) {
      return attributes && attributes[name] || "";
    },
    nodeType: Node.ELEMENT_NODE,
    parentElement: null,
    querySelector(selector) {
      if (selector !== "code[data-md-fence-info]") {
        return null;
      }

      return findNode(this, (child) => {
        return child.nodeType === Node.ELEMENT_NODE &&
          child.tagName.toLowerCase() === "code" &&
          Boolean(child.getAttribute("data-md-fence-info"));
      });
    },
    tagName: tagName.toUpperCase(),
    textContent: ""
  };

  node.childNodes.forEach((child) => {
    if (child.nodeType === Node.ELEMENT_NODE) {
      child.parentElement = node;
    }
  });
  node.textContent = node.childNodes.map((child) => child.textContent || child.nodeValue || "").join("");
  return node;
}

function findNode(node, predicate) {
  if (predicate(node)) {
    return node;
  }

  for (const child of node.childNodes || []) {
    const found = findNode(child, predicate);
    if (found) {
      return found;
    }
  }

  return null;
}

runTest("renders nested unordered lists from indented Markdown", function () {
  const html = markdown.renderMarkdown("- Parent\n  - Child\n- Next");

  assert.match(html, /<ul data-md-line="0"><li data-md-line="0">Parent<ul data-md-line="1"><li data-md-line="1">Child<\/li><\/ul><\/li><li data-md-line="2">Next<\/li><\/ul>/);
});

runTest("renders nested ordered lists from indented Markdown", function () {
  const html = markdown.renderMarkdown("1. Parent\n  1. Child\n2. Next");

  assert.match(html, /<ol data-md-line="0"><li data-md-line="0">Parent<ol data-md-line="1"><li data-md-line="1">Child<\/li><\/ol><\/li><li data-md-line="2">Next<\/li><\/ol>/);
});

runTest("renders Markdown thematic breaks as horizontal rules", function () {
  const html = markdown.renderMarkdown("Before\n\n---\n\nAfter");

  assert.match(html, /<p data-md-line="0"><span data-md-line="0">Before<\/span><\/p>\n<hr data-md-line="2">\n<p data-md-line="4"><span data-md-line="4">After<\/span><\/p>/);
});

runTest("splits paragraphs when a thematic break appears between lines", function () {
  const html = markdown.renderMarkdown("Before\n---\nAfter");

  assert.match(html, /<p data-md-line="0"><span data-md-line="0">Before<\/span><\/p>\n<hr data-md-line="1">\n<p data-md-line="2"><span data-md-line="2">After<\/span><\/p>/);
});

runTest("renders fenced code language info into data attributes", function () {
  const html = markdown.renderMarkdown("```bash\nnpm test\n```");

  assert.match(html, /<pre data-md-line="0" data-md-fence-info="bash"><code data-md-fence-info="bash">/);
});

runTest("converts rendered fenced code language info back to Markdown", function () {
  const code = elementNode("code", { "data-md-fence-info": "bash" }, [
    elementNode("span", {}, [textNode("npm test")])
  ]);
  const pre = elementNode("pre", { "data-md-fence-info": "bash" }, [code]);
  const root = elementNode("div", {}, [pre]);

  assert.equal(markdown.htmlToMarkdown(root), "```bash\nnpm test\n```");
});
