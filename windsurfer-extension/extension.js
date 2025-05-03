/**
 * Main entry point for the Windsurfer Extension
 * This file imports from the modular structure and coordinates the extension activation/deactivation
 */

// Import core extension module
const extension = require('./src/extension');

/**
 * Activates the extension
 * @param {import('vscode').ExtensionContext} context - Extension context
 */
function activate(context) {
    // Delegate to the core implementation
    extension.activate(context);
}

/**
 * Deactivates the extension
 */
function deactivate() {
    // Delegate to the core implementation
    extension.deactivate();
}

module.exports = {
    activate,
    deactivate
};
