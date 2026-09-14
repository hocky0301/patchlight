(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PatchlightCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // This is Patchlight's own event model, not an implementation of device firmware.
  var TYPES = Object.freeze({
    button: definition('source', {}),
    brightness: definition('source', { value: 70 }),
    motion: definition('source', {}),
    move: definition('source', {}),
    threshold: definition('processor', { value: 30, operator: 'below' }),
    delay: definition('processor', { ms: 500 }),
    counter: definition('processor', { every: 3 }),
    light: definition('sink', { color: '#f6b94b' }),
    sound: definition('sink', { note: 523.25 }),
    paint: definition('sink', { color: '#e58566' })
  });
  var LIMITS = Object.freeze({ nodes: 32, edges: 64, fileBytes: 102400, pendingTimers: 128, work: 2048 });
  var ID = /^[A-Za-z][A-Za-z0-9_-]{0,47}$/;
  var own = Object.prototype.hasOwnProperty;

  function definition(kind, defaults) {
    return Object.freeze({ kind: kind, defaults: Object.freeze(defaults) });
  }

  function fail(message) { throw new Error(message); }

  function record(value, allowed, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail(label + 'はオブジェクトにしてください。');
    var prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) fail(label + 'の形式が不正です。');
    if (Object.getOwnPropertySymbols(value).length) fail(label + 'に使用できないキーがあります。');
    Object.getOwnPropertyNames(value).forEach(function (key) {
      if (allowed.indexOf(key) === -1) fail(label + 'に未対応の項目「' + key.slice(0, 40) + '」があります。');
      var descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!own.call(descriptor, 'value')) fail(label + 'にアクセサーは使用できません。');
    });
  }

  function identifier(value, label) {
    if (typeof value !== 'string' || !ID.test(value)) fail(label + 'は英字から始まる48文字以内の英数字・_・-にしてください。');
    return value;
  }

  function number(value, min, max, label, integer) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) {
      fail(label + 'は' + min + '〜' + max + 'の' + (integer ? '整数' : '数値') + 'にしてください。');
    }
    return value;
  }

  function configFor(type, supplied) {
    var defaults = TYPES[type].defaults;
    var keys = Object.keys(defaults);
    if (supplied === undefined) supplied = {};
    record(supplied, keys, 'ブロック設定');
    var config = {};
    keys.forEach(function (key) { config[key] = own.call(supplied, key) ? supplied[key] : defaults[key]; });
    if (type === 'brightness') number(config.value, 0, 100, '明るさ');
    if (type === 'threshold') {
      number(config.value, -1000000, 1000000, 'しきい値');
      if (config.operator !== 'below' && config.operator !== 'above') fail('比較方法は below または above にしてください。');
    }
    if (type === 'delay') number(config.ms, 0, 10000, '待ち時間', true);
    if (type === 'counter') number(config.every, 1, 100, 'カウント数', true);
    if (type === 'sound') number(config.note, 20, 20000, '音の周波数');
    if (type === 'light' || type === 'paint') {
      if (typeof config.color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(config.color)) fail('色は #RRGGBB 形式にしてください。');
      config.color = config.color.toLowerCase();
    }
    return config;
  }

  function canonicalNode(node) {
    record(node, ['id', 'type', 'x', 'y', 'config'], 'ブロック');
    identifier(node.id, 'ブロックID');
    if (typeof node.type !== 'string' || !own.call(TYPES, node.type)) fail('未対応のブロック種類です。');
    return {
      id: node.id,
      type: node.type,
      x: number(node.x, 0, 3000, '横位置'),
      y: number(node.y, 0, 3000, '縦位置'),
      config: configFor(node.type, node.config)
    };
  }

  function createNode(type, id, x, y) {
    return canonicalNode({ id: id, type: type, x: x === undefined ? 0 : x, y: y === undefined ? 0 : y });
  }

  function validateGraph(graph) {
    record(graph, ['version', 'title', 'nodes', 'edges'], '作品');
    if (graph.version !== 1) fail('この作品のバージョンには対応していません。version: 1 が必要です。');
    if (typeof graph.title !== 'string' || !graph.title.trim() || graph.title.length > 120 || /[\u0000-\u001f\u007f]/.test(graph.title)) {
      fail('作品名は改行なしの1〜120文字にしてください。');
    }
    if (!Array.isArray(graph.nodes) || graph.nodes.length > LIMITS.nodes) fail('ブロックは32個までです。');
    if (!Array.isArray(graph.edges) || graph.edges.length > LIMITS.edges) fail('接続は64本までです。');
    var nodes = [];
    var nodeById = new Map();
    for (var rawNode of graph.nodes) {
      var node = canonicalNode(rawNode);
      if (nodeById.has(node.id)) fail('同じブロックIDが重複しています。');
      nodes.push(node);
      nodeById.set(node.id, node);
    }
    var edges = [];
    var edgeIds = new Set();
    var pairs = new Set();
    var outgoing = new Map();
    var incoming = new Map();
    nodes.forEach(function (item) { outgoing.set(item.id, []); incoming.set(item.id, 0); });
    for (var rawEdge of graph.edges) {
      record(rawEdge, ['id', 'from', 'to'], '接続');
      identifier(rawEdge.id, '接続ID');
      identifier(rawEdge.from, '接続元ID');
      identifier(rawEdge.to, '接続先ID');
      var edge = { id: rawEdge.id, from: rawEdge.from, to: rawEdge.to };
      if (edgeIds.has(edge.id)) fail('同じ接続IDが重複しています。');
      edgeIds.add(edge.id);
      if (!nodeById.has(edge.from) || !nodeById.has(edge.to)) fail('接続先のブロックが見つかりません。');
      if (edge.from === edge.to) fail('同じブロック自身には接続できません。');
      var pair = edge.from + ':' + edge.to;
      if (pairs.has(pair)) fail('このブロック間はすでに接続されています。');
      pairs.add(pair);
      if (TYPES[nodeById.get(edge.from).type].kind === 'sink') fail('出力ブロックからは接続できません。');
      if (TYPES[nodeById.get(edge.to).type].kind === 'source') fail('入力ブロックへは接続できません。');
      edges.push(edge);
      outgoing.get(edge.from).push(edge.to);
      incoming.set(edge.to, incoming.get(edge.to) + 1);
    }
    // Kahn's algorithm rejects every cycle, including cycles through delay blocks.
    var ready = nodes.filter(function (item) { return incoming.get(item.id) === 0; }).map(function (item) { return item.id; });
    var visited = 0;
    for (var index = 0; index < ready.length; index++) {
      visited++;
      outgoing.get(ready[index]).forEach(function (id) {
        incoming.set(id, incoming.get(id) - 1);
        if (incoming.get(id) === 0) ready.push(id);
      });
    }
    if (visited !== nodes.length) fail('ループする接続は使えません。接続を一方向につないでください。');
    return { version: 1, title: graph.title.trim(), nodes: nodes, edges: edges };
  }

  function connect(graph, from, to) {
    var result = validateGraph(graph);
    var taken = new Set(result.edges.map(function (edge) { return edge.id; }));
    var index = 1;
    while (taken.has('e-' + index)) index++;
    result.edges.push({ id: 'e-' + index, from: from, to: to });
    return validateGraph(result);
  }

  function serialize(graph) { return JSON.stringify(validateGraph(graph), null, 2); }

  function parse(text) {
    if (typeof text !== 'string') fail('作品ファイルはJSONテキストにしてください。');
    if (text.length > LIMITS.fileBytes || new TextEncoder().encode(text).length > LIMITS.fileBytes) fail('作品ファイルは100KBまでです。');
    var graph;
    try { graph = JSON.parse(text); } catch (_) { fail('JSONを読み込めませんでした。作品ファイルを確認してください。'); }
    return validateGraph(graph);
  }

  function createEngine(graph, options) {
    options = options || {};
    var onEvent = options.onEvent || function () {};
    var schedule = options.schedule || function (callback, ms) { return setTimeout(callback, ms); };
    var cancel = options.cancel || function (handle) { clearTimeout(handle); };
    if (typeof onEvent !== 'function' || typeof schedule !== 'function' || typeof cancel !== 'function') fail('エンジンのコールバック設定が不正です。');
    var current;
    var nodes;
    var outgoing;
    var counts = new Map();
    var timers = new Set();
    var queue = [];
    var draining = false;
    var disposed = false;
    var reporting = false;
    var resetting = false;
    var epoch = 0;

    function reset() {
      if (resetting) return;
      resetting = true;
      epoch++;
      queue.length = 0;
      counts.clear();
      // Detach all tokens before calling injected code; cancellation may re-enter us.
      var pending = Array.from(timers);
      timers.clear();
      pending.forEach(function (token) { token.active = false; });
      try {
        pending.forEach(function (token) {
          try { cancel(token.handle); } catch (_) { /* Epoch also invalidates callbacks. */ }
        });
      } finally { resetting = false; }
    }

    function runtimeError(message, nodeId) {
      if (reporting) return;
      reporting = true;
      try {
        reset();
        try { onEvent({ kind: 'error', nodeId: nodeId, message: message }); } catch (_) { /* Consumer errors cannot restart delivery. */ }
      } finally { reporting = false; }
    }

    function emit(event) {
      try { onEvent(event); } catch (_) { runtimeError('表示処理でエラーが起きたため、実行をリセットしました。', event.nodeId); }
    }

    function valid(task) { return !disposed && task.epoch === epoch; }

    function enqueue(task) {
      if (!valid(task)) return;
      if (queue.length >= LIMITS.work) {
        runtimeError('イベントが多すぎるため、実行をリセットしました。', task.nodeId);
        return;
      }
      queue.push(task);
    }

    function forward(task) {
      var edges = outgoing.get(task.nodeId);
      for (var edge of edges) {
        if (!valid(task)) break;
        emit({ kind: 'edge', edgeId: edge.id, value: task.value });
        enqueue({ nodeId: edge.to, value: task.value, budget: task.budget, epoch: task.epoch, release: false });
      }
    }

    function run(task) {
      if (!valid(task)) return;
      if (--task.budget.remaining < 0) {
        runtimeError('1回の操作からのイベントが多すぎます。接続を減らしてください。', task.nodeId);
        return;
      }
      if (task.release) { forward(task); return; }
      var node = nodes.get(task.nodeId);
      var config = node.config;
      emit({ kind: 'node', nodeId: node.id, type: node.type, value: task.value, config: Object.assign({}, config) });
      if (!valid(task)) return;
      if (TYPES[node.type].kind === 'sink') {
        emit({ kind: 'output', nodeId: node.id, type: node.type, value: task.value, config: Object.assign({}, config) });
        return;
      }
      if (node.type === 'threshold') {
        if (typeof task.value !== 'number' || !Number.isFinite(task.value)) return;
        if (config.operator === 'below' ? task.value >= config.value : task.value <= config.value) return;
      }
      if (node.type === 'counter') {
        var count = (counts.get(node.id) || 0) + 1;
        counts.set(node.id, count % config.every);
        if (count < config.every) return;
      }
      if (node.type === 'delay') {
        if (timers.size >= LIMITS.pendingTimers) {
          runtimeError('待ち時間のあるイベントが多すぎるため、実行をリセットしました。', node.id);
          return;
        }
        var token = { handle: undefined, active: true };
        timers.add(token);
        try {
          token.handle = schedule(function () {
            if (!token.active) return;
            token.active = false;
            timers.delete(token);
            enqueue({ nodeId: node.id, value: task.value, budget: task.budget, epoch: task.epoch, release: true });
            drain();
          }, config.ms);
        } catch (_) {
          token.active = false;
          timers.delete(token);
          runtimeError('待ち時間を開始できなかったため、実行をリセットしました。', node.id);
        }
        return;
      }
      forward(task);
    }

    function drain() {
      if (draining || reporting || disposed) return;
      draining = true;
      var work = 0;
      try {
        while (queue.length) {
          if (++work > LIMITS.work) { runtimeError('イベントが多すぎるため、実行をリセットしました。'); break; }
          run(queue.shift());
        }
      } finally { draining = false; }
    }

    function setGraph(next) {
      if (disposed) fail('終了したエンジンは使えません。');
      if (resetting) fail('リセット中は作品を変更できません。');
      var checked = validateGraph(next);
      reset();
      current = checked;
      nodes = new Map(current.nodes.map(function (node) { return [node.id, node]; }));
      outgoing = new Map(current.nodes.map(function (node) { return [node.id, []]; }));
      current.edges.forEach(function (edge) { outgoing.get(edge.from).push(edge); });
    }

    function trigger(nodeId, value) {
      if (disposed) fail('終了したエンジンは使えません。');
      if (reporting || resetting) return;
      var node = nodes.get(nodeId);
      if (!node || TYPES[node.type].kind !== 'source') fail('操作できる入力ブロックが見つかりません。');
      if (value === undefined) value = true;
      if (!(value === null || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value)) || (typeof value === 'string' && value.length <= 128))) {
        fail('入力値は有限の数値・真偽値・128文字以内の文字列にしてください。');
      }
      enqueue({ nodeId: nodeId, value: value, budget: { remaining: LIMITS.work }, epoch: epoch, release: false });
      drain();
    }

    setGraph(graph);
    return Object.freeze({
      trigger: trigger,
      reset: reset,
      setGraph: setGraph,
      dispose: function () { if (!disposed) { disposed = true; reset(); } }
    });
  }

  return Object.freeze({ TYPES: TYPES, LIMITS: LIMITS, createNode: createNode, validateGraph: validateGraph, connect: connect, createEngine: createEngine, serialize: serialize, parse: parse });
});
