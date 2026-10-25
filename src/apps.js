export function normalizeApps(apps) {
  const seen = new Set();
  return apps
    .filter(app => {
      if (!app.packageName || seen.has(app.packageName)) {
        return false;
      }
      seen.add(app.packageName);
      return true;
    })
    .map(app => ({ ...app, label: app.label || app.packageName }))
    .sort((a, b) => a.label.localeCompare(b.label));
}
