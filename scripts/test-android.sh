#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/android-env.sh"
cd "$PROJECT_ROOT/android"
exec ./gradlew testReleaseUnitTest "-PreactNativeArchitectures=${TV_ABIS:-armeabi-v7a}" --max-workers=2 --no-daemon -Dorg.gradle.vfs.watch=false "$@"
