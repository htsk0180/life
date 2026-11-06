/* ORIGIN — dashboard UI */
(function (global) {
  'use strict';

  const PRESETS = global.ORIGIN_CONFIG.PRESETS;
  const TH = global.ORIGIN_CONFIG.VERDICT_THRESHOLDS;
  const MODEL_VERSION = global.ORIGIN_CONFIG.MODEL_VERSION;
  const CHARTS = global.ORIGIN_CHARTS;

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const pct = (v, digits) => (v * 100).toFixed(digits == null ? 0 : digits) + '%';

  const CLADE_COLORS = [
    '#4fe0c0', '#ffc45e', '#64a8ff', '#c29bff',
    '#ff8a7a', '#9ee06b', '#5ed4e8', '#f2a0d1'
  ];

  const RAMP_CSS = {
    lineage: 'linear-gradient(90deg,#4fe0c0,#ffc45e,#64a8ff,#c29bff,#ff8a7a,#9ee06b,#5ed4e8,#f2a0d1)',
    cooperation: 'linear-gradient(90deg,#ff6b5e,#ffc45e,#49e0c0)',
    adhesion: 'linear-gradient(90deg,#2e6b94,#5ed4e8,#ffc45e)',
    soma: 'linear-gradient(90deg,#385f6b 0 49%,#ffc45e 51% 100%)'
  };

  const RAMP_LABEL = {
    lineage: 'Soy rengi',
    cooperation: 'İşbirliği geni',
    adhesion: 'Yapışma geni',
    soma: 'Somatik kader'
  };

  const GENE_BAR_COLOR = {
    adh: '#49e0c0',
    coop: '#ffc45e',
    soma: '#b69cff'
  };

  function esc(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function mmss(seconds) {
    const s = Math.max(0, Math.floor(seconds));
    const m = Math.floor(s / 60);
    return String(m).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  }

  function rgb(c) {
    return 'rgb(' + Math.round(c[0] * 255) + ',' +
      Math.round(c[1] * 255) + ',' + Math.round(c[2] * 255) + ')';
  }

  class UI {
    constructor(sim, renderer) {
      this.sim = sim;
      this.renderer = renderer;
      this.paused = false;
      this.speed = 2;
      this.preset = 'group';
      this.colorMode = 'lineage';

      this.hoverIndex = null;
      this.selectedIndex = null;
      this.lastPointer = null;
      this.tooltipVisible = false;

      this.fps = 0;
      this.fpsAcc = 0;
      this.fpsFrames = 0;

      this.lastStats = 0;
      this.lastMetrics = 0;
      this.lastCharts = 0;
      this.lastTooltip = 0;
      this.lastLogSig = '';
      this.lastStatus = null;
      this.chartDirty = true;
      this.copyTimer = 0;
      this.csvTimer = 0;
      this.reportModal = null;

      const byId = (id) => document.getElementById(id);
      this.el = {
        stage: byId('stage'),
        statGen: byId('stat-gen'),
        statTime: byId('stat-time'),
        statPop: byId('stat-pop'),
        statFps: byId('stat-fps'),
        statSeed: byId('stat-seed'),
        hudPop: byId('hud-pop'),
        hudMc: byId('hud-mc'),
        mutation: byId('mutation'),
        group: byId('group'),
        nutrient: byId('nutrient'),
        adh: byId('adh'),
        valMutation: byId('val-mutation'),
        valGroup: byId('val-group'),
        valNutrient: byId('val-nutrient'),
        valAdh: byId('val-adh'),
        play: byId('play'),
        reset: byId('reset'),
        newSeed: byId('new-seed'),
        copy: byId('copy-report'),
        downloadCsv: byId('download-csv'),
        criteria: byId('criteria'),
        speedButtons: Array.from(document.querySelectorAll('#speed [data-speed]')),
        presetButtons: Array.from(document.querySelectorAll('#presets [data-preset]')),
        colorButtons: Array.from(document.querySelectorAll('#color-modes [data-mode]')),
        ramp: byId('ramp'),
        rampLabel: byId('ramp-label'),
        tooltip: byId('tooltip'),
        verdict: byId('verdict'),
        verdictTime: byId('verdict-time'),
        verdictTitle: byId('verdict-title'),
        verdictText: byId('verdict-text'),
        verdictMeter: byId('verdict-meter'),
        verdictFoot: byId('verdict-foot'),
        mMc: byId('m-mc'),
        mCluster: byId('m-cluster'),
        mMax: byId('m-max'),
        mClusters: byId('m-clusters'),
        mAdh: byId('m-adh'),
        mCoop: byId('m-coop'),
        mSoma: byId('m-soma'),
        mGen: byId('m-gen'),
        chartPop: byId('chart-pop'),
        chartGenes: byId('chart-genes'),
        chartHist: byId('chart-hist'),
        log: byId('log'),
        logCount: byId('log-count')
      };

      this.bind();
      this.renderCriteria();
      this.syncControls();
      this.setActivePreset('group');
      this.setColorMode('lineage');
      this.updatePlayButton();
      this.update(performance.now(), 1 / 60, true);
    }

    /* -------------------------------------------------------------- */
    /* Wiring                                                         */
    /* -------------------------------------------------------------- */

    bind() {
      for (const button of this.el.presetButtons) {
        button.addEventListener('click', () => this.applyPreset(button.dataset.preset));
      }

      const params = [
        ['mutation', 'mutationRate', 'valMutation', 3],
        ['group', 'groupSelection', 'valGroup', 2],
        ['nutrient', 'nutrientSupply', 'valNutrient', 2],
        ['adh', 'adhesionCost', 'valAdh', 2]
      ];
      for (const [inputKey, paramKey, labelKey, digits] of params) {
        this.el[inputKey].addEventListener('input', () => {
          const value = parseFloat(this.el[inputKey].value);
          this.sim.setParams({ [paramKey]: value });
          this.el[labelKey].textContent = value.toFixed(digits);
          this.setActivePreset(null);
          this.chartDirty = true;
        });
      }

      this.el.play.addEventListener('click', () => {
        this.paused = !this.paused;
        this.updatePlayButton();
      });

      this.el.reset.addEventListener('click', () => {
        this.sim.reset(this.sim.params.seed);
        this.afterReset();
        this.setActivePreset(this.preset);
      });

      this.el.newSeed.addEventListener('click', () => {
        const seed = this.randomSeed();
        this.sim.params.seed = seed;
        this.sim.reset(seed);
        this.afterReset();
        this.setActivePreset(this.preset);
      });

      this.el.copy.addEventListener('click', () => this.copyReport());
      if (this.el.downloadCsv) {
        this.el.downloadCsv.addEventListener('click', () => this.downloadCSV());
      }

      for (const button of this.el.speedButtons) {
        button.addEventListener('click', () => {
          this.speed = Number(button.dataset.speed) || 1;
          for (const b of this.el.speedButtons) {
            b.classList.toggle('active', b === button);
          }
        });
      }

      for (const button of this.el.colorButtons) {
        button.addEventListener('click', () => this.setColorMode(button.dataset.mode));
      }

      this.renderer.onHover = (index, event) => {
        this.lastPointer = event ? { x: event.clientX, y: event.clientY } : null;
        this.hoverIndex = index == null ? null : index;
        if (this.hoverIndex != null) {
          this.renderTooltip(this.hoverIndex, event.clientX, event.clientY);
        } else if (this.selectedIndex != null) {
          this.refreshTooltip();
        } else {
          this.hideTooltip();
        }
      };

      this.renderer.onSelect = (index, event) => {
        if (index == null) {
          this.selectedIndex = null;
          this.hideTooltip();
          return;
        }
        this.selectedIndex = this.selectedIndex === index ? null : index;
        this.lastPointer = event ? { x: event.clientX, y: event.clientY } : this.lastPointer;
        if (this.selectedIndex == null) {
          this.hideTooltip();
        } else {
          this.renderTooltip(this.selectedIndex,
            this.lastPointer ? this.lastPointer.x : 0,
            this.lastPointer ? this.lastPointer.y : 0);
        }
      };

      window.addEventListener('resize', () => {
        this.chartDirty = true;
      });
    }

    /* -------------------------------------------------------------- */
    /* Controls                                                       */
    /* -------------------------------------------------------------- */

    renderCriteria() {
      if (!this.el.criteria) return;
      const est = TH.established;
      const col = TH.collapsed;
      const dec = TH.decline;
      const set = (key, text) => {
        const node = this.el.criteria.querySelector('[data-th="' + key + '"]');
        if (node) node.textContent = text;
      };
      set('est-mc', '%' + (est.mcFrac * 100).toFixed(0));
      set('est-adh', est.meanAdh.toFixed(2));
      set('est-cluster', String(est.maxCluster));
      set('col-mc', '%' + (col.mcFrac * 100).toFixed(0));
      set('col-adh', col.meanAdh.toFixed(2));
      set('decline-window', String(dec.window));
      set('decline-delta', Math.abs(dec.deltaMc * 100).toFixed(0));
      set('min-time', String(TH.minTime));
      set('min-pop', String(TH.minPopulation));
      set('mc-size', String(TH.multicellularMinSize));
      for (const node of document.querySelectorAll('[data-model-version]')) {
        node.textContent = 'v' + MODEL_VERSION;
      }
    }

    syncControls() {
      const p = this.sim.params;
      this.el.mutation.value = String(p.mutationRate);
      this.el.group.value = String(p.groupSelection);
      this.el.nutrient.value = String(p.nutrientSupply);
      this.el.adh.value = String(p.adhesionCost);
      this.el.valMutation.textContent = p.mutationRate.toFixed(3);
      this.el.valGroup.textContent = p.groupSelection.toFixed(2);
      this.el.valNutrient.textContent = p.nutrientSupply.toFixed(2);
      this.el.valAdh.textContent = p.adhesionCost.toFixed(2);
      this.el.statSeed.textContent = String(this.sim.seed);
    }

    updatePlayButton() {
      this.el.play.textContent = this.paused ? 'Devam et' : 'Duraklat';
      this.el.play.classList.toggle('paused', this.paused);
      this.el.play.setAttribute('aria-pressed', this.paused ? 'true' : 'false');
    }

    setActivePreset(name) {
      for (const button of this.el.presetButtons) {
        const active = button.dataset.preset === name;
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', active ? 'true' : 'false');
      }
    }

    applyPreset(name) {
      const preset = PRESETS[name];
      if (!preset) return;
      this.preset = name;
      Object.assign(this.sim.params, preset.params);
      this.sim.reset(this.sim.params.seed);
      this.afterReset();
      this.setActivePreset(name);
    }

    afterReset() {
      this.paused = false;
      this.hoverIndex = null;
      this.selectedIndex = null;
      this.lastPointer = null;
      this.hideTooltip();
      this.syncControls();
      this.updatePlayButton();
      this.chartDirty = true;
      this.lastStats = 0;
      this.lastMetrics = 0;
      this.lastCharts = 0;
      this.lastTooltip = 0;
      this.lastLogSig = '';
      this.lastStatus = null;
      this.update(performance.now(), 1 / 60, true);
    }

    randomSeed() {
      if (global.crypto && global.crypto.getRandomValues) {
        const values = new Uint32Array(1);
        global.crypto.getRandomValues(values);
        return values[0] || 1;
      }
      return (Math.floor(Math.random() * 4294967295) || 1) >>> 0;
    }

    setColorMode(mode) {
      this.colorMode = mode;
      this.renderer.setColorMode(mode);
      for (const button of this.el.colorButtons) {
        button.classList.toggle('active', button.dataset.mode === mode);
      }
      this.el.ramp.style.background = RAMP_CSS[mode] || RAMP_CSS.lineage;
      this.el.rampLabel.textContent = RAMP_LABEL[mode] || RAMP_LABEL.lineage;
      this.refreshTooltip();
    }

    /* -------------------------------------------------------------- */
    /* Per-frame updates                                              */
    /* -------------------------------------------------------------- */

    update(now, dtReal, force) {
      const dt = Number.isFinite(dtReal) ? Math.max(0, dtReal) : 0;
      this.fpsAcc += dt;
      this.fpsFrames++;
      if (this.fpsAcc >= 0.5) {
        this.fps = this.fpsFrames / this.fpsAcc;
        this.el.statFps.textContent = String(Math.round(this.fps));
        this.fpsAcc = 0;
        this.fpsFrames = 0;
      }

      if (force || now - this.lastStats >= 100) {
        this.updateStats();
        this.lastStats = now;
      }

      if (force || now - this.lastMetrics >= 250) {
        this.updateMetrics();
        this.updateVerdict();
        this.updateLog(force);
        this.lastMetrics = now;
      }

      if (force || this.chartDirty || now - this.lastCharts >= 600) {
        this.drawCharts();
        this.lastCharts = now;
        this.chartDirty = false;
      }

      if (force || now - this.lastTooltip >= 120) {
        this.refreshTooltip();
        this.lastTooltip = now;
      }
    }

    updateStats() {
      const sim = this.sim;
      const m = sim.metrics;
      this.el.statGen.textContent = String(sim.maxGen);
      this.el.statTime.textContent = mmss(sim.time);
      this.el.statPop.textContent = String(m.pop);
      this.el.statSeed.textContent = String(sim.seed);
      this.el.hudPop.textContent = String(m.pop);
      this.el.hudMc.textContent = pct(m.mcFrac, 0);
    }

    updateMetrics() {
      const m = this.sim.metrics;
      this.el.mMc.textContent = pct(m.mcFrac, 0);
      this.el.mCluster.textContent = m.meanCluster.toFixed(1);
      this.el.mMax.textContent = String(m.maxCluster);
      this.el.mClusters.textContent = String(Math.max(0, m.clusterCount - m.histogram[0]));
      this.el.mAdh.textContent = m.meanAdh.toFixed(2);
      this.el.mCoop.textContent = m.meanCoop.toFixed(2);
      this.el.mSoma.textContent = pct(m.somaFrac, 1);
      this.el.mGen.textContent = m.meanGen.toFixed(1);
    }

    updateVerdict() {
      const sim = this.sim;
      const verdict = sim.verdict;
      if (!verdict) return;

      this.el.verdict.dataset.status = verdict.status;
      this.el.verdictTime.textContent = 't = ' + sim.time.toFixed(1) + ' sn';
      this.el.verdictTitle.textContent = verdict.title;
      this.el.verdictText.textContent = verdict.text;
      this.el.verdictFoot.textContent = verdict.foot;
      const meter = clamp(Number(verdict.meter) || 0, 0, 1);
      this.el.verdictMeter.style.width = (meter * 100).toFixed(1) + '%';

      if (this.lastStatus !== verdict.status) {
        this.el.verdict.classList.remove('flash');
        void this.el.verdict.offsetWidth;
        this.el.verdict.classList.add('flash');
        this.lastStatus = verdict.status;
      }
    }

    updateLog(force) {
      const events = this.sim.events;
      const last = events.length ? events[events.length - 1].text : '';
      const signature = events.length + '|' + last;
      if (!force && signature === this.lastLogSig) return;
      this.lastLogSig = signature;

      if (!events.length) {
        this.el.log.innerHTML = '<div class="log-empty">Henüz olay yok.</div>';
        this.el.logCount.textContent = '0 olay';
        return;
      }

      const rows = [];
      for (let i = events.length - 1; i >= 0 && rows.length < 40; i--) {
        const event = events[i];
        const pulse = /darbe/i.test(event.text) ? ' pulse' : '';
        rows.push(
          '<div class="log-item' + pulse + '">' +
          '<span class="log-t">' + mmss(event.t) + '</span>' +
          '<p>' + esc(event.text) + '</p>' +
          '</div>'
        );
      }
      this.el.log.innerHTML = rows.join('');
      this.el.logCount.textContent = events.length + ' olay';
    }

    drawCharts() {
      CHARTS.drawPopulation(this.el.chartPop, this.sim.history);
      CHARTS.drawGenes(this.el.chartGenes, this.sim.history);
      CHARTS.drawHistogram(this.el.chartHist, this.sim.metrics);
    }

    /* -------------------------------------------------------------- */
    /* Tooltip                                                        */
    /* -------------------------------------------------------------- */

    refreshTooltip() {
      const sim = this.sim;
      if (this.hoverIndex != null && !sim.alive[this.hoverIndex]) this.hoverIndex = null;
      if (this.selectedIndex != null && !sim.alive[this.selectedIndex]) this.selectedIndex = null;

      const index = this.hoverIndex != null ? this.hoverIndex : this.selectedIndex;
      if (index == null) {
        this.hideTooltip();
        return;
      }

      if (this.hoverIndex != null && this.lastPointer) {
        this.renderTooltip(index, this.lastPointer.x, this.lastPointer.y);
      } else {
        const screen = this.renderer.screenFromWorld(sim.x[index], sim.y[index]);
        this.renderTooltip(index, screen.x, screen.y);
      }
    }

    renderTooltip(index, clientX, clientY) {
      const sim = this.sim;
      if (index == null || !sim.alive[index]) {
        this.hideTooltip();
        return;
      }

      const color = rgb(this.renderer.colorForCell(index));
      const cluster = sim.clusterSize[sim.clusterId[index]];
      const soma = sim.somaState[index] ? 'SOMA' : 'BÖLÜNEBİLİR';
      const gene = (label, value, barColor) => (
        '<div class="tt-gene"><span>' + label + '</span>' +
        '<i><em style="width:' + (clamp(value, 0, 1) * 100).toFixed(1) +
        '%;background:' + barColor + '"></em></i>' +
        '<b>' + value.toFixed(2) + '</b></div>'
      );

      const html =
        '<div class="tt-head"><i style="background:' + color + ';color:' + color + '"></i>' +
        'HÜCRE #' + index + '<span>' + soma + '</span></div>' +
        '<div class="tt-grid">' +
        '<div><span>Enerji</span><b>' + sim.energy[index].toFixed(2) + '</b></div>' +
        '<div><span>Yaş</span><b>' + sim.age[index].toFixed(1) + ' sn</b></div>' +
        '<div><span>Küme</span><b>' + cluster + '</b></div>' +
        '<div><span>Bağ</span><b>' + sim.bondCountArr[index] + '</b></div>' +
        '</div>' +
        gene('Yapışma', sim.gAdh[index], GENE_BAR_COLOR.adh) +
        gene('İşbirliği', sim.gCoop[index], GENE_BAR_COLOR.coop) +
        gene('Soma', sim.gSoma[index], GENE_BAR_COLOR.soma) +
        '<div class="tt-foot">NESİL ' + sim.generation[index] +
        ' · KLAD ' + sim.clade[index] +
        ' · r ' + sim.radius[index].toFixed(1) + '</div>';

      this.el.tooltip.innerHTML = html;
      this.el.tooltip.hidden = false;
      this.tooltipVisible = true;

      const stage = this.el.stage;
      const rect = stage.getBoundingClientRect();
      const width = this.el.tooltip.offsetWidth || 240;
      const height = this.el.tooltip.offsetHeight || 170;
      let x = clientX - rect.left + 16;
      let y = clientY - rect.top + 16;
      if (x + width > stage.clientWidth - 8) x = clientX - rect.left - width - 16;
      if (y + height > stage.clientHeight - 8) y = clientY - rect.top - height - 16;
      x = clamp(x, 8, Math.max(8, stage.clientWidth - width - 8));
      y = clamp(y, 8, Math.max(8, stage.clientHeight - height - 8));
      this.el.tooltip.style.left = x + 'px';
      this.el.tooltip.style.top = y + 'px';
    }

    hideTooltip() {
      if (!this.tooltipVisible && this.el.tooltip.hidden) return;
      this.el.tooltip.hidden = true;
      this.tooltipVisible = false;
    }

    /* -------------------------------------------------------------- */
    /* Report                                                         */
    /* -------------------------------------------------------------- */

    buildReport() {
      const sim = this.sim;
      const m = sim.metrics;
      const initial = sim.initialMetrics || sim._emptyMetrics();
      const p = sim.params;
      const verdict = sim.verdict || { status: '—', title: '—', text: '', foot: '' };
      const preset = this.preset ? PRESETS[this.preset] : null;
      const est = TH.established;
      const col = TH.collapsed;
      const dec = TH.decline;

      const lines = [
        'ORIGIN LAB — ÇOK HÜCRELİLİK MODEL RAPORU',
        'Model sürümü: v' + MODEL_VERSION,
        'Tarih: ' + new Date().toLocaleString('tr-TR'),
        'Seçilim rejimi: ' + (preset ? preset.label + ' (' + preset.sub + ')' : 'Özel parametreler'),
        'Tohum: ' + sim.seed,
        'Simülasyon süresi: ' + sim.time.toFixed(1) + ' sn',
        'Maksimum nesil: ' + sim.maxGen,
        '',
        'PARAMETRELER',
        '- Mutasyon oranı: ' + p.mutationRate.toFixed(3),
        '- Grup seçilimi: ' + p.groupSelection.toFixed(2),
        '- Besin arzı: ' + p.nutrientSupply.toFixed(2),
        '- Yapışma maliyeti: ' + p.adhesionCost.toFixed(2),
        '- İşbirliği maliyeti: ' + p.cooperationCost.toFixed(2),
        '',
        'DEĞERLENDİRME ÖLÇÜTLERİ',
        '- Basit çok hücrelilik kuruldu: oran > %' + (est.mcFrac * 100).toFixed(0) +
          ', ortalama yapışma > ' + est.meanAdh.toFixed(2) +
          ', en büyük küme ≥ ' + est.maxCluster + ' hücre.',
        '- Kümeleşme çöktü: oran < %' + (col.mcFrac * 100).toFixed(0) +
          ' ve ortalama yapışma < ' + col.meanAdh.toFixed(2) + '.',
        '- Geriliyor: son ' + dec.window + ' sn\'de oran ' +
          Math.abs(dec.deltaMc * 100).toFixed(0) + ' puandan fazla düştüyse.',
        '- Değerlendirme ' + TH.minTime + ' sn sonra; popülasyon < ' +
          TH.minPopulation + ' ise tükendi.',
        '- Duyarlılık: sıkı eşiklerde (oran > %40, yapışma > 0.35, küme ≥ 20) ' +
          'bu koşu “kuruldu” sayılmaz; etiket eşiklere bağlıdır.',
        '',
        'SONUÇ (model değerlendirmesi): ' + verdict.title + ' [' + verdict.status + ']',
        verdict.text,
        verdict.foot,
        '',
        'METRİKLER',
        '- Popülasyon: ' + m.pop,
        '- Çok hücreli hücre oranı: ' + pct(m.mcFrac, 1),
        '- Ortalama küme: ' + m.meanCluster.toFixed(2),
        '- En büyük küme: ' + m.maxCluster,
        '- Küme sayısı (≥2): ' + Math.max(0, m.clusterCount - m.histogram[0]),
        '- Ortalama yapışma geni: ' + m.meanAdh.toFixed(3),
        '- Ortalama işbirliği geni: ' + m.meanCoop.toFixed(3),
        '- Somatik hücre oranı: ' + pct(m.somaFrac, 2),
        '- Ortalama nesil: ' + m.meanGen.toFixed(2),
        '- Doğum / ölüm: ' + sim.births + ' / ' + sim.deaths,
        '- Başarısız doğum: ' + sim.failedSpawns,
        '- Başlangıç çok hücreli oranı: ' + pct(initial.mcFrac, 1),
        '- Başlangıç ortalama yapışma: ' + initial.meanAdh.toFixed(3),
        '- Δ çok hücreli oran: ' + ((m.mcFrac - initial.mcFrac) * 100).toFixed(1) + ' puan',
        '- Δ ortalama yapışma: ' + (m.meanAdh - initial.meanAdh).toFixed(3),
        '',
        'SON OLAYLAR'
      ];

      const recent = sim.events.slice(-10);
      if (recent.length) {
        for (const event of recent) {
          lines.push('- [' + mmss(event.t) + '] ' + event.text);
        }
      } else {
        lines.push('- (kayıt yok)');
      }

      lines.push(
        '',
        'NOT: Bu bir mekanizma deneyidir; sonuç model varsayımlarına bağlıdır.',
        'Tek koşu ve tek tohum: popülasyon düzeyinde çıkarım için çok tohumlu replikasyon gerekir.',
        '60 sn ≈ 3 ortalama nesil (maksimum soy 8–11); uzun vadeli evrimsel zaman ölçeği değildir.',
        'Ampirik dayanak: Ratcliff et al. 2012 PNAS; Herron et al. 2019 Sci Rep;',
        'Boraas et al. 1998 Evol Ecol; Hammerschmidt et al. 2014 Nature;',
        'Colizzi et al. 2020 eLife.'
      );

      return lines.join('\n');
    }

    buildCSV() {
      const sim = this.sim;
      const m = sim.metrics;
      const initial = sim.initialMetrics || sim._emptyMetrics();
      const p = sim.params;
      const verdict = sim.verdict || {};
      const preset = this.preset ? PRESETS[this.preset] : null;
      const est = TH.established;
      const col = TH.collapsed;
      const dec = TH.decline;

      const header = [
        'model_version', 'seed', 'preset_key', 'preset_label', 'time_s', 'max_generation',
        'births', 'deaths', 'failed_spawns',
        'population', 'mc_frac', 'mean_cluster', 'max_cluster', 'clusters8', 'clusters20',
        'mean_adhesion', 'mean_cooperation', 'soma_frac', 'mean_generation',
        'initial_mc_frac', 'initial_mean_adhesion', 'delta_mc_frac', 'delta_mean_adhesion',
        'verdict_status', 'verdict_title',
        'mutation_rate', 'group_selection', 'nutrient_supply',
        'adhesion_cost', 'cooperation_cost',
        'multicellular_min_size', 'established_mc_frac', 'established_mean_adhesion',
        'established_max_cluster', 'collapsed_mc_frac', 'collapsed_mean_adhesion',
        'decline_window_s', 'decline_delta_mc'
      ];
      const row = [
        MODEL_VERSION, sim.seed, this.preset || '', preset ? preset.label : 'Özel',
        sim.time.toFixed(2), sim.maxGen, sim.births, sim.deaths, sim.failedSpawns,
        m.pop, m.mcFrac.toFixed(4),
        m.meanCluster.toFixed(3), m.maxCluster, m.clusters8, m.clusters20,
        m.meanAdh.toFixed(4), m.meanCoop.toFixed(4), m.somaFrac.toFixed(4),
        m.meanGen.toFixed(2), initial.mcFrac.toFixed(4), initial.meanAdh.toFixed(4),
        (m.mcFrac - initial.mcFrac).toFixed(4), (m.meanAdh - initial.meanAdh).toFixed(4),
        verdict.status || '', verdict.title || '',
        p.mutationRate, p.groupSelection, p.nutrientSupply,
        p.adhesionCost, p.cooperationCost,
        TH.multicellularMinSize, est.mcFrac, est.meanAdh, est.maxCluster,
        col.mcFrac, col.meanAdh, dec.window, dec.deltaMc
      ];
      const cell = (value) => {
        const text = String(value == null ? '' : value);
        return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
      };
      return '\ufeff' + [header, row].map((line) => line.map(cell).join(',')).join('\r\n') + '\r\n';
    }

    downloadCSV() {
      const blob = new Blob([this.buildCSV()], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'origin-lab_' + (this.preset || 'custom') + '_seed-' + this.sim.seed + '.csv';
      document.body.appendChild(link);
      link.click();
      link.remove();
      global.setTimeout(() => URL.revokeObjectURL(url), 1000);

      const button = this.el.downloadCsv;
      if (!button) return;
      button.textContent = 'CSV indirildi ✓';
      button.classList.add('copied');
      clearTimeout(this.csvTimer);
      this.csvTimer = global.setTimeout(() => {
        button.textContent = 'CSV indir';
        button.classList.remove('copied');
      }, 1800);
    }

    copyReport() {
      const text = this.buildReport();
      const done = (ok) => {
        if (!ok) this.showReportDialog(text);
        const button = this.el.copy;
        button.textContent = ok ? 'Rapor kopyalandı ✓' : 'Rapor açıldı';
        button.classList.toggle('copied', ok);
        clearTimeout(this.copyTimer);
        this.copyTimer = global.setTimeout(() => {
          button.textContent = 'Deney raporunu kopyala';
          button.classList.remove('copied');
        }, 1800);
      };

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => done(true)).catch(() => done(this.fallbackCopy(text)));
      } else {
        done(this.fallbackCopy(text));
      }
    }

    showReportDialog(text) {
      let modal = this.reportModal;
      if (!modal) {
        modal = document.createElement('div');
        modal.id = 'report-modal';
        modal.className = 'report-modal';
        modal.hidden = true;
        modal.innerHTML =
          '<div class="report-dialog" role="dialog" aria-modal="true" aria-label="Deney raporu">' +
          '<div class="report-dialog-head"><b>Deney raporu</b>' +
          '<button type="button" class="ghost" data-close>Kapat</button></div>' +
          '<p>Panoya otomatik yazılamadı. Metni seçip ⌘C / Ctrl+C ile kopyalayabilirsiniz.</p>' +
          '<textarea readonly spellcheck="false"></textarea>' +
          '</div>';
        document.body.appendChild(modal);
        modal.addEventListener('click', (event) => {
          if (event.target === modal || event.target.hasAttribute('data-close')) {
            this.hideReportDialog();
          }
        });
        modal.addEventListener('keydown', (event) => {
          if (event.key === 'Escape') this.hideReportDialog();
        });
        this.reportModal = modal;
      }
      const area = modal.querySelector('textarea');
      area.value = text;
      modal.hidden = false;
      global.setTimeout(() => {
        area.focus();
        area.select();
      }, 30);
    }

    hideReportDialog() {
      if (!this.reportModal) return;
      this.reportModal.hidden = true;
    }

    fallbackCopy(text) {
      const area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.left = '-9999px';
      area.style.top = '0';
      document.body.appendChild(area);
      area.select();
      let ok = false;
      try {
        ok = document.execCommand('copy');
      } catch (err) {
        ok = false;
      }
      area.remove();
      return ok;
    }
  }

  global.ORIGIN_UI = UI;
})(typeof window !== 'undefined' ? window : globalThis);
