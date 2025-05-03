const vscode = require('vscode');
const dgram = require('dgram');
const os = require('os');

/**
 * Handles network discovery for StreamDeck clients
 */
class Discovery {
  /**
   * @type {dgram.Socket}
   * @private
   */
  _socket = null;
  
  /**
   * @type {NodeJS.Timeout}
   * @private
   */
  _broadcastInterval = null;
  
  /**
   * @type {boolean}
   * @private
   */
  _isEnabled = false;
  
  /**
   * @type {number}
   * @private
   */
  _port = 8766;
  
  /**
   * @type {number}
   * @private
   */
  _interval = 10000;
  
  /**
   * Creates a new Discovery instance
   * @param {Object} serverInfo - Information about the extension servers
   * @param {number} serverInfo.websocketPort - WebSocket server port
   * @param {string} [serverInfo.namedPipeName] - Named Pipe name (Windows)
   * @param {string} [serverInfo.unixSocketPath] - Unix Socket path (macOS/Linux)
   */
  constructor(serverInfo) {
    this._serverInfo = serverInfo;
    
    // Load configuration
    const config = vscode.workspace.getConfiguration('windsurfer');
    this._isEnabled = config.get('discoveryEnabled');
    this._port = config.get('discoveryPort');
    this._interval = config.get('discoveryInterval');
    
    // Start discovery if enabled
    if (this._isEnabled) {
      this._startDiscovery();
    }
    
    // Listen for configuration changes
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('windsurfer.discoveryEnabled') ||
          e.affectsConfiguration('windsurfer.discoveryPort') ||
          e.affectsConfiguration('windsurfer.discoveryInterval')) {
        
        const config = vscode.workspace.getConfiguration('windsurfer');
        const newEnabled = config.get('discoveryEnabled');
        const newPort = config.get('discoveryPort');
        const newInterval = config.get('discoveryInterval');
        
        // Check if we need to restart discovery
        const needsRestart = 
          this._isEnabled !== newEnabled ||
          this._port !== newPort ||
          this._interval !== newInterval;
        
        // Update configuration
        this._isEnabled = newEnabled;
        this._port = newPort;
        this._interval = newInterval;
        
        // Restart discovery if needed
        if (needsRestart) {
          this._stopDiscovery();
          if (this._isEnabled) {
            this._startDiscovery();
          }
        }
      }
    });
  }
  
  /**
   * Starts the discovery service
   * @private
   */
  _startDiscovery() {
    try {
      // Create UDP socket
      this._socket = dgram.createSocket('udp4');
      
      // Handle errors
      this._socket.on('error', (err) => {
        vscode.window.showErrorMessage(`Discovery service error: ${err.message}`);
        this._stopDiscovery();
      });
      
      // Handle incoming messages (for future use)
      this._socket.on('message', (msg, rinfo) => {
        try {
          const message = JSON.parse(msg.toString());
          
          // If this is a discovery request, respond immediately
          if (message.type === 'discovery_request') {
            this._sendDiscoveryAnnouncement(rinfo.address);
          }
        } catch (err) {
          console.error('Error handling discovery message:', err);
        }
      });
      
      // Bind socket
      this._socket.bind(this._port, () => {
        // Enable broadcasting
        this._socket.setBroadcast(true);
        
        vscode.window.showInformationMessage(`Discovery service started on port ${this._port}`);
        
        // Start broadcasting
        this._broadcastInterval = setInterval(() => {
          this._sendDiscoveryAnnouncement();
        }, this._interval);
        
        // Send initial announcement
        this._sendDiscoveryAnnouncement();
      });
    } catch (err) {
      vscode.window.showErrorMessage(`Failed to start discovery service: ${err.message}`);
    }
  }
  
  /**
   * Stops the discovery service
   * @private
   */
  _stopDiscovery() {
    // Clear broadcast interval
    if (this._broadcastInterval) {
      clearInterval(this._broadcastInterval);
      this._broadcastInterval = null;
    }
    
    // Close socket
    if (this._socket) {
      try {
        this._socket.close();
      } catch (err) {
        console.error('Error closing discovery socket:', err);
      }
      this._socket = null;
    }
  }
  
  /**
   * Sends a discovery announcement
   * @private
   * @param {string} [targetAddress] - Specific address to send to (otherwise broadcast)
   */
  _sendDiscoveryAnnouncement(targetAddress) {
    if (!this._socket) {
      return;
    }
    
    try {
      // Create announcement message
      const announcement = {
        type: 'windsurfer_discovery',
        id: 'vscode-extension',
        name: 'VS Code Windsurfer Extension',
        timestamp: Date.now(),
        servers: {
          websocket: {
            port: this._serverInfo.websocketPort
          }
        },
        interfaces: this._getNetworkInterfaces()
      };
      
      // Add platform-specific server info
      if (process.platform === 'win32' && this._serverInfo.namedPipeName) {
        announcement.servers.namedPipe = {
          name: this._serverInfo.namedPipeName
        };
      } else if (this._serverInfo.unixSocketPath) {
        announcement.servers.unixSocket = {
          path: this._serverInfo.unixSocketPath
        };
      }
      
      // Convert to buffer
      const message = Buffer.from(JSON.stringify(announcement));
      
      // Send to target or broadcast
      if (targetAddress) {
        this._socket.send(message, 0, message.length, this._port, targetAddress);
      } else {
        // Send to broadcast address
        this._socket.send(message, 0, message.length, this._port, '255.255.255.255');
        
        // Also send to localhost
        this._socket.send(message, 0, message.length, this._port, '127.0.0.1');
      }
    } catch (err) {
      console.error('Error sending discovery announcement:', err);
    }
  }
  
  /**
   * Gets network interface information
   * @private
   * @returns {Object} Network interface information
   */
  _getNetworkInterfaces() {
    const interfaces = {};
    const networkInterfaces = os.networkInterfaces();
    
    // Collect all non-internal IPv4 addresses
    Object.keys(networkInterfaces).forEach(ifName => {
      networkInterfaces[ifName].forEach(iface => {
        if (iface.family === 'IPv4' && !iface.internal) {
          interfaces[ifName] = iface.address;
        }
      });
    });
    
    return interfaces;
  }
  
  /**
   * Disposes of resources
   */
  dispose() {
    this._stopDiscovery();
  }
}

module.exports = { Discovery };
