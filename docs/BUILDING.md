# Build and develop

## Toolchain

- Node.js 22.11+, npm and Git.
- JDK 17, with `JAVA_HOME` configured.
- Android SDK, with `ANDROID_HOME` configured: platform-tools, Platform 36,
  Build Tools 36.0.0, NDK 27.1.12297006 and CMake 3.22.1.

Install Android Studio or the command-line SDK tools, accept the SDK licenses,
then install packages:

```sh
sdkmanager "platform-tools" "platforms;android-36" "build-tools;36.0.0" \
  "ndk;27.1.12297006" "cmake;3.22.1"
npm ci
npm run lint
npm test -- --watchman=false
npm run test:android
```

Scripts run under bash on macOS/Linux or a configured WSL environment. SDK/JDK
downloads are not committed. `scripts/android-env.sh` respects your environment
and can discover optional local tools under `work/toolchain/`. Caches default
to ignored `work/`.

## Build

```sh
npm run build:android
```

Without signing variables this produces
`android/app/build/outputs/apk/release/app-release-unsigned.apk`; sign it before
installation. With all four signing variables it produces `app-release.apk`.
Use `npm run build:release` to verify and package a signed build; see
[RELEASING.md](RELEASING.md).

Both ARM32 and ARM64 are included. For a single architecture:

```sh
TV_ABIS=armeabi-v7a npm run build:android
TV_ABIS=x86_64 npm run build:android # Intel Android TV emulator
```

The minimum runtime is API 29. Compile SDK 36 does not require Android 16 on the TV.

## Development

Start an Android TV emulator or authorize a test TV, then:

```sh
source scripts/android-env.sh
npm start
# Another terminal:
source scripts/android-env.sh
npm run android
```

Development uses the shared debug key and cannot update a public signed APK.
Use a separate emulator, or restore a working Home before uninstalling an app.
Uninstalling clears its settings.

## Phone page without a TV

```sh
source scripts/android-env.sh
cd android
./gradlew :app:runCompanionPreview -PreactNativeArchitectures=armeabi-v7a
```

Open the URL in `work/phone-preview/connection.json` and enter its code. This
uses the real server with a fake TV store; changes stay in `work/phone-preview/`.
Stop with Ctrl-C. It does not test Android decoding, location or physical remotes.

## Contributions

Create a branch, separate behavior from styles, run the checks and open a pull
request. GitHub Actions runs lint, JS/JVM tests and an unsigned ARM build.
Include tested hardware details when UI behavior changes. Keep signing files,
credentials, personal photos, device addresses, logs and build outputs out of
commits. Hardware testing is still needed beyond the automated checks.
