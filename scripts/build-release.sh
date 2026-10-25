#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/android-env.sh"
for launcher_variable in ONELAUNCHER_KEYSTORE_FILE ONELAUNCHER_STORE_PASSWORD ONELAUNCHER_KEY_ALIAS ONELAUNCHER_KEY_PASSWORD; do
  if [ -z "${!launcher_variable:-}" ]; then
    echo "Missing $launcher_variable. See docs/RELEASING.md." >&2
    exit 1
  fi
done
test -f "$ONELAUNCHER_KEYSTORE_FILE"
bash "$PROJECT_ROOT/scripts/build-android.sh"
launcher_apk="$PROJECT_ROOT/android/app/build/outputs/apk/release/app-release.apk"
"$ANDROID_HOME/build-tools/36.0.0/apksigner" verify --verbose "$launcher_apk"
cd "$PROJECT_ROOT"
node scripts/package-release.js
