/* ORIGIN — model constants and presets */
(function (global) {
  'use strict';

  const MODEL_VERSION = '1.3.0';

  // All outcome thresholds live here so the UI, report and README can quote
  // the same numbers. They are model conventions, not biological constants.
  const VERDICT_THRESHOLDS = Object.freeze({
    minTime: 55,
    minPopulation: 30,
    multicellularMinSize: 8,
    tissueMinSize: 20,
    established: Object.freeze({ mcFrac: 0.30, meanAdh: 0.30, maxCluster: 12 }),
    collapsed: Object.freeze({ mcFrac: 0.25, meanAdh: 0.28 }),
    decline: Object.freeze({ window: 20, deltaMc: -0.18 }),
    soma: Object.freeze({ minCluster: 10, geneThreshold: 0.45 })
  });

  const CONFIG = {
    worldW: 1800,
    worldH: 1125,
    maxCells: 6000,
    gridW: 180,
    gridH: 112,
    dt: 1 / 60,
    initialCells: 320,
    initialClades: 6,
    bondRange: 1.42,
    bondMinAdhesion: 0.25,
    maxBonds: 32000,
    maxBondsPerCell: 7,
    pulseInterval: 5,
    metricsInterval: 0.25,
    historyInterval: 1,
    historyLimit: 280,
    stepsPerFrameBase: 2
  };

  const DEFAULT_PARAMS = {
    mutationRate: 0.05,
    groupSelection: 0.9,
    nutrientSupply: 1.0,
    adhesionCost: 0.15,
    cooperationCost: 0.02,
    seed: 20261103
  };

  const PRESETS = {
    control: {
      label: 'Kontrol',
      sub: 'Bireysel seçilim',
      params: {
        mutationRate: 0.05, groupSelection: 0, nutrientSupply: 1.0,
        adhesionCost: 0.15, cooperationCost: 0.02, seed: 4117
      }
    },
    group: {
      label: 'Grup seçilimi',
      sub: 'Çok düzeyli seçilim',
      params: {
        mutationRate: 0.05, groupSelection: 0.9, nutrientSupply: 1.0,
        adhesionCost: 0.15, cooperationCost: 0.02, seed: 20261103
      }
    },
    predation: {
      label: 'Güçlü baskı',
      sub: 'Predasyon benzeri',
      params: {
        mutationRate: 0.06, groupSelection: 1.0, nutrientSupply: 1.1,
        adhesionCost: 0.15, cooperationCost: 0.02, seed: 90210
      }
    },
    mutation: {
      label: 'Yüksek mutasyon',
      sub: 'Grup seçilimi 0.75',
      params: {
        mutationRate: 0.14, groupSelection: 0.75, nutrientSupply: 1.0,
        adhesionCost: 0.15, cooperationCost: 0.02, seed: 777
      }
    }
  };

  const GENE_LABELS = ['Yapışma', 'İşbirliği', 'Somatik kader'];
  const GENE_COLORS = ['#49e0c0', '#ffc45e', '#b69cff'];

  global.ORIGIN_CONFIG = {
    MODEL_VERSION, VERDICT_THRESHOLDS,
    CONFIG, DEFAULT_PARAMS, PRESETS, GENE_LABELS, GENE_COLORS
  };
})(typeof window !== 'undefined' ? window : globalThis);
