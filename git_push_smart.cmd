@echo off
setlocal EnableExtensions EnableDelayedExpansion

rem Smart git push helper for this repository.
rem Usage:
rem   git_push_smart.cmd
rem   git_push_smart.cmd "Mon message de commit"
rem   git_push_smart.cmd --no-commit

cd /d "%~dp0"
set "EXIT_CODE=0"
set "LOCK_PATH=%CD%\.git\index.lock"
set "SENSITIVE_FOUND=0"
set "GIT_PROC_COUNT=0"

where git >nul 2>nul
if errorlevel 1 (
  echo [ERREUR] Git n'est pas accessible dans le PATH.
  set "EXIT_CODE=1"
  goto :END
)

git rev-parse --is-inside-work-tree >nul 2>nul
if errorlevel 1 (
  echo [ERREUR] Ce dossier n'est pas un dépôt Git.
  set "EXIT_CODE=1"
  goto :END
)

for /f "delims=" %%B in ('git branch --show-current') do set "BRANCH=%%B"
if not defined BRANCH set "BRANCH=(detached HEAD)"

for /f "delims=" %%S in ('git status --short') do set "HAS_CHANGES=1"

set "ARG1=%~1"
set "NO_COMMIT=0"
if /i "%ARG1%"=="--no-commit" set "NO_COMMIT=1"

if "%NO_COMMIT%"=="1" (
  set "COMMIT_MESSAGE="
) else (
  set "COMMIT_MESSAGE=%~1"
)

echo.
echo ========================================
echo   Git Smart Push
echo ========================================
echo Branche locale : %BRANCH%
echo Cible push : origin/main
echo.
git status --short
echo.

call :CHECK_SENSITIVE_PATHS
if "%SENSITIVE_FOUND%"=="1" (
  echo [AVERTISSEMENT] Des chemins sensibles ou generes ont ete detectes.
  echo [AVERTISSEMENT] Verifie bien que rien de local / sensible ne part dans le commit.
  echo.
  echo !SENSITIVE_LIST!
  echo.
  set /p "CONTINUE_WITH_SENSITIVE=Taper OUI pour continuer quand meme : "
  if /I not "!CONTINUE_WITH_SENSITIVE!"=="OUI" (
    echo Annulation demandee par l'utilisateur.
    set "EXIT_CODE=1"
    goto :END
  )
)

if not defined HAS_CHANGES (
  echo Aucun changement detecte.
  echo Je verifie seulement si un push est possible.
  goto :PUSH_ONLY
)

if "%NO_COMMIT%"=="1" (
  echo Mode sans commit active.
  goto :PUSH_ONLY
)

if not defined COMMIT_MESSAGE (
  set /p "COMMIT_MESSAGE=Message de commit ^(%BRANCH%^): "
)

if not defined COMMIT_MESSAGE (
  set "COMMIT_MESSAGE=update %BRANCH%"
)

echo.
call :WAIT_FOR_LOCK
if errorlevel 1 (
  set "EXIT_CODE=1"
  goto :END
)

echo Ajout des changements...
git add -A
if errorlevel 1 (
  echo [ERREUR] Impossible de preparer les fichiers.
  set "EXIT_CODE=1"
  goto :END
)

git diff --cached --quiet
if not errorlevel 1 (
  echo Rien n'est finalement pret pour commit.
  goto :PUSH_ONLY
)

echo.
echo Commit : %COMMIT_MESSAGE%
git commit -m "%COMMIT_MESSAGE%"
if errorlevel 1 (
  echo [ERREUR] Le commit a echoue.
  set "EXIT_CODE=1"
  goto :END
)

:PUSH_ONLY
echo.
call :WAIT_FOR_LOCK
if errorlevel 1 (
  set "EXIT_CODE=1"
  goto :END
)

echo Push vers origin/main...
echo Synchronisation avec origin/main...
git fetch origin main
if errorlevel 1 (
  echo [ERREUR] Impossible de recuperer origin/main.
  set "EXIT_CODE=1"
  goto :END
)

git merge-base --is-ancestor origin/main HEAD
if errorlevel 1 (
  echo [ERREUR] origin/main a diverge de ton HEAD local.
  echo [ERREUR] Le push automatique est bloque pour eviter d'ecraser ou de casser main.
  echo [ERREUR] Resous la divergence manuellement puis relance le script.
  set "EXIT_CODE=1"
  goto :END
)

echo Push vers origin/main...
git push origin HEAD:main

if errorlevel 1 (
  echo [ERREUR] Le push a echoue.
  set "EXIT_CODE=1"
  goto :END
)

echo.
echo [OK] Push termine avec succes.

:END
echo.
pause
exit /b %EXIT_CODE%

:WAIT_FOR_LOCK
if not exist "%LOCK_PATH%" exit /b 0

echo [INFO] Verrou Git detecte: .git\index.lock
call :COUNT_GIT_PROCESSES

if "%GIT_PROC_COUNT%"=="0" (
  echo [INFO] Aucun processus git actif. Suppression du verrou orphelin...
  del /f /q "%LOCK_PATH%" >nul 2>nul
  if not exist "%LOCK_PATH%" exit /b 0
)

echo [INFO] Attente de la fin des autres operations Git / OneDrive...

for /l %%I in (1,1,15) do (
  if not exist "%LOCK_PATH%" exit /b 0
  timeout /t 2 /nobreak >nul
)

if exist "%LOCK_PATH%" (
  echo [ERREUR] Le verrou .git\index.lock est toujours present.
  echo Ferme les autres processus Git ou attends que OneDrive termine, puis relance.
  exit /b 1
)

exit /b 0

:COUNT_GIT_PROCESSES
for /f "delims=" %%P in ('tasklist /FI "IMAGENAME eq git.exe" /NH ^| find /I /C "git.exe"') do set "GIT_PROC_COUNT=%%P"
if not defined GIT_PROC_COUNT set "GIT_PROC_COUNT=0"
exit /b 0

:CHECK_SENSITIVE_PATHS
set "SENSITIVE_FOUND=0"
set "SENSITIVE_LIST="
for /f "delims=" %%F in ('git diff --name-only --diff-filter=ACMRTD') do (
  set "CURRENT_PATH=%%F"
  call :IS_SENSITIVE_PATH "%%F"
  if "!SENSITIVE_MATCH!"=="1" (
    set "SENSITIVE_FOUND=1"
    if defined SENSITIVE_LIST (
      set "SENSITIVE_LIST=!SENSITIVE_LIST!; %%F"
    ) else (
      set "SENSITIVE_LIST=%%F"
    )
  )
)
exit /b 0

:IS_SENSITIVE_PATH
set "SENSITIVE_MATCH=0"
set "PATH_TO_CHECK=%~1"
set "PATH_TO_CHECK=%PATH_TO_CHECK:/=\%"

if /I "!PATH_TO_CHECK:~0,5!"=="data\" set "SENSITIVE_MATCH=1"
if /I "!PATH_TO_CHECK:~0,8!"=="archive\" set "SENSITIVE_MATCH=1"
if /I "!PATH_TO_CHECK:~0,18!"==".netlify\internal\" set "SENSITIVE_MATCH=1"
if /I "!PATH_TO_CHECK:~0,13!"=="node_modules\" set "SENSITIVE_MATCH=1"
if /I "!PATH_TO_CHECK:~0,26!"=="tools\DbToolsPortable\bin\" set "SENSITIVE_MATCH=1"
if /I "!PATH_TO_CHECK:~0,26!"=="tools\DbToolsPortable\obj\" set "SENSITIVE_MATCH=1"
if /I "!PATH_TO_CHECK:~0,30!"=="tools\DbToolsPortable\publish\" set "SENSITIVE_MATCH=1"

echo !PATH_TO_CHECK! | findstr /I /R "\.xlsx$ \.xls$ \.xlsm$ \.csv$ \.tsv$ \.parquet$ \.sqlite$ \.sqlite3$ \.db$ \.sql$ \.dump$ >nul
if not errorlevel 1 set "SENSITIVE_MATCH=1"

exit /b 0
