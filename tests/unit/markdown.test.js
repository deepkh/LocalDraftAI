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

  assert.match(html, /<p data-md-line="0"><span data-md-line="0">Before<\/span><\/p><hr data-md-line="2"><p data-md-line="4"><span data-md-line="4">After<\/span><\/p>/);
});

runTest("renders adjacent Markdown blocks without whitespace text nodes", function () {
  const html = markdown.renderMarkdown("# Heading 1\nText\n- 1");

  assert.equal(html, '<h1 data-md-line="0" data-md-heading-level="1">Heading 1</h1><p data-md-line="1"><span data-md-line="1">Text</span></p><ul data-md-line="2"><li data-md-line="2">1</li></ul>');
});

runTest("splits paragraphs when a thematic break appears between lines", function () {
  const html = markdown.renderMarkdown("Before\n---\nAfter");

  assert.match(html, /<p data-md-line="0"><span data-md-line="0">Before<\/span><\/p><hr data-md-line="1"><p data-md-line="2"><span data-md-line="2">After<\/span><\/p>/);
});

runTest("renders fenced code language info into data attributes", function () {
  const html = markdown.renderMarkdown("```bash\nnpm test\n```");

  assert.match(html, /<pre data-md-line="0" data-md-fence-info="bash"><code data-md-fence-info="bash">/);
});

runTest("renders Markdown pipe tables", function () {
  const html = markdown.renderMarkdown("| Name | Role |\n| --- | --- |\n| Garry | Developer |");

  assert.match(html, /<table class="md-table"/);
  assert.match(html, /<thead><tr[^>]*><th>Name<\/th><th>Role<\/th><\/tr><\/thead>/);
  assert.match(html, /<tbody><tr[^>]*><td>Garry<\/td><td>Developer<\/td><\/tr><\/tbody>/);
});

runTest("renders tables without outer pipes and normalizes uneven rows", function () {
  const html = markdown.renderMarkdown("Name | Role\n--- | ---\n| Garry |\nAda | Developer | Extra");

  assert.match(html, /<table class="md-table"/);
  assert.match(html, /<tr[^>]*><td>Garry<\/td><td><\/td><\/tr>/);
  assert.match(html, /<tr[^>]*><td>Ada<\/td><td>Developer<\/td><\/tr>/);
  assert.doesNotMatch(html, /Extra/);
});

runTest("renders table column alignment", function () {
  const html = markdown.renderMarkdown("| Left | Center | Right |\n| :--- | :---: | ---: |\n| A | B | C |");

  assert.match(html, /md-table-align-left/);
  assert.match(html, /md-table-align-center/);
  assert.match(html, /md-table-align-right/);
});

runTest("keeps escaped pipes inside one table cell", function () {
  const html = markdown.renderMarkdown("| Text |\n| --- |\n| A \\| B |");

  assert.match(html, /<td>A \| B<\/td>/);
  assert.equal((html.match(/<td/g) || []).length, 1);
});

runTest("keeps inline code pipes inside one table cell", function () {
  const html = markdown.renderMarkdown("| Code |\n| --- |\n| `a | b` |");

  assert.match(html, /<td><code>a \| b<\/code><\/td>/);
  assert.equal((html.match(/<td/g) || []).length, 1);
});

runTest("does not parse pipe text without a delimiter row as a table", function () {
  const html = markdown.renderMarkdown("A | B\nnot a delimiter");

  assert.doesNotMatch(html, /<table/);
  assert.match(html, /<p/);
});

runTest("does not parse table syntax inside fenced code blocks", function () {
  const html = markdown.renderMarkdown("```\n| A | B |\n| --- | --- |\n```");

  assert.doesNotMatch(html, /<table/);
  assert.match(html, /<pre/);
});

runTest("converts rendered fenced code language info back to Markdown", function () {
  const code = elementNode("code", { "data-md-fence-info": "bash" }, [
    elementNode("span", {}, [textNode("npm test")])
  ]);
  const pre = elementNode("pre", { "data-md-fence-info": "bash" }, [code]);
  const root = elementNode("div", {}, [pre]);

  assert.equal(markdown.htmlToMarkdown(root), "```bash\nnpm test\n```");
});

runTest("converts HTML tables back to Markdown pipe tables", function () {
  const table = elementNode("table", {}, [
    elementNode("thead", {}, [
      elementNode("tr", {}, [
        elementNode("th", {}, [textNode("Name")]),
        elementNode("th", {}, [textNode("Role")])
      ])
    ]),
    elementNode("tbody", {}, [
      elementNode("tr", {}, [
        elementNode("td", {}, [textNode("Garry")]),
        elementNode("td", {}, [textNode("Developer")])
      ])
    ])
  ]);
  const root = elementNode("div", {}, [table]);

  assert.equal(
    markdown.htmlToMarkdown(root),
    "| Name | Role |\n| --- | --- |\n| Garry | Developer |"
  );
});

runTest("preserves table alignment and escapes cell pipes in Markdown", function () {
  const table = elementNode("table", {}, [
    elementNode("tr", {}, [
      elementNode("th", { "data-md-align": "left" }, [textNode("Left")]),
      elementNode("th", { "data-md-align": "center" }, [textNode("Center")]),
      elementNode("th", { "data-md-align": "right" }, [textNode("Right")])
    ]),
    elementNode("tr", {}, [
      elementNode("td", {}, [textNode("A | B")]),
      elementNode("td", {}, [elementNode("code", {}, [textNode("x | y")])]),
      elementNode("td", {}, [textNode("C")])
    ])
  ]);
  const root = elementNode("div", {}, [table]);

  assert.equal(
    markdown.htmlToMarkdown(root),
    "| Left | Center | Right |\n| :--- | :---: | ---: |\n| A \\| B | `x | y` | C |"
  );
});

runTest("renders escaped Markdown punctuation as literal WYSIWYG text", function () {
  const html = markdown.renderMarkdown("\\# Heading\n\\*not emphasis\\*\n\\> quote\n1\\. not ordered");

  assert.match(html, /# Heading/);
  assert.match(html, /\*not emphasis\*/);
  assert.match(html, /&gt; quote/);
  assert.match(html, /1\. not ordered/);
  assert.doesNotMatch(html, /<h1/);
  assert.doesNotMatch(html, /<em>/);
  assert.doesNotMatch(html, /<blockquote/);
  assert.doesNotMatch(html, /<ol/);
});

runTest("escapes WYSIWYG literal Markdown markers when converting to source", function () {
  const root = elementNode("div", {}, [
    elementNode("p", {}, [textNode("# Heading")]),
    elementNode("p", {}, [textNode("*not emphasis*")]),
    elementNode("p", {}, [textNode("> quote")]),
    elementNode("p", {}, [textNode("1. not ordered")])
  ]);

  assert.equal(markdown.htmlToMarkdown(root), "\\# Heading\n\n\\*not emphasis\\*\n\n\\> quote\n\n1\\. not ordered");
});

runTest("converts rendered nested lists back to indented Markdown", function () {
  const nestedUnordered = elementNode("ul", {}, [
    elementNode("li", {}, [textNode("Child")])
  ]);
  const unordered = elementNode("ul", {}, [
    elementNode("li", {}, [textNode("Parent"), nestedUnordered]),
    elementNode("li", {}, [textNode("Next")])
  ]);
  const nestedOrdered = elementNode("ol", {}, [
    elementNode("li", {}, [textNode("Child")])
  ]);
  const ordered = elementNode("ol", {}, [
    elementNode("li", {}, [textNode("Parent"), nestedOrdered]),
    elementNode("li", {}, [textNode("Next")])
  ]);
  const root = elementNode("div", {}, [unordered, ordered]);

  assert.equal(markdown.htmlToMarkdown(root), "- Parent\n  - Child\n- Next\n\n1. Parent\n  1. Child\n2. Next");
});

runTest("converts browser-indented sibling lists back to nested Markdown", function () {
  const unordered = elementNode("ul", {}, [
    elementNode("li", {}, [textNode("Coffee")]),
    elementNode("li", {}, [textNode("Tea")]),
    elementNode("ul", {}, [
      elementNode("li", {}, [textNode("Black tea")]),
      elementNode("li", {}, [textNode("Green tea")])
    ]),
    elementNode("li", {}, [textNode("Milk")])
  ]);
  const ordered = elementNode("ol", {}, [
    elementNode("li", {}, [textNode("One")]),
    elementNode("li", {}, [textNode("Two")]),
    elementNode("ol", {}, [
      elementNode("li", {}, [textNode("Two point one")])
    ]),
    elementNode("li", {}, [textNode("Three")])
  ]);
  const root = elementNode("div", {}, [unordered, ordered]);

  assert.equal(
    markdown.htmlToMarkdown(root),
    "- Coffee\n- Tea\n  - Black tea\n  - Green tea\n- Milk\n\n1. One\n2. Two\n  1. Two point one\n3. Three"
  );
});
