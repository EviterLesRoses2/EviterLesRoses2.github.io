/* Local LaTeX typesetting. The original TeX remains editable in data-tex. */
(function () {
  'use strict';
  function renderMath(scope) {
    const nodes = [];
    if (scope.matches && scope.matches('[data-tex]:not([data-typeset])')) nodes.push(scope);
    if (scope.querySelectorAll) nodes.push(...scope.querySelectorAll('[data-tex]:not([data-typeset])'));
    nodes.forEach((el) => {
      try {
        katex.render(el.dataset.tex, el, {
          displayMode: !!el.closest('.eq'), throwOnError: true,
          strict: 'error', trust: false, output: 'htmlAndMathml',
        });
        el.dataset.typeset = 'true';
      } catch (e) {
        el.dataset.mathError = 'true';
        console.error('LaTeX typesetting failed:', el.dataset.tex, e);
      }
    });
  }
  renderMath(document);
  // Experiment tabs rebuild their labels; render any explicit TeX they add.
  new MutationObserver((records) => {
    records.forEach((r) => r.addedNodes.forEach((n) => { if (n.nodeType === 1) renderMath(n); }));
  }).observe(document.body, { childList: true, subtree: true });
})();
