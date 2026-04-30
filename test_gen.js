const fs = require('fs');
const content = fs.readFileSync('/Users/mattyreed1/Code/rich-markdown-editor/src/markdownEditor.ts', 'utf-8');
const htmlMatch = content.match(/<!DOCTYPE html>[\s\S]*<\/html>/);
if (htmlMatch) {
    let html = htmlMatch[0];
    html = html.replace('const vscode = acquireVsCodeApi();', 'const vscode = { postMessage: (msg) => console.log("vscode msg:", msg) };');
    fs.writeFileSync('/Users/mattyreed1/.gemini/antigravity/brain/da118984-9e4b-4400-9536-7de8f0627e95/scratch/test_webview.html', html);
    console.log("HTML generated!");
} else {
    console.log("HTML not found");
}
