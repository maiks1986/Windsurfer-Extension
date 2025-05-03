const vscode = require('vscode');
const path = require('path');

/**
 * Implements a WebView panel for managing StreamDeck buttons
 */
class ButtonsPanel {
  /**
   * @type {ButtonsPanel}
   * @static
   */
  static currentPanel = undefined;
  
  /**
   * @type {string}
   * @static
   */
  static viewType = 'streamDeckButtons';
  
  /**
   * @type {vscode.WebviewPanel}
   * @private
   */
  _panel;
  
  /**
   * @type {vscode.ExtensionUri}
   * @private
   */
  _extensionUri;
  
  /**
   * @type {import('../buttons/buttonManager').ButtonManager}
   * @private
   */
  _buttonManager;
  
  /**
   * @type {vscode.Disposable[]}
   * @private
   */
  _disposables = [];

  /**
   * Creates a new ButtonsPanel
   * @param {vscode.WebviewPanel} panel - WebView panel
   * @param {vscode.Uri} extensionUri - Extension URI
   * @param {import('../buttons/buttonManager').ButtonManager} buttonManager - Button manager
   */
  constructor(panel, extensionUri, buttonManager) {
    this._panel = panel;
    this._extensionUri = extensionUri;
    this._buttonManager = buttonManager;
    
    // Set initial HTML content
    this._update();
    
    // Listen for when the panel is disposed
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    
    // Handle messages from the webview
    this._panel.webview.onDidReceiveMessage(
      message => this._handleMessage(message),
      null,
      this._disposables
    );
    
    // Listen for button changes
    this._disposables.push(
      buttonManager.onDidChangeButtons(() => {
        this._update();
      })
    );
  }

  /**
   * Creates or shows the buttons panel
   * @param {vscode.ExtensionContext} context - Extension context
   * @param {import('../buttons/buttonManager').ButtonManager} buttonManager - Button manager
   */
  static createOrShow(context, buttonManager) {
    const extensionUri = context.extensionUri;
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;
    
    // If we already have a panel, show it
    if (ButtonsPanel.currentPanel) {
      ButtonsPanel.currentPanel._panel.reveal(column);
      return;
    }
    
    // Otherwise, create a new panel
    const panel = vscode.window.createWebviewPanel(
      ButtonsPanel.viewType,
      'StreamDeck Buttons',
      column || vscode.ViewColumn.One,
      {
        // Enable JavaScript in the webview
        enableScripts: true,
        
        // Restrict the webview to only load resources from the extension's directory
        localResourceRoots: [vscode.Uri.file(path.join(extensionUri.fsPath, 'resources'))],
        
        // Retain the webview content when it's not visible
        retainContextWhenHidden: true
      }
    );
    
    ButtonsPanel.currentPanel = new ButtonsPanel(panel, extensionUri, buttonManager);
  }

  /**
   * Handles messages from the webview
   * @param {Object} message - Message from the webview
   * @private
   */
  _handleMessage(message) {
    switch (message.command) {
      case 'addButton':
        this._buttonManager.addButton(message.button);
        vscode.window.showInformationMessage(`Button '${message.button.name}' added successfully`);
        break;
        
      case 'updateButton':
        this._buttonManager.updateButton(message.id, message.button);
        vscode.window.showInformationMessage(`Button '${message.button.name}' updated successfully`);
        break;
        
      case 'deleteButton':
        // Ask for confirmation
        vscode.window.showWarningMessage(
          `Are you sure you want to delete this button?`, 
          { modal: true },
          'Delete'
        ).then(selection => {
          if (selection === 'Delete') {
            this._buttonManager.deleteButton(message.id);
            vscode.window.showInformationMessage('Button deleted successfully');
          }
        });
        break;
        
      case 'showError':
        vscode.window.showErrorMessage(message.message);
        break;
    }
  }

  /**
   * Updates the webview content
   * @private
   */
  _update() {
    if (!this._panel) {
      return;
    }
    
    this._panel.title = 'StreamDeck Buttons';
    this._panel.webview.html = this._getHtmlForWebview();
  }

  /**
   * Gets the HTML for the webview
   * @returns {string} HTML content
   * @private
   */
  _getHtmlForWebview() {
    // Get the local path to main script
    const scriptUri = this._panel.webview.asWebviewUri(
      vscode.Uri.file(path.join(this._extensionUri.fsPath, 'resources', 'js', 'main.js'))
    );
    
    // Get the local path to css file
    const styleUri = this._panel.webview.asWebviewUri(
      vscode.Uri.file(path.join(this._extensionUri.fsPath, 'resources', 'css', 'style.css'))
    );
    
    // Use a nonce to allow only specific scripts to be run
    const nonce = getNonce();
    
    const buttons = this._buttonManager.getButtons();
    
    return `<!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${this._panel.webview.cspSource}; script-src 'nonce-${nonce}';">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <link href="${styleUri}" rel="stylesheet">
      <title>StreamDeck Buttons</title>
    </head>
    <body>
      <h1>StreamDeck Buttons</h1>
      
      <div class="button-container">
        <h2>Your Buttons</h2>
        <div class="button-list">
          ${buttons.length > 0 ? buttons.map(button => `
            <div class="button-item" data-id="${button.id}">
              <div class="button-header">
                <h3>${button.name}</h3>
                <div class="button-actions">
                  <button class="edit-button" data-id="${button.id}">Edit</button>
                  <button class="delete-button" data-id="${button.id}">Delete</button>
                </div>
              </div>
              <div class="button-details">
                <p><strong>Command:</strong> ${button.command}</p>
                ${button.args ? `<p><strong>Arguments:</strong> ${JSON.stringify(button.args)}</p>` : ''}
              </div>
            </div>
          `).join('') : '<p>No buttons yet. Add your first button below.</p>'}
        </div>
      </div>
      
      <div class="form-container">
        <h2>Add New Button</h2>
        <form id="button-form">
          <div class="form-group">
            <label for="button-name">Button Name</label>
            <input type="text" id="button-name" name="name" required placeholder="Enter button name">
          </div>
          
          <div class="form-group">
            <label for="button-command">Command</label>
            <input type="text" id="button-command" name="command" required placeholder="Enter VS Code command">
          </div>
          
          <div class="form-group">
            <label for="button-args">Arguments (optional JSON)</label>
            <textarea id="button-args" name="args" placeholder="Enter command arguments as JSON"></textarea>
          </div>
          
          <div class="form-actions">
            <button type="submit" id="add-button">Add Button</button>
          </div>
        </form>
      </div>
      
      <script nonce="${nonce}" src="${scriptUri}"></script>
    </body>
    </html>`;
  }

  /**
   * Disposes of the panel and resources
   */
  dispose() {
    ButtonsPanel.currentPanel = undefined;
    
    // Clean up resources
    this._panel.dispose();
    
    while (this._disposables.length) {
      const disposable = this._disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }
}

/**
 * Generates a nonce for CSP
 * @returns {string} Random nonce
 */
function getNonce() {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

module.exports = { ButtonsPanel };
