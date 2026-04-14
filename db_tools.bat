@echo off
setlocal

if /i not "%~1"=="__inner__" (
  start "DB Tools - Suivi Projet" cmd /k ""%~f0" __inner__"
  exit /b 0
)
shift /1

cd /d "%~dp0"

:menu
cls
echo ==========================================
echo   DB TOOLS - Suivi Projet (local)
echo ==========================================
echo.
echo 1. Configurer URL DB securisee (Windows)
echo 2. Tester connexion DB
echo 3. Importer un fichier Excel/CSV en DB
echo 4. Supprimer URL DB securisee
echo 5. Enregistrer URL SharePoint de telechargement
echo 6. Ouvrir URL SharePoint maintenant
echo 7. Programmer rappel quotidien (ouvre URL)
echo 8. Afficher l'etat du rappel
echo 9. Supprimer rappel quotidien
echo 0. Quitter
echo.
set /p CHOICE=Choisis une option [0-9] :

if "%CHOICE%"=="1" goto setup_secret
if "%CHOICE%"=="2" goto test_db
if "%CHOICE%"=="3" goto import_db
if "%CHOICE%"=="4" goto clear_secret
if "%CHOICE%"=="5" goto set_sharepoint_url
if "%CHOICE%"=="6" goto open_sharepoint_url
if "%CHOICE%"=="7" goto set_sharepoint_reminder
if "%CHOICE%"=="8" goto show_sharepoint_reminder
if "%CHOICE%"=="9" goto clear_sharepoint_reminder
if "%CHOICE%"=="0" goto end

echo.
echo Option invalide.
pause
goto menu

:setup_secret
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\scripts\windows-db-secret.ps1" -Mode set
if errorlevel 1 (
  echo [ERREUR] Echec configuration URL DB.
) else (
  echo [OK] URL DB stockee de facon securisee.
)
goto back_menu

:test_db
echo.
call powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\scripts\windows-db-secret.ps1" -Mode get >nul
if errorlevel 1 (
  echo [INFO] Aucune URL securisee detectee.
  echo Lance d'abord l'option 1.
  goto back_menu
)
for /f "usebackq delims=" %%A in (`powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\scripts\windows-db-secret.ps1" -Mode get`) do set "NEON_DATABASE_URL=%%A"
if "%NEON_DATABASE_URL%"=="" (
  echo [INFO] URL DB absente dans le coffre local.
  echo Lance d'abord l'option 1.
  goto back_menu
)
call node scripts/test_db_connection.js
goto back_menu

:import_db
echo.
call node scripts/import_excel_picker.js
if errorlevel 1 (
  echo [ERREUR] Import echoue.
) else (
  echo [OK] Import termine.
)
goto back_menu

:clear_secret
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\scripts\windows-db-secret.ps1" -Mode clear
if errorlevel 1 (
  echo [ERREUR] Echec suppression du secret.
) else (
  echo [OK] Secret local supprime.
)
goto back_menu

:set_sharepoint_url
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\scripts\windows-sharepoint-reminder.ps1" -Mode set-url
if errorlevel 1 (
  echo [ERREUR] Echec enregistrement URL SharePoint.
) else (
  echo [OK] URL SharePoint enregistree.
)
goto back_menu

:open_sharepoint_url
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\scripts\windows-sharepoint-reminder.ps1" -Mode open-url
if errorlevel 1 (
  echo [ERREUR] Impossible d'ouvrir l'URL SharePoint.
)
goto back_menu

:set_sharepoint_reminder
echo.
set /p REMIND_TIME=Heure du rappel (HH:mm, ex 08:30) :
if "%REMIND_TIME%"=="" set "REMIND_TIME=09:00"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\scripts\windows-sharepoint-reminder.ps1" -Mode set-reminder -Time "%REMIND_TIME%"
if errorlevel 1 (
  echo [ERREUR] Echec creation rappel.
) else (
  echo [OK] Rappel programme.
)
goto back_menu

:show_sharepoint_reminder
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\scripts\windows-sharepoint-reminder.ps1" -Mode show-reminder
goto back_menu

:clear_sharepoint_reminder
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\scripts\windows-sharepoint-reminder.ps1" -Mode clear-reminder
goto back_menu

:back_menu
echo.
set /p AGAIN=Revenir au menu ? [O/n] :
if /i "%AGAIN%"=="n" goto end
goto menu

:end
echo.
echo Fermeture DB Tools.
exit /b 0
