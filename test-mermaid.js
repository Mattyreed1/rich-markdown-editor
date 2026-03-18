const { chromium } = require('playwright');
const fs = require('fs');

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

(async () => {
    const htmlContent = require('./out/markdownEditor').MarkdownEditorProvider.prototype.getHtmlForWebview.call(null);
    const testContent = htmlContent.replace('<script>', '<script>window.acquireVsCodeApi = () => ({postMessage: () => {}});</script><script>')
                                   .replace('const toastUiEditor =', 'window.toastUiEditor =');

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    // Serve HTML content directly
    await page.setContent(testContent, { waitUntil: 'load' });

    console.log("Page loaded. Sending initial markdown update...");
    // Inject mock message
    const markdownText = "```mermaid\ngraph TD;\n    A-->B;\n```\n";
    await page.evaluate((md) => {
        window.postMessage({ type: 'update', text: md }, '*');
    }, markdownText);

    // Wait a bit for ToastUI to render and Mermaid timeout (300ms)
    await page.waitForTimeout(1000);

    const editableContent = await page.evaluate(() => {
        const el = document.querySelector('.toastui-editor-contents') || document.querySelector('.toastui-editor-ww-container') || document.body;
        return el.innerHTML;
    });
    console.log("WYSIWYG ProseMirror internal HTML after mermaid render:\n", editableContent.substring(0, 300));

    // Wait, the customHTMLRenderer is active. Let's get the markdown back.
    const returnedMarkdown = await page.evaluate(() => {
        return window.toastUiEditor.getMarkdown();
    });
    console.log("\nMarkdown read from editor after initial load:\n", returnedMarkdown);

    // Let's try to edit the document (simulate typing a letter)
    await page.evaluate(() => {
        window.toastUiEditor.insertText(' Hello');
    });
    await page.waitForTimeout(500);

    const editedMarkdown = await page.evaluate(() => {
        return window.toastUiEditor.getMarkdown();
    });
    console.log("\nMarkdown read from editor after typing:\n", editedMarkdown);

    await browser.close();
})();
