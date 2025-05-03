const vscode = require('vscode');
const { ButtonManager } = require('./buttons/buttonManager');
const { setupServers } = require('./communication/servers');
const { MessageHandler } = require('./communication/messageHandler');
const { MessageSender } = require('./communication/messageSender');
const { Discovery } = require('./communication/discovery');
const { ButtonsPanel } = require('./ui/buttonsPanel');

/**
 * Activates the extension
 * @param {vscode.ExtensionContext} context - Extension context
 */
function activate(context) {
  console.log('Activating Windsurfer Extension');
  
  // Initialize button manager
  const buttonManager = new ButtonManager(context);
  
  // Initialize message handler
  const messageHandler = new MessageHandler(buttonManager);
  
  // Get server configuration
  const config = vscode.workspace.getConfiguration('windsurfer');
  const serverInfo = {
    websocketPort: config.get('websocketPort'),
    namedPipeName: config.get('namedPipeName'),
    unixSocketPath: config.get('unixSocketPath')
  };
  
  // Setup communication servers
  const servers = setupServers(messageHandler);
  
  // Initialize discovery service
  const discovery = new Discovery(serverInfo);
  
  // Register commands
  
  // Command to open buttons panel
  context.subscriptions.push(
    vscode.commands.registerCommand('windsurfer.openButtonsPanel', () => {
      ButtonsPanel.createOrShow(context, buttonManager);
    })
  );
  
  // Command to show the quick communication panel (legacy)
  context.subscriptions.push(
    vscode.commands.registerCommand('windsurfer.showPanel', () => {
      vscode.window.showInformationMessage('Please use the new Buttons Panel instead');
      vscode.commands.executeCommand('windsurfer.openButtonsPanel');
    })
  );
  
  // Command to add a button (legacy)
  context.subscriptions.push(
    vscode.commands.registerCommand('windsurfer.addButton', async () => {
      const name = await vscode.window.showInputBox({
        prompt: 'Enter button name',
        placeHolder: 'Button Name'
      });
      
      if (!name) return;
      
      const command = await vscode.window.showInputBox({
        prompt: 'Enter VS Code command',
        placeHolder: 'Command (e.g., editor.action.formatDocument)'
      });
      
      if (!command) return;
      
      const button = {
        id: Date.now().toString(),
        name,
        command
      };
      
      buttonManager.addButton(button);
      vscode.window.showInformationMessage(`Button '${name}' added successfully`);
    })
  );
  
  // Command to delete a button (legacy)
  context.subscriptions.push(
    vscode.commands.registerCommand('windsurfer.deleteButton', async () => {
      const buttons = buttonManager.getButtons();
      
      if (buttons.length === 0) {
        vscode.window.showInformationMessage('No buttons to delete');
        return;
      }
      
      const buttonItems = buttons.map(button => ({
        label: button.name,
        detail: button.command,
        id: button.id
      }));
      
      const selected = await vscode.window.showQuickPick(buttonItems, {
        placeHolder: 'Select a button to delete'
      });
      
      if (!selected) return;
      
      buttonManager.deleteButton(selected.id);
      vscode.window.showInformationMessage(`Button '${selected.label}' deleted successfully`);
    })
  );
  
  // Command to restart servers
  context.subscriptions.push(
    vscode.commands.registerCommand('windsurfer.restartServers', () => {
      // Dispose current servers
      servers.forEach(server => server.dispose());
      
      // Setup new servers
      const newServers = setupServers(messageHandler);
      
      // Replace servers in context.subscriptions
      const index = context.subscriptions.findIndex(s => s === servers[0]);
      if (index !== -1) {
        context.subscriptions.splice(index, servers.length, ...newServers);
      } else {
        // Add new servers to subscriptions
        context.subscriptions.push(...newServers);
      }
      
      vscode.window.showInformationMessage('Communication servers restarted successfully');
    })
  );
  
  // Add all disposables to context.subscriptions
  context.subscriptions.push(buttonManager, messageHandler, discovery);
  context.subscriptions.push(...servers);
  
  console.log('Windsurfer Extension activated');
}

/**
 * Deactivates the extension
 */
function deactivate() {
  console.log('Windsurfer Extension deactivated');
}

module.exports = {
  activate,
  deactivate
};
