const vscode = require('vscode');
const { MessageSender } = require('./messageSender');

/**
 * Handles messages from StreamDeck clients
 */
class MessageHandler {
  /**
   * Creates a new MessageHandler
   * @param {import('../buttons/buttonManager').ButtonManager} buttonManager - Button manager instance
   */
  constructor(buttonManager) {
    this._buttonManager = buttonManager;
    this._messageSender = new MessageSender();
  }

  /**
   * Handles an incoming message
   * @param {Object} message - The message to handle
   * @returns {Object|null} Response message or null if no response is needed
   */
  handleMessage(message) {
    if (!message || typeof message !== 'object') {
      return { error: 'Invalid message format' };
    }

    // Every message should have a type
    if (!message.type) {
      return { error: 'Missing message type' };
    }

    switch (message.type) {
      case 'getButtons':
        return this._handleGetButtons();
      
      case 'executeCommand':
        return this._handleExecuteCommand(message);
      
      case 'addButton':
        return this._handleAddButton(message);
      
      case 'updateButton':
        return this._handleUpdateButton(message);
      
      case 'deleteButton':
        return this._handleDeleteButton(message);
      
      case 'insertText':
        return this._handleInsertText(message);
      
      case 'ping':
        return { type: 'pong', timestamp: Date.now() };
      
      default:
        return { error: `Unknown message type: ${message.type}` };
    }
  }

  /**
   * Handles a request to get all buttons
   * @private
   * @returns {Object} Response with buttons
   */
  _handleGetButtons() {
    const buttons = this._buttonManager.getButtons();
    return {
      type: 'buttons',
      buttons
    };
  }

  /**
   * Handles a request to execute a command
   * @private
   * @param {Object} message - The message containing command details
   * @returns {Object} Response with execution result
   */
  _handleExecuteCommand(message) {
    if (!message.command) {
      return { error: 'Missing command' };
    }

    try {
      // Execute the command
      vscode.commands.executeCommand(message.command, ...(message.args || []));
      
      return {
        type: 'commandResult',
        success: true
      };
    } catch (err) {
      console.error('Error executing command:', err);
      return {
        type: 'commandResult',
        success: false,
        error: err.message
      };
    }
  }

  /**
   * Handles a request to add a button
   * @private
   * @param {Object} message - The message containing button details
   * @returns {Object} Response with the added button
   */
  _handleAddButton(message) {
    if (!message.button) {
      return { error: 'Missing button data' };
    }

    if (!message.button.name || !message.button.command) {
      return { error: 'Button must have a name and command' };
    }

    try {
      const button = this._buttonManager.addButton(message.button);
      
      return {
        type: 'buttonAdded',
        button
      };
    } catch (err) {
      console.error('Error adding button:', err);
      return {
        type: 'error',
        error: err.message
      };
    }
  }

  /**
   * Handles a request to update a button
   * @private
   * @param {Object} message - The message containing button details
   * @returns {Object} Response with the updated button
   */
  _handleUpdateButton(message) {
    if (!message.id) {
      return { error: 'Missing button ID' };
    }

    if (!message.button) {
      return { error: 'Missing button data' };
    }

    if (!message.button.name || !message.button.command) {
      return { error: 'Button must have a name and command' };
    }

    try {
      const button = this._buttonManager.updateButton(message.id, message.button);
      
      if (!button) {
        return {
          type: 'error',
          error: `Button with ID ${message.id} not found`
        };
      }
      
      return {
        type: 'buttonUpdated',
        button
      };
    } catch (err) {
      console.error('Error updating button:', err);
      return {
        type: 'error',
        error: err.message
      };
    }
  }

  /**
   * Handles a request to delete a button
   * @private
   * @param {Object} message - The message containing button ID
   * @returns {Object} Response with deletion result
   */
  _handleDeleteButton(message) {
    if (!message.id) {
      return { error: 'Missing button ID' };
    }

    try {
      const success = this._buttonManager.deleteButton(message.id);
      
      return {
        type: 'buttonDeleted',
        id: message.id,
        success
      };
    } catch (err) {
      console.error('Error deleting button:', err);
      return {
        type: 'error',
        error: err.message
      };
    }
  }

  /**
   * Handles a request to insert text
   * @private
   * @param {Object} message - The message containing text to insert
   * @returns {Object} Response with insertion result
   */
  _handleInsertText(message) {
    if (!message.text) {
      return { error: 'Missing text' };
    }

    try {
      // Send the text to the appropriate target
      this._messageSender.sendMessage(message.text);
      
      return {
        type: 'textInserted',
        success: true
      };
    } catch (err) {
      console.error('Error inserting text:', err);
      return {
        type: 'textInserted',
        success: false,
        error: err.message
      };
    }
  }

  /**
   * Disposes of resources
   */
  dispose() {
    if (this._messageSender) {
      this._messageSender.dispose();
    }
  }
}

module.exports = { MessageHandler };
