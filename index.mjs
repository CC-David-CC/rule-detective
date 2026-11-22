import {connectGameFiles} from '@webos/learning-game-core/workspace';
import {RuleDetectiveSession, ATTRIBUTES} from './model.mjs';
import {computeLayout} from './layout.mjs';

function formatCard(card) {
  if (!card) return '';
  return `${card.count} ${card.size} ${card.pattern} ${card.color} ${card.shape}(s)`;
}

function createElement(host, tag, className, text) {
  if (host?.ui?.make) {
    return host.ui.make(tag, className, text);
  }
  if (typeof document !== 'undefined') {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text) el.textContent = text;
    return el;
  }
  return {
    tagName: tag.toUpperCase(),
    className: className || '',
    dataset: {},
    children: [],
    style: {},
    append(...kids) { this.children.push(...kids); },
    replaceChildren(...kids) { this.children = kids ? [...kids] : []; },
    setAttribute() {},
    removeAttribute() {},
    classList: { add() {}, remove() {}, contains() { return false; } },
    addEventListener() {},
    removeEventListener() {}
  };
}

export function mount(host, options = {}) {
  const root = createElement(host, 'div', 'window-content rule-detective-app');

  let difficulty = options.difficulty || 2;
  let session = new RuleDetectiveSession(`detective-${Date.now()}`, difficulty);
  let builderAttribute = 'shape';
  let builderValue = 'circle';
  let disposed = false;
  let resizeObserver = null;

  // Header
  const header = createElement(host, 'header', 'detective-header');
  const titleGroup = createElement(host, 'div', 'detective-title-group');
  const title = createElement(host, 'h1', 'detective-title', '🕵️ Rule Detective');
  titleGroup.append(title);

  const stats = createElement(host, 'div', 'detective-stats');
  const budgetBadge = createElement(host, 'span', 'detective-badge badge-budget');
  const starsBadge = createElement(host, 'span', 'detective-badge badge-stars');
  const scoreBadge = createElement(host, 'span', 'detective-badge badge-score');

  stats.append(budgetBadge, starsBadge, scoreBadge);
  header.append(titleGroup, stats);

  // Main Container
  const main = createElement(host, 'main', 'detective-main');

  // Left: Clues & Tested Cards
  const cluesSection = createElement(host, 'section', 'detective-clues-section');
  cluesSection.setAttribute?.('aria-label', 'Evidence Cards');
  const cluesList = createElement(host, 'div', 'detective-clues-list');
  cluesSection.append(cluesList);

  // Right: Rule Hypothesis Workbench
  const workbench = createElement(host, 'section', 'detective-workbench');
  workbench.setAttribute?.('aria-label', 'Rule Hypothesis Workbench');

  // Controls Footer
  const controls = createElement(host, 'footer', 'detective-controls');
  const hintBtn = createElement(host, 'button', 'detective-btn detective-btn-secondary', '💡 Hint');
  hintBtn.onclick = () => {
    if (session.phase === 'play') {
      const predicate = session.hint();
      if (predicate) render();
    }
  };

  const revealBtn = createElement(host, 'button', 'detective-btn detective-btn-outline', '🔍 Reveal Rule');
  revealBtn.onclick = () => {
    if (session.phase === 'play') {
      try {
        session.reveal();
        render();
      } catch {}
    }
  };

  const nextCaseBtn = createElement(host, 'button', 'detective-btn detective-btn-primary', '📁 New Case');
  nextCaseBtn.onclick = () => {
    session = new RuleDetectiveSession(`detective-${Date.now()}`, difficulty);
    render();
  };

  controls.append(hintBtn, revealBtn, nextCaseBtn);

  main.append(cluesSection, workbench);
  root.append(header, main, controls);

  function renderClues() {
    cluesList.replaceChildren();

    const titleEl = createElement(host, 'h3', 'section-subheading', 'Evidence Casebook');
    cluesList.append(titleEl);

    // Initial examples
    const examplesTitle = createElement(host, 'div', 'clues-group-title', 'Observed Examples:');
    cluesList.append(examplesTitle);

    session.examples.forEach(ex => {
      const item = createElement(host, 'div', `clue-item ${ex.fits ? 'fits-yes' : 'fits-no'}`);
      const icon = createElement(host, 'span', 'clue-icon', ex.fits ? '✅ FITS' : '❌ NO');
      const text = createElement(host, 'span', 'clue-desc', formatCard(ex.card));
      item.append(icon, text);
      cluesList.append(item);
    });

    // Tested by player
    if (session.tested.length > 0) {
      const testedTitle = createElement(host, 'div', 'clues-group-title', 'Your Lab Tests:');
      cluesList.append(testedTitle);

      session.tested.forEach(test => {
        const item = createElement(host, 'div', `clue-item ${test.fits ? 'fits-yes' : 'fits-no'}`);
        const icon = createElement(host, 'span', 'clue-icon', test.fits ? '✅ FITS' : '❌ NO');
        const text = createElement(host, 'span', 'clue-desc', formatCard(test.card));
        item.append(icon, text);
        cluesList.append(item);
      });
    }
  }

  function renderWorkbench() {
    workbench.replaceChildren();
    budgetBadge.textContent = `Test Budget: ${session.budget}`;
    starsBadge.textContent = `⭐ ${session.stars} stars`;
    scoreBadge.textContent = `Score: ${session.score}`;

    if (session.phase === 'done') {
      const card = createElement(host, 'div', 'detective-card case-solved');
      const h2 = createElement(host, 'h2', '', '🎉 Case Solved!');
      const p = createElement(host, 'p', '', `Brilliant deduction! The rule was confirmed: ${session.rule.map(p => `${p.attribute} = ${p.value}`).join(' AND ')}.`);

      const solveBtn = createElement(host, 'button', 'detective-btn detective-btn-primary', 'Investigate Next Case');
      solveBtn.onclick = () => {
        session = new RuleDetectiveSession(`detective-${Date.now()}`, difficulty);
        render();
      };

      card.append(h2, p, solveBtn);
      workbench.append(card);
      return;
    }

    if (session.phase === 'revealed') {
      const card = createElement(host, 'div', 'detective-card case-revealed');
      const h2 = createElement(host, 'h2', '', '🔍 Rule Revealed');
      const p = createElement(host, 'p', '', `The hidden rule was: ${session.rule.map(p => `${p.attribute} = ${p.value}`).join(' AND ')}.`);
      card.append(h2, p);
      workbench.append(card);
      return;
    }

    // Hypothesis Builder
    const card = createElement(host, 'div', 'detective-card hypothesis-card');
    const h3 = createElement(host, 'h3', 'hypothesis-title', 'Formulate Rule Hypothesis');
    const instructions = createElement(host, 'p', 'hypothesis-instructions', 'Choose an attribute and target value to accuse the pattern, or test a custom card:');

    // Builder controls
    const builderBox = createElement(host, 'div', 'rule-builder-box');
    const attrSelect = createElement(host, 'select', 'detective-select');
    attrSelect.setAttribute?.('aria-label', 'Rule Attribute');

    const valSelect = createElement(host, 'select', 'detective-select');
    valSelect.setAttribute?.('aria-label', 'Rule Value');

    if (typeof document !== 'undefined' && attrSelect instanceof HTMLElement) {
      Object.keys(ATTRIBUTES).forEach(attr => {
        const opt = document.createElement('option');
        opt.value = attr;
        opt.textContent = attr.toUpperCase();
        attrSelect.append(opt);
      });
      attrSelect.value = builderAttribute;

      const populateVals = () => {
        valSelect.replaceChildren();
        ATTRIBUTES[builderAttribute].forEach(v => {
          const opt = document.createElement('option');
          opt.value = String(v);
          opt.textContent = String(v);
          valSelect.append(opt);
        });
        builderValue = ATTRIBUTES[builderAttribute][0];
      };

      attrSelect.onchange = () => {
        builderAttribute = attrSelect.value;
        populateVals();
      };

      valSelect.onchange = () => {
        builderValue = isNaN(Number(valSelect.value)) ? valSelect.value : Number(valSelect.value);
      };

      populateVals();
    }

    builderBox.append(attrSelect, valSelect);

    const guessBtn = createElement(host, 'button', 'detective-btn detective-btn-primary', 'Submit Rule Accusation');
    guessBtn.onclick = () => {
      const val = isNaN(Number(builderValue)) ? builderValue : Number(builderValue);
      const guessed = [{ attribute: builderAttribute, operator: 'eq', value: val }];
      try {
        session.guess(guessed);
      } catch {}
      render();
    };

    // Test Card Generator
    const testCardBtn = createElement(host, 'button', 'detective-btn detective-btn-secondary', 'Test Sample Card (-1 Budget)');
    testCardBtn.onclick = () => {
      if (session.budget > 0) {
        const val = isNaN(Number(builderValue)) ? builderValue : Number(builderValue);
        const cardToTest = {
          shape: builderAttribute === 'shape' ? val : 'circle',
          color: builderAttribute === 'color' ? val : 'red',
          count: builderAttribute === 'count' ? val : 1,
          size: builderAttribute === 'size' ? val : 'small',
          pattern: builderAttribute === 'pattern' ? val : 'solid'
        };
        try {
          session.testCard(cardToTest);
        } catch {}
        render();
      }
    };

    card.append(h3, instructions, builderBox, guessBtn, testCardBtn);
    workbench.append(card);
  }

  function render() {
    if (disposed) return;
    renderClues();
    renderWorkbench();
  }

  const files = connectGameFiles(host, {
    header,
    id: 'rule-detective',
    title: 'Rule Detective',
    serialize: () => session.encodeSave(),
    restore(snapshot) {
      session = RuleDetectiveSession.fromSave(snapshot);
      difficulty = session.state.difficulty;
      builderAttribute = 'shape';
      builderValue = 'circle';
      render();
    },
  });

  render();

  if (typeof ResizeObserver !== 'undefined' && root.getBoundingClientRect) {
    resizeObserver = new ResizeObserver(([entry]) => {
      const {width, height} = entry.contentRect;
      const layout = computeLayout(width, height);
      if (root.dataset) root.dataset.tier = layout.tier;
    });
    resizeObserver.observe(root);
  }

  return {
    element: root,
    get session() { return session; },
    ready: files.ready,
    requestClose: files.requestClose,
    dispose() {
      files.dispose?.();
      disposed = true;
      resizeObserver?.disconnect();
      resizeObserver = null;
      root.replaceChildren?.();
    }
  };
}
