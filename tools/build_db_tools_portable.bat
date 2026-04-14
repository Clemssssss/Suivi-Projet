@echo off
setlocal

cd /d "%~dp0"

echo ==========================================
echo Build DB Tools Portable (dossier)
echo ==========================================

dotnet publish ".\DbToolsPortable\DbToolsPortable.csproj" ^
  -c Release ^
  -p:PublishSingleFile=false ^
  -p:PublishTrimmed=false ^
  -o ".\DbToolsPortable\publish\portable"

set "RC=%ERRORLEVEL%"
echo.
if "%RC%"=="0" (
  echo [OK] Build termine.
  echo Sortie: tools\DbToolsPortable\publish\portable
) else (
  echo [ERREUR] Build en echec (%RC%).
)
echo.
pause
exit /b %RC%
