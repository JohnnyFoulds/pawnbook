# Voice and tone

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
