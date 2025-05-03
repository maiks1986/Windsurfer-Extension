# Windsurfer Extension Development Plan

## Project Overview

The Windsurfer Extension is a VS Code extension designed to integrate with StreamDeck, allowing users to control VS Code through StreamDeck buttons. The extension needs to be refactored from its current monolithic structure into a more modular, maintainable architecture.

## Current State

The extension currently has a monolithic structure with most of the functionality in a single `extension.js` file (41KB). This makes the codebase difficult to maintain, understand, and extend.

### VS Code Extension Structure

A typical VS Code extension has the following structure:

```text
.
├── .vscode
│   ├── launch.json     // Config for launching and debugging the extension
│   └── tasks.json      // Config for build task that compiles TypeScript
├── .gitignore          // Ignore build output and node_modules
├── README.md           // Readable description of your extension's functionality
├── src
│   └── extension.ts    // Extension source code
├── package.json        // Extension manifest
├── tsconfig.json       // TypeScript configuration
```

## Desired State

A modular architecture with clear separation of concerns:

1. **Main Files**:
   - `extension.js` - Main entry point that imports from the modular structure
   - `src/extension.js` - Core extension implementation that coordinates all modules

2. **Button Management**:
   - `src/buttons/buttonManager.js` - Handles button operations (loading, saving, adding, deleting)

3. **Communication**:
   - `src/communication/servers.js` - Implements WebSocket, Named Pipe, and Unix Socket servers
   - `src/communication/messageHandler.js` - Processes incoming messages and commands
   - `src/communication/discovery.js` - Handles network discovery for StreamDeck clients

4. **UI Components**:
   - `src/ui/buttonsPanel.js` - Implements the webview panel for buttons (no treeview)

### VS Code Extension API Best Practices

#### Extension Entry Point

The main entry point should follow this pattern:

```javascript
import * as vscode from 'vscode';

// Import our modules
import { ButtonManager } from './buttons/buttonManager';
import { setupServers } from './communication/servers';
import { MessageHandler } from './communication/messageHandler';
import { ButtonsPanel } from './ui/buttonsPanel';

export function activate(context: vscode.ExtensionContext) {
  // Initialize modules
  const buttonManager = new ButtonManager(context);
  const messageHandler = new MessageHandler(buttonManager);
  const servers = setupServers(messageHandler);
  const buttonsPanel = new ButtonsPanel(context, buttonManager);
  
  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('windsurfer.openButtonsPanel', () => {
      buttonsPanel.show();
    })
  );
  
  // Add all disposables to context.subscriptions
  context.subscriptions.push(buttonManager, messageHandler, ...servers, buttonsPanel);
}

export function deactivate() {
  // Clean up resources if needed
}
```

#### WebView Implementation

For the buttons panel, we'll use the WebView API to create a simple interface with buttons. The panel should be clean, intuitive, and focused on button management without any treeview components.

##### Detailed WebView Implementation Instructions

1. **Creating the WebView Panel**

   The WebView panel should be created when the user activates a specific command (e.g., "Open StreamDeck Buttons Panel"). Here's how to implement it:

   ```javascript
   // In src/ui/buttonsPanel.js
   import * as vscode from 'vscode';
   import * as path from 'path';
   
   export class ButtonsPanel {
     static currentPanel = undefined;
     static viewType = 'streamDeckButtons';
     
     constructor(panel, extensionUri, buttonManager) {
       this._panel = panel;
       this._extensionUri = extensionUri;
       this._buttonManager = buttonManager;
       this._disposables = [];
       
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
     }
     
     static createOrShow(extensionUri, buttonManager) {
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
     
     _handleMessage(message) {
       switch (message.command) {
         case 'addButton':
           this._buttonManager.addButton(message.button);
           break;
         case 'updateButton':
           this._buttonManager.updateButton(message.id, message.button);
           break;
         case 'deleteButton':
           this._buttonManager.deleteButton(message.id);
           break;
       }
     }
     
     _update() {
       if (!this._panel) {
         return;
       }
       
       this._panel.title = 'StreamDeck Buttons';
       this._panel.webview.html = this._getHtmlForWebview();
     }
     
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
             ${buttons.map(button => `
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
             `).join('') || '<p>No buttons yet. Add your first button below.</p>'}
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
   }
   
   function getNonce() {
     let text = '';
     const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
     for (let i = 0; i < 32; i++) {
       text += possible.charAt(Math.floor(Math.random() * possible.length));
     }
     return text;
   }
   ```

2. **WebView Resources**

   Create the following directory structure for WebView resources:

   ```text
   
   resources/
   ├── css/
   │   └── style.css
   └── js/
       └── main.js
   ```

3. **CSS Styling (resources/css/style.css)**

   ```css
   body {
     font-family: var(--vscode-font-family);
     padding: 20px;
     color: var(--vscode-foreground);
     background-color: var(--vscode-editor-background);
   }
   
   h1 {
     font-size: 24px;
     margin-bottom: 20px;
     border-bottom: 1px solid var(--vscode-panel-border);
     padding-bottom: 10px;
   }
   
   h2 {
     font-size: 18px;
     margin: 15px 0;
   }
   
   .button-container, .form-container {
     margin-bottom: 30px;
   }
   
   .button-list {
     display: flex;
     flex-direction: column;
     gap: 10px;
   }
   
   .button-item {
     border: 1px solid var(--vscode-panel-border);
     border-radius: 4px;
     padding: 12px;
     background-color: var(--vscode-editor-background);
   }
   
   .button-header {
     display: flex;
     justify-content: space-between;
     align-items: center;
     margin-bottom: 8px;
   }
   
   .button-header h3 {
     margin: 0;
     font-size: 16px;
   }
   
   .button-actions {
     display: flex;
     gap: 8px;
   }
   
   .button-details p {
     margin: 5px 0;
     font-size: 14px;
   }
   
   .form-group {
     margin-bottom: 15px;
   }
   
   label {
     display: block;
     margin-bottom: 5px;
     font-size: 14px;
   }
   
   input, textarea {
     width: 100%;
     padding: 8px;
     border: 1px solid var(--vscode-input-border);
     background-color: var(--vscode-input-background);
     color: var(--vscode-input-foreground);
     border-radius: 2px;
   }
   
   textarea {
     min-height: 80px;
     font-family: var(--vscode-editor-font-family);
   }
   
   button {
     background-color: var(--vscode-button-background);
     color: var(--vscode-button-foreground);
     border: none;
     padding: 8px 12px;
     border-radius: 2px;
     cursor: pointer;
     font-size: 13px;
   }
   
   button:hover {
     background-color: var(--vscode-button-hoverBackground);
   }
   
   .edit-button, .delete-button {
     padding: 4px 8px;
     font-size: 12px;
   }
   
   .delete-button {
     background-color: var(--vscode-errorForeground);
   }
   ```

4. **JavaScript for WebView (resources/js/main.js)**

   ```javascript
   // Get VS Code API
   const vscode = acquireVsCodeApi();
   
   // Store state information
   let currentEditId = null;
   
   // Initialize the webview
   document.addEventListener('DOMContentLoaded', () => {
     // Setup form submission
     const form = document.getElementById('button-form');
     form.addEventListener('submit', handleFormSubmit);
     
     // Setup edit and delete buttons
     setupButtonActions();
   });
   
   function handleFormSubmit(event) {
     event.preventDefault();
     
     const nameInput = document.getElementById('button-name');
     const commandInput = document.getElementById('button-command');
     const argsInput = document.getElementById('button-args');
     
     const name = nameInput.value.trim();
     const command = commandInput.value.trim();
     let args = null;
     
     // Parse args if provided
     if (argsInput.value.trim()) {
       try {
         args = JSON.parse(argsInput.value.trim());
       } catch (e) {
         // Show error for invalid JSON
         vscode.postMessage({
           command: 'showError',
           message: 'Invalid JSON in arguments field'
         });
         return;
       }
     }
     
     if (!name || !command) {
       return;
     }
     
     const button = {
       id: currentEditId || Date.now().toString(),
       name,
       command,
       args
     };
     
     // Send message to extension
     vscode.postMessage({
       command: currentEditId ? 'updateButton' : 'addButton',
       id: currentEditId,
       button
     });
     
     // Reset form
     form.reset();
     currentEditId = null;
     
     // Update button text if it was in edit mode
     const addButton = document.getElementById('add-button');
     addButton.textContent = 'Add Button';
   }
   
   function setupButtonActions() {
     // Setup edit buttons
     document.querySelectorAll('.edit-button').forEach(button => {
       button.addEventListener('click', () => {
         const id = button.getAttribute('data-id');
         editButton(id);
       });
     });
     
     // Setup delete buttons
     document.querySelectorAll('.delete-button').forEach(button => {
       button.addEventListener('click', () => {
         const id = button.getAttribute('data-id');
         deleteButton(id);
       });
     });
   }
   
   function editButton(id) {
     const buttonItem = document.querySelector(`.button-item[data-id="${id}"]`);
     if (!buttonItem) return;
     
     const nameElement = buttonItem.querySelector('h3');
     const commandElement = buttonItem.querySelector('.button-details p:first-child');
     
     // Extract values
     const name = nameElement.textContent;
     const command = commandElement.textContent.replace('Command:', '').trim();
     
     // Populate form
     document.getElementById('button-name').value = name;
     document.getElementById('button-command').value = command;
     
     // Check if there are args
     const argsElement = buttonItem.querySelector('.button-details p:nth-child(2)');
     if (argsElement) {
       const argsText = argsElement.textContent.replace('Arguments:', '').trim();
       document.getElementById('button-args').value = argsText;
     } else {
       document.getElementById('button-args').value = '';
     }
     
     // Set edit mode
     currentEditId = id;
     document.getElementById('add-button').textContent = 'Update Button';
     
     // Scroll to form
     document.querySelector('.form-container').scrollIntoView({ behavior: 'smooth' });
   }
   
   function deleteButton(id) {
     // Confirm deletion
     vscode.postMessage({
       command: 'deleteButton',
       id
     });
   }
   
   // Handle messages from the extension
   window.addEventListener('message', event => {
     const message = event.data;
     
     switch (message.command) {
       case 'refreshButtons':
         // This would be handled by the extension re-rendering the entire webview
         break;
     }
   });
   ```

5. **Registering the WebView in extension.js**

   ```javascript
   // In src/extension.js
   import { ButtonsPanel } from './ui/buttonsPanel';
   
   export function activate(context) {
     // Register command to open buttons panel
     context.subscriptions.push(
       vscode.commands.registerCommand('windsurfer.openButtonsPanel', () => {
         ButtonsPanel.createOrShow(context.extensionUri, buttonManager);
       })
     );
   }
   ```

6. **Message Handling in the Extension**

   The WebView communicates with the extension through messages. In the ButtonsPanel class, implement proper message handling:

   ```javascript
   _handleMessage(message) {
     switch (message.command) {
       case 'addButton':
         this._buttonManager.addButton(message.button);
         vscode.window.showInformationMessage(`Button '${message.button.name}' added successfully`);
         this._update(); // Refresh the webview
         break;
         
       case 'updateButton':
         this._buttonManager.updateButton(message.id, message.button);
         vscode.window.showInformationMessage(`Button '${message.button.name}' updated successfully`);
         this._update(); // Refresh the webview
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
             this._update(); // Refresh the webview
           }
         });
         break;
         
       case 'showError':
         vscode.window.showErrorMessage(message.message);
         break;
     }
   }
   ```

7. **Security Considerations**

   - Always use a Content Security Policy (CSP) to prevent XSS attacks
   - Use nonces for scripts to ensure only your scripts run
   - Validate all messages received from the webview
   - Use `localResourceRoots` to restrict which local resources the webview can load

## Implementation Plan

1. **Setup Project Structure**
   - Create the directory structure for the modular approach

2. **Refactor Core Functionality**
   - Extract button management logic into dedicated module
   - Extract communication logic (WebSocket, Named Pipe, Unix Socket) into dedicated modules
   - Extract message handling into a dedicated module
   - Extract UI components into dedicated modules

3. **Implement New Features**
   - Improve network discovery for StreamDeck clients
   - Enhance button management with better organization options
   - Improve UI for button configuration (without treeview)

4. **Testing and Documentation**
   - Update documentation to reflect the new architecture
   - Create clear API documentation for each module

### Code Examples

#### Button Manager Module

```javascript
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export class ButtonManager implements vscode.Disposable {
  private _buttons: Button[] = [];
  private _onDidChangeButtons = new vscode.EventEmitter<Button[]>();
  readonly onDidChangeButtons = this._onDidChangeButtons.event;
  private _buttonsFile: string;

  constructor(private context: vscode.ExtensionContext) {
    this._buttonsFile = path.join(context.extensionPath, 'buttons.json');
    this._loadButtons();
  }

  private _loadButtons() {
    try {
      if (fs.existsSync(this._buttonsFile)) {
        const content = fs.readFileSync(this._buttonsFile, 'utf8');
        this._buttons = JSON.parse(content);
        this._onDidChangeButtons.fire(this._buttons);
      }
    } catch (err) {
      vscode.window.showErrorMessage(`Failed to load buttons: ${err.message}`);
    }
  }

  saveButtons() {
    try {
      fs.writeFileSync(this._buttonsFile, JSON.stringify(this._buttons, null, 2));
    } catch (err) {
      vscode.window.showErrorMessage(`Failed to save buttons: ${err.message}`);
    }
  }

  getButtons(): Button[] {
    return [...this._buttons];
  }

  addButton(button: Button) {
    this._buttons.push(button);
    this._onDidChangeButtons.fire(this._buttons);
    this.saveButtons();
  }

  updateButton(id: string, updatedButton: Button) {
    const index = this._buttons.findIndex(b => b.id === id);
    if (index !== -1) {
      this._buttons[index] = { ...this._buttons[index], ...updatedButton };
      this._onDidChangeButtons.fire(this._buttons);
      this.saveButtons();
    }
  }

  deleteButton(id: string) {
    this._buttons = this._buttons.filter(b => b.id !== id);
    this._onDidChangeButtons.fire(this._buttons);
    this.saveButtons();
  }

  dispose() {
    this._onDidChangeButtons.dispose();
  }
}

export interface Button {
  id: string;
  name: string;
  command: string;
  args?: any[];
}
```

#### WebView Panel Implementation

```javascript
import * as vscode from 'vscode';
import * as path from 'path';

import { ButtonManager, Button } from '../buttons/buttonManager';

export class ButtonsPanel implements vscode.Disposable {
  private _panel: vscode.WebviewPanel | undefined;
  private _disposables: vscode.Disposable[] = [];

  constructor(
    private readonly _context: vscode.ExtensionContext,
    private readonly _buttonManager: ButtonManager
  ) {
    // Listen for button changes
    this._disposables.push(
      _buttonManager.onDidChangeButtons(() => {
        if (this._panel) {
          this._updateWebview();
        }
      })
    );
  }

  show() {
    if (this._panel) {
      // If panel already exists, reveal it
      this._panel.reveal();
      return;
    }

    // Create a new panel
    this._panel = vscode.window.createWebviewPanel(
      'buttonsPanel',
      'StreamDeck Buttons',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        localResourceRoots: [vscode.Uri.file(path.join(this._context.extensionPath, 'resources'))]
      }
    );

    // Set initial HTML content
    this._updateWebview();

    // Handle messages from the webview
    this._panel.webview.onDidReceiveMessage(
      message => {
        switch (message.command) {
          case 'addButton':
            this._buttonManager.addButton(message.button);
            break;
          case 'updateButton':
            this._buttonManager.updateButton(message.id, message.button);
            break;
          case 'deleteButton':
            this._buttonManager.deleteButton(message.id);
            break;
        }
      },
      null,
      this._disposables
    );

    // Clean up resources when panel is closed
    this._panel.onDidDispose(
      () => {
        this._panel = undefined;
      },
      null,
      this._disposables
    );
  }

  private _updateWebview() {
    if (!this._panel) {
      return;
    }

    const buttons = this._buttonManager.getButtons();
    this._panel.webview.html = this._getHtmlForWebview(buttons);
  }

  private _getHtmlForWebview(buttons: Button[]) {
    return `<!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>StreamDeck Buttons</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 20px; }
        .button-list { margin-bottom: 20px; }
        .button-item { padding: 10px; border: 1px solid #ccc; margin-bottom: 10px; }
        .form-group { margin-bottom: 10px; }
        label { display: block; margin-bottom: 5px; }
        input, select { width: 100%; padding: 5px; }
        button { padding: 8px 16px; background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; cursor: pointer; }
      </style>
    </head>
    <body>
      <h1>StreamDeck Buttons</h1>
      
      <div class="button-list">
        <h2>Your Buttons</h2>
        ${buttons.map(button => `
          <div class="button-item" data-id="${button.id}">
            <h3>${button.name}</h3>
            <p>Command: ${button.command}</p>
            <button onclick="editButton('${button.id}')">Edit</button>
            <button onclick="deleteButton('${button.id}')">Delete</button>
          </div>
        `).join('')}
      </div>
      
      <div class="button-form">
        <h2>Add New Button</h2>
        <div class="form-group">
          <label for="buttonName">Name</label>
          <input type="text" id="buttonName">
        </div>
        <div class="form-group">
          <label for="buttonCommand">Command</label>
          <input type="text" id="buttonCommand">
        </div>
        <button onclick="addButton()">Add Button</button>
      </div>

      <script>
        const vscode = acquireVsCodeApi();
        let currentEditId = null;
        
        function addButton() {
          const name = document.getElementById('buttonName').value;
          const command = document.getElementById('buttonCommand').value;
          
          if (!name || !command) return;
          
          const button = {
            id: Date.now().toString(),
            name,
            command
          };
          
          vscode.postMessage({
            command: 'addButton',
            button
          });
          
          document.getElementById('buttonName').value = '';
          document.getElementById('buttonCommand').value = '';
        }
        
        function editButton(id) {
          // Implementation for editing
        }
        
        function deleteButton(id) {
          vscode.postMessage({
            command: 'deleteButton',
            id
          });
        }
      </script>
    </body>
    </html>`;
  }

  dispose() {
    if (this._panel) {
      this._panel.dispose();
    }

    while (this._disposables.length) {
      const disposable = this._disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }
}
```

## Benefits of Modular Approach

1. **Maintainability**: Smaller, focused modules are easier to understand and maintain
2. **Extensibility**: New features can be added without modifying existing code
3. **Collaboration**: Team members can work on different modules simultaneously
4. **Code Reuse**: Modules can be reused in other projects or contexts

## Next Steps

1. Begin by creating the directory structure
2. Start extracting the button management functionality
3. Move on to communication modules
4. Finally, implement the UI components

## VS Code Extension API Best Practices

1. **Use TypeScript**: TypeScript provides better code completion, type checking, and makes maintenance easier.

2. **Properly Dispose Resources**: Always implement the `vscode.Disposable` interface and clean up resources in the `dispose()` method.

3. **Use Event Emitters**: For components that need to communicate state changes, use `vscode.EventEmitter`.

4. **Security in WebViews**:
   - Always use Content Security Policy (CSP) to prevent XSS attacks
   - Use `localResourceRoots` to restrict which local resources the webview can load
   - Validate all messages received from webviews

5. **Extension Activation**: Use specific activation events in `package.json` to ensure your extension only loads when needed.

6. **Error Handling**: Implement proper error handling and provide meaningful error messages to users.

7. **Settings**: Use VS Code's configuration API for user settings instead of custom storage mechanisms when appropriate.

8. **Performance**: Avoid blocking the main thread with long-running operations; use asynchronous APIs where possible.
