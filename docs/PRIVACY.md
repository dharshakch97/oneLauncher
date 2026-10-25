# Privacy

oneLauncher has no account system, advertising or analytics integration.

- The home name, time zones, selected weather coordinates and wallpaper stay in
  the TV app's private storage. Android app backup is disabled.
- The phone connects directly to a temporary HTTP server on the TV. No wallpaper
  or settings relay is operated by oneLauncher. Use a trusted network because
  local HTTP is unencrypted.
- The QR includes a temporary pairing code in a URL fragment. The browser removes
  it from the current history entry and exchanges it for a session token. Treat
  the QR and code as temporary credentials.
- Pairing closes after ten minutes, when leaving Customize, on disconnect, or
  when the launcher goes into the background. New connections use fresh
  credentials. Wrong-code retries are limited; requests check host and origin.
- Approximate device location needs your permission. Weather requests send the
  chosen coordinates to Open-Meteo; city searches send the query to its geocoding
  service. Those services also receive normal request information such as your
  public IP; their terms and policies apply.
- TV app labels and icons are read locally to populate the launcher.

Use **Restore default wallpaper** to remove a saved photo. Clear app storage or
uninstall to erase settings; restore a working stock Home first if necessary.
