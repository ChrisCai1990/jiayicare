$ErrorActionPreference = 'Stop'
$sdk = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { 'D:\JiayicareBuild\android-sdk' }
$java = if ($env:JAVA_HOME) { $env:JAVA_HOME } else { 'D:\JiayicareBuild\tools\jdk-17.0.20.1+1' }
$tools = Join-Path $sdk 'build-tools\36.0.0'
$androidJar = Join-Path $sdk 'platforms\android-36\android.jar'
$env:JAVA_HOME = $java
New-Item -ItemType Directory -Force 'build\classes', 'build\dex' | Out-Null

& "$tools\aapt2.exe" compile --dir 'app\src\main\res' -o 'build\resources.zip'
if ($LASTEXITCODE) { exit $LASTEXITCODE }
$manifest = (Get-Content 'app\src\main\AndroidManifest.xml' -Raw -Encoding UTF8).Replace('<manifest xmlns:android="http://schemas.android.com/apk/res/android">', '<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="com.jiayicare.staff.pilot.debug">')
Set-Content 'build\AndroidManifest.xml' $manifest -Encoding UTF8
& "$tools\aapt2.exe" link -I $androidJar --manifest 'build\AndroidManifest.xml' -R 'build\resources.zip' -o 'build\unsigned.apk' --min-sdk-version 26 --target-sdk-version 35 --version-code 2 --version-name 0.1.1
if ($LASTEXITCODE) { exit $LASTEXITCODE }
& "$java\bin\javac.exe" -encoding UTF-8 -source 17 -target 17 -cp $androidJar -d 'build\classes' 'app\src\main\java\com\jiayicare\staff\pilot\BaseActivity.java' 'app\src\demo\java\com\jiayicare\staff\pilot\MainActivity.java'
if ($LASTEXITCODE) { exit $LASTEXITCODE }
$classes = @(Get-ChildItem 'build\classes\com\jiayicare\staff\pilot\*.class' | ForEach-Object { $_.FullName })
& "$tools\d8.bat" --min-api 26 --lib $androidJar --output 'build\dex' $classes
if ($LASTEXITCODE) { exit $LASTEXITCODE }
& "$java\bin\jar.exe" uf 'build\unsigned.apk' -C 'build\dex' 'classes.dex'
if ($LASTEXITCODE) { exit $LASTEXITCODE }
& "$tools\zipalign.exe" -f 4 'build\unsigned.apk' 'build\aligned.apk'
if ($LASTEXITCODE) { exit $LASTEXITCODE }
if (-not (Test-Path 'build\pilot-debug.keystore')) {
    & "$java\bin\keytool.exe" -genkeypair -keystore 'build\pilot-debug.keystore' -storepass android -keypass android -alias pilot -keyalg RSA -keysize 2048 -validity 3650 -dname 'CN=JiayiCare Staff Pilot, O=Internal Test, C=CN'
    if ($LASTEXITCODE) { exit $LASTEXITCODE }
}
& "$tools\apksigner.bat" sign --ks 'build\pilot-debug.keystore' --ks-key-alias pilot --ks-pass pass:android --key-pass pass:android --out 'build\jiayicare-staff-pilot-debug.apk' 'build\aligned.apk'
if ($LASTEXITCODE) { exit $LASTEXITCODE }
& "$tools\apksigner.bat" verify --verbose 'build\jiayicare-staff-pilot-debug.apk'
if ($LASTEXITCODE) { exit $LASTEXITCODE }
