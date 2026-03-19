-- AppleScript launcher for diary-app (exports as Application)
-- Saves no Terminal window; runs the start script in background and opens the browser.

set projectPath to "/Users/yuchao/Desktop/diary-app-master"
set scriptPath to projectPath & "/scripts/start-dev.sh"

-- Build a shell command that sources nvm (if present) and runs the script.
set shellCmd to "export NVM_DIR=\"$HOME/.nvm\"; if [ -s \"$NVM_DIR/nvm.sh\" ]; then . \"$NVM_DIR/nvm.sh\"; fi; \"" & scriptPath & "\""

try
	-- Run without opening Terminal
	do shell script shellCmd
on error errMsg
	display dialog "Failed to start diary-app: " & errMsg buttons {"OK"} default button 1
end try
