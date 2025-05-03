# Windsurfer VSCode Extension

A VSCode extension that provides quick communication buttons for sending predefined messages. This extension is designed to work with StreamDeck integration for even faster communication.

## Features

- Panel with configurable quick communication buttons
- Add and delete custom buttons through the UI
- Store button configurations in a JSON file
- Automatic refresh of buttons from the configuration file
- WebSocket server for external communication (e.g., from StreamDeck)

## Usage

1. Open the Windsurfer panel by running the command "Windsurfer: Show Quick Communication Panel"
2. Click on any button to insert its message at the current cursor position
3. Add new buttons by clicking the "Add New Button" button or running the command "Windsurfer: Add New Button"
4. Delete buttons by clicking the "Delete Button" button or running the command "Windsurfer: Delete Button"

## Configuration

The extension can be configured through VSCode settings:

- `windsurfer.buttonsFilePath`: Path to the JSON file storing button configurations
- `windsurfer.refreshInterval`: Interval (in ms) to refresh buttons from the configuration file
- `windsurfer.websocketPort`: Port for the WebSocket server to listen on

## StreamDeck Integration

This extension includes a WebSocket server that allows external applications (like StreamDeck) to:

1. Get the list of available buttons
2. Send messages directly to the editor

### WebSocket API

The WebSocket server listens on the port specified in the configuration (default: 3000).

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
  "type": "buttonsList",
  "buttons": [
    {
      "id": "continue",
      "label": "Continue",
      "message": "Please continue.",
      "color": "#4CAF50"
    },
    ...
  ]
}
```

#### Send Message

Send:
```json
{
  "type": "sendMessage",
  "message": "Your message here"
}
```

## Development

1. Clone the repository
2. Run `npm install` to install dependencies
3. Open the project in VSCode
4. Press F5 to start debugging

## License

MIT
