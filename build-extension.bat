@echo off
REM Meta-Lingo MCP Extension (.mcpb) Build Script for Windows
REM Usage: Double-click or run build-extension.bat
REM
REM Reads the release version, syncs manifest.json,
REM builds MCP binary if needed, and packages the .mcpb file
REM using the official @anthropic-ai/mcpb CLI (npx, no global install needed).
REM ".mcpb" is Claude Desktop's current extension format (renamed from ".dxt").

setlocal DisableDelayedExpansion

set PROJECT_PATH=%~dp0
cd /d "%PROJECT_PATH%"

echo.
echo ========================================
echo   Meta-Lingo MCP Extension Builder
echo ========================================
echo.

REM ========================================
REM Step 1: Sync from local notes or public package metadata
REM ========================================
echo [INFO] Step 1: Reading release version...
python scripts\sync_mcpb_manifest_version.py
if %errorlevel% neq 0 exit /b 1
set VERSION=
for /f "delims=" %%i in ('python scripts\sync_mcpb_manifest_version.py --print-version') do set VERSION=%%i
if "%VERSION%"=="" (
    echo [ERROR] Could not read release version.
    pause
    exit /b 1
)
echo [INFO] App version: v%VERSION%

REM ========================================
REM Step 2: Activate conda environment
REM ========================================
echo.
echo [INFO] Step 2: Activating conda environment...

set CONDA_EXE=
if exist "C:\ProgramData\Anaconda3\Scripts\conda.exe" (
    set CONDA_EXE=C:\ProgramData\Anaconda3\Scripts\conda.exe
    set CONDA_ROOT=C:\ProgramData\Anaconda3
) else if exist "C:\ProgramData\Miniconda3\Scripts\conda.exe" (
    set CONDA_EXE=C:\ProgramData\Miniconda3\Scripts\conda.exe
    set CONDA_ROOT=C:\ProgramData\Miniconda3
) else if exist "%USERPROFILE%\Anaconda3\Scripts\conda.exe" (
    set CONDA_EXE=%USERPROFILE%\Anaconda3\Scripts\conda.exe
    set CONDA_ROOT=%USERPROFILE%\Anaconda3
) else if exist "%USERPROFILE%\Miniconda3\Scripts\conda.exe" (
    set CONDA_EXE=%USERPROFILE%\Miniconda3\Scripts\conda.exe
    set CONDA_ROOT=%USERPROFILE%\Miniconda3
) else (
    where conda >nul 2>nul
    if %errorlevel% equ 0 (
        for /f "tokens=*" %%i in ('where conda') do set CONDA_EXE=%%i
    )
)

if "%CONDA_EXE%"=="" (
    echo [ERROR] Conda not found. Please install Anaconda/Miniconda first.
    pause
    exit /b 1
)

call "%CONDA_ROOT%\Scripts\activate.bat" meta-lingo-electron
if %errorlevel% neq 0 (
    echo [ERROR] Failed to activate conda environment 'meta-lingo-electron'
    pause
    exit /b 1
)
echo [INFO] Conda environment activated

REM ========================================
REM Step 3: Build MCP binary (always full clean rebuild)
REM ========================================
echo.
echo [INFO] Step 3: Cleaning caches and building MCP server binary...

set MCP_WORKPATH=%PROJECT_PATH%build\mcp_server

REM Clean Python bytecode cache — stale .pyc files cause PyInstaller to silently
REM compile old source into the binary even when the .py has been updated.
echo [INFO] Cleaning Python bytecode cache (backend)...
python -c "import shutil,os; [shutil.rmtree(os.path.join(r,d),ignore_errors=True) for r,ds,_ in os.walk('backend') for d in ds if d=='__pycache__']"

REM Clean PyInstaller artefacts to guarantee a fresh compile from source.
echo [INFO] Cleaning PyInstaller workdir and dist...
if exist "%MCP_WORKPATH%" rmdir /s /q "%MCP_WORKPATH%"
if exist "dist\meta-lingo-mcp" rmdir /s /q "dist\meta-lingo-mcp"

cd backend
pyinstaller --noconfirm mcp_server.spec --distpath "%PROJECT_PATH%dist" --workpath "%PROJECT_PATH%build\mcp_server"
if %errorlevel% neq 0 (
    echo [ERROR] PyInstaller build failed.
    pause
    exit /b 1
)
cd /d "%PROJECT_PATH%"
echo [INFO] MCP binary built successfully

REM ========================================
REM Step 4: Package .mcpb
REM ========================================
echo.
echo [INFO] Step 4: Packaging .mcpb extension...

set BUILD_DIR=%PROJECT_PATH%build\mcpb-staging
set OUTPUT_FILE=%PROJECT_PATH%dist\meta-lingo-mcp.mcpb

if exist "%BUILD_DIR%" rmdir /s /q "%BUILD_DIR%"
mkdir "%BUILD_DIR%\server"

REM Copy manifest and icon
copy /y "mcp-extension\manifest.json" "%BUILD_DIR%\" >nul
if exist "assets\icons\icon.ico" copy /y "assets\icons\icon.ico" "%BUILD_DIR%\icon.png" >nul
if exist "mcp-extension\icon.png" copy /y "mcp-extension\icon.png" "%BUILD_DIR%\" >nul

REM Stage the binary files from dist\meta-lingo-mcp, skipping ._* and .DS_Store
python -c "import os,shutil; build=r'%BUILD_DIR:\=/%'; src=r'%PROJECT_PATH:\=/%dist/meta-lingo-mcp'; [os.makedirs(os.path.join(build,'server',os.path.relpath(root,src)).replace(chr(92),'/'),exist_ok=True) for root,dirs,files in os.walk(src) for f in files if not f.startswith('._')]; [shutil.copy2(os.path.join(root,f),os.path.join(build,'server',os.path.relpath(os.path.join(root,f),src))) for root,dirs,files in os.walk(src) for f in files if not f.startswith('._') and f!='.DS_Store']; print('[INFO] Staged: '+build)"
if %errorlevel% neq 0 (
    echo [ERROR] Staging failed.
    pause
    exit /b 1
)

REM Remove existing .mcpb so the packager always creates a fresh archive
if exist "%OUTPUT_FILE%" del /f /q "%OUTPUT_FILE%"

where npx >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] npx not found. Install Node.js first (needed to fetch @anthropic-ai/mcpb).
    pause
    exit /b 1
)

REM Package using the official @anthropic-ai/mcpb CLI (npx, no global install needed) —
REM schema-validates manifest.json and packs a standards-compliant archive.
call npx --yes @anthropic-ai/mcpb pack "%BUILD_DIR%" "%OUTPUT_FILE%"
if %errorlevel% neq 0 (
    echo [ERROR] Packaging failed.
    pause
    exit /b 1
)
rmdir /s /q "%BUILD_DIR%"

echo.
echo ========================================
echo   [OK] Extension built successfully!
echo ========================================
echo.
echo [INFO] Output: dist\meta-lingo-mcp.mcpb
echo [INFO] Version: v%VERSION%
echo.

pause
