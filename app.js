/* 六边形2048 — 界面与交互（原创实现） */
(function () {
  'use strict';
  const L = window.HexLogic;
  const $ = (id) => document.getElementById(id);
  const SQ3 = Math.sqrt(3);
  const LS = 'hex2048:';
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const MODES = {
    four: { name: '四连合成', desc: '放置随机数字块，4 个及以上相同数字相连 → 合成为 4 倍（1→4→16→64…，2→8→32→128…），可连锁。', tip: '拖动数字块到棋盘（或直接点空格放置）' },
    three: { name: '三消合成', desc: '单格/双格棋子（点一下可旋转），3 个相同相连 → 翻倍，连消时 2 个即可；合成 2048 会爆炸清除周围一圈。', tip: '拖动棋子到棋盘 · 点棋子旋转' },
    move: { name: '经典移动', desc: '原版玩法：点选棋盘上的数字块，再点空格沿通路移动过去；4 个及以上相同相连 → 4 倍。没合成时，上方「即将出现」的 5 个数字会落到随机空格。', tip: '点选数字块，再点空格移动' },
    slide: { name: '六向滑动', desc: '经典 2048 的六边形版：向 6 个方向滑动，所有块一起移动，两个相同相撞 → 翻倍。', tip: '在棋盘上向 6 个方向滑动' },
  };
  const DEFAULT_SIZE = { four: 3, three: 3, move: 'rect', slide: 2 };
  const SIZES = { move: [['rect', '原版·40格'], [3, '37格'], [4, '61格']], other: [[2, '小·19格'], [3, '中·37格'], [4, '大·61格']] };
  const MODE_ORDER = ['move', 'four', 'three', 'slide'];
  const RULES = {
    four: ['每回合得到一个随机数字块（下方显示接下来的块）。', '把它放到任意空格。', '<b>4 个或更多</b>相同数字相连时，合成为 <b>4 倍</b>，出现在最后放下的位置：四个 1 → 4，四个 2 → 8，四个 4 → 16，四个 8 → 32 …', '合成后的新数字若又凑够 4 个相连，会继续连锁合成，分数按连击倍增。', '道具（无限次，均可撤销）：🎲 换数字 —— 更换即将出现的数字；⚡ 强制合成 —— 点选一组相连的相同数字（≥2 个）直接合成；🔨 清除一格；💥 随机清除 5 格；🧹 清除同类 —— 点一个数字，清除棋盘上所有相同数字；↶ 撤销 —— 最多连续撤销 50 步。', '棋盘放满（无处可放）即游戏结束。'],
    three: ['把下方棋子拖到棋盘空位，双格棋子点一下可旋转。', '3 个或以上相同数字相连 → 合成为 2 倍；连消时只需 2 个相同。', '合成出 2048 会爆炸，清除它周围一圈。', '没有位置能放下当前棋子时游戏结束。'],
    move: ['棋盘上已有数字块。点选一个数字块（高亮，可到达的空格会亮起），再点一个空格：只要有空格连成的通路就能移动过去，被挡住则「过不去」，不算一步。', '移动后若有 <b>4 个或更多</b>相同数字相连，合成为 <b>4 倍</b>（四个 1 → 4，四个 2 → 8，四个 4 → 16，四个 8 → 32 …），出现在移动到的位置，可连锁。', '这一步<b>没有合成</b>：上方「即将出现」的 5 个数字会落到随机空格；有合成则不落新块。', '新数字随进度变大：开始以 1、2 为主，最大不超过棋盘最大块的 1/4。', '道具全部无限次：🎲 换数字、⚡ 强制合成、🔨 清除一格、💥 随机清5、🧹 清除同类、↶ 撤销（最多 50 步）。', '棋盘满了游戏结束。'],
    slide: ['向 6 个方向滑动（键盘 Q/W/E/A/S/D/Z/C 或方向键）。', '相同数字相撞合成为 2 倍，每块每步只合成一次。', '每次有效滑动后随机出现一个 2 或 4。', '六个方向都动不了时游戏结束。'],
  };
  const PALETTE = ['#5ec8ff', '#ffbf2e', '#33d69f', '#ff7f3f', '#5576ff', '#ff4f8b', '#a35cff', '#19c9bf', '#ff4545', '#9fd63a', '#ff8fd8', '#6f55ff', '#ffd400', '#00d0ff', '#e9e6ff', '#ff6a00'];
  const colorOf = (v) => PALETTE[Math.round(Math.log2(v)) % PALETTE.length];

  // ---------------- settings & state ----------------
  const settings = Object.assign({ mode: 'move', sizes: {}, sound: true, vibe: true }, readJSON(LS + 'settings') || {});
  if (!(settings.ver >= 2)) { settings.ver = 2; settings.mode = 'move'; delete settings.sizes.move; } // v2：默认改为原版移动玩法
  if (!L.PRESETS[settings.mode]) settings.mode = 'move';
  function readJSON(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
  function writeJSON(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 存储已满或隐私模式 */ } }
  const saveSettings = () => writeJSON(LS + 'settings', settings);
  const radius = () => settings.sizes[settings.mode] || DEFAULT_SIZE[settings.mode];
  const slotKey = () => settings.mode + ':' + radius();
  const cfg = () => Object.assign({}, L.PRESETS[settings.mode], { radius: radius() });

  let G = null;          // 当前对局
  let busy = false;      // 动画中
  let geo = { s: 30, w: 0, h: 0 };
  const els = new Map(); // tile id -> element
  const cellEls = new Map();

  function serialize(withSnap = true) {
    return { v: 1, board: G.board.toJSON(), queue: G.queue, score: G.score, items: G.items, merges: G.merges,
      hist: withSnap ? G.hist : [], over: G.over, moves: G.moves };
  }
  function save() { writeJSON(LS + 'state:' + slotKey(), serialize()); updateBest(); }
  function bestOf() { return +(localStorage.getItem(LS + 'best:' + slotKey()) || 0); }
  function updateBest() {
    if (G.score > bestOf()) { try { localStorage.setItem(LS + 'best:' + slotKey(), G.score); } catch (e) {} }
    $('best').textContent = bestOf();
  }
  function fromData(d) {
    const c = cfg(); const b = new L.Board(c.radius); b.load(d.board || {});
    return { board: b, queue: d.queue || [], score: d.score || 0, items: Object.assign({ reroll: 0, force: 0 }, d.items), merges: d.merges || 0,
      hist: Array.isArray(d.hist) ? d.hist.slice(-HIST_MAX) : (d.undoSnap ? [d.undoSnap] : []), over: !!d.over, moves: d.moves || 0, sel: null, tool: null };
  }
  function newGame() {
    const c = cfg(); const b = new L.Board(c.radius);
    G = { board: b, queue: [], score: 0, items: Object.assign({}, c.items), merges: 0, hist: [], over: false, moves: 0, sel: null, tool: null };
    if (c.kind === 'place') {
      for (let i = 0; i < c.queue; i++) G.queue.push(L.randomPiece(b, c));
      // 开局随机放 3 个小数字（互不成组）
      for (let i = 0; i < 3; i++) { const e = b.empty(); const k = e[Math.floor(Math.random() * e.length)]; b.t[k] = L.newTile(c.spawn[i % 2][0]); }
    } else if (c.kind === 'move') {
      for (let i = 0; i < c.startTiles; i++) { const e = b.empty(); const k = e[Math.floor(Math.random() * e.length)]; b.t[k] = L.newTile(L.nextValue(b, c)); }
      L.resolve(b, Object.keys(b.t), c); // 避免开局就有 4 连
      L.fillQueue(b, G.queue, c);
    } else { L.spawn(b, c); L.spawn(b, c); }
    save();
  }
  function loadOrNew() {
    const d = readJSON(LS + 'state:' + slotKey());
    let ok = false;
    try {
      if (d && d.v === 1) {
        G = fromData(d); const c = cfg(); ok = true;
        if (c.kind === 'place') { if (!G.queue.length || typeof G.queue[0] !== 'object') ok = false; else while (G.queue.length < c.queue) G.queue.push(L.randomPiece(G.board, c)); }
        if (c.kind === 'move') { G.queue = G.queue.filter((v) => typeof v === 'number'); L.fillQueue(G.board, G.queue, c); }
        if (!G.board.cells.length) ok = false;
      }
    } catch (e) { ok = false; } // 旧存档损坏 → 新开一局
    if (!ok) newGame();
  }
  const HIST_MAX = 50; // 撤销历史最多 50 步（随自动存档一起保存）
  function pushHist(snap) { G.hist.push(snap); if (G.hist.length > HIST_MAX) G.hist.splice(0, G.hist.length - HIST_MAX); }
  function snapshot() { pushHist(JSON.parse(JSON.stringify(serialize(false)))); }

  // ---------------- geometry ----------------
  // 轴坐标 → 像素偏移；flat=平顶（竖屏更大），否则尖顶（横屏更大）
  // sy：竖向拉伸系数（≤1.18），让棋盘在宽度受限时也能填满高度
  function axialPx(q, r, s, flat, sy = geo.sy || 1, sx = geo.sx || 1) { return flat ? { x: sx * s * 1.5 * q, y: sy * s * SQ3 * (r + q / 2) } : { x: sx * s * SQ3 * (q + r / 2), y: sy * s * 1.5 * r }; }
  function cellPos(k) { const { q, r } = L.parse(k); const p = axialPx(q, r, geo.s, geo.flat); return { x: geo.ox + p.x, y: geo.oy + p.y }; }
  const SY_MAX = 1, SX_MAX = 1; // 始终保持正六边形（不做非等比拉伸）
  function computeGeo() {
    const st = $('stage').getBoundingClientRect();
    const W = st.width * BOARD_FIT, H = st.height * BOARD_FIT;
    const bounds = (flat) => { // 以 s=1 计算棋盘外接框
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity; const hw = flat ? 1 : SQ3 / 2, hh = flat ? SQ3 / 2 : 1;
      for (const c of G.board.cells) { const p = axialPx(c.q, c.r, 1, flat, 1, 1); x0 = Math.min(x0, p.x - hw); x1 = Math.max(x1, p.x + hw); y0 = Math.min(y0, p.y - hh); y1 = Math.max(y1, p.y + hh); }
      return { x0, y0, w: x1 - x0, h: y1 - y0 + 0.08 };
    };
    const bf = bounds(true), bp = bounds(false);
    const sFlat = Math.min(W / bf.w, H / bf.h), sPointy = G.board.rect ? 0 : Math.min(W / bp.w, H / bp.h); // 矩形棋盘固定平顶
    const flat = sFlat >= sPointy; const bb = flat ? bf : bp; const s = Math.max(8, flat ? sFlat : sPointy);
    geo = { s, flat, w: bb.w * s, h: bb.h * s };
    geo.sy = Math.max(1, Math.min(SY_MAX, H / geo.h)); geo.h *= geo.sy;
    geo.sx = Math.max(1, Math.min(SX_MAX, W / geo.w)); geo.w *= geo.sx; // 高度受限时横向适度拉伸
    geo.ox = -bb.x0 * s * geo.sx; geo.oy = (-bb.y0 + 0.04) * s * geo.sy;
    document.body.classList.toggle('flat', flat);
    return st;
  }
  function layout() {
    // 竖屏时棋盘受宽度限制：把多余的竖向空间分给托盘（更大的拖拽块），减少棋盘上下空白
    const root = document.documentElement.style; root.setProperty('--trayH', '');
    renderTray(); // 先切换好托盘/队列的显示，再测量舞台尺寸
    const st = computeGeo(); const portrait = getComputedStyle($('app')).display !== 'grid';
    const isPlace = cfg().kind === 'place';
    if (!portrait && isPlace) { root.setProperty('--trayH', '130px'); computeGeo(); }
    // 竖屏：托盘保持紧凑，多余高度全部交给棋盘（竖向拉伸）
    const bd = $('board'); bd.style.width = geo.w + 'px'; bd.style.height = geo.h + 'px';
    buildCells(); els.forEach((e) => e.remove()); els.clear(); syncTiles(); renderTray();
  }
  const TILE_SCALE = 0.86, CELL_SCALE = 0.88, BOARD_FIT = 0.92; // 方块占格子 86%（留缝）；棋盘占可用区域 92%（留边）
  function hexSize(scale = TILE_SCALE, s = geo.s) { const sy = geo.sy || 1, sx = geo.sx || 1; return geo.flat ? { w: sx * 2 * s * scale, h: sy * SQ3 * s * scale } : { w: sx * SQ3 * s * scale, h: sy * 2 * s * scale }; }
  function buildCells() {
    const L1 = $('cellsLayer'); L1.innerHTML = ''; cellEls.clear();
    const { w, h } = hexSize(CELL_SCALE);
    for (const c of G.board.cells) {
      const d = document.createElement('div'); d.className = 'cell'; d.dataset.k = c.k;
      const p = cellPos(c.k); d.style.width = w + 'px'; d.style.height = h + 'px';
      d.style.transform = `translate(${p.x - w / 2}px,${p.y - h / 2}px)`; L1.appendChild(d); cellEls.set(c.k, d);
    }
  }
  // 数字字号：1–2 位约为方块高度的 40%，位数越多越小，且保证在宽度内留白
  function fontFor(v, w, h, k = 1) {
    const n = String(v).length;
    const byH = h * [0, 0.41, 0.39, 0.31, 0.25, 0.2, 0.17][Math.min(n, 6)];
    const byW = (w * 0.66) / (n * 0.6); // 内切宽度约 66%（留边距），数字宽约 0.6em
    return Math.max(6, Math.min(byH, byW) * k);
  }
  function hexFace(v, w, h, s, k) {
    const col = colorOf(v);
    return `<div class="inner"><div class="hex base" style="background:${col}"></div><div class="hex face" style="background:${col};font-size:${fontFor(v, w, h, k)}px"><span class="num">${v}</span></div></div>`;
  }
  function makeTile(t, k, anim) {
    const { w, h } = hexSize(); const d = document.createElement('div');
    d.className = 'tile' + (anim ? ' ' + anim : ''); d.dataset.id = t.id; d.dataset.k = k;
    d.style.width = w + 'px'; d.style.height = h + 'px'; d.innerHTML = hexFace(t.v, w, h, geo.s);
    setTilePos(d, k, true); $('tilesLayer').appendChild(d); els.set(t.id, d); return d;
  }
  function setTilePos(d, k, instant) {
    const { w, h } = hexSize(); const p = cellPos(k); d.dataset.k = k;
    if (instant) d.style.transition = 'none';
    d.style.transform = `translate(${p.x - w / 2}px,${p.y - h / 2}px)`;
    if (instant) { void d.offsetWidth; d.style.transition = ''; }
  }
  function syncTiles() {
    const live = new Set();
    for (const k in G.board.t) {
      const t = G.board.t[k]; live.add(t.id);
      const e = els.get(t.id); if (!e) makeTile(t, k); else if (e.dataset.k !== k) setTilePos(e, k);
    }
    els.forEach((e, id) => { if (!live.has(id)) { e.remove(); els.delete(id); } });
    markPickable();
  }

  // ---------------- tray / pieces ----------------
  function pieceEl(piece, s, k) {
    const offs = L.pieceOffsets(piece).map((o) => axialPx(o.q, o.r, s, geo.flat));
    const mx = offs.reduce((a, o) => a + o.x, 0) / offs.length, my = offs.reduce((a, o) => a + o.y, 0) / offs.length;
    const { w, h } = hexSize(TILE_SCALE, s);
    const W = Math.max(...offs.map((o) => Math.abs(o.x - mx))) * 2 + w, H = Math.max(...offs.map((o) => Math.abs(o.y - my))) * 2 + h;
    const box = document.createElement('div'); box.className = 'piece'; box.style.width = W + 'px'; box.style.height = H + 'px';
    offs.forEach((o, i) => {
      const d = document.createElement('div'); d.className = 'tile'; d.style.width = w + 'px'; d.style.height = h + 'px';
      d.style.transform = `translate(${o.x - mx + W / 2 - w / 2}px,${o.y - my + H / 2 - h / 2}px)`;
      d.innerHTML = hexFace(piece.values[i], w, h, s, k); box.appendChild(d);
    });
    return { box, W, H, mid: { x: mx, y: my }, offs };
  }
  function placeInSlot(slot, piece, s, k) {
    slot.innerHTML = ''; if (!piece) return;
    const p = pieceEl(piece, s, k); p.box.style.left = (slot.clientWidth - p.W) / 2 + 'px'; p.box.style.top = (slot.clientHeight - p.H) / 2 + 'px';
    slot.appendChild(p.box);
  }
  function renderTray() {
    const c = cfg(); const isPlace = c.kind === 'place', isMove = c.kind === 'move';
    $('trayWrap').classList.toggle('hidden', !isPlace);
    $('queueBar').classList.toggle('hidden', !isMove);
    $('trayTip').textContent = MODES[settings.mode].tip;
    $('btnReroll').classList.toggle('hidden', !isPlace && !isMove);
    $('btnForce').classList.toggle('hidden', c.kind === 'slide');
    ['btnReroll', 'btnForce', 'btnClear1', 'btnClear5', 'btnClearType'].forEach((id) => { $(id).disabled = busy; }); // 道具无限次
    $('btnUndo').disabled = !G.hist.length || busy;
    $('btnForce').classList.toggle('active', G.tool === 'force');
    $('btnClear1').classList.toggle('active', G.tool === 'clear1');
    $('btnClearType').classList.toggle('active', G.tool === 'clearType');
    $('modeChip').textContent = MODES[settings.mode].name + ' ▾';
    $('score').textContent = G.score; $('best').textContent = bestOf();
    $('iSound').textContent = settings.sound ? '🔊' : '🔇';
    $('tools').style.gridTemplateColumns = `repeat(${[...$('tools').children].filter((b) => !b.classList.contains('hidden')).length},1fr)`;
    if (isMove) { // 顶部「即将出现」队列
      const row = $('qRow'); row.innerHTML = '';
      G.queue.forEach((v, i) => { const d = document.createElement('div'); d.className = 'slot' + (i === 0 ? ' first' : ''); row.appendChild(d); placeInSlot(d, { values: [v], orient: 0 }, Math.min(d.clientWidth / (geo.flat ? 2.1 : 1.85), d.clientHeight / (geo.flat ? 1.7 : 1.95)), 1.25); /* 队列：同样的方块比例，字号≈块高 50% */ });
      return;
    }
    if (!isPlace) return;
    const cur = $('current'); const s0 = Math.min(geo.s, cur.clientHeight / 2.4, cur.clientWidth / (G.queue[0] && G.queue[0].values.length > 1 ? 4.4 : 2.2), 50);
    placeInSlot(cur, G.queue[0], s0);
    const nl = $('nextList'); nl.innerHTML = '';
    G.queue.slice(1).forEach((p) => { const d = document.createElement('div'); d.className = 'slot'; nl.appendChild(d); placeInSlot(d, p, Math.min(26, d.clientWidth / (p.values.length > 1 ? 3.6 : 1.85), d.clientHeight / 2.1)); });
  }

  // ---------------- audio & haptics ----------------
  let AC = null;
  function ac() { if (!AC) { const C = window.AudioContext || window.webkitAudioContext; if (C) AC = new C(); } if (AC && AC.state === 'suspended') AC.resume(); return AC; }
  function tone(f, dur, type = 'sine', vol = 0.15, f2, delay = 0) {
    if (!settings.sound) return; const a = ac(); if (!a) return;
    const t0 = a.currentTime + delay; const o = a.createOscillator(); const g = a.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t0); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(a.destination); o.start(t0); o.stop(t0 + dur + 0.02);
  }
  function noise(dur = 0.4, vol = 0.3) {
    if (!settings.sound) return; const a = ac(); if (!a) return;
    const buf = a.createBuffer(1, a.sampleRate * dur, a.sampleRate); const ch = buf.getChannelData(0);
    for (let i = 0; i < ch.length; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / ch.length, 2);
    const src = a.createBufferSource(); const g = a.createGain(); const fl = a.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = 900;
    src.buffer = buf; g.gain.value = vol; src.connect(fl).connect(g).connect(a.destination); src.start();
  }
  const SFX = {
    place: () => tone(660, 0.07, 'triangle', 0.12, 520),
    merge: (n) => { const base = 440 * Math.pow(2, Math.min(n - 1, 8) / 6); tone(base, 0.12, 'triangle', 0.14); tone(base * 1.5, 0.16, 'sine', 0.12, null, 0.07); tone(base * 2, 0.22, 'sine', 0.08, null, 0.14); },
    boom: () => { noise(0.5, 0.35); tone(120, 0.4, 'sawtooth', 0.12, 40); },
    bad: () => tone(160, 0.12, 'square', 0.06, 120),
    rotate: () => tone(880, 0.05, 'sine', 0.08),
    pop: () => { tone(300, 0.12, 'triangle', 0.12, 900); noise(0.12, 0.12); },
    item: () => { tone(700, 0.1, 'sine', 0.1); tone(1050, 0.18, 'sine', 0.1, null, 0.08); },
    over: () => { tone(440, 0.25, 'triangle', 0.12, 330); tone(330, 0.4, 'triangle', 0.12, 200, 0.22); },
  };
  function vibe(p) { if (settings.vibe && navigator.vibrate) try { navigator.vibrate(p); } catch (e) {} }

  // ---------------- effects ----------------
  function fxAt(k) { return cellPos(k); }
  function sparks(k, color, n = 10) {
    const p = fxAt(k); const fx = $('fxLayer');
    for (let i = 0; i < n; i++) {
      const d = document.createElement('div'); d.className = 'spark'; const a = Math.random() * Math.PI * 2, r = geo.s * (1.2 + Math.random() * 1.4);
      const sz = geo.s * (0.22 + Math.random() * 0.2);
      d.style.cssText = `left:${p.x - sz / 2}px;top:${p.y - sz / 2}px;width:${sz}px;height:${sz * 1.15}px;background:${color};--dx:${Math.cos(a) * r}px;--dy:${Math.sin(a) * r}px`;
      fx.appendChild(d); setTimeout(() => d.remove(), 650);
    }
  }
  function floatText(k, txt) {
    const p = fxAt(k); const d = document.createElement('div'); d.className = 'floatTxt'; d.textContent = txt;
    d.style.left = p.x + 'px'; d.style.top = p.y + 'px'; d.style.fontSize = Math.max(14, geo.s * 0.6) + 'px'; $('fxLayer').appendChild(d); setTimeout(() => d.remove(), 950);
  }
  function ring(k, scale = 3) {
    const p = fxAt(k); const d = document.createElement('div'); d.className = 'ring'; const r = geo.s * scale;
    d.style.cssText = `left:${p.x - r}px;top:${p.y - r}px;width:${2 * r}px;height:${2 * r}px`; $('fxLayer').appendChild(d); setTimeout(() => d.remove(), 520);
  }
  function comboText(n) { const d = document.createElement('div'); d.className = 'combo'; d.textContent = `连击 ×${n}!`; $('stage').appendChild(d); setTimeout(() => d.remove(), 950); }
  let toastT = 0;
  function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 1600); }
  function hint(msg) { $('hintText').textContent = msg || ''; }
  let shown = 0;
  function showScore() { const el = $('score'); el.textContent = shown; el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }

  async function playSteps(steps) {
    for (const st of steps) {
      if (st.type === 'place') {
        for (const c of st.cells) { const e = els.get(c.id); if (e) e.remove(); makeTile({ id: c.id, v: c.v }, c.k, 'pop'); }
        SFX.place(); vibe(8); await sleep(130);
      } else if (st.type === 'merge') {
        for (const f of st.from) { const e = els.get(f.id); if (e) { setTilePos(e, st.to); e.classList.add('dying'); setTimeout(() => e.remove(), 200); els.delete(f.id); } }
        await sleep(150);
        const old = els.get(st.oldId); if (old) { old.remove(); els.delete(st.oldId); }
        makeTile({ id: st.newId, v: st.v }, st.to, 'bump');
        sparks(st.to, colorOf(st.v), 8 + Math.min(st.from.length * 2, 10));
        floatText(st.to, '+' + st.gain); if (st.combo >= 2) comboText(st.combo);
        SFX.merge(st.combo); vibe(st.combo >= 2 ? [15, 40, 25] : 18);
        shown += st.gain; showScore(); await sleep(200);
      } else if (st.type === 'clear') {
        for (const c of st.cells) {
          const e = els.get(c.id); if (e) { e.classList.add('dying'); setTimeout(() => e.remove(), 200); els.delete(c.id); }
          sparks(c.k, colorOf(c.v), 8); ring(c.k, 1.2); SFX.pop(); vibe(12);
          if (st.stagger) await sleep(st.stagger);
        }
        await sleep(220);
      } else if (st.type === 'explode') {
        ring(st.center, 3.2); ring(st.center, 1.8);
        for (const c of st.cleared) { const e = els.get(c.id); if (e) { e.classList.add('dying'); setTimeout(() => e.remove(), 200); els.delete(c.id); } sparks(c.k, colorOf(c.v), 6); }
        SFX.boom(); vibe([40, 30, 80]); shown += st.gain; showScore(); floatText(st.center, '💥 +' + st.gain); await sleep(320);
      }
    }
  }
  async function run(fn) { // 串行执行一次操作（加锁）
    if (busy) return; busy = true; renderTray();
    try { await fn(); } finally { busy = false; syncTiles(); shown = G.score; $('score').textContent = G.score; renderTray(); checkOver(); }
  }

  // ---------------- actions ----------------
  function award(before) { // 道具已改为无限次，保留钩子便于以后恢复计数
    return;
    const c = cfg(); if (c.kind === 'slide') return;
    const a = G.merges;
    if (c.kind === 'place' && Math.floor(a / 8) > Math.floor(before / 8)) { G.items.reroll++; toast('获得道具 🎲 重新随机 +1'); SFX.item(); }
    if (Math.floor(a / 20) > Math.floor(before / 20)) { G.items.force++; toast('获得道具 ⚡ 强制合成 +1'); SFX.item(); }
  }
  function afterLogic(res) { const b = G.merges; G.score += res.score || 0; G.merges += res.merges || 0; G.moves++; award(b); save(); }

  function doPlace(anchor) {
    const c = cfg(); const piece = G.queue[0];
    if (!L.pieceTargets(G.board, piece, anchor)) { SFX.bad(); vibe(30); return false; }
    run(async () => {
      snapshot(); G.queue.shift(); G.queue.push(L.randomPiece(G.board, c));
      const res = L.placePiece(G.board, piece, anchor, c); afterLogic(res); renderTray();
      await playSteps(res.steps);
    });
    return true;
  }
  function doMove(from, to) {
    const c = cfg(); const path = c.needPath === false ? [from, to] : L.findPath(G.board, from, to);
    if (!path) { // 过不去：不消耗回合，保持选中
      const e = els.get(G.board.t[from].id); e.classList.remove('shake'); void e.offsetWidth; e.classList.add('shake');
      const ce = cellEls.get(to); if (ce) { ce.classList.add('bad'); setTimeout(() => ce.classList.remove('bad'), 350); }
      toast('过不去！路被挡住了'); SFX.bad(); vibe(30); return;
    }
    run(async () => {
      snapshot(); const tile = G.board.t[from]; const e = els.get(tile.id); e.classList.remove('sel'); G.sel = null; clearHints();
      const res = L.moveTile(G.board, from, to, c, null, G.queue); afterLogic(res); renderTray();
      e.style.transition = 'transform .06s linear';
      for (const k of path.slice(1)) { setTilePos(e, k); await sleep(60); }
      e.style.transition = ''; SFX.place();
      await playSteps(res.steps);
      for (const sp of res.spawned) { makeTile({ id: sp.id, v: sp.v }, sp.k, 'pop'); SFX.rotate(); await sleep(80); }
      if (res.spawnSteps && res.spawnSteps.length) await playSteps(res.spawnSteps);
    });
  }
  function doSlide(dir) {
    const c = cfg(); const before = JSON.parse(JSON.stringify(serialize(false)));
    const res = L.slide(G.board, dir);
    if (!res.moved) { SFX.bad(); return; }
    pushHist(before);
    run(async () => {
      const sp = L.spawn(G.board, c); afterLogic({ score: res.score });
      for (const m of res.moves) { const e = els.get(m.id); if (e) setTilePos(e, m.to); }
      SFX.place(); vibe(6); await sleep(140);
      for (const m of res.merges) {
        m.ids.forEach((id) => { const e = els.get(id); if (e) { e.remove(); els.delete(id); } });
        makeTile({ id: m.newId, v: m.v }, m.to, 'bump'); sparks(m.to, colorOf(m.v), 8); floatText(m.to, '+' + m.v);
      }
      if (res.merges.length) { SFX.merge(res.merges.length); vibe(15); shown += res.score; showScore(); }
      if (sp) makeTile({ id: sp.id, v: sp.v }, sp.k, 'pop');
      await sleep(120);
    });
  }
  function doForce(k) {
    const c = cfg();
    if (!G.board.t[k] || L.groupOf(G.board, k).length < 2) { SFX.bad(); toast('需要至少 2 个相连的相同数字'); return; }
    G.tool = null; hint('');
    run(async () => {
      snapshot(); const res = L.forceMerge(G.board, k, c); afterLogic(res); ring(k, 2); SFX.item();
      await playSteps(res.steps);
    });
  }
  const TOOL_HINT = { force: '⚡ 点选要强制合成的数字块（≥2 个相连）', clear1: '🔨 点选要清除的一个数字块', clearType: '🧹 点选一个数字，清除所有相同数字' };
  function setTool(t) {
    if (busy) return;
    G.tool = G.tool === t ? null : t; G.sel = null; els.forEach((e) => e.classList.remove('sel'));
    if (G.tool && !Object.keys(G.board.t).length) { G.tool = null; toast('棋盘上没有数字块'); }
    hint(G.tool ? TOOL_HINT[G.tool] + '（再点按钮取消）' : ''); renderTray(); markPickable();
  }
  const toggleForce = () => setTool('force');
  function doClear(keys, stagger) {
    run(async () => {
      snapshot(); const cells = L.clearCells(G.board, keys); afterLogic({}); renderTray();
      await playSteps([{ type: 'clear', cells, stagger }]);
    });
  }
  function doClear1(k) { if (!G.board.t[k]) { SFX.bad(); return; } G.tool = null; hint(''); doClear([k]); }
  function doClearType(k) {
    if (!G.board.t[k]) { SFX.bad(); return; } const v = G.board.t[k].v; G.tool = null; hint('');
    const ks = Object.keys(G.board.t).filter((x) => G.board.t[x].v === v); toast(`清除全部 ${v}（${ks.length} 个）`); doClear(ks, 40);
  }
  function doClear5() {
    if (busy) return; if (!Object.keys(G.board.t).length) { toast('棋盘上没有数字块'); return; }
    G.tool = null; hint('');
    run(async () => { snapshot(); const cells = L.clearRandom(G.board, 5); afterLogic({}); renderTray(); await playSteps([{ type: 'clear', cells, stagger: 110 }]); });
  }
  function markPickable() {
    const can = new Set();
    if (G && G.tool === 'force') { for (const k in G.board.t) if (L.groupOf(G.board, k).length >= 2) can.add(G.board.t[k].id); }
    else if (G && G.tool) for (const k in G.board.t) can.add(G.board.t[k].id);
    els.forEach((e, id) => e.classList.toggle('pickable', can.has(id)));
  }
  function doReroll() {
    if (busy) return; const c = cfg();
    snapshot(); G.queue = c.kind === 'move' ? G.queue.map(() => L.nextValue(G.board, c)) : G.queue.map(() => L.randomPiece(G.board, c)); SFX.item(); vibe(10);
    save(); renderTray(); const cur = $('current'); cur.classList.remove('pop'); checkOver();
  }
  function doUndo() {
    if (busy || !G.hist.length) return;
    const hist = G.hist; const snap = hist.pop(); G = fromData(snap); G.hist = hist; G.over = false;
    save(); els.forEach((e) => e.remove()); els.clear(); syncTiles(); renderTray(); hideModal('overModal'); toast(G.hist.length ? `已撤销（还可再撤 ${G.hist.length} 步）` : '已撤销'); SFX.rotate();
  }
  function restart() { hideModal('overModal'); newGame(); els.forEach((e) => e.remove()); els.clear(); hint(''); layout(); shown = 0; }
  function rotateCurrent() {
    const p = G.queue[0]; if (!p || p.values.length < 2) return;
    G.queue[0] = L.rotatePiece(p); save(); renderTray(); SFX.rotate(); vibe(5);
  }

  function isOver() {
    const c = cfg(); const b = G.board;
    if (c.kind === 'place') return !L.canPlaceAnywhere(b, G.queue[0]);
    if (c.kind === 'move') return !L.canMoveAny(b);
    return !L.canSlide(b);
  }
  function checkOver() {
    if (busy || !G) return;
    if (!isOver()) { if (G.over) { G.over = false; save(); } return; }
    if (!G.over) { G.over = true; save(); SFX.over(); vibe([60, 60, 120]); }
    $('overScore').textContent = G.score;
    $('overBest').textContent = (G.score >= bestOf() && G.score > 0 ? '🎉 新纪录！' : '最高分 ' + bestOf()) + ' · 最大数字 ' + G.board.maxValue();
    const items = $('overItems'); items.innerHTML = '';
    const c = cfg(); const hasPair = Object.keys(G.board.t).some((k) => L.groupOf(G.board, k).length >= 2);
    if (c.kind === 'place' && G.board.empty().length) addBtn(items, '🎲 重新随机', () => { hideModal('overModal'); doReroll(); });
    if (c.kind !== 'slide' && hasPair) addBtn(items, '⚡ 强制合成', () => { hideModal('overModal'); toggleForce(); });
    if (Object.keys(G.board.t).length) { addBtn(items, '💥 随机清5格', () => { hideModal('overModal'); doClear5(); }); addBtn(items, '🔨 清除一格', () => { hideModal('overModal'); setTool('clear1'); }); }
    if (G.hist.length) addBtn(items, '↶ 撤销', doUndo);
    showModal('overModal');
  }
  function addBtn(parent, txt, fn) { const b = document.createElement('button'); b.className = 'secondary'; b.textContent = txt; b.onclick = fn; parent.appendChild(b); }
  function showModal(id) { $(id).classList.remove('hidden'); }
  function hideModal(id) { $(id).classList.add('hidden'); }

  // ---------------- input ----------------
  function boardPoint(cx, cy) { const r = $('board').getBoundingClientRect(); return { x: cx - r.left, y: cy - r.top }; }
  function nearestCell(x, y, maxD) {
    let best = null, bd = Infinity;
    for (const c of G.board.cells) { const p = cellPos(c.k); const d = Math.hypot((p.x - x) / geo.sx, (p.y - y) / geo.sy); if (d < bd) { bd = d; best = c.k; } }
    return bd <= (maxD ?? geo.s * 0.95) ? best : null;
  }
  function clearHints() { cellEls.forEach((e) => e.classList.remove('hint', 'bad', 'target')); }

  // 拖拽托盘中的棋子
  let drag = null;
  $('current').addEventListener('pointerdown', (ev) => {
    if (busy || !G.queue[0] || cfg().kind !== 'place' || G.over) return;
    ac(); if (G.tool) setTool(G.tool);
    drag = { id: ev.pointerId, sx: ev.clientX, sy: ev.clientY, moved: false, ghost: null, anchor: null, lift: ev.pointerType === 'mouse' ? 0 : Math.max(geo.s * 1.6, 56) };
    $('current').setPointerCapture(ev.pointerId); ev.preventDefault();
  });
  $('current').addEventListener('pointermove', (ev) => {
    if (!drag || ev.pointerId !== drag.id) return;
    if (!drag.moved && Math.hypot(ev.clientX - drag.sx, ev.clientY - drag.sy) < 8) return;
    if (!drag.moved) {
      drag.moved = true; const p = pieceEl(G.queue[0], geo.s); const g = document.createElement('div'); g.className = 'ghost';
      g.appendChild(p.box); p.box.style.position = 'relative'; document.body.appendChild(g); drag.ghost = g; drag.p = p;
      $('current').style.opacity = '0.25';
    }
    const cx = ev.clientX, cy = ev.clientY - drag.lift;
    drag.ghost.style.transform = `translate(${cx - drag.p.W / 2}px,${cy - drag.p.H / 2}px) scale(1.04)`;
    const bp = boardPoint(cx - drag.p.mid.x, cy - drag.p.mid.y); // cell0 位置
    const k = nearestCell(bp.x, bp.y); clearHints(); drag.anchor = null;
    if (k) {
      const tg = L.pieceTargets(G.board, G.queue[0], k);
      if (tg) { tg.forEach((t) => cellEls.get(t).classList.add('hint')); drag.anchor = k; }
      else { const a = L.parse(k); L.pieceOffsets(G.queue[0]).forEach((o) => { const e = cellEls.get(L.key(a.q + o.q, a.r + o.r)); if (e) e.classList.add('bad'); }); }
    }
  });
  function endDrag(ev) {
    if (!drag || ev.pointerId !== drag.id) return; const d = drag; drag = null; clearHints();
    if (!d.moved) { rotateCurrent(); return; }
    const restore = () => { $('current').style.opacity = ''; };
    if (d.anchor && doPlace(d.anchor)) { d.ghost.remove(); restore(); return; }
    const r = $('current').getBoundingClientRect(); d.ghost.classList.add('back');
    d.ghost.style.transform = `translate(${r.left + r.width / 2 - d.p.W / 2}px,${r.top + r.height / 2 - d.p.H / 2}px) scale(.8)`;
    if (d.anchor === null && ev.type === 'pointerup') SFX.bad();
    setTimeout(() => { d.ghost.remove(); restore(); }, 200);
  }
  $('current').addEventListener('pointerup', endDrag);
  $('current').addEventListener('pointercancel', endDrag);

  // 棋盘点击 / 滑动
  let sp = null;
  $('stage').addEventListener('pointerdown', (ev) => { ac(); sp = { x: ev.clientX, y: ev.clientY, id: ev.pointerId }; });
  $('stage').addEventListener('pointerup', (ev) => {
    if (!sp || ev.pointerId !== sp.id) return; const dx = ev.clientX - sp.x, dy = ev.clientY - sp.y; sp = null;
    if (busy || (G.over && !G.tool)) return; const kind = cfg().kind; const dist = Math.hypot(dx, dy);
    if (kind === 'slide') {
      if (dist < 24) return;
      const ang = Math.atan2(dy / geo.sy, dx / geo.sx) * 180 / Math.PI; const dir = ((Math.round(((geo.flat ? 30 : 0) - ang) / 60) % 6) + 6) % 6; doSlide(dir); return;
    }
    if (dist > 14) return;
    const bp = boardPoint(ev.clientX, ev.clientY); const k = nearestCell(bp.x, bp.y); if (!k) return;
    if (G.tool === 'force') { doForce(k); return; }
    if (G.tool === 'clear1') { doClear1(k); return; }
    if (G.tool === 'clearType') { doClearType(k); return; }
    if (kind === 'place') { if (!G.board.t[k]) doPlace(k); return; }
    if (kind === 'move') {
      if (G.board.t[k]) {
        els.forEach((e) => e.classList.remove('sel')); clearHints();
        if (G.sel === k) { G.sel = null; return; }
        G.sel = k; els.get(G.board.t[k].id).classList.add('sel'); SFX.rotate(); vibe(6);
        if (cfg().needPath !== false) L.reachable(G.board, k).forEach((x) => cellEls.get(x) && cellEls.get(x).classList.add('target'));
      } else if (G.sel) doMove(G.sel, k);
    }
  });
  const KEYS_P = { d: 0, arrowright: 0, e: 1, w: 2, q: 2, arrowup: 2, a: 3, arrowleft: 3, z: 4, c: 5, s: 5, x: 5, arrowdown: 5 };
  const KEYS_F = { d: 0, c: 0, e: 1, w: 2, arrowup: 2, q: 3, a: 4, z: 4, s: 5, x: 5, arrowdown: 5 };
  window.addEventListener('keydown', (ev) => {
    const k = ev.key.toLowerCase();
    if ((ev.ctrlKey || ev.metaKey) && k === 'z') { doUndo(); return; }
    const KEYS = geo.flat ? KEYS_F : KEYS_P; if (cfg().kind === 'slide' && k in KEYS && !busy && !G.over) { ev.preventDefault(); doSlide(KEYS[k]); }
    if (cfg().kind === 'place' && (k === 'r' || k === ' ')) rotateCurrent();
  });
  // 防止 iOS 双指缩放 / 橡皮筋
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('touchmove', (e) => { if (!e.target.closest('.card')) e.preventDefault(); }, { passive: false });

  // ---------------- buttons & menu ----------------
  $('btnReroll').onclick = doReroll;
  $('btnForce').onclick = toggleForce;
  $('btnClear1').onclick = () => setTool('clear1');
  $('btnClearType').onclick = () => setTool('clearType');
  $('btnClear5').onclick = doClear5;
  $('btnUndo').onclick = doUndo;
  $('btnRestart').onclick = () => { if (G.moves === 0 || G.over || confirm('确定重新开始？当前进度将丢失。')) restart(); };
  $('btnSound').onclick = () => { settings.sound = !settings.sound; saveSettings(); renderTray(); if (settings.sound) SFX.rotate(); };
  $('btnMenu').onclick = $('modeChip').onclick = openMenu;
  $('menuClose').onclick = () => hideModal('menuModal');
  $('overRestart').onclick = restart;
  $('tSound').onclick = () => { settings.sound = !settings.sound; saveSettings(); renderMenu(); renderTray(); };
  $('tVibe').onclick = () => { settings.vibe = !settings.vibe; saveSettings(); renderMenu(); vibe(20); };
  function switchTo(mode, r) {
    save(); settings.mode = mode; if (r) settings.sizes[mode] = r; saveSettings();
    els.forEach((e) => e.remove()); els.clear(); loadOrNew(); shown = G.score; hint(''); layout(); renderMenu(); checkOver();
  }
  function openMenu() { renderMenu(); showModal('menuModal'); }
  function renderMenu() {
    const ml = $('modeList'); ml.innerHTML = '';
    for (const m of MODE_ORDER) {
      const b = document.createElement('button'); b.className = 'mode' + (m === settings.mode ? ' on' : '');
      b.innerHTML = `<b>${MODES[m].name}${m === 'move' ? ' <small>（默认·原版）</small>' : ''}</b><small>${MODES[m].desc}</small>`;
      b.onclick = () => { if (m !== settings.mode) { hideModal('overModal'); switchTo(m); } }; ml.appendChild(b);
    }
    const seg = $('sizeSeg'); seg.innerHTML = '';
    for (const [r, label] of (SIZES[settings.mode] || SIZES.other)) {
      const b = document.createElement('button'); b.textContent = label; b.classList.toggle('on', String(r) === String(radius()));
      b.onclick = () => { if (String(r) !== String(radius())) { hideModal('overModal'); switchTo(settings.mode, r); } }; seg.appendChild(b);
    }
    $('tSound').classList.toggle('on', settings.sound); $('tVibe').classList.toggle('on', settings.vibe);
    $('rules').innerHTML = `<b>「${MODES[settings.mode].name}」规则</b><ul>${RULES[settings.mode].map((x) => `<li>${x}</li>`).join('')}</ul>`;
  }

  // ---------------- boot ----------------
  loadOrNew(); shown = G.score;
  let rt = 0; const relayout = () => { clearTimeout(rt); rt = setTimeout(layout, 80); };
  window.addEventListener('resize', relayout); window.addEventListener('orientationchange', relayout);
  document.addEventListener('visibilitychange', () => { if (document.hidden && G) save(); });
  window.addEventListener('pagehide', () => G && save());
  requestAnimationFrame(() => { layout(); checkOver(); if (!localStorage.getItem(LS + 'seenRules')) { localStorage.setItem(LS + 'seenRules', '1'); openMenu(); } });
  if ('serviceWorker' in navigator && location.protocol.startsWith('http') && !window.__INLINE__) navigator.serviceWorker.register('sw.js').catch(() => {});
  window.__hex = { setTool, doClear5, get geo() { return geo; }, loadState(d) { G = fromData(d); save(); els.forEach((e) => e.remove()); els.clear(); shown = G.score; hideModal('overModal'); layout(); checkOver(); }, get G() { return G; }, L, settings, doPlace, doSlide, doMove, doForce, doReroll, doUndo, restart, switchTo, isOver, cellPos, get busy() { return busy; } };
})();
