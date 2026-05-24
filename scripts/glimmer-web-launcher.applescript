-- Glimmer Web 启动器：导出为「应用程序」后双击即可打开本地 Web 版。
-- 会调用 scripts/start-dev.sh：启动 Vite 本地服务并自动打开浏览器。

property projectPath : ""

on run
	if projectPath is "" then
		set projectPath to POSIX path of (path to home folder) & "Documents/GitHub/Glimmer"
	end if
	set scriptPath to projectPath & "/scripts/start-dev.sh"
	try
		do shell script "/bin/bash " & quoted form of scriptPath
	on error errMsg number errNum
		display dialog "无法启动 Glimmer Web：" & return & errMsg buttons {"好"} default button 1 with icon stop
	end try
end run
