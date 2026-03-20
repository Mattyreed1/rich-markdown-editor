import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

suite('Extension Test Suite', () => {
    vscode.window.showInformationMessage('Start all tests.');

    test('Extension should be present and activate', async () => {
        const ext = vscode.extensions.all.find(e => e.id.includes('rich-markdown-editor'));
        assert.ok(ext, 'Extension should be found');

        if (!ext.isActive) {
            await ext.activate();
        }
        assert.ok(ext.isActive, 'Extension should be activated');
    });

    test('Can open a markdown file with the custom editor', async () => {
        const tmpPath = path.join(os.tmpdir(), `test-${Date.now()}.md`);
        fs.writeFileSync(tmpPath, '# Hello World\nThis is a test');

        const uri = vscode.Uri.file(tmpPath);

        await vscode.commands.executeCommand('vscode.openWith', uri, 'richMarkdown.wysiwygEditor');

        await new Promise(resolve => setTimeout(resolve, 1000));

        const activeTab = vscode.window.tabGroups.activeTabGroup.activeTab;
        assert.ok(activeTab, 'There should be an active tab');
        assert.ok(activeTab.label.includes('test-'), 'The active tab should be the one we opened');
    });
});
