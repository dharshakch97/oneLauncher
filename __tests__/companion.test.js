const fs = require('fs');
const path = require('path');
const vm = require('vm');

const page = fs.readFileSync(
  path.join(__dirname, '../android/app/src/main/assets/companion.js'),
  'utf8',
);
const pairing = page.slice(
  page.indexOf("$('pairForm').addEventListener('submit'"),
  page.indexOf("$('photo').addEventListener"),
);

async function scan(hash) {
  const nodes = {};
  const requests = [];
  let task;
  const history = { replaceState: jest.fn() };
  const context = {
    $: id =>
      (nodes[id] ||= {
        value: '',
        addEventListener: (_event, handler) => {
          nodes[id].handler = handler;
        },
        dispatchEvent: event => nodes[id].handler(event),
      }),
    location: { hash, pathname: '/', search: '' },
    history,
    URLSearchParams,
    Event: class {
      preventDefault() {}
    },
    token: '',
    action: fn => {
      task = fn();
    },
    json: value => value,
    request: async (url, body) => {
      requests.push({ url, body });
      return url === '/api/pair' ? { token: 'paired' } : { settings: {} };
    },
    populate: jest.fn(),
    message: jest.fn(),
  };
  vm.runInNewContext(pairing, context);
  await task;
  return { nodes, requests, history };
}

test('QR link removes code from browser history and opens customization after pairing', async () => {
  const { nodes, requests, history } = await scan('#code=123456');
  expect(history.replaceState).toHaveBeenCalledWith(null, '', '/');
  expect(requests).toEqual([
    { url: '/api/pair', body: { code: '123456' } },
    { url: '/api/settings', body: undefined },
  ]);
  expect(nodes.pairPanel.hidden).toBe(true);
  expect(nodes.controls.hidden).toBe(false);
});

test('missing or malformed QR codes leave manual pairing available', async () => {
  for (const hash of ['', '#code=bad', '#code=1234567']) {
    expect((await scan(hash)).requests).toEqual([]);
  }
});
