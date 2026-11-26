$ErrorActionPreference = 'Stop'
$src  = Split-Path -Parent $MyInvocation.MyCommand.Path
$dest = Join-Path $env:LOCALAPPDATA 'Programs\DailyCoach'
$app  = Join-Path $dest 'resources\app'
$exe  = Join-Path $dest 'DailyCoach.exe'
if (-not (Test-Path $exe)) { Write-Host "Daily Coach isn't installed at $dest. Run the original Install.cmd first." -ForegroundColor Red; exit 1 }
Write-Host "Updating Daily Coach (your progress is kept)..."
Get-Process -Name 'DailyCoach' -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Milliseconds 800
Copy-Item (Join-Path $src 'app\*') $app -Recurse -Force
Get-ChildItem $app -Recurse -File | Unblock-File
$skill = Join-Path $env:USERPROFILE '.claude\skills\daily-coach'
New-Item -ItemType Directory -Force -Path $skill | Out-Null
Copy-Item (Join-Path $src 'claude-skill\SKILL.md') $skill -Force
Write-Host "Claude Code skill saved to $skill"
Start-Process $exe
Write-Host "Done! Daily Coach restarted with daily subtasks and the contribution graph." -ForegroundColor Green
