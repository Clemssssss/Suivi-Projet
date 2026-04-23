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

function Protect-CurrentUserString([string]$Value) {
  Add-Type -AssemblyName System.Security | Out-Null
  $raw = [Text.Encoding]::UTF8.GetBytes($Value)
  try {
    $protected = [System.Security.Cryptography.ProtectedData]::Protect(
      $raw,
      $null,
      [System.Security.Cryptography.DataProtectionScope]::CurrentUser
    )
    return [Convert]::ToBase64String($protected)
  } finally {
    if ($raw) { [Array]::Clear($raw, 0, $raw.Length) }
  }
}

function Unprotect-CurrentUserString([string]$Base64) {
  Add-Type -AssemblyName System.Security | Out-Null
  $protectedBytes = [Convert]::FromBase64String($Base64)
  try {
    $raw = [System.Security.Cryptography.ProtectedData]::Unprotect(
      $protectedBytes,
      $null,
      [System.Security.Cryptography.DataProtectionScope]::CurrentUser
    )
    try {
      return [Text.Encoding]::UTF8.GetString($raw)
    } finally {
      if ($raw) { [Array]::Clear($raw, 0, $raw.Length) }
    }
  } finally {
    if ($protectedBytes) { [Array]::Clear($protectedBytes, 0, $protectedBytes.Length) }
  }
}

function Try-ReadLegacySecret([string]$Path) {
  try {
    $cipher = (Get-Content -LiteralPath $Path -Raw).Trim()
    if ([string]::IsNullOrWhiteSpace($cipher)) { return $null }
    $secure = ConvertTo-SecureString -String $cipher
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try {
      return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
    } finally {
      [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
    }
  } catch {
    return $null
  }
}

function Set-Secret {
  $value = Read-Host "Colle l'URL PostgreSQL/Neon a stocker localement (chiffree)"
  if ([string]::IsNullOrWhiteSpace($value)) {
    throw "URL vide."
  }
  $path = Get-SecretPath
  $cipher = Protect-CurrentUserString $value.Trim()
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

  try {
    Write-Output (Unprotect-CurrentUserString $cipher)
  } catch {
    $legacy = Try-ReadLegacySecret $path
    if (-not [string]::IsNullOrWhiteSpace($legacy)) {
      try {
        $cipher = Protect-CurrentUserString $legacy
        Set-Content -LiteralPath $path -Value $cipher -Encoding Ascii
      } catch {
        # no-op: on garde la valeur legacy accessible pour cette session
      }
      Write-Output $legacy
      return
    }
    throw
  }
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
