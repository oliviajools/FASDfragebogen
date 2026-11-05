(function () {
  'use strict';

  const MONTHS_DE = [
    'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
    'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'
  ];

  function formatMonth(iso) {
    if (!iso) return '\u2014';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return MONTHS_DE[d.getMonth()] + ' ' + d.getFullYear();
  }

  function formatDateDE(iso) {
    if (!iso) return '\u2014';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return String(d.getDate()).padStart(2, '0') + '.' +
      String(d.getMonth() + 1).padStart(2, '0') + '.' +
      d.getFullYear();
  }

  // --- Animierte Hochzählung (vom aktuell angezeigten Wert aus) ---
  function animateCount(el, target, duration) {
    if (!el) return;
    const start = Number(el.dataset.value || 0);
    el.dataset.value = String(target);
    if (start === target) {
      el.textContent = target.toLocaleString('de-DE');
      return;
    }
    const startTime = performance.now();
    const easeOut = function (t) { return 1 - Math.pow(1 - t, 3); };

    function tick(now) {
      const t = Math.min(1, (now - startTime) / duration);
      const value = Math.round(start + (target - start) * easeOut(t));
      el.textContent = value.toLocaleString('de-DE');
      if (t < 1) requestAnimationFrame(tick);
      else el.textContent = target.toLocaleString('de-DE');
    }
    requestAnimationFrame(tick);
  }

  function applyData(data) {
    const recs = Number(data.totalRecommendations) || 0;
    const total = Number(data.totalAssessments) || 0;

    const recEl = document.getElementById('num-recommendations');
    const totalEl = document.getElementById('num-assessments');
    const sinceEl = document.getElementById('meta-since');
    const updatedEl = document.getElementById('meta-updated');
    const rateEl = document.getElementById('meta-rate');

    animateCount(recEl, recs, 1600);
    animateCount(totalEl, total, 1600);

    if (sinceEl) sinceEl.textContent = formatMonth(data.since);
    if (updatedEl) updatedEl.textContent = formatDateDE(data.lastUpdated);

    if (rateEl) {
      if (total > 0) {
        const pct = Math.round((recs / total) * 100);
        rateEl.textContent = pct + '\u00a0% (' + recs.toLocaleString('de-DE') +
          ' von ' + total.toLocaleString('de-DE') + ')';
      } else {
        rateEl.textContent = '\u2014';
      }
    }
  }

  function showError(message) {
    const recEl = document.getElementById('num-recommendations');
    const totalEl = document.getElementById('num-assessments');
    if (recEl) recEl.textContent = '?';
    if (totalEl) totalEl.textContent = '?';
    console.error('[Counter]', message);
  }

  // --- Daten laden: primär die Datei neben der Seite (wird vom Server-Abgleich
  // sofort geschrieben), Fallback GitHub. Danach alle 5 Minuten erneut. ---
  const REFRESH_MS = 5 * 60 * 1000;
  const GITHUB_URL = 'https://raw.githubusercontent.com/oliviajools/FASDfragebogen/main/docs/counter.json';
  let hasData = false;

  function fetchJson(url) {
    return fetch(url + '?v=' + Date.now(), { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }

  function loadData() {
    fetchJson('counter.json')
      .catch(function () { return fetchJson(GITHUB_URL); })
      .then(function (data) {
        hasData = true;
        applyData(data);
      })
      .catch(function (err) {
        // Bei späteren Fehlern die zuletzt angezeigten Zahlen stehen lassen.
        if (!hasData) showError('Daten konnten nicht geladen werden: ' + err.message);
        else console.warn('[Counter] Aktualisierung fehlgeschlagen:', err.message);
      });
  }

  function startAutoRefresh() {
    setInterval(function () {
      if (document.visibilityState === 'visible') loadData();
    }, REFRESH_MS);
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') loadData();
    });
  }

  // --- Bootstrap ---
  function init() {
    const yearEl = document.getElementById('current-year');
    if (yearEl) yearEl.textContent = String(new Date().getFullYear());
    loadData();
    startAutoRefresh();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
