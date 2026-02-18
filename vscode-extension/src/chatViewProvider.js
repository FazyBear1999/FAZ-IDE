const vscode = require('vscode');

class ChatViewProvider {
    constructor(extensionUri, aiService) {
        this._extensionUri = extensionUri;
        this._aiService = aiService;
        this._view = null;
        this._conversationHistory = [];
    }

    resolveWebviewView(webviewView, context, token) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        // Handle messages from the webview
        webviewView.webview.onDidReceiveMessage(async message => {
            switch (message.type) {
                case 'sendMessage':
                    await this._handleUserMessage(message.text);
                    break;
                case 'clearChat':
                    this._conversationHistory = [];
                    this._view.webview.postMessage({ type: 'clearChat' });
                    break;
            }
        });
    }

    async _handleUserMessage(text) {
        // Add user message to conversation history
        this._conversationHistory.push({ role: 'user', content: text });

        // Show user message in chat
        this._view.webview.postMessage({
            type: 'addMessage',
            role: 'user',
            content: text
        });

        // Show typing indicator
        this._view.webview.postMessage({ type: 'showTyping' });

        // Get AI response
        const response = await this._aiService.chat(
            { role: 'user', content: text },
            this._conversationHistory.slice(0, -1)
        );

        // Hide typing indicator
        this._view.webview.postMessage({ type: 'hideTyping' });

        if (response) {
            // Add AI response to conversation history
            this._conversationHistory.push({ role: 'assistant', content: response });

            // Show AI message in chat
            this._view.webview.postMessage({
                type: 'addMessage',
                role: 'assistant',
                content: response
            });
        }
    }

    show() {
        if (this._view) {
            this._view.show(true);
        }
    }

    _getHtmlForWebview(webview) {
        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>FAZ IDE AI Chat</title>
            <style>
                * {
                    margin: 0;
                    padding: 0;
                    box-sizing: border-box;
                }

                body {
                    font-family: var(--vscode-font-family);
                    color: var(--vscode-foreground);
                    background-color: var(--vscode-editor-background);
                    height: 100vh;
                    display: flex;
                    flex-direction: column;
                }

                #chat-container {
                    flex: 1;
                    overflow-y: auto;
                    padding: 15px;
                    display: flex;
                    flex-direction: column;
                    gap: 15px;
                }

                .message {
                    display: flex;
                    flex-direction: column;
                    gap: 5px;
                    max-width: 90%;
                }

                .message.user {
                    align-self: flex-end;
                }

                .message.assistant {
                    align-self: flex-start;
                }

                .message-header {
                    font-size: 11px;
                    opacity: 0.7;
                    font-weight: 600;
                }

                .message-content {
                    padding: 10px 14px;
                    border-radius: 8px;
                    line-height: 1.5;
                    white-space: pre-wrap;
                    word-wrap: break-word;
                }

                .message.user .message-content {
                    background-color: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                }

                .message.assistant .message-content {
                    background-color: var(--vscode-textBlockQuote-background);
                }

                .message-content code {
                    background-color: rgba(0, 0, 0, 0.2);
                    padding: 2px 6px;
                    border-radius: 3px;
                    font-family: var(--vscode-editor-font-family);
                    font-size: 0.9em;
                }

                #typing-indicator {
                    display: none;
                    padding: 10px;
                    font-style: italic;
                    opacity: 0.6;
                }

                #input-container {
                    padding: 15px;
                    border-top: 1px solid var(--vscode-panel-border);
                    display: flex;
                    gap: 10px;
                    background-color: var(--vscode-editor-background);
                }

                #message-input {
                    flex: 1;
                    padding: 10px;
                    background-color: var(--vscode-input-background);
                    color: var(--vscode-input-foreground);
                    border: 1px solid var(--vscode-input-border);
                    border-radius: 4px;
                    font-family: var(--vscode-font-family);
                    font-size: 13px;
                    resize: none;
                    min-height: 40px;
                    max-height: 120px;
                }

                #message-input:focus {
                    outline: 1px solid var(--vscode-focusBorder);
                }

                button {
                    padding: 10px 20px;
                    background-color: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                    font-family: var(--vscode-font-family);
                    font-size: 13px;
                    font-weight: 500;
                }

                button:hover {
                    background-color: var(--vscode-button-hoverBackground);
                }

                button:active {
                    opacity: 0.9;
                }

                #clear-button {
                    background-color: var(--vscode-button-secondaryBackground);
                    color: var(--vscode-button-secondaryForeground);
                }

                #clear-button:hover {
                    background-color: var(--vscode-button-secondaryHoverBackground);
                }

                .empty-state {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    height: 100%;
                    opacity: 0.6;
                    text-align: center;
                    padding: 20px;
                }

                .empty-state h3 {
                    margin-bottom: 10px;
                }
            </style>
        </head>
        <body>
            <div id="chat-container">
                <div class="empty-state">
                    <h3>FAZ IDE AI Assistant</h3>
                    <p>Ask me anything about coding, debugging, or FAZ IDE!</p>
                </div>
            </div>
            <div id="typing-indicator">AI is typing...</div>
            <div id="input-container">
                <textarea id="message-input" placeholder="Ask a question..." rows="1"></textarea>
                <button id="send-button">Send</button>
                <button id="clear-button">Clear</button>
            </div>

            <script>
                const vscode = acquireVsCodeApi();
                const chatContainer = document.getElementById('chat-container');
                const messageInput = document.getElementById('message-input');
                const sendButton = document.getElementById('send-button');
                const clearButton = document.getElementById('clear-button');
                const typingIndicator = document.getElementById('typing-indicator');

                let messageCount = 0;

                // Auto-resize textarea
                messageInput.addEventListener('input', () => {
                    messageInput.style.height = 'auto';
                    messageInput.style.height = messageInput.scrollHeight + 'px';
                });

                // Send message on button click
                sendButton.addEventListener('click', sendMessage);

                // Send message on Enter (Shift+Enter for new line)
                messageInput.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        sendMessage();
                    }
                });

                // Clear chat
                clearButton.addEventListener('click', () => {
                    vscode.postMessage({ type: 'clearChat' });
                });

                function sendMessage() {
                    const text = messageInput.value.trim();
                    if (!text) return;

                    vscode.postMessage({
                        type: 'sendMessage',
                        text: text
                    });

                    messageInput.value = '';
                    messageInput.style.height = 'auto';
                }

                // Handle messages from the extension
                window.addEventListener('message', event => {
                    const message = event.data;

                    switch (message.type) {
                        case 'addMessage':
                            addMessage(message.role, message.content);
                            break;
                        case 'showTyping':
                            typingIndicator.style.display = 'block';
                            chatContainer.scrollTop = chatContainer.scrollHeight;
                            break;
                        case 'hideTyping':
                            typingIndicator.style.display = 'none';
                            break;
                        case 'clearChat':
                            chatContainer.innerHTML = \`
                                <div class="empty-state">
                                    <h3>FAZ IDE AI Assistant</h3>
                                    <p>Ask me anything about coding, debugging, or FAZ IDE!</p>
                                </div>
                            \`;
                            messageCount = 0;
                            break;
                    }
                });

                function addMessage(role, content) {
                    // Remove empty state on first message
                    if (messageCount === 0) {
                        chatContainer.innerHTML = '';
                    }
                    messageCount++;

                    const messageDiv = document.createElement('div');
                    messageDiv.className = \`message \${role}\`;

                    const headerDiv = document.createElement('div');
                    headerDiv.className = 'message-header';
                    headerDiv.textContent = role === 'user' ? 'You' : 'AI Assistant';

                    const contentDiv = document.createElement('div');
                    contentDiv.className = 'message-content';
                    contentDiv.textContent = content;

                    messageDiv.appendChild(headerDiv);
                    messageDiv.appendChild(contentDiv);
                    chatContainer.appendChild(messageDiv);

                    chatContainer.scrollTop = chatContainer.scrollHeight;
                }

                // Focus input on load
                messageInput.focus();
            </script>
        </body>
        </html>`;
    }
}

module.exports = ChatViewProvider;
