const vscode = require('vscode');
const AIService = require('./aiService');
const ChatViewProvider = require('./chatViewProvider');

let aiService;
let chatViewProvider;

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
    console.log('FAZ IDE AI Assistant is now active');

    // Initialize AI service
    aiService = new AIService();

    // Register chat view provider
    chatViewProvider = new ChatViewProvider(context.extensionUri, aiService);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            'fazide.ai.chatView',
            chatViewProvider
        )
    );

    // Register commands
    context.subscriptions.push(
        vscode.commands.registerCommand('fazide.ai.chat', () => {
            chatViewProvider.show();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('fazide.ai.explainCode', async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showWarningMessage('No active editor');
                return;
            }

            const selection = editor.selection;
            const code = editor.document.getText(selection);

            if (!code) {
                vscode.window.showWarningMessage('No code selected');
                return;
            }

            const explanation = await aiService.explainCode(code, editor.document.languageId);
            
            if (explanation) {
                const panel = vscode.window.createWebviewPanel(
                    'fazide.explanation',
                    'Code Explanation',
                    vscode.ViewColumn.Beside,
                    {}
                );

                panel.webview.html = getExplanationHtml(code, explanation);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('fazide.ai.fixCode', async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showWarningMessage('No active editor');
                return;
            }

            const selection = editor.selection;
            const code = editor.document.getText(selection);

            if (!code) {
                vscode.window.showWarningMessage('No code selected');
                return;
            }

            const fixed = await aiService.fixCode(code, editor.document.languageId);
            
            if (fixed) {
                const action = await vscode.window.showInformationMessage(
                    'AI has suggested a fix. Would you like to apply it?',
                    'Apply',
                    'Show Diff',
                    'Cancel'
                );

                if (action === 'Apply') {
                    editor.edit(editBuilder => {
                        editBuilder.replace(selection, fixed);
                    });
                } else if (action === 'Show Diff') {
                    showDiff(code, fixed, editor.document.languageId);
                }
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('fazide.ai.generateTests', async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showWarningMessage('No active editor');
                return;
            }

            const selection = editor.selection;
            const code = editor.document.getText(selection) || editor.document.getText();

            const tests = await aiService.generateTests(code, editor.document.languageId);
            
            if (tests) {
                const fileName = editor.document.fileName;
                const testFileName = fileName.replace(/\.(js|ts)$/, '.test.$1');
                
                const doc = await vscode.workspace.openTextDocument({
                    content: tests,
                    language: editor.document.languageId
                });
                
                await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
            }
        })
    );

    // Show welcome message
    const config = vscode.workspace.getConfiguration('fazide.ai');
    if (!config.get('apiKey')) {
        vscode.window.showInformationMessage(
            'FAZ IDE AI Assistant: Please configure your API key in settings',
            'Open Settings'
        ).then(selection => {
            if (selection === 'Open Settings') {
                vscode.commands.executeCommand('workbench.action.openSettings', 'fazide.ai.apiKey');
            }
        });
    }
}

function deactivate() {
    console.log('FAZ IDE AI Assistant is now deactivated');
}

function getExplanationHtml(code, explanation) {
    return `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Code Explanation</title>
        <style>
            body {
                font-family: var(--vscode-font-family);
                color: var(--vscode-foreground);
                background-color: var(--vscode-editor-background);
                padding: 20px;
                line-height: 1.6;
            }
            pre {
                background-color: var(--vscode-textBlockQuote-background);
                padding: 15px;
                border-radius: 5px;
                overflow-x: auto;
            }
            code {
                font-family: var(--vscode-editor-font-family);
            }
            h2 {
                color: var(--vscode-textLink-foreground);
                border-bottom: 1px solid var(--vscode-panel-border);
                padding-bottom: 5px;
            }
            .explanation {
                margin-top: 20px;
            }
        </style>
    </head>
    <body>
        <h2>Code</h2>
        <pre><code>${escapeHtml(code)}</code></pre>
        <div class="explanation">
            <h2>Explanation</h2>
            <div>${markdownToHtml(explanation)}</div>
        </div>
    </body>
    </html>`;
}

function escapeHtml(text) {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function markdownToHtml(markdown) {
    // Simple markdown to HTML conversion
    return markdown
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/\*([^*]+)\*/g, '<em>$1</em>')
        .replace(/\n\n/g, '</p><p>')
        .replace(/\n/g, '<br>');
}

async function showDiff(original, fixed, language) {
    const originalDoc = await vscode.workspace.openTextDocument({
        content: original,
        language: language
    });

    const fixedDoc = await vscode.workspace.openTextDocument({
        content: fixed,
        language: language
    });

    await vscode.commands.executeCommand('vscode.diff',
        originalDoc.uri,
        fixedDoc.uri,
        'Original ↔ AI Fixed'
    );
}

module.exports = {
    activate,
    deactivate
};
