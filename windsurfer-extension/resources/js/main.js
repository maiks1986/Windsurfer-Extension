// Get VS Code API
const vscode = acquireVsCodeApi();

// Store state information
let currentEditId = null;

// Initialize the webview
document.addEventListener('DOMContentLoaded', () => {
  // Setup form submission
  const form = document.getElementById('button-form');
  form.addEventListener('submit', handleFormSubmit);
  
  // Setup edit and delete buttons
  setupButtonActions();
});

function handleFormSubmit(event) {
  event.preventDefault();
  
  const nameInput = document.getElementById('button-name');
  const commandInput = document.getElementById('button-command');
  const argsInput = document.getElementById('button-args');
  
  const name = nameInput.value.trim();
  const command = commandInput.value.trim();
  let args = null;
  
  // Parse args if provided
  if (argsInput.value.trim()) {
    try {
      args = JSON.parse(argsInput.value.trim());
    } catch (e) {
      // Show error for invalid JSON
      vscode.postMessage({
        command: 'showError',
        message: 'Invalid JSON in arguments field'
      });
      return;
    }
  }
  
  if (!name || !command) {
    return;
  }
  
  const button = {
    id: currentEditId || Date.now().toString(),
    name,
    command,
    args
  };
  
  // Send message to extension
  vscode.postMessage({
    command: currentEditId ? 'updateButton' : 'addButton',
    id: currentEditId,
    button
  });
  
  // Reset form
  form.reset();
  currentEditId = null;
  
  // Update button text if it was in edit mode
  const addButton = document.getElementById('add-button');
  addButton.textContent = 'Add Button';
}

function setupButtonActions() {
  // Setup edit buttons
  document.querySelectorAll('.edit-button').forEach(button => {
    button.addEventListener('click', () => {
      const id = button.getAttribute('data-id');
      editButton(id);
    });
  });
  
  // Setup delete buttons
  document.querySelectorAll('.delete-button').forEach(button => {
    button.addEventListener('click', () => {
      const id = button.getAttribute('data-id');
      deleteButton(id);
    });
  });
}

function editButton(id) {
  const buttonItem = document.querySelector(`.button-item[data-id="${id}"]`);
  if (!buttonItem) return;
  
  const nameElement = buttonItem.querySelector('h3');
  const commandElement = buttonItem.querySelector('.button-details p:first-child');
  
  // Extract values
  const name = nameElement.textContent;
  const command = commandElement.textContent.replace('Command:', '').trim();
  
  // Populate form
  document.getElementById('button-name').value = name;
  document.getElementById('button-command').value = command;
  
  // Check if there are args
  const argsElement = buttonItem.querySelector('.button-details p:nth-child(2)');
  if (argsElement) {
    const argsText = argsElement.textContent.replace('Arguments:', '').trim();
    document.getElementById('button-args').value = argsText;
  } else {
    document.getElementById('button-args').value = '';
  }
  
  // Set edit mode
  currentEditId = id;
  document.getElementById('add-button').textContent = 'Update Button';
  
  // Scroll to form
  document.querySelector('.form-container').scrollIntoView({ behavior: 'smooth' });
}

function deleteButton(id) {
  // Confirm deletion
  vscode.postMessage({
    command: 'deleteButton',
    id
  });
}

// Handle messages from the extension
window.addEventListener('message', event => {
  const message = event.data;
  
  switch (message.command) {
    case 'refreshButtons':
      // This would be handled by the extension re-rendering the entire webview
      break;
  }
});
