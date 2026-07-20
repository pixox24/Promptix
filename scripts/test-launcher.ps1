$ErrorActionPreference = 'Stop'

$launcherPath = (Get-ChildItem (Join-Path $PSScriptRoot '..') -Filter '*.bat' -File | Select-Object -First 1).FullName
$launcher = Get-Content -Raw -Encoding UTF8 $launcherPath

$requirements = [ordered]@{
  'restart mode' = '%~1' -and ($launcher -match '(?i)restart')
  'dependency verification' = $launcher -match 'npm(?:\.cmd)? ls --depth=0'
  'Vite native binding verification' = $launcher -match "import 'rolldown'"
  'Docker readiness wait' = $launcher -match '(?i)docker compose ps'
  'API health wait' = $launcher -match '8787/health'
  'Web health wait' = $launcher -match '4173/'
  'both worker command forms' =
    ($launcher -match 'dev:worker') -and ($launcher -match '@promptix/worker')
  'restart kills workspace process trees' = $launcher -match '@promptix/\(api\|web\|worker\)'
}

$failed = @($requirements.GetEnumerator() | Where-Object { -not $_.Value })
if ($failed.Count -gt 0) {
  $failed.Name | ForEach-Object { Write-Error "Missing launcher behavior: $_" -ErrorAction Continue }
  exit 1
}

Write-Host "Launcher contract passed ($($requirements.Count) checks)."
