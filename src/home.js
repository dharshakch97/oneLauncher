export function localTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

export function normalizeSettings(value) {
  const settings = typeof value === 'string' ? JSON.parse(value) : value || {};
  const zones = [...new Set(settings.timeZones || [])]
    .filter(zone => {
      try {
        new Intl.DateTimeFormat('en', { timeZone: zone }).format();
        return true;
      } catch {
        return false;
      }
    })
    .slice(0, 3);
  return {
    homeName:
      typeof settings.homeName === 'string'
        ? settings.homeName
        : 'Welcome home',
    timeZones: zones.length ? zones : [localTimeZone()],
    hour24: !!settings.hour24,
    wallpaperUri: settings.wallpaperUri || null,
    customWallpaper: !!settings.customWallpaper,
    weather: settings.weather || null,
  };
}

export function timeInZone(date, timeZone, hour24 = false) {
  return new Intl.DateTimeFormat(undefined, {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: !hour24,
  }).format(date);
}

export function dateInZone(date, timeZone) {
  return new Intl.DateTimeFormat(undefined, {
    timeZone,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(date);
}

export function zoneLabel(zone) {
  return zone.split('/').slice(-1)[0].replace(/_/g, ' ');
}

export function weatherDescription(code, day = true) {
  if (code === 0) {
    return day ? 'Clear skies' : 'Clear night';
  }
  if (code <= 3) {
    return 'Cloudy';
  }
  if (code <= 48) {
    return 'Fog';
  }
  if (code <= 57) {
    return 'Drizzle';
  }
  if (code <= 67) {
    return 'Rain';
  }
  if (code <= 77) {
    return 'Snow';
  }
  if (code <= 82) {
    return 'Rain showers';
  }
  if (code <= 86) {
    return 'Snow showers';
  }
  return 'Thunderstorms';
}

const cache = new Map();
export async function fetchWeather(location, now = Date.now()) {
  const key = `${location.latitude},${location.longitude}`;
  const cached = cache.get(key);
  if (cached && now - cached.updatedAt < 30 * 60 * 1000) {
    return cached;
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(
        location.latitude,
      )}&longitude=${encodeURIComponent(
        location.longitude,
      )}&current=temperature_2m,weather_code,is_day`,
      { signal: controller.signal },
    );
    if (!response.ok) {
      throw new Error('Weather is unavailable');
    }
    const { current } = await response.json();
    if (
      !Number.isFinite(current?.temperature_2m) ||
      !Number.isFinite(current?.weather_code)
    ) {
      throw new Error('Weather is unavailable');
    }
    const result = {
      temperature: Math.round(current.temperature_2m),
      description: weatherDescription(current.weather_code, !!current.is_day),
      updatedAt: now,
      stale: false,
    };
    cache.set(key, result);
    return result;
  } catch (error) {
    if (cached) {
      return { ...cached, stale: true };
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
