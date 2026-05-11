/* i18n.js
 * -------
 * Tiny Georgian translation layer. No external libraries, no DOM scanning.
 *
 * - Static HTML text already lives in the .html files in Georgian.
 * - JS code (validation errors, dynamic button labels, confirms, etc.) calls
 *   t('key') to look up the right string.
 *
 * To add another language later: copy I18N into I18N_KA / I18N_EN, then pick
 * one based on document.documentElement.lang or a user preference.
 */
(function () {
  'use strict';

  window.I18N = {
    // --- public form: labels & placeholders ---
    yourProblem:        'თქვენი პრობლემა',
    problemPlaceholder: 'აღწერეთ რა ხდება...',
    problemHint:        'მაქს. 5000 სიმბოლო. გთხოვთ იყავით თავაზიანი.',
    area:               'მხარე',
    city:               'ქალაქი',
    selectArea:         '-- აირჩიეთ მხარე --',
    selectCity:         '-- აირჩიეთ ქალაქი --',
    selectAreaFirst:    '-- ჯერ აირჩიეთ მხარე --',

    // --- buttons ---
    submit:        'ანონიმურად გაგზავნა',
    submitting:    'იგზავნება...',
    submitAnother: 'კიდევ ერთის გაგზავნა',
    login:         'შესვლა',
    loggingIn:     'შემოწმება...',
    logout:        'გასვლა',
    refresh:       'განახლება',
    delete:        'წაშლა',

    // --- consent + thank-you ---
    consentText:
      'წავიკითხე წესები და მესმის, რომ ჩემი გაგზავნა ანონიმურია. ' +
      'არ შევიყვან პერსონალურ ინფორმაციას ჩემზე ან სხვა პირებზე.',
    thanksTitle:  'გმადლობთ გაგზავნისთვის!',
    thanksBody:
      'თქვენი შეტყობინება მიღებულია ანონიმურად. გვაფასებთ, რომ გვითხარით.',

    // --- public-form validation errors ---
    errProblemRequired: 'გთხოვთ აღწერეთ პრობლემა.',
    errProblemTooLong:  'ძალიან გრძელია (მაქს. 5000 სიმბოლო).',
    errAreaRequired:    'გთხოვთ აირჩიოთ მხარე.',
    errCityRequired:    'გთხოვთ აირჩიოთ ქალაქი.',
    errConsentRequired: 'უნდა დაეთანხმოთ წესებს.',
    errSubmitFailed:    'გაგზავნა ვერ მოხერხდა. გთხოვთ კიდევ სცადოთ.',
    errNetwork:         'ქსელის შეცდომა. გთხოვთ კიდევ სცადოთ.',
    errLoadLocations:   'მონაცემები ვერ ჩაიტვირთა. გთხოვთ განაახლოთ გვერდი.',

    // --- admin panel ---
    adminTitle:         'ადმინისტრატორის პანელი',
    adminLoginHint:     'შეიყვანეთ ადმინისტრატორის პაროლი შეტყობინებების სანახავად.',
    password:           'პაროლი',
    submissionsHeading: 'შეტყობინებები',
    filterPlaceholder:  'ფილტრი მხარით, ქალაქით ან ტექსტით...',
    loading:            'იტვირთება...',
    noSubmissions:      'შეტყობინებები არ არის.',
    couldNotLoad:       'შეტყობინებების ჩატვირთვა ვერ მოხერხდა.',
    confirmDelete:      'სამუდამოდ წაშალოთ ეს შეტყობინება?',
    deleteFailed:       'წაშლა ვერ მოხერხდა.',
    networkErrorDelete: 'ქსელის შეცდომა წაშლისას.',
    errPasswordRequired:'პაროლი სავალდებულოა.',
    errLoginFailed:     'შესვლა ვერ მოხერხდა.',
  };

  /** Look up a translation by key. Returns the key itself if missing,
   *  so a typo is visible in the UI instead of producing "undefined". */
  window.t = function (key) {
    return Object.prototype.hasOwnProperty.call(window.I18N, key)
      ? window.I18N[key]
      : key;
  };
})();
