// In-memory stand-in for a Workers KV namespace (get/put only), with switches to simulate failures.
export class FakeKV {
  constructor(initial = {}) {
    this.map = new Map(Object.entries(initial));
    this.failPut = false;
    this.failGet = false;
    this.puts = [];
  }
  async get(key) {
    if (this.failGet) throw new Error('kv get failed');
    return this.map.has(key) ? this.map.get(key) : null;
  }
  async put(key, value) {
    if (this.failPut) throw new Error('kv put failed');
    this.puts.push(key);
    this.map.set(key, String(value));
  }
}

export const SCRIPT = { format: 'breakaleg-script', formatVersion: 1, title: 'Stand-in', lineageID: 'abc', history: [] };

/** A KV holding one show. Defaults: live, no end date. */
export function seededKV({ code = '7Q4MXN98', id = 'a1b2c3d4e5f60718', show = {}, script = SCRIPT } = {}) {
  const record = {
    id, name: 'The Lighthouse Cat', partner: 'KidStage', code, version: 3,
    createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-02T00:00:00.000Z', endsAt: null, revoked: false, ...show,
  };
  return new FakeKV({
    [`code:${code}`]: id,
    [`show:${id}`]: JSON.stringify(record),
    [`script:${id}`]: typeof script === 'string' ? script : JSON.stringify(script),
    [`count:${id}`]: '4',
  });
}
