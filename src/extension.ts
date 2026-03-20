import * as vscode from 'vscode';
import { MarkdownEditorProvider } from './markdownEditor';

export function activate(context: vscode.ExtensionContext) {
    context.subscriptions.push(MarkdownEditorProvider.register(context));
}
