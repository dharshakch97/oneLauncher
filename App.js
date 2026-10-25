import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AppState,
  BackHandler,
  DeviceEventEmitter,
  FlatList,
  Image,
  NativeModules,
  PermissionsAndroid,
  Platform,
  Pressable,
  StatusBar,
  Text,
  View,
} from 'react-native';
import styles from './src/styles/launcher';
import { normalizeApps } from './src/apps';
import {
  normalizeSettings,
  timeInZone,
  dateInZone,
  zoneLabel,
  fetchWeather,
} from './src/home';

const { Launcher } = NativeModules;

function RemoteButton({
  children,
  onPress,
  preferred = false,
  style,
  disabled = false,
  label,
}) {
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      hasTVPreferredFocus={preferred}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onPress={onPress}
      style={[
        styles.button,
        style,
        focused && styles.focused,
        disabled && styles.disabled,
      ]}
    >
      {children}
    </Pressable>
  );
}

function AppTile({ item, preferred, onPress, dock = false }) {
  return (
    <RemoteButton
      preferred={preferred}
      onPress={onPress}
      style={dock ? styles.dockTile : styles.tile}
      label={item.label}
    >
      {item.icon ? (
        <Image
          source={{ uri: item.icon }}
          style={dock ? styles.dockIcon : styles.icon}
        />
      ) : (
        <Text style={styles.initial}>{item.label.slice(0, 1)}</Text>
      )}
      <Text numberOfLines={1} style={styles.appLabel}>
        {item.label}
      </Text>
    </RemoteButton>
  );
}

export default function App() {
  const [apps, setApps] = useState([]);
  const [settings, setSettings] = useState(() => normalizeSettings({}));
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [page, setPage] = useState('home');
  const [time, setTime] = useState(new Date());
  const [active, setActive] = useState(AppState.currentState !== 'background');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [weather, setWeather] = useState(null);
  const [weatherError, setWeatherError] = useState(false);
  const [pairing, setPairing] = useState(null);
  const [pairingBusy, setPairingBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const lastLocationAttempt = useRef(0);

  const loadSettings = useCallback(async () => {
    const next = normalizeSettings(await Launcher.getSettings());
    setSettings(next);
    setSettingsLoaded(true);
    return next;
  }, []);
  const refresh = useCallback(async () => {
    try {
      if (!Launcher) {
        throw new Error('Rebuild the Android app to load oneLauncher.');
      }
      const [installed] = await Promise.all([
        Launcher.getApps(),
        loadSettings(),
      ]);
      setApps(normalizeApps(installed));
      setError('');
    } catch (e) {
      setError(e.message || 'Could not load your home screen. Try Refresh.');
    } finally {
      setLoading(false);
    }
  }, [loadSettings]);

  useEffect(() => {
    refresh();
    let timer;
    const tick = () => {
      setTime(new Date());
      timer = setTimeout(tick, 60000 - (Date.now() % 60000) + 25);
    };
    tick();
    const subscription = AppState.addEventListener('change', state => {
      const foreground = state === 'active';
      setActive(foreground);
      clearTimeout(timer);
      if (foreground) {
        tick();
        refresh();
      } else {
        Launcher?.stopCompanion();
        setPairing(null);
      }
    });
    const changes = DeviceEventEmitter.addListener('settingsChanged', () => {
      loadSettings().catch(() => setError('Could not reload your settings.'));
    });
    const stopped = DeviceEventEmitter.addListener('companionStopped', () =>
      setPairing(null),
    );
    const home = DeviceEventEmitter.addListener('homeRequested', () =>
      setPage('home'),
    );
    return () => {
      clearTimeout(timer);
      subscription.remove();
      changes.remove();
      stopped.remove();
      home.remove();
      Launcher?.stopCompanion();
    };
  }, [refresh, loadSettings]);
  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        setPage('home');
        return true;
      },
    );
    return () => subscription.remove();
  }, []);
  useEffect(() => {
    if (page !== 'customize') {
      Launcher?.stopCompanion();
      setPairing(null);
    }
  }, [page]);

  const latitude = settings.weather?.latitude;
  const longitude = settings.weather?.longitude;
  useEffect(() => {
    if (!active || latitude == null || longitude == null) {
      setWeather(null);
      return;
    }
    let alive = true;
    setWeather(null);
    setWeatherError(false);
    const update = () =>
      fetchWeather({ latitude, longitude })
        .then(result => {
          if (alive) {
            setWeather(result);
            setWeatherError(false);
          }
        })
        .catch(() => {
          if (alive) {
            setWeatherError(true);
          }
        });
    update();
    const timer = setInterval(update, 30 * 60 * 1000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [active, latitude, longitude]);

  const enableCurrentLocation = useCallback(
    async (requestPermission = true) => {
      if (Platform.OS !== 'android') {
        return;
      }
      lastLocationAttempt.current = Date.now();
      setLocating(true);
      try {
        const permission =
          PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION;
        let granted = await PermissionsAndroid.check(permission);
        if (!granted && requestPermission) {
          granted =
            (await PermissionsAndroid.request(permission)) ===
            PermissionsAndroid.RESULTS.GRANTED;
        }
        if (!granted) {
          if (requestPermission) {
            throw new Error(
              'Allow approximate location on the TV, or choose a city from your phone.',
            );
          }
          return;
        }
        const next = await Launcher.requestCurrentLocation();
        setSettings(normalizeSettings(next));
        setError('');
      } catch (e) {
        if (requestPermission) {
          setError(
            e.message ||
              'Location is unavailable. Choose a city from your phone.',
          );
        }
      } finally {
        setLocating(false);
      }
    },
    [],
  );
  useEffect(() => {
    if (
      active &&
      settingsLoaded &&
      settings.weather?.source !== 'city' &&
      Date.now() - lastLocationAttempt.current > 30 * 60 * 1000
    ) {
      enableCurrentLocation(false);
    }
  }, [active, settingsLoaded, settings.weather?.source, enableCurrentLocation]);

  async function run(action) {
    try {
      await action();
      setError('');
    } catch (e) {
      setError(e.message || 'That action could not be completed.');
    }
  }
  async function startPairing() {
    setPairingBusy(true);
    await run(async () => {
      setPairing(JSON.parse(await Launcher.startCompanion()));
      setTime(new Date());
    });
    setPairingBusy(false);
  }
  const primaryZone = settings.timeZones[0];

  return (
    <View style={styles.screen}>
      <StatusBar hidden />
      {settings.wallpaperUri && (
        <Image
          source={{ uri: settings.wallpaperUri }}
          resizeMode="cover"
          style={styles.background}
        />
      )}
      <View pointerEvents="none" style={[styles.background, styles.shade]} />
      <View style={styles.menuBar}>
        <View style={styles.wordmark}>
          <View style={styles.brandDot} />
          <Text style={styles.brand}>oneLauncher</Text>
          <Text style={styles.menuLabel}>
            {page === 'home'
              ? 'Desktop'
              : page === 'apps'
              ? 'Applications'
              : 'Personalize'}
          </Text>
        </View>
        <View style={styles.actions}>
          {page !== 'home' && (
            <RemoteButton onPress={() => setPage('home')}>
              <Text style={styles.actionText}>Home</Text>
            </RemoteButton>
          )}
          <RemoteButton onPress={() => setPage('apps')}>
            <Text style={styles.actionText}>Apps</Text>
          </RemoteButton>
          <RemoteButton onPress={() => setPage('customize')}>
            <Text style={styles.actionText}>Customize</Text>
          </RemoteButton>
          <RemoteButton onPress={() => run(() => Launcher.openSettings())}>
            <Text style={styles.actionText}>Settings</Text>
          </RemoteButton>
        </View>
      </View>
      {!!error && (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      )}

      {page === 'home' && (
        <View style={styles.desktop}>
          <View style={styles.heroRow}>
            <View style={styles.hero}>
              {!!settings.homeName && (
                <Text numberOfLines={1} style={styles.homeName}>
                  {settings.homeName}
                </Text>
              )}
              <Text style={styles.date}>{dateInZone(time, primaryZone)}</Text>
              <Text style={styles.clock}>
                {timeInZone(time, primaryZone, settings.hour24)}
              </Text>
              <Text style={styles.zone}>{zoneLabel(primaryZone)}</Text>
              <View style={styles.worldClocks}>
                {settings.timeZones.slice(1).map(zone => (
                  <View key={zone} style={styles.worldClock}>
                    <Text style={styles.worldLabel}>{zoneLabel(zone)}</Text>
                    <Text style={styles.worldTime}>
                      {timeInZone(time, zone, settings.hour24)}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
            <View style={styles.weatherCard}>
              <Text style={styles.widgetLabel}>WEATHER</Text>
              <Text numberOfLines={1} style={styles.weatherCity}>
                {settings.weather?.name || 'Weather nearby'}
              </Text>
              {weather ? (
                <>
                  <Text style={styles.temperature}>
                    {weather.temperature}°<Text style={styles.celsius}>C</Text>
                  </Text>
                  <Text style={styles.weatherDescription}>
                    {weather.description}
                  </Text>
                  <Text style={styles.weatherCredit}>
                    {weather.stale ? 'Last available update · ' : ''}Open-Meteo
                  </Text>
                </>
              ) : (
                <Text style={styles.weatherEmpty}>
                  {settings.weather
                    ? weatherError
                      ? 'Weather is temporarily unavailable.'
                      : 'Checking the skies…'
                    : 'Use your TV’s approximate location, or choose a city from your phone.'}
                </Text>
              )}
              {!settings.weather && (
                <RemoteButton
                  style={styles.locationButton}
                  disabled={locating}
                  onPress={() => enableCurrentLocation()}
                >
                  <Text style={styles.actionText}>
                    {locating ? 'Finding location…' : 'Use current location'}
                  </Text>
                </RemoteButton>
              )}
            </View>
          </View>
          <View style={styles.dockArea}>
            <View style={styles.dock}>
              {loading ? (
                <Text style={styles.empty}>Finding your TV apps…</Text>
              ) : (
                apps
                  .slice(0, 6)
                  .map((item, index) => (
                    <AppTile
                      key={item.packageName}
                      item={item}
                      dock
                      preferred={index === 0}
                      onPress={() =>
                        run(() => Launcher.openApp(item.packageName))
                      }
                    />
                  ))
              )}
              <View style={styles.dockDivider} />
              <RemoteButton
                style={styles.dockTile}
                onPress={() => setPage('apps')}
                label="All apps"
              >
                <Text style={styles.gridGlyph}>▦</Text>
                <Text style={styles.appLabel}>All apps</Text>
              </RemoteButton>
            </View>
            <Text style={styles.dockHint}>
              Your apps. A quieter place to begin.
            </Text>
          </View>
        </View>
      )}

      {page === 'apps' && (
        <View style={styles.appPage}>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Applications</Text>
            <RemoteButton onPress={refresh}>
              <Text style={styles.actionText}>Refresh apps</Text>
            </RemoteButton>
          </View>
          {apps.length === 0 ? (
            <Text style={styles.empty}>
              {loading
                ? 'Finding your TV apps…'
                : 'No TV apps found. Install an Android TV app, then refresh.'}
            </Text>
          ) : (
            <FlatList
              key="all-apps"
              data={apps}
              numColumns={6}
              keyExtractor={item => item.packageName}
              contentContainerStyle={styles.grid}
              renderItem={({ item, index }) => (
                <AppTile
                  item={item}
                  preferred={index === 0}
                  onPress={() => run(() => Launcher.openApp(item.packageName))}
                />
              )}
            />
          )}
        </View>
      )}

      {page === 'customize' && (
        <View style={styles.customize}>
          <Text style={styles.sectionTitle}>Make it yours.</Text>
          <Text style={styles.customizeIntro}>
            A photo, a familiar name, and the places you keep time with.
          </Text>
          <View style={styles.customizeRow}>
            <View style={styles.pairCard}>
              <Text style={styles.cardTitle}>Connect your phone</Text>
              {pairing ? (
                <>
                  <View style={styles.qrRow}>
                    <Image
                      source={{ uri: pairing.qrImage }}
                      style={styles.qrImage}
                      accessibilityLabel="Scan with your phone camera to customize oneLauncher"
                    />
                    <View style={styles.qrInstructions}>
                      <Text style={styles.cardText}>
                        Scan with your phone camera on the same Wi-Fi to change
                        wallpapers, clocks and your home name.
                      </Text>
                      <Text style={styles.smallPrint}>
                        Or open this address and enter the code:
                      </Text>
                      <Text selectable style={styles.address}>
                        {pairing.url}
                      </Text>
                      <Text style={styles.pairCode}>{pairing.code}</Text>
                    </View>
                  </View>
                  <Text style={styles.cardText}>
                    Closes in{' '}
                    {Math.max(
                      0,
                      Math.ceil((pairing.expiresAt - time.getTime()) / 60000),
                    )}{' '}
                    min, or when you leave this screen.
                  </Text>
                  <RemoteButton
                    onPress={() => {
                      Launcher.stopCompanion();
                      setPairing(null);
                    }}
                  >
                    <Text style={styles.actionText}>Disconnect phone</Text>
                  </RemoteButton>
                </>
              ) : (
                <>
                  <Text style={styles.cardText}>
                    Upload a wallpaper, change the home name, and choose up to
                    three time zones. No account needed.
                  </Text>
                  <RemoteButton
                    preferred
                    disabled={pairingBusy}
                    onPress={startPairing}
                  >
                    <Text style={styles.actionText}>
                      {pairingBusy
                        ? 'Opening connection…'
                        : 'Start phone connection'}
                    </Text>
                  </RemoteButton>
                  <Text style={styles.smallPrint}>
                    Use a trusted home Wi-Fi network. Pairing stays open for 10
                    minutes.
                  </Text>
                </>
              )}
            </View>
            <View style={styles.optionsCard}>
              <Text style={styles.cardTitle}>Weather & appearance</Text>
              <Text style={styles.cardText}>
                {settings.weather
                  ? `Weather: ${settings.weather.name}`
                  : 'Weather uses approximate TV location when available. You can also choose a city from your phone.'}
              </Text>
              <RemoteButton
                disabled={locating}
                onPress={() => enableCurrentLocation()}
              >
                <Text style={styles.actionText}>
                  {locating ? 'Finding location…' : 'Use current location'}
                </Text>
              </RemoteButton>
              <RemoteButton
                onPress={() =>
                  run(async () => {
                    setSettings(
                      normalizeSettings(await Launcher.resetWallpaper()),
                    );
                  })
                }
              >
                <Text style={styles.actionText}>Restore default wallpaper</Text>
              </RemoteButton>
              <Text style={styles.smallPrint}>
                Photos and settings stay on this TV. Weather requests send the
                selected coordinates to Open-Meteo.
              </Text>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}
