$bundled = "C:\Users\Falcon\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
$script = Join-Path $PSScriptRoot "generate-guide-clips.py"

if (Test-Path $bundled) {
  & $bundled $script
  exit $LASTEXITCODE
}

python $script
exit $LASTEXITCODE
