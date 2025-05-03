const vscode = require('vscode');
const fs = require('fs');
const path = require('path');

/**
 * Manages StreamDeck button configurations
 * Handles loading, saving, adding, updating, and deleting buttons
 */
class ButtonManager {
  /**
   * @type {Button[]}
   * @private
   */
  _buttons = [];
  
  /**
   * @type {vscode.EventEmitter<Button[]>}
   * @private
   */
  _onDidChangeButtons = new vscode.EventEmitter();
  
  /**
   * Event that fires when buttons change
   */
  onDidChangeButtons = this._onDidChangeButtons.event;
  
  /**
   * @type {string}
   * @private
   */
  _buttonsFile;

  /**
   * Creates a new ButtonManager
   * @param {vscode.ExtensionContext} context Extension context
   */
  constructor(context) {
    // Get buttons file path from settings or use default
    const config = vscode.workspace.getConfiguration('windsurfer');
    const configPath = config.get('buttonsFilePath');
    
    if (configPath) {
      this._buttonsFile = configPath;
    } else {
      this._buttonsFile = path.join(context.extensionPath, 'buttons.json');
    }
    
    // Load buttons from file
    this._loadButtons();
    
    // Set up auto-refresh if enabled
    const refreshInterval = config.get('refreshInterval');
    if (refreshInterval > 0) {
      this._refreshInterval = setInterval(() => {
        this._loadButtons();
      }, refreshInterval);
    }
    
    // Listen for configuration changes
    context.subscriptions.push(
      vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('windsurfer.buttonsFilePath')) {
          const newPath = vscode.workspace.getConfiguration('windsurfer').get('buttonsFilePath');
          if (newPath) {
            this._buttonsFile = newPath;
          } else {
            this._buttonsFile = path.join(context.extensionPath, 'buttons.json');
          }
          this._loadButtons();
        }
        
        if (e.affectsConfiguration('windsurfer.refreshInterval')) {
          if (this._refreshInterval) {
            clearInterval(this._refreshInterval);
          }
          
          const newInterval = vscode.workspace.getConfiguration('windsurfer').get('refreshInterval');
          if (newInterval > 0) {
            this._refreshInterval = setInterval(() => {
              this._loadButtons();
            }, newInterval);
          }
        }
      })
    );
  }

  /**
   * Loads buttons from the configuration file
   * @private
   */
  _loadButtons() {
    try {
      if (fs.existsSync(this._buttonsFile)) {
        const content = fs.readFileSync(this._buttonsFile, 'utf8');
        this._buttons = JSON.parse(content);
        this._onDidChangeButtons.fire(this._buttons);
      } else {
        // Create empty buttons file if it doesn't exist
        this._buttons = [];
        this.saveButtons();
      }
    } catch (err) {
      vscode.window.showErrorMessage(`Failed to load buttons: ${err.message}`);
    }
  }

  /**
   * Saves buttons to the configuration file
   */
  saveButtons() {
    try {
      fs.writeFileSync(this._buttonsFile, JSON.stringify(this._buttons, null, 2));
    } catch (err) {
      vscode.window.showErrorMessage(`Failed to save buttons: ${err.message}`);
    }
  }

  /**
   * Gets all buttons
   * @returns {Button[]} Array of buttons
   */
  getButtons() {
    return [...this._buttons];
  }

  /**
   * Adds a new button
   * @param {Button} button Button to add
   */
  addButton(button) {
    // Ensure button has an ID
    if (!button.id) {
      button.id = Date.now().toString();
    }
    
    this._buttons.push(button);
    this._onDidChangeButtons.fire(this._buttons);
    this.saveButtons();
    
    return button;
  }

  /**
   * Updates an existing button
   * @param {string} id ID of the button to update
   * @param {Button} updatedButton Updated button data
   * @returns {Button|null} Updated button or null if not found
   */
  updateButton(id, updatedButton) {
    const index = this._buttons.findIndex(b => b.id === id);
    if (index !== -1) {
      // Preserve the ID
      updatedButton.id = id;
      this._buttons[index] = updatedButton;
      this._onDidChangeButtons.fire(this._buttons);
      this.saveButtons();
      return this._buttons[index];
    }
    return null;
  }

  /**
   * Deletes a button
   * @param {string} id ID of the button to delete
   * @returns {boolean} True if button was deleted, false otherwise
   */
  deleteButton(id) {
    const initialLength = this._buttons.length;
    this._buttons = this._buttons.filter(b => b.id !== id);
    
    if (this._buttons.length !== initialLength) {
      this._onDidChangeButtons.fire(this._buttons);
      this.saveButtons();
      return true;
    }
    return false;
  }

  /**
   * Disposes of resources
   */
  dispose() {
    if (this._refreshInterval) {
      clearInterval(this._refreshInterval);
    }
    this._onDidChangeButtons.dispose();
  }
}

/**
 * @typedef {Object} Button
 * @property {string} id Unique identifier for the button
 * @property {string} name Display name for the button
 * @property {string} command VS Code command to execute
 * @property {any} [args] Optional arguments for the command
 */

module.exports = { ButtonManager };
