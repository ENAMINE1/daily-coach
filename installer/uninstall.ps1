$dest = Join-Path $env:LOCALAPPDATA 'Programs\DailyCoach'
Get-Process -Name 'DailyCoach' -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Milliseconds 500
Remove-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' -Name 'DailyCoach' -ErrorAction SilentlyContinue
foreach ($dir in @([Environment]::GetFolderPath('Programs'), [Environment]::GetFolderPath('Desktop'))) {
  Remove-Item (Join-Path $dir 'Daily Coach.lnk') -ErrorAction SilentlyContinue
}
Remove-Item $dest -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item (Join-Path $env:USERPROFILE '.claude\skills\daily-coach') -Recurse -Force -ErrorAction SilentlyContinue
Write-Host "Daily Coach removed. Your progress data is kept in $env:APPDATA\Daily Coach (delete that folder to wipe it)."
