const vscode = require('vscode');

class AIService {
    constructor() {
        this.config = vscode.workspace.getConfiguration('fazide.ai');
    }

    async callAI(prompt, systemPrompt = '') {
        const apiKey = this.config.get('apiKey');
        const provider = this.config.get('provider');
        const model = this.config.get('model');
        const enabled = this.config.get('enabled');

        if (!enabled) {
            vscode.window.showWarningMessage('AI Assistant is disabled. Enable it in settings.');
            return null;
        }

        if (!apiKey) {
            vscode.window.showWarningMessage('Please configure your API key in FAZ IDE AI settings');
            return null;
        }

        try {
            if (provider === 'openai') {
                return await this.callOpenAI(prompt, systemPrompt, apiKey, model);
            } else if (provider === 'anthropic') {
                return await this.callAnthropic(prompt, systemPrompt, apiKey, model);
            } else {
                vscode.window.showErrorMessage('Unsupported AI provider: ' + provider);
                return null;
            }
        } catch (error) {
            vscode.window.showErrorMessage('AI request failed: ' + error.message);
            console.error('AI Service Error:', error);
            return null;
        }
    }

    async callOpenAI(prompt, systemPrompt, apiKey, model) {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: model || 'gpt-4',
                messages: [
                    ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
                    { role: 'user', content: prompt }
                ],
                temperature: 0.7,
                max_tokens: 2000
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error?.message || 'OpenAI API request failed');
        }

        const data = await response.json();
        return data.choices[0].message.content;
    }

    async callAnthropic(prompt, systemPrompt, apiKey, model) {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: model || 'claude-3-opus-20240229',
                max_tokens: 2000,
                system: systemPrompt || undefined,
                messages: [
                    { role: 'user', content: prompt }
                ]
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error?.message || 'Anthropic API request failed');
        }

        const data = await response.json();
        return data.content[0].text;
    }

    async explainCode(code, language) {
        const prompt = `Explain the following ${language} code in detail. Break down what it does, how it works, and any important concepts:

\`\`\`${language}
${code}
\`\`\``;

        const systemPrompt = 'You are a helpful coding assistant. Explain code clearly and concisely, focusing on what beginners need to understand.';

        return await this.callAI(prompt, systemPrompt);
    }

    async fixCode(code, language) {
        const prompt = `Review and fix any issues in this ${language} code. Return only the fixed code without explanations:

\`\`\`${language}
${code}
\`\`\``;

        const systemPrompt = 'You are a code reviewer. Fix bugs, improve code quality, and follow best practices. Return only the corrected code.';

        return await this.callAI(prompt, systemPrompt);
    }

    async generateTests(code, language) {
        const prompt = `Generate comprehensive unit tests for this ${language} code:

\`\`\`${language}
${code}
\`\`\`

Use appropriate testing framework for ${language} (Jest for JavaScript, pytest for Python, etc.)`;

        const systemPrompt = 'You are a testing expert. Generate thorough, well-structured unit tests with good coverage.';

        return await this.callAI(prompt, systemPrompt);
    }

    async chat(message, conversationHistory = []) {
        const messages = [
            ...conversationHistory,
            message
        ];

        const prompt = messages.map(m => `${m.role}: ${m.content}`).join('\n\n');
        
        const systemPrompt = 'You are a helpful AI coding assistant for FAZ IDE. Help users with coding questions, debugging, and learning to code.';

        return await this.callAI(prompt, systemPrompt);
    }
}

module.exports = AIService;
