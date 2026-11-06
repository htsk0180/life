/* ORIGIN — application bootstrap and simulation loop */
(function () {
  'use strict';

  const CFG = window.ORIGIN_CONFIG.CONFIG;
  const canvas = document.getElementById('world');
  const errorBox = document.getElementById('webgl-error');
  let stopped = false;

  function fatal(title, detail) {
    if (!errorBox) return;
    errorBox.innerHTML = '<b>' + title + '</b><p></p>';
    const paragraph = errorBox.querySelector('p');
    if (paragraph) paragraph.textContent = detail;
    errorBox.hidden = false;
  }

  let sim;
  let renderer;
  let ui;

  try {
    sim = new window.ORIGIN_SIM(window.ORIGIN_CONFIG.DEFAULT_PARAMS);
    renderer = new window.ORIGIN_RENDERER(canvas, sim);
    ui = new window.ORIGIN_UI(sim, renderer);
  } catch (error) {
    console.error('[ORIGIN] başlatma hatası', error);
    fatal(
      'WebGL başlatılamadı',
      'Simülasyon için WebGL2 gerekir. Güncel bir Chrome, Edge, Firefox veya Safari sürümü kullanın; donanım hızlandırmasının açık olduğundan emin olun. Ayrıntı: ' +
      (error && error.message ? error.message : String(error))
    );
    return;
  }

  window.ORIGIN_APP = { sim, renderer, ui };

  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    stopped = true;
    fatal('WebGL bağlamı kayboldu', 'Ekran kartı sürücüsü bağlamı sıfırladı. Deneyi sürdürmek için sayfayı yenileyin.');
  });

  canvas.addEventListener('webglcontextrestored', () => {
    window.location.reload();
  });

  let last = performance.now();
  let accumulator = 0;

  function frame(now) {
    if (stopped) return;

    const rawDt = Math.max(0, (now - last) / 1000);
    const dtReal = Math.min(0.1, rawDt);
    last = now;

    const speed = ui.paused ? 0 : ui.speed;
    if (speed > 0) {
      accumulator += dtReal * speed;
      const maxSteps = Math.max(2, Math.ceil(speed * 2));
      let steps = 0;
      while (accumulator >= CFG.dt && steps < maxSteps) {
        sim.step(CFG.dt);
        accumulator -= CFG.dt;
        steps++;
      }
      if (steps >= maxSteps) accumulator = 0;
    } else {
      accumulator = 0;
    }

    renderer.render(now);
    ui.update(now, Math.min(1, rawDt));

    window.requestAnimationFrame(frame);
  }

  window.requestAnimationFrame(frame);
})();
