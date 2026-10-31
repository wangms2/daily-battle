# Builds the self-play env for each gen: tools/net/pe_env_gen{3..6}.pyd.
# Needs the MSVC Rust toolchain (rustup toolchain install stable-x86_64-pc-windows-msvc)
# and tools/net/.venv. Usage: pwsh tools/net/env/build.ps1 [-Gens 3,4,5,6] [-Out dir]
# -Out stages the .pyd files elsewhere (training locks the live ones); point
# PE_ENV_DIR at that folder to use them.
param([string]$Gens = '3,4,5,6', [string]$Out = "$PSScriptRoot\..")
$ErrorActionPreference = 'Stop'
$env:PATH = "$env:USERPROFILE\.cargo\bin;$env:PATH"
$env:PYO3_PYTHON = (Resolve-Path "$PSScriptRoot\..\.venv\Scripts\python.exe").Path
New-Item -ItemType Directory -Force $Out | Out-Null
$Out = (Resolve-Path $Out).Path
Push-Location $PSScriptRoot
try {
  foreach ($g in ($Gens -split '[,\s]+' | Where-Object { $_ })) {
    cargo +stable-x86_64-pc-windows-msvc build --release --features "gen$g" --target-dir "target\gen$g"
    if ($LASTEXITCODE) { throw "gen$g build failed" }
    Copy-Item "target\gen$g\release\pe_env.dll" "$Out\pe_env_gen$g.pyd" -Force
    Write-Host "built $Out\pe_env_gen$g.pyd"
  }
} finally {
  Pop-Location
}
