# Research record — skill-conditioned chess models

This document covers the Phase 15 acquisition of Maia-2 and Maia-3: what each model is,
how it was fetched, what was verified, and what it costs. The strength-estimation method
that consumes these models (once a v2 re-fit is warranted) is in `docs/research/strength-estimation.md`.

---

## §1 Maia-2 — MIT fallback with full policy distribution

**Maia-2** (NeurIPS 2024, arXiv:2409.20553) is a skill-conditioned model: it takes
`elo_self` and `elo_oppo` as *inputs*, so `argmax_elo P(moves | elo)` is calibrated by
construction and does not suffer the cross-net incomparability that broke the Maia-1 ladder
sweep (see `docs/research/strength-estimation.md §1.3`).

| Fact | Verified value | Source |
|---|---|---|
| Licence | **MIT** — Copyright (c) 2024 CSSLab | `CSSLab/maia2/LICENSE` |
| Package | `maia2` **0.11.0** on PyPI | PyPI JSON API |
| Python | `>=3.10,<3.13` | PyPI `requires_python` |
| Runtime deps | `torch>=2.8,<2.9`, `chess`, `einops`, `numpy>=2.1`, `pandas`, `gdown`, `pyzstd` | PyPI `requires_dist` |
| Device | `resolve_device("auto")` — CPU / CUDA / **Apple MPS** | `maia2/train.py` |
| Weights | Google Drive via `gdown`, **SHA-256 pinned in source** | `maia2/model.py:_MODEL_ASSETS` |
| API | `inference_each(model, prepared, fen, elo_self, elo_oppo)` | `maia2/inference.py:195` |

**Checkpoint integrity.** The pinned SHA-256 for `rapid_model.pt` in `maia2/model.py` is:
```
65aae8465eed5e65df66a24ea7370715579f9e5435098d06fe18bdb1e267e997
```
The HuggingFace mirror `shermansiu/maia2-rapid` (`original/model.pt`, 93 MB, `license: mit`)
carries a `provenance.json` recording the same digest. Verified locally:
```
shasum -a 256 weights/maia2/original/model.pt
# → 65aae8465eed5e65df66a24ea7370715579f9e5435098d06fe18bdb1e267e997  ✓
```

**The hard resolution limit.** `create_elo_dict()` (`maia2/utils.py:80-97`) produces **11
discrete buckets**: `<1100 | 1100-1199 | … | 1900-1999 | >=2000`. Maia-2 is therefore a
**100-Elo-resolution classifier over 1100–2000**, saturating above 2000. A bucketed argmax
is still subject to the §1.4 sample-noise argument from `strength-estimation.md` — skill-
conditioning fixes *comparability*, not *information*.

**Why it is in the tree.** AGPL-3 applies to Maia-3's code and weights. If pawnbook is ever
served to other people, Maia-3's AGPL-3 §13 remote-network obligation becomes real. Maia-2's
MIT licence means there is always a clean path that does not require offering source to remote
users.

**Integration path (deferred).** A new Layer-1 port `src/ports/skill-model-client.js` with an
adapter in `src/adapters/skill/`, injected at `src/server.js`. Maia-2 does not speak UCI, so
it cannot reuse the existing UCI adapter.

---

## §2 Maia-3 — primary, continuous Elo, UCI

**Maia-3** (ICLR 2026, arXiv:2605.19091 — *Chessformer*) is the better asset on nearly every
axis that matters operationally.

| | **Maia-2** | **Maia-3** |
|---|---|---|
| Licence | **MIT** (code + weights) | **AGPL-3.0** (code *and* weights) |
| Elo input | **11 discrete buckets**, `<1100` … `>=2000` | **continuous** — `SelfElo`/`OppoElo` are `spin min 0 max 5000` |
| Interface | Python API, `inference_each(...)` | **native UCI engine** — stdin/stdout |
| Move-match accuracy | previous SOTA | **57.1%**, with **<¼ the parameters** |
| Checkpoints | 93 MB (HF) + 280 MB (Drive) | **21 MB** (5M) · 92 MB (23M) · 316 MB (79M) |

**The decisive operational point.** Maia-3 speaks UCI. pawnbook already speaks UCI via
`src/adapters/engine/uci-engine-client.js`. Maia-3 needs **no new port, no sidecar, no bespoke
protocol** — it reuses the adapter pattern that already drives Stockfish and the Maia-1 nets.

**UCI options (from `CSSLab/maia3/maia3/uci.py`):**
```
option name SelfElo    type spin   default 1500  min 0  max 5000
option name OppoElo    type spin   default 1500  min 0  max 5000
option name MultiPV    type spin   default 5     min 1  max 20
option name Temperature type string default 1.0
option name TopP        type string default 1.0
```
`Temperature 0` plus `TopP 1.0` makes probing reproducible.

**The policy-not-emitted gap.** `score_moves()` computes `probs = torch.softmax(logits)` and
carries a `"policy"` float per candidate, but `cmd_go` prints only `score cp` (from the value
head, via `cp_from_wdl`) and `wdl`. The policy probability is never emitted. Two ways around it:

1. **Rank-based proxy, unmodified engine:** set `MultiPV 20` and record whether the played move
   appears and at what rank. Coarser than a probability, but needs no fork.
2. **One-line patch** adding `policy` to the info string. Trivial code, but makes the build a
   modified AGPL-3 work — state it plainly if chosen.

**The `score cp` is from the value head, not a search** — it is a human win-expectation and must
never be fed into the Phase 13 White-POV cp pipeline.

**Checkpoints fetched.** Both 5M and 23M cached into `weights/maia3/` (gitignored) using
`maia3-cache --cache-dir weights/maia3`. Sizes match the HuggingFace published bytes:

| Model | Bytes |
|---|---|
| maia3-5m | 20,968,049 |
| maia3-23m | 91,799,307 |

**API correction (maia2 0.11.0 vs plan).** The plan cited `prepare(model, fen, elo_self, elo_oppo)`
but the installed 0.11.0 API is `prepare()` (no arguments) returning a `(all_moves_dict, elo_dict,
all_moves_dict_reversed)` tuple passed to `inference_each`. The return value of `inference_each`
is `(dict[uci → prob], win_prob_float)` not a plain dict. These are cosmetic — the smoke test
below uses the actual API; the plan's description was a pre-fetch reading of `maia2/inference.py`
that did not account for the 0.11.0 changes.

**Maia-2 smoke test — passing.** `from_pretrained` validated the existing `rapid_model.pt` and
loaded to MPS (Apple Silicon). `inference_each` on the start position at `elo_self=1500 / elo_oppo=1500`:
```
Distribution sums to: 0.9999  ✓
Win probability: 0.4093
Top-5 moves: g1f3 (0.3344), b1c3 (0.2407), b1a3 (0.0760), d2d4 (0.0746), g1h3 (0.0523)
g1f3 and d2d4 in top-5 ✓  (e2e4 is 6th at 0.0431 — plausible for 1500)
```

**Smoke tests — all passing.**

*UCI options check:*
```
option name SelfElo    type spin default 1500 min 0 max 5000  ✓
option name OppoElo    type spin default 1500 min 0 max 5000  ✓
option name MultiPV    type spin default 5 min 1 max 20       ✓
option name Temperature type string default 1.0               ✓
option name TopP        type string default 1.0               ✓
```

*Decisive SelfElo ordering test (on `e2e4 e7e5 Nf3`, MultiPV 5, Temperature 0):*
```
SelfElo 1100 top-5: ['b8c6', 'd7d6', 'g8f6', 'f8c5', 'd8e7']
SelfElo 2400 top-5: ['b8c6', 'g8f6', 'd7d6', 'd7d5', 'f7f5']
PASS: orderings differ — SelfElo conditioning is real
```

*Per-`go` wall-clock on Apple M4 (10-core), 3 calls, first warm-up excluded:*

| Model | Warm-up | Subsequent calls | Avg (all 3) |
|---|---|---|---|
| maia3-5m  | 431 ms | 16 ms, 15 ms | 154 ms |
| maia3-23m | 528 ms | 49 ms, 46 ms | 208 ms |

Subsequent calls are ≤ 50 ms — well within `NFR-A3`'s 500 ms Maia-probe budget.

**The licence, read accurately.** AGPL-3 §13 obliges offering Corresponding Source to users
who interact with the program *remotely over a network*. For pawnbook: `BIND_ADDR` defaults to
`127.0.0.1`, the Docker image is an unpublished combined work, and Maia-3 runs as a **separate
UCI subprocess** — the same arm's-length posture that already applies to GPL-3 Stockfish and
the GPL-3 Maia-1 weights. The obligation becomes real only if pawnbook is ever exposed to other
people — which is precisely why Maia-2 (MIT) is kept as a fallback.

**Maia-3 as a Maia-1 replacement.** A single 21 MB model that plays human-like at any Elo from
0 to 5000 can replace the entire nine-net Maia-1 ladder and close the documented 1900→2200
opponent gap from `strength-estimation.md §1.1`. That is a separate product decision and is not
wired in Phase 15.

---

## §3 Integration is explicitly NOT in Phase 15

Both models are in hand and verified; neither is wired into `src/`. Any v2 strength estimator
that uses them must be validated against the `strength_samples` corpus before being displayed.

- **Maia-3 → existing UCI pattern.** `ScriptedEngineClient` does not implement `setOption`
  today; that is a known small gap for any scripted coverage of Elo-conditioned probing.
- **Maia-2 → new Layer-1 port.** `src/ports/skill-model-client.js` + adapter in
  `src/adapters/skill/`, injected at `src/server.js`. The ONNX route (`cemoss17/maia2-onnx`,
  85 MB) is recorded and not chosen: unofficial export, no licence stated, requires
  reimplementing `preprocessing()` and the Elo bucketing in JS.

---

## §4 Bibliography

- McIlroy-Young, R., Sen, S., Kleinberg, J. & Anderson, A. (2020). *Aligning Superhuman AI
  with Human Behavior: Chess as a Model System*. KDD 2020. arXiv:2006.01855
- *Maia-2: A Unified Model for Human-AI Alignment in Chess*. NeurIPS 2024. arXiv:2409.20553
- Monroe, D., Eilender, G., Chalmers, P., Tang, Z. & Anderson, A. (2026). *Chessformer: A
  Unified Architecture for Chess Modeling*. ICLR 2026. arXiv:2605.19091
- `CSSLab/maia2` — MIT. `maia2/model.py` (`_MODEL_ASSETS`, pinned SHA-256s), `maia2/utils.py`
  (`create_elo_dict` — the 11 buckets)
- `shermansiu/maia2-rapid` HuggingFace mirror — `license: mit`; `provenance.json` with
  `checkpoint_sha256` identical to the digest in `CSSLab/maia2`
- `CSSLab/maia3` — AGPL-3.0. `maia3/uci.py`: option declarations, `score_moves()`, `cmd_go`
- HuggingFace `UofTCSSLab/Maia3-5M` (20,968,049 B) and `UofTCSSLab/Maia3-23M` (91,799,307 B)
