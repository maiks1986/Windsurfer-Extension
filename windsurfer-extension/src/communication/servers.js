const vscode = require('vscode');
const WebSocket = require('ws');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');

/**
 * Sets up communication servers for the extension
 * @param {import('./messageHandler').MessageHandler} messageHandler - Handler for incoming messages
 * @returns {vscode.Disposable[]} Array of disposable server instances
 */
function setupServers(messageHandler) {
  const disposables = [];
  const config = vscode.workspace.getConfiguration('windsurfer');
  
  // Setup WebSocket server
  const wsServer = setupWebSocketServer(config, messageHandler);
  if (wsServer) {
    disposables.push(wsServer);
  }
  
  // Setup platform-specific servers
  if (process.platform === 'win32') {
    // Windows - Named Pipe
    const namedPipeServer = setupNamedPipeServer(config, messageHandler);
    if (namedPipeServer) {
      disposables.push(namedPipeServer);
    }
  } else {
    // macOS/Linux - Unix Socket
    const unixSocketServer = setupUnixSocketServer(config, messageHandler);
    if (unixSocketServer) {
      disposables.push(unixSocketServer);
    }
  }
  
  return disposables;
}

/**
 * Sets up a WebSocket server
 * @param {vscode.WorkspaceConfiguration} config - Extension configuration
 * @param {import('./messageHandler').MessageHandler} messageHandler - Handler for incoming messages
 * @returns {vscode.Disposable|null} Disposable server instance or null if setup failed
 */
function setupWebSocketServer(config, messageHandler) {
  try {
    const port = config.get('websocketPort');
    const server = new WebSocket.Server({ port });
    
    server.on('connection', (socket) => {
      vscode.window.showInformationMessage(`StreamDeck client connected via WebSocket`);
      
      socket.on('message', (message) => {
        try {
          const data = JSON.parse(message.toString());
          const response = messageHandler.handleMessage(data);
          
          if (response) {
            socket.send(JSON.stringify(response));
          }
        } catch (err) {
          console.error('Error handling WebSocket message:', err);
          socket.send(JSON.stringify({ error: err.message }));
        }
      });
      
      socket.on('close', () => {
        vscode.window.showInformationMessage('StreamDeck client disconnected from WebSocket');
      });
    });
    
    server.on('error', (err) => {
      vscode.window.showErrorMessage(`WebSocket server error: ${err.message}`);
    });
    
    vscode.window.showInformationMessage(`WebSocket server started on port ${port}`);
    
    return {
      dispose: () => {
        server.close();
      }
    };
  } catch (err) {
    vscode.window.showErrorMessage(`Failed to start WebSocket server: ${err.message}`);
    return null;
  }
}

/**
 * Sets up a Named Pipe server (Windows only)
 * @param {vscode.WorkspaceConfiguration} config - Extension configuration
 * @param {import('./messageHandler').MessageHandler} messageHandler - Handler for incoming messages
 * @returns {vscode.Disposable|null} Disposable server instance or null if setup failed
 */
function setupNamedPipeServer(config, messageHandler) {
  if (process.platform !== 'win32') {
    return null;
  }
  
  try {
    const pipeName = config.get('namedPipeName');
    const pipePath = `\\\\.\\pipe\\${pipeName}`;
    
    // Remove existing pipe if it exists
    try {
      if (fs.existsSync(pipePath)) {
        fs.unlinkSync(pipePath);
      }
    } catch (e) {
      // Ignore errors when trying to unlink the pipe
    }
    
    const server = net.createServer((socket) => {
      vscode.window.showInformationMessage('StreamDeck client connected via Named Pipe');
      
      let buffer = '';
      
      socket.on('data', (data) => {
        try {
          buffer += data.toString();
          
          // Check if we have a complete JSON object
          try {
            const message = JSON.parse(buffer);
            buffer = '';
            
            const response = messageHandler.handleMessage(message);
            
            if (response) {
              socket.write(JSON.stringify(response) + '\n');
            }
          } catch (e) {
            // Not a complete JSON object yet, continue buffering
          }
        } catch (err) {
          console.error('Error handling Named Pipe message:', err);
          socket.write(JSON.stringify({ error: err.message }) + '\n');
        }
      });
      
      socket.on('close', () => {
        vscode.window.showInformationMessage('StreamDeck client disconnected from Named Pipe');
      });
    });
    
    server.on('error', (err) => {
      vscode.window.showErrorMessage(`Named Pipe server error: ${err.message}`);
    });
    
    server.listen(pipePath, () => {
      vscode.window.showInformationMessage(`Named Pipe server started at ${pipePath}`);
    });
    
    return {
      dispose: () => {
        server.close();
      }
    };
  } catch (err) {
    vscode.window.showErrorMessage(`Failed to start Named Pipe server: ${err.message}`);
    return null;
  }
}

/**
 * Sets up a Unix Socket server (macOS/Linux only)
 * @param {vscode.WorkspaceConfiguration} config - Extension configuration
 * @param {import('./messageHandler').MessageHandler} messageHandler - Handler for incoming messages
 * @returns {vscode.Disposable|null} Disposable server instance or null if setup failed
 */
function setupUnixSocketServer(config, messageHandler) {
  if (process.platform === 'win32') {
    return null;
  }
  
  try {
    const socketPath = config.get('unixSocketPath');
    
    // Remove existing socket if it exists
    try {
      if (fs.existsSync(socketPath)) {
        fs.unlinkSync(socketPath);
      }
    } catch (e) {
      // Ignore errors when trying to unlink the socket
    }
    
    const server = net.createServer((socket) => {
      vscode.window.showInformationMessage('StreamDeck client connected via Unix Socket');
      
      let buffer = '';
      
      socket.on('data', (data) => {
        try {
          buffer += data.toString();
          
          // Check if we have a complete JSON object
          try {
            const message = JSON.parse(buffer);
            buffer = '';
            
            const response = messageHandler.handleMessage(message);
            
            if (response) {
              socket.write(JSON.stringify(response) + '\n');
            }
          } catch (e) {
            // Not a complete JSON object yet, continue buffering
          }
        } catch (err) {
          console.error('Error handling Unix Socket message:', err);
          socket.write(JSON.stringify({ error: err.message }) + '\n');
        }
      });
      
      socket.on('close', () => {
        vscode.window.showInformationMessage('StreamDeck client disconnected from Unix Socket');
      });
    });
    
    server.on('error', (err) => {
      vscode.window.showErrorMessage(`Unix Socket server error: ${err.message}`);
    });
    
    server.listen(socketPath, () => {
      vscode.window.showInformationMessage(`Unix Socket server started at ${socketPath}`);
    });
    
    return {
      dispose: () => {
        server.close();
        try {
          if (fs.existsSync(socketPath)) {
            fs.unlinkSync(socketPath);
          }
        } catch (e) {
          // Ignore errors when trying to unlink the socket
        }
      }
    };
  } catch (err) {
    vscode.window.showErrorMessage(`Failed to start Unix Socket server: ${err.message}`);
    return null;
  }
}

module.exports = { setupServers };
