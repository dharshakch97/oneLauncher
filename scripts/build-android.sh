#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/android-env.sh"
cd "$PROJECT_ROOT/android"
# Include both common TV processor families. Override TV_ABIS for emulators.
exec ./gradlew assembleRelease "-PreactNativeArchitectures=${TV_ABIS:-armeabi-v7a,arm64-v8a}" --max-workers=2 --no-daemon -Dorg.gradle.vfs.watch=false "$@"
