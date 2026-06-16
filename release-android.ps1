# release-android.ps1 - Build a SIGNED release Android App Bundle (.aab) for Google Play.
#
# This is separate from update.ps1 (which builds debug APKs for sideloading).
# It does NOT touch git or Vercel - it only produces wash-release.aab to upload
# to the Play Console.
#
# Prereq: android/key.properties must exist (copy from key.properties.example and
# generate the keystore). See that file for the keytool command.
#
# Usage: .\release-android.ps1                (versionCode 1)
#        .\release-android.ps1 -VersionCode 5  (bump for each new Play upload)
param([int]$VersionCode = 1)

Set-Location $PSScriptRoot

function Write-Step ($msg) { Write-Host "`n> $msg" -ForegroundColor Cyan }
function Write-OK   ($msg) { Write-Host "  OK $msg" -ForegroundColor Green }
function Write-Fail ($msg) { Write-Host "`nERROR: $msg`n" -ForegroundColor Red; exit 1 }

# -- Ensure Gradle runs on JDK 21 (required by Capacitor 8 Android plugins) --
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
    Write-OK "Using JDK 21 for Gradle: $jdk21"
} else {
    Write-Fail "No JDK 21 found. Capacitor 8 Android builds require JDK 21 (install Temurin 21 or Android Studio, or set JAVA_HOME)."
}

# -- Preflight: signing config present? --
$keyProps = "$PSScriptRoot\android\key.properties"
if (-not (Test-Path $keyProps)) {
    Write-Host "`nERROR: android/key.properties not found." -ForegroundColor Red
    Write-Host "  Google Play needs a SIGNED build. Set it up once:" -ForegroundColor Yellow
    Write-Host "    1. Copy android/key.properties.example  ->  android/key.properties" -ForegroundColor Yellow
    Write-Host "    2. From the android/ folder, generate the keystore:" -ForegroundColor Yellow
    Write-Host "       keytool -genkeypair -v -keystore app/mulu-upload.jks -keyalg RSA -keysize 2048 -validity 10000 -alias mulu-upload" -ForegroundColor Yellow
    Write-Host "    3. Put the passwords you chose into android/key.properties" -ForegroundColor Yellow
    Write-Host "    4. Back up the .jks file AND the passwords somewhere safe (forever)." -ForegroundColor Yellow
    exit 1
}

# -- Build web bundle --
Write-Step "npm run build (web)"
npm run build
if ($LASTEXITCODE -ne 0) { Write-Fail "npm run build failed - fix errors before retrying." }

# -- Sync into the native project --
Write-Step "npx cap sync android"
npx cap sync android
if ($LASTEXITCODE -ne 0) { Write-Fail "npx cap sync android failed." }

# -- Gradle: signed release App Bundle --
Write-Step "gradlew clean bundleRelease"
Push-Location "$PSScriptRoot\android"
try {
    .\gradlew clean bundleRelease "-Pvcode=$VersionCode" "-Pvname=1.0.$VersionCode"
} finally {
    Pop-Location
}
if ($LASTEXITCODE -ne 0) { Write-Fail "Gradle bundleRelease failed." }

$aabSrc  = "$PSScriptRoot\android\app\build\outputs\bundle\release\app-release.aab"
$aabDest = "$PSScriptRoot\wash-release.aab"
if (-not (Test-Path $aabSrc)) { Write-Fail "AAB not found at $aabSrc after build." }

Copy-Item $aabSrc $aabDest -Force
$aabSizeMB = [math]::Round((Get-Item $aabDest).Length / 1MB, 1)

Write-Step "Done"
Write-OK "Signed release bundle ready: wash-release.aab  ($($aabSizeMB) MB)"
Write-Host ""
Write-Host "  -> Upload wash-release.aab to Google Play Console (Production / Closed testing track)." -ForegroundColor Yellow
Write-Host "  -> First upload: enroll in Play App Signing when prompted." -ForegroundColor Yellow
Write-Host "  -> Remember to bump versionCode in android/app/build.gradle before each new upload." -ForegroundColor Yellow
Write-Host ""
