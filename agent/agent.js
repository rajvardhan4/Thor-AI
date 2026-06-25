require('dotenv').config();
const { io } = require('socket.io-client');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';

console.log(`THOR Desktop Agent initializing...`);
console.log(`Connecting to server at ${BACKEND_URL}`);

const socket = io(BACKEND_URL);

socket.on('connect', () => {
  console.log(`Connected to THOR Backend. Registering agent...`);
  socket.emit('register:agent');
  startStatsReporting();
});

socket.on('disconnect', () => {
  console.log(`Disconnected from THOR Backend.`);
  stopStatsReporting();
});

// Run powerShell commands safely
function runPowerShell(command) {
  return new Promise((resolve, reject) => {
    // We pass the command encoded or raw. For simple commands, executing with powershell -Command is fine.
    exec(`powershell -Command "${command.replace(/"/g, '\\"')}"`, (error, stdout, stderr) => {
      if (error) {
        reject(error);
      } else if (stderr && stderr.trim().length > 0 && !stderr.includes('Security') && !stderr.includes('Warning')) {
        reject(new Error(stderr.trim()));
      } else {
        resolve(stdout.trim());
      }
    });
  });
}

// Periodically report stats
let statsInterval = null;

function startStatsReporting() {
  if (statsInterval) clearInterval(statsInterval);
  console.log('Starting system stats reporting interval...');
  statsInterval = setInterval(async () => {
    try {
      // 1. Get CPU
      const cpuRaw = await runPowerShell('Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average | Select-Object -ExpandProperty Average');
      const cpu = parseFloat(cpuRaw) || 0;

      // 2. Get RAM
      const ramRaw = await runPowerShell('Get-CimInstance Win32_OperatingSystem | Select-Object FreePhysicalMemory, TotalVisibleMemorySize | ConvertTo-Json');
      let ram = 0;
      try {
        const ramData = JSON.parse(ramRaw);
        const free = ramData.FreePhysicalMemory;
        const total = ramData.TotalVisibleMemorySize;
        ram = Math.round(((total - free) / total) * 100);
      } catch (e) {}

      // 3. Get Battery
      let battery = 100;
      try {
        const batteryRaw = await runPowerShell('Get-CimInstance Win32_Battery | Select-Object -ExpandProperty EstimatedChargeRemaining');
        battery = parseInt(batteryRaw) || 100;
      } catch (e) {
        // Fallback if no battery (desktop)
        battery = 100;
      }

      // 4. Get Foreground Window
      let activeWindow = 'Desktop';
      try {
        const psCode = `
          $code = '[DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow(); [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, System.Text.StringBuilder text, int count);'
          Add-Type -MemberDefinition $code -Name "Win32" -Namespace "Win32" -ErrorAction SilentlyContinue
          $hwnd = [Win32.Win32]::GetForegroundWindow()
          $sb = New-Object System.Text.StringBuilder 256
          $null = [Win32.Win32]::GetWindowText($hwnd, $sb, 256)
          $sb.ToString()
        `;
        const activeWinRaw = await runPowerShell(psCode);
        if (activeWinRaw) activeWindow = activeWinRaw;
      } catch (e) {}

      // Send to server
      socket.emit('agent:stats', {
        cpu,
        ram,
        battery,
        activeWindow,
        timestamp: new Date().toISOString()
      });
    } catch (err) {
      // Avoid printing log spam if it fails periodically
    }
  }, 3000);
}

function stopStatsReporting() {
  if (statsInterval) {
    clearInterval(statsInterval);
    statsInterval = null;
    console.log('Stopped system stats reporting.');
  }
}

// Listen for system commands from the server
socket.on('agent:execute', async (payload) => {
  const { action, parameters, logId } = payload;
  console.log(`Executing action: ${action} with params:`, parameters);

  try {
    let result = { success: true, logId, action };

    switch (action) {
      case 'open-app': {
        const app = parameters.target.toLowerCase();
        let cmd = app;
        
        // Command mappings for common apps
        if (app === 'chrome' || app === 'google chrome') cmd = 'start chrome';
        else if (app === 'code' || app === 'vs code' || app === 'vscode') cmd = 'code';
        else if (app === 'spotify') cmd = 'start spotify';
        else if (app === 'notepad') cmd = 'notepad';
        else if (app === 'calculator' || app === 'calc') cmd = 'calc';
        else if (app === 'explorer' || app === 'files') cmd = 'explorer';
        else if (app === 'cmd' || app === 'terminal' || app === 'powershell') cmd = 'start powershell';
        else cmd = `start ${app}`;

        await runPowerShell(cmd);
        result.feedback = `Successfully launched ${parameters.target}.`;
        result.speechReply = `Launched ${parameters.target}`;
        break;
      }

      case 'close-app': {
        const app = parameters.target;
        // Kill process
        await runPowerShell(`Stop-Process -Name "${app}" -Force`);
        result.feedback = `Closed application: ${app}.`;
        result.speechReply = `Closed ${app}`;
        break;
      }

      case 'open-url': {
        const url = parameters.url;
        await runPowerShell(`Start-Process "${url}"`);
        result.feedback = `Opening URL: ${url}`;
        result.speechReply = `Opening website`;
        break;
      }

      case 'volume': {
        const val = parameters.value;
        const wscript = `New-Object -ComObject WScript.Shell`;
        
        if (val === 'mute') {
          await runPowerShell(`(New-Object -ComObject WScript.Shell).SendKeys([char]173)`);
          result.feedback = `Volume muted.`;
          result.speechReply = `Muted`;
        } else if (val === 'up') {
          await runPowerShell(`(New-Object -ComObject WScript.Shell).SendKeys([char]175)`);
          result.feedback = `Volume increased.`;
          result.speechReply = `Volume up`;
        } else if (val === 'down') {
          await runPowerShell(`(New-Object -ComObject WScript.Shell).SendKeys([char]174)`);
          result.feedback = `Volume decreased.`;
          result.speechReply = `Volume down`;
        } else {
          // Absolute volume 0-100
          const numericVal = parseInt(val);
          if (!isNaN(numericVal)) {
            // First send 50 volume down keystrokes to ensure volume is 0
            const volumeDownKeys = '[char]174';
            const volumeUpKeys = '[char]175';
            let psScript = `
              $w = New-Object -ComObject WScript.Shell;
              for ($i = 0; $i -lt 50; $i++) { $w.SendKeys(${volumeDownKeys}) }
            `;
            // Then send volume up keys
            const ups = Math.round(numericVal / 2);
            psScript += `
              for ($i = 0; $i -lt ${ups}; $i++) { $w.SendKeys(${volumeUpKeys}) }
            `;
            await runPowerShell(psScript);
            result.feedback = `Volume set to ${numericVal} percent.`;
            result.speechReply = `Volume set to ${numericVal} percent`;
          }
        }
        break;
      }

      case 'screenshot': {
        const tempPath = path.join(__dirname, 'temp_screenshot.png');
        // Delete if exists
        if (fs.existsSync(tempPath)) {
          fs.unlinkSync(tempPath);
        }

        const psScreenshot = `
          [Reflection.Assembly]::LoadWithPartialName("System.Drawing") | Out-Null
          [Reflection.Assembly]::LoadWithPartialName("System.Windows.Forms") | Out-Null
          $bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
          $bmp = New-Object System.Drawing.Bitmap($bounds.Width, $bounds.Height)
          $graphics = [System.Drawing.Graphics]::FromImage($bmp)
          $graphics.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
          $bmp.Save("${tempPath.replace(/\\/g, '\\\\')}", [System.Drawing.Imaging.ImageFormat]::Png)
          $graphics.Dispose()
          $bmp.Dispose()
        `;
        
        await runPowerShell(psScreenshot);
        
        // Verify screenshot file exists
        if (fs.existsSync(tempPath)) {
          const imgBase64 = fs.readFileSync(tempPath, { encoding: 'base64' });
          result.screenshot = `data:image/png;base64,${imgBase64}`;
          result.feedback = `Screenshot captured successfully, sir.`;
          result.speechReply = `Screenshot captured`;
          // Clean up file
          fs.unlinkSync(tempPath);
        } else {
          throw new Error('Screenshot file was not saved.');
        }
        break;
      }

      case 'lock': {
        await runPowerShell('rundll32.exe user32.dll,LockWorkStation');
        result.feedback = `Workstation locked.`;
        result.speechReply = `System locked`;
        break;
      }

      case 'shutdown': {
        result.feedback = `Shutting down system in 5 seconds. Goodbye, sir.`;
        result.speechReply = `Shutting down system in five seconds. Goodbye`;
        // Execute shutdown with delay so we can notify server first
        setTimeout(async () => {
          await runPowerShell('shutdown /s /t 0');
        }, 5000);
        break;
      }

      case 'restart': {
        result.feedback = `Rebooting system in 5 seconds, sir.`;
        result.speechReply = `Rebooting system in five seconds`;
        setTimeout(async () => {
          await runPowerShell('shutdown /r /t 0');
        }, 5000);
        break;
      }

      case 'file': {
        const { operation, filePath, content } = parameters;
        // Resolve path to home directory if starting with ~
        let resolvedPath = filePath;
        if (filePath && filePath.startsWith('~')) {
          resolvedPath = path.join(os.homedir(), filePath.slice(1));
        } else if (filePath && (filePath.toLowerCase() === 'desktop' || filePath.toLowerCase() === 'desktop/')) {
          resolvedPath = path.join(os.homedir(), 'Desktop');
        } else if (filePath && filePath.toLowerCase().startsWith('desktop/')) {
          resolvedPath = path.join(os.homedir(), 'Desktop', filePath.substring(8));
        }

        if (operation === 'create-folder') {
          fs.mkdirSync(resolvedPath, { recursive: true });
          result.feedback = `Created directory: ${resolvedPath}`;
          result.speechReply = `Folder created`;
        } else if (operation === 'create-file') {
          fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
          fs.writeFileSync(resolvedPath, content || '');
          result.feedback = `Created file: ${resolvedPath}`;
          result.speechReply = `File created`;
        } else if (operation === 'rename') {
          const newName = parameters.newPath || parameters.destinationPath || parameters.newName;
          if (!newName) throw new Error("Rename target name or path is required.");
          
          let resolvedNewPath = newName;
          if (newName.startsWith('~')) {
            resolvedNewPath = path.join(os.homedir(), newName.slice(1));
          } else if (newName.toLowerCase().startsWith('desktop/')) {
            resolvedNewPath = path.join(os.homedir(), 'Desktop', newName.substring(8));
          } else if (!newName.includes('/') && !newName.includes('\\')) {
            resolvedNewPath = path.join(path.dirname(resolvedPath), newName);
          }
          
          fs.renameSync(resolvedPath, resolvedNewPath);
          result.feedback = `Renamed ${resolvedPath} to ${resolvedNewPath}`;
          result.speechReply = `Item renamed successfully`;
        } else if (operation === 'move') {
          const dest = parameters.newPath || parameters.destinationPath || parameters.destination;
          if (!dest) throw new Error("Move destination path is required.");
          
          let resolvedDest = dest;
          if (dest.startsWith('~')) {
            resolvedDest = path.join(os.homedir(), dest.slice(1));
          } else if (dest.toLowerCase() === 'desktop' || dest.toLowerCase() === 'desktop/') {
            resolvedDest = path.join(os.homedir(), 'Desktop');
          } else if (dest.toLowerCase().startsWith('desktop/')) {
            resolvedDest = path.join(os.homedir(), 'Desktop', dest.substring(8));
          }
          
          if (fs.existsSync(resolvedDest) && fs.statSync(resolvedDest).isDirectory()) {
            resolvedDest = path.join(resolvedDest, path.basename(resolvedPath));
          }
          
          fs.renameSync(resolvedPath, resolvedDest);
          result.feedback = `Moved ${resolvedPath} to ${resolvedDest}`;
          result.speechReply = `Item moved successfully`;
        } else if (operation === 'delete') {
          if (fs.existsSync(resolvedPath)) {
            const stats = fs.statSync(resolvedPath);
            if (stats.isDirectory()) {
              fs.rmSync(resolvedPath, { recursive: true, force: true });
            } else {
              fs.unlinkSync(resolvedPath);
            }
            result.feedback = `Deleted item: ${resolvedPath}`;
            result.speechReply = `Item deleted`;
          } else {
            throw new Error(`File or directory does not exist: ${resolvedPath}`);
          }
        } else if (operation === 'clean-downloads') {
          const ageLimitDays = parameters.ageLimitDays;
          const downloadsPath = path.join(os.homedir(), 'Downloads');
          if (fs.existsSync(downloadsPath)) {
            const files = fs.readdirSync(downloadsPath);
            let count = 0;
            const now = Date.now();
            files.forEach(file => {
              const fullPath = path.join(downloadsPath, file);
              try {
                const stats = fs.statSync(fullPath);
                if (ageLimitDays) {
                  const fileAgeMs = now - stats.mtimeMs;
                  const limitMs = ageLimitDays * 24 * 60 * 60 * 1000;
                  if (fileAgeMs > limitMs) {
                    if (stats.isDirectory()) {
                      fs.rmSync(fullPath, { recursive: true, force: true });
                    } else {
                      fs.unlinkSync(fullPath);
                    }
                    count++;
                  }
                } else {
                  if (stats.isDirectory()) {
                    fs.rmSync(fullPath, { recursive: true, force: true });
                  } else {
                    fs.unlinkSync(fullPath);
                  }
                  count++;
                }
              } catch (e) {
                console.error(`Error deleting ${file}:`, e);
              }
            });
            result.feedback = `Successfully cleaned ${count} items from Downloads folder.`;
            result.speechReply = `Downloads cleaned. I deleted all files older than ${ageLimitDays || 0} days.`;
          } else {
            throw new Error("Downloads folder not found.");
          }
        }
        break;
      }

      default:
        throw new Error(`Action "${action}" is not supported by this agent.`);
    }

    socket.emit('agent:action-response', result);
  } catch (err) {
    console.error(`Action failed:`, err);
    socket.emit('agent:action-response', {
      success: false,
      logId,
      action,
      error: err.message,
      feedback: `I encountered an error executing that action: ${err.message}, sir.`
    });
  }
});
