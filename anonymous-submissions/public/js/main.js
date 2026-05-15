/* main.js - logic for the public submission form.

   What this file does:
     1. Fetches /locations.json once on page load - this is the single source
        of truth for which Area > Region > City combinations are valid.
     2. Wires up three cascading dropdowns:
          - Area     -> populates Region, then enables it
          - Region   -> populates City,   then enables it
          - City     -> final leaf
        Changing Area resets Region and City. Changing Region resets City.
     3. Validates everything client-side (the server validates again).
     4. POSTs the result to /api/submit and shows a thank-you message.
*/
(function () {
  'use strict';

  // --- element references ------------------------------------------------
  const cookieParser = require('cookie-parser');
  var form          = document.getElementById('submission-form');
  var thankYou      = document.getElementById('thank-you');
  var submitBtn     = document.getElementById('submit-btn');
  var submitAnother = document.getElementById('submit-another');

  var problemInput  = document.getElementById('problem');
  var areaSelect    = document.getElementById('area');
  var regionSelect  = document.getElementById('region');
  var citySelect    = document.getElementById('city');
  var consentInput  = document.getElementById('consent');

  var problemError  = document.getElementById('problem-error');
  var areaError     = document.getElementById('area-error');
  var regionError   = document.getElementById('region-error');
  var cityError     = document.getElementById('city-error');
  var consentError  = document.getElementById('consent-error');
  var formError     = document.getElementById('form-error');

  // --- locations data (loaded from /locations.json) ----------------------
  var LOCATIONS = {};

  /**
   * Replace a <select>'s options with a fresh list.
   * @param {HTMLSelectElement} sel
   * @param {string[]} values        labels to show (also used as value)
   * @param {string} placeholder     first, value="" placeholder option
   */
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
        populateOptions(areaSelect, Object.keys(LOCATIONS), '-- Select area --');
      })
      .catch(function () {
        formError.textContent =
          'Could not load location data. Please refresh the page.';
        submitBtn.disabled = true;
      });
  }

  // --- cascade behaviour -------------------------------------------------
  areaSelect.addEventListener('change', function () {
    var area = areaSelect.value;
    // Reset downstream selects whenever Area changes.
    populateOptions(citySelect, [], '-- Select region first --');
    citySelect.disabled = true;

    if (!area) {
      populateOptions(regionSelect, [], '-- Select area first --');
      regionSelect.disabled = true;
      return;
    }

    var regions = Object.keys(LOCATIONS[area] || {});
    populateOptions(regionSelect, regions, '-- Select region --');
    regionSelect.disabled = false;
  });

  regionSelect.addEventListener('change', function () {
    var area   = areaSelect.value;
    var region = regionSelect.value;

    if (!area || !region) {
      populateOptions(citySelect, [], '-- Select region first --');
      citySelect.disabled = true;
      return;
    }

    var cities = (LOCATIONS[area] || {})[region] || [];
    populateOptions(citySelect, cities, '-- Select city --');
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
    setFieldError(regionSelect, regionError,  '');
    setFieldError(citySelect,   cityError,    '');
    setFieldError(consentInput, consentError, '');
    formError.textContent = '';
  }

  // Auto-clear errors as the user fixes each field.
  problemInput.addEventListener('input',  function () { if (problemError.textContent) setFieldError(problemInput, problemError, ''); });
  areaSelect.addEventListener('change',   function () { if (areaError.textContent)    setFieldError(areaSelect,   areaError,    ''); });
  regionSelect.addEventListener('change', function () { if (regionError.textContent)  setFieldError(regionSelect, regionError,  ''); });
  citySelect.addEventListener('change',   function () { if (cityError.textContent)    setFieldError(citySelect,   cityError,    ''); });
  consentInput.addEventListener('change', function () { if (consentError.textContent) setFieldError(consentInput, consentError, ''); });

  // --- validation --------------------------------------------------------
  function validate() {
    var ok = true;
    var problem = problemInput.value.trim();

    if (!problem) {
      setFieldError(problemInput, problemError, 'Please describe your problem.');
      ok = false;
    } else if (problem.length > 5000) {
      setFieldError(problemInput, problemError, 'Too long (5000 characters max).');
      ok = false;
    }

    if (!areaSelect.value) {
      setFieldError(areaSelect, areaError, 'Please select an area.');
      ok = false;
    }
    if (!regionSelect.value) {
      setFieldError(regionSelect, regionError, 'Please select a region.');
      ok = false;
    }
    if (!citySelect.value) {
      setFieldError(citySelect, cityError, 'Please select a city.');
      ok = false;
    }
    if (!consentInput.checked) {
      setFieldError(consentInput, consentError, 'You must agree to the guidelines.');
      ok = false;
    }

    return ok;
  }

  // --- submit ------------------------------------------------------------
  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    clearAllErrors();

    if (!validate()) return;

    var originalLabel = submitBtn.textContent;
    submitBtn.disabled    = true;
    submitBtn.textContent = 'Submitting...';

    try {
      var res = await fetch('/api/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          problem: problemInput.value.trim(),
          area:    areaSelect.value,
          region:  regionSelect.value,
          city:    citySelect.value,
          consent: consentInput.checked,
        }),
      });

      var data = {};
      try { data = await res.json(); } catch (_) {}

      if (!res.ok) {
        formError.textContent = data.error || 'Submission failed. Please try again.';
        return;
      }

      // Success: swap form for thank-you card and reset all selects.
      form.classList.add('hidden');
      thankYou.classList.remove('hidden');
      form.reset();
      // form.reset() leaves Region/City populated but with empty value,
      // so re-apply the initial disabled state.
      populateOptions(regionSelect, [], '-- Select area first --');
      populateOptions(citySelect,   [], '-- Select region first --');
      regionSelect.disabled = true;
      citySelect.disabled   = true;
      thankYou.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) {
      formError.textContent = 'Network error. Please try again.';
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
