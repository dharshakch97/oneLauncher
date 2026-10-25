import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { DeviceEventEmitter, NativeModules } from 'react-native';

const openApp = jest.fn().mockResolvedValue(null);
const stopCompanion = jest.fn();
const getSettings = jest.fn();
NativeModules.Launcher = {
  getApps: jest
    .fn()
    .mockResolvedValue([{ packageName: 'tv.video', label: 'Video' }]),
  getSettings,
  startCompanion: jest
    .fn()
    .mockResolvedValue(
      JSON.stringify({
        url: 'http://192.168.1.20:8766',
        code: '123456',
        expiresAt: Date.now() + 600000,
      }),
    ),
  stopCompanion,
  openApp,
  openSettings: jest.fn().mockResolvedValue(null),
};
const App = require('../App').default;
function button(tree, text) {
  return tree.root
    .findAll(node => node.type?.name === 'RemoteButton')
    .find(
      item => item.findAll(node => node.props.children === text).length > 0,
    );
}
function hasText(tree, text) {
  return tree.root.findAll(node => node.props.children === text).length > 0;
}
beforeEach(() => {
  getSettings.mockResolvedValue(
    JSON.stringify({
      homeName: 'Family room',
      timeZones: ['UTC', 'Asia/Kolkata', 'America/New_York'],
      hour24: true,
    }),
  );
  stopCompanion.mockClear();
});
test('shows the saved home name and extra clocks and opens the selected app', async () => {
  let tree;
  await act(async () => {
    tree = renderer.create(<App />);
  });
  try {
    expect(hasText(tree, 'Family room')).toBe(true);
    expect(hasText(tree, 'Kolkata')).toBe(true);
    expect(hasText(tree, 'New York')).toBe(true);
    const tile = button(tree, 'Video');
    expect(tile).toBeDefined();
    await act(async () => {
      await tile.props.onPress();
    });
    expect(openApp).toHaveBeenCalledWith('tv.video');
  } finally {
    await act(async () => {
      tree.unmount();
    });
  }
});
test('pairs only when requested and closes the phone connection when Home is requested', async () => {
  let tree;
  await act(async () => {
    tree = renderer.create(<App />);
  });
  try {
    expect(NativeModules.Launcher.startCompanion).not.toHaveBeenCalled();
    await act(async () => {
      button(tree, 'Customize').props.onPress();
    });
    await act(async () => {
      await button(tree, 'Start phone connection').props.onPress();
    });
    expect(hasText(tree, '123456')).toBe(true);
    const previousStops = stopCompanion.mock.calls.length;
    await act(async () => {
      DeviceEventEmitter.emit('homeRequested');
    });
    expect(stopCompanion.mock.calls.length).toBeGreaterThan(previousStops);
    expect(hasText(tree, 'Family room')).toBe(true);
  } finally {
    await act(async () => {
      tree.unmount();
    });
  }
});
test('reloads persisted changes sent from the phone without restarting', async () => {
  let tree;
  await act(async () => {
    tree = renderer.create(<App />);
  });
  try {
    getSettings.mockResolvedValue(
      JSON.stringify({
        homeName: 'Our home',
        timeZones: ['UTC'],
        hour24: false,
      }),
    );
    await act(async () => {
      DeviceEventEmitter.emit('settingsChanged');
    });
    expect(hasText(tree, 'Our home')).toBe(true);
  } finally {
    await act(async () => {
      tree.unmount();
    });
  }
});
