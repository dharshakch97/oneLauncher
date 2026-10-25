#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/android-env.sh"
launcher_tv="${TV_ADDRESS:?Set TV_ADDRESS to your authorized device serial or IP:port}"
launcher_stock="${STOCK_HOME_PACKAGE:?Set the verified stock launcher package for your TV}"
launcher_activity="${STOCK_HOME_ACTIVITY:?Set its verified Home activity component}"
adb -s "$launcher_tv" get-state >/dev/null
adb -s "$launcher_tv" shell pm enable --user 0 "$launcher_stock"
adb -s "$launcher_tv" shell cmd package set-home-activity "$launcher_activity"
adb -s "$launcher_tv" shell input keyevent KEYCODE_HOME
printf '%s\n' 'Original Home restored. oneLauncher remains installed as an app.'
