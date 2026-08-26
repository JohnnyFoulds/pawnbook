# Player experience

## Failure, frustration, and tilt

The player loses roughly half the games by design, and every drill starts from a position where they already failed once. This game is mostly made of being wrong, so the handling of being wrong is the design.

- **Frame errors as content, not judgement.** "You played Nf3 here and lost 22% win chance. Find something better." — describes, then hands over agency. No "Blunder!" as a verdict.
- **Never stack failure.** A missed drill shows the answer and the line and the eval swing, then moves on. No score penalty, no combo break, no streak loss.
- **Loss aversion.** `Play again` keeps the same opponent and colour — the friction after a loss is choosing, and a rematch is one click.
- **Resignation needs no justification.** Not counted as anything but a loss.
- **Tilt guard, gently.** After three losses in a row the result card offers "Drill instead?" once — a suggestion, never a block, never repeated in the same session.

## Retention without dark patterns

- **The streak counts days you did anything** — one drill or one game. A participation marker, not a performance one.
- **No streak-loss notification, no "your streak is at risk", no freeze economy.** It resets quietly.
- **Never gate content on the streak.**
- **Hiding the streak** is a persisted setting (`settings.show_streak`, default 1), honoured by both clients. The browser has a toggle; the TUI has `--no-streak` as a session override. When off, the tile is absent from the dashboard — the data is never destroyed by a display preference.

FSRS is the real retention mechanic: the reason to come back is that cards are genuinely due, computed from memory research, not from an engagement target.

## Position memorisation

**The validity problem.** Puzzles keyed by FEN from your own games test recognition, not understanding. Mitigations:

1. **Follow-up requirement.** Correct first move → must find the continuation. Remembering a line means you understood the idea.
2. **`suspect_recall`.** Correct in under 2 s on the first spaced review → flagged, not silently trusted.
3. **Board mirroring** (optional, gated on no castling rights / en passant). Not shipped by default.

## Voice and tone rules

- Describe, then hand over agency: "You played Nf3 here and lost 22% win chance. Find something better."
- Numbers instead of adjectives: "Maia 1300 finds it 31% of the time", never "most players miss this"
- No exclamation marks in prose (`!` and `!!` are chess notation)
- No praise: no "Great job!", no "Nice find!" — the eval swing and the rating are the feedback
- Second person, present tense, sentence case, no trailing colons on labels
- Errors say what happened, what it affects, and what to do
- Empty states are never dead ends — each carries exactly one action
