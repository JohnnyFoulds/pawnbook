# Voice and tone — pawnbook

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
