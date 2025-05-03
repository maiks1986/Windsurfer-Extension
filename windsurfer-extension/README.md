# Windsurfer VSCode Extension

A VSCode extension that provides quick communication buttons for sending predefined messages. This extension is designed to work with StreamDeck integration for even faster communication.

## Features

- Modern, modular architecture for better maintainability
- Improved button management with a dedicated WebView panel
- Cross-platform communication via WebSocket, Named Pipes (Windows), and Unix Sockets (macOS/Linux)
- Network discovery for StreamDeck clients
- Store button configurations in a JSON file
- Automatic refresh of buttons from the configuration file
- Comprehensive error handling and resource management

## Usage

1. Open the Buttons Panel by running the command "Windsurfer: Open Buttons Panel"
2. Add new buttons by filling out the form at the bottom of the panel
3. Edit existing buttons by clicking the "Edit" button next to a button
4. Delete buttons by clicking the "Delete" button next to a button
5. Execute buttons to run VS Code commands with optional arguments

## Configuration

The extension can be configured through VSCode settings:

- `windsurfer.buttonsFilePath`: Path to the JSON file storing button configurations
- `windsurfer.refreshInterval`: Interval (in ms) to refresh buttons from the configuration file
- `windsurfer.websocketPort`: Port for the WebSocket server to listen on (default: 8765)
- `windsurfer.namedPipeName`: Name of the Named Pipe for communication on Windows (default: windsurfer-communication)
- `windsurfer.unixSocketPath`: Path to the Unix Domain Socket for communication on macOS/Linux (default: /tmp/windsurfer-communication.sock)
- `windsurfer.discoveryEnabled`: Enable service discovery to help StreamDeck find the extension (default: true)
- `windsurfer.discoveryPort`: Port for the discovery service (default: 8766)
- `windsurfer.discoveryInterval`: Interval (in ms) for broadcasting discovery announcements (default: 10000)
- `windsurfer.inputMethod`: Method to use for inserting text (cursor = at cursor position, windsurf = in Windsurf chat, direct = directly to Windsurf DOM element)
- `windsurfer.windsurfScriptPath`: Path to the PowerShell script for sending messages to Windsurf chat

## StreamDeck Integration

This extension includes multiple communication methods that allow external applications (like StreamDeck) to interact with VS Code:

1. WebSocket server (cross-platform)
2. Named Pipe server (Windows)
3. Unix Socket server (macOS/Linux)
4. Network discovery for automatic connection

### Communication API

#### Get Buttons List

Send:

```json
{
  "type": "getButtons"
}
```

Response:

```json
{
  "type": "buttons",
  "buttons": [
    {
      "id": "button_1",
      "name": "Format Document",
      "command": "editor.action.formatDocument"
    },
    {
      "id": "button_2",
      "name": "Open File",
      "command": "workbench.action.files.openFile",
      "args": []
    }
  ]
}
```

#### Execute Command

Send:

```json
{
  "type": "executeCommand",
  "command": "editor.action.formatDocument",
  "args": []
}
```

Response:

```json
{
  "type": "commandResult",
  "success": true
}
```

#### Add Button

Send:

```json
{
  "type": "addButton",
  "button": {
    "name": "Format Document",
    "command": "editor.action.formatDocument"
  }
}
```

Response:

```json
{
  "type": "buttonAdded",
  "button": {
    "id": "button_1621234567890",
    "name": "Format Document",
    "command": "editor.action.formatDocument"
  }
}
```

#### Update Button

Send:

```json
{
  "type": "updateButton",
  "id": "button_1621234567890",
  "button": {
    "name": "Format Document",
    "command": "editor.action.formatDocument",
    "args": {"formatOnSave": true}
  }
}
```

Response:

```json
{
  "type": "buttonUpdated",
  "button": {
    "id": "button_1621234567890",
    "name": "Format Document",
    "command": "editor.action.formatDocument",
    "args": {"formatOnSave": true}
  }
}
```

#### Delete Button

Send:

```json
{
  "type": "deleteButton",
  "id": "button_1621234567890"
}
```

Response:

```json
{
  "type": "buttonDeleted",
  "id": "button_1621234567890",
  "success": true
}
```

#### Insert Text

Send:

```json
{
  "type": "insertText",
  "text": "Text to insert"
}
```

Response:

```json
{
  "type": "textInserted",
  "success": true
}
```

This command inserts text either at the cursor position or directly into the Windsurf chat input, depending on the `windsurfer.inputMethod` setting. When set to `direct`, it will attempt to insert text directly into the Windsurf chat DOM element.

#### Ping

Send:

```json
{
  "type": "ping"
}
```

Response:

```json
{
  "type": "pong",
  "timestamp": 1621234567890
}
```

## Development

1. Clone the repository
2. Run `npm install` to install dependencies
3. Open the project in VSCode
4. Press F5 to start debugging

### Project Structure

The extension follows a modular architecture for better maintainability:

```text
.
├── extension.js             # Main entry point
├── src/
│   ├── extension.js         # Core implementation
│   ├── buttons/
│   │   └── buttonManager.js # Button management
│   ├── communication/
│   │   ├── servers.js       # WebSocket, Named Pipe, Unix Socket servers
│   │   ├── messageHandler.js # Message processing
│   │   └── discovery.js     # Network discovery
│   └── ui/
│       └── buttonsPanel.js  # WebView panel for buttons
└── resources/
    ├── css/
    │   └── style.css       # Styles for WebView
    └── js/
        └── main.js         # JavaScript for WebView
```

### Available Commands

- `windsurfer.openButtonsPanel`: Opens the Buttons Panel for managing StreamDeck buttons
- `windsurfer.showPanel`: Legacy command that redirects to the new Buttons Panel
- `windsurfer.addButton`: Legacy command for adding a button through a series of input boxes
- `windsurfer.deleteButton`: Legacy command for deleting a button through a quick pick menu
- `windsurfer.restartServers`: Restarts the communication servers

## License

MIT
