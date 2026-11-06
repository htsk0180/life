/* ORIGIN — canvas charts */
(function (global) {
  'use strict';

  const COL = {
    teal: '#49e0c0',
    amber: '#ffc45e',
    violet: '#b69cff',
    red: '#ff6b5e',
    grid: 'rgba(110, 190, 175, 0.10)',
    axis: 'rgba(150, 185, 178, 0.55)',
    text: 'rgba(180, 210, 202, 0.72)'
  };

  function setup(canvas) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(20, rect.width);
    const h = Math.max(20, rect.height);
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    return { ctx, w, h };
  }

  function legend(ctx, x, y, items) {
    ctx.font = '9px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.textBaseline = 'middle';
    let cx = x;
    for (const item of items) {
      ctx.fillStyle = item.color;
      ctx.fillRect(cx, y - 1.5, 6, 3);
      ctx.fillStyle = COL.text;
      ctx.fillText(item.label, cx + 9, y + 0.5);
      cx += 9 + ctx.measureText(item.label).width + 12;
    }
  }

  function drawPopulation(canvas, history) {
    const { ctx, w, h } = setup(canvas);
    const pad = { l: 30, r: 28, t: 16, b: 15 };
    const iw = w - pad.l - pad.r;
    const ih = h - pad.t - pad.b;
    const data = history.length ? history.slice(-180) : [{ t: 0, pop: 0, mcFrac: 0 }];
    const t0 = data[0].t;
    const t1 = Math.max(t0 + 1, data[data.length - 1].t);
    let maxPop = 100;
    for (const d of data) if (d.pop > maxPop) maxPop = d.pop;
    maxPop *= 1.08;

    ctx.strokeStyle = COL.grid;
    ctx.lineWidth = 1;
    for (let k = 0; k <= 2; k++) {
      const y = pad.t + ih * (k / 2);
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(pad.l + iw, y); ctx.stroke();
    }

    const X = (t) => pad.l + ((t - t0) / (t1 - t0)) * iw;
    const Y = (v) => pad.t + ih - (v / maxPop) * ih;

    const grad = ctx.createLinearGradient(0, pad.t, 0, pad.t + ih);
    grad.addColorStop(0, 'rgba(73, 224, 192, 0.26)');
    grad.addColorStop(1, 'rgba(73, 224, 192, 0.01)');
    ctx.beginPath();
    ctx.moveTo(X(data[0].t), pad.t + ih);
    for (const d of data) ctx.lineTo(X(d.t), Y(d.pop));
    ctx.lineTo(X(data[data.length - 1].t), pad.t + ih);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.beginPath();
    for (let i = 0; i < data.length; i++) {
      const d = data[i];
      if (i === 0) ctx.moveTo(X(d.t), Y(d.pop));
      else ctx.lineTo(X(d.t), Y(d.pop));
    }
    ctx.strokeStyle = COL.teal;
    ctx.lineWidth = 1.6;
    ctx.stroke();

    ctx.beginPath();
    for (let i = 0; i < data.length; i++) {
      const d = data[i];
      const y = pad.t + ih - d.mcFrac * ih;
      if (i === 0) ctx.moveTo(X(d.t), y);
      else ctx.lineTo(X(d.t), y);
    }
    ctx.strokeStyle = COL.amber;
    ctx.lineWidth = 1.2;
    ctx.setLineDash([3, 3]);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = COL.axis;
    ctx.font = '9px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillText(Math.round(maxPop), pad.l - 5, pad.t - 2);
    ctx.textBaseline = 'bottom';
    ctx.fillText('0', pad.l - 5, pad.t + ih + 2);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = 'rgba(255,196,94,0.72)';
    ctx.fillText('100%', pad.l + iw + 5, pad.t - 2);
    ctx.textBaseline = 'bottom';
    ctx.fillText('0', pad.l + iw + 5, pad.t + ih + 2);

    legend(ctx, pad.l, 8, [
      { label: 'popülasyon', color: COL.teal },
      { label: 'çok hücreli %', color: COL.amber }
    ]);
  }

  function drawGenes(canvas, history) {
    const { ctx, w, h } = setup(canvas);
    const pad = { l: 26, r: 8, t: 16, b: 14 };
    const iw = w - pad.l - pad.r;
    const ih = h - pad.t - pad.b;
    const data = history.length ? history.slice(-180) : [{ t: 0, meanAdh: 0, meanCoop: 0, meanSoma: 0 }];
    const t0 = data[0].t;
    const t1 = Math.max(t0 + 1, data[data.length - 1].t);
    const X = (t) => pad.l + ((t - t0) / (t1 - t0)) * iw;
    const Y = (v) => pad.t + ih - Math.max(0, Math.min(1, v)) * ih;

    ctx.strokeStyle = COL.grid;
    ctx.lineWidth = 1;
    for (let k = 0; k <= 4; k++) {
      const y = pad.t + ih * (k / 4);
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(pad.l + iw, y); ctx.stroke();
    }
    ctx.fillStyle = COL.axis;
    ctx.font = '8px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText('1.0', pad.l - 4, pad.t);
    ctx.fillText('0.5', pad.l - 4, pad.t + ih * 0.5);
    ctx.fillText('0', pad.l - 4, pad.t + ih);

    const series = [
      { key: 'meanAdh', color: COL.teal },
      { key: 'meanCoop', color: COL.amber },
      { key: 'meanSoma', color: COL.violet }
    ];
    for (const s of series) {
      ctx.beginPath();
      for (let i = 0; i < data.length; i++) {
        const d = data[i];
        if (i === 0) ctx.moveTo(X(d.t), Y(d[s.key]));
        else ctx.lineTo(X(d.t), Y(d[s.key]));
      }
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 1.3;
      ctx.stroke();
    }

    legend(ctx, pad.l, 8, [
      { label: 'yapışma', color: COL.teal },
      { label: 'işbirliği', color: COL.amber },
      { label: 'soma', color: COL.violet }
    ]);
  }

  function drawHistogram(canvas, metrics) {
    const { ctx, w, h } = setup(canvas);
    const labels = ['1', '2–3', '4–7', '8–15', '16–31', '32–63', '64+'];
    const hist = metrics && metrics.histogram ? metrics.histogram : [0, 0, 0, 0, 0, 0, 0];
    const pad = { l: 8, r: 8, t: 16, b: 14 };
    const iw = w - pad.l - pad.r;
    const ih = h - pad.t - pad.b;
    let max = 1;
    for (const v of hist) if (v > max) max = v;

    ctx.font = '8px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    const bw = iw / labels.length;
    for (let i = 0; i < labels.length; i++) {
      const v = hist[i];
      const bh = (v / max) * ih;
      const x = pad.l + i * bw + bw * 0.18;
      const y = pad.t + ih - bh;
      const g = ctx.createLinearGradient(0, y, 0, pad.t + ih);
      if (i >= 3) {
        g.addColorStop(0, 'rgba(73,224,192,0.95)');
        g.addColorStop(1, 'rgba(73,224,192,0.20)');
      } else {
        g.addColorStop(0, 'rgba(120,150,148,0.75)');
        g.addColorStop(1, 'rgba(120,150,148,0.12)');
      }
      ctx.fillStyle = g;
      ctx.fillRect(x, y, bw * 0.64, Math.max(1, bh));
      ctx.fillStyle = COL.text;
      ctx.fillText(labels[i], pad.l + i * bw + bw * 0.5, h - 2);
    }

    ctx.textAlign = 'left';
    ctx.fillStyle = COL.text;
    ctx.font = '9px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.fillText('KÜME BOYUTU DAĞILIMI', pad.l, 9);
  }

  global.ORIGIN_CHARTS = { drawPopulation, drawGenes, drawHistogram };
})(typeof window !== 'undefined' ? window : globalThis);
