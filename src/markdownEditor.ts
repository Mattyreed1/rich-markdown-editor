import * as vscode from 'vscode';

export class MarkdownEditorProvider implements vscode.CustomTextEditorProvider {
    private static activeWebview: vscode.Webview | undefined;

    public static register(context: vscode.ExtensionContext): vscode.Disposable {
        const provider = new MarkdownEditorProvider(context);
        const editorRegistration = vscode.window.registerCustomEditorProvider(MarkdownEditorProvider.viewType, provider, {
            webviewOptions: {
                retainContextWhenHidden: true
            }
        });

        const findCommand = vscode.commands.registerCommand('richMarkdown.find', () => {
            if (MarkdownEditorProvider.activeWebview) {
                MarkdownEditorProvider.activeWebview.postMessage({ type: 'openFind' });
            }
        });

        context.subscriptions.push(editorRegistration, findCommand);
        return editorRegistration;
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

        // Track which webview is active so the find command can message it
        if (webviewPanel.active) {
            MarkdownEditorProvider.activeWebview = webviewPanel.webview;
        }
        webviewPanel.onDidChangeViewState(() => {
            if (webviewPanel.active) {
                MarkdownEditorProvider.activeWebview = webviewPanel.webview;
            } else if (MarkdownEditorProvider.activeWebview === webviewPanel.webview) {
                MarkdownEditorProvider.activeWebview = undefined;
            }
        });

        webviewPanel.onDidDispose(() => {
            changeDocumentSubscription.dispose();
            if (MarkdownEditorProvider.activeWebview === webviewPanel.webview) {
                MarkdownEditorProvider.activeWebview = undefined;
            }
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
                        // Log immediately so the user can verify if the backend even received the click!
                        vscode.window.showInformationMessage("Opening Link: " + href);
                        
                        try { href = decodeURIComponent(href); } catch (e) {}

                        if (href.startsWith('file://')) {
                            vscode.commands.executeCommand('vscode.open', vscode.Uri.parse(href));
                            return;
                        } else if (href.match(/^[a-zA-Z][a-zA-Z0-9+.-]*:/)) {
                            vscode.env.openExternal(vscode.Uri.parse(href));
                            return;
                        }

                        // Relative URL
                        const dir = vscode.Uri.joinPath(document.uri, '..');
                        const uri = vscode.Uri.joinPath(dir, href);

                        vscode.workspace.fs.stat(uri).then(
                            () => vscode.commands.executeCommand('vscode.open', uri),
                            () => {
                                if (!href.toLowerCase().endsWith('.md')) {
                                    const mdUri = vscode.Uri.joinPath(dir, href + '.md');
                                    vscode.workspace.fs.stat(mdUri).then(
                                        () => vscode.commands.executeCommand('vscode.open', mdUri),
                                        () => {
                                            vscode.window.showInformationMessage("Opening dynamically: " + href);
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
            overflow: auto;
            background-color: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
        }
        #container {
            display: flex;
            flex-direction: column;
            min-height: 100vh;
        }
        #frontmatter-container {
            flex: 0 0 auto;
            border-bottom: 2px solid var(--vscode-editorGroup-border);
            display: none;
            flex-direction: column;
        }
        #custom-find {
            position: fixed;
            top: 20px;
            right: 40px;
            background: var(--vscode-editorWidget-background, #252526);
            border: 1px solid var(--vscode-editorWidget-border, #454545);
            box-shadow: 0 4px 6px rgba(0,0,0,0.3);
            border-radius: 4px;
            padding: 6px;
            z-index: 10000;
            display: none;
            align-items: center;
            gap: 4px;
        }
        #custom-find input {
            background: var(--vscode-input-background, #3c3c3c);
            color: var(--vscode-input-foreground, #ccc);
            border: 1px solid var(--vscode-input-border, transparent);
            padding: 4px 6px;
            border-radius: 2px;
            outline: none;
            width: 150px;
            font-family: var(--vscode-font-family);
        }
        #custom-find input:focus {
            border-color: var(--vscode-focusBorder, #007fd4);
        }
        #custom-find button {
            background: transparent;
            color: var(--vscode-icon-foreground, #c5c5c5);
            border: 1px solid transparent;
            border-radius: 3px;
            cursor: pointer;
            padding: 4px 8px;
            font-size: 14px;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        #custom-find button:hover {
            background: var(--vscode-toolbar-hoverBackground, rgba(90, 93, 94, 0.31));
        }
        #find-count {
            color: var(--vscode-descriptionForeground, #999);
            font-size: 12px;
            font-family: var(--vscode-font-family);
            padding: 0 4px;
            white-space: nowrap;
        }
        #frontmatter-header {
            padding: 8px 12px;
            font-weight: 600;
            cursor: pointer;
            display: flex;
            justify-content: space-between;
            align-items: center;
            background-color: var(--vscode-editorGroupHeader-tabsBackground);
            border-bottom: 1px solid var(--vscode-editorGroup-border);
        }
        .collapse-icon {
            transition: transform 0.2s ease;
            display: inline-block;
        }
        #frontmatter-container:not(.collapsed) .collapse-icon {
            transform: rotate(180deg);
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
        
        /* Make links blue and underlined */
        .toastui-editor-contents a,
        .toastui-editor-ww-link,
        a {
            color: #3794ff !important;
            text-decoration: underline !important;
            cursor: pointer !important;
        }
    </style>
</head>
<body class="vscode-dark">
    <div id="custom-find">
        <input id="find-input" type="text" placeholder="Find">
        <span id="find-count"></span>
        <button id="find-prev" title="Previous match">↑</button>
        <button id="find-next" title="Next match">↓</button>
        <button id="find-close" title="Close">×</button>
    </div>
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
    <script src="https://cdn.jsdelivr.net/npm/mermaid@9.4.3/dist/mermaid.min.js"></script>
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
                        try {
                            const diagrams = document.querySelectorAll('.mermaid-diagram');
                            const toProcess = [];
                            diagrams.forEach((diag, index) => {
                                const raw = diag.getAttribute('data-raw');
                                if (raw) {
                                    const decoded = decodeURIComponent(raw);
                                    if (diag.dataset.renderedRaw !== decoded) {
                                        if (!diag.id) diag.id = 'mermaid-preview-' + Math.random().toString(36).substr(2, 9);
                                        diag.textContent = decoded;
                                        diag.removeAttribute('data-processed');
                                        toProcess.push(diag);
                                        diag.dataset.renderedRaw = decoded;
                                    }
                                } else {
                                    // Fallback for first render if data-raw wasn't caught
                                    diag.removeAttribute('data-processed');
                                    toProcess.push(diag);
                                }
                            });
                            if (toProcess.length > 0) {
                                mermaid.init(undefined, toProcess);
                            }
                        } catch (e) {
                            console.error('Mermaid render error: ', e);
                        }

                        // Render WYSIWYG mode inline previews using Overlays
                        // since ProseMirror deletes non-schema DOM nodes appended inside it.
                        let overlayContainer = document.getElementById('mermaid-overlays-container');
                        if (!overlayContainer) {
                            overlayContainer = document.createElement('div');
                            overlayContainer.id = 'mermaid-overlays-container';
                            overlayContainer.style.position = 'absolute';
                            overlayContainer.style.top = '0';
                            overlayContainer.style.left = '0';
                            overlayContainer.style.pointerEvents = 'none'; // pass clicks through
                            overlayContainer.style.width = '100%';
                            document.body.appendChild(overlayContainer);
                        }

                        const codeBlocks = document.querySelectorAll('.toastui-editor-ww-code-block, pre');
                        
                        // Keep track of active blocks to remove orphaned overlays
                        const activeBlockIds = new Set();

                        codeBlocks.forEach((block, index) => {
                            let isMermaid = false;
                            const isWrapper = block.classList.contains('toastui-editor-ww-code-block');
                            const pre = isWrapper ? block.querySelector('pre') : block;
                            if (!pre) return;
                            
                            const actualBlock = isWrapper ? block : (pre.parentElement || pre);

                            let langAttr = actualBlock.getAttribute('data-language') || pre.getAttribute('data-language');
                            if (!langAttr) {
                                const codeEl = pre.querySelector('code');
                                if (codeEl && codeEl.className) {
                                    const match = codeEl.className.match(/language-(\w+)/);
                                    if (match) langAttr = match[1];
                                }
                            }
                            if (langAttr === 'mermaid') isMermaid = true;

                            const text = pre.innerText || pre.textContent || '';
                            // Only set isMermaid if the code block has explicit language=mermaid
                            // (Previously this falsely flagged JS variables starting with 'mermaid')

                            if (!isMermaid) return;

                            // Assign unique ID to the block if it doesn't have one
                            if (!actualBlock.dataset.mermaidId) {
                                actualBlock.dataset.mermaidId = 'mermaid-block-' + Math.random().toString(36).substr(2, 9);
                            }
                            const blockId = actualBlock.dataset.mermaidId;
                            activeBlockIds.add(blockId);

                            let preview = document.getElementById('overlay-' + blockId);
                            if (!preview) {
                                preview = document.createElement('div');
                                preview.id = 'overlay-' + blockId;
                                preview.className = 'mermaid-wysiwyg-preview';
                                preview.style.position = 'absolute';
                                preview.style.padding = '10px';
                                preview.style.backgroundColor = 'var(--vscode-editor-background)';
                                preview.style.border = '1px solid var(--vscode-editorGroup-border)';
                                preview.style.borderRadius = '4px';
                                preview.style.pointerEvents = 'auto'; 
                                overlayContainer.appendChild(preview);
                            }

                            // Position overlay cleanly underneath the code block
                            const rect = actualBlock.getBoundingClientRect();
                            const containerRect = document.body.getBoundingClientRect();
                            const top = rect.bottom - containerRect.top + 10;
                            const left = rect.left - containerRect.left;
                            
                            preview.style.top = top + 'px';
                            preview.style.left = left + 'px';
                            // Match width minus some padding buffer to fit the editor
                            preview.style.width = Math.max(200, rect.width - 20) + 'px';
                            
                            // Removing the 'display: none' optimization as off-screen elements
                            // cause mermaid.init to fetch 0 bounding client rects and render
                            // as overlapping black blobs, which never recover when scrolled back in.
                            preview.style.display = 'block';

                            if (preview.dataset.lastText !== text) {
                                preview.dataset.lastText = text;
                                const id = 'mermaid-ww-' + Math.random().toString(36).substr(2, 9);
                                
                                let codeToRender = text;
                                if (codeToRender.trim().toLowerCase().startsWith('mermaid')) {
                                    codeToRender = codeToRender.replace(/^mermaid\s*\n?/, '');
                                }

                                const safeHtml = codeToRender
                                    .replace(/&/g, '&amp;')
                                    .replace(/</g, '&lt;')
                                    .replace(/>/g, '&gt;')
                                    .replace(/"/g, '&quot;')
                                    .replace(/'/g, '&#039;');

                                preview.innerHTML = '<div class="mermaid" id="' + id + '">' + safeHtml + '</div>';
                                
                                try {
                                    mermaid.init(undefined, document.querySelectorAll('#' + id));
                                } catch (e) {
                                    preview.innerHTML = '<div style="color: var(--vscode-errorForeground); font-size: 12px; font-weight: bold;">Mermaid Syntax Error or Incomplete</div>';
                                }
                            }
                        });

                        // Cleanup orphaned overlays
                        Array.from(overlayContainer.children).forEach(child => {
                            if (!activeBlockIds.has(child.id.replace('overlay-', ''))) {
                                child.remove();
                            }
                        });

                    } else {
                        vscode.postMessage({ type: 'error', text: 'Mermaid library failed to load globally (window.mermaid is undefined).' });
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
            height: 'auto',
            initialEditType: 'wysiwyg',
            previewStyle: 'vertical',
            theme: 'dark',
            autofocus: false,
            hideModeSwitch: true,
            extendedAutolink: true,
            customHTMLRenderer: {
                codeBlock(node, context) {
                    const { info, literal } = node;
                    if (info === 'mermaid') {
                        return [
                            { 
                                type: 'openTag', 
                                tagName: 'div', 
                                classNames: ['mermaid-diagram'],
                                attributes: {
                                    'data-raw': encodeURIComponent(literal)
                                }
                            },
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
                case 'openFind':
                    findWidget.style.display = 'flex';
                    findInput.focus();
                    findInput.select();
                    break;
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
                        
                        document.body.focus(); // Defocus to prevent scroll-to-cursor
                        toastUiEditor.setMarkdown(splitResult.content, false);
                        
                        try { if (toastUiEditor.moveCursorToStart) toastUiEditor.moveCursorToStart(); } catch(e){}
                        
                        // Absolute 60fps Scroll Lock to overpower ProseMirror layout engine jumps
                        let lockFrames = 0;
                        function lockScrollTop() {
                            window.scrollTo(0, 0);
                            document.querySelectorAll('.toastui-editor-ww-container .toastui-editor, .toastui-editor-md-container .toastui-editor, .toastui-editor-contents, .ProseMirror, .toastui-editor-md-preview').forEach(el => {
                                el.scrollTop = 0;
                            });
                            try { if (toastUiEditor.moveCursorToStart) toastUiEditor.moveCursorToStart(); } catch(e){}
                            try { if (toastUiEditor.setSelection) toastUiEditor.setSelection(0, 0); } catch(e){}
                            if (lockFrames++ < 45) {
                                requestAnimationFrame(lockScrollTop);
                            }
                        }
                        requestAnimationFrame(lockScrollTop);
                        
                        setTimeout(() => { 
                            isUpdating = false; 
                            renderMermaid();
                        }, 50);
                    }
                    break;
            }
        });

        const handleLinkClick = (event) => {
            if (event.type === 'mousedown' && event.button !== 0) return; // Only process left clicks
            let target = event.target;
            if (!target) return;
            
            // In contenteditable domains, event.target is often the TextNode itself!
            if (target.nodeType === 3) target = target.parentNode;
            if (!target) return;
            
            let current = target;
            let href = null;
            
            // Traverse up to find a link
            while (current && current !== document.body) {
                if (current.tagName === 'A' && current.hasAttribute('href')) {
                    href = current.getAttribute('href');
                    break;
                }
                if (current.classList && current.classList.contains('toastui-editor-ww-link')) {
                    href = current.getAttribute('data-href') || current.getAttribute('data-url');
                    break;
                }
                current = current.parentNode;
            }

            if (href && !href.startsWith('#')) {
                event.preventDefault();
                event.stopPropagation();
                vscode.postMessage({ type: 'openLink', href: href });
            }
        };
        document.addEventListener('mousedown', handleLinkClick, true);
        document.addEventListener('click', handleLinkClick, true);

        // Custom JS Find Widget Integration
        const findWidget = document.getElementById('custom-find');
        const findInput = document.getElementById('find-input');
        const findCount = document.getElementById('find-count');
        
        const updateMatchCount = () => {
            const query = findInput.value;
            if (!query) { findCount.textContent = ''; return; }
            const editorEl = document.querySelector('.toastui-editor-contents, .ProseMirror');
            const text = editorEl ? editorEl.innerText : '';
            let count = 0;
            let pos = 0;
            const lowerText = text.toLowerCase();
            const lowerQuery = query.toLowerCase();
            while ((pos = lowerText.indexOf(lowerQuery, pos)) !== -1) { count++; pos += lowerQuery.length; }
            findCount.textContent = count === 0 ? 'No results' : count === 1 ? '1 match' : count + ' matches';
        };
        
        findInput.addEventListener('input', updateMatchCount);
        
        const doFind = (backwards = false) => {
            const query = findInput.value;
            if (!query) return;
            updateMatchCount();
            // Native chromium JS DOM search engine completely bypasses the IPC bug
            window.find(query, false, backwards, true, false, false, false);
        };
        
        window.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
                e.preventDefault();
                findWidget.style.display = 'flex';
                findInput.focus();
                findInput.select();
            }
            if (e.key === 'Escape' && findWidget.style.display !== 'none') {
                findWidget.style.display = 'none';
                toastUiEditor.focus();
            }
        });
        
        findInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                doFind(e.shiftKey);
            }
        });
        
        document.getElementById('find-next').addEventListener('click', () => doFind(false));
        document.getElementById('find-prev').addEventListener('click', () => doFind(true));
        document.getElementById('find-close').addEventListener('click', () => {
            findWidget.style.display = 'none';
            toastUiEditor.focus();
        });

        // Tell the extension we are loaded and ready to receive documents
        vscode.postMessage({ type: 'ready' });
    </script>
</body>
</html>`;
    }
}
