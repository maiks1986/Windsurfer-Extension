const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const net = require('net');
const dgram = require('dgram');
const os = require('os');

let buttonsPanel = undefined;
let websocketServer = undefined;
let namedPipeServer = undefined;
let unixSocketServer = undefined;
let discoveryServer = undefined;
let discoveryInterval = undefined;
let buttonsRefreshInterval = undefined;
let buttons = [];
let categories = ['quick-responses', 'code-snippets'];
let defaultButtons = [
    {
        id: 'continue',
        label: 'Continue',
        message: 'Please continue.',
        color: '#4CAF50',
        category: 'quick-responses'
    }
];

// Track connected clients
let connectedClients = [];

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
    console.log('Windsurfer extension is now active');

    // Load buttons from configuration file
    loadButtonsFromFile();

    // Start communication servers
    startCommunicationServers();

    // Start discovery service
    startDiscoveryService();

    // Register commands
    context.subscriptions.push(
        vscode.commands.registerCommand('windsurfer.showPanel', showButtonsPanel),
        vscode.commands.registerCommand('windsurfer.addButton', addButton),
        vscode.commands.registerCommand('windsurfer.deleteButton', deleteButton),
        vscode.commands.registerCommand('windsurfer.restartServers', restartCommunicationServers)
    );

    // Set up file watcher for buttons configuration file
    setupFileWatcher();

    // Set up refresh interval
    setupRefreshInterval();
}

function deactivate() {
    // Close all servers and intervals
    if (websocketServer) {
        websocketServer.close();
    }
    
    if (namedPipeServer) {
        namedPipeServer.close();
    }
    
    if (unixSocketServer) {
        unixSocketServer.close();
        
        // Clean up the socket file
        const config = vscode.workspace.getConfiguration('windsurfer');
        const socketPath = config.get('unixSocketPath') || '/tmp/windsurfer-communication.sock';
        
        if (fs.existsSync(socketPath)) {
            try {
                fs.unlinkSync(socketPath);
                console.log(`Removed Unix Socket file: ${socketPath}`);
            } catch (error) {
                console.error(`Error removing Unix Socket file: ${error.message}`);
            }
        }
    }
    
    if (discoveryServer) {
        discoveryServer.close();
    }
    
    if (discoveryInterval) {
        clearInterval(discoveryInterval);
    }
    
    if (buttonsRefreshInterval) {
        clearInterval(buttonsRefreshInterval);
    }
    
    // Clear connected clients
    connectedClients = [];
}

function loadButtonsFromFile() {
    const config = vscode.workspace.getConfiguration('windsurfer');
    const filePath = config.get('buttonsFilePath');
    
    if (!filePath) {
        buttons = [...defaultButtons];
        return;
    }

    try {
        if (fs.existsSync(filePath)) {
            const fileContent = fs.readFileSync(filePath, 'utf8');
            const loadedButtons = JSON.parse(fileContent);
            buttons = [...defaultButtons, ...loadedButtons];
        } else {
            buttons = [...defaultButtons];
            // Create the file with default buttons
            saveButtonsToFile();
        }
    } catch (error) {
        vscode.window.showErrorMessage(`Error loading buttons: ${error.message}`);
        buttons = [...defaultButtons];
    }
}

function saveButtonsToFile() {
    const config = vscode.workspace.getConfiguration('windsurfer');
    const filePath = config.get('buttonsFilePath');
    
    if (!filePath) {
        vscode.window.showInformationMessage('No buttons file path configured. Please set one in settings.');
        return;
    }

    try {
        // Filter out default buttons before saving
        const customButtons = buttons.filter(button => button.id !== 'continue');
        fs.writeFileSync(filePath, JSON.stringify(customButtons, null, 2), 'utf8');
    } catch (error) {
        vscode.window.showErrorMessage(`Error saving buttons: ${error.message}`);
    }
}

function setupFileWatcher() {
    const config = vscode.workspace.getConfiguration('windsurfer');
    const filePath = config.get('buttonsFilePath');
    
    if (!filePath) {
        return;
    }

    const fileWatcher = vscode.workspace.createFileSystemWatcher(filePath);
    
    fileWatcher.onDidChange(() => {
        loadButtonsFromFile();
        if (buttonsPanel) {
            updateButtonsPanel();
        }
    });
}

function setupRefreshInterval() {
    const config = vscode.workspace.getConfiguration('windsurfer');
    const refreshInterval = config.get('refreshInterval');
    
    if (buttonsRefreshInterval) {
        clearInterval(buttonsRefreshInterval);
    }
    
    if (refreshInterval > 0) {
        buttonsRefreshInterval = setInterval(() => {
            loadButtonsFromFile();
            if (buttonsPanel) {
                updateButtonsPanel();
            }
        }, refreshInterval);
    }
}

function startCommunicationServers() {
    const config = vscode.workspace.getConfiguration('windsurfer');
    const platform = os.platform();
    
    console.log(`Detected platform: ${platform}`);
    
    // Start WebSocket server (cross-platform)
    startWebSocketServer(config);
    
    // Start platform-specific IPC server
    if (platform === 'win32') {
        // Windows: Use Named Pipes
        console.log('Starting Named Pipe server for Windows');
        startNamedPipeServer(config);
    } else if (platform === 'darwin' || platform === 'linux') {
        // macOS/Linux: Use Unix Domain Sockets
        console.log('Starting Unix Domain Socket server for macOS/Linux');
        startUnixSocketServer(config);
    }
    
    // Start discovery service
    startDiscoveryService();
}

function restartCommunicationServers() {
    // Close existing servers
    if (websocketServer) {
        websocketServer.close();
        websocketServer = undefined;
    }
    
    if (namedPipeServer) {
        namedPipeServer.close();
        namedPipeServer = undefined;
    }
    
    // Restart servers
    startCommunicationServers();
    
    // Restart discovery service
    startDiscoveryService();
    
    vscode.window.showInformationMessage('Windsurfer communication servers restarted');
}

function startWebSocketServer(config) {
    // Get port from config, default to 8765
    const port = config.get('websocketPort') || 8765;
    
    if (websocketServer) {
        websocketServer.close();
    }
    
    try {
        websocketServer = new WebSocket.Server({ port });
        
        websocketServer.on('connection', (ws) => {
            console.log('StreamDeck client connected via WebSocket');
            
            // Add to connected clients
            const clientId = Date.now().toString();
            connectedClients.push({
                id: clientId,
                type: 'websocket',
                send: (data) => {
                    if (ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify(data));
                    }
                },
                connection: ws
            });
            
            // Handle messages
            ws.on('message', (message) => {
                handleClientMessage(message, clientId);
            });
            
            // Handle disconnection
            ws.on('close', () => {
                console.log('StreamDeck client disconnected from WebSocket');
                connectedClients = connectedClients.filter(client => client.id !== clientId);
            });
        });
        
        console.log(`WebSocket server started on port ${port}`);
    } catch (error) {
        console.error('Error starting WebSocket server:', error);
        vscode.window.showErrorMessage(`Error starting WebSocket server: ${error.message}`);
    }
}

function startNamedPipeServer(config) {
    // Get pipe name from config, default to windsurfer-communication
    const namedPipeName = config.get('namedPipeName') || 'windsurfer-communication';
    const pipePath = `\\\\.\\pipe\\${namedPipeName}`;
    
    if (namedPipeServer) {
        namedPipeServer.close();
    }
    
    try {
        namedPipeServer = net.createServer((socket) => {
            console.log('StreamDeck client connected via Named Pipe');
            
            // Add to connected clients
            const clientId = Date.now().toString();
            connectedClients.push({
                id: clientId,
                type: 'namedPipe',
                send: (data) => {
                    socket.write(JSON.stringify(data) + '\n');
                },
                connection: socket
            });
            
            // Buffer for incomplete messages
            let buffer = '';
            
            // Handle data
            socket.on('data', (data) => {
                buffer += data.toString();
                
                // Split by newline to handle multiple messages
                const messages = buffer.split('\n');
                buffer = messages.pop(); // Keep the last incomplete message in the buffer
                
                // Process complete messages
                for (const message of messages) {
                    if (message.trim()) {
                        handleClientMessage(message, clientId);
                    }
                }
            });
            
            // Handle disconnection
            socket.on('close', () => {
                console.log('StreamDeck client disconnected from Named Pipe');
                connectedClients = connectedClients.filter(client => client.id !== clientId);
            });
            
            socket.on('error', (error) => {
                console.error('Named Pipe socket error:', error);
            });
        });
        
        namedPipeServer.listen(pipePath, () => {
            console.log(`Named Pipe server started at ${pipePath}`);
        });
        
        namedPipeServer.on('error', (error) => {
            console.error('Named Pipe server error:', error);
            vscode.window.showErrorMessage(`Error with Named Pipe server: ${error.message}`);
        });
    } catch (error) {
        console.error('Error starting Named Pipe server:', error);
        vscode.window.showErrorMessage(`Error starting Named Pipe server: ${error.message}`);
    }
}

/**
 * Start a Unix Domain Socket server for macOS and Linux platforms
 * @param {vscode.WorkspaceConfiguration} config - The extension configuration
 */
function startUnixSocketServer(config) {
    // Get socket path from config
    const socketPath = config.get('unixSocketPath') || '/tmp/windsurfer-communication.sock';
    
    // Close existing server if it exists
    if (unixSocketServer) {
        unixSocketServer.close();
    }
    
    try {
        // Remove existing socket file if it exists
        if (fs.existsSync(socketPath)) {
            fs.unlinkSync(socketPath);
        }
        
        // Create the server
        unixSocketServer = net.createServer((socket) => {
            console.log('StreamDeck client connected via Unix Socket');
            
            // Add to connected clients
            const clientId = Date.now().toString();
            connectedClients.push({
                id: clientId,
                type: 'unixSocket',
                send: (data) => {
                    socket.write(JSON.stringify(data) + '\n');
                },
                connection: socket
            });
            
            // Buffer for incomplete messages
            let buffer = '';
            
            // Handle data
            socket.on('data', (data) => {
                buffer += data.toString();
                
                // Split by newline to handle multiple messages
                const messages = buffer.split('\n');
                buffer = messages.pop(); // Keep the last incomplete message in the buffer
                
                // Process complete messages
                for (const message of messages) {
                    if (message.trim()) {
                        handleClientMessage(message, clientId);
                    }
                }
            });
            
            // Handle disconnection
            socket.on('close', () => {
                console.log('StreamDeck client disconnected from Unix Socket');
                connectedClients = connectedClients.filter(client => client.id !== clientId);
            });
            
            socket.on('error', (error) => {
                console.error('Unix Socket error:', error);
            });
        });
        
        unixSocketServer.listen(socketPath, () => {
            console.log(`Unix Socket server started at ${socketPath}`);
            
            // Set appropriate permissions on the socket file
            try {
                fs.chmodSync(socketPath, 0o777); // Make socket accessible to all users
            } catch (err) {
                console.error('Error setting socket permissions:', err);
            }
        });
        
        unixSocketServer.on('error', (error) => {
            console.error('Unix Socket server error:', error);
            vscode.window.showErrorMessage(`Error with Unix Socket server: ${error.message}`);
        });
    } catch (error) {
        console.error('Error starting Unix Socket server:', error);
        vscode.window.showErrorMessage(`Error starting Unix Socket server: ${error.message}`);
    }
}

function startDiscoveryService() {
    // Get configuration
    const config = vscode.workspace.getConfiguration('windsurfer');
    const discoveryEnabled = config.get('discoveryEnabled') !== false; // Default to true
    
    if (!discoveryEnabled) {
        return;
    }
    
    // Clean up existing discovery service
    if (discoveryServer) {
        discoveryServer.close();
    }
    
    if (discoveryInterval) {
        clearInterval(discoveryInterval);
    }
    
    // Get discovery port from config, default to 8766
    const discoveryPort = config.get('discoveryPort') || 8766;
    const websocketPort = config.get('websocketPort') || 8765;
    const pipeName = config.get('namedPipeName') || 'windsurfer-communication';
    
    try {
        // Create UDP socket for discovery
        discoveryServer = dgram.createSocket('udp4');
        
        // Handle discovery requests
        discoveryServer.on('message', (msg, rinfo) => {
            try {
                const data = JSON.parse(msg.toString());
                
                if (data.type === 'discovery' && data.service === 'windsurfer' && data.role === 'streamdeck') {
                    // Get platform information
                    const platform = os.platform();
                    let preferredConnection = 'websocket'; // Default fallback
                    
                    // Determine preferred connection based on platform
                    if (platform === 'win32') {
                        preferredConnection = 'namedPipe';
                    } else if (platform === 'darwin' || platform === 'linux') {
                        preferredConnection = 'unixSocket';
                    }
                    
                    // Send response with connection details
                    const response = {
                        type: 'discovery',
                        service: 'windsurfer',
                        role: 'vscode',
                        platform: platform,
                        preferredConnection: preferredConnection,
                        connections: [
                            {
                                type: 'websocket',
                                host: getLocalIpAddress(),
                                port: websocketPort
                            }
                        ]
                    };
                    
                    // Add platform-specific connection options
                    if (platform === 'win32') {
                        response.connections.push({
                            type: 'namedPipe',
                            pipeName: pipeName
                        });
                    } else if (platform === 'darwin' || platform === 'linux') {
                        const socketPath = config.get('unixSocketPath') || '/tmp/windsurfer-communication.sock';
                        response.connections.push({
                            type: 'unixSocket',
                            socketPath: socketPath
                        });
                    }
                    
                    const responseBuffer = Buffer.from(JSON.stringify(response));
                    discoveryServer.send(responseBuffer, rinfo.port, rinfo.address);
                    
                    console.log(`Sent discovery response to ${rinfo.address}:${rinfo.port}`);
                }
            } catch (error) {
                console.error('Error processing discovery message:', error);
            }
        });
        
        // Handle errors
        discoveryServer.on('error', (error) => {
            console.error('Discovery server error:', error);
        });
        
        // Bind to port
        discoveryServer.bind(discoveryPort, () => {
            console.log(`Discovery server listening on port ${discoveryPort}`);
            
            // Enable broadcast
            discoveryServer.setBroadcast(true);
        });
        
        // Periodically broadcast presence
        const broadcastInterval = config.get('discoveryInterval') || 10000; // Default to 10 seconds
        discoveryInterval = setInterval(() => {
            const platform = os.platform();
            let preferredConnection = 'websocket'; // Default fallback
            
            // Determine preferred connection based on platform
            if (platform === 'win32') {
                preferredConnection = 'namedPipe';
            } else if (platform === 'darwin' || platform === 'linux') {
                preferredConnection = 'unixSocket';
            }
            
            const announcement = {
                type: 'discovery',
                service: 'windsurfer',
                role: 'vscode',
                platform: platform,
                preferredConnection: preferredConnection,
                connections: [
                    {
                        type: 'websocket',
                        host: getLocalIpAddress(),
                        port: websocketPort
                    }
                ]
            };
            
            // Add platform-specific connection options
            if (platform === 'win32') {
                announcement.connections.push({
                    type: 'namedPipe',
                    pipeName: pipeName
                });
            } else if (platform === 'darwin' || platform === 'linux') {
                const socketPath = config.get('unixSocketPath') || '/tmp/windsurfer-communication.sock';
                announcement.connections.push({
                    type: 'unixSocket',
                    socketPath: socketPath
                });
            }
            
            const announcementBuffer = Buffer.from(JSON.stringify(announcement));
            discoveryServer.send(announcementBuffer, discoveryPort, '255.255.255.255');
            
            console.log(`Broadcast discovery announcement for platform: ${platform}`);
        }, broadcastInterval);
    } catch (error) {
        console.error('Error starting discovery service:', error);
        vscode.window.showErrorMessage(`Error starting discovery service: ${error.message}`);
    }
}

function getLocalIpAddress() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            // Skip internal and non-IPv4 addresses
            if (!iface.internal && iface.family === 'IPv4') {
                return iface.address;
            }
        }
    }
    return '127.0.0.1'; // Fallback to localhost
}

function handleClientMessage(messageData, clientId) {
    try {
        // Parse message if it's a string
        const data = typeof messageData === 'string' ? JSON.parse(messageData) : messageData;
        
        // Find the client
        const client = connectedClients.find(c => c.id === clientId);
        if (!client) {
            console.error(`Client ${clientId} not found`);
            return;
        }
        
        // Process based on message type
        switch (data.type) {
            case 'insertText':
                // Insert text at cursor position
                sendMessageToEditor(data.text);
                break;
                
            case 'executeCommand':
                // Execute a VSCode command
                executeVSCodeCommand(data.command, data.args, clientId);
                break;
                
            case 'getButtons':
                // Return list of buttons, optionally filtered by category
                sendButtonsList(clientId, data.category);
                break;
                
            case 'ping':
                // Respond with pong
                client.send({
                    type: 'pong',
                    id: data.id || null,
                    timestamp: Date.now()
                });
                break;
                
            case 'customAction':
                // Handle custom action
                handleCustomAction(data.action, data.parameters, clientId);
                break;
                
            default:
                // Unknown message type
                client.send({
                    type: 'error',
                    code: 'UNKNOWN_MESSAGE_TYPE',
                    message: `Unknown message type: ${data.type}`,
                    originalRequest: data
                });
                break;
        }
    } catch (error) {
        console.error('Error handling client message:', error);
        
        // Try to send error response
        try {
            const client = connectedClients.find(c => c.id === clientId);
            if (client) {
                client.send({
                    type: 'error',
                    code: 'MESSAGE_PROCESSING_ERROR',
                    message: error.message,
                    originalRequest: typeof messageData === 'string' ? messageData : null
                });
            }
        } catch (sendError) {
            console.error('Error sending error response:', sendError);
        }
    }
}

function executeVSCodeCommand(command, args = [], clientId) {
    try {
        // Execute the command
        vscode.commands.executeCommand(command, ...(Array.isArray(args) ? args : []))
            .then(result => {
                // Send success response
                const client = connectedClients.find(c => c.id === clientId);
                if (client) {
                    client.send({
                        type: 'commandResult',
                        command: command,
                        success: true,
                        result: result
                    });
                }
            })
            .catch(error => {
                // Send error response
                const client = connectedClients.find(c => c.id === clientId);
                if (client) {
                    client.send({
                        type: 'commandResult',
                        command: command,
                        success: false,
                        error: error.message
                    });
                }
            });
    } catch (error) {
        console.error(`Error executing command ${command}:`, error);
        
        // Send error response
        const client = connectedClients.find(c => c.id === clientId);
        if (client) {
            client.send({
                type: 'commandResult',
                command: command,
                success: false,
                error: error.message
            });
        }
    }
}

function sendButtonsList(clientId, category = null) {
    const client = connectedClients.find(c => c.id === clientId);
    if (!client) return;
    
    // Filter buttons by category if specified
    const filteredButtons = category 
        ? buttons.filter(button => button.category === category)
        : buttons;
    
    // Send buttons list
    client.send({
        type: 'buttonsList',
        buttons: filteredButtons,
        categories: categories
    });
}

function handleCustomAction(action, parameters, clientId) {
    const client = connectedClients.find(c => c.id === clientId);
    if (!client) return;
    
    // Handle different custom actions
    switch (action) {
        case 'refreshButtons':
            // Refresh buttons from file
            loadButtonsFromFile();
            sendButtonsList(clientId);
            break;
            
        case 'addButton':
            // Add a new button
            if (parameters && parameters.button) {
                const newButton = {
                    id: `button_${Date.now()}`,
                    label: parameters.button.label || 'New Button',
                    message: parameters.button.message || '',
                    color: parameters.button.color || '#007acc',
                    category: parameters.button.category || 'quick-responses'
                };
                
                buttons.push(newButton);
                saveButtonsToFile();
                
                // Update UI if panel is open
                if (buttonsPanel) {
                    updateButtonsPanel();
                }
                
                // Send success response
                client.send({
                    type: 'customEvent',
                    event: 'buttonAdded',
                    data: { button: newButton }
                });
            } else {
                // Send error response
                client.send({
                    type: 'error',
                    code: 'INVALID_PARAMETERS',
                    message: 'Missing button parameters',
                    originalRequest: { action, parameters }
                });
            }
            break;
            
        default:
            // Unknown action
            client.send({
                type: 'error',
                code: 'UNKNOWN_ACTION',
                message: `Unknown custom action: ${action}`,
                originalRequest: { action, parameters }
            });
            break;
    }
}

function sendMessageToEditor(message) {
    if (!message) return;
    
    // Get configuration
    const config = vscode.workspace.getConfiguration('windsurfer');
    const inputMethod = config.get('inputMethod') || 'cursor';
    
    if (inputMethod === 'cursor') {
        // Traditional method: Insert at cursor position
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
    } else if (inputMethod === 'windsurf') {
        // Windsurf method: Send to Windsurf chat input via PowerShell script
        sendToWindsurfChat(message);
    } else if (inputMethod === 'direct') {
        // Direct method: Send directly to Windsurf chat DOM element
        sendDirectToWindsurfChat(message);
    } else {
        // Unknown method, show notification
        vscode.window.showInformationMessage(`Message received (unknown input method): ${message}`);
    }
}

function sendToWindsurfChat(message) {
    try {
        // Get configuration
        const config = vscode.workspace.getConfiguration('windsurfer');
        const scriptPath = config.get('windsurfScriptPath') || '';
        
        if (scriptPath && fs.existsSync(scriptPath)) {
            // Execute the PowerShell script with the message
            const terminal = vscode.window.createTerminal('Windsurfer');
            terminal.sendText(`powershell -ExecutionPolicy Bypass -File "${scriptPath}" -Message "${message.replace(/"/g, '\"')}"`);
            terminal.hide(); // Hide the terminal after sending
            
            console.log(`Sent message to Windsurf via script: ${message}`);
        } else {
            // Try to find Windsurf window and send directly
            // This is a fallback if the script path is not configured
            // Note: This requires the Send-WindsurfChat.ps1 script to be in the extension directory
            const extensionPath = vscode.extensions.getExtension('windsurfer').extensionPath;
            const defaultScriptPath = path.join(extensionPath, 'Send-WindsurfChat.ps1');
            
            if (fs.existsSync(defaultScriptPath)) {
                const terminal = vscode.window.createTerminal('Windsurfer');
                terminal.sendText(`powershell -ExecutionPolicy Bypass -File "${defaultScriptPath}" -Message "${message.replace(/"/g, '\"')}"`);
                terminal.hide(); // Hide the terminal after sending
                
                console.log(`Sent message to Windsurf via default script: ${message}`);
            } else {
                // No script available, show error
                vscode.window.showErrorMessage('Windsurf script not found. Please configure the script path in settings.');
            }
        }
    } catch (error) {
        console.error('Error sending to Windsurf chat:', error);
        vscode.window.showErrorMessage(`Error sending to Windsurf chat: ${error.message}`);
    }
}

/**
 * Send a message directly to the Windsurf chat DOM element
 * This uses the Electron IPC bridge to access the DOM and insert text into the chat input element
 * @param {string} message - The message to send to the chat
 */
function sendDirectToWindsurfChat(message) {
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
                    
                    // Optionally, simulate Enter key press to send the message
                    // Uncomment the following lines if you want to automatically send the message
                    /*
                    const enterEvent = new KeyboardEvent('keydown', {
                        key: 'Enter',
                        code: 'Enter',
                        keyCode: 13,
                        which: 13,
                        bubbles: true
                    });
                    chatInput.dispatchEvent(enterEvent);
                    */
                    
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

function showButtonsPanel() {
    if (buttonsPanel) {
        buttonsPanel.reveal();
        return;
    }
    
    buttonsPanel = vscode.window.createWebviewPanel(
        'windsurferButtons',
        'Windsurfer Quick Communication',
        vscode.ViewColumn.Beside,
        {
            enableScripts: true,
            retainContextWhenHidden: true
        }
    );
    
    updateButtonsPanel();
    
    buttonsPanel.onDidDispose(() => {
        buttonsPanel = undefined;
    });
    
    buttonsPanel.webview.onDidReceiveMessage(message => {
        if (message.command === 'buttonClicked') {
            sendMessageToEditor(message.text);
        }
    });
}

function updateButtonsPanel() {
    if (!buttonsPanel) return;
    
    buttonsPanel.webview.html = getWebviewContent();
}

function getWebviewContent() {
    const buttonElements = buttons.map(button => {
        return `
            <button 
                class="button" 
                style="background-color: ${button.color || '#007acc'}" 
                data-message="${escapeHtml(button.message)}"
            >
                ${escapeHtml(button.label)}
            </button>
        `;
    }).join('');
    
    return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Windsurfer Quick Communication</title>
            <style>
                body {
                    padding: 20px;
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
                }
                .buttons-container {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 10px;
                }
                .button {
                    padding: 10px 15px;
                    border: none;
                    border-radius: 4px;
                    color: white;
                    font-weight: bold;
                    cursor: pointer;
                    transition: all 0.2s;
                }
                .button:hover {
                    opacity: 0.8;
                    transform: translateY(-2px);
                }
                .add-button {
                    margin-top: 20px;
                    background-color: #4CAF50;
                    color: white;
                    border: none;
                    padding: 8px 16px;
                    border-radius: 4px;
                    cursor: pointer;
                }
                .delete-button {
                    margin-top: 10px;
                    background-color: #f44336;
                    color: white;
                    border: none;
                    padding: 8px 16px;
                    border-radius: 4px;
                    cursor: pointer;
                }
            </style>
        </head>
        <body>
            <h2>Quick Communication Buttons</h2>
            <div class="buttons-container">
                ${buttonElements}
            </div>
            <button class="add-button" id="addButton">Add New Button</button>
            <button class="delete-button" id="deleteButton">Delete Button</button>
            
            <script>
                (function() {
                    const vscode = acquireVsCodeApi();
                    
                    document.querySelectorAll('.button').forEach(button => {
                        button.addEventListener('click', () => {
                            const message = button.getAttribute('data-message');
                            vscode.postMessage({
                                command: 'buttonClicked',
                                text: message
                            });
                        });
                    });
                    
                    document.getElementById('addButton').addEventListener('click', () => {
                        vscode.postMessage({
                            command: 'addButtonClicked'
                        });
                    });
                    
                    document.getElementById('deleteButton').addEventListener('click', () => {
                        vscode.postMessage({
                            command: 'deleteButtonClicked'
                        });
                    });
                }());
            </script>
        </body>
        </html>
    `;
}

function escapeHtml(unsafe) {
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

async function addButton() {
    const label = await vscode.window.showInputBox({
        placeHolder: 'Button Label',
        prompt: 'Enter a label for the button'
    });
    
    if (!label) return;
    
    const message = await vscode.window.showInputBox({
        placeHolder: 'Message',
        prompt: 'Enter the message to send when the button is clicked'
    });
    
    if (!message) return;
    
    const colorOptions = [
        '#007acc', // Blue
        '#4CAF50', // Green
        '#f44336', // Red
        '#ff9800', // Orange
        '#9c27b0', // Purple
        '#795548', // Brown
        '#607d8b'  // Gray
    ];
    
    const color = await vscode.window.showQuickPick(
        colorOptions.map(c => ({ label: c, color: c })),
        {
            placeHolder: 'Select a color',
            canPickMany: false
        }
    );
    
    if (!color) return;
    
    const newButton = {
        id: `button_${Date.now()}`,
        label,
        message,
        color: color.color
    };
    
    buttons.push(newButton);
    saveButtonsToFile();
    
    if (buttonsPanel) {
        updateButtonsPanel();
    }
}

async function deleteButton() {
    // Don't allow deleting the default continue button
    const customButtons = buttons.filter(button => button.id !== 'continue');
    
    if (customButtons.length === 0) {
        vscode.window.showInformationMessage('No custom buttons to delete.');
        return;
    }
    
    const buttonToDelete = await vscode.window.showQuickPick(
        customButtons.map(button => ({
            label: button.label,
            detail: button.message,
            id: button.id
        })),
        {
            placeHolder: 'Select a button to delete',
            canPickMany: false
        }
    );
    
    if (!buttonToDelete) return;
    
    buttons = buttons.filter(button => button.id !== buttonToDelete.id);
    saveButtonsToFile();
    
    if (buttonsPanel) {
        updateButtonsPanel();
    }
}

module.exports = {
    activate,
    deactivate
};
