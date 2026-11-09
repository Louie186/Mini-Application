@echo off
rem ============================================================
rem  Lew's Toolbox - builds LewsToolbox.exe on THIS PC.
rem  Uses the C# compiler that is already part of Windows
rem  (.NET Framework 4), so nothing needs installing.
rem  Double-click this file once. Run it again after an update.
rem  If your company blocks building, use Ready-made\LewsToolbox.exe
rem ============================================================
setlocal
cd /d "%~dp0"
title Lew's Toolbox - build
echo.
echo  LEW'S TOOLBOX - BUILD
echo  Folder: %CD%
echo.

rem ---------- step 1: can we save in this folder? ----------
echo  Step 1 of 3: checking this folder can be saved to...
if not exist "src\Program.cs" goto nosrc
set "OUT=%CD%"
echo test> "%OUT%\_write_test.tmp" 2>nul
if exist "%OUT%\_write_test.tmp" goto writeok
set "OUT=%LOCALAPPDATA%\LewsToolbox"
echo    This folder is locked (Access denied) - building here instead:
echo    %OUT%
if not exist "%OUT%" mkdir "%OUT%" 2>nul
echo test> "%OUT%\_write_test.tmp" 2>nul
if not exist "%OUT%\_write_test.tmp" goto nowrite
:writeok
del "%OUT%\_write_test.tmp" >nul 2>&1
echo    OK
echo.

rem ---------- step 2: build ----------
echo  Step 2 of 3: building LewsToolbox.exe...
set "CSC=%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
if not exist "%CSC%" set "CSC=%WINDIR%\Microsoft.NET\Framework\v4.0.30319\csc.exe"
if not exist "%CSC%" goto nocsc
tasklist /FI "IMAGENAME eq LewsToolbox.exe" 2>nul | find /I "LewsToolbox.exe" >nul && echo    Lew's Toolbox is open - close it first, then run this again. && goto fail
"%CSC%" /nologo /codepage:65001 /target:winexe /optimize+ /out:"%OUT%\LewsToolbox.exe" /win32icon:"src\app.ico" ^
  /r:System.dll /r:System.Core.dll /r:System.Drawing.dll /r:System.Windows.Forms.dll /r:System.Xml.dll ^
  /r:System.Web.Extensions.dll /r:System.IO.Compression.dll ^
  /resource:src\taskpack-runtime.js,taskpack-runtime.js ^
  src\*.cs
if errorlevel 1 goto buildfail
if not exist "%OUT%\LewsToolbox.exe" goto buildfail
echo    OK
echo.

rem ---------- step 3: open ----------
echo  Step 3 of 3: opening Lew's Toolbox...
start "" "%OUT%\LewsToolbox.exe"
if errorlevel 1 goto runblocked
echo    OK
echo.
echo  Done: %OUT%\LewsToolbox.exe
echo  Tip: right-click LewsToolbox.exe ^> Pin to taskbar.
if /I not "%OUT%"=="%CD%" start "" explorer.exe "%OUT%"
echo.
timeout /t 8 >nul
exit /b 0

:nosrc
echo.
echo  The "src" folder is not next to Build.bat.
echo  Unzip the whole zip first (right-click the zip ^> Extract All), then run Build.bat from the new folder.
goto fail

:nowrite
echo.
echo  Windows won't let files be saved here either.
echo  Copy the folder to %USERPROFILE%\LewsToolbox and try again,
echo  or use the ready-made program: Ready-made\LewsToolbox.exe
goto fail

:nocsc
echo.
echo  Could not find the Windows C# compiler (.NET Framework 4).
echo  Use the ready-made program instead: Ready-made\LewsToolbox.exe
echo  (or ask IT to turn on ".NET Framework 4.8").
goto fail

:buildfail
echo.
echo  The build did not work.
echo  - "Access is denied" just above = your company blocks the build tool (csc.exe).
echo    Use the ready-made program instead: Ready-made\LewsToolbox.exe
echo  - Anything else: send a photo of this window to Claude.
goto fail

:runblocked
echo.
echo  The program was built, but Windows would not open it ("Access denied").
echo  Your company only allows approved programs. Ask IT to allow:
echo  %OUT%\LewsToolbox.exe
goto fail

:fail
echo.
pause
exit /b 1
