# Research methodology — auto-repertoire study

**Date:** 2026-08-29  
Read alongside `repertoire-study-preregistration.md` (the hypotheses) and
`auto-repertoire-prior-art.md` (the novelty claim).

---

## Framing: Design Science Research

The system is designed and evaluated within the Design Science Research (DSR) paradigm
(Hevner et al., 2004; Peffers et al., 2007 DSRM). DSR produces knowledge through the construction
and evaluation of purposeful artefacts. The two outputs are:

1. **The artefact** — the auto-repertoire system (software + interaction design).
2. **Knowledge contributions** — what we learn from building and evaluating it.

The DSR cycle: problem relevance → design and development → demonstration → evaluation →
communication. Each step is documented:

- *Problem relevance:* §1–§2 of `auto-repertoire-prior-art.md` establishes that the gap is real
  (post-hoc tools exist; live alerting does not) and explains why it is structural rather than
  accidental.
- *Design and development:* `feature_spec.md` + `design_plan.md`.
- *Demonstration:* the running system, measured per the six RQs.
- *Evaluation:* `repertoire-study-preregistration.md` gives the confirmatory analysis plan.
- *Communication:* the research documents form the basis for the paper(s).

DSR is shared with the Afrikaans AAC project; the methods write-up largely transfers.

---

## Empirical design: n-of-1 / single-case

The empirical study is a **n-of-1 / single-case experiment** (Barlow & Hersen, 1984; Shadish,
Cook & Campbell, 2002). A single participant (the author) is studied longitudinally. This is
appropriate because:

1. **The artefact is personalised.** The book is the subject's own; it cannot be shared across
   participants without losing the property being studied.
2. **The measurement requires owning the game loop.** A lab study would require participants to
   install pawnbook; the study is therefore naturalistic, not experimental.
3. **RQ5 (calibration) does not depend on n-of-1 assumptions** — it is a direct comparison of
   predicted vs observed frequencies for a known opponent model.

The single-case design does *not* support causal claims about playing strength or generalisation to
other players. RQ3 (style tolerance) and RQ4 (spaced repetition) are case-study evidence only.

### RQ4 interrupted time series

RQ4 uses a within-subject interrupted time series design (McDowall et al., 1980): deviation rate
per node before and after the node's drill card reaches stability > 10 days. The coach/drill
confound is addressed by the preregistered alternation scheme (coach-on/coach-off in pairs of 5
games); the contrast between coach-on and coach-off series is the primary analysis for RQ4.

---

## Personal informatics framing

The system is also a **personal informatics** tool (Li, Dey & Forlizzi, 2010 Stage Model):

- *Preparation phase:* the user decides to track (implicit — installing pawnbook).
- *Collection phase:* passive — deviations and refusals captured as a by-product of play.
- *Integration phase:* the book and refusal log integrate the data.
- *Reflection phase:* the coverage report, line health, and refusal analytics are reflection tools.
- *Action phase:* drill cards, gap-driven preparation.

The auto-repertoire feature extends pawnbook's existing personal informatics character (game
history, FSRS review) into the opening phase. The "zero curation cost" property (D-3 in
`decisions.md`) is specifically designed to minimise the burden in the collection and integration
phases, which Li et al. identify as the primary barriers to sustained personal informatics.

---

## Chess expertise background

Opening preparation is a well-studied component of chess expertise. Key anchors:

- **Chunking** (Chase & Simon, 1973; Gobet & Simon, 1996): expert players recognise familiar
  patterns as chunks. Opening theory is learned as move sequences, but the underlying representation
  is positional. EPD keying (position, not sequence) mirrors this.
- **Deliberate practice** (Charness et al., 2005): improvement requires focused study of weaknesses.
  The gap report and drill queue implement this: practice what you don't know, at positions you
  actually face.
- **Einstellung effect** (Bilalić et al., 2007): familiar patterns can block better solutions.
  This is the mechanism behind the "lapse" deviation type — a habitual move played when the position
  has actually changed.
- **Expertise reversal** (Kalyuga et al., 2003): instructional scaffolding that helps novices
  can hinder experts. The coach is intentionally non-intrusive (budget of 3 alerts/game; silent
  after the player stays in book).

---

## Ethics and scope

This is self-study on the author's own data. No human-subjects clearance is required.

**Scope boundary:** Adding a second participant changes this immediately. Any multi-participant
study requires UNISA ethics approval before data collection begins. The export's `--anonymise` flag
exists so the decision to share the dataset is separable from the decision to record.

---

## Honest limitations

1. **Single subject.** Case-study evidence only; no claims about other players.
2. **Book adapts while measured.** `book_version` mitigates the confound but does not eliminate it.
3. **Narrow opponent pool.** All opponents are Maia bots at fixed Elo levels. RQ5 calibration may
   not transfer to human opponents.
4. **No control condition for RQ1/RQ3.** Elo-adjustment is the only available control for opponent
   quality.
5. **Causal claims about playing strength are not supported** by this design and will not be made.
6. **Prior-art survey has a shelf life.** §1 of `auto-repertoire-prior-art.md` covers a live
   commercial field; re-run before any submission.

---

## References

- Barlow, D. H. & Hersen, M. (1984). *Single Case Experimental Designs.* Pergamon Press.
- Bilalić, M. et al. (2007). Inflexibility of experts — reality or myth? *Journal of Experimental
  Psychology: General*, 136(3), 395–413.
- Charness, N. et al. (2005). The role of deliberate practice in chess expertise. *Applied Cognitive
  Psychology*, 19(2), 151–165.
- Chase, W. G. & Simon, H. A. (1973). Perception in chess. *Cognitive Psychology*, 4(1), 55–81.
- Gobet, F. & Simon, H. A. (1996). The roles of recognition processes and look-ahead search.
  *Psychological Science*, 7(1), 52–55.
- Hevner, A. R. et al. (2004). Design science in information systems research. *MIS Quarterly*,
  28(1), 75–105.
- Kalyuga, S. et al. (2003). The expertise reversal effect. *Educational Psychologist*, 38(1), 23–31.
- Li, I., Dey, A. K., & Forlizzi, J. (2010). A stage-based model of personal informatics systems.
  *CHI 2010*, 557–566.
- McDowall, D. et al. (1980). Interrupted time series analysis. *Sage University Papers*, 21.
- Peffers, K. et al. (2007). A design science research methodology for information systems research.
  *Journal of Management Information Systems*, 24(3), 45–77.
- Shadish, W. R., Cook, T. D., & Campbell, D. T. (2002). *Experimental and Quasi-Experimental
  Designs for Generalized Causal Inference.* Houghton Mifflin.
