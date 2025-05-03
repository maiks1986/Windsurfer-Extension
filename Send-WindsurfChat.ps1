# Define the partial window title and message
$partialTitle = "Windsurf"
$message = "Hello from PowerShell automation!"

# Function to send keys
function Send-Keys {
    param([string]$keys)
    Add-Type -AssemblyName System.Windows.Forms -ErrorAction SilentlyContinue
    [System.Windows.Forms.SendKeys]::SendWait($keys)
}

# Find the process with the desired window title
$proc = Get-Process | Where-Object { $_.MainWindowTitle -like "*$partialTitle*" } | Select-Object -First 1

if (-not $proc) {
    Write-Host "Window not found containing: $partialTitle"
    exit 1
}

# Bring the window to the foreground
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Win32 {
    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);
}
"@ -ErrorAction SilentlyContinue

[Win32]::SetForegroundWindow($proc.MainWindowHandle)
Start-Sleep -Milliseconds 300

# Focus chat input (Ctrl+L)
Send-Keys "^{l}"
Start-Sleep -Milliseconds 200

# Type the message
Send-Keys $message
Start-Sleep -Milliseconds 200

# Press Enter to send
Send-Keys "{ENTER}"