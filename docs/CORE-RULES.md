# Rule Detective — core rules

Audience: grades 3–5. Learning target: attribute analysis, hypothesis
testing, and explicit pattern explanation.

## Canonical state

```
session = {
  version, seed, rngState, phase: "play" | "revealed" | "done",
  grammar: attributes[], rule: predicate[],
  examples: [{card, fits}], tested: [{card, fits}],
  guesses: [], budget, score
}
card = {shape, color, count, size, pattern}
predicate = {attribute, operator: "eq" | "neq", value}
```

Attributes and values come from a fixed finite grammar. A rule is a
conjunction of one or two predicates; a card fits only if every predicate
matches.

## Operations

- `testCard(card)` spends one budget unit and records the true fits result.
- `guess(rule)` is legal at least once per session; a correct guess ends the
  round.
- `reveal()` shows the rule and gives a partial score.
- `nextRound()` draws a new rule from the same grammar.

## Rules and invariants

- A generated rule always separates the example set: at least one fitting and
  one non-fitting example.
- Guesses are structured predicates, never free text.
- Testing a card cannot change its actual fits outcome.
- Difficulty adds attribute combinations, negated predicates, or noisy
  examples; it never invents attributes.

## Win and loss

Correct guess before the budget expires earns full stars; reveal after
exhausting tests earns a reduced score. No round is unwinnable for a rule in
the grammar.

## Seeded behavior

One RNG stream selects rules, example order, and round order. Same seed and
commands reproduce the session.

## Snapshot

Store version, seed, RNG state, grammar version, rule, examples, tested cards,
guesses, budget, score, and phase. Validation rejects unknown attributes or
operators, predicates outside the grammar, and duplicate card/guess records.

## Pure tests before a view

- Every generated rule has fitting and non-fitting examples.
- Conjunction and negation classification for every grammar combination.
- A card test never mutates the rule or examples.
- Structured guess equality, including reordered predicates.
- Budget exhaustion and reveal scoring.
- Snapshot round-trip and malformed-rule rejection.
