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

console.log(htmlContent);