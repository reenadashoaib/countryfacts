/* Search and region filter, random country, and flag quiz. */
(function () {
  // ----- random country -----
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('[data-random]');
    if (!a) return;
    e.preventDefault();
    fetch('/assets/data/slugs.json').then(function (r) { return r.json(); }).then(function (slugs) {
      location.href = '/country/' + slugs[Math.floor(Math.random() * slugs.length)] + '/';
    }).catch(function () { location.href = '/'; });
  });

  // ----- finder -----
  var input = document.querySelector('[data-finder]');
  if (input) {
    var grid = document.querySelector('.grid');
    var tiles = Array.prototype.slice.call(grid.querySelectorAll('a.tile'));
    var chips = Array.prototype.slice.call(document.querySelectorAll('[data-filter]'));
    var count = document.querySelector('[data-count]');
    var empty = document.querySelector('[data-empty]');
    var region = '';
    var norm = function (s) { return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim(); };

    var apply = function () {
      var q = norm(input.value);
      var shown = 0;
      tiles.forEach(function (t) {
        var ok = (!region || t.getAttribute('data-region') === region) && (!q || norm(t.getAttribute('data-search')).indexOf(q) !== -1);
        t.hidden = !ok;
        if (ok) shown++;
      });
      if (q || region) grid.setAttribute('data-filtered', ''); else grid.removeAttribute('data-filtered');
      count.textContent = shown === tiles.length ? 'Showing all ' + tiles.length : 'Showing ' + shown + ' of ' + tiles.length;
      empty.hidden = shown !== 0;
      if (!shown) empty.textContent = 'No country matches “' + input.value.trim() + '”' + (region ? ' in ' + region : '') + '. Try a capital, an official name, or another region.';
    };
    input.addEventListener('input', apply);
    chips.forEach(function (c) {
      c.addEventListener('click', function () {
        region = c.getAttribute('data-filter');
        chips.forEach(function (o) { o.setAttribute('aria-pressed', String(o === c)); });
        apply();
      });
    });
    var params = new URLSearchParams(location.search);
    if (params.get('q')) { input.value = params.get('q'); apply(); }
  }

  // ----- flag quiz -----
  var quiz = document.querySelector('[data-quiz]');
  if (quiz) {
    var flagImg = quiz.querySelector('[data-quiz-flag]');
    var opts = quiz.querySelector('[data-quiz-options]');
    var result = quiz.querySelector('[data-quiz-result]');
    var scoreEl = quiz.querySelector('[data-quiz-score]');
    var next = quiz.querySelector('[data-quiz-next]');
    var pool = [], right = 0, asked = 0;
    var pick = function (arr) { return arr[Math.floor(Math.random() * arr.length)]; };

    var round = function () {
      var answer = pick(pool);
      // Distractors from the same region make it harder; fall back to anywhere.
      var near = pool.filter(function (c) { return c.r === answer.r && c !== answer; });
      var choices = [answer];
      while (choices.length < 4) {
        var src = near.length >= 3 ? near : pool;
        var c = pick(src);
        if (choices.indexOf(c) === -1) choices.push(c);
      }
      choices.sort(function () { return Math.random() - 0.5; });
      flagImg.src = '/assets/flags/' + answer.f + '.svg';
      result.textContent = '';
      opts.innerHTML = '';
      next.hidden = true;
      choices.forEach(function (c) {
        var b = document.createElement('button');
        b.type = 'button';
        b.textContent = c.n;
        b.addEventListener('click', function () {
          asked++;
          var ok = c === answer;
          if (ok) right++;
          Array.prototype.forEach.call(opts.children, function (x) {
            x.disabled = true;
            if (x.textContent === answer.n) x.classList.add('is-right');
          });
          if (!ok) b.classList.add('is-wrong');
          result.innerHTML = (ok ? 'Correct. ' : 'Not quite. That is the flag of ') +
            (ok ? '' : '<a href="' + answer.u + '">' + answer.n + '</a>.') +
            (ok ? '<a href="' + answer.u + '">Read about ' + answer.n + '</a>.' : '');
          scoreEl.textContent = 'Score ' + right + ' of ' + asked;
          next.hidden = false;
          next.focus();
        });
        opts.appendChild(b);
      });
    };
    next.addEventListener('click', round);
    fetch('/assets/data/quiz.json').then(function (r) { return r.json(); }).then(function (d) { pool = d; round(); })
      .catch(function () { result.textContent = 'The quiz could not load. Refresh the page to try again.'; });
  }
})();
