/**
 * @module adapters/memory/repositories
 * In-memory implementations — a first-class peer to SqliteRepository, not a stub.
 */

import { randomUUID } from 'crypto';

import { GameNotFoundError, PuzzleNotFoundError } from '../../errors.js';

// ─── move-eval normalisation ──────────────────────────────────────────────────
// B15: SQLite SELECT * returns snake_case column names; the analysis pipeline
// produces camelCase. The in-memory repo normalises to snake_case on write so
// build.js (which reads win_loss_pts, win_before, win_after) works identically
// against both adapters.
function _normaliseMoveEval(e) {
  return {
    game_id:       e.gameId    ?? e.game_id    ?? null,
    ply:           e.ply,
    fen:           e.fen,
    move_uci:      e.moveUci   ?? e.move_uci   ?? null,
    move_san:      e.moveSan   ?? e.move_san   ?? null,
    cp_white:      e.cpWhite   ?? e.cp_white   ?? null,
    mate_in:       e.mateIn    ?? e.mate_in    ?? null,
    best_move_uci: e.bestMoveUci ?? e.best_move_uci ?? null,
    pv:            e.pv        ?? null,
    mover:         e.mover     ?? null,
    win_before:    e.winBefore  ?? e.win_before  ?? null,
    win_after:     e.winAfter   ?? e.win_after   ?? null,
    cp_loss:       e.cpLoss    ?? e.cp_loss    ?? null,
    // pipeline: winLoss; SQLite column: win_loss_pts — the critical B15 field
    win_loss_pts:  e.winLoss   ?? e.win_loss_pts ?? e.winLossPts ?? null,
    classification: e.classification ?? null,
    move_accuracy: e.moveAccuracy ?? e.move_accuracy ?? null,
    alt_moves_json: e.altMovesJson ?? e.alt_moves_json ?? null,
  };
}

// ─── activity helpers ─────────────────────────────────────────────────────────

function _activityDayKey(timestampMs) {
  const d = new Date(timestampMs);
  if (d.getHours() < 4) d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function _prevDay(dayKey) {
  const d = new Date(dayKey + 'T12:00:00');
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function _deriveStreak(days, todayKey) {
  const daySet = new Set(days);
  const yesterdayKey = _prevDay(todayKey);
  let current = daySet.has(todayKey) ? todayKey : (daySet.has(yesterdayKey) ? yesterdayKey : null);
  if (!current) return 0;
  let streak = 0;
  while (daySet.has(current)) {
    streak++;
    current = _prevDay(current);
  }
  return streak;
}

export class InMemoryGameRepository {
  constructor() {
    this._games = new Map();
    this._moves = new Map(); // gameId → move[]
    this._eloHistory = [];
    this._settings = new Map();
    this._activity = new Map(); // dayKey → {games, reviews}
    this._strengthSamples = new Map(); // `${gameId}:${side}` → sample
  }

  save(game) {
    const id = game.id ?? randomUUID();
    this._games.set(id, { ...game, id });
    return id;
  }

  findById(id) {
    const game = this._games.get(id);
    if (!game) throw new GameNotFoundError(`Game '${id}' not found`);
    const g = { ...game };
    g.strengthElo = game.strengthElo ?? null;
    g.opponentStrengthElo = game.opponentStrengthElo ?? null;
    return g;
  }

  appendMove(gameId, move) {
    if (!this._moves.has(gameId)) this._moves.set(gameId, []);
    this._moves.get(gameId).push({ ...move });
  }

  getMoves(gameId) {
    return (this._moves.get(gameId) ?? []).map(m => ({ ...m }));
  }

  abandonAllInProgress() {
    for (const [id, game] of this._games) {
      if (game.status === 'in_progress') this._games.set(id, { ...game, status: 'abandoned' });
    }
  }

  resetRunningAnalyses() {
    for (const [id, game] of this._games) {
      if (game.analysisState === 'running') {
        this._games.set(id, { ...game, analysisState: 'failed', analysisError: 'Server restarted during analysis' });
      }
    }
  }

  updateClock(gameId, whiteMs, blackMs) {
    const game = this._games.get(gameId);
    if (game) this._games.set(gameId, { ...game, clockWhiteMs: whiteMs, clockBlackMs: blackMs });
  }

  updateElo(gameId, { eloBefore, eloAfter, historyId, recordedAt }) {
    const game = this._games.get(gameId);
    if (game) {
      game.eloBefore = eloBefore;
      game.eloAfter = eloAfter;
    }
    this._eloHistory.push({ id: historyId ?? randomUUID(), recordedAt: recordedAt ?? Date.now(), elo: eloAfter, gameId });
  }

  getEloHistory() {
    return [...this._eloHistory].sort((a, b) => a.recordedAt - b.recordedAt);
  }

  listRecent(limit = 50) {
    return [...this._games.values()]
      .sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0))
      .slice(0, limit)
      .map(g => ({ ...g, strengthElo: g.strengthElo ?? null, opponentStrengthElo: g.opponentStrengthElo ?? null }));
  }

  getEvals(gameId) {
    return this._evals ? (this._evals.get(gameId) ?? []) : [];
  }

  saveMoveEval(eval_) {
    if (!this._evals) this._evals = new Map();
    const list = this._evals.get(eval_.gameId) ?? [];
    const row = _normaliseMoveEval(eval_);
    const idx = list.findIndex(e => e.ply === row.ply);
    if (idx >= 0) list[idx] = row; else list.push(row);
    this._evals.set(eval_.gameId, list);
  }

  savePreEval(gameId, ply, fen, evalData) {
    if (!this._evals) this._evals = new Map();
    const list = this._evals.get(gameId) ?? [];
    if (list.some(e => e.ply === ply)) return; // INSERT OR IGNORE semantics
    // Pre-evals omit mover/win_* fields; normalise to the same snake_case shape.
    list.push({
      game_id: gameId, ply, fen,
      cp_white: evalData.cp ?? null,
      mate_in: evalData.mate ?? null,
      best_move_uci: evalData.bestmove ?? null,
      pv: evalData.pv ?? null,
      mover: null,
      win_before: null, win_after: null, cp_loss: null, win_loss_pts: null,
      classification: null, move_accuracy: null, alt_moves_json: null,
    });
    this._evals.set(gameId, list);
  }

  recordActivity(timestampMs, type) {
    const day = _activityDayKey(timestampMs);
    const entry = this._activity.get(day) ?? { games: 0, reviews: 0 };
    if (type === 'game') entry.games += 1;
    else entry.reviews += 1;
    this._activity.set(day, entry);
  }

  getStreak(todayTimestampMs) {
    return _deriveStreak([...this._activity.keys()], _activityDayKey(todayTimestampMs));
  }

  saveStrengthSample({ gameId, side, n, ase, sd, p75Loss, wasTimed, coeffVersion }) {
    this._strengthSamples.set(`${gameId}:${side}`, { gameId, side, n, ase, sd, p75Loss: p75Loss ?? null, wasTimed: !!wasTimed, coeffVersion });
  }

  listStrengthSamples({ side, limit } = {}) {
    let rows = [...this._strengthSamples.values()];
    if (side != null) rows = rows.filter(r => r.side === side);
    rows.sort((a, b) => {
      const ga = this._games.get(a.gameId);
      const gb = this._games.get(b.gameId);
      return (gb?.startedAt ?? 0) - (ga?.startedAt ?? 0);
    });
    if (limit != null) rows = rows.slice(0, limit);
    return rows.map(r => ({ ...r }));
  }

  getPlayerMoveClassifications() {
    if (!this._evals) return [];
    const results = [];
    for (const [gameId, evals] of this._evals) {
      const game = this._games.get(gameId);
      if (!game || game.status !== 'finished') continue;
      for (const eval_ of evals) {
        if (eval_.mover === 'player' && eval_.classification != null) {
          results.push({ classification: eval_.classification, played_at: game.playedAt ?? 0 });
        }
      }
    }
    return results.sort((a, b) => (a.played_at ?? 0) - (b.played_at ?? 0));
  }
}

export class InMemoryPuzzleRepository {
  constructor() {
    this._puzzles = new Map();       // id → puzzle
    this._fenKindIndex = new Map();  // `${fen}|${kind}` → id
    this._cards = new Map();         // puzzleId → card
  }

  save(puzzle) {
    const kind = puzzle.kind ?? 'tactical';
    const key = `${puzzle.fen}|${kind}`;
    const existing = this._fenKindIndex.get(key);
    if (existing) {
      const p = this._puzzles.get(existing);
      p.timesSeen = (p.timesSeen ?? 1) + 1;
      return existing;
    }
    const id = puzzle.id ?? randomUUID();
    const stored = { ...puzzle, id, kind, motifTag: puzzle.motifTag ?? null, timesSeen: 1, createdAt: puzzle.createdAt ?? Date.now() };
    this._puzzles.set(id, stored);
    this._fenKindIndex.set(key, id);
    return id;
  }

  getByFenAndKind(fen, kind) {
    const key = `${fen}|${kind}`;
    const id = this._fenKindIndex.get(key);
    return id ? { ...this._puzzles.get(id) } : null;
  }

  updateAcceptedMoves(id, acceptedMovesJson) {
    const p = this._puzzles.get(id);
    if (p) p.acceptedMovesJson = acceptedMovesJson;
  }

  updateFindability(id, fields) {
    const p = this._puzzles.get(id);
    if (!p) return;
    p.findability = fields.findability;
    p.temptation = fields.temptation;
    p.instructiveness = fields.instructiveness;
    p.maiaModel = fields.maiaModel;
    p.policyTemperature = fields.policyTemperature;
  }

  /**
   * Returns true if an opening puzzle for this FEN has been drilled at least once.
   * @param {string} fen
   * @returns {boolean}
   */
  hasDrilledCard(fen) {
    for (const [id, p] of this._puzzles) {
      if (p.fen === fen && p.kind === 'opening') {
        const card = this._cards.get(id);
        if (card && card.reps > 0) return true;
      }
    }
    return false;
  }

  findById(id) {
    const puzzle = this._puzzles.get(id);
    if (!puzzle) throw new PuzzleNotFoundError(`Puzzle '${id}' not found`);
    return { ...puzzle };
  }

  getDueCards(now) {
    const results = [];
    for (const [puzzleId, card] of this._cards) {
      if (card.due <= now && !card.graduated) {
        const puzzle = this._puzzles.get(puzzleId);
        results.push({ kind: puzzle?.kind ?? 'tactical', ...puzzle, ...card });
      }
    }
    return results.sort((a, b) => a.due - b.due);
  }

  saveCard(card) {
    this._cards.set(card.puzzleId, { ...card });
  }

  getCard(puzzleId) {
    const card = this._cards.get(puzzleId);
    return card ? { ...card } : null;
  }

  listAll() {
    return [...this._puzzles.values()].map(p => {
      const card = this._cards.get(p.id);
      return { ...p, graduated: card?.graduated ?? false, reps: card?.reps ?? 0, lapses: card?.lapses ?? 0 };
    });
  }

  listByGame(gameId) {
    return [...this._puzzles.values()]
      .filter(p => p.sourceGameId === gameId)
      .sort((a, b) => (a.sourcePly ?? 0) - (b.sourcePly ?? 0));
  }

  getPuzzleCountsByGameId() {
    const counts = {};
    for (const p of this._puzzles.values()) {
      if (p.sourceGameId) counts[p.sourceGameId] = (counts[p.sourceGameId] ?? 0) + 1;
    }
    return counts;
  }

  saveReview(review) {
    if (!this._reviews) this._reviews = [];
    this._reviews.push({ ...review, id: review.id ?? randomUUID() });
  }

  saveReviewAndCard(review, card) {
    this.saveReview(review);
    this.saveCard(card);
  }

  getPracticeCards(now) {
    const results = [];
    for (const [puzzleId, card] of this._cards) {
      if (card.due > now && !card.graduated) {
        results.push({ ...this._puzzles.get(puzzleId), ...card });
      }
    }
    return results.sort((a, b) => (b.instructiveness ?? 0) - (a.instructiveness ?? 0));
  }

  getMotifDrillAccuracy() {
    const reviews = this._reviews ?? [];
    const agg = {};
    for (const r of reviews) {
      if (r.practice || r.attemptNo !== 1) continue;
      const puzzle = this._puzzles.get(r.puzzleId);
      const tag = puzzle?.motifTag ?? null;
      if (!tag) continue;
      if (!agg[tag]) agg[tag] = { motifTag: tag, total: 0, correct: 0 };
      agg[tag].total++;
      if (r.correct) agg[tag].correct++;
    }
    return Object.values(agg);
  }
}

export class InMemorySettingsRepository {
  constructor() {
    this._store = new Map();
  }

  get(key) {
    return this._store.get(key) ?? null;
  }

  set(key, value) {
    this._store.set(key, String(value));
  }
}

export class InMemoryRepertoireRepository {
  constructor() {
    this._observations = [];
    this._deviations = [];
    this._audits = new Map();
    this._challenges = new Map();
    this._changelog = [];
    this._suppressions = new Map();
    this._nodes = new Map();
    this._moves = new Map();
    this._policy = new Map();
    this._provenance = new Map();
    this._provenanceCounter = 0;
    this._bookVersion = 0;
  }

  getOrCreateProvenance(ctx) {
    const key = `${ctx.balanceHash}|${ctx.schemaVersion}|${ctx.sfVersion ?? ''}|${ctx.sfDepth ?? ''}|${ctx.sfMultipv ?? ''}|${ctx.maiaWeightsId ?? ''}`;
    if (this._provenance.has(key)) return this._provenance.get(key);
    const id = ++this._provenanceCounter;
    this._provenance.set(key, id);
    return id;
  }

  getCurrentBookVersion() {
    return this._bookVersion;
  }

  incrementBookVersion() {
    return ++this._bookVersion;
  }

  appendObservation(obs) {
    this._observations.push({ ...obs });
  }

  getObservationsForNode(epd, side) {
    return this._observations
      .filter(o => o.epd === epd && o.side === side)
      .sort((a, b) => (a.playedAt ?? 0) - (b.playedAt ?? 0))
      .map(o => ({ ...o }));
  }

  appendDeviation(dev) {
    this._deviations.push({ ...dev });
  }

  getDeviationsForGame(gameId) {
    return this._deviations
      .filter(d => d.gameId === gameId)
      .sort((a, b) => (a.ply ?? 0) - (b.ply ?? 0))
      .map(d => ({ ...d }));
  }

  getAllDeviations(limit = 200) {
    return [...this._deviations].reverse().slice(0, limit).map(d => ({ ...d }));
  }

  appendAudit(audit) {
    this._audits.set(audit.id, { ...audit });
  }

  getAudit(id) {
    const a = this._audits.get(id);
    return a ? { ...a } : null;
  }

  openChallenge(challenge) {
    this._challenges.set(challenge.id, { ...challenge });
  }

  updateChallenge(id, patch) {
    const existing = this._challenges.get(id);
    if (!existing) throw new Error(`Challenge '${id}' not found`);
    this._challenges.set(id, { ...existing, ...patch });
  }

  getChallenge(id) {
    const c = this._challenges.get(id);
    return c ? { ...c } : null;
  }

  getOpenChallenge(epd, side) {
    for (const c of this._challenges.values()) {
      if (c.epd === epd && c.side === side && c.status === 'open') return { ...c };
    }
    return null;
  }

  listOpenChallenges() {
    return [...this._challenges.values()]
      .filter(c => c.status === 'open')
      .sort((a, b) => (a.openedAt ?? 0) - (b.openedAt ?? 0))
      .map(c => ({ ...c }));
  }

  appendChangelog(entry) {
    this._changelog.push({ ...entry });
  }

  getChangelog(limit = 50) {
    return [...this._changelog]
      .sort((a, b) => (b.at ?? 0) - (a.at ?? 0))
      .slice(0, limit)
      .map(e => ({ ...e }));
  }

  getChangelogEntry(id) {
    const entry = this._changelog.find(e => e.id === id);
    return entry ? { ...entry } : null;
  }

  /** @param {{ from?: number, to?: number, cursor?: number, limit?: number }} [opts] @returns {Object[]} */
  getChangelogRange({ from, to, cursor, limit = 500 } = {}) {
    let entries = [...this._changelog];
    if (from   != null) entries = entries.filter(e => (e.at ?? 0) >= from);
    if (to     != null) entries = entries.filter(e => (e.at ?? 0) <= to);
    if (cursor != null) entries = entries.filter(e => (e.at ?? 0) > cursor);
    return entries
      .sort((a, b) => (a.at ?? 0) - (b.at ?? 0))
      .slice(0, limit)
      .map(e => ({ ...e }));
  }

  upsertSuppression(supp) {
    this._suppressions.set(`${supp.epd}:${supp.side}:${supp.moveUci}`, { ...supp });
  }

  getSuppression(epd, side, moveUci) {
    const s = this._suppressions.get(`${epd}:${side}:${moveUci}`);
    return s ? { ...s } : null;
  }

  upsertNode(node) {
    this._nodes.set(`${node.epd}:${node.side}`, { ...node });
  }

  getNode(epd, side) {
    const n = this._nodes.get(`${epd}:${side}`);
    return n ? { ...n } : null;
  }

  listNodes() {
    return [...this._nodes.values()]
      .sort((a, b) => (a.epd < b.epd ? -1 : a.epd > b.epd ? 1 : a.side < b.side ? -1 : 1))
      .map(n => ({ ...n }));
  }

  countCanonicalNodes() {
    const seen = new Set();
    for (const m of this._moves.values()) {
      if (m.role === 'canonical') seen.add(`${m.epd}|${m.side}`);
    }
    return seen.size;
  }

  upsertMove(move) {
    this._moves.set(`${move.epd}:${move.side}:${move.moveUci}`, { ...move });
  }

  getMove(epd, side, moveUci) {
    const m = this._moves.get(`${epd}:${side}:${moveUci}`);
    return m ? { ...m } : null;
  }

  getMovesForNode(epd, side) {
    return [...this._moves.values()]
      .filter(m => m.epd === epd && m.side === side)
      .sort((a, b) => {
        if (a.role < b.role) return -1;
        if (a.role > b.role) return 1;
        return (a.moveUci ?? '') < (b.moveUci ?? '') ? -1 : 1;
      })
      .map(m => ({ ...m }));
  }

  updateNodeReachProb(epd, side, reachProb) {
    const key = `${epd}:${side}`;
    const existing = this._nodes.get(key);
    if (existing) this._nodes.set(key, { ...existing, reachProb, reachStale: false });
  }

  upsertPolicy(policy) {
    this._policy.set(`${policy.epd}:${policy.maiaModel}:${policy.maiaWeightsId}`, { ...policy });
  }

  getPolicy(epd, maiaModel, maiaWeightsId) {
    const p = this._policy.get(`${epd}:${maiaModel}:${maiaWeightsId}`);
    return p ? { ...p } : null;
  }

  transaction(fn) {
    return fn();
  }
}
