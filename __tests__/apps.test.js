import { normalizeApps } from '../src/apps';

test('keeps one tile per package and sorts labels without mutating input', () => {
  const apps = [
    { packageName: 'tv.video', label: 'Video' },
    { packageName: 'tv.audio', label: 'Audio' },
    { packageName: 'tv.video', label: 'Duplicate activity' },
    { label: 'Invalid' },
    { packageName: 'tv.other' },
  ];
  expect(normalizeApps(apps).map(app => app.label)).toEqual([
    'Audio',
    'tv.other',
    'Video',
  ]);
  expect(apps).toHaveLength(5);
});
