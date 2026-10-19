/* 六边形2048 — 纯逻辑模块（无 DOM），浏览器与 Node 通用 */
(function (root) {
  'use strict';
  // 尖顶六边形，轴坐标 (q, r)
  const DIRS = [
    { q: 1, r: 0, name: 'E' },   // 0 右
    { q: 1, r: -1, name: 'NE' }, // 1 右上
    { q: 0, r: -1, name: 'NW' }, // 2 左上
    { q: -1, r: 0, name: 'W' },  // 3 左
    { q: -1, r: 1, name: 'SW' }, // 4 左下
    { q: 0, r: 1, name: 'SE' },  // 5 右下
  ];
  const key = (q, r) => q + ',' + r;
  const parse = (k) => { const [q, r] = k.split(',').map(Number); return { q, r }; };

  function makeCells(radius) {
    const cells = [];
    for (let r = -radius; r <= radius; r++)
      for (let q = -radius; q <= radius; q++)
        if (Math.abs(q) <= radius && Math.abs(r) <= radius && Math.abs(q + r) <= radius) cells.push({ q, r, k: key(q, r) });
    return cells;
  }

  // 可切换的玩法变体（PRESETS），每个都是纯配置，切换只需改 mode
  const PRESETS = {
    four: {             // 默认：用户回忆版 / 《六角形2048消除六边形》式 —— 放置单块，4 连合成 ×4
      kind: 'place', radius: 3, minGroup: 4, chainMinGroup: 4, factor: 4, explodeAt: 0,
      doubleChance: 0, queue: 5,
      spawn: [[1, 34], [2, 34], [4, 16], [8, 12], [16, 4, 64], [32, 3, 256]], // [值, 权重, 棋盘最大值≥此值才出现]
      items: { reroll: 2, force: 1 },
    },
    three: {            // 《2048六角消除》式 —— 单/双格棋子可旋转，3 连合成 ×2，连消 2 个即可，2048 爆炸
      kind: 'place', radius: 3, minGroup: 3, chainMinGroup: 2, factor: 2, explodeAt: 2048,
      doubleChance: 0.45, queue: 2,
      spawn: [[2, 40], [4, 32], [8, 18], [16, 10, 64], [32, 5, 256]],
      items: { reroll: 2, force: 1 },
    },
    move: {             // 移动版（4 Hexa 式）—— 点选数字块沿通路移到空格，4 连 ×4，未合成则随机落下 3 块
      kind: 'move', radius: 3, minGroup: 4, chainMinGroup: 4, factor: 4, explodeAt: 0,
      spawnCount: 3, startTiles: 8,
      spawn: [[1, 40], [2, 40], [4, 12], [8, 8]],
      items: { reroll: 0, force: 1 },
    },
    slide: { kind: 'slide', radius: 2, four: 0.1, items: { reroll: 0, force: 0 } }, // 六向滑动 2048（19 格）
  };
  const DEFAULTS = { merge: PRESETS.three, slide: PRESETS.slide };

  let nextId = 1;
  const newTile = (v) => ({ id: nextId++, v });
  function setNextId(n) { nextId = Math.max(nextId, n); }

  class Board {
    constructor(radius) {
      this.radius = radius;
      this.cells = makeCells(radius);
      this.set = new Set(this.cells.map((c) => c.k));
      this.t = {}; // key -> tile
    }
    has(q, r) { return this.set.has(key(q, r)); }
    get(k) { return this.t[k] || null; }
    empty() { return this.cells.filter((c) => !this.t[c.k]).map((c) => c.k); }
    neighbors(k) {
      const { q, r } = parse(k); const out = [];
      for (const d of DIRS) { const nk = key(q + d.q, r + d.r); if (this.set.has(nk)) out.push(nk); }
      return out;
    }
    maxValue() { let m = 0; for (const k in this.t) m = Math.max(m, this.t[k].v); return m; }
    toJSON() { const o = {}; for (const k in this.t) o[k] = this.t[k].v; return o; }
    load(o) { this.t = {}; for (const k in o) if (this.set.has(k)) this.t[k] = newTile(o[k]); }
  }

  /* ---------------- 拖放合成模式 ---------------- */
  function rng(r) { return r ? r() : Math.random(); }

  function randomValue(maxOnBoard, rand, cfg) {
    const pool = (cfg && cfg.spawn ? cfg.spawn : PRESETS.three.spawn).filter((p) => !p[2] || maxOnBoard >= p[2]);
    const tot = pool.reduce((s, p) => s + p[1], 0);
    let x = rng(rand) * tot;
    for (const p of pool) { if ((x -= p[1]) < 0) return p[0]; }
    return pool[0][0];
  }

  function randomPiece(board, cfg, rand) {
    const m = board.maxValue();
    if (cfg.doubleChance && rng(rand) < cfg.doubleChance) {
      return { values: [randomValue(m, rand, cfg), randomValue(m, rand, cfg)], orient: Math.floor(rng(rand) * 3) };
    }
    return { values: [randomValue(m, rand, cfg)], orient: 0 };
  }

  // 棋子各格相对 cell0 的偏移
  function pieceOffsets(piece) {
    if (piece.values.length === 1) return [{ q: 0, r: 0 }];
    const d = DIRS[piece.orient % 6];
    return [{ q: 0, r: 0 }, { q: d.q, r: d.r }];
  }
  function rotatePiece(piece) {
    if (piece.values.length === 1) return piece;
    return { values: piece.values.slice(), orient: (piece.orient + 1) % 6 };
  }
  function pieceTargets(board, piece, anchorKey) {
    const a = parse(anchorKey);
    const ks = pieceOffsets(piece).map((o) => key(a.q + o.q, a.r + o.r));
    return ks.every((k) => board.set.has(k) && !board.t[k]) ? ks : null;
  }
  function canPlaceAnywhere(board, piece) {
    const orients = piece.values.length === 1 ? [0] : [0, 1, 2, 3, 4, 5];
    for (const o of orients) {
      const p = { values: piece.values, orient: o };
      for (const c of board.cells) if (pieceTargets(board, p, c.k)) return true;
    }
    return false;
  }
  function groupOf(board, k) {
    const v = board.t[k].v; const seen = new Set([k]); const st = [k];
    while (st.length) {
      const c = st.pop();
      for (const n of board.neighbors(c)) if (!seen.has(n) && board.t[n] && board.t[n].v === v) { seen.add(n); st.push(n); }
    }
    return [...seen];
  }

  /**
   * 从 starts 出发结算合成（含连消）。force=true 时第一步只需 2 个相连（强制合成道具）。
   * steps: [{type:'merge', to, oldId, from:[{k,id}], v, newId, chain, combo, gain}, {type:'explode', center, cleared, gain}]
   */
  function resolve(board, starts, cfg, opts) {
    opts = opts || {};
    const steps = []; let score = 0; let combo = opts.combo || 0; const factor = cfg.factor || 2;
    for (const start of starts) {
      let cur = start; let chain = 0;
      while (board.t[cur]) {
        const g = groupOf(board, cur);
        const need = (chain === 0 && opts.force && start === starts[0]) ? 2 : chain === 0 ? cfg.minGroup : cfg.chainMinGroup;
        if (g.length < need) break;
        const v = board.t[cur].v; const nv = v * factor;
        const from = g.filter((k) => k !== cur).map((k) => ({ k, id: board.t[k].id }));
        const oldId = board.t[cur].id;
        for (const f of from) delete board.t[f.k];
        const t = newTile(nv); board.t[cur] = t;
        combo++; chain++;
        const gain = nv * g.length * combo;
        score += gain;
        steps.push({ type: 'merge', to: cur, oldId, from, v: nv, newId: t.id, chain, combo, gain });
        if (cfg.explodeAt && nv >= cfg.explodeAt) {
          const cleared = [cur, ...board.neighbors(cur)].filter((k) => board.t[k]).map((k) => ({ k, id: board.t[k].id, v: board.t[k].v }));
          for (const c of cleared) delete board.t[c.k];
          const eg = nv * 2; score += eg;
          steps.push({ type: 'explode', center: cur, cleared, gain: eg });
          break;
        }
      }
    }
    return { steps, score, combo, merges: steps.filter((s) => s.type === 'merge').length };
  }

  /** 放置棋子并结算。返回 { ok, steps, score, combo, merges } */
  function placePiece(board, piece, anchorKey, cfg) {
    const targets = pieceTargets(board, piece, anchorKey);
    if (!targets) return { ok: false };
    const placed = targets.map((k, i) => { const t = newTile(piece.values[i]); board.t[k] = t; return { k, id: t.id, v: t.v }; });
    const r = resolve(board, targets, cfg);
    r.steps.unshift({ type: 'place', cells: placed });
    r.ok = true; return r;
  }

  /** 强制合成道具：选中格所在同值连通组（≥2）直接合成，并继续连消 */
  function forceMerge(board, k, cfg) {
    if (!board.t[k] || groupOf(board, k).length < 2) return { ok: false };
    const r = resolve(board, [k], cfg, { force: true }); r.ok = true; return r;
  }

  /* ---------------- 清除类道具 ---------------- */
  function clearCells(board, keys) {
    const out = [];
    for (const k of keys) if (board.t[k]) { out.push({ k, id: board.t[k].id, v: board.t[k].v }); delete board.t[k]; }
    return out;
  }
  /** 随机清除 n 格（不足 n 个则全清） */
  function clearRandom(board, n, rand) {
    const ks = Object.keys(board.t); const pick = [];
    while (ks.length && pick.length < n) pick.push(ks.splice(Math.floor(rng(rand) * ks.length), 1)[0]);
    return clearCells(board, pick);
  }
  /** 清除棋盘上所有数值为 v 的块 */
  function clearType(board, v) { return clearCells(board, Object.keys(board.t).filter((k) => board.t[k].v === v)); }

  /* ---------------- 移动模式 ---------------- */
  function findPath(board, from, to) {
    if (!board.t[from] || board.t[to] || !board.set.has(to)) return null;
    const prev = { [from]: null }; const q = [from];
    while (q.length) {
      const c = q.shift(); if (c === to) break;
      for (const n of board.neighbors(c)) if (!(n in prev) && !board.t[n]) { prev[n] = c; q.push(n); }
    }
    if (!(to in prev)) return null;
    const path = []; for (let c = to; c !== null; c = prev[c]) path.unshift(c);
    return path;
  }
  /** 沿通路移动；无合成则随机生成 spawnCount 块。返回 { ok, path, steps, score, spawned } */
  function moveTile(board, from, to, cfg, rand) {
    const path = findPath(board, from, to); if (!path) return { ok: false };
    board.t[to] = board.t[from]; delete board.t[from];
    const r = resolve(board, [to], cfg); r.ok = true; r.path = path; r.spawned = [];
    if (!r.merges) {
      for (let i = 0; i < cfg.spawnCount; i++) {
        const e = board.empty(); if (!e.length) break;
        const k = e[Math.floor(rng(rand) * e.length)];
        const t = newTile(randomValue(board.maxValue(), rand, cfg)); board.t[k] = t; r.spawned.push({ k, id: t.id, v: t.v });
      }
    }
    return r;
  }
  function canMoveAny(board) {
    const e = board.empty(); if (!e.length) return false;
    // 有空格且至少有一个数字块与某空格相邻（即可移动）
    return Object.keys(board.t).some((k) => board.neighbors(k).some((n) => !board.t[n]));
  }

  /* ---------------- 滑动模式 ---------------- */
  function lines(board, dir) {
    const d = DIRS[dir]; const out = [];
    for (const c of board.cells) {
      if (board.has(c.q + d.q, c.r + d.r)) continue; // 只从最前沿出发
      const line = []; let q = c.q, r = c.r;
      while (board.has(q, r)) { line.push(key(q, r)); q -= d.q; r -= d.r; }
      out.push(line);
    }
    return out;
  }

  /** 返回 { moved, moves:[{id,from,to}], merges:[{to,ids:[a,b],newId,v}], score } */
  function slide(board, dir) {
    const moves = []; const merges = []; let score = 0; let moved = false;
    const nt = {};
    for (const line of lines(board, dir)) {
      const tiles = line.filter((k) => board.t[k]).map((k) => ({ k, t: board.t[k] }));
      let pos = 0; let i = 0;
      while (i < tiles.length) {
        const a = tiles[i]; const b = tiles[i + 1]; const dest = line[pos];
        if (b && b.t.v === a.t.v) {
          const t = newTile(a.t.v * 2); nt[dest] = t;
          moves.push({ id: a.t.id, from: a.k, to: dest }, { id: b.t.id, from: b.k, to: dest });
          merges.push({ to: dest, ids: [a.t.id, b.t.id], newId: t.id, v: t.v });
          score += t.v; moved = true; i += 2;
        } else {
          nt[dest] = a.t; if (a.k !== dest) { moved = true; moves.push({ id: a.t.id, from: a.k, to: dest }); }
          i += 1;
        }
        pos++;
      }
    }
    if (moved) board.t = nt;
    return { moved, moves, merges, score };
  }
  function spawn(board, cfg, rand) {
    const e = board.empty(); if (!e.length) return null;
    const k = e[Math.floor(rng(rand) * e.length)];
    const t = newTile(rng(rand) < cfg.four ? 4 : 2); board.t[k] = t;
    return { k, id: t.id, v: t.v };
  }
  function canSlide(board) {
    if (board.empty().length) return true;
    for (const c of board.cells) for (const n of board.neighbors(c.k)) if (board.t[n].v === board.t[c.k].v) return true;
    return false;
  }

  const api = { clearCells, clearRandom, clearType, DIRS, DEFAULTS, PRESETS, resolve, forceMerge, findPath, moveTile, canMoveAny, key, parse, makeCells, Board, newTile, setNextId,
    randomValue, randomPiece, pieceOffsets, rotatePiece, pieceTargets, canPlaceAnywhere, groupOf, placePiece,
    lines, slide, spawn, canSlide };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.HexLogic = api;
})(typeof self !== 'undefined' ? self : this);
