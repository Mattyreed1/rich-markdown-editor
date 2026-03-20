const fs = require('fs');
const jsdom = require('jsdom');
const { JSDOM } = jsdom;

const Module = require('module');
const originalRequire = Module.prototype.require;
Module.prototype.require = function () {
  if (arguments[0] === 'vscode') {
    return {
      window: {}, workspace: {}, Uri: {}, Range: {}, WorkspaceEdit: {}, CustomTextEditorProvider: class { }
    };
  }
  return originalRequire.apply(this, arguments);
};

const htmlContent = require('./out/markdownEditor').MarkdownEditorProvider.prototype.getHtmlForWebview.call(null);
const testContent = htmlContent.replace('<script>', '<script>window.acquireVsCodeApi = () => ({postMessage: () => {}});</script><script>');

const dom = new JSDOM(testContent, { runScripts: "dangerously", resources: "usable", url: "http://localhost/" });
const window = dom.window;

window.addEventListener("error", (event) => {
  console.error("DOM ERROR:", event.error.message || event.error);
});

const skillText = fs.readFileSync('../n8n/SKILL.md', 'utf8');

setTimeout(() => {
  // Simulate VS Code sending the update message
  window.postMessage({ type: 'update', text: skillText }, '*');
  console.log("Simulated update sent.");

  setTimeout(() => {
    console.log("Done waiting. Checking content.");
    const editorContent = window.document.body.innerHTML;
    if (editorContent.includes('n8n Master Skill')) {
      console.log("SUCCESS: Content was rendered inside the DOM.");
    } else {
      console.log("FAILURE: Content is missing!");
      console.log(editorContent.substring(0, 500));
    }
  }, 2000);
}, 2000); // give scripts time to load
