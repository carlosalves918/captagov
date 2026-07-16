/* ============================================================
 * autofit.js — encolhe automaticamente a fonte de números/valores
 * até caberem em uma linha dentro do card, em vez de quebrar linha
 * ou vazar do container. Funciona tanto para as telas React quanto
 * para as telas legadas (public/js/app.js), pois observa o DOM
 * inteiro e reage a qualquer mudança.
 * ============================================================ */
(function () {
  var SELECTOR = '.stat-value, .fin-summary-value, .valor-total-lista strong';
  var MIN_FONT = 11; // nunca fica menor que isso, por legibilidade
  var STEP = 0.5;

  function autoFitOne(el) {
    if (!el.isConnected) return;

    // Guarda o tamanho "ideal" (definido no CSS) uma única vez, para
    // sempre tentar crescer de volta antes de encolher (ex: ao redimensionar
    // a janela para uma tela maior).
    if (!el.dataset.autofitMax) {
      var current = parseFloat(window.getComputedStyle(el).fontSize);
      el.dataset.autofitMax = String(current);
    }
    var max = parseFloat(el.dataset.autofitMax);

    // A largura já alocada pelo layout (flex/grid/bloco) é o alvo — ela já
    // leva em conta irmãos, padding do pai e quantas colunas cabem na tela.
    var size = max;
    el.style.fontSize = size + 'px';
    var target = el.clientWidth;
    if (!target || target <= 0) return;

    var guard = 0;
    while (el.scrollWidth > target && size > MIN_FONT && guard < 60) {
      size -= STEP;
      el.style.fontSize = size + 'px';
      guard++;
    }
  }

  function autoFitAll() {
    var els = document.querySelectorAll(SELECTOR);
    for (var i = 0; i < els.length; i++) autoFitOne(els[i]);
  }

  var raf = null;
  function schedule() {
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(autoFitAll);
  }

  function start() {
    schedule();
    window.addEventListener('resize', schedule);
    window.addEventListener('captagov:changed', schedule);

    var mo = new MutationObserver(schedule);
    mo.observe(document.body, { childList: true, subtree: true, characterData: true });

    if ('ResizeObserver' in window) {
      var ro = new ResizeObserver(schedule);
      ro.observe(document.body);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }

  // Exposto para depuração / chamadas manuais, se necessário.
  window.autoFitText = autoFitAll;
})();
