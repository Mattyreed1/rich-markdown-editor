import * as vscode from 'vscode';

export class MarkdownEditorProvider implements vscode.CustomTextEditorProvider {
    public static register(context: vscode.ExtensionContext): vscode.Disposable {
        const provider = new MarkdownEditorProvider(context);
        return vscode.window.registerCustomEditorProvider(MarkdownEditorProvider.viewType, provider);
    }

    private static readonly viewType = 'richMarkdown.wysiwygEditor';

    constructor(
        private readonly context: vscode.ExtensionContext
    ) { }

    public async resolveCustomTextEditor(
        document: vscode.TextDocument,
        webviewPanel: vscode.WebviewPanel,
        _token: vscode.CancellationToken
    ): Promise<void> {
        webviewPanel.webview.options = {
            enableScripts: true,
        };
        webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview);

        let isReady = false;
        let pendingUpdate = false;

        function updateWebview() {
            if (!isReady) {
                pendingUpdate = true;
                return;
            }
            webviewPanel.webview.postMessage({
                type: 'update',
                text: document.getText(),
            });
        }

        const changeDocumentSubscription = vscode.workspace.onDidChangeTextDocument(e => {
            if (e.document.uri.toString() === document.uri.toString()) {
                updateWebview();
            }
        });

        webviewPanel.onDidDispose(() => {
            changeDocumentSubscription.dispose();
        });

        webviewPanel.webview.onDidReceiveMessage(e => {
            switch (e.type) {
                case 'ready':
                    isReady = true;
                    if (pendingUpdate) {
                        updateWebview();
                        pendingUpdate = false;
                    }
                    return;
                case 'save':
                    this.updateTextDocument(document, e.text);
                    return;
                case 'openLink':
                    try {
                        let href = e.href;
                        try { href = decodeURIComponent(href); } catch (e) {}

                        if (href.match(/^[a-zA-Z][a-zA-Z0-9+.-]*:/)) {
                            // Absolute URL with a scheme (e.g. http://, https://, mailto:, file://)
                            vscode.env.openExternal(vscode.Uri.parse(href));
                            return;
                        }

                        // Relative URL (e.g. ./other.md, /abs/path.md)
                        const dir = vscode.Uri.joinPath(document.uri, '..');
                        const uri = vscode.Uri.joinPath(dir, href);

                        vscode.workspace.fs.stat(uri).then(
                            () => {
                                vscode.commands.executeCommand('vscode.open', uri);
                            },
                            () => {
                                if (!href.toLowerCase().endsWith('.md')) {
                                    const mdUri = vscode.Uri.joinPath(dir, href + '.md');
                                    vscode.workspace.fs.stat(mdUri).then(
                                        () => vscode.commands.executeCommand('vscode.open', mdUri),
                                        () => {
                                            vscode.window.showWarningMessage("Could not find file: " + href);
                                            vscode.commands.executeCommand('vscode.open', uri);
                                        }
                                    );
                                } else {
                                    vscode.window.showWarningMessage("Could not find file: " + href);
                                    vscode.commands.executeCommand('vscode.open', uri);
                                }
                            }
                        );
                    } catch (err: any) {
                        console.error("Failed to open link: ", err);
                        vscode.window.showErrorMessage("Error interpreting link: " + err.message);
                    }
                    return;
                case 'error':
                    console.error("WebView Error:", e.text);
                    vscode.window.showErrorMessage("Rich Markdown Editor Error: " + e.text);
                    return;
            }
        });

        updateWebview();
    }

    private updateTextDocument(document: vscode.TextDocument, text: string) {
        const edit = new vscode.WorkspaceEdit();
        edit.replace(
            document.uri,
            new vscode.Range(0, 0, document.lineCount, 0),
            text
        );
        return vscode.workspace.applyEdit(edit);
    }

    private getHtmlForWebview(webview: vscode.Webview): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Rich Markdown Editor</title>
    <link rel="stylesheet" href="https://uicdn.toast.com/editor/latest/toastui-editor.min.css" />
    <link rel="stylesheet" href="https://uicdn.toast.com/editor/latest/theme/toastui-editor-dark.min.css" />
    <style>
        body, html {
            margin: 0;
            padding: 0;
            width: 100%;
            height: 100%;
            overflow: hidden;
            background-color: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
        }
        #container {
            display: flex;
            flex-direction: column;
            height: 100vh;
        }
        #frontmatter-container {
            flex: 0 0 auto;
            border-bottom: 2px solid var(--vscode-editorGroup-border);
            display: none;
            flex-direction: column;
        }
        #frontmatter-header {
            padding: 4px 8px;
            font-size: 11px;
            font-weight: bold;
            text-transform: uppercase;
            background-color: var(--vscode-editorGroupHeader-tabsBackground);
            color: var(--vscode-descriptionForeground);
            display: flex;
            justify-content: space-between;
            align-items: center;
            cursor: pointer;
            user-select: none;
        }
        #frontmatter-header:hover {
            color: var(--vscode-editor-foreground);
        }
        .collapse-icon {
            transition: transform 0.2s ease;
            font-size: 12px;
        }
        #frontmatter-container.collapsed .collapse-icon {
            transform: rotate(-90deg);
        }
        #frontmatter-container.collapsed #frontmatter-editor {
            display: none;
        }
        #frontmatter-editor {
            width: 100%;
            min-height: 100px;
            box-sizing: border-box;
            padding: 8px;
            margin: 0;
            border: none;
            resize: vertical;
            background-color: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            font-family: var(--vscode-editor-font-family);
            font-size: var(--vscode-editor-font-size);
            outline: none;
        }
        #editor {
            flex: 1 1 auto;
            width: 100%;
        }
        /* Override some toast UI default backgrounds for better VS Code integration */
        .toastui-editor-defaultUI {
            border: none;
        }
    </style>
</head>
<body class="vscode-dark">
    <div id="container">
        <div id="frontmatter-container">
            <div id="frontmatter-header" onclick="document.getElementById('frontmatter-container').classList.toggle('collapsed')">
                <span>YAML Metadata (Skill Trigger Data)</span>
                <span class="collapse-icon">▼</span>
            </div>
            <textarea id="frontmatter-editor" spellcheck="false"></textarea>
        </div>
        <div id="editor"></div>
    </div>
    <script src="https://uicdn.toast.com/editor/latest/toastui-editor-all.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
    <script>
        mermaid.initialize({ startOnLoad: false, theme: 'dark' });
        const vscode = acquireVsCodeApi();
        
        window.addEventListener('error', function(event) {
            vscode.postMessage({ type: 'error', text: event.message + ' at ' + event.filename + ':' + event.lineno });
        });

        let isUpdating = false;
        let lastKnownText = '';
        const fmContainer = document.getElementById('frontmatter-container');
        let renderTimeout;
        function renderMermaid() {
            clearTimeout(renderTimeout);
            renderTimeout = setTimeout(() => {
                try {
                    if (window.mermaid) {
                        // Render Viewer/Preview mode diagrams
                        mermaid.run({ querySelector: '.mermaid-diagram', suppressErrors: true })
                            .catch(e => { console.error('Mermaid render error: ', e); });

                        // Render WYSIWYG mode inline previews
                        const wysiwygBlocks = document.querySelectorAll('.toastui-editor-ww-code-block[data-language="mermaid"]');
                        wysiwygBlocks.forEach(block => {
                            let preview = block.querySelector('.mermaid-wysiwyg-preview');
                            if (!preview) {
                                preview = document.createElement('div');
                                preview.className = 'mermaid-wysiwyg-preview';
                                preview.contentEditable = 'false';
                                // Style it nicely
                                preview.style.marginTop = '10px';
                                preview.style.padding = '10px';
                                preview.style.backgroundColor = 'var(--vscode-editor-background)';
                                preview.style.border = '1px solid var(--vscode-editorGroup-border)';
                                preview.style.borderRadius = '4px';
                                preview.style.userSelect = 'none';
                                block.appendChild(preview);
                            }
                            
                            const codeEl = block.querySelector('pre');
                            if (codeEl) {
                                const text = codeEl.innerText;
                                // Only re-render if text changed to avoid flickering
                                if (preview.dataset.lastText !== text) {
                                    preview.dataset.lastText = text;
                                    const id = 'mermaid-ww-' + Math.random().toString(36).substr(2, 9);
                                    // Set text so mermaid can parse it
                                    preview.innerHTML = '<div class="mermaid" id="' + id + '">' + text.replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</div>';
                                    mermaid.run({ querySelector: '#' + id, suppressErrors: true })
                                        .catch(e => {
                                            // Show error if syntax is invalid
                                            preview.innerHTML = '<div style="color: var(--vscode-errorForeground); font-size: 12px;">Syntax Error</div>';
                                        });
                                }
                            }
                        });
                    }
                } catch (e) {
                    console.error('Mermaid exception: ', e);
                }
            }, 300);
        }
        const fmEditor = document.getElementById('frontmatter-editor');
        
        function splitFrontMatter(markdown) {
            if (typeof markdown !== 'string') return { frontMatter: '', content: '' };
            
            const lines = markdown.split('\\n');
            if (lines.length > 0 && lines[0].trim() === '---') {
                let endIdx = -1;
                for (let i = 1; i < lines.length; i++) {
                    if (lines[i].trim() === '---') {
                        endIdx = i;
                        break;
                    }
                }
                
                if (endIdx !== -1) {
                    const frontMatter = lines.slice(0, endIdx + 1).join('\\n') + '\\n';
                    const content = lines.slice(endIdx + 1).join('\\n');
                    return { frontMatter, content };
                }
            }
            return { frontMatter: '', content: markdown };
        }

        function getFullDocumentText() {
            const fmContent = fmEditor.value;
            const mdContent = toastUiEditor.getMarkdown();
            
            if (fmContainer.style.display !== 'none' && fmContent.trim() !== '') {
                return fmContent + mdContent;
            }
            return mdContent;
        }

        const toastUiEditor = new toastui.Editor({
            el: document.querySelector('#editor'),
            height: '100%',
            initialEditType: 'wysiwyg',
            previewStyle: 'vertical',
            theme: 'dark',
            autofocus: false,
            hideModeSwitch: true,
            customHTMLRenderer: {
                codeBlock(node, context) {
                    const { info, literal } = node;
                    if (info === 'mermaid') {
                        return [
                            { type: 'openTag', tagName: 'div', classNames: ['mermaid-diagram'] },
                            { type: 'html', content: literal },
                            { type: 'closeTag', tagName: 'div' }
                        ];
                    }
                    return context.origin();
                }
            },
            events: {
                change: () => {
                    renderMermaid();
                    if (isUpdating) return;
                    
                    const fullText = getFullDocumentText();
                    
                    if (fullText !== lastKnownText) {
                        lastKnownText = fullText;
                        vscode.postMessage({
                            type: 'save',
                            text: fullText
                        });
                    }
                }
            }
        });

        fmEditor.addEventListener('input', () => {
            if (isUpdating) return;
            
            const fullText = getFullDocumentText();
            
            if (fullText !== lastKnownText) {
                lastKnownText = fullText;
                vscode.postMessage({
                    type: 'save',
                    text: fullText
                });
            }
        });

        window.addEventListener('message', event => {
            const message = event.data;
            switch (message.type) {
                case 'update':
                    const text = message.text;
                    if (text !== lastKnownText) {
                        lastKnownText = text;
                        isUpdating = true;
                        
                        const splitResult = splitFrontMatter(text);
                        
                        // Update frontmatter UI
                        if (splitResult.frontMatter) {
                            fmContainer.style.display = 'flex';
                            fmEditor.value = splitResult.frontMatter;
                        } else {
                            fmContainer.style.display = 'none';
                            fmEditor.value = '';
                        }
                        
                        toastUiEditor.setMarkdown(splitResult.content);
                        setTimeout(() => { 
                            isUpdating = false; 
                            renderMermaid();
                        }, 50);
                    }
                    break;
            }
        });

        document.addEventListener('click', event => {
            let node = event.target;
            while (node && node.tagName !== 'A') {
                node = node.parentNode;
            }
            if (node && node.hasAttribute('href')) {
                const href = node.getAttribute('href');
                if (href && !href.startsWith('#')) {
                    event.preventDefault();
                    event.stopPropagation();
                    vscode.postMessage({
                        type: 'openLink',
                        href: href
                    });
                }
            }
        }, true);

        // Tell the extension we are loaded and ready to receive documents
        vscode.postMessage({ type: 'ready' });
    </script>
</body>
</html>`;
    }
}
