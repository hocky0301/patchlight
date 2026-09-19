/* License: see LICENSE (use requires permission) */
(() => {
  'use strict';
  const Core = window.PatchlightCore;
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const STORAGE_KEY = 'patchlight.recipe.v1';
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const icons = {
    button: '<rect x="5" y="5" width="14" height="14" rx="5"/><circle cx="12" cy="12" r="3"/>',
    brightness: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
    motion: '<circle cx="12" cy="5" r="2"/><path d="M8 21l3-7 3 4 2 3M5 13l5-5 4 3 5 1M11 9v5"/>',
    move: '<path d="M8 7l7-3 5 13-7 3zM3 9l-1 3 3 3M22 7l-1-3-3-1"/>',
    threshold: '<path d="M3 5h18l-7 8v6l-4 2v-8z"/>',
    delay: '<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
    counter: '<path d="M9 3L7 21M17 3l-2 18M4 8h17M3 16h17"/>',
    light: '<path d="M9 18h6m-5 3h4M8 15c0-2-3-3-3-7a7 7 0 0 1 14 0c0 4-3 5-3 7z"/>',
    sound: '<path d="M9 18V5l11-2v13M9 8l11-2"/><ellipse cx="6" cy="18" rx="3" ry="2"/><ellipse cx="17" cy="16" rx="3" ry="2"/>',
    paint: '<path d="M12 2S4 11 4 15a8 8 0 0 0 16 0c0-4-8-13-8-13zM8 15c0 2 1 3 3 3"/>'
  };
  const META = {
    button: { label: 'ボタン', hint: '押すと、きっかけに。', tint: '#e4edde' },
    brightness: { label: '明るさ', hint: '画面でつくる明るさ', tint: '#e4edde' },
    motion: { label: '人感', hint: '人が動いたら。', tint: '#e4edde' },
    move: { label: '動き', hint: '振ると、きっかけに。', tint: '#e4edde' },
    threshold: { label: '条件', hint: '数値を比べて通す', tint: '#ece8f1' },
    delay: { label: '待つ', hint: 'ひと呼吸、おいて。', tint: '#ece8f1' },
    counter: { label: '数える', hint: '何回目で、動かす？', tint: '#ece8f1' },
    light: { label: 'あかり', hint: '受け取ったら、点灯。', tint: '#f8edc9' },
    sound: { label: '音', hint: '受け取ったら、ひと音。', tint: '#f8edc9' },
    paint: { label: '色', hint: '受け取ったら、ひといろ。', tint: '#f8edc9' }
  };
  const compact = () => window.matchMedia('(max-width: 640px)').matches;
  const icon = type => `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${icons[type]}</svg>`;
  let idCounter = 0;
  let graph;
  let engine;
  let history = [];
  let redoHistory = [];
  let previewScene = 'light';
  let lastSoundFrequency = null;
  let pendingVisualDelays = new Map();
  let selectedPort = null;
  let currentPreset = 'starter';
  let completed = false;
  let audioContext;
  let soundEnabled = false;
  let voices = new Set();
  let activeTimers = new Set();
  let eventNumber = 0;
  let paintNumber = 0;
  let logs = [];
  let toastTimer;
  let resizeTimer;
  let uiCounts = new Map();
  let dragging = null;
  const clone = value => JSON.parse(JSON.stringify(value));
  const makeElement = (tag, className, text) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  };
  function displayName(node) {
    return `${META[node.type].label} ${graph.nodes.filter(item => item.type === node.type).findIndex(item => item.id === node.id) + 1}`;
  }
  function updateHistoryButtons() {
    $('#undo-button').disabled = !history.length;
    $('#redo-button').disabled = !redoHistory.length;
  }
  function rememberEdit(snapshot = Core.serialize(graph)) {
    history.push(snapshot);
    if (history.length > 30) history.shift();
    redoHistory = [];
    updateHistoryButtons();
  }
  function undo() {
    if (!history.length || dragging) return;
    redoHistory.push(Core.serialize(graph));
    currentPreset = 'custom';
    commit(Core.parse(history.pop()), { remember: false, resetLesson: true });
    toast('ひとつ前のレシピに戻しました。');
  }
  function redo() {
    if (!redoHistory.length || dragging) return;
    history.push(Core.serialize(graph));
    currentPreset = 'custom';
    commit(Core.parse(redoHistory.pop()), { remember: false, resetLesson: true });
    toast('取り消した編集をやり直しました。');
  }
  function filterPalette(filter) {
    $$('.palette-filters button').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.filter === filter)));
    $$('.palette-group').forEach(group => { group.hidden = filter !== 'all' && group.dataset.kind !== filter; });
    $('#palette-list').scrollTo(0, 0);
  }
  function chooseScene(scene) {
    previewScene = scene;
    $('#little-world').dataset.scene = scene;
    $$('#scene-tabs button').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.scene === scene)));
    $('#preview-description').textContent = { light: 'きっかけが、部屋のあかりに。', paint: 'ひとつの動きが、ひとつの色に。', sound: 'きっかけが、ひと音になる。' }[scene];
    $('#save-artwork').hidden = scene !== 'paint';
    updateSceneFeedback();
  }
  function updateSceneFeedback() {
    let state = 'ひらめき待ち';
    let message = initialPreviewMessage();
    if (previewScene === 'light' && $('#little-world').classList.contains('lit')) {
      state = 'あかりがついた';
      message = 'あかりがついた！ あなたの「つなぐ」が、動きになりました。';
    } else if (previewScene === 'paint' && paintNumber) {
      state = `${paintNumber} 色のひらめき`;
      message = 'ひといろ、描けた！ 色を変えて、もう一度動かしてみよう。';
    } else if (previewScene === 'sound' && lastSoundFrequency !== null) {
      state = '音に、届いた';
      message = soundEnabled ? 'きっかけが、音まで届きました。' : '音まで届いた！ 「音 OFF」を押すと、次から音も聞けます。';
    }
    if (lastSoundFrequency !== null) $('#tone-frequency').textContent = `${lastSoundFrequency} Hz${soundEnabled ? '' : ' · 音 OFF'}`;
    $('#world-state').textContent = state;
    $('#preview-status').textContent = message;
  }
  function syncScenes() {
    const scenes = [...new Set(graph.nodes.filter(node => Core.TYPES[node.type].kind === 'sink').map(node => node.type))];
    if (!scenes.includes(previewScene)) previewScene = scenes[0] || 'light';
    $('#scene-tabs').replaceChildren();
    scenes.forEach(scene => {
      const button = makeElement('button', null, META[scene].label);
      button.dataset.scene = scene;
      button.setAttribute('aria-label', `${META[scene].label}の出力を見る`);
      $('#scene-tabs').append(button);
    });
    $('#scene-tabs').hidden = scenes.length < 2;
    chooseScene(previewScene);
    const brightness = graph.nodes.find(node => node.type === 'brightness');
    $('#little-world').style.setProperty('--daylight', brightness ? brightness.config.value / 100 : .65);
  }
  function setNodeState(id, text, state) {
    const node = $(`#node-${id}`);
    if (!node) return;
    node.dataset.signal = state;
    const caption = $('[data-state-for]', node);
    if (caption) caption.textContent = text;
  }
  function initialPreviewMessage() {
    if (!graph.nodes.length) return 'ブロックを追加して、小さな仕組みをつくろう。';
    if (!graph.edges.length) return '線をつないだら、入力を動かしてみよう。';
    const source = graph.nodes.find(node => Core.TYPES[node.type].kind === 'source');
    return { button: '「押す」で、つながった先を動かそう。', brightness: '明るさのつまみを動かして、条件をためそう。', motion: '「人が来た」を押して、反応を待ってみよう。', move: '「振る」を押して、色が届くまで数えてみよう。' }[source?.type] || '入力ブロックをつないで、きっかけを作ろう。';
  }
  function exportArtwork() {
    if (!paintNumber) return;
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('xmlns', SVG_NS);
    svg.setAttribute('width', '800'); svg.setAttribute('height', '600'); svg.setAttribute('viewBox', '0 0 800 600');
    const background = document.createElementNS(SVG_NS, 'rect');
    background.setAttribute('width', '800'); background.setAttribute('height', '600'); background.setAttribute('fill', '#faf7ed'); svg.append(background);
    for (const dot of $('#paint-dots').children) {
      const circle = document.createElementNS(SVG_NS, 'circle');
      circle.setAttribute('cx', String(80 + Number(dot.dataset.x) * 6.4));
      circle.setAttribute('cy', String(30 + Number(dot.dataset.y) * 4.6));
      circle.setAttribute('r', '48'); circle.setAttribute('fill', dot.dataset.color); circle.setAttribute('fill-opacity', '.78'); svg.append(circle);
    }
    const title = document.createElementNS(SVG_NS, 'text');
    title.setAttribute('font-size', '14'); title.setAttribute('font-family', 'sans-serif'); title.setAttribute('fill', '#506046');
    const characters = Array.from(graph.title);
    for (let offset = 0; offset < characters.length; offset += 40) {
      const line = document.createElementNS(SVG_NS, 'tspan');
      line.setAttribute('x', '48'); line.setAttribute('y', String(542 + offset / 40 * 16));
      line.textContent = characters.slice(offset, offset + 40).join(''); title.append(line);
    }
    svg.append(title);
    const credit = document.createElementNS(SVG_NS, 'text');
    credit.setAttribute('x', '48'); credit.setAttribute('y', '592'); credit.setAttribute('font-size', '10'); credit.setAttribute('font-family', 'sans-serif'); credit.setAttribute('fill', '#78836c'); credit.textContent = 'Made with Patchlight'; svg.append(credit);
    const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' }));
    const anchor = makeElement('a'); anchor.href = url; anchor.download = 'patchlight-artwork.svg'; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('描いた色を SVG 画像に保存しました。');
  }
  function makePreset(name) {
    const layouts = {
      starter: ['はじめてのあかり', ['button', 'light']],
      night: ['暗くなったら、あかりを。', ['brightness', 'threshold', 'light']],
      door: ['おかえりの音。', ['motion', 'delay', 'sound']],
      color: ['ふた振りで、ひといろ。', ['move', 'counter', 'paint']]
    };
    const [title, types] = layouts[name] || layouts.starter;
    const nodes = types.map((type, index) => {
      const node = Core.createNode(type, `n-${++idCounter}`, 50 + index * 252, 65);
      if (compact()) { node.x = 42 + (index % 2) * 78; node.y = 28 + index * 183; }
      if (type === 'counter') node.config.every = 2;
      if (type === 'delay') node.config.ms = 500;
      return node;
    });
    if (!compact() && name === 'starter') nodes[1].x = 364;
    const edges = name === 'starter' ? [] : nodes.slice(0, -1).map((node, index) => ({ id: `e-${index + 1}`, from: node.id, to: nodes[index + 1].id }));
    return Core.validateGraph({ version: 1, title, nodes, edges });
  }
  function toast(message) {
    clearTimeout(toastTimer);
    $('#toast').textContent = message;
    $('#toast').hidden = false;
    toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 4200);
  }
  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, Core.serialize(graph));
      $('#save-status').textContent = '保存済み';
      // A share/example URL is an initial seed, not a command to discard edits
      // on every reload. Consume it only after the recipe is safely stored.
      try {
        const url = new URL(location.href);
        const seeded = url.hash.startsWith('#recipe=') || url.searchParams.has('example');
        if (url.hash.startsWith('#recipe=')) url.hash = '';
        url.searchParams.delete('example');
        if (seeded) window.history.replaceState(null, '', url.href);
      } catch (_) { /* Some local-file browsers disallow history replacement. */ }
    } catch (_) {
      $('#save-status').textContent = '端末保存できません';
      $('#save-status').title = '保存・開く から JSON ファイルを保存できます。';
    }
  }
  function later(callback, ms) {
    const handle = setTimeout(() => { activeTimers.delete(handle); callback(); }, ms);
    activeTimers.add(handle);
    return handle;
  }
  function clearOutputs(resetEngine = true, preserveArtwork = false) {
    if (resetEngine) engine.reset();
    activeTimers.forEach(clearTimeout);
    activeTimers.clear();
    uiCounts.clear();
    pendingVisualDelays.clear();
    $$('.node[data-signal]').forEach(node => node.removeAttribute('data-signal'));
    $$('[data-state-for]').forEach(caption => { caption.textContent = caption.dataset.initial; });
    $$('.counter-fill').forEach(fill => { fill.style.width = '0%'; });
    $('#tone-note').textContent = '—';
    lastSoundFrequency = null;
    $('#tone-frequency').textContent = 'まだ音は届いていません';
    $('#little-world').classList.remove('sounding');
    voices.forEach(voice => { try { voice.stop(); } catch (_) { /* Already ended. */ } });
    voices.clear();
    $$('.node.active, .wire.active').forEach(element => element.classList.remove('active'));
    $$('.node[data-lit]').forEach(element => element.removeAttribute('data-lit'));
    $$('.output-count').forEach(element => { element.textContent = '0'; });
    $('#little-world').classList.remove('lit');
    $('#sound-rings').classList.remove('ringing');
    if (!preserveArtwork) { $('#paint-dots').replaceChildren(); paintNumber = 0; }
    $('#save-artwork').disabled = !paintNumber;
    $('#paint-paper').classList.toggle('has-paint', Boolean(paintNumber));
    eventNumber = 0;
    logs = [];
    $('#event-count').textContent = '0';
    $('#event-list').replaceChildren(makeElement('li', 'empty-event', 'ブロックを動かすと、ここに届きます。'));
    updateSceneFeedback();
  }
  function commit(next, { remember = true, resetLesson = false, focus = null } = {}) {
    const validated = Core.validateGraph(next);
    const beforeDrag = dragging?.before;
    if (dragging) {
      try { dragging.handle.releasePointerCapture(dragging.pointerId); } catch (_) { /* Capture already released. */ }
      dragging = null;
    }
    if (remember) rememberEdit(beforeDrag);
    graph = validated;
    engine.setGraph(graph);
    selectedPort = null;
    if (resetLesson) completed = false;
    render();
    clearOutputs(false, !resetLesson);
    save();
    if (focus) $(focus)?.focus({ preventScroll: true });
  }
  function renderPalette() {
    const groups = [ ['source', 'きっかけ'], ['processor', 'しくみ'], ['sink', '反応'] ];
    groups.forEach(([kind, label]) => {
      const group = makeElement('div', 'palette-group');
      group.dataset.kind = kind;
      group.append(makeElement('h3', null, label));
      Object.keys(META).filter(type => Core.TYPES[type].kind === kind).forEach(type => {
        const button = makeElement('button', 'palette-item');
        button.dataset.add = type;
        button.setAttribute('aria-label', `${META[type].label}を追加`);
        button.title = META[type].hint;
        button.style.setProperty('--block-tint', META[type].tint);
        const graphic = makeElement('span', 'block-icon');
        graphic.innerHTML = icon(type); // Static, locally authored SVG only.
        button.append(graphic, makeElement('span', null, META[type].label), makeElement('span', 'plus', '+'));
        group.append(button);
      });
      $('#palette-list').append(group);
    });
  }
  function appendConfig(container, node) {
    const title = displayName(node);
    const field = (label, element) => {
      element.setAttribute('aria-label', `${title} ${label}`);
      element.dataset.node = node.id;
      return element;
    };
    if (['button', 'motion', 'move'].includes(node.type)) {
      const button = makeElement('button', 'trigger-button', { button: '押す', motion: '人が来た', move: '振る' }[node.type]);
      button.dataset.trigger = node.id;
      button.setAttribute('aria-label', `${title} ${button.textContent}`);
      container.append(button, makeElement('p', 'node-caption', META[node.type].hint));
    } else if (node.type === 'brightness') {
      const output = makeElement('div', 'sensor-value', `${node.config.value}`);
      output.dataset.valueFor = node.id;
      output.append(makeElement('span', null, ' / 100'));
      const input = field('明るさ', makeElement('input'));
      Object.assign(input, { type: 'range', min: '0', max: '100', step: '1', value: node.config.value });
      input.dataset.config = 'value';
      const trigger = makeElement('button', 'text-button', 'この値を送る');
      trigger.dataset.trigger = node.id;
      trigger.setAttribute('aria-label', `${title} この値を送る`);
      container.append(output, input, trigger);
    } else if (node.type === 'threshold') {
      const operator = field('比較方法', makeElement('select'));
      operator.dataset.config = 'operator';
      [['below', 'より小さいと通す'], ['above', 'より大きいと通す']].forEach(([value, text]) => operator.add(new Option(text, value)));
      operator.value = node.config.operator;
      const numeric = field('しきい値', makeElement('input'));
      Object.assign(numeric, { type: 'number', min: '-1000000', max: '1000000', step: 'any', value: node.config.value });
      numeric.dataset.config = 'value';
      const row = makeElement('div', 'node-field');
      row.append(numeric, operator);
      container.append(row, makeElement('p', 'node-caption', '数字の信号だけを比べます'));
    } else if (node.type === 'delay' || node.type === 'counter') {
      const input = field(node.type === 'delay' ? '待ち時間' : '回数', makeElement('input'));
      const key = node.type === 'delay' ? 'ms' : 'every';
      Object.assign(input, { type: 'number', min: node.type === 'delay' ? '0' : '1', max: node.type === 'delay' ? '10000' : '100', step: '1', value: node.config[key] });
      input.dataset.config = key;
      const row = makeElement('div', 'node-field');
      row.append(input, makeElement('span', null, node.type === 'delay' ? 'ms 待つ' : '回ごと'));
      const caption = makeElement('p', 'node-caption');
      if (node.type === 'counter') {
        const count = makeElement('span', 'output-count', '0');
        count.dataset.countFor = node.id;
        caption.append(count, document.createTextNode(' 回、届きました'));
      } else caption.textContent = '1000 ms = 1 秒';
      container.append(row, caption);
      if (node.type === 'counter') {
        const meter = makeElement('div', 'counter-meter');
        meter.setAttribute('aria-hidden', 'true');
        meter.append(makeElement('i', 'counter-fill'));
        container.append(meter);
      }
    } else if (node.type === 'light' || node.type === 'paint') {
      const row = makeElement('div', 'light-row');
      const sample = makeElement('span', node.type === 'light' ? 'light-preview' : 'paint-chip');
      sample.setAttribute('aria-hidden', 'true');
      const label = makeElement('label', 'color-control', '色');
      const input = field('色', makeElement('input'));
      Object.assign(input, { type: 'color', value: node.config.color });
      input.dataset.config = 'color';
      label.append(input);
      row.append(sample, label);
      const swatches = makeElement('div', 'color-swatches');
      const colors = [['#f6b94b','こはく'],['#e58566','さんご'],['#83ad87','若葉'],['#719bb6','空'],['#a28ac1','すみれ']];
      colors.forEach(([color, name]) => {
        const swatch = makeElement('button', 'color-swatch');
        swatch.dataset.color = color; swatch.dataset.node = node.id;
        swatch.style.setProperty('--swatch', color);
        swatch.setAttribute('aria-label', `${title}の色を${name}にする`);
        swatch.setAttribute('aria-pressed', String(node.config.color === color));
        swatches.append(swatch);
      });
      container.append(row, swatches, makeElement('p', 'node-caption', META[node.type].hint));
    } else if (node.type === 'sound') {
      const input = field('音程', makeElement('select'));
      input.dataset.config = 'note';
      [[261.63, 'ド / C4'], [329.63, 'ミ / E4'], [392, 'ソ / G4'], [523.25, '高いド / C5'], [659.25, '高いミ / E5']].forEach(([value, text]) => input.add(new Option(text, value)));
      if (![...input.options].some(option => Number(option.value) === node.config.note)) input.add(new Option(`${node.config.note} Hz`, node.config.note));
      input.value = node.config.note;
      const row = makeElement('div', 'node-field');
      row.append(input);
      container.append(row, makeElement('p', 'node-caption', '音 OFF でも、届いたことが見えます'));
    }
  }
  function render() {
    $('#recipe-title').textContent = graph.title; $('#recipe-title').setAttribute('aria-label', `${graph.title}：作品名を変更`);
    updateHistoryButtons();
    $('#nodes').replaceChildren();
    graph.nodes.forEach(node => {
      const element = makeElement('article', `node ${Core.TYPES[node.type].kind}`);
      element.id = `node-${node.id}`;
      element.dataset.nodeId = node.id;
      element.setAttribute('aria-label', `${displayName(node)} ブロック`);
      element.style.left = `${node.x}px`;
      element.style.top = `${node.y}px`;
      if (node.config.color) element.style.setProperty('--output-color', node.config.color);
      const header = makeElement('div', 'node-head');
      const handle = makeElement('button', 'node-drag');
      handle.innerHTML = icon(node.type);
      handle.append(makeElement('span', null, META[node.type].label), makeElement('small', null, displayName(node).split(' ').pop()));
      handle.dataset.drag = node.id;
      handle.setAttribute('aria-label', `${displayName(node)}を移動`);
      handle.setAttribute('aria-keyshortcuts', 'ArrowUp ArrowDown ArrowLeft ArrowRight');
      handle.title = 'つかんで移動。キーボードは矢印キー。';
      const remove = makeElement('button', 'delete-node', '×');
      remove.dataset.remove = node.id;
      remove.setAttribute('aria-label', `${displayName(node)}を削除`);
      header.append(handle, remove);
      const content = makeElement('div', 'node-content');
      appendConfig(content, node);
      const stateCaption = $('.node-caption', content);
      if (stateCaption && node.type !== 'counter') { stateCaption.dataset.stateFor = node.id; stateCaption.dataset.initial = stateCaption.textContent; }
      element.append(header, content);
      const addPort = direction => {
        const port = makeElement('button', `port ${direction}`);
        port.dataset.port = direction;
        port.dataset.node = node.id;
        port.setAttribute('aria-label', `${displayName(node)}の${direction === 'output' ? '出力' : '入力'}`);
        port.setAttribute('aria-pressed', 'false');
        port.title = direction === 'output' ? 'ここからつなぐ' : 'ここへつなぐ';
        element.append(port);
      };
      if (Core.TYPES[node.type].kind !== 'source') addPort('input');
      if (Core.TYPES[node.type].kind !== 'sink') addPort('output');
      $('#nodes').append(element);
    });
    drawWires();
    renderEdges();
    syncScenes();
    updateLesson();
    $('#connection-hint').hidden = graph.edges.length > 0 || graph.nodes.length !== 2 || currentPreset !== 'starter';
  }
  function drawWires() {
    $('#board-viewport').style.height = compact() && graph.nodes.length === 3 ? '590px' : '';
    const width = Math.max($('#board-viewport').clientWidth, compact() ? 338 : 590, ...graph.nodes.map(node => node.x + (compact() ? 200 : 210)));
    const height = Math.max(compact() ? 375 : 400, ...graph.nodes.map(node => node.y + 184));
    $('#board').style.width = `${width}px`;
    $('#board').style.height = `${height}px`;
    $('#wires').replaceChildren();
    graph.edges.forEach(edge => {
      const from = graph.nodes.find(node => node.id === edge.from);
      const to = graph.nodes.find(node => node.id === edge.to);
      const fromElement = $(`#node-${from.id}`);
      const sourcePort = $('.port.output', fromElement);
      const targetPort = $('.port.input', $(`#node-${to.id}`));
      const x1 = from.x + sourcePort.offsetLeft + sourcePort.offsetWidth / 2;
      const y1 = from.y + sourcePort.offsetTop + sourcePort.offsetHeight / 2;
      const x2 = to.x + targetPort.offsetLeft + targetPort.offsetWidth / 2;
      const y2 = to.y + targetPort.offsetTop + targetPort.offsetHeight / 2;
      const bend = Math.max(45, Math.min(160, Math.abs(x2 - x1) * .5));
      const path = document.createElementNS(SVG_NS, 'path');
      path.id = `wire-${edge.id}`;
      path.classList.add('wire');
      path.setAttribute('d', `M${x1},${y1} C${x1 + bend},${y1} ${x2 - bend},${y2} ${x2},${y2}`);
      $('#wires').append(path);
    });
    $('#graph-count').textContent = `${graph.nodes.length} blocks · ${graph.edges.length} links`;
    $('#board-overflow-hint').hidden = height <= $('#board-viewport').clientHeight && width <= $('#board-viewport').clientWidth;
  }
  function renderEdges() {
    $('#edge-count').textContent = graph.edges.length;
    $('#edge-list').replaceChildren();
    if (!graph.edges.length) $('#edge-list').append(makeElement('p', null, 'まだ線がありません。出力端子 → 入力端子でつなげます。'));
    graph.edges.forEach(edge => {
      const from = displayName(graph.nodes.find(node => node.id === edge.from));
      const to = displayName(graph.nodes.find(node => node.id === edge.to));
      const row = makeElement('div', 'edge-row');
      const remove = makeElement('button', null, '外す');
      remove.dataset.removeEdge = edge.id;
      remove.setAttribute('aria-label', `${from}から${to}の線を外す`);
      row.append(makeElement('span', null, `${from} → ${to}`), remove);
      $('#edge-list').append(row);
    });
  }
  function updateLesson() {
    let title, detail, number;
    if (completed) {
      number = '✓'; title = 'できた！ きっかけが、反応につながりました。'; detail = '色を変えたり、別のブロックを足したり。次は、あなたのひらめきを。';
    } else if (selectedPort) {
      number = '01'; title = 'つなぎたいブロックの、左の ○ を押そう'; detail = '光っている入力端子に接続できます。Esc でキャンセル。';
    } else if (!graph.nodes.length) {
      number = '01'; title = '「ボタン」と「あかり」を追加してみよう'; detail = 'ブロック一覧の ＋ で、工房に置けます。';
    } else if (!graph.edges.length) {
      number = '01'; title = currentPreset === 'starter' ? 'ボタンの右の ○ → あかりの左の ○ を順に押そう' : '右の出力 ○ → 左の入力 ○ で、ブロックをつなごう'; detail = '端子を2回クリックするだけで、つながります。';
    } else {
      number = '02';
      title = { starter: 'つながった！ ボタンの「押す」を押してみよう', night: '明るさを 30 より小さくしてみよう', door: '「人が来た」を押して、半秒だけ待ってみよう', color: '「振る」を2回押してみよう' }[currentPreset] || '入力を動かして、つながった先の反応を見よう';
      detail = currentPreset === 'night' ? '条件を通ったときだけ、あかりまで信号が届きます。' : currentPreset === 'door' ? '音を聞くには「音 OFF」を押して ON に。反応は目でも見えます。' : '線に沿って、きっかけが伝わります。';
    }
    $('#lesson').classList.toggle('completed', completed);
    $('#lesson-number').textContent = number;
    $('#lesson-title').textContent = title;
    $('#lesson-detail').textContent = detail;
    $('#lesson-check').textContent = completed ? '✧' : '↗';
  }
  function selectPort(button) {
    const { port, node } = button.dataset;
    if (port === 'output') {
      selectedPort = selectedPort === node ? null : node;
    } else if (selectedPort) {
      const original = selectedPort;
      try {
        commit(Core.connect(graph, selectedPort, node));
        toast('つながりました。入力を動かしてみよう。');
        $(`#node-${original} [data-trigger]`)?.focus({ preventScroll: true });
      } catch (error) { toast(error.message); }
    } else toast('まず、右側の出力端子を押してください。');
    $$('.port').forEach(portElement => {
      const isSelected = portElement.dataset.port === 'output' && portElement.dataset.node === selectedPort;
      portElement.classList.toggle('selected', isSelected);
      portElement.setAttribute('aria-pressed', String(isSelected));
      let allowed = false;
      if (selectedPort && portElement.dataset.port === 'input') {
        try { Core.connect(graph, selectedPort, portElement.dataset.node); allowed = true; } catch (_) { /* Invalid targets remain unhighlighted. */ }
      }
      portElement.classList.toggle('can-connect', allowed);
    });
    updateLesson();
  }
  function addBlock(type) {
    const next = clone(graph);
    let id;
    do { id = `n-${++idCounter}`; } while (next.nodes.some(node => node.id === id));
    const viewport = $('#board-viewport');
    const { x, y } = vacantPosition(next.nodes);
    next.nodes.push(Core.createNode(type, id, x, y));
    try {
      commit(next);
      currentPreset = 'custom';
      updateLesson();
      const element = $(`#node-${id}`);
      viewport.scrollTo({ left: Math.max(0, x - 30), top: Math.max(0, y - 45), behavior: 'instant' });
      $('.node-drag', element).focus({ preventScroll: true });
      element.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
    } catch (error) { toast(error.message); }
  }
  function changeConfig(input) {
    const next = clone(graph);
    const node = next.nodes.find(item => item.id === input.dataset.node);
    if (!node) return;
    const key = input.dataset.config;
    node.config[key] = input.type === 'number' ? input.valueAsNumber : ['value', 'ms', 'every', 'note'].includes(key) ? Number(input.value) : input.value;
    try {
      if (node.type === 'brightness') {
        // Changing a simulated sensor is an input event, not an editor change.
        // Its persisted last value must not cancel delays or reset counters.
        graph = Core.validateGraph(next);
        save();
        $('#little-world').style.setProperty('--daylight', node.config.value / 100);
        trigger(node.id);
        return;
      }
      const selector = `[data-node="${node.id}"][data-config="${key}"]`;
      commit(next, { focus: selector });
    } catch (error) {
      toast(error.message);
      input.value = graph.nodes.find(item => item.id === node.id).config[key];
    }
  }
  async function unlockAudio() {
    if (!soundEnabled) return;
    try {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) throw new Error('unavailable');
      if (!audioContext) audioContext = new Audio();
      if (audioContext.state === 'suspended') await audioContext.resume();
    } catch (_) {
      soundEnabled = false;
      $('#sound-button').textContent = '音 OFF';
      $('#sound-button').setAttribute('aria-pressed', 'false');
      if (previewScene === 'sound') updateSceneFeedback();
      toast('このブラウザでは音を再生できません。反応は画面で見られます。');
    }
  }
  function playTone(frequency) {
    if (!soundEnabled || !audioContext || audioContext.state !== 'running') return;
    if (voices.size >= 8) return;
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = frequency;
    const now = audioContext.currentTime;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(.075, now + .015);
    gain.gain.exponentialRampToValueAtTime(.0001, now + .5);
    oscillator.connect(gain).connect(audioContext.destination);
    voices.add(oscillator);
    oscillator.onended = () => { voices.delete(oscillator); oscillator.disconnect(); gain.disconnect(); };
    oscillator.start(now);
    oscillator.stop(now + .52);
  }
  function trigger(id) {
    unlockAudio();
    const node = graph.nodes.find(item => item.id === id);
    if (!node) return;
    engine.trigger(id, node.type === 'brightness' ? node.config.value : true);
    if (!graph.edges.some(edge => edge.from === id)) {
      $('#preview-status').textContent = 'きっかけはできました。次は出力端子から線をつなごう。';
    }
  }
  function addLog(message) {
    eventNumber++;
    logs.unshift({ message, time: new Date().toLocaleTimeString('ja-JP', { hour12: false }) });
    logs = logs.slice(0, 4);
    $('#event-count').textContent = eventNumber;
    $('#event-list').replaceChildren();
    logs.forEach(log => {
      const item = makeElement('li');
      item.append(makeElement('span', 'log-time', log.time), makeElement('span', null, log.message));
      $('#event-list').append(item);
    });
  }
  function onEvent(event) {
    if (event.kind === 'error') { clearOutputs(false, true); toast(event.message); $('#preview-status').textContent = event.message; return; }
    if (event.kind === 'edge') {
      const path = $(`#wire-${event.edgeId}`);
      if (path) { path.classList.add('active'); later(() => path.classList.remove('active'), 700); }
      return;
    }
    const node = graph.nodes.find(item => item.id === event.nodeId);
    if (!node) return;
    const element = $(`#node-${node.id}`);
    if (event.kind === 'node') {
      element?.classList.add('active');
      later(() => element?.classList.remove('active'), 600);
      const label = META[node.type].label;
      if (node.type === 'counter') {
        const count = (uiCounts.get(node.id) || 0) + 1;
        uiCounts.set(node.id, count);
        $(`[data-count-for="${node.id}"]`).textContent = count % node.config.every;
        const fill = $('.counter-fill', element);
        if (fill) fill.style.width = `${(count % node.config.every) / node.config.every * 100}%`;
        element.dataset.signal = count % node.config.every ? 'counting' : 'passed';
        addLog(`${label}：${count % node.config.every || node.config.every} / ${node.config.every}`);
      } else if (node.type === 'threshold') {
        const passes = typeof event.value === 'number' && (node.config.operator === 'below' ? event.value < node.config.value : event.value > node.config.value);
        addLog(`条件：${passes ? '通りました' : 'ここで止まります'}`);
        setNodeState(node.id, passes ? '✓ 条件を通りました' : 'ここで止まっています', passes ? 'passed' : 'blocked');
        if (!passes) $('#preview-status').textContent = `条件を満たさず、ここで止まりました。${node.config.value} より${node.config.operator === 'below' ? '小さい' : '大きい'}数値を送ってみよう。`;
      } else if (node.type === 'delay') {
        addLog(`${node.config.ms} ms 待っています`);
        pendingVisualDelays.set(node.id, (pendingVisualDelays.get(node.id) || 0) + 1);
        setNodeState(node.id, `${node.config.ms} ms 待っています…`, 'waiting');
        later(() => {
          pendingVisualDelays.set(node.id, Math.max(0, (pendingVisualDelays.get(node.id) || 1) - 1));
          if (!pendingVisualDelays.get(node.id)) setNodeState(node.id, '✓ 信号を送りました', 'passed');
        }, node.config.ms);
      } else if (Core.TYPES[node.type].kind === 'source') {
        addLog(`${label} → ${node.type === 'brightness' ? event.value : 'きっかけが届きました'}`);
        setNodeState(node.id, '✓ きっかけを送りました', 'passed');
      }
      return;
    }
    if (event.kind === 'output') {
      setNodeState(node.id, {light:'✓ あかりがついた',sound:'✓ 音まで届いた',paint:'✓ ひといろ描けた'}[event.type], 'passed');
      completed = true;
      updateLesson();
      if (event.type === 'light') {
        element?.setAttribute('data-lit', 'true');
        $('#little-world').style.setProperty('--lamp-color', event.config.color);
        $('#little-world').classList.add('lit');
        addLog('あかり → 点灯しました');
      } else if (event.type === 'paint') {
        const dot = makeElement('i', 'paint-dot');
        dot.style.backgroundColor = event.config.color;
        const angle = paintNumber * 2.4;
        const radius = 10 + Math.sqrt(paintNumber % 36) * 4.6;
        const x = 48 + Math.cos(angle) * radius;
        const y = 43 + Math.sin(angle) * radius * .9;
        dot.style.left = `${x}%`; dot.style.top = `${y}%`;
        dot.dataset.x = x; dot.dataset.y = y; dot.dataset.color = event.config.color;
        $('#paint-dots').append(dot);
        if ($('#paint-dots').children.length > 36) $('#paint-dots').firstElementChild.remove();
        paintNumber++;
        $('#paint-paper').classList.add('has-paint');
        $('#save-artwork').disabled = false;
        addLog('色 → キャンバスに描きました');
      } else if (event.type === 'sound') {
        playTone(event.config.note);
        lastSoundFrequency = event.config.note;
        const note = {261.63:'C4',329.63:'E4',392:'G4',523.25:'C5',659.25:'E5'}[event.config.note] || '♪';
        $('#tone-note').textContent = note;
        $('#tone-frequency').textContent = `${event.config.note} Hz${soundEnabled ? '' : ' · 音 OFF'}`;
        $('#little-world').classList.add('sounding');
        later(() => $('#little-world').classList.remove('sounding'), 900);
        $('#sound-rings').classList.remove('ringing');
        void $('#sound-rings').offsetWidth;
        $('#sound-rings').classList.add('ringing');
        later(() => $('#sound-rings').classList.remove('ringing'), 900);
        addLog(`音 → ${event.config.note} Hz${soundEnabled ? '' : '（音 OFF）'}`);
      }
      chooseScene(event.type);
    }
  }
  function loadPreset(name) {
    currentPreset = name;
    commit(makePreset(name), { resetLesson: true });
    $('#board-viewport').scrollTo(0, 0);
    $('#workbench').scrollIntoView({ behavior: 'instant', block: 'start' });
    $('#workbench').focus({ preventScroll: true });
  }
  function vacantPosition(nodes) {
    // Search actual free rectangles, rather than piling overflow at a limit.
    for (let band = 0; band < 6; band++) {
      for (let row = 0; row < 16; row++) {
        for (let column = 0; column < 2; column++) {
          const x = 42 + (band * 2 + column) * 245;
          const y = 28 + row * 180;
          const occupied = nodes.some(node => x < node.x + 198 && x + 198 > node.x && y < node.y + 166 && y + 166 > node.y);
          if (!occupied) return { x, y };
        }
      }
    }
    return { x: 42, y: 28 }; // Unreachable for the 32-node graph limit.
  }
  function arrange() {
    const next = clone(graph);
    const layers = new Map(next.nodes.map(node => [node.id, 0]));
    for (let pass = 0; pass < next.nodes.length; pass++) {
      next.edges.forEach(edge => layers.set(edge.to, Math.max(layers.get(edge.to), layers.get(edge.from) + 1)));
    }
    const ordered = [...next.nodes].sort((a, b) => layers.get(a.id) - layers.get(b.id));
    const columns = compact() ? (next.nodes.length > 16 ? 2 : 1) : Math.max(2, Math.min(4, Math.floor($('#board-viewport').clientWidth / 240)));
    ordered.forEach((node, index) => {
      node.x = 42 + (index % columns) * 245 + (compact() && columns === 1 ? index % 2 * 70 : 0);
      node.y = 28 + Math.floor(index / columns) * 180;
    });
    commit(next);
    $('#board-viewport').scrollTo(0, 0);
  }
  function encodeRecipe(recipe) {
    const bytes = new TextEncoder().encode(JSON.stringify(recipe));
    let binary = '';
    bytes.forEach(byte => { binary += String.fromCharCode(byte); });
    return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
  }
  function decodeRecipe(hash) {
    if (hash.length > 140000 || !/^#recipe=[A-Za-z0-9_-]+$/.test(hash)) throw new Error('共有リンクの形式が正しくありません。');
    const raw = atob(hash.slice(8).replaceAll('-', '+').replaceAll('_', '/'));
    return Core.parse(new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(raw, char => char.charCodeAt(0))));
  }
  function showShare() {
    if (location.protocol === 'file:') {
      $('#file-dialog').showModal();
      $('#file-error').textContent = 'ファイルを直接開いているため、JSON を保存して共有してください。Web 公開後はリンクで共有できます。';
      return;
    }
    const url = new URL(location.href);
    url.search = '';
    url.hash = `recipe=${encodeRecipe(graph)}`;
    $('#share-url').value = url.href;
    $('#share-description').textContent = ['localhost', '127.0.0.1'].includes(url.hostname) ? 'ローカルプレビュー用のリンクです。他の人に渡すリンクは、Web に公開してから作れます。' : 'このリンクにレシピが入っています。開いた人も、そのまま遊べます。';
    $('#share-dialog').showModal();
    $('#share-url').select();
  }
  function startDragging(event) {
    const handle = event.target.closest('[data-drag]');
    if (!handle || event.button !== 0 || dragging || !event.isPrimary) return;
    const node = graph.nodes.find(item => item.id === handle.dataset.drag);
    handle.setPointerCapture(event.pointerId);
    dragging = { id: node.id, handle, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, x: node.x, y: node.y, before: Core.serialize(graph), moved: false };
  }
  function moveDragging(event) {
    if (!dragging || event.pointerId !== dragging.pointerId) return;
    const dx = event.clientX - dragging.startX;
    const dy = event.clientY - dragging.startY;
    if (Math.abs(dx) + Math.abs(dy) < 4 && !dragging.moved) return;
    dragging.moved = true;
    const node = graph.nodes.find(item => item.id === dragging.id);
    node.x = Math.max(24, Math.min(3000, dragging.x + dx));
    node.y = Math.max(12, Math.min(3000, dragging.y + dy));
    const element = $(`#node-${node.id}`);
    element.style.left = `${node.x}px`;
    element.style.top = `${node.y}px`;
    element.classList.add('dragging');
    drawWires();
  }
  function finishDragging() {
    if (!dragging) return;
    const { moved, before, id } = dragging;
    dragging = null;
    $(`#node-${id}`)?.classList.remove('dragging');
    if (moved) {
      rememberEdit(before);
      engine.setGraph(graph);
      clearOutputs(false, true);
      $('#undo-button').disabled = false;
      save();
    }
  }
  document.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.dataset.filter) filterPalette(button.dataset.filter);
    else if (button.dataset.scene) chooseScene(button.dataset.scene);
    else if (button.dataset.color) {
      const next = clone(graph); next.nodes.find(node => node.id === button.dataset.node).config.color = button.dataset.color;
      commit(next, { focus: `[data-node="${button.dataset.node}"][data-color="${button.dataset.color}"]` });
    }
    else if (button.dataset.port) selectPort(button);
    else if (button.dataset.add) addBlock(button.dataset.add);
    else if (button.dataset.trigger) trigger(button.dataset.trigger);
    else if (button.dataset.remove) {
      const id = button.dataset.remove;
      const next = clone(graph);
      next.nodes = next.nodes.filter(node => node.id !== id);
      next.edges = next.edges.filter(edge => edge.from !== id && edge.to !== id);
      currentPreset = 'custom';
      commit(next);
      $('#undo-button').focus({ preventScroll: true });
    } else if (button.dataset.removeEdge) {
      const next = clone(graph);
      next.edges = next.edges.filter(edge => edge.id !== button.dataset.removeEdge);
      commit(next);
      $('.connections summary').focus({ preventScroll: true });
    } else if (button.dataset.preset) loadPreset(button.dataset.preset);
    else if (button.classList.contains('close-dialog')) button.closest('dialog').close();
  });
  $('#nodes').addEventListener('change', event => { if (event.target.dataset.config) changeConfig(event.target); });
  $('#nodes').addEventListener('input', event => {
    const input = event.target;
    if (input.type === 'range') {
      const output = $(`[data-value-for="${input.dataset.node}"]`);
      output.replaceChildren(document.createTextNode(input.value), makeElement('span', null, ' / 100'));
    }
  });
  $('#nodes').addEventListener('pointerdown', startDragging);
  $('#nodes').addEventListener('pointermove', moveDragging);
  $('#nodes').addEventListener('pointerup', finishDragging);
  $('#nodes').addEventListener('pointercancel', finishDragging);
  document.addEventListener('keydown', event => {
    if (event.isComposing || event.keyCode === 229 || $('dialog[open]') || dragging) return;
    const editingText = event.target.matches('input,textarea,select,[contenteditable="true"]');
    if ((event.metaKey || event.ctrlKey) && !editingText && !event.altKey && event.key.toLowerCase() === 'z') {
      event.preventDefault(); if (event.shiftKey) redo(); else undo(); return;
    }
    if (event.key === 'Escape') {
      selectedPort = null;
      $$('.port').forEach(port => { port.classList.remove('selected', 'can-connect'); port.setAttribute('aria-pressed', 'false'); });
      updateLesson();
    }
    const id = event.target.dataset.drag;
    const delta = { ArrowLeft: [-12, 0], ArrowRight: [12, 0], ArrowUp: [0, -12], ArrowDown: [0, 12] }[event.key];
    if (id && delta) {
      event.preventDefault();
      const next = clone(graph);
      const node = next.nodes.find(item => item.id === id);
      node.x = Math.min(3000, Math.max(24, node.x + delta[0]));
      node.y = Math.min(3000, Math.max(12, node.y + delta[1]));
      commit(next, { focus: `[data-drag="${id}"]` });
    }
  });
  $('#undo-button').addEventListener('click', undo);
  $('#redo-button').addEventListener('click', redo);
  $('#restart-button').addEventListener('click', () => loadPreset('starter'));
  $('#arrange-button').addEventListener('click', arrange);
  $('#save-artwork').addEventListener('click', exportArtwork);
  $('#new-button').addEventListener('click', () => {
    currentPreset = 'custom';
    commit({ version: 1, title: 'わたしのひらめき', nodes: [], edges: [] }, { resetLesson: true });
    filterPalette('all');
    $('#workbench').scrollIntoView({ behavior: 'instant', block: 'start' });
    $('#workbench').focus({ preventScroll: true });
  });
  $('#recipe-title').addEventListener('click', () => {
    $('#title-input').value = graph.title; $('#rename-error').textContent = ''; $('#rename-dialog').showModal(); $('#title-input').select();
  });
  function renameRecipe() {
    try {
      const next = Core.validateGraph({ ...graph, title: $('#title-input').value });
      if (next.title !== graph.title) { rememberEdit(); graph = next; $('#recipe-title').textContent = graph.title; $('#recipe-title').setAttribute('aria-label', `${graph.title}：作品名を変更`); save(); }
      $('#rename-dialog').close(); $('#recipe-title').focus({ preventScroll: true });
    } catch (error) { $('#rename-error').textContent = error.message; }
  }
  $('#rename-save').addEventListener('click', renameRecipe);
  $('#title-input').addEventListener('keydown', event => { if (event.key === 'Enter' && !event.isComposing && event.keyCode !== 229) { event.preventDefault(); renameRecipe(); } });
  $('#clear-button').addEventListener('click', () => { clearOutputs(); toast('光・音・色と、待ち時間・カウントをリセットしました。'); });
  $('#sound-button').addEventListener('click', async () => {
    soundEnabled = !soundEnabled;
    $('#sound-button').setAttribute('aria-pressed', String(soundEnabled));
    $('#sound-button').textContent = soundEnabled ? '音 ON' : '音 OFF';
    if (soundEnabled) await unlockAudio();
    else voices.forEach(voice => { try { voice.stop(); } catch (_) { /* Already ended. */ } });
    if (previewScene === 'sound') updateSceneFeedback();
  });
  ['#about-button', '#footer-about'].forEach(selector => $(selector).addEventListener('click', () => $('#about-dialog').showModal()));
  $('#file-button').addEventListener('click', () => { $('#file-error').textContent = ''; $('#file-dialog').showModal(); });
  $('#share-button').addEventListener('click', showShare);
  $('#copy-button').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText($('#share-url').value);
      toast('リンクをコピーしました。');
      $('#share-dialog').close();
    } catch (_) { $('#share-url').select(); toast('リンクを選択しました。ブラウザのコピー操作でコピーしてください。'); }
  });
  $('#export-button').addEventListener('click', () => {
    const blob = new Blob([Core.serialize(graph) + '\n'], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = makeElement('a');
    anchor.href = url;
    anchor.download = 'patchlight-recipe.json';
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    $('#file-dialog').close();
    toast('レシピを JSON に書き出しました。');
  });
  $('#import-input').addEventListener('change', async event => {
    const file = event.target.files[0];
    if (!file) return;
    try {
      if (file.size > Core.LIMITS.fileBytes) throw new Error('作品ファイルは100KBまでです。');
      const imported = Core.parse(await file.text());
      currentPreset = 'custom';
      commit(imported, { resetLesson: true });
      $('#board-viewport').scrollTo(0, 0);
      $('#file-dialog').close();
      toast('レシピを開きました。');
    } catch (error) { $('#file-error').textContent = error.message; }
    event.target.value = '';
  });
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(drawWires, 100);
  });
  window.addEventListener('hashchange', () => {
    if (!location.hash.startsWith('#recipe=')) return;
    try { currentPreset = 'custom'; commit(decodeRecipe(location.hash), { resetLesson: true }); }
    catch (error) { toast(`リンクを開けませんでした。${error.message}`); }
  });
  window.addEventListener('pagehide', () => { engine.dispose(); clearOutputs(false); audioContext?.close(); });
  window.addEventListener('pageshow', event => { if (event.persisted) { engine = Core.createEngine(graph, { onEvent }); audioContext = undefined; } });

  let loadError = '';
  let storageRecoveryFailed = false;
  if (location.hash.startsWith('#recipe=')) {
    try { graph = decodeRecipe(location.hash); currentPreset = 'custom'; }
    catch (error) { loadError = `共有レシピを開けませんでした。${error.message}`; }
  }
  const example = new URLSearchParams(location.search).get('example');
  if (!graph && ['starter', 'night', 'door', 'color'].includes(example)) { currentPreset = example; graph = makePreset(example); }
  if (!graph) {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) { graph = Core.parse(stored); currentPreset = 'custom'; }
    } catch (_) { storageRecoveryFailed = true; loadError = '保存済みのレシピを開けませんでした。保存データを保持して、最初の工房を表示します。'; }
  }
  if (!graph) { currentPreset = 'starter'; graph = makePreset('starter'); }
  engine = Core.createEngine(graph, { onEvent });
  renderPalette();
  render();
  clearOutputs(false);
  if (example && example !== 'starter') requestAnimationFrame(() => $('#workbench').scrollIntoView({ behavior: 'instant', block: 'start' }));
  if (loadError) toast(loadError);
  if (!storageRecoveryFailed) save();
  else $('#save-status').textContent = '保存データを復元できません';
})();
