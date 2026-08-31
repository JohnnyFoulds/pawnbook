---
layout: home

hero:
  name: "pawnbook"
  text: "Your chess mistakes, turned into lessons."
  tagline: "Self-hosted chess trainer. Play engines, get every game analysed, drill your own mistakes with spaced repetition."
  actions:
    - theme: brand
      text: Get Started
      link: /guide/installation
    - theme: alt
      text: What is pawnbook?
      link: /guide/what-is-pawnbook

features:
  - icon: ♟
    title: Human-shaped opponents
    details: 19 opponents from Maia-1100 to Stockfish-max. Maia neural networks play like real humans at each rating level — they make human mistakes, not engine mistakes.
  - icon: 🔍
    title: Automatic analysis
    details: Every game is analysed with Stockfish and Maia after you finish. Three passes extract move grades, alternative lines, and a personalised playing-strength estimate.
  - icon: 🗂
    title: Spaced repetition
    details: Mistakes become FSRS flashcard puzzles. The drill queue shows cards just before you'd forget them. An empty queue is the win state.
  - icon: 📖
    title: Repertoire coach
    details: pawnbook silently builds a personalised opening book from your own games. Once your book is established, the coach intervenes when you deviate — in the moment, before the move commits.
  - icon: 📈
    title: Playing-strength tracking
    details: Your strength is estimated from move quality (Regan-Haworth scaled error), independent of game outcomes. A rolling aggregate over your last 10 games gives a more stable reading.
  - icon: 🏠
    title: Fully self-hosted
    details: No accounts, no cloud sync, no telemetry. Your games, repertoire, and card deck stay on your machine.
---

## How a session works

Four timescales, one loop:

1. **Move (seconds)** — play a move, see the evaluation.
2. **Game (10–30 min)** — play to a conclusion against an engine opponent. Analysis runs automatically when you finish.
3. **Session (15–40 min)** — one game plus drilling the mistakes from last time, or drill-only.
4. **Improvement (weeks)** — Elo rises, the drill queue reflects your actual weaknesses, the opening book adapts to how you really play.

## Quick install

```bash
git clone https://github.com/JohnnyFoulds/pawnbook.git
cd pawnbook
docker compose up
```

Open [http://localhost:3000](http://localhost:3000).

See [Installation](/guide/installation) for the full setup guide including engine weights and native (non-Docker) paths.
