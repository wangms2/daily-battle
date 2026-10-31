# Builds the self-play env for each gen: tools/net/pe_env_gen{3..6}.pyd.
# Needs the MSVC Rust toolchain (rustup toolchain install stable-x86_64-pc-windows-msvc)
# and tools/net/.venv. Usage: pwsh tools/net/env/build.ps1 [-Gens 3,4,5,6]
param([string]$Gens = '3,4,5,6')
$ErrorActionPreference = 'Stop'
$env:PATH = "$env:USERPROFILE\.cargo\bin;$env:PATH"
$env:PYO3_PYTHON = (Resolve-Path "$PSScriptRoot\..\.venv\Scripts\python.exe").Path
Push-Location $PSScriptRoot
try {
  foreach ($g in ($Gens -split '[,\s]+' | Where-Object { $_ })) {
    cargo +stable-x86_64-pc-windows-msvc build --release --features "gen$g" --target-dir "target\gen$g"
    if ($LASTEXITCODE) { throw "gen$g build failed" }
    Copy-Item "target\gen$g\release\pe_env.dll" "..\pe_env_gen$g.pyd" -Force
    Write-Host "built pe_env_gen$g.pyd"
  }
} finally {
  Pop-Location
}
