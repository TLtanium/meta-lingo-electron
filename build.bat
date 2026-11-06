@echo off
REM Meta-Lingo Windows Build Script
REM Includes Python backend (PyInstaller) + Electron frontend packaging
REM Usage: Double-click or run build.bat in cmd

setlocal DisableDelayedExpansion

REM Get script directory as project path
set PROJECT_PATH=%~dp0
cd /d "%PROJECT_PATH%"

REM ========================================
REM Step 0: Terminate running Meta-Lingo processes (avoid locked files)
REM ========================================
echo.
echo [INFO] Step 0: Terminating running Meta-Lingo processes (if any)...
taskkill /F /IM "Meta-Lingo.exe" /T 2>nul
taskkill /F /IM "meta-lingo-backend.exe" /T 2>nul
taskkill /F /IM "meta-lingo-mcp.exe" /T 2>nul
timeout /t 2 /nobreak >nul

echo.
echo ========================================
echo   Meta-Lingo Build Script (Windows)
echo ========================================
echo.

REM ========================================
REM Step 1: Check dependencies
REM ========================================
echo.
echo [INFO] Step 1: Checking dependencies...

REM Check Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js not found. Please install Node.js first.
    pause
    exit /b 1
)
for /f "tokens=*" %%i in ('node -v') do echo [INFO] Node.js version: %%i

REM Check npm
where npm >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] npm not found.
    pause
    exit /b 1
)
for /f "tokens=*" %%i in ('npm -v') do echo [INFO] npm version: %%i

REM Check conda - try to find conda in common locations
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
    REM Try to find conda in PATH
    where conda >nul 2>nul
    if %errorlevel% equ 0 (
        for /f "tokens=*" %%i in ('where conda') do set CONDA_EXE=%%i
        for %%i in ("%CONDA_EXE%") do set CONDA_ROOT=%%~dpi..\..
    )
)

if "%CONDA_EXE%"=="" (
    echo [ERROR] Conda not found. Please install Anaconda/Miniconda first.
    echo [INFO] Or ensure conda is in your PATH environment variable.
    pause
    exit /b 1
)

echo [INFO] Found conda at: %CONDA_EXE%
for /f "tokens=*" %%i in ('"%CONDA_EXE%" --version') do echo [INFO] %%i

REM Check if conda environment exists
echo [INFO] Checking conda environment: meta-lingo-electron
"%CONDA_EXE%" env list | findstr /C:"meta-lingo-electron" >nul 2>nul
if %errorlevel% equ 0 goto :env_exists

REM Environment not found, create new one
echo [WARN] Conda environment 'meta-lingo-electron' not found. Creating...
echo [INFO] This may take several minutes, please wait...

"%CONDA_EXE%" create -n meta-lingo-electron python=3.12 -y
if %errorlevel% neq 0 (
    echo [ERROR] Failed to create conda environment.
    pause
    exit /b 1
)
echo [INFO] Conda environment created successfully.

call "%CONDA_ROOT%\condabin\conda.bat" activate meta-lingo-electron
if %errorlevel% neq 0 (
    echo [ERROR] Failed to activate conda environment.
    pause
    exit /b 1
)

REM Install dependencies
echo [INFO] Installing Python dependencies from requirements.txt...
echo [INFO] This may take a long time, please be patient...

REM Upgrade pip first to ensure compatibility
python -m pip install --upgrade pip
if %errorlevel% neq 0 (
    echo [WARN] Failed to upgrade pip, but continuing...
)

REM Install requirements with verbose output
pip install -r requirements.txt --verbose
if %errorlevel% neq 0 (
    echo [ERROR] Failed to install dependencies from requirements.txt
    echo [INFO] Please check the error messages above for details.
    pause
    exit /b 1
)

REM Verify critical dependencies are installed
echo [INFO] Verifying critical dependencies...
python -c "import fastapi; import uvicorn; import torch; import transformers; import spacy; import nltk; import benepar; import pymusas; import plotly; import matplotlib; import wordcloud; print('[OK] All critical dependencies are installed')"
if %errorlevel% neq 0 (
    echo [ERROR] Some critical dependencies are missing or cannot be imported.
    echo [ERROR] Please check the error messages above.
    pause
    exit /b 1
)
echo [INFO] Critical dependencies verification passed.

REM Install local SpaCy models (check both models directory and project root)
if exist "models\en_core_web_sm-3.8.0-py3-none-any.whl" (
    echo [INFO] Installing SpaCy English model from models directory...
    pip install models\en_core_web_sm-3.8.0-py3-none-any.whl
) else if exist "en_core_web_sm-3.8.0-py3-none-any.whl" (
    echo [INFO] Installing SpaCy English model from project root...
    pip install en_core_web_sm-3.8.0-py3-none-any.whl
) else (
    echo [WARN] SpaCy English model wheel not found, skipping...
)

if exist "models\zh_core_web_sm-3.8.0-py3-none-any.whl" (
    echo [INFO] Installing SpaCy Chinese model from models directory...
    pip install models\zh_core_web_sm-3.8.0-py3-none-any.whl
) else if exist "zh_core_web_sm-3.8.0-py3-none-any.whl" (
    echo [INFO] Installing SpaCy Chinese model from project root...
    pip install zh_core_web_sm-3.8.0-py3-none-any.whl
) else (
    echo [WARN] SpaCy Chinese model wheel not found, skipping...
)

REM Install local PyMUSAS models (from models directory)
if exist "models\en_dual_none_contextual-0.3.3-py3-none-any.whl" (
    echo [INFO] Installing PyMUSAS English model from models directory...
    pip install models\en_dual_none_contextual-0.3.3-py3-none-any.whl
    if %errorlevel% neq 0 (
        echo [WARN] Failed to install PyMUSAS English model, but continuing...
    )
) else (
    echo [WARN] PyMUSAS English model wheel not found in models directory, skipping...
)

if exist "models\cmn_dual_upos2usas_contextual-0.3.3-py3-none-any.whl" (
    echo [INFO] Installing PyMUSAS Chinese model from models directory...
    pip install models\cmn_dual_upos2usas_contextual-0.3.3-py3-none-any.whl
    if %errorlevel% neq 0 (
        echo [WARN] Failed to install PyMUSAS Chinese model, but continuing...
    )
) else (
    echo [WARN] PyMUSAS Chinese model wheel not found in models directory, skipping...
)

REM NLTK data and benepar model are in models directory, no need to download
echo [INFO] NLTK data and benepar model are in models directory, skipping download.

echo [INFO] All dependencies installed successfully.
goto :env_ready

:env_exists
echo [INFO] Conda environment 'meta-lingo-electron' found.
call "%CONDA_ROOT%\condabin\conda.bat" activate meta-lingo-electron
if %errorlevel% neq 0 (
    echo [ERROR] Failed to activate conda environment.
    pause
    exit /b 1
)

REM Verify existing environment has all dependencies
echo [INFO] Verifying existing environment dependencies...
python -c "import fastapi; import uvicorn; import torch; import transformers; import spacy; import nltk; import benepar; import pymusas; import plotly; import matplotlib; import wordcloud; print('[OK] All critical dependencies are installed')" >nul 2>nul
if %errorlevel% neq 0 (
    echo [WARN] Some dependencies may be missing in existing environment.
    echo [INFO] Reinstalling requirements.txt to ensure all dependencies are up to date...
    python -m pip install --upgrade pip
    if %errorlevel% neq 0 (
        echo [WARN] Failed to upgrade pip, but continuing...
    )
    pip install -r requirements.txt --verbose
    REM Note: pip may return non-zero even if most packages installed successfully
    REM We'll verify by importing instead of relying on exit code alone
    echo [INFO] Installation command completed. Verifying dependencies...
    echo [INFO] Verifying dependencies again after reinstallation...
    python -c "import fastapi; import uvicorn; import torch; import transformers; import spacy; import nltk; import benepar; import pymusas; import plotly; import matplotlib; import wordcloud; print('[OK] All critical dependencies are installed')"
    if %errorlevel% neq 0 (
        echo [ERROR] Some critical dependencies are still missing after reinstallation.
        echo [ERROR] Please check the error messages above.
        pause
        exit /b 1
    )
    echo [INFO] Dependencies verification passed after reinstallation.
) else (
    echo [INFO] All critical dependencies are already installed.
)

:env_ready

REM Check Python
where python >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Python not found in conda environment.
    pause
    exit /b 1
)
for /f "tokens=*" %%i in ('python --version') do echo [INFO] %%i

REM Check/Install PyInstaller
python -c "import PyInstaller" >nul 2>nul
if %errorlevel% neq 0 (
    echo [WARN] PyInstaller not found. Installing...
    pip install pyinstaller
    if %errorlevel% neq 0 (
        echo [ERROR] Failed to install PyInstaller.
        pause
        exit /b 1
    )
)
echo [INFO] PyInstaller installed

REM ========================================
REM Step 1-B: Ensure bundled NLTK resources exist
REM ========================================
echo.
echo [INFO] Step 1-B: Checking bundled NLTK resources...
set NLTK_MODELS_DIR=%PROJECT_PATH%models\nltk

if not exist "%NLTK_MODELS_DIR%" (
    mkdir "%NLTK_MODELS_DIR%"
)

set WORDNET_OK=0
if exist "%NLTK_MODELS_DIR%\corpora\wordnet" set WORDNET_OK=1
if exist "%NLTK_MODELS_DIR%\corpora\wordnet.zip" set WORDNET_OK=1

if "%WORDNET_OK%"=="0" (
    echo [WARN] NLTK wordnet not found in models\nltk. Downloading required NLTK resources...
    python "scripts\ensure_nltk_resources.py" "%NLTK_MODELS_DIR%"
    if %errorlevel% neq 0 (
        echo [ERROR] Failed to download NLTK resources.
        pause
        exit /b 1
    )
)

set WORDNET_OK=0
if exist "%NLTK_MODELS_DIR%\corpora\wordnet" set WORDNET_OK=1
if exist "%NLTK_MODELS_DIR%\corpora\wordnet.zip" set WORDNET_OK=1
if "%WORDNET_OK%"=="0" (
    echo [ERROR] NLTK wordnet is still missing at models\nltk\corpora.
    echo [ERROR] Build stopped to prevent packaged app startup failure.
    pause
    exit /b 1
)
echo [INFO] NLTK bundled resources check passed.

REM ========================================
REM Step 2: Check and sync version numbers
REM ========================================
echo.
echo [INFO] Step 2: Checking and syncing version numbers...
python scripts\sync_version.py
if %errorlevel% neq 0 (
    echo [ERROR] Version synchronization failed. See the Python error above for the cause.
    pause
    exit /b 1
)

REM User-resource reader and license inventory for this target build.
python -m pip install mdict-utils==1.3.14 xxhash==4.0.2
if %errorlevel% neq 0 exit /b 1
python scripts\check_resource_packaging.py
if %errorlevel% neq 0 exit /b 1

REM ========================================
REM Step 3: Clean old build files
REM ========================================
echo.
echo [INFO] Step 3: Cleaning old build files...
if exist dist rmdir /s /q dist
if exist dist-electron rmdir /s /q dist-electron

REM Only clean Windows release files, preserve Mac packages
echo [INFO] Cleaning Windows release files only (preserving Mac packages)...
if exist "release\Meta-Lingo" rmdir /s /q "release\Meta-Lingo"
if exist release\win-unpacked rmdir /s /q release\win-unpacked
if exist release\win-ia32-unpacked rmdir /s /q release\win-ia32-unpacked
if exist "release\*.exe" del /q "release\*.exe" 2>nul
if exist "release\*.exe.blockmap" del /q "release\*.exe.blockmap" 2>nul
if exist "release\*.msi" del /q "release\*.msi" 2>nul

if exist backend-dist rmdir /s /q backend-dist
if exist backend\dist rmdir /s /q backend\dist
if exist backend\build rmdir /s /q backend\build

REM ========================================
REM Step 4: Preserve runtime data and use fixed factory templates
REM ========================================
echo.
echo [INFO] Step 4: Using factory templates from saves\frameworks; project runtime data is excluded and preserved.

REM ========================================
REM Step 5: Build Python backend
REM ========================================
echo.
echo [INFO] Step 5: Building Python backend with PyInstaller...
cd backend

REM Build with PyInstaller
pyinstaller --clean --noconfirm backend.spec
if %errorlevel% neq 0 (
    echo [ERROR] PyInstaller build failed.
    pause
    exit /b 1
)

REM Move build result to project root
cd /d "%PROJECT_PATH%"
if not exist "backend\dist" (
    echo [ERROR] PyInstaller output not found: backend\dist
    pause
    exit /b 1
)
move backend\dist backend-dist
echo [INFO] Backend build completed: backend-dist\meta-lingo-backend\

REM Clean macOS resource fork files (in case built from macOS-developed codebase)
echo [INFO] Cleaning macOS resource fork files from backend build...
powershell -Command "$count = (Get-ChildItem -Path 'backend-dist\meta-lingo-backend' -Recurse -File -Filter '._*' -ErrorAction SilentlyContinue | Measure-Object).Count; if ($count -gt 0) { Get-ChildItem -Path 'backend-dist\meta-lingo-backend' -Recurse -File -Filter '._*' -ErrorAction SilentlyContinue | Remove-Item -Force; Write-Host '[INFO] Removed' $count 'macOS resource fork files (._*)' } else { Write-Host '[INFO] No ._* resource fork files found' }"
powershell -Command "$count = (Get-ChildItem -Path 'backend-dist\meta-lingo-backend' -Recurse -File -Filter '.__*' -ErrorAction SilentlyContinue | Measure-Object).Count; if ($count -gt 0) { Get-ChildItem -Path 'backend-dist\meta-lingo-backend' -Recurse -File -Filter '.__*' -ErrorAction SilentlyContinue | Remove-Item -Force; Write-Host '[INFO] Removed' $count 'macOS resource fork files (__*)' } else { Write-Host '[INFO] No .__* resource fork files found' }"

REM ========================================
REM Step 5-B: Build MCP server + .mcpb extension
REM ========================================
echo.
echo [INFO] Step 5-B: Building MCP server and .mcpb extension...

cd backend
pyinstaller --clean --noconfirm mcp_server.spec
if %errorlevel% neq 0 (
    echo [ERROR] MCP server build failed.
    cd /d "%PROJECT_PATH%"
    pause
    exit /b 1
)
cd /d "%PROJECT_PATH%"

REM Move MCP dist
if not exist "backend-dist" mkdir backend-dist
set "MCP_SRC=backend\dist\meta-lingo-mcp"
set "MCP_DST=backend-dist\meta-lingo-mcp"

if exist "%MCP_DST%" (
    rmdir /s /q "%MCP_DST%" 2>nul
)

if exist "%MCP_SRC%" (
    REM move might fail with "Access is denied" when Windows/AV locks files briefly.
    REM After move attempt, fall back to robocopy to ensure the destination exists.
    move "%MCP_SRC%" "%MCP_DST%"
    if not exist "%MCP_DST%" (
        echo [WARN] move failed or was blocked. Trying robocopy fallback...
        REM Copy directory tree; retries help against transient locks.
        robocopy "%MCP_SRC%" "%MCP_DST%" /E /R:5 /W:2 /NFL /NDL /NJH /NJS /NC /NS >nul
    )

    if exist "%MCP_DST%" (
        echo [INFO] MCP server build completed: backend-dist\meta-lingo-mcp\
    ) else (
        echo [ERROR] MCP dist missing after move/robocopy: %MCP_DST%
        pause
        exit /b 1
    )
) else (
    echo [ERROR] MCP server build output not found: backend\dist\meta-lingo-mcp
    pause
    exit /b 1
)

REM Sync manifest version and package .mcpb
if not exist "backend-dist\meta-lingo-mcp" (
    echo [ERROR] MCP dist missing after move: backend-dist\meta-lingo-mcp
    pause
    exit /b 1
)
python "scripts\sync_mcpb_manifest_version.py"

REM Stage files for .mcpb packaging (manifest + icon + server binary tree)
python "scripts\stage_mcpb_build.py" "build\mcpb-staging" "backend-dist\meta-lingo-mcp"
if %errorlevel% neq 0 (
    echo [ERROR] MCP extension staging failed.
    pause
    exit /b 1
)

REM Package .mcpb using the official @anthropic-ai/mcpb CLI - npx, no global install
REM needed - schema-validates the manifest and packs a standards-compliant archive.
REM ".mcpb" is Claude Desktop's current extension format, renamed from ".dxt".
if exist "backend-dist\meta-lingo-mcp.mcpb" del /f /q "backend-dist\meta-lingo-mcp.mcpb"
call npx --yes @anthropic-ai/mcpb pack "build\mcpb-staging" "backend-dist\meta-lingo-mcp.mcpb"
if %errorlevel% neq 0 (
    echo [ERROR] MCP .mcpb packaging failed.
    pause
    exit /b 1
)
rmdir /s /q "build\mcpb-staging" 2>nul
echo [INFO] MCP extension packaged: backend-dist\meta-lingo-mcp.mcpb

:skip_mcp

REM ========================================
REM Step 6: Check frontend dependencies
REM ========================================
echo.
echo [INFO] Step 6: Checking npm dependencies...
if not exist node_modules (
    echo [INFO] node_modules not found, running npm install...
    call npm install
) else (
    echo [INFO] node_modules found, skipping npm install
)

REM ========================================
REM Step 7: Build frontend and Electron
REM ========================================
echo.
echo [INFO] Step 7: Building frontend and electron...
python scripts\collect_third_party_licenses.py
if %errorlevel% neq 0 exit /b 1
set ELECTRON=true
call npm run build:frontend
if %errorlevel% neq 0 (
    echo [ERROR] Frontend build failed.
    pause
    exit /b 1
)
node scripts\check_electron_bundle.cjs
if %errorlevel% neq 0 exit /b 1
python scripts\check_license_assets.py --built
if %errorlevel% neq 0 exit /b 1

if not exist dist (
    echo [ERROR] Frontend build failed - dist directory not found
    pause
    exit /b 1
)
if not exist dist-electron (
    echo [ERROR] Electron build failed - dist-electron directory not found
    pause
    exit /b 1
)
echo [INFO] Frontend and Electron build completed

REM ========================================
REM Step 8: Package Electron app
REM ========================================
echo.
echo [INFO] Step 8: Packaging Electron app for Windows...
REM Ensure win-unpacked is removed before packaging (avoids UNKNOWN/copy errors from previous run)
if exist release\win-unpacked (
    rmdir /s /q release\win-unpacked
    if exist release\win-unpacked (
        echo [WARN] Could not remove release\win-unpacked. Retrying after 2s...
        timeout /t 2 /nobreak >nul
        rmdir /s /q release\win-unpacked
    )
    if exist release\win-unpacked (
        echo [ERROR] release\win-unpacked is locked or in use. Close any program using it and run build again.
        pause
        exit /b 1
    )
)
call npx electron-builder --win --x64 --dir --config electron-builder.json
if %errorlevel% neq 0 (
    echo [ERROR] Electron build failed.
    pause
    exit /b 1
)

REM electron-builder --dir outputs directly to release\win-unpacked (no rename/copy step)
echo [INFO] Packaged output location: release\win-unpacked
if not exist "release\win-unpacked" (
    echo [ERROR] release\win-unpacked not found after electron-builder.
    pause
    exit /b 1
)

REM Final cleanup: Remove macOS resource fork files from packaged app
echo.
echo [INFO] Final cleanup: Removing macOS resource fork files from packaged app...
if exist "release\win-unpacked" (
    powershell -Command "$count1 = (Get-ChildItem -Path 'release\win-unpacked' -Recurse -File -Filter '._*' -ErrorAction SilentlyContinue | Measure-Object).Count; $count2 = (Get-ChildItem -Path 'release\win-unpacked' -Recurse -File -Filter '.__*' -ErrorAction SilentlyContinue | Measure-Object).Count; $total = $count1 + $count2; if ($total -gt 0) { Get-ChildItem -Path 'release\win-unpacked' -Recurse -File -Filter '._*' -ErrorAction SilentlyContinue | Remove-Item -Force; Get-ChildItem -Path 'release\win-unpacked' -Recurse -File -Filter '.__*' -ErrorAction SilentlyContinue | Remove-Item -Force; Write-Host '[INFO] Removed' $total 'macOS resource fork files from packaged app' } else { Write-Host '[INFO] No resource fork files found in packaged app (good!)' }"
)

REM ========================================
REM Done
REM ========================================
echo.
echo ========================================
echo   [OK] Build completed successfully!
echo ========================================
echo.
echo [INFO] Output directory: %PROJECT_PATH%release\win-unpacked
echo [INFO] Application: release\win-unpacked\Meta-Lingo.exe
echo.
echo [INFO] Users can copy the release\win-unpacked folder to any location and run Meta-Lingo.exe
echo.

REM Show build result
dir /b release\win-unpacked

REM Open output directory
explorer release\win-unpacked

echo.
echo ========================================
echo   Press any key to close this window...
echo ========================================
pause >nul
