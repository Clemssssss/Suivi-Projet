param(
  [ValidateSet("set-url", "get-url", "open-url", "set-reminder", "clear-reminder", "show-reminder")]
  [string]$Mode = "get-url",
  [string]$Url = "",
  [string]$Time = "09:00",
  [string]$TaskName = "SuiviProjet-SharePoint-Reminder"
)

$ErrorActionPreference = "Stop"

$DefaultUrl = 'https://solutions300-my.sharepoint.com/:x:/r/personal/mathieu_duclos_solutions30_com/_layouts/15/doc2.aspx?sourcedoc=%7B7A33CE52-DF71-4E18-B6EA-DAC96761B2FC%7D&file=SAIP%20-%20Suivi%20ventes%20&%20AO_VF.xlsx=&fromShare=true&action=default&mobileredirect=true'

function Get-UrlPath {
  $dir = Join-Path $env:APPDATA "SuiviProjet"
  if (-not (Test-Path -LiteralPath $dir)) {
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
  }
  return (Join-Path $dir "sharepoint_source_url.txt")
}

function Get-SavedOrDefaultUrl {
  $path = Get-UrlPath
  if (Test-Path -LiteralPath $path) {
    $saved = (Get-Content -LiteralPath $path -Raw).Trim()
    if (-not [string]::IsNullOrWhiteSpace($saved)) {
      return $saved
    }
  }
  return $DefaultUrl
}

function Set-UrlValue {
  $target = $Url
  if ([string]::IsNullOrWhiteSpace($target)) {
    $target = Read-Host "Colle l'URL SharePoint a enregistrer"
  }
  if ([string]::IsNullOrWhiteSpace($target)) {
    throw "URL vide."
  }
  $path = Get-UrlPath
  Set-Content -LiteralPath $path -Value $target.Trim() -Encoding UTF8
  Write-Output "OK: URL SharePoint enregistree."
}

function Open-UrlNow {
  $target = Get-SavedOrDefaultUrl
  Start-Process $target
  Write-Output ("OK: ouverture navigateur vers : " + $target)
}

function Assert-TimeFormat {
  if ($Time -notmatch '^(?:[01]\d|2[0-3]):[0-5]\d$') {
    throw "Format heure invalide. Utilise HH:mm (ex: 08:30)."
  }
}

function Set-ReminderTask {
  Assert-TimeFormat
  $scriptPath = $MyInvocation.MyCommand.Path
  $taskCommand = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$scriptPath`" -Mode open-url"
  $taskNameEsc = $TaskName.Replace('"', '""')
  $taskCmdEsc = $taskCommand.Replace('"', '""')
  $createCmd = "schtasks /Create /SC DAILY /TN ""$taskNameEsc"" /TR ""$taskCmdEsc"" /ST $Time /F >nul 2>nul"
  cmd.exe /c $createCmd | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "Impossible de creer la tache planifiee."
  }
  Write-Output ("OK: rappel quotidien configure a " + $Time + " (tache: " + $TaskName + ").")
}

function Clear-ReminderTask {
  $taskNameEsc = $TaskName.Replace('"', '""')
  $deleteCmd = "schtasks /Delete /TN ""$taskNameEsc"" /F >nul 2>nul"
  cmd.exe /c $deleteCmd | Out-Null
  if ($LASTEXITCODE -ne 0) {
    Write-Output "Aucun rappel a supprimer (ou deja supprime)."
    return
  }
  Write-Output "OK: rappel supprime."
}

function Show-ReminderTask {
  $taskNameEsc = $TaskName.Replace('"', '""')
  $checkCmd = "schtasks /Query /TN ""$taskNameEsc"" /FO LIST /V >nul 2>nul"
  cmd.exe /c $checkCmd | Out-Null
  if ($LASTEXITCODE -ne 0) {
    Write-Output "Aucun rappel configure."
    return
  }
  $showCmd = "schtasks /Query /TN ""$taskNameEsc"" /FO LIST /V"
  cmd.exe /c $showCmd
}

switch ($Mode) {
  "set-url"       { Set-UrlValue }
  "get-url"       { Write-Output (Get-SavedOrDefaultUrl) }
  "open-url"      { Open-UrlNow }
  "set-reminder"  { Set-ReminderTask }
  "clear-reminder"{ Clear-ReminderTask }
  "show-reminder" { Show-ReminderTask }
}
