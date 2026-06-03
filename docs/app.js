/**
 * FASQ.online Ergebnisseite
 * Eigenständige Seite, die Daten aus URL-Parametern liest, das Ergebnis bewertet,
 * Empfehlungen anzeigt und Druck-/E-Mail-Funktionen bereitstellt.
 *
 * Erwartete URL-Parameter (von LimeSurvey via surveyls_url übergeben):
 *  - score:     Gesamtpunktzahl (ASSESSMENT_CURRENT_TOTAL)
 *  - age:       Alter (G02Q02_SQ001)
 *  - firstname: Vorname
 *  - lastname:  Nachname
 *  - email:     E-Mail
 *  - plz:       Postleitzahl
 *  - group:     Personengruppe (Q0.shown)
 *  - height:    Größe in cm
 *  - weight:    Gewicht in kg
 */

(function () {
  'use strict';

  // --- Konfiguration ---
  const FACHZENTRUM_EMAIL = 't.theen@fasd-fachzentrum.hamburg';

  const RECOMMENDATION_POSITIVE = 'Empfehlung einer FASD-Diagnostik';
  const RECOMMENDATION_NEGATIVE = 'Keine Empfehlung einer FASD-Diagnostik';
  const DESC_POSITIVE = 'Es bestehen Hinweise, die eine umfängliche fachärztliche Abklärung auf FASD sinnvoll machen.';
  const DESC_NEGATIVE = 'Auf Grundlage des erreichten Gesamtwerts wird aktuell keine FASD-Diagnostik empfohlen.';

  // --- Hilfsfunktionen ---
  function getParam(name, fallback) {
    const params = new URLSearchParams(window.location.search);
    const v = params.get(name);
    if (v === null || v === '') return fallback === undefined ? '' : fallback;
    // Filter out LimeSurvey EM error HTML or any HTML/script markup
    if (/<[a-z\/!][^>]*>/i.test(v)) return fallback === undefined ? '' : fallback;
    // Filter out unresolved placeholders like {G02Q02_SQ001}
    if (/^\{[^}]+\}$/.test(v.trim())) return fallback === undefined ? '' : fallback;
    return v;
  }

  function toNumber(v, fallback) {
    const n = parseFloat(v);
    return isNaN(n) ? (fallback === undefined ? 0 : fallback) : n;
  }

  function evaluateRecommendation(score, age) {
    // Logik aus LimeSurvey-LSS:
    // (score >= 55) OR ((age >= 2) AND (age <= 5) AND (score >= 45))
    return score >= 55 || (age >= 2 && age <= 5 && score >= 45);
  }

  function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value || '\u2014';
  }

  function buildMailBody(data, recommendation) {
    return [
      'FASQ.online Ergebnisbericht',
      '',
      `Name: ${data.fullName || '-'}`,
      `E-Mail: ${data.email || '-'}`,
      `Personengruppe: ${data.group || '-'}`,
      `Alter: ${data.age || '-'} Jahre`,
      `PLZ: ${data.plz || '-'}`,
      `Größe/Gewicht: ${data.height || '-'} cm / ${data.weight || '-'} kg`,
      '',
      `Erreichte Punktzahl: ${data.score}`,
      `Bewertung: ${recommendation}`
    ].join('\r\n');
  }

  function buildMailto(to, subject, body) {
    return 'mailto:' + encodeURIComponent(to) +
      '?subject=' + encodeURIComponent(subject) +
      '&body=' + encodeURIComponent(body);
  }

  function formatDateDE(date) {
    return date.toLocaleDateString('de-DE', {
      day: '2-digit', month: '2-digit', year: 'numeric'
    });
  }

  // --- Daten einlesen ---
  function readData() {
    const firstname = getParam('firstname');
    const lastname = getParam('lastname');
    const fullName = [firstname, lastname].filter(Boolean).join(' ').trim();

    const score = toNumber(getParam('score'), 0);
    const age = toNumber(getParam('age'), 0);

    return {
      firstname,
      lastname,
      fullName: fullName || '\u2014',
      age,
      ageRaw: getParam('age'),
      email: getParam('email'),
      plz: getParam('plz'),
      group: getParam('group'),
      height: getParam('height'),
      weight: getParam('weight'),
      score
    };
  }

  // --- Daten anzeigen ---
  function renderReport(data) {
    setText('data-name', data.fullName);
    setText('data-age', data.ageRaw ? data.ageRaw + ' Jahre' : '\u2014');
    setText('data-email', data.email);
    setText('data-plz', data.plz);
    setText('data-group', data.group);

    if (data.height || data.weight) {
      const h = data.height || '\u2014';
      const w = data.weight || '\u2014';
      setText('data-size', `${h} cm / ${w} kg`);
    } else {
      setText('data-size', '\u2014');
    }

    setText('data-score', String(data.score));

    const positive = evaluateRecommendation(data.score, data.age);
    const titleEl = document.getElementById('recommendation-title');
    const descEl = document.getElementById('recommendation-text');

    if (titleEl) {
      titleEl.textContent = positive ? RECOMMENDATION_POSITIVE : RECOMMENDATION_NEGATIVE;
      titleEl.classList.toggle('positive', positive);
      titleEl.classList.toggle('negative', !positive);
    }
    if (descEl) {
      descEl.textContent = positive ? DESC_POSITIVE : DESC_NEGATIVE;
    }

    return positive;
  }

  // --- Aktionen einrichten ---
  function setupActions(data, positive) {
    const recommendationText = positive ? RECOMMENDATION_POSITIVE : RECOMMENDATION_NEGATIVE;
    const body = buildMailBody(data, recommendationText);

    const mailSelf = document.getElementById('btn-mail-self');
    const mailCenter = document.getElementById('btn-mail-center');
    const printPage = document.getElementById('btn-print-page');
    const printEmpfehlung = document.getElementById('btn-print-empfehlung');
    const empfehlungSection = document.getElementById('empfehlung-section');

    if (mailSelf) {
      if (data.email) {
        mailSelf.href = buildMailto(data.email, 'FASQ.online Ergebnisbericht', body);
      } else {
        mailSelf.setAttribute('aria-disabled', 'true');
        mailSelf.style.opacity = '0.5';
        mailSelf.style.pointerEvents = 'none';
        mailSelf.title = 'Keine E-Mail-Adresse angegeben';
      }
    }

    if (mailCenter) {
      mailCenter.href = buildMailto(FACHZENTRUM_EMAIL, 'FASQ.online Ergebnisbericht zur Prüfung', body);
    }

    if (printPage) {
      printPage.addEventListener('click', function () { window.print(); });
    }

    // Empfehlungsschreiben nur anzeigen, wenn positives Ergebnis
    if (empfehlungSection) {
      empfehlungSection.style.display = positive ? '' : 'none';
    }

    if (printEmpfehlung) {
      printEmpfehlung.addEventListener('click', function () {
        openEmpfehlungWindow(data, recommendationText);
      });
    }
  }

  // --- Empfehlungs-Druck-Fenster ---
  function openEmpfehlungWindow(data, recommendationText) {
    const nameInput = document.getElementById('person-name');
    const personName = (nameInput && nameInput.value.trim()) || data.fullName || 'der betroffenen Person';

    const template = document.getElementById('empfehlung-template');
    if (!template) return;

    const clone = template.content.cloneNode(true);
    clone.querySelector('[data-field="date"]').textContent = formatDateDE(new Date());
    clone.querySelector('[data-field="name"]').textContent = personName;
    clone.querySelector('[data-field="score"]').textContent = String(data.score);
    clone.querySelector('[data-field="group"]').textContent = data.group || '\u2014';
    clone.querySelector('[data-field="recommendation"]').textContent = recommendationText;

    const wrapper = document.createElement('div');
    wrapper.appendChild(clone);
    const html = wrapper.innerHTML;

    const styles = `
      <style>
        @page { size: portrait; margin: 2cm; }
        body { font-family: Georgia, "Times New Roman", serif; color: #132235; line-height: 1.6; font-size: 14px; padding: 20px; }
        .empfehlung-print { max-width: 720px; margin: 0 auto; }
        .empfehlung-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 30px; border-bottom: 2px solid #132235; padding-bottom: 12px; }
        .empfehlung-date { text-align: right; font-size: 13px; }
        h1 { font-size: 22px; text-align: center; margin: 20px 0; }
        p { margin: 0 0 12px; }
        ul { margin: 12px 0; padding-left: 24px; }
        li { margin-bottom: 4px; }
        .signature { margin-top: 40px; }
        .muted { color: #6b7280; font-size: 12px; }
      </style>
    `;

    const win = window.open('', '_blank', 'width=820,height=900');
    if (!win) {
      alert('Bitte erlauben Sie Popups für diese Seite, damit das Empfehlungsschreiben angezeigt werden kann.');
      return;
    }
    win.document.open();
    win.document.write(
      '<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8"><title>FASQ-Empfehlung</title>' +
      styles +
      '</head><body>' + html + '</body></html>'
    );
    win.document.close();
    win.focus();
    // kurze Verzögerung, damit Inhalte gerendert sind
    setTimeout(function () {
      try { win.print(); } catch (e) { /* noop */ }
    }, 300);
  }

  // --- Bootstrap ---
  function init() {
    const yearEl = document.getElementById('current-year');
    if (yearEl) yearEl.textContent = String(new Date().getFullYear());

    const data = readData();
    const positive = renderReport(data);
    setupActions(data, positive);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
