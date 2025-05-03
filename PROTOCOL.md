# Windsurfer Communication Protocol

This document defines the communication protocol between the Windsurfer VSCode Extension and the StreamDeck Plugin.

## Overview

The two components can communicate via multiple methods, with automatic discovery to simplify configuration.

## Connection Options

### WebSocket

- **Default Port**: 8765 (configurable)
- **Port Range**: 8000-9000 (for automatic discovery)
- **Reconnection Strategy**: Automatic reconnection with 5-second interval

### Named Pipes (Windows)

- **Pipe Name**: windsurfer-communication
- **Reconnection Strategy**: Automatic reconnection with 5-second interval

## Service Discovery

To simplify connection setup, the protocol includes a discovery mechanism:

- **Discovery Port**: 8766
- **Interval**: 10 seconds
- **Format**:

```json
{
  "type": "discovery",
  "service": "windsurfer",
  "role": "vscode" // or "streamdeck"
}
```

## Message Format

All messages are JSON objects with at least a `type` field that identifies the message type.

```json
{
  "type": "messageType",
  "additionalFields": "depending on message type"
}
```

## Messages: StreamDeck → VSCode

### Execute Command

Executes a VSCode command directly.

```json
{
  "type": "executeCommand",
  "command": "editor.action.commentLine",
  "args": []
}
```

### Insert Text

Inserts text at the cursor position in VSCode.

```json
{
  "type": "insertText",
  "text": "Hello, how can I help you today?"
}
```

### Get Buttons

Requests the list of available buttons from the VSCode extension, optionally filtered by category.

```json
{
  "type": "getButtons",
  "category": "quick-responses"
}
```

### Ping

Checks if the VSCode extension is available.

```json
{
  "type": "ping",
  "id": "connection-check-1"
}
```

### Custom Action

Executes a custom action defined by the StreamDeck plugin.

```json
{
  "type": "customAction",
  "action": "runDebugger",
  "parameters": {
    "configuration": "Launch Chrome"
  }
}
```

## Messages: VSCode → StreamDeck

### Buttons List

Returns the list of available buttons in the VSCode extension.

```json
{
  "type": "buttonsList",
  "buttons": [
    {
      "id": "continue",
      "label": "Continue",
      "message": "Please continue.",
      "color": "#4CAF50",
      "category": "quick-responses"
    }
  ],
  "categories": [
    "quick-responses",
    "code-snippets"
  ]
}
```

### Command Result

Returns the result of executing a command.

```json
{
  "type": "commandResult",
  "command": "editor.action.commentLine",
  "success": true
}
```

### Pong

Response to a ping message.

```json
{
  "type": "pong",
  "id": "connection-check-1",
  "timestamp": 1651234567890
}
```

### Error

Error response.

```json
{
  "type": "error",
  "code": "INVALID_REQUEST",
  "message": "Invalid request format",
  "originalRequest": {
    "type": "unknown"
  }
}
```

### Custom Event

Sends a custom event from VSCode to StreamDeck.

```json
{
  "type": "customEvent",
  "event": "debuggerStarted",
  "data": {
    "configuration": "Launch Chrome"
  }
}
```

## Button Format

Each button has the following properties:

- **id**: Unique identifier for the button
- **label**: Display label for the button
- **message**: Message to send when the button is clicked
- **color**: CSS color code for the button
- **icon**: Optional icon identifier or URL
- **category**: Optional category for grouping buttons
- **command**: Optional VSCode command to execute instead of sending a message
- **commandArgs**: Optional arguments for the command

## Implementation Guidelines

### VSCode Extension

1. Start a server using one of the supported connection methods
2. Broadcast discovery messages to help StreamDeck find the extension
3. Process incoming messages and send appropriate responses
4. Maintain a list of buttons that can be requested by the StreamDeck plugin
5. Support executing VSCode commands sent from StreamDeck

### StreamDeck Plugin

1. Attempt to discover the VSCode extension using the discovery protocol
2. Connect using the preferred connection method
3. Implement automatic reconnection if the connection is lost
4. Send commands and messages to the VSCode extension when buttons are pressed
5. Define custom actions that can be executed by the VSCode extension

## Connection Selection Strategy

1. First, try to discover the VSCode extension using the discovery protocol
2. If discovery succeeds, use the connection details provided
3. If discovery fails, try the default connection options in order:
   - WebSocket on port 8765
   - Named Pipe (on Windows)
4. If all connection attempts fail, show an error to the user

## Testing

To test the communication:

1. Start the VSCode extension
2. Use the provided test client to verify communication
3. Start the StreamDeck plugin
4. Verify that commands can be sent from the StreamDeck to VSCode

## Current and Future Extensions

### Implemented
- **Button Categories**: Group buttons into categories
- **Custom Actions**: Support for custom actions defined by the StreamDeck plugin

### Planned
- **Message Templates**: Support for message templates with placeholders
- **Message History**: Track and recall recently sent messages
- **Event Subscriptions**: Allow StreamDeck to subscribe to specific VSCode events

## Version History

- **1.0.0**: Initial protocol definition with support for multiple connection methods and custom commands
