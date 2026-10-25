/* eslint-env browser */
(() => {
  const $ = id => document.getElementById(id);
  let token = '',
    settings = {},
    wallpaper = null,
    previewUrl = null,
    photoVersion = 0,
    busy = false;
  function message(text, error = false) {
    $('status').textContent = text;
    $('status').classList.toggle('error', error);
  }
  async function request(path, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);
    try {
      const response = await fetch(path, {
        ...options,
        signal: controller.signal,
        headers: {
          ...(token ? { Authorization: 'Bearer ' + token } : {}),
          ...options.headers,
        },
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(
          result.error || 'The TV could not complete that request.',
        );
      return result;
    } catch (error) {
      if (error.name === 'AbortError' || error instanceof TypeError)
        throw new Error(
          'Connection lost or expired. Reopen Customize on the TV and reconnect.',
        );
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
  const json = value => ({
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(value),
  });
  async function action(task) {
    if (busy) return;
    busy = true;
    document.querySelectorAll('button').forEach(button => {
      button.disabled = true;
    });
    message('Working…');
    try {
      await task();
    } catch (error) {
      message(error.message, true);
    } finally {
      busy = false;
      document.querySelectorAll('button').forEach(button => {
        button.disabled = false;
      });
      $('upload').disabled = !wallpaper;
    }
  }
  function updateWeatherLabel() {
    $('weatherLocation').textContent = settings.weather
      ? 'Weather location: ' + settings.weather.name
      : 'Use current location on your TV, or choose a city here.';
  }
  function populate(data) {
    settings = data.settings;
    $('homeName').value = settings.homeName;
    $('hour24').checked = settings.hour24;
    ['primaryZone', 'secondZone', 'thirdZone'].forEach((id, index) => {
      $(id).replaceChildren();
      if (index) {
        const option = document.createElement('option');
        option.value = '';
        option.textContent = 'No additional clock';
        $(id).append(option);
      }
      data.timeZones
        .filter(zone => {
          try {
            new Intl.DateTimeFormat('en', { timeZone: zone }).format();
            return true;
          } catch {
            return false;
          }
        })
        .forEach(zone => {
          const option = document.createElement('option');
          option.value = zone;
          option.textContent = zone.replace(/_/g, ' ');
          $(id).append(option);
        });
      $(id).value = settings.timeZones[index] || '';
    });
    updateWeatherLabel();
  }
  $('pairForm').addEventListener('submit', event => {
    event.preventDefault();
    action(async () => {
      token = (
        await request('/api/pair', json({ code: $('code').value.trim() }))
      ).token;
      populate(await request('/api/settings'));
      $('pairPanel').hidden = true;
      $('controls').hidden = false;
      message('Connected to your TV.');
    });
  });
  // The fragment stays in the browser and is removed before pairing.
  const scanCode = new URLSearchParams(location.hash.slice(1)).get('code');
  if (location.hash)
    history.replaceState(null, '', location.pathname + location.search);
  if (/^\d{6}$/.test(scanCode || '')) {
    $('code').value = scanCode;
    $('pairForm').dispatchEvent(new Event('submit', { cancelable: true }));
  }
  $('photo').addEventListener('change', async () => {
    const version = ++photoVersion;
    const file = $('photo').files[0];
    wallpaper = null;
    $('upload').disabled = true;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    $('preview').classList.remove('visible');
    if (!file) return;
    if (file.size > 30 * 1024 * 1024) {
      message('Choose a photo smaller than 30 MB.', true);
      return;
    }
    previewUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      if (version !== photoVersion) return;
      const scale = Math.min(
        1,
        2560 / image.naturalWidth,
        1440 / image.naturalHeight,
      );
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      canvas
        .getContext('2d')
        .drawImage(image, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        blob => {
          if (!blob || blob.size > 8 * 1024 * 1024) {
            message('This photo is too large. Choose a smaller image.', true);
            return;
          }
          if (version !== photoVersion) return;
          wallpaper = blob;
          $('upload').disabled = busy;
          $('preview').src = previewUrl;
          $('preview').classList.add('visible');
          message('Photo ready. Select Apply wallpaper.');
        },
        'image/jpeg',
        0.9,
      );
    };
    image.onerror = () =>
      message(
        'This photo could not be opened. Try a JPEG, PNG or WebP image.',
        true,
      );
    image.src = previewUrl;
  });
  $('upload').addEventListener('click', () =>
    action(async () => {
      await request('/api/wallpaper', {
        method: 'POST',
        headers: { 'Content-Type': 'image/jpeg' },
        body: wallpaper,
      });
      message('Wallpaper applied. Look at your TV.');
    }),
  );
  $('reset').addEventListener('click', () =>
    action(async () => {
      await request('/api/wallpaper/reset', json({}));
      message('Default wallpaper restored.');
    }),
  );
  $('search').addEventListener('click', () =>
    action(async () => {
      const result = await request(
        '/api/cities?q=' + encodeURIComponent($('city').value.trim()),
      );
      $('results').replaceChildren();
      for (const city of result.results || []) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'result';
        const label = [city.name, city.admin1, city.country]
          .filter(Boolean)
          .join(', ');
        button.textContent = label;
        button.addEventListener('click', () => {
          settings.weather = {
            name: city.name,
            latitude: city.latitude,
            longitude: city.longitude,
            source: 'city',
          };
          updateWeatherLabel();
          $('results').replaceChildren();
          message('City selected. Save home settings to apply.');
        });
        $('results').append(button);
      }
      message(
        result.results?.length
          ? 'Choose the matching city.'
          : 'No matching cities found. Try adding a country.',
      );
    }),
  );
  $('clearCity').addEventListener('click', () => {
    settings.weather = null;
    updateWeatherLabel();
    message('City cleared. Save, then use current location on the TV.');
  });
  $('settingsForm').addEventListener('submit', event => {
    event.preventDefault();
    action(async () => {
      const timeZones = [
        ...new Set(
          ['primaryZone', 'secondZone', 'thirdZone']
            .map(id => $(id).value)
            .filter(Boolean),
        ),
      ];
      settings = await request(
        '/api/settings',
        json({
          homeName: $('homeName').value,
          timeZones,
          hour24: $('hour24').checked,
          weather: settings.weather,
        }),
      );
      message('Saved. Your TV updates automatically.');
    });
  });
})();
