# Voice and tone — pawnbook

## Rules

- **Describe, then hand over agency.** "You played Nf3 here and lost 22% win chance. Find something better." Not "Blunder!"
- **Numbers instead of adjectives.** "Maia 1300 finds it 31% of the time", never "most players miss this."
- **No exclamation marks in prose.** `!` and `!!` are chess notation; using them for enthusiasm makes the annotation glyphs ambiguous.
- **No praise.** No "Great job!", no "Nice find!" The eval swing and the rating are the feedback.
- **Second person, present tense, sentence case, no trailing colons on labels.**
- **Errors say what happened, what it affects, and what to do:** "Analysis failed — the engine stopped responding. Your game and rating are saved. [Retry]"
- **Empty states are never dead ends** — each carries exactly one action.

## String table

Stored at `src/shared/strings.json`. Both clients must use these strings. A regression test asserts this file and the doc agree.

```json
{
  "quiz.prompt": "Find something better.",
  "quiz.wrong_first": "Not the best. One more try.",
  "quiz.wrong_second": "Best was {san}.",
  "quiz.correct": "Correct.",
  "drill.nothing_due": "Nothing due — you're clear.",
  "drill.nothing_due_cta": "Play a game or drill ahead.",
  "drill.batch_summary": "{solved} solved · {missed} missed · next due {nextDue}",
  "game.result.won": "You won",
  "game.result.lost": "You lost",
  "game.result.drew": "Draw",
  "game.termination.checkmate": "by checkmate",
  "game.termination.resignation": "by resignation",
  "game.termination.stalemate": "by stalemate",
  "game.termination.threefold": "by threefold repetition",
  "game.termination.fifty_move": "by fifty-move rule",
  "game.termination.insufficient_material": "by insufficient material",
  "game.termination.timeout": "on time",
  "game.termination.abandoned": "game abandoned",
  "rating.provisional": "provisional",
  "opponent.drawfish_note": "unrated · plays for stalemate, so a rating against it would mean nothing",
  "error.analysis_failed": "Analysis failed — the engine stopped responding. Your game and rating are saved.",
  "error.weights_missing": "Engine weights missing: {file}. Run: make setup",
  "hint.piece_label": "Move your {piece}.",
  "tilt.suggestion": "Drill instead?",
  "streak.hidden_note": "Streak hidden.",
  "empty.no_games": "Play your first game.",
  "empty.no_puzzles_due": "Nothing due — you're clear.",
  "empty.analysis_failed": "Analysis failed."
}
```

---

## Alert copy (repertoire coach)

The alert interrupts a game. It must be direct, non-judgmental, and fast to read. The player
has just made a move and wants to keep going; the alert is a brief checkpoint, not a lesson.

**Tone:** Neutral curiosity, not reproach. The system does not know whether the move is a
mistake, an experiment, or a deliberate change. It offers information, not a verdict.

### Per-deviation-kind copy guidelines

| Kind | Headline | Sub-text | Buttons |
|---|---|---|---|
| `order_slip` | "You usually play [X] first here" | "Your move [Y] is also in your book — just in a different order." | "Play [X] first" / "Keep [Y]" |
| `lapse` | "Your book move here is [X]" | "You've drilled this position. Cost: [N] win%" | "Play [X]" / "Keep [Y]" |
| `novelty` | "New move — your book says [X]" | "Cost vs your usual: [N] win%" | "Play book move" / "Keep mine" |
| `refused_repeat` | "[Y] is a move your book won't play" | "Cost vs [X]: [N] win%" | "Play [X] instead" / "Keep [Y]" |

**Do not use:** "mistake", "wrong", "bad move", "you played poorly", "error".  
**Use instead:** "cost", "difference", "your book", "usually".

### Unranked badge

"This game is now unranked — the coach stepped in." Brief, factual. Not an apology.

### Challenge notification (post-game feed)

"Your book updated: [challenger] replaced [incumbent] at this position."  
Sub: "Reason: [plain-language rule description]. [N] games, [engine_delta] engine difference."  
Reverse link: "Undo" (not "Reject", not "Revert").

### No alert needed

When a challenge is open at a node, the node is silent. No message. The player just plays.
The reason is not explained in the UI — it would require explaining the challenge system, and
the player didn't ask.

---

## Refusal log tone

The refusal log is the player looking back at their own decisions. Frame it as a record, not
a grade. "You refused [X] here — here's how it turned out" is correct. "You got this wrong /
right" is not.

---

## Gap report tone

A gap is not a failure — it is an opportunity. "You've never faced 5...Bf5 here (expected
1 in 12 games). No book line yet." Informational, not prescriptive. The system does not tell
the player what line to add.
