# update.ps1 — Wash one-command deploy script
# Usage: .\update.ps1 "my commit message"
#        .\update.ps1 -Support          (also builds support-app APK)
#        .\update.ps1 "msg" -Support    (commit + support APK)
param(
    [string]$CommitMessage = "",
    [switch]$Support
)

# ── helpers ───────────────────────────────────────────────────────────────────
function Write-Step ($n, $total, $msg) {
    Write-Host "`n▶ Step $n/$total — $msg" -ForegroundColor Cyan
}
function Write-OK   ($msg) { Write-Host "  ✓ $msg" -ForegroundColor Green }
function Write-Warn ($msg) { Write-Host "  ⚠ $msg" -ForegroundColor Yellow }
function Write-Fail ($msg) {
    Write-Host "`n✗ ERROR: $msg`n" -ForegroundColor Red
    exit 1
}

# Always run from the script's directory, regardless of where it was invoked
Set-Location $PSScriptRoot

$totalSteps = if ($Support) { 5 } else { 4 }

# ── Step 1: Sanity checks ─────────────────────────────────────────────────────
Write-Step 1 $totalSteps "Sanity checks"

if (-not (Test-Path "package.json") -or -not (Test-Path "capacitor.config.json")) {
    Write-Fail "Missing package.json or capacitor.config.json — are you in the right project?"
}

$gitVersion = git --version 2>&1
if ($LASTEXITCODE -ne 0) { Write-Fail "git not found on PATH." }

if (-not (Test-Path ".git")) {
    Write-Fail "Not a git repository (no .git folder found)."
}

if (-not (Test-Path "node_modules")) {
    Write-Warn "node_modules not found — running npm install first..."
    npm install
    if ($LASTEXITCODE -ne 0) { Write-Fail "npm install failed." }
}

$branch = git rev-parse --abbrev-ref HEAD 2>&1
if ($branch -ne "main") {
    Write-Warn "Current branch is '$branch', not 'main'."
    $ok = Read-Host "  Continue anyway? [y/N]"
    if ($ok -notmatch '^[Yy]$') { Write-Fail "Aborted by user." }
}

Write-OK "All checks passed  (branch: $branch, git: $gitVersion)"

# ── Step 2: Web / Vercel deploy ───────────────────────────────────────────────
Write-Step 2 $totalSteps "Pushing to GitHub → Vercel"

if ($CommitMessage -eq "") {
    $CommitMessage = "update: $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
}

# Show a compact diff before touching anything
$statusLines = git status --short 2>&1 | Where-Object { $_ -ne "" }
$fileCount = if ($statusLines) { @($statusLines).Count } else { 0 }

if ($fileCount -gt 0) {
    Write-Host "  Changed files ($fileCount):" -ForegroundColor Cyan
    $statusLines | ForEach-Object { Write-Host "    $_" }
} else {
    Write-Host "  No uncommitted changes detected." -ForegroundColor Gray
}

git add .

# Check whether there is anything staged to commit
git diff --cached --quiet 2>&1 | Out-Null
$hasStagedChanges = ($LASTEXITCODE -ne 0)

$committed = $false
if ($hasStagedChanges) {
    git commit -m "$CommitMessage"
    if ($LASTEXITCODE -ne 0) { Write-Fail "git commit failed." }
    $committed = $true
} else {
    Write-Warn "Nothing new to commit — skipping commit step."
}

$commitHash = git rev-parse --short HEAD 2>&1

git push
if ($LASTEXITCODE -ne 0) { Write-Fail "git push failed." }

Write-OK "Pushed to GitHub  (HEAD: $commitHash)"

# ── Step 3: Android APK ───────────────────────────────────────────────────────
Write-Step 3 $totalSteps "Android APK"

$buildApk = Read-Host "  Rebuild Android APK? [y/N]"
$apkBuilt  = $false
$apkSizeMB = 0

if ($buildApk -match '^[Yy]$') {

    Write-Host "`n  ▸ npm run build" -ForegroundColor Cyan
    npm run build
    if ($LASTEXITCODE -ne 0) { Write-Fail "npm run build failed — fix errors before retrying." }

    Write-Host "`n  ▸ npx cap sync android" -ForegroundColor Cyan
    npx cap sync android
    if ($LASTEXITCODE -ne 0) { Write-Fail "npx cap sync android failed." }

    Write-Host "`n  ▸ gradlew assembleDebug" -ForegroundColor Cyan
    Push-Location "$PSScriptRoot\android"
    try {
        .\gradlew assembleDebug
    } finally {
        Pop-Location
    }
    if ($LASTEXITCODE -ne 0) { Write-Fail "Gradle assembleDebug failed — check the output above." }

    $apkSrc  = "$PSScriptRoot\android\app\build\outputs\apk\debug\app-debug.apk"
    $apkDest = "$PSScriptRoot\wash-latest.apk"
    if (-not (Test-Path $apkSrc)) {
        Write-Fail "APK not found at expected path ($apkSrc) after build."
    }

    Copy-Item $apkSrc $apkDest -Force
    $apkSizeMB  = [math]::Round((Get-Item $apkDest).Length / 1MB, 1)
    $apkFullPath = $apkDest
    $apkBuilt = $true

    Write-OK "APK ready: $apkFullPath  ($apkSizeMB MB)"
    Write-Host "  → Send wash-latest.apk to your phone via WhatsApp/Drive and tap to install." -ForegroundColor Yellow

} else {
    Write-Warn "APK rebuild skipped (web-only update)."
}

# ── Step 4: Support-app APK (optional) ────────────────────────────────────────
$supportApkBuilt = $false
$supportApkSizeMB = 0

if ($Support) {
    Write-Step 4 $totalSteps "Support-app APK"

    Write-Host "`n  ▸ Building support-app" -ForegroundColor Cyan
    Push-Location "$PSScriptRoot\support-app"
    try {
        npm run android:sync
        if ($LASTEXITCODE -ne 0) { Write-Fail "support-app android:sync failed." }

        Push-Location android
        try {
            .\gradlew assembleDebug
        } finally {
            Pop-Location
        }
        if ($LASTEXITCODE -ne 0) { Write-Fail "support-app Gradle build failed." }
    } finally {
        Pop-Location
    }

    $supportApkSrc  = "$PSScriptRoot\support-app\android\app\build\outputs\apk\debug\app-debug.apk"
    $supportApkDest = "$PSScriptRoot\wash-support-latest.apk"
    if (-not (Test-Path $supportApkSrc)) {
        Write-Fail "Support APK not found at $supportApkSrc"
    }

    Copy-Item $supportApkSrc $supportApkDest -Force
    $supportApkSizeMB = [math]::Round((Get-Item $supportApkDest).Length / 1MB, 1)
    $supportApkBuilt = $true
    Write-OK "Support APK ready: $supportApkDest  ($supportApkSizeMB MB)"
}

# ── Summary ───────────────────────────────────────────────────────────────────
Write-Step $totalSteps $totalSteps "Done"
Write-Host ""

if ($committed) {
    Write-Host "  ✓ Pushed $fileCount file(s) to GitHub  (commit: $commitHash)" -ForegroundColor Green
} else {
    Write-Host "  ✓ Pushed to GitHub — no new commit  (HEAD: $commitHash)" -ForegroundColor Green
}

Write-Host "  ✓ Vercel deploys triggered (main app + support app) — check dashboards in ~60s" -ForegroundColor Green

if ($apkBuilt) {
    Write-Host "  ✓ APK rebuilt: wash-latest.apk  ($apkSizeMB MB)" -ForegroundColor Green
    Write-Host "     → Send this file to your phone to install the update" -ForegroundColor Yellow
} else {
    Write-Host "  - APK not rebuilt (web-only update)" -ForegroundColor Gray
}

if ($supportApkBuilt) {
    Write-Host "  ✓ Support APK rebuilt: wash-support-latest.apk  ($supportApkSizeMB MB)" -ForegroundColor Green
    Write-Host "     → Send this file to agent phones" -ForegroundColor Yellow
}

Write-Host ""
