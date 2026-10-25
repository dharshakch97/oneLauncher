# Install, update and recover

Requires Android TV / Google TV 10 (API 29) or later on ARM32 or ARM64.
Firmware determines whether a replacement Home can be selected. Installing
oneLauncher does not disable system packages.

## Install without a computer

1. Download the APK from this repository's GitHub Releases page.
2. Transfer it to the TV using a file-transfer app or USB drive.
3. Open it with a file manager. Allow installation from that source when Android
   asks, install, then revoke the permission if no longer needed.
4. Open oneLauncher from Apps. Check the remote, app grid and Settings shortcut.
5. If offered, select it under **Default apps → Home app**, or press Home and
   choose **Always**. Names differ between TVs.

## Install using Android platform tools

Enable Developer options and the debugging option offered by your TV. Use the
TV's displayed address and port; same Wi-Fi alone is not enough. Some Android 10
TVs require USB setup before network debugging works. Accept the authorization
prompt on the TV.

```sh
# Replace the placeholders and APK filename with your actual values.
adb connect TV_IP:DEBUG_PORT
adb devices
adb -s TV_IP:DEBUG_PORT install -r oneLauncher-0.3.0-beta.1.apk
adb -s TV_IP:DEBUG_PORT shell am start -n com.onelauncher/.MainActivity
```

Use the actual device serial for USB connections. If the firmware supports it,
select Home explicitly after testing:

```sh
adb -s TV_IP:DEBUG_PORT shell cmd package set-home-activity com.onelauncher/.MainActivity
```

Press the physical Home button to verify. Some firmware overrides this setting.
Do not disable system packages without verifying your model's stock Home
component and a tested recovery route.

## Update

Install a newer release over the existing app. The same signing key and a higher
Android version code preserve settings. Verify the download using its checksum:

```sh
sha256sum -c oneLauncher-0.3.0-beta.1.apk.sha256
# macOS:
shasum -a 256 -c oneLauncher-0.3.0-beta.1.apk.sha256
```

For signature mismatches, stop and check the source. Early private/debug builds
use a different key. Restore a working stock Home, uninstall the old test app,
then install the public release. Uninstalling clears settings and wallpaper.
Never uninstall your only working launcher while stock Home is disabled.

## Recovery

Prefer changing default Home back in Android Settings. If you disabled a stock
launcher, re-enable the exact verified package and select its Home component
before removing oneLauncher:

```sh
TV_ADDRESS=TV_IP:DEBUG_PORT \
STOCK_HOME_PACKAGE=YOUR_VERIFIED_STOCK_PACKAGE \
STOCK_HOME_ACTIVITY=YOUR_VERIFIED_PACKAGE/YOUR_HOME_ACTIVITY \
bash scripts/restore-home.sh
```

The script requires those values. On the originally tested OnePlus C00 firmware,
the package was `com.google.android.tvlauncher` and the component was
`com.google.android.tvlauncher/.MainActivity`. Do not assume these values apply
to your TV. Keep authorized debugging access available during Home experiments;
turn debugging off when finished.

## Troubleshooting

| Problem | Check |
| --- | --- |
| QR link cannot open | Same Wi-Fi, connection still open, no guest/client isolation or blocking VPN |
| Code expired | Reopen Customize and start a fresh connection |
| Photo unsupported | Try a JPEG, PNG or WebP your phone browser can decode |
| No weather | Enable TV Location and permission, or choose a city on the phone |
| Stock Home still appears | Check Home selection; firmware may prevent overriding it |
| APK cannot install | Android version, ARM architecture, checksum and signing-key compatibility |
