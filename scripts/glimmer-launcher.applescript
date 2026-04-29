-- Glimmer 桌面启动器：导出为「应用程序」后双击即可（无终端窗口）。
-- 会调用 scripts/start-desktop.sh：若开发端口已有进程会先结束，再启动 Tauri 桌面窗口。

property projectPath : ""

on run
	if projectPath is "" then
		set projectPath to POSIX path of (path to home folder) & "Documents/GitHub/Glimmer"
	end if
	set scriptPath to projectPath & "/scripts/start-desktop.sh"
	try
		do shell script "/bin/bash " & quoted form of scriptPath
	on error errMsg number errNum
		display dialog "无法启动 Glimmer：" & return & errMsg buttons {"好"} default button 1 with icon stop
	end try
end run
