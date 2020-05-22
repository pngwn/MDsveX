# escape=`

FROM microsoft/nanoserver:latest

# copy nodejs to nanoserver
RUN mkdir "C:\nodejs"
ADD ./nodejs/nodejs /nodejs

# set path
RUN powershell.exe -NoProfile -ExecutionPolicy Bypass -Command `
	$oldpath = (Get-ItemProperty -Path 'Registry::HKEY_LOCAL_MACHINE\System\CurrentControlSet\Control\Session Manager\Environment' -Name PATH).Path; `
	$newpath = 'C:\nodejs;'+$oldpath; `
	Set-ItemProperty -Path 'Registry::HKEY_LOCAL_MACHINE\System\CurrentControlSet\Control\Session Manager\Environment' -Name PATH -Value $newpath;
