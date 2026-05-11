/* main.js - public submission form.
 *
 * Changes vs. the old 3-level version (region removed):
 *   - locations.json shape is now { Area: [City, ...] }
 *   - Two dropdowns only: Area -> City
 *   - When Area changes, City repopulates and enables; reset on clear.
 *   - All user-facing strings come from i18n.js (t(...)).
 */
(function () {
  'use strict';

  // --- element references ------------------------------------------------
  var form          = document.getElementById('submission-form');
  var thankYou      = document.getElementById('thank-you');
  var submitBtn     = document.getElementById('submit-btn');
  var submitAnother = document.getElementById('submit-another');

  var problemInput  = document.getElementById('problem');
  var areaSelect    = document.getElementById('area');
  var citySelect    = document.getElementById('city');
  var consentInput  = document.getElementById('consent');

  var problemError  = document.getElementById('problem-error');
  var areaError     = document.getElementById('area-error');
  var cityError     = document.getElementById('city-error');
  var consentError  = document.getElementById('consent-error');
  var formError     = document.getElementById('form-error');

  // --- locations data (loaded from /locations.json) ----------------------
  var LOCATIONS = {};

  function populateOptions(sel, values, placeholder) {
    sel.innerHTML = '';
    var blank = document.createElement('option');
    blank.value = '';
    blank.textContent = placeholder;
    sel.appendChild(blank);
    values.forEach(function (v) {
      var opt = document.createElement('option');
      opt.value = v;
      opt.textContent = v;
      sel.appendChild(opt);
    });
  }

  function loadLocations() {
    return fetch('/locations.json')
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (data) {
        LOCATIONS = data;
        populateOptions(areaSelect, Object.keys(LOCATIONS), t('selectArea'));
      })
      .catch(function () {
        formError.textContent = t('errLoadLocations');
        submitBtn.disabled = true;
      });
  }

  // --- cascade behaviour -------------------------------------------------
  // REMOVED: region select listener. Region no longer exists.
  areaSelect.addEventListener('change', function () {
    var area = areaSelect.value;
    if (!area) {
      populateOptions(citySelect, [], t('selectAreaFirst'));
      citySelect.disabled = true;
      return;
    }
    // Cities are already alphabetised in locations.json (Georgian order),
    // so we render them as-is.
    var cities = LOCATIONS[area] || [];
    populateOptions(citySelect, cities, t('selectCity'));
    citySelect.disabled = false;
  });

  // --- error helpers -----------------------------------------------------
  function setFieldError(inputEl, errorEl, msg) {
    errorEl.textContent = msg || '';
    if (msg) inputEl.classList.add('input-error');
    else     inputEl.classList.remove('input-error');
  }

  function clearAllErrors() {
    setFieldError(problemInput, problemError, '');
    setFieldError(areaSelect,   areaError,    '');
    setFieldError(citySelect,   cityError,    '');
    setFieldError(consentInput, consentError, '');
    formError.textContent = '';
  }

  // Auto-clear errors as the user fixes each field.
  problemInput.addEventListener('input',  function () { if (problemError.textContent) setFieldError(problemInput, problemError, ''); });
  areaSelect.addEventListener('change',   function () { if (areaError.textContent)    setFieldError(areaSelect,   areaError,    ''); });
  citySelect.addEventListener('change',   function () { if (cityError.textContent)    setFieldError(citySelect,   cityError,    ''); });
  consentInput.addEventListener('change', function () { if (consentError.textContent) setFieldError(consentInput, consentError, ''); });

  // --- validation --------------------------------------------------------
  function validate() {
    var ok = true;
    var problem = problemInput.value.trim();

    if (!problem) {
      setFieldError(problemInput, problemError, t('errProblemRequired'));
      ok = false;
    } else if (problem.length > 5000) {
      setFieldError(problemInput, problemError, t('errProblemTooLong'));
      ok = false;
    }

    if (!areaSelect.value) {
      setFieldError(areaSelect, areaError, t('errAreaRequired'));
      ok = false;
    }
    if (!citySelect.value) {
      setFieldError(citySelect, cityError, t('errCityRequired'));
      ok = false;
    }
    if (!consentInput.checked) {
      setFieldError(consentInput, consentError, t('errConsentRequired'));
      ok = false;
    }

    return ok;
  }

  // --- submit ------------------------------------------------------------
  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    clearAllErrors();
    if (!validate()) return;

    var originalLabel    = submitBtn.textContent;
    submitBtn.disabled    = true;
    submitBtn.textContent = t('submitting');

    try {
      // NOTE: body no longer includes `region`. The server-side handler
      // was updated to match.
      var res = await fetch('/api/submit', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          problem: problemInput.value.trim(),
          area:    areaSelect.value,
          city:    citySelect.value,
          consent: consentInput.checked,
        }),
      });

      var data = {};
      try { data = await res.json(); } catch (_) {}

      if (!res.ok) {
        formError.textContent = data.error || t('errSubmitFailed');
        return;
      }

      // Success: swap form for thank-you card and reset all selects.
      form.classList.add('hidden');
      thankYou.classList.remove('hidden');
      form.reset();
      // form.reset() leaves City populated; force the empty-disabled state.
      populateOptions(citySelect, [], t('selectAreaFirst'));
      citySelect.disabled = true;
      thankYou.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) {
      formError.textContent = t('errNetwork');
    } finally {
      submitBtn.disabled    = false;
      submitBtn.textContent = originalLabel;
    }
  });

  submitAnother.addEventListener('click', function () {
    thankYou.classList.add('hidden');
    form.classList.remove('hidden');
    clearAllErrors();
    problemInput.focus();
  });

  // --- kick things off ---------------------------------------------------
  loadLocations();
})();
