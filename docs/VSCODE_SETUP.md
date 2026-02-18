# VS Code Setup Guide for FAZ IDE

This guide will help you set up Visual Studio Code with GitHub Copilot (which uses Spark AI models) for developing FAZ IDE.

## Prerequisites

- [Visual Studio Code](https://code.visualstudio.com/) installed
- [Node.js](https://nodejs.org/) (LTS version recommended)
- [Git](https://git-scm.com/) installed
- A GitHub account with Copilot access (for AI assistance)

## Initial Setup

### 1. Clone the Repository

```bash
git clone https://github.com/FazyBear1999/FAZ-IDE.git
cd FAZ-IDE
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Open in VS Code

```bash
code .
```

Or manually open VS Code and use `File > Open Folder` to open the FAZ-IDE directory.

## Installing Recommended Extensions

When you open the project in VS Code, you should see a notification asking if you want to install the recommended extensions. Click "Install All" to install:

### Essential Extensions

1. **GitHub Copilot** (`github.copilot`)
   - AI-powered code completion using Spark models
   - Provides intelligent code suggestions as you type
   
2. **GitHub Copilot Chat** (`github.copilot-chat`)
   - Chat with Copilot for explanations and code generation
   - Ask questions about the codebase

### Development Extensions

3. **ESLint** (`dbaeumer.vscode-eslint`)
   - JavaScript/TypeScript linting
   
4. **Prettier** (`esbenp.prettier-vscode`)
   - Code formatting
   
5. **Stylelint** (`stylelint.vscode-stylelint`)
   - CSS linting
   
6. **Playwright Test** (`ms-playwright.playwright`)
   - Test runner integration

### Manual Installation

If the notification doesn't appear, you can install extensions manually:

1. Open the Extensions view (`Ctrl+Shift+X` or `Cmd+Shift+X`)
2. Search for each extension by name
3. Click "Install"

Alternatively, run this command from the VS Code terminal:

```bash
code --install-extension github.copilot
code --install-extension github.copilot-chat
code --install-extension dbaeumer.vscode-eslint
code --install-extension esbenp.prettier-vscode
code --install-extension stylelint.vscode-stylelint
code --install-extension ms-playwright.playwright
```

## Verifying GitHub Copilot (Spark) Connection

### Step 1: Check Copilot Status

1. Look at the bottom-right corner of VS Code
2. You should see the Copilot icon (looks like a small logo)
3. Click on it to see the status

**Status indicators:**
- ✅ **Ready** - Copilot is active and working
- ⚠️ **Not signed in** - You need to sign in to GitHub
- ❌ **Error** - There's a connection problem

### Step 2: Sign In to GitHub

If you see "Not signed in":

1. Click the Copilot icon in the bottom-right
2. Select "Sign in to GitHub"
3. Follow the browser prompts to authorize VS Code
4. Return to VS Code after authorization

### Step 3: Test Copilot

1. Open any JavaScript file (e.g., `assets/js/config.js`)
2. Start typing a comment or function
3. You should see gray suggestion text appear (Copilot suggestions)
4. Press `Tab` to accept a suggestion

**Example test:**
```javascript
// Function to calculate the sum of two numbers
```

Copilot should suggest the function implementation after you type the comment.

### Step 4: Use Copilot Chat

1. Open the Copilot Chat panel:
   - Click the chat icon in the sidebar, OR
   - Press `Ctrl+Shift+I` (Windows/Linux) or `Cmd+Shift+I` (Mac)
   
2. Ask a question like: "How does the file system work in this project?"
3. Copilot should respond with relevant information

## Troubleshooting

### Copilot Not Working

**Problem:** Copilot icon shows an error or doesn't appear

**Solutions:**
1. **Check your subscription:**
   - Visit https://github.com/settings/copilot
   - Verify your Copilot subscription is active
   
2. **Reload VS Code:**
   - Press `Ctrl+Shift+P` (Windows/Linux) or `Cmd+Shift+P` (Mac)
   - Type "Reload Window" and press Enter
   
3. **Check network connection:**
   - Copilot requires an internet connection
   - Check your firewall/proxy settings
   
4. **Update the extension:**
   - Open Extensions view (`Ctrl+Shift+X`)
   - Find "GitHub Copilot"
   - Click "Update" if available

### Copilot Suggestions Not Appearing

**Problem:** Signed in but no suggestions appear

**Solutions:**
1. **Check if Copilot is enabled for the file type:**
   - Press `Ctrl+Shift+P` / `Cmd+Shift+P`
   - Type "Copilot: Enable"
   - Select "GitHub Copilot: Enable Completions"
   
2. **Verify settings:**
   - Open Settings (`Ctrl+,` / `Cmd+,`)
   - Search for "copilot"
   - Ensure "Enable Auto Completions" is checked
   
3. **Check language support:**
   - Copilot works best with JavaScript, HTML, CSS
   - Some file types may have limited support

### Sign-In Problems

**Problem:** Can't sign in to GitHub

**Solutions:**
1. **Use the command palette:**
   - Press `Ctrl+Shift+P` / `Cmd+Shift+P`
   - Type "Copilot: Sign In"
   - Follow the prompts
   
2. **Check GitHub access:**
   - Visit https://github.com/login/device
   - Use the device code shown in VS Code
   
3. **Clear credentials:**
   - Sign out and sign in again
   - Restart VS Code

### Extension Installation Issues

**Problem:** Can't install extensions

**Solutions:**
1. **Check VS Code version:**
   - Help > About
   - Update to the latest version if needed
   
2. **Clear extension cache:**
   ```bash
   rm -rf ~/.vscode/extensions
   ```
   Then reinstall extensions
   
3. **Use the marketplace:**
   - Visit https://marketplace.visualstudio.com/
   - Download and install extensions manually

## Configuration Files

The project includes preconfigured VS Code settings:

### `.vscode/settings.json`
- Enables format on save
- Configures Copilot for supported languages
- Sets up file exclusions for better performance

### `.vscode/extensions.json`
- Lists recommended extensions
- Triggers the installation prompt

## Workspace Settings

The workspace is configured to:
- Auto-format code on save using Prettier
- Run linters automatically
- Enable Copilot for JavaScript, CSS, HTML, and Markdown
- Exclude build artifacts and dependencies from search

## Development Workflow

1. **Start the development server:**
   ```bash
   npm run serve
   ```

2. **Run tests:**
   ```bash
   npm run test
   ```

3. **Use Copilot for coding:**
   - Write comments describing what you want
   - Let Copilot suggest implementations
   - Review and modify suggestions as needed

4. **Ask Copilot Chat for help:**
   - "@workspace How does the layout system work?"
   - "Explain this function"
   - "Write a test for this component"

## Additional Resources

- [GitHub Copilot Documentation](https://docs.github.com/en/copilot)
- [VS Code Documentation](https://code.visualstudio.com/docs)
- [FAZ IDE README](../README.md)
- [Project Roadmap](MASTER_ROADMAP.md)

## Quick Reference

### Keyboard Shortcuts

- **Accept Copilot suggestion:** `Tab`
- **Dismiss suggestion:** `Esc`
- **Next suggestion:** `Alt+]` / `Option+]`
- **Previous suggestion:** `Alt+[` / `Option+[`
- **Open Copilot Chat:** `Ctrl+Shift+I` / `Cmd+Shift+I`
- **Trigger inline Copilot:** `Alt+\` / `Option+\`

### VS Code Commands

- **Command Palette:** `Ctrl+Shift+P` / `Cmd+Shift+P`
- **Quick Open:** `Ctrl+P` / `Cmd+P`
- **Terminal:** `Ctrl+Backtick` / `Cmd+Backtick`
- **Source Control:** `Ctrl+Shift+G` / `Cmd+Shift+G`

## Need Help?

If you're still having trouble connecting Copilot to VS Code:

1. Check the [GitHub Copilot Status](https://www.githubstatus.com/)
2. Review [GitHub Copilot Troubleshooting](https://docs.github.com/en/copilot/troubleshooting-github-copilot)
3. Open an issue in the repository
4. Contact GitHub Support for Copilot subscription issues

---

**Note:** GitHub Copilot uses advanced AI models (including Spark) to provide intelligent code suggestions. An active GitHub Copilot subscription is required to use these features.
