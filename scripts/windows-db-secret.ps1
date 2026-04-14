param(
  [ValidateSet("set", "get", "clear")]
  [string]$Mode = "get"
)

$ErrorActionPreference = "Stop"

function Get-SecretPath {
  $dir = Join-Path $env:APPDATA "SuiviProjet"
  if (-not (Test-Path -LiteralPath $dir)) {
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
  }
  return (Join-Path $dir "neon_db_url.dpapi")
}

function Set-Secret {
  $value = Read-Host "Colle l'URL PostgreSQL/Neon a stocker localement (chiffree)"
  if ([string]::IsNullOrWhiteSpace($value)) {
    throw "URL vide."
  }
  $secure = ConvertTo-SecureString -String $value.Trim() -AsPlainText -Force
  $cipher = $secure | ConvertFrom-SecureString
  $path = Get-SecretPath
  Set-Content -LiteralPath $path -Value $cipher -Encoding Ascii
  Write-Output "OK: secret enregistre dans le coffre Windows local (DPAPI)."
}

function Get-Secret {
  $path = Get-SecretPath
  if (-not (Test-Path -LiteralPath $path)) {
    return
  }
  $cipher = (Get-Content -LiteralPath $path -Raw).Trim()
  if ([string]::IsNullOrWhiteSpace($cipher)) {
    return
  }
  $secure = ConvertTo-SecureString -String $cipher
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try {
    $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  }
  Write-Output $plain
}

function Clear-Secret {
  $path = Get-SecretPath
  if (Test-Path -LiteralPath $path) {
    Remove-Item -LiteralPath $path -Force
    Write-Output "OK: secret supprime."
  } else {
    Write-Output "Aucun secret a supprimer."
  }
}

switch ($Mode) {
  "set"   { Set-Secret }
  "get"   { Get-Secret }
  "clear" { Clear-Secret }
}
