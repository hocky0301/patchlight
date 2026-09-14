'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const core = require('../src/core.js');

function graph(types = ['button', 'light'], links = [[0, 1]]) {
  return {
    version: 1, title: 'テスト作品',
    nodes: types.map((type, i) => core.createNode(type, `n-${i}`, 100 + (i % 10) * 200, 100 + Math.floor(i / 10) * 200)),
    edges: links.map(([from, to], i) => ({ id: `e-${i}`, from: `n-${from}`, to: `n-${to}` }))
  };
}

function fakeClock() {
  let now = 0;
  let next = 0;
  const jobs = new Map();
  const cancelled = [];
  return {
    schedule(callback, ms) { const id = ++next; jobs.set(id, { at: now + ms, callback }); return id; },
    cancel(id) { cancelled.push(id); jobs.delete(id); },
    tick(ms) {
      const target = now + ms;
      for (;;) {
        const due = [...jobs].filter(([, job]) => job.at <= target).sort((a, b) => a[1].at - b[1].at || a[0] - b[0]);
        if (!due.length) break;
        const [id, job] = due[0]; jobs.delete(id); now = job.at; job.callback();
      }
      now = target;
    },
    get pending() { return jobs.size; },
    cancelled
  };
}

test('classic browser script exposes the same dependency-free API', () => {
  const context = vm.createContext({ TextEncoder, setTimeout, clearTimeout });
  vm.runInContext(fs.readFileSync(require.resolve('../src/core.js'), 'utf8'), context);
  assert.equal(typeof context.PatchlightCore.createEngine, 'function');
  assert.equal(context.PatchlightCore.TYPES.button.kind, 'source');
});

test('validation returns an independent canonical clone with defaults', () => {
  const original = graph();
  original.nodes[1].config = { color: '#ABCDEF' };
  const result = core.validateGraph(original);
  assert.equal(result.nodes[1].config.color, '#abcdef');
  result.nodes[0].x = 999;
  result.edges[0].to = 'other';
  assert.equal(original.nodes[0].x, 100);
  assert.equal(original.edges[0].to, 'n-1');
  assert.deepEqual(core.createNode('delay', 'wait').config, { ms: 500 });
  assert.deepEqual(core.parse(core.serialize(original)), core.validateGraph(original));
});

test('source → sink produces observable node, edge, node and output events', () => {
  const events = [];
  const engine = core.createEngine(graph(), { onEvent: event => events.push(event) });
  engine.trigger('n-0');
  assert.deepEqual(events.map(e => e.kind), ['node', 'edge', 'node', 'output']);
  assert.equal(events[3].nodeId, 'n-1');
  assert.equal(events[3].value, true);
  assert.deepEqual(events[3].config, { color: '#f6b94b' });
});

test('fan-out uses edge order and breadth-first FIFO delivery', () => {
  const events = [];
  const value = graph(['button', 'counter', 'counter', 'light', 'paint'], [[0, 1], [0, 2], [1, 3], [2, 4]]);
  value.nodes[1].config.every = value.nodes[2].config.every = 1;
  core.createEngine(value, { onEvent: event => events.push(event) }).trigger('n-0', 17);
  assert.deepEqual(events.filter(e => e.kind === 'node').map(e => e.nodeId), ['n-0', 'n-1', 'n-2', 'n-3', 'n-4']);
  assert.deepEqual(events.filter(e => e.kind === 'output').map(e => [e.type, e.value]), [['light', 17], ['paint', 17]]);
});

test('threshold is strict and only passes numeric inputs matching its comparison', () => {
  for (const operator of ['below', 'above']) {
    const value = graph(['brightness', 'threshold', 'light'], [[0, 1], [1, 2]]);
    value.nodes[1].config.operator = operator;
    const outputs = [];
    const engine = core.createEngine(value, { onEvent: e => { if (e.kind === 'output') outputs.push(e.value); } });
    [29, 30, 31, true, '29', null].forEach(n => engine.trigger('n-0', n));
    assert.deepEqual(outputs, operator === 'below' ? [29] : [31]);
  }
});

test('counter fires every nth arrival and resets its count', () => {
  const value = graph(['button', 'counter', 'sound'], [[0, 1], [1, 2]]);
  const outputs = [];
  const engine = core.createEngine(value, { onEvent: e => { if (e.kind === 'output') outputs.push(e.value); } });
  [1, 2, 3, 4, 5, 6].forEach(n => engine.trigger('n-0', n));
  assert.deepEqual(outputs, [3, 6]);
  engine.trigger('n-0', 7); engine.trigger('n-0', 8); engine.reset(); engine.trigger('n-0', 9);
  assert.deepEqual(outputs, [3, 6]);
});

test('delay fires exactly on its deadline, preserves ordering and cancels on reset', () => {
  const clock = fakeClock();
  const outputs = [];
  const value = graph(['button', 'delay', 'light'], [[0, 1], [1, 2]]);
  const engine = core.createEngine(value, { ...clock, onEvent: e => { if (e.kind === 'output') outputs.push(e.value); } });
  engine.trigger('n-0', 1); engine.trigger('n-0', 2);
  clock.tick(499); assert.deepEqual(outputs, []);
  clock.tick(1); assert.deepEqual(outputs, [1, 2]);
  engine.trigger('n-0', 3); assert.equal(clock.pending, 1);
  engine.reset(); assert.equal(clock.pending, 0);
  clock.tick(1000); assert.deepEqual(outputs, [1, 2]);
});

test('setGraph cancels stale delay work; invalid replacements preserve the current graph', () => {
  const clock = fakeClock(); const outputs = [];
  const old = graph(['button', 'delay', 'light'], [[0, 1], [1, 2]]);
  const engine = core.createEngine(old, { ...clock, onEvent: e => { if (e.kind === 'output') outputs.push(e.type); } });
  engine.trigger('n-0');
  assert.throws(() => engine.setGraph({ ...old, version: 9 }), /バージョン/);
  clock.tick(500); assert.deepEqual(outputs, ['light']);
  engine.trigger('n-0'); engine.setGraph(graph(['button', 'paint']));
  clock.tick(500); assert.deepEqual(outputs, ['light']);
  engine.trigger('n-0'); assert.deepEqual(outputs, ['light', 'paint']);
});

test('dispose cancels timers, is idempotent and rejects subsequent operations', () => {
  const clock = fakeClock(); const events = [];
  const engine = core.createEngine(graph(['button', 'delay', 'light'], [[0, 1], [1, 2]]), { ...clock, onEvent: e => events.push(e) });
  engine.trigger('n-0'); engine.dispose(); engine.dispose();
  assert.equal(clock.pending, 0);
  clock.tick(1000); assert.equal(events.filter(e => e.kind === 'output').length, 0);
  assert.throws(() => engine.trigger('n-0'), /終了/);
  assert.throws(() => engine.setGraph(graph()), /終了/);
});

test('epoch invalidation prevents stale outputs even with a broken cancellation provider', () => {
  let fire; const outputs = [];
  const engine = core.createEngine(graph(['button', 'delay', 'light'], [[0, 1], [1, 2]]), {
    schedule(callback) { fire = callback; return 1; }, cancel() { throw new Error('cannot cancel'); },
    onEvent: e => { if (e.kind === 'output') outputs.push(e); }
  });
  engine.trigger('n-0'); engine.reset(); fire();
  assert.deepEqual(outputs, []);
});

test('caller mutation of graph and output config cannot change running behavior', () => {
  const value = graph(); const colors = [];
  const engine = core.createEngine(value, { onEvent: e => {
    if (e.kind === 'output') { colors.push(e.config.color); e.config.color = '#000000'; }
  } });
  value.nodes[1].config.color = '#ffffff';
  engine.trigger('n-0'); engine.trigger('n-0');
  assert.deepEqual(colors, ['#f6b94b', '#f6b94b']);
});

test('connect is immutable and rejects duplicates, cycles, self-links and reversed ports', () => {
  const base = graph(['button', 'delay', 'counter', 'light'], []);
  const connected = core.connect(base, 'n-0', 'n-1');
  assert.equal(base.edges.length, 0); assert.equal(connected.edges.length, 1);
  assert.throws(() => core.connect(connected, 'n-0', 'n-1'), /すでに/);
  assert.throws(() => core.connect(base, 'n-1', 'n-1'), /自身/);
  assert.throws(() => core.connect(base, 'n-3', 'n-1'), /出力/);
  assert.throws(() => core.connect(base, 'n-1', 'n-0'), /入力/);
  assert.throws(() => core.connect(base, 'n-0', 'missing'), /見つかりません/);
  const path = core.connect(connected, 'n-1', 'n-2');
  assert.throws(() => core.connect(path, 'n-2', 'n-1'), /ループ/);
});

test('rejects malformed graph structure, duplicate identifiers, bounds and unexpected versions', () => {
  const mutations = [
    value => { value.version = 2; },
    value => { value.title = ''; },
    value => { value.title = 'a'.repeat(121); },
    value => { value.title = 'a\nb'; },
    value => { value.nodes[0].id = '<script>'; },
    value => { value.nodes[0].type = 'constructor'; },
    value => { value.nodes[0].x = Infinity; },
    value => { value.nodes[0].y = -1; },
    value => { value.nodes[0].config.inject = 'x'; },
    value => { value.nodes[1].id = value.nodes[0].id; },
    value => { value.edges.push({ ...value.edges[0] }); },
    value => { value.edges.push({ ...value.edges[0], id: 'another' }); },
    value => { value.edges[0].to = 'missing'; },
    value => { value.nodes[1].config.color = 'red'; },
    value => { value.nodes = Array.from({ length: 33 }, (_, i) => core.createNode('button', `n${i}`)); },
    value => { value.edges = Array(65).fill(value.edges[0]); },
    value => { value.nodes = [undefined]; },
    value => { value.edges = [null]; }
  ];
  for (const mutate of mutations) { const value = graph(); mutate(value); assert.throws(() => core.validateGraph(value)); }
});

test('config rejects non-finite values, coercion, oversized delays and invalid operators', () => {
  for (const [type, config] of [
    ['brightness', { value: 101 }], ['brightness', { value: '30' }],
    ['threshold', { value: NaN }], ['threshold', { operator: 'equal' }],
    ['delay', { ms: 10001 }], ['delay', { ms: 0.5 }],
    ['counter', { every: 0 }], ['counter', { every: 1.5 }],
    ['sound', { note: 0 }], ['paint', { color: '#abcd' }]
  ]) {
    const value = graph([type], []); value.nodes[0].config = config;
    assert.throws(() => core.validateGraph(value));
  }
});

test('import rejects prototype payloads and custom accessors without evaluating them', () => {
  const text = core.serialize(graph());
  assert.throws(() => core.parse(text.replace('"config": {}', '"config": {"__proto__": {"polluted": true}}')), /未対応/);
  assert.equal({}.polluted, undefined);
  const value = graph(); let accessed = false;
  Object.defineProperty(value.nodes[0], 'x', { get() { accessed = true; return 10; }, enumerable: true });
  assert.throws(() => core.validateGraph(value), /アクセサー/);
  assert.equal(accessed, false);
  const prototypeValue = graph();
  Object.setPrototypeOf(prototypeValue.nodes[0].config, { injected: true });
  assert.throws(() => core.validateGraph(prototypeValue), /形式/);
});

test('parse handles malformed and oversized UTF-8 files with readable errors', () => {
  assert.throws(() => core.parse('{'), /JSON/);
  assert.throws(() => core.parse(null), /JSON/);
  assert.throws(() => core.parse(' '.repeat(102401)), /100KB/);
  assert.throws(() => core.parse('あ'.repeat(40000)), /100KB/);
  assert.throws(() => core.parse('null'), /オブジェクト/);
});

test('triggers reject invalid source IDs and unsafe input values', () => {
  const engine = core.createEngine(graph());
  assert.throws(() => engine.trigger('missing'), /入力/);
  assert.throws(() => engine.trigger('n-1'), /入力/);
  [NaN, Infinity, {}, [], 'x'.repeat(129)].forEach(value => assert.throws(() => engine.trigger('n-0', value), /入力値/));
});

test('pending delay limit reports an error and cancels the entire pending batch', () => {
  const clock = fakeClock(); const events = [];
  const engine = core.createEngine(graph(['button', 'delay', 'light'], [[0, 1], [1, 2]]), { ...clock, onEvent: e => events.push(e) });
  for (let i = 0; i <= core.LIMITS.pendingTimers; i++) engine.trigger('n-0');
  assert.equal(events.filter(e => e.kind === 'error').length, 1);
  assert.equal(clock.pending, 0);
  clock.tick(1000); assert.equal(events.filter(e => e.kind === 'output').length, 0);
  engine.trigger('n-0'); clock.tick(500);
  assert.equal(events.filter(e => e.kind === 'output').length, 1);
});

test('path multiplication in a legal DAG is bounded per initial input', () => {
  const value = graph(['button', ...Array(20).fill('counter'), 'light'], []);
  value.nodes.filter(n => n.type === 'counter').forEach(n => { n.config.every = 1; });
  const links = [[0, 1], [0, 2]];
  for (let layer = 0; layer < 9; layer++) {
    const first = 1 + layer * 2;
    for (const from of [first, first + 1]) for (const to of [first + 2, first + 3]) links.push([from, to]);
  }
  links.push([19, 21], [20, 21]);
  value.edges = links.map(([from, to], i) => ({ id: `e${i}`, from: `n-${from}`, to: `n-${to}` }));
  const events = [];
  core.createEngine(value, { onEvent: e => events.push(e) }).trigger('n-0');
  assert.equal(events.filter(e => e.kind === 'error').length, 1);
  assert.ok(events.filter(e => e.kind === 'node').length <= core.LIMITS.work);
});

test('reset inside an observer prevents delivery of the current event downstream', () => {
  const events = []; let engine;
  engine = core.createEngine(graph(), { onEvent: e => { events.push(e); if (e.kind === 'node') engine.reset(); } });
  engine.trigger('n-0');
  assert.deepEqual(events.map(e => e.kind), ['node']);
});

test('throwing event observer causes one error and the engine remains usable', () => {
  const events = []; let shouldThrow = true;
  const engine = core.createEngine(graph(), { onEvent: e => {
    if (shouldThrow && e.kind === 'node') { shouldThrow = false; throw new Error('UI failure'); }
    events.push(e);
  } });
  engine.trigger('n-0');
  assert.deepEqual(events.map(e => e.kind), ['error']);
  engine.trigger('n-0');
  assert.equal(events.filter(e => e.kind === 'output').length, 1);
});

test('reset remains atomic when cancellation synchronously re-enters the engine', () => {
  const clock = fakeClock(); const outputs = []; let engine; let cancelCalls = 0;
  engine = core.createEngine(graph(['button', 'delay', 'light'], [[0, 1], [1, 2]]), {
    schedule: clock.schedule,
    cancel(id) {
      cancelCalls++; clock.cancel(id);
      engine.reset();
      engine.trigger('n-0');
    },
    onEvent: e => { if (e.kind === 'output') outputs.push(e); }
  });
  engine.trigger('n-0'); engine.trigger('n-0');
  engine.reset();
  assert.equal(cancelCalls, 2);
  assert.equal(clock.pending, 0);
  clock.tick(500); assert.deepEqual(outputs, []);
  engine.trigger('n-0'); clock.tick(500); assert.equal(outputs.length, 1);
});

test('an injected scheduler cannot replay a delay callback more than once', () => {
  let fire; const outputs = [];
  const engine = core.createEngine(graph(['button', 'delay', 'light'], [[0, 1], [1, 2]]), {
    schedule(callback) { fire = callback; return 1; }, cancel() {},
    onEvent: e => { if (e.kind === 'output') outputs.push(e); }
  });
  engine.trigger('n-0'); fire(); fire();
  assert.equal(outputs.length, 1);
});

test('setGraph from an edge observer aborts stale fan-out and adopts the new graph', () => {
  const events = []; let replace = true; let engine;
  engine = core.createEngine(graph(['button', 'light', 'sound'], [[0, 1], [0, 2]]), {
    onEvent(e) {
      events.push(e);
      if (e.kind === 'edge' && replace) { replace = false; engine.setGraph(graph(['button', 'paint'])); }
    }
  });
  engine.trigger('n-0');
  assert.equal(events.filter(e => e.kind === 'output').length, 0);
  engine.trigger('n-0');
  assert.deepEqual(events.filter(e => e.kind === 'output').map(e => e.type), ['paint']);
});

test('recursive observer triggers stop at the per-drain limit without stack overflow', () => {
  let engine; let count = 0; const errors = [];
  engine = core.createEngine(graph(['button'], []), { onEvent(e) {
    if (e.kind === 'node') { count++; engine.trigger('n-0'); }
    if (e.kind === 'error') { errors.push(e); engine.trigger('n-0'); }
  } });
  engine.trigger('n-0');
  assert.equal(count, core.LIMITS.work);
  assert.equal(errors.length, 1);
});

test('scheduler failures cancel earlier pending work and remain recoverable', () => {
  const clock = fakeClock(); const errors = []; const outputs = []; let broken = false;
  const engine = core.createEngine(graph(['button', 'delay', 'light'], [[0, 1], [1, 2]]), {
    schedule(callback, ms) { if (broken) throw new Error('schedule failed'); return clock.schedule(callback, ms); },
    cancel: clock.cancel,
    onEvent(e) { if (e.kind === 'error') errors.push(e); if (e.kind === 'output') outputs.push(e); }
  });
  engine.trigger('n-0'); broken = true; engine.trigger('n-0');
  assert.equal(errors.length, 1); assert.equal(clock.pending, 0);
  broken = false; engine.trigger('n-0'); clock.tick(500);
  assert.equal(outputs.length, 1);
});
