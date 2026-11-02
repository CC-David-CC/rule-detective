import assert from "node:assert/strict";
import test from "node:test";
import {RuleDetectiveSession} from "../model.mjs";

test("generated rules have balanced fitting and non-fitting examples", () => {
  for (let difficulty = 1; difficulty <= 3; difficulty++) {
    for (let seed = 0; seed < 50; seed++) {
      const session = new RuleDetectiveSession(`rule-${difficulty}-${seed}`, difficulty);
      assert.equal(session.examples.length, difficulty === 3 ? 5 : 4);
      assert.equal(session.examples.filter(example => example.fits).length, 2);
      assert.equal(session.examples.filter(example => !example.fits).length, difficulty === 3 ? 3 : 2);
    }
  }
});

test("difficulty three includes a near-miss non-fitting example", () => {
  for (let seed = 0; seed < 40; seed++) {
    const session = new RuleDetectiveSession(`near-miss-${seed}`, 3);
    const near = session.examples.filter(example => !example.fits).find(example =>
      session.rule.filter(predicate => predicate.operator === "eq"
        ? example.card[predicate.attribute] === predicate.value
        : example.card[predicate.attribute] !== predicate.value).length === 1);
    assert.ok(near, "a near-miss example must be present");
  }
});

test("hints reveal one real rule predicate and are bounded", () => {
  const session = new RuleDetectiveSession("hints", 3);
  const first = session.hint();
  assert.ok(first);
  assert.ok(session.rule.some(predicate => JSON.stringify([predicate.attribute, predicate.operator, predicate.value]) ===
    JSON.stringify([first.attribute, first.operator, first.value])));
  const second = session.hint();
  assert.ok(second);
  assert.notDeepEqual(second, first);
  assert.equal(session.hint(), null);
  assert.equal(session.report.hintsUsed, 2);
});

test("card tests spend budget without changing the rule or examples", () => {
  const session = new RuleDetectiveSession("tests", 2);
  const rule = session.rule, examples = session.examples;
  const card = structuredClone(examples[0].card);
  const result = session.testCard(card);
  assert.equal(result, examples.find(example => JSON.stringify(example.card) === JSON.stringify(card)).fits);
  assert.equal(session.budget, 4);
  assert.deepEqual(session.rule, rule);
  assert.deepEqual(session.examples, examples);
});

test("a correct structured guess ends the round once", () => {
  const session = new RuleDetectiveSession("correct", 3);
  assert.equal(session.guess(session.rule), true);
  assert.equal(session.phase, "done");
  assert.ok(session.score >= 100);
  assert.throws(() => session.guess(session.rule));
});

test("wrong guesses are bounded and reveal scores partial credit", () => {
  const session = new RuleDetectiveSession("wrong", 1);
  const wrong = [{attribute: "shape", operator: "eq", value: session.rule[0].value === "circle" ? "square" : "circle"}];
  for (let count = 0; count < 3; count++) assert.equal(session.guess(wrong), false);
  assert.throws(() => session.guess(wrong));
  session.reveal();
  assert.equal(session.phase, "revealed");
  assert.ok(session.score >= 0);
});

test("seeded sessions and snapshots reproduce the exact rule", () => {
  const one = new RuleDetectiveSession("snapshot-rule", 3);
  const two = new RuleDetectiveSession("snapshot-rule", 3);
  assert.deepEqual(one.state, two.state);
  one.testCard(two.examples[0].card);
  two.testCard(two.examples[0].card);
  const restored = RuleDetectiveSession.fromSave(two.encodeSave());
  assert.deepEqual(restored.state, two.state);
  assert.deepEqual(restored.rule, one.rule);
});

test("malformed grammar, changed examples, and invalid budgets are rejected", () => {
  const session = new RuleDetectiveSession("invalid-rule", 3);
  const valid = JSON.parse(session.encodeSave());
  for (const mutate of [
    value => { value.payload.rule[0].attribute = "texture"; },
    value => { value.payload.examples[0].fits = !value.payload.examples[0].fits; },
    value => { value.payload.budget = 4; },
    value => { value.payload.difficulty = 5; },
    value => { value.payload.hintsUsed = value.payload.hintReveals.length + 1; },
    value => { value.payload.hintReveals.push({attribute: "texture", operator: "eq", value: "red"}); },
  ]) {
    const broken = structuredClone(valid);
    mutate(broken);
    assert.throws(() => RuleDetectiveSession.fromSave(JSON.stringify(broken)));
  }
});
