# update.ps1 - MULU one-command deploy script
# Usage: .\update.ps1 "my commit message"
param(
    [string]$CommitMessage = ""
)

# -- helpers --
function Write-Step ($n, $total, $msg) {
    Write-Host "`n> Step $n/$total - $msg" -ForegroundColor Cyan
}
function Write-OK   ($msg) { Write-Host "  OK $msg" -ForegroundColor Green }
function Write-Warn ($msg) { Write-Host "  !! $msg" -ForegroundColor Yellow }
function Write-Fail ($msg) {
    Write-Host "`nERROR: $msg`n" -ForegroundColor Red
    exit 1
}

# Always run from the script's directory, regardless of where it was invoked
Set-Location $PSScriptRoot

# -- Ensure Gradle runs on JDK 21 (required by Capacitor 8 Android plugins) --
# Prefers an existing JDK 21 in JAVA_HOME, else Android Studio's bundled JBR,
# else a Temurin 21 install. Sets JAVA_HOME for this process so both the main
# and support Gradle builds below use it.
function Resolve-Jdk21Home {
    $patterns = @()
    if ($env:JAVA_HOME) { $patterns += $env:JAVA_HOME }
    $patterns += "C:\Program Files\Android\Android Studio\jbr"
    $patterns += "C:\Program Files\Eclipse Adoptium\jdk-21*"
    $patterns += "C:\Program Files\Java\jdk-21*"
    foreach ($pat in $patterns) {
        foreach ($dir in (Get-Item $pat -ErrorAction SilentlyContinue)) {
            $javaExe = Join-Path $dir.FullName "bin\java.exe"
            if (Test-Path $javaExe) {
                $out = (& $javaExe -version 2>&1 | Out-String)
                if ($out -match 'version "21') { return $dir.FullName }
            }
        }
    }
    return $null
}
$jdk21 = Resolve-Jdk21Home
if ($jdk21) {
    $env:JAVA_HOME = $jdk21
    Write-Host "  OK Using JDK 21 for Gradle: $jdk21" -ForegroundColor Green
} else {
    Write-Host "  !! No JDK 21 found - Capacitor 8 Android builds require JDK 21 (install Temurin 21 or Android Studio)." -ForegroundColor Yellow
}

$totalSteps = 6

# -- Step 1: Sanity checks --
Write-Step 1 $totalSteps "Sanity checks"

if (-not (Test-Path "package.json") -or -not (Test-Path "capacitor.config.json")) {
    Write-Fail "Missing package.json or capacitor.config.json - are you in the right project?"
}

$gitVersion = git --version 2>&1
if ($LASTEXITCODE -ne 0) { Write-Fail "git not found on PATH." }

if (-not (Test-Path ".git")) {
    Write-Fail "Not a git repository (no .git folder found)."
}

if (-not (Test-Path "node_modules")) {
    Write-Warn "node_modules not found - running npm install first..."
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

# -- Step 2: Drift report --
# Non-fatal pre-flight: surfaces how far the live DB has drifted from the
# bundled defaults BEFORE the push, so an unexpected drift can still be
# Ctrl+C'd. Failures (missing .env, no DB connectivity) only warn — they
# never block the deploy, because content drift is informational, not gating.
Write-Step 2 $totalSteps "Drift report (informational, non-blocking)"

npm run drift
if ($LASTEXITCODE -ne 0) {
    Write-Warn "drift report exited with code $LASTEXITCODE - continuing with deploy"
} else {
    Write-OK "Drift report complete"
}

# -- Step 3: Web / Vercel deploy --
Write-Step 3 $totalSteps "Pushing to GitHub -> Vercel"

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
    Write-Warn "Nothing new to commit - skipping commit step."
}

$commitHash = git rev-parse --short HEAD 2>&1

git push
if ($LASTEXITCODE -ne 0) { Write-Fail "git push failed." }

Write-OK "Pushed to GitHub  (HEAD: $commitHash)"

# -- Step 4: Main app Android APK --
Write-Step 4 $totalSteps "Main app APK (Mulu.apk)"

Write-Host "`n  > npm run build" -ForegroundColor Cyan
npm run build
if ($LASTEXITCODE -ne 0) { Write-Fail "npm run build failed - fix errors before retrying." }

Write-Host "`n  > npx cap sync android" -ForegroundColor Cyan
npx cap sync android
if ($LASTEXITCODE -ne 0) { Write-Fail "npx cap sync android failed." }

Write-Host "`n  > gradlew clean assembleDebug" -ForegroundColor Cyan
Push-Location "$PSScriptRoot\android"
try {
    .\gradlew clean assembleDebug
} finally {
    Pop-Location
}
if ($LASTEXITCODE -ne 0) { Write-Fail "Main app Gradle assembleDebug failed." }

$apkSrc  = "$PSScriptRoot\android\app\build\outputs\apk\debug\Mulu.apk"
$apkDest = "$PSScriptRoot\Mulu.apk"
if (-not (Test-Path $apkSrc)) {
    Write-Fail "APK not found at expected path ($apkSrc) after build."
}

Copy-Item $apkSrc $apkDest -Force
$apkSizeMB = [math]::Round((Get-Item $apkDest).Length / 1MB, 1)

Write-OK "Main APK ready: Mulu.apk  ($($apkSizeMB) MB)"

# -- Step 5: Support app Android APK --
Write-Step 5 $totalSteps "Support app APK (MuluSupport.apk)"

Push-Location "$PSScriptRoot\support-app"
try {
    Write-Host "`n  > npm run build (support-app)" -ForegroundColor Cyan
    npm run build
    if ($LASTEXITCODE -ne 0) { Write-Fail "support-app build failed." }

    Write-Host "`n  > npx cap sync android (support-app)" -ForegroundColor Cyan
    npx cap sync android
    if ($LASTEXITCODE -ne 0) { Write-Fail "support-app cap sync failed." }

    Write-Host "`n  > gradlew clean assembleDebug (support-app)" -ForegroundColor Cyan
    Push-Location android
    try {
        .\gradlew clean assembleDebug
    } finally {
        Pop-Location
    }
    if ($LASTEXITCODE -ne 0) { Write-Fail "support-app Gradle build failed." }
} finally {
    Pop-Location
}

$supportApkSrc  = "$PSScriptRoot\support-app\android\app\build\outputs\apk\debug\MuluSupport.apk"
$supportApkDest = "$PSScriptRoot\MuluSupport.apk"
if (-not (Test-Path $supportApkSrc)) {
    Write-Fail "Support APK not found at $supportApkSrc"
}

Copy-Item $supportApkSrc $supportApkDest -Force
$supportApkSizeMB = [math]::Round((Get-Item $supportApkDest).Length / 1MB, 1)

Write-OK "Support APK ready: MuluSupport.apk  ($($supportApkSizeMB) MB)"

# -- Step 6: Summary --
Write-Step 6 $totalSteps "Done"
Write-Host ""

if ($committed) {
    Write-Host "  OK Pushed $fileCount file(s) to GitHub  (commit: $commitHash)" -ForegroundColor Green
} else {
    Write-Host "  OK Pushed to GitHub - no new commit  (HEAD: $commitHash)" -ForegroundColor Green
}

Write-Host "  OK Vercel deploys triggered via git push (main app + admin app + support app)" -ForegroundColor Green
Write-Host "  OK Main APK: Mulu.apk  ($($apkSizeMB) MB)" -ForegroundColor Green
Write-Host "  OK Support APK: MuluSupport.apk  ($($supportApkSizeMB) MB)" -ForegroundColor Green
Write-Host ""
Write-Host "  -> Send both APKs to phones to install the update" -ForegroundColor Yellow
Write-Host ""
