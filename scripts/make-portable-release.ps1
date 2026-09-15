param(
  [string]$NodeVersion = "",
  [ValidatePattern('^[A-Za-z0-9][A-Za-z0-9_.-]*$')]
  [string]$PackageName = "GPI_2.5_Portable"
)

$ErrorActionPreference = "Stop"

$Root = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
$ReleaseDir = Join-Path $Root "release"
$CacheDir = Join-Path $ReleaseDir ".cache"
$StageDir = Join-Path $ReleaseDir $PackageName
$AppDir = Join-Path $StageDir "app"
$RuntimeDir = Join-Path $StageDir "runtime"
$NodeDir = Join-Path $RuntimeDir "node"
$ZipPath = Join-Path $ReleaseDir ($PackageName + ".zip")

function Assert-InRoot($Path) {
  $full = [System.IO.Path]::GetFullPath($Path)
  $rootFull = [System.IO.Path]::GetFullPath($Root)
  if (-not $full.StartsWith($rootFull.TrimEnd([System.IO.Path]::DirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to touch path outside project root: $full"
  }
}

function Remove-Directory($Path) {
  Assert-InRoot $Path
  if (Test-Path -LiteralPath $Path) {
    Remove-Item -LiteralPath $Path -Recurse -Force
  }
}

function Remove-File($Path) {
  Assert-InRoot $Path
  if (Test-Path -LiteralPath $Path) {
    Remove-Item -LiteralPath $Path -Force
  }
}

Set-Location -LiteralPath $Root

if (-not $NodeVersion) {
  $NodeVersion = (& node --version).Trim().TrimStart("v")
}

$NodeTag = "v$NodeVersion"
$NodeZipName = "node-$NodeTag-win-x64.zip"
$NodeZipPath = Join-Path $CacheDir $NodeZipName
$NodeExtractDir = Join-Path $CacheDir "node-$NodeTag-win-x64"
$NodeUrl = "https://nodejs.org/dist/$NodeTag/$NodeZipName"
$ShasumsPath = Join-Path $CacheDir "node-$NodeTag-SHASUMS256.txt"
$ShasumsUrl = "https://nodejs.org/dist/$NodeTag/SHASUMS256.txt"

function Get-ExpectedNodeZipHash {
  if (-not (Test-Path -LiteralPath $ShasumsPath)) {
    Write-Host "Downloading Node.js checksums..."
    Invoke-WebRequest -Uri $ShasumsUrl -OutFile $ShasumsPath
  }

  $escapedName = [regex]::Escape($NodeZipName)
  $line = Get-Content -LiteralPath $ShasumsPath | Where-Object { $_ -match "^\s*([a-fA-F0-9]{64})\s+$escapedName\s*$" } | Select-Object -First 1
  if (-not $line) {
    throw "Could not find checksum for $NodeZipName in SHASUMS256.txt"
  }

  return ([regex]::Match($line, "^\s*([a-fA-F0-9]{64})").Groups[1].Value).ToLowerInvariant()
}

function Get-Sha256Hex($Path) {
  $stream = [System.IO.File]::OpenRead($Path)
  try {
    $sha256 = [System.Security.Cryptography.SHA256]::Create()
    try {
      $hash = $sha256.ComputeHash($stream)
      return ([System.BitConverter]::ToString($hash) -replace "-", "").ToLowerInvariant()
    } finally {
      $sha256.Dispose()
    }
  } finally {
    $stream.Dispose()
  }
}

function Test-NodeZipHash {
  $expected = Get-ExpectedNodeZipHash
  $actual = Get-Sha256Hex $NodeZipPath
  if ($actual -ne $expected) {
    Remove-File $NodeZipPath
    throw "Node.js ZIP checksum mismatch. Expected $expected but got $actual."
  }
  Write-Host "Node.js checksum verified."
}

Write-Host "Preparing GPI 2.5 portable release..." -ForegroundColor Cyan
Write-Host "Node runtime: $NodeTag"

New-Item -ItemType Directory -Force -Path $ReleaseDir, $CacheDir | Out-Null

Write-Host "Installing npm dependencies..."
if (Test-Path -LiteralPath (Join-Path $Root "package-lock.json")) {
  npm ci
  if ($LASTEXITCODE -ne 0) { throw "npm ci failed" }
} else {
  npm install
  if ($LASTEXITCODE -ne 0) { throw "npm install failed" }
}

Write-Host "Building web app..."
npm run build
if ($LASTEXITCODE -ne 0) { throw "Build failed" }

if (-not (Test-Path -LiteralPath $NodeZipPath)) {
  Write-Host "Downloading portable Node.js..."
  Invoke-WebRequest -Uri $NodeUrl -OutFile $NodeZipPath
}

Test-NodeZipHash

if (-not (Test-Path -LiteralPath (Join-Path $NodeExtractDir "node.exe"))) {
  Write-Host "Extracting portable Node.js..."
  Remove-Directory $NodeExtractDir
  Expand-Archive -LiteralPath $NodeZipPath -DestinationPath $CacheDir -Force
}

Write-Host "Creating release folder..."
Remove-Directory $StageDir
Remove-File $ZipPath

New-Item -ItemType Directory -Force -Path $AppDir, $RuntimeDir, $NodeDir | Out-Null

Copy-Item -Path (Join-Path $NodeExtractDir "*") -Destination $NodeDir -Recurse -Force

Copy-Item -LiteralPath (Join-Path $Root "server") -Destination $AppDir -Recurse -Force
Copy-Item -LiteralPath (Join-Path $Root "dist") -Destination $AppDir -Recurse -Force
Copy-Item -LiteralPath (Join-Path $Root "package.json") -Destination $AppDir -Force
Copy-Item -LiteralPath (Join-Path $Root "package-lock.json") -Destination $AppDir -Force
Copy-Item -LiteralPath (Join-Path $Root "README.md") -Destination $AppDir -Force

Push-Location -LiteralPath $AppDir
try {
  npm ci --omit=dev
  if ($LASTEXITCODE -ne 0) { throw "Production dependency install failed" }
} finally {
  Pop-Location
}

$RunBatName = "GPI " + [char]0xC2E4 + [char]0xD589 + ".bat"
$GuideName = "GPI " + [char]0xCC98 + [char]0xC74C + " " + [char]0xC77D + [char]0xC5B4 + [char]0xC8FC + [char]0xC138 + [char]0xC694 + ".txt"
$GuideBase64 = "R1BJIDIuNSDsi6Ttlokg67Cp67KVCgoxLiAiR1BJIOyLpO2WiS5iYXQi7J2EIOuNlOu4lO2BtOumre2VmOyEuOyalC4KMi4g7IOB64uoIENoYXRHUFQgLyBHZW1pbmkgLyBMTSBTdHVkaW8g7KSRIO2VmOuCmOulvCDshKDtg53tlZjshLjsmpQuCjMuIOydtOuvuOyngOulvCDrhKPqs6Ag7IOd7ISx7J2EIOuIhOultOyEuOyalC4KCuyyreuhneyDiTog7ZiE7J6sIOyCrOyaqSDspJEgLyDstIjroZ3sg4k6IOyXsOqysOuQqCAvIO2ajOyDiTog66+47Jew6rKwIC8g7KO87Zmp7IOJOiDsl7DqsrAg7ZWE7JqUIOuYkOuKlCDsp4Ttlokg7KSRCgpDaGF0R1BUOiDruIzrnbzsmrDsoIDsl5DshJwg6rOE7KCVIOuhnOq3uOyduCDtm4Qg7JWx7Jy866GcIOuPjOyVhOyYpOuptCDsnpDrj5kg7Jew6rKw65Cp64uI64ukLgpHZW1pbmk6IOyymOydjCDtlZwg67KI66eMIEFQSSDtgqTrpbwg7J6F66Cl7ZWY6rOgICLsoIDsnqXtlZjqs6Ag7IKs7JqpIuydhCDriITrpbTshLjsmpQuCkxNIFN0dWRpbzog66+466asIExNIFN0dWRpbyAwLjQg7J207IOB6rO8IEdlbW1hIDQgRTRCIEhlcmV0aWMgUTVfS19NIOuYkOuKlCBROF8wLArruYTsoIQg67O07KGwIO2MjOydvChtbXByb2op7J2EIOyEpOy5mO2VmOyEuOyalC4g7IOB64uoIOuyhO2KvOycvOuhnCDshJzrsoTrpbwg7J6Q64+ZIOyXsOqysO2VmOqzoArsg53shLHtlaAg65WMIOuqqOuNuOydhCDsnpDrj5nsnLzroZwg67aI65+s7Ji164uI64ukLiDsnbTrr7jsp4Ag67aE7ISd7J2AIOydtCDquLDquLDsl5DshJwg7Iuk7ZaJ7ZWp64uI64ukLgoK7KCc6rO17J6Q7JmAIOuqqOuNuCDshKDtg53snYAg64uk7J2M7JeQ64+EIOq4sOyWte2VqeuLiOuLpC4K66eI7KeA66eJIEdQSSDruIzrnbzsmrDsoIAg7YOt7J2EIOuLq+ycvOuptCAxMOy0iCDrkqQg7J6Q64+ZIOyiheujjOuQqeuLiOuLpC4g7IOI66Gc6rOg7Lmo7ZWY6rGw64KYIOuLpOuluCBHUEkg7YOt7J20IOuCqOyVhCDsnojsnLzrqbQg6rOE7IaNIOyLpO2WieuQqeuLiOuLpC4gR1BJ6rCAIOu2iOufrOyYqCDroZzsu6wg66qo64246rO8IOyLnOyeke2VnCDrs7TsobAg7ISc67KE64+EIOygleumrO2VqeuLiOuLpC4g6riw7KG0IExNIFN0dWRpbyDshJzrsoTsmYAg66qo64247J2AIOycoOyngO2VqeuLiOuLpC4K67iM65287Jqw7KCA6rCAIOyXtOumrOyngCDslYrsnLzrqbQgaHR0cDovLzEyNy4wLjAuMTo4Nzg3IOydhCDsl6zshLjsmpQuCg=="

@'
@echo off
setlocal
cd /d "%~dp0"
set "PATH=%~dp0runtime\node;%PATH%"

echo.
echo ================================
echo GPI 2.5
echo ================================
echo.
echo Browser will open automatically.
echo Closing the last GPI browser tab will stop GPI after 10 seconds.
echo You can also close this window to stop GPI.
echo.

if not exist "%~dp0runtime\node\node.exe" (
  echo Missing runtime\node\node.exe
  echo Please download GPI_2.5_Portable.zip again.
  pause
  exit /b 1
)

if not exist "%~dp0app\dist\index.html" (
  echo Missing app\dist\index.html
  echo Please download GPI_2.5_Portable.zip again.
  pause
  exit /b 1
)

"%~dp0runtime\node\node.exe" "%~dp0app\server\index.js" --production --open
if errorlevel 1 (
  echo.
  echo GPI stopped with an error.
  echo Check the message above.
  echo.
  pause
  exit /b 1
)

echo.
echo GPI stopped.
echo.
exit /b 0
'@ | Set-Content -LiteralPath (Join-Path $StageDir $RunBatName) -Encoding Default

$GuideText = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($GuideBase64))
$Utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText((Join-Path $StageDir $GuideName), $GuideText, $Utf8NoBom)

Write-Host "Creating ZIP..."
Compress-Archive -LiteralPath $StageDir -DestinationPath $ZipPath -Force

Write-Host ""
Write-Host "Portable release ready:" -ForegroundColor Green
Write-Host $ZipPath
