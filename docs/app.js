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

    // Eigene Antwortübersicht (rendert Tabelle aus URL-Parametern + questions.js)
    const showAnswersBtn = document.getElementById('btn-show-answers');
    if (showAnswersBtn) {
      showAnswersBtn.addEventListener('click', function () {
        openAnswersTableWindow(data);
      });
    }

    // Empfehlungsschreiben immer ermöglichen (Text passt sich an Ergebnis an)
    if (empfehlungSection) {
      empfehlungSection.style.display = '';
    }

    if (printEmpfehlung) {
      printEmpfehlung.addEventListener('click', function () {
        openEmpfehlungWindow(data);
      });
    }

    // Heutiges Datum als Default in das Erhebungsdatum-Feld
    const assessmentDateInput = document.getElementById('assessment-date');
    if (assessmentDateInput && !assessmentDateInput.value) {
      const t = new Date();
      const iso = t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0');
      assessmentDateInput.value = iso;
    }
  }

  // --- Antwortübersicht-Tabelle ---
  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function findAnswerLabel(question, code) {
    if (!code || !question.answers || !question.answers.length) return null;
    for (let i = 0; i < question.answers.length; i++) {
      if (question.answers[i].code === code) return question.answers[i];
    }
    return null;
  }

  function isAnswered(value) {
    if (value === null || value === undefined) return false;
    const s = String(value).trim();
    if (!s) return false;
    if (/<[a-z\/!][^>]*>/i.test(s)) return false;
    if (/^\{[^}]+\}$/.test(s)) return false;
    return true;
  }

  function openAnswersTableWindow(data) {
    const questions = window.FASQ_QUESTIONS || [];
    const params = new URLSearchParams(window.location.search);

    // Gruppieren nach group
    const byGroup = {};
    const groupOrder = [];
    questions.forEach(function (q) {
      // Personalia / Eingangsfragen separat behandelt – hier nur Skala-Fragen
      if (q.type !== 'L' && q.type !== 'F' && q.type !== 'O') return;
      if (!byGroup[q.group]) { byGroup[q.group] = []; groupOrder.push(q.group); }
      byGroup[q.group].push(q);
    });

    let totalScore = 0;
    let answeredCount = 0;
    const groupSections = groupOrder.map(function (groupName) {
      const rows = byGroup[groupName].map(function (q, idx) {
        const raw = params.get(q.code);
        const answered = isAnswered(raw);
        const matched = answered ? findAnswerLabel(q, raw) : null;
        const score = matched ? Number(matched.score) || 0 : 0;
        if (answered) { answeredCount++; totalScore += score; }
        const answerCell = matched
          ? escapeHtml(matched.label)
          : (answered ? escapeHtml(raw) : '<span class="muted-cell">nicht beantwortet</span>');
        const scoreCell = matched ? String(score) : '\u2014';
        return (
          '<tr>' +
          '<td class="num">' + (idx + 1) + '</td>' +
          '<td class="qtext">' + escapeHtml(q.text) + '</td>' +
          '<td class="answer">' + answerCell + '</td>' +
          '<td class="score">' + scoreCell + '</td>' +
          '</tr>'
        );
      }).join('');

      return (
        '<section class="group-section">' +
        '<h2>' + escapeHtml(groupName) + '</h2>' +
        '<table class="answers-table">' +
        '<thead><tr><th>#</th><th>Frage</th><th>Antwort</th><th class="score-col">Score</th></tr></thead>' +
        '<tbody>' + rows + '</tbody>' +
        '</table>' +
        '</section>'
      );
    }).join('');

    const today = formatDateDE(new Date());
    const logoUrl = new URL('assets/FASD_Logo-scaled.png', window.location.href).href;
    const header = (
      '<header class="report-head">' +
      '<div class="head-left">' +
      '<img class="report-logo" src="' + escapeHtml(logoUrl) + '" alt="FASD-Fachzentrum Hamburg e.V." />' +
      '<h1>FASQ-Antwortübersicht</h1>' +
      '<p class="report-meta">' +
      (data.fullName ? '<strong>Name:</strong> ' + escapeHtml(data.fullName) + ' &middot; ' : '') +
      (data.ageRaw ? '<strong>Alter:</strong> ' + escapeHtml(data.ageRaw) + ' Jahre &middot; ' : '') +
      '<strong>Gruppe:</strong> ' + escapeHtml(data.group || '\u2014') +
      '</p>' +
      '<p class="report-meta"><strong>Datum:</strong> ' + today + '</p>' +
      '</div>' +
      '<div class="head-right">' +
      '<div class="score-box">' +
      '<div class="score-label">FASQ-Score</div>' +
      '<div class="score-value">' + escapeHtml(String(data.score)) + '</div>' +
      '<div class="score-sub">' + answeredCount + ' Fragen beantwortet</div>' +
      '</div>' +
      '</div>' +
      '</header>'
    );

    const toolbar = (
      '<div class="toolbar no-print">' +
      '<button onclick="window.print()">Drucken / PDF</button>' +
      '<button onclick="window.close()">Schließen</button>' +
      '</div>'
    );

    const styles = (
      '<style>' +
      '*{box-sizing:border-box;}' +
      'body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;color:#132235;margin:0;padding:20px 28px;line-height:1.45;background:#f5f7fa;}' +
      '.report{max-width:920px;margin:0 auto;background:white;padding:30px 36px;box-shadow:0 2px 8px rgba(0,0,0,0.08);border-radius:6px;}' +
      '.report-head{display:flex;justify-content:space-between;align-items:flex-start;gap:24px;border-bottom:2px solid #132235;padding-bottom:14px;margin-bottom:24px;}' +
      '.report-logo{max-width:160px;height:auto;display:block;margin-bottom:10px;}' +
      '.report-head h1{margin:0 0 6px;font-size:22px;}' +
      '.report-meta{margin:4px 0;font-size:13px;color:#374151;}' +
      '.score-box{background:#132235;color:white;border-radius:6px;padding:14px 20px;text-align:center;min-width:140px;}' +
      '.score-label{font-size:11px;letter-spacing:0.05em;text-transform:uppercase;opacity:0.9;}' +
      '.score-value{font-size:36px;font-weight:800;line-height:1;margin:4px 0;}' +
      '.score-sub{font-size:11px;opacity:0.8;}' +
      '.group-section{margin-bottom:28px;}' +
      '.group-section h2{font-size:15px;background:#132235;color:white;padding:8px 12px;margin:0 0 0;border-radius:4px 4px 0 0;}' +
      '.answers-table{width:100%;border-collapse:collapse;font-size:12px;}' +
      '.answers-table th,.answers-table td{border:1px solid #d8dee8;padding:6px 8px;text-align:left;vertical-align:top;}' +
      '.answers-table th{background:#eef2f7;font-weight:600;font-size:11px;}' +
      '.answers-table .num{width:32px;text-align:center;color:#6b7280;}' +
      '.answers-table .qtext{width:55%;}' +
      '.answers-table .answer{width:30%;}' +
      '.answers-table .score{width:50px;text-align:center;font-weight:600;}' +
      '.answers-table .score-col{width:50px;text-align:center;}' +
      '.muted-cell{color:#9ca3af;font-style:italic;}' +
      '.toolbar{position:sticky;top:0;background:#f5f7fa;padding:10px 0;margin-bottom:16px;display:flex;gap:10px;}' +
      '.toolbar button{padding:8px 16px;border:0;border-radius:4px;background:#132235;color:white;font-weight:600;cursor:pointer;font-size:13px;}' +
      '.toolbar button:hover{background:#0a1322;}' +
      '@media print{' +
      'body{background:white;padding:0;}' +
      '.report{box-shadow:none;border-radius:0;padding:0;max-width:100%;}' +
      '.no-print{display:none !important;}' +
      '.group-section{break-inside:avoid;}' +
      '.answers-table tr{break-inside:avoid;}' +
      '@page{size:A4 portrait;margin:1.5cm;}' +
      '}' +
      '</style>'
    );

    const html = (
      '<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8">' +
      '<title>FASQ-Antwortübersicht</title>' + styles + '</head>' +
      '<body>' + toolbar +
      '<div class="report">' + header + groupSections + '</div>' +
      '</body></html>'
    );

    const win = window.open('', '_blank', 'width=1000,height=1100');
    if (!win) {
      alert('Bitte erlauben Sie Popups für diese Seite.');
      return;
    }
    win.document.open();
    win.document.write(html);
    win.document.close();
    win.focus();
  }

  // --- Empfehlungstext basierend auf Score/Alter ---
  function buildRecommendationParagraph(score, age) {
    const positive = evaluateRecommendation(score, age);
    if (positive) {
      return 'Mit einem Gesamtwert von ' + score + ' empfehlen wir bei Kindern ab sechs Jahren, Jugendlichen und Erwachsenen dringend die fachärztliche Abklärung auf FASD. Für weitere Fragen zum Themenkomplex von FASD stehen wir in Form einer kostenlosen Erstberatung gerne zur Verfügung und verbleiben';
    }
    return 'Mit einem Gesamtwert von ' + score + ' liegt aktuell keine Empfehlung für eine fachärztliche FASD-Abklärung vor. Bei Rückfragen oder dem Wunsch nach einer Beratung stehen wir Ihnen in Form einer kostenlosen Erstberatung gerne zur Verfügung und verbleiben';
  }

  // --- Anrede zusammenbauen ---
  function buildSalutation(anrede, recipientName) {
    const a = (anrede || 'Sehr geehrte Damen und Herren').trim();
    const n = (recipientName || '').trim();
    if (a === 'Sehr geehrte Damen und Herren') return a + ',';
    if (!n) return a + ',';
    return a + ' ' + n + ',';
  }

  // --- Empfehlungs-Druck-Fenster ---
  function openEmpfehlungWindow(data) {
    const anrede = document.getElementById('anrede') ? document.getElementById('anrede').value : 'Sehr geehrte Damen und Herren';
    const recipientName = document.getElementById('recipient-name') ? document.getElementById('recipient-name').value : '';
    const relationInput = document.getElementById('relation');
    const relation = (relationInput && relationInput.value.trim()) || 'betreffende Person';
    const assessmentDateInput = document.getElementById('assessment-date');
    let assessmentDate;
    if (assessmentDateInput && assessmentDateInput.value) {
      assessmentDate = formatDateDE(new Date(assessmentDateInput.value));
    } else {
      assessmentDate = formatDateDE(new Date());
    }

    const template = document.getElementById('empfehlung-template');
    if (!template) return;

    const clone = template.content.cloneNode(true);
    clone.querySelector('[data-field="date"]').textContent = formatDateDE(new Date());
    clone.querySelector('[data-field="salutation"]').textContent = buildSalutation(anrede, recipientName);
    clone.querySelector('[data-field="assessmentDate"]').textContent = assessmentDate;
    clone.querySelector('[data-field="relation"]').textContent = relation;
    clone.querySelector('[data-field="score"]').textContent = String(data.score);
    clone.querySelector('[data-field="recommendationParagraph"]').textContent = buildRecommendationParagraph(data.score, data.age);

    const wrapper = document.createElement('div');
    wrapper.appendChild(clone);
    const html = wrapper.innerHTML;

    const styles = '<link rel="stylesheet" href="' + new URL('styles.css', window.location.href).href + '" />';

    const win = window.open('', '_blank', 'width=900,height=1100');
    if (!win) {
      alert('Bitte erlauben Sie Popups für diese Seite, damit das Empfehlungsschreiben angezeigt werden kann.');
      return;
    }
    win.document.open();
    win.document.write(
      '<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8"><title>FASQ Einschätzung</title>' +
      styles +
      '</head><body class="letter-page">' + html + '</body></html>'
    );
    win.document.close();
    win.focus();
    // Warten bis Bild + Stylesheet geladen
    setTimeout(function () {
      try { win.print(); } catch (e) { /* noop */ }
    }, 600);
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
