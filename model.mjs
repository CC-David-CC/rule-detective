import {
  SeededRng,
  clone,
  decodeSave,
  encodeSave,
  exactKeys,
  integer,
  oneOf,
  plainObject,
} from "../shared/core.mjs";

export const RULE_DETECTIVE_APP_ID = "rule-detective";
export const RULE_DETECTIVE_CONTENT_VERSION = "rule-detective-core-1";
export const ATTRIBUTES = {
  shape: ["circle", "square", "triangle"],
  color: ["red", "blue", "green"],
  count: [1, 2, 3],
  size: ["small", "large"],
  pattern: ["solid", "striped"],
};
const ATTRIBUTE_NAMES = Object.keys(ATTRIBUTES);
const CARD_KEYS = ATTRIBUTE_NAMES;

export class RuleDetectiveSession {
  #state;
  #rng;

  constructor(seed, difficulty = 2) {
    if (plainObject(seed) && Array.isArray(seed.rule)) {
      validatePayload(seed);
      this.#state = clone(seed);
      this.#rng = SeededRng.fromState(seed.rngState);
      return;
    }
    if (!integer(difficulty, 1, 3)) throw Error("Difficulty must be 1, 2, or 3.");
    const rng = new SeededRng(seed);
    const rule = makeRule(difficulty, rng);
    const examples = makeExamples(rule, rng, difficulty);
    const state = {
      version: RULE_DETECTIVE_CONTENT_VERSION,
      seed: String(seed),
      rngState: rng.state,
      difficulty,
      phase: "play",
      rule,
      examples,
      tested: [],
      guesses: [],
      budget: 5,
      score: 0,
      stars: 0,
    };
    this.#state = state;
    this.#rng = rng;
  }

  static fromSave(text) {
    return new RuleDetectiveSession(decodeSave(text, RULE_DETECTIVE_APP_ID, RULE_DETECTIVE_CONTENT_VERSION, validatePayload));
  }

  get phase() {
    return this.#state.phase;
  }

  get rule() {
    return clone(this.#state.rule);
  }

  get examples() {
    return clone(this.#state.examples);
  }

  get tested() {
    return clone(this.#state.tested);
  }

  get budget() {
    return this.#state.budget;
  }

  get score() {
    return this.#state.score;
  }

  get stars() {
    return this.#state.stars;
  }

  get state() {
    return clone(this.#state);
  }

  testCard(card) {
    if (this.#state.phase !== "play") throw Error("The round is no longer accepting tests.");
    if (this.#state.budget <= 0) throw Error("No card tests remain.");
    validateCard(card);
    const fits = ruleMatches(this.#state.rule, card);
    this.#state.budget--;
    this.#state.tested.push({card: clone(card), fits});
    return fits;
  }

  guess(rule) {
    if (this.#state.phase !== "play") throw Error("The round is no longer accepting guesses.");
    validateRule(rule, this.#state.difficulty);
    if (this.#state.guesses.length >= 3) throw Error("No guesses remain.");
    this.#state.guesses.push(clone(rule));
    if (canonicalRule(rule) !== canonicalRule(this.#state.rule)) return false;
    this.#state.phase = "done";
    this.#state.score = 100 + this.#state.budget * 20;
    this.#state.stars = this.#state.budget >= 3 ? 3 : this.#state.budget >= 1 ? 2 : 1;
    return true;
  }

  reveal() {
    if (this.#state.phase !== "play") throw Error("The round is already finished.");
    this.#state.phase = "revealed";
    this.#state.score = this.#state.budget * 10;
    this.#state.stars = this.#state.budget >= 3 ? 2 : 1;
  }

  encodeSave() {
    this.#state.rngState = this.#rng.state;
    return encodeSave(RULE_DETECTIVE_APP_ID, clone(this.#state), RULE_DETECTIVE_CONTENT_VERSION);
  }
}

function makeRule(difficulty, rng) {
  const count = difficulty === 1 ? 1 : 2;
  return rng.shuffle(ATTRIBUTE_NAMES).slice(0, count).map(attribute => {
    const values = ATTRIBUTES[attribute];
    return {
      attribute,
      operator: difficulty >= 3 && rng.int(0, 2) === 0 ? "neq" : "eq",
      value: rng.pick(values),
    };
  });
}

function randomCard(rng) {
  return Object.fromEntries(ATTRIBUTE_NAMES.map(attribute => [attribute, rng.pick(ATTRIBUTES[attribute])]));
}

function makeExamples(rule, rng, difficulty) {
  const examples = [];
  const seen = new Set();
  for (let count = 0; count < 100 && examples.length < 4; count++) {
    const card = randomCard(rng);
    const key = JSON.stringify(card);
    const fits = ruleMatches(rule, card);
    const fitCount = examples.filter(example => example.fits).length;
    if (!seen.has(key) && (fits ? fitCount < 2 : examples.length - fitCount < 2)) {
      seen.add(key);
      examples.push({card, fits});
    }
  }
  if (examples.filter(example => example.fits).length !== 2) throw Error("Could not generate balanced rule examples.");
  if (difficulty === 3) {
    const seenCards = new Set(examples.map(example => JSON.stringify(example.card)));
    let nearMiss = null;
    for (let count = 0; count < 200 && !nearMiss; count++) {
      const card = randomCard(rng);
      if (seenCards.has(JSON.stringify(card))) continue;
      if (!ruleMatches(rule, card) && matchedPredicateCount(rule, card) === 1) nearMiss = {card, fits: false};
    }
    if (!nearMiss) throw Error("Could not generate a near-miss rule example.");
    examples.push(nearMiss);
  }
  return rng.shuffle(examples);
}

function ruleMatches(rule, card) {
  return rule.every(predicate => predicateMatches(predicate, card));
}

function predicateMatches(predicate, card) {
  return predicate.operator === "eq"
    ? card[predicate.attribute] === predicate.value
    : card[predicate.attribute] !== predicate.value;
}

function matchedPredicateCount(rule, card) {
  return rule.filter(predicate => predicateMatches(predicate, card)).length;
}

function canonicalRule(rule) {
  return JSON.stringify([...rule].sort((left, right) =>
    `${left.attribute}:${left.operator}:${left.value}`.localeCompare(`${right.attribute}:${right.operator}:${right.value}`)));
}

function validateCard(card) {
  if (!exactKeys(card, CARD_KEYS)) throw Error("Invalid card.");
  for (const attribute of ATTRIBUTE_NAMES) {
    if (!oneOf(card[attribute], ATTRIBUTES[attribute])) throw Error(`Invalid card ${attribute}.`);
  }
}

function validateRule(rule, difficulty) {
  if (!Array.isArray(rule) || rule.length < 1 || rule.length > (difficulty === 1 ? 1 : 2)) throw Error("Invalid rule.");
  const seen = new Set();
  for (const predicate of rule) {
    if (!exactKeys(predicate, ["attribute", "operator", "value"]) || !oneOf(predicate.attribute, ATTRIBUTE_NAMES) ||
        !oneOf(predicate.operator, ["eq", "neq"]) || !oneOf(predicate.value, ATTRIBUTES[predicate.attribute]) ||
        seen.has(predicate.attribute) || (predicate.operator === "neq" && difficulty < 3)) throw Error("Invalid rule predicate.");
    seen.add(predicate.attribute);
  }
}

function validatePayload(state) {
  if (!exactKeys(state, ["version", "seed", "rngState", "difficulty", "phase", "rule", "examples", "tested",
    "guesses", "budget", "score", "stars"]) || state.version !== RULE_DETECTIVE_CONTENT_VERSION ||
    typeof state.seed !== "string" || !integer(state.rngState, 0, 0xffffffff) || !integer(state.difficulty, 1, 3) ||
    !oneOf(state.phase, ["play", "revealed", "done"]) || !integer(state.budget, 0, 5) ||
    !integer(state.score, 0, 1000) || !integer(state.stars, 0, 3) ||
    !Array.isArray(state.examples) || state.examples.length !== (state.difficulty === 3 ? 5 : 4) ||
    !Array.isArray(state.tested) || state.tested.length > 5 ||
    !Array.isArray(state.guesses) || state.guesses.length > 3) throw Error("Invalid Rule Detective snapshot.");
  validateRule(state.rule, state.difficulty);
  for (const example of state.examples) {
    if (!exactKeys(example, ["card", "fits"]) || typeof example.fits !== "boolean") throw Error("Invalid rule example.");
    validateCard(example.card);
    if (example.fits !== ruleMatches(state.rule, example.card)) throw Error("Incorrect rule example.");
  }
  if (state.examples.filter(example => example.fits).length !== 2) throw Error("Unbalanced rule examples.");
  if (state.difficulty === 3 && !state.examples.some(example => !example.fits &&
      matchedPredicateCount(state.rule, example.card) === 1)) throw Error("Missing near-miss rule example.");
  for (const entry of state.tested) {
    if (!exactKeys(entry, ["card", "fits"]) || typeof entry.fits !== "boolean") throw Error("Invalid tested card.");
    validateCard(entry.card);
    if (entry.fits !== ruleMatches(state.rule, entry.card)) throw Error("Incorrect tested card.");
  }
  for (const guess of state.guesses) validateRule(guess, state.difficulty);
  if (state.budget !== 5 - state.tested.length) throw Error("Invalid test budget.");
}
