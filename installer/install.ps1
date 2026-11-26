$ErrorActionPreference = 'Stop'
$src  = Split-Path -Parent $MyInvocation.MyCommand.Path
$dest = Join-Path $env:LOCALAPPDATA 'Programs\DailyCoach'
$work = Join-Path $env:TEMP 'dailycoach-build'
Write-Host "== Daily Coach installer =="

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  Write-Host "npm was not found. Install Node.js LTS from https://nodejs.org, then run Install.cmd again." -ForegroundColor Red
  exit 1
}

Write-Host "1/4 Downloading the Electron runtime (about 110 MB, one time)..."
if (Test-Path $work) { Remove-Item $work -Recurse -Force }
New-Item -ItemType Directory -Force -Path $work | Out-Null
Push-Location $work
'{"name":"dailycoach-build","version":"1.0.0","private":true}' | Set-Content -Encoding ASCII package.json
& npm install electron@45.5.0 --no-audit --no-fund --loglevel=error
if ($LASTEXITCODE -ne 0) { Pop-Location; Write-Host "npm install failed. Check your internet connection and try again." -ForegroundColor Red; exit 1 }
Pop-Location
$dist = Join-Path $work 'node_modules\electron\dist'
if (-not (Test-Path (Join-Path $dist 'electron.exe'))) { Write-Host "Electron download incomplete. Run Install.cmd again." -ForegroundColor Red; exit 1 }

Write-Host "2/4 Installing to $dest ..."
Get-Process -Name 'DailyCoach' -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Milliseconds 500
if (Test-Path $dest) { Remove-Item $dest -Recurse -Force }
New-Item -ItemType Directory -Force -Path $dest | Out-Null
Copy-Item (Join-Path $dist '*') $dest -Recurse -Force
Rename-Item (Join-Path $dest 'electron.exe') 'DailyCoach.exe'
Remove-Item (Join-Path $dest 'resources\default_app.asar') -ErrorAction SilentlyContinue
$appDir = Join-Path $dest 'resources\app'
New-Item -ItemType Directory -Force -Path $appDir | Out-Null
Copy-Item (Join-Path $src 'app\*') $appDir -Recurse -Force
Copy-Item (Join-Path $src 'icon.ico') $dest -Force
Get-ChildItem $dest -Recurse -File | Unblock-File
Remove-Item $work -Recurse -Force -ErrorAction SilentlyContinue

Write-Host "3/4 Creating shortcuts and the Claude Code skill..."
$exe = Join-Path $dest 'DailyCoach.exe'
$sh = New-Object -ComObject WScript.Shell
foreach ($dir in @([Environment]::GetFolderPath('Programs'), [Environment]::GetFolderPath('Desktop'))) {
  $lnk = $sh.CreateShortcut((Join-Path $dir 'Daily Coach.lnk'))
  $lnk.TargetPath = $exe; $lnk.WorkingDirectory = $dest; $lnk.IconLocation = (Join-Path $dest 'icon.ico')
  $lnk.Description = 'Daily Coach - roadmap accountability'
  $lnk.Save()
}
$skill = Join-Path $env:USERPROFILE '.claude\skills\daily-coach'
New-Item -ItemType Directory -Force -Path $skill | Out-Null
Copy-Item (Join-Path $src 'claude-skill\SKILL.md') $skill -Force

Write-Host "4/4 Starting Daily Coach..."
Start-Process $exe
Write-Host ""
Write-Host "Done! Daily Coach is running in the system tray and will start when you log in." -ForegroundColor Green
