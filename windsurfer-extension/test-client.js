const WebSocket = require('ws');

// Connect to the WebSocket server
const ws = new WebSocket('ws://localhost:3000');

ws.on('open', function open() {
  console.log('Connected to Windsurfer extension');
  
  // Request the list of buttons
  ws.send(JSON.stringify({
    type: 'getButtons'
  }));
  
  // Set up a simple CLI interface
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  console.log('\nCommands:');
  console.log('1. Send a message: type the message and press Enter');
  console.log('2. Get buttons list: type "buttons" and press Enter');
  console.log('3. Exit: type "exit" and press Enter\n');
  
  rl.prompt();
  
  rl.on('line', (input) => {
    if (input.toLowerCase() === 'exit') {
      ws.close();
      rl.close();
      return;
    }
    
    if (input.toLowerCase() === 'buttons') {
      ws.send(JSON.stringify({
        type: 'getButtons'
      }));
    } else {
      ws.send(JSON.stringify({
        type: 'sendMessage',
        message: input
      }));
      console.log(`Sent message: ${input}`);
    }
    
    rl.prompt();
  });
});

ws.on('message', function incoming(data) {
  try {
    const message = JSON.parse(data);
    
    if (message.type === 'buttonsList') {
      console.log('\nAvailable buttons:');
      message.buttons.forEach(button => {
        console.log(`- ${button.label}: "${button.message}"`);
      });
    }
  } catch (error) {
    console.error('Error parsing message:', error);
  }
});

ws.on('close', function close() {
  console.log('Disconnected from Windsurfer extension');
  process.exit(0);
});

ws.on('error', function error(err) {
  console.error('WebSocket error:', err.message);
  console.log('Make sure the Windsurfer extension is running in VSCode');
  process.exit(1);
});
