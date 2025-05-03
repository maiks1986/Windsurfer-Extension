const vscode = require('vscode');

/**
 * Handles sending messages to different targets
 */
class MessageSender {
  /**
   * Sends a message to the appropriate target based on configuration
   * @param {string} message - The message to send
   */
  sendMessage(message) {
    if (!message) return;
    
    // Get configuration
    const config = vscode.workspace.getConfiguration('windsurfer');
    const inputMethod = config.get('inputMethod') || 'cursor';
    
    if (inputMethod === 'cursor') {
      // Traditional method: Insert at cursor position
      this._sendToCursor(message);
    } else if (inputMethod === 'direct') {
      // Direct method: Send directly to Windsurf chat DOM element
      this._sendDirectToWindsurfChat(message);
    } else {
      // Unknown method, show notification
      vscode.window.showInformationMessage(`Message received (unknown input method): ${message}`);
    }
  }

  /**
   * Sends a message to the cursor position in the active editor
   * @param {string} message - The message to send
   * @private
   */
  _sendToCursor(message) {
    const editor = vscode.window.activeTextEditor;
    if (editor) {
      const position = editor.selection.active;
      editor.edit(editBuilder => {
        editBuilder.insert(position, message);
      });
    } else {
      // If no editor is active, show the message in a notification
      vscode.window.showInformationMessage(`Message received: ${message}`);
    }
  }

  /**
   * Sends a message directly to the Windsurf chat DOM element
   * @param {string} message - The message to send
   * @private
   */
  _sendDirectToWindsurfChat(message) {
    try {
      // Get the active webview panel if it exists
      const webviewPanel = vscode.window.activeTextEditor?.document?.uri?.scheme === 'vscode-webview' ? 
        vscode.window.activeTextEditor : null;
      
      if (!webviewPanel) {
        // If no webview is active, try to find the Windsurf webview
        vscode.window.showInformationMessage('Please make sure the Windsurf chat is open and focused');
        return;
      }
      
      // Use the Electron webContents API to execute JavaScript in the webview
      // This requires access to the Electron API which is available in VSCode extensions
      const webContents = webviewPanel._webview?._webContents;
      
      if (!webContents) {
        vscode.window.showErrorMessage('Could not access the webview contents');
        return;
      }
      
      // Execute JavaScript in the webview to set the text in the chat input element
      webContents.executeJavaScript(`
        (function() {
          try {
            // Find the chat input element
            const chatInput = document.getElementById('cascade-input');
            if (!chatInput) {
              console.error('Could not find chat input element with ID "cascade-input"');
              return false;
            }
            
            // Set the text content
            // For contenteditable divs, we need to create a proper DOM structure
            const p = document.createElement('p');
            p.className = 'text-sm';
            p.setAttribute('dir', 'ltr');
            
            const span = document.createElement('span');
            span.setAttribute('data-lexical-text', 'true');
            span.textContent = ${JSON.stringify(message)};
            
            p.appendChild(span);
            
            // Clear existing content and add our new content
            chatInput.innerHTML = '';
            chatInput.appendChild(p);
            
            // Focus the element and dispatch input event to trigger any listeners
            chatInput.focus();
            chatInput.dispatchEvent(new Event('input', { bubbles: true }));
            
            return true;
          } catch (err) {
            console.error('Error setting chat input text:', err);
            return false;
          }
        })();
      `).then(result => {
        if (result) {
          console.log(`Successfully set text in Windsurf chat: ${message}`);
        } else {
          console.error('Failed to set text in Windsurf chat');
          vscode.window.showErrorMessage('Failed to set text in Windsurf chat. Make sure the chat is open and focused.');
        }
      }).catch(error => {
        console.error('Error executing JavaScript in webview:', error);
        vscode.window.showErrorMessage(`Error setting text in Windsurf chat: ${error.message}`);
      });
    } catch (error) {
      console.error('Error sending directly to Windsurf chat:', error);
      vscode.window.showErrorMessage(`Error sending directly to Windsurf chat: ${error.message}`);
    }
  }

  /**
   * Disposes of resources
   */
  dispose() {
    // No resources to dispose
  }
}

module.exports = { MessageSender };
