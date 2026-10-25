import {
  normalizeSettings,
  timeInZone,
  dateInZone,
  fetchWeather,
} from '../src/home';

test('normalizes time zones, removes duplicates and falls back from invalid zones', () => {
  expect(
    normalizeSettings({ timeZones: ['UTC', 'UTC', 'Bad/Zone', 'Asia/Kolkata'] })
      .timeZones,
  ).toEqual(['UTC', 'Asia/Kolkata']);
  expect(normalizeSettings({ timeZones: ['Bad/Zone'] }).timeZones).toHaveLength(
    1,
  );
  expect(normalizeSettings({ homeName: '' }).homeName).toBe('');
});
test('clocks observe timezone date boundaries and daylight saving', () => {
  const summer = new Date('2026-07-01T20:00:00Z');
  expect(timeInZone(summer, 'Asia/Kolkata', true)).toBe('01:30');
  expect(dateInZone(summer, 'Asia/Kolkata')).toContain('Thursday');
  expect(timeInZone(summer, 'America/New_York', true)).toBe('16:00');
  expect(
    timeInZone(new Date('2026-01-01T20:00:00Z'), 'America/New_York', true),
  ).toBe('15:00');
});
test('weather caches requests and labels cached readings as stale on network failure', async () => {
  const original = global.fetch;
  global.fetch = jest
    .fn()
    .mockResolvedValue({
      ok: true,
      json: async () => ({
        current: { temperature_2m: 27.6, weather_code: 0, is_day: 1 },
      }),
    });
  const location = { latitude: 12.3456, longitude: 78.9012 };
  try {
    expect((await fetchWeather(location, 1000)).temperature).toBe(28);
    await fetchWeather(location, 2000);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    global.fetch.mockRejectedValue(new Error('offline'));
    expect((await fetchWeather(location, 2000000)).stale).toBe(true);
  } finally {
    global.fetch = original;
  }
});
