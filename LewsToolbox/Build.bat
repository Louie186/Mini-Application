@echo off
rem ============================================================
rem  Lew's Toolbox - builds LewsToolbox.exe on THIS PC.
rem  Uses the C# compiler that is already part of Windows
rem  (.NET Framework 4), so nothing needs installing.
rem  Double-click this file once. Run it again after an update.
rem ============================================================
setlocal
cd /d "%~dp0"
set "CSC=%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
if not exist "%CSC%" set "CSC=%WINDIR%\Microsoft.NET\Framework\v4.0.30319\csc.exe"
if not exist "%CSC%" (
  echo.
  echo  Could not find the Windows C# compiler ^(.NET Framework 4^).
  echo  It is part of Windows 10 and 11 - ask IT to turn on ".NET Framework 4.8".
  echo.
  pause
  exit /b 1
)
echo Building Lew's Toolbox...
"%CSC%" /nologo /codepage:65001 /target:winexe /optimize+ /out:"LewsToolbox.exe" /win32icon:"src\app.ico" ^
  /r:System.dll /r:System.Core.dll /r:System.Drawing.dll /r:System.Windows.Forms.dll /r:System.Xml.dll ^
  /r:System.Web.Extensions.dll /r:System.IO.Compression.dll ^
  src\*.cs
if errorlevel 1 (
  echo.
  echo  The build failed - send a photo or copy of the messages above to Claude.
  echo.
  pause
  exit /b 1
)
echo.
echo  Done: LewsToolbox.exe is ready in this folder.
echo  Tip: right-click LewsToolbox.exe ^> Pin to taskbar.
echo.
start "" "LewsToolbox.exe"
timeout /t 5 >nul
