/* SudsAway ProWash: site behaviour. Vanilla, no dependencies.
   Every feature is an enhancement; the pages work as plain HTML without it. */
(function () {
  'use strict';

  window.SW_READY = true;
  document.documentElement.className = 'js';
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Header shadow ---------- */
  var hdr = document.querySelector('.hdr');
  if (hdr) {
    var onScroll = function () { hdr.classList.toggle('is-stuck', window.scrollY > 4); };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  /* ---------- Mobile drawer ---------- */
  var burger = document.querySelector('.burger');
  var drawer = document.getElementById('drawer');
  if (burger && drawer) {
    var setOpen = function (open) {
      burger.setAttribute('aria-expanded', String(open));
      burger.setAttribute('aria-label', open ? 'Close menu' : 'Menu');
      drawer.hidden = !open;
      document.body.style.overflow = open ? 'hidden' : '';
    };
    burger.addEventListener('click', function () {
      setOpen(burger.getAttribute('aria-expanded') !== 'true');
    });
    drawer.addEventListener('click', function (e) {
      if (e.target.closest('a')) setOpen(false);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !drawer.hidden) { setOpen(false); burger.focus(); }
    });
    var wide = window.matchMedia('(min-width: 1024px)');
    var onWide = function () { if (wide.matches) setOpen(false); };
    if (wide.addEventListener) wide.addEventListener('change', onWide);
  }

  /* ---------- Scroll reveal ---------- */
  var rvs = document.querySelectorAll('.rv');
  if (reduced || !('IntersectionObserver' in window)) {
    rvs.forEach(function (el) { el.classList.add('in'); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.06 });
    rvs.forEach(function (el) { io.observe(el); });
  }

  /* ---------- Before / after sliders ----------
     --pos is how much of the before photo shows, from the left. */
  document.querySelectorAll('.ba').forEach(function (ba) {
    var set = function (pct) {
      pct = Math.max(0, Math.min(100, pct));
      ba.style.setProperty('--pos', pct + '%');
      var v = Math.round(pct);
      ba.setAttribute('aria-valuenow', String(v));
      ba.setAttribute('aria-valuetext', v === 0 ? 'After photo only'
        : v === 100 ? 'Before photo only'
        : v + '% before, ' + (100 - v) + '% after');
    };
    var fromX = function (x) {
      var r = ba.getBoundingClientRect();
      set(((x - r.left) / r.width) * 100);
    };
    var dragging = false;
    var pointer = null;
    var end = function () {
      dragging = false;
      pointer = null;
      ba.classList.remove('is-dragging');
    };
    ba.addEventListener('pointerdown', function (e) {
      if (e.button !== undefined && e.button !== 0) return;
      dragging = true;
      pointer = e.pointerId;
      ba.classList.add('is-dragging', 'is-used');
      if (ba.setPointerCapture) ba.setPointerCapture(e.pointerId);
      fromX(e.clientX);
    });
    ba.addEventListener('pointermove', function (e) {
      if (dragging && e.pointerId === pointer) fromX(e.clientX);
    });
    ba.addEventListener('pointerup', end);
    ba.addEventListener('pointercancel', end);
    ba.addEventListener('lostpointercapture', end);
    ba.addEventListener('keydown', function (e) {
      var current = parseFloat(ba.getAttribute('aria-valuenow'));
      var now = isNaN(current) ? 50 : current;
      var next = { ArrowLeft: now - 5, ArrowDown: now - 5, ArrowRight: now + 5, ArrowUp: now + 5,
                   PageDown: now - 20, PageUp: now + 20, Home: 0, End: 100 }[e.key];
      if (next === undefined) return;
      e.preventDefault();
      ba.classList.add('is-used');
      set(next);
    });
    set(50);
  });

  /* ---------- Gallery filter ---------- */
  var gf = document.querySelector('.gal-filter');
  if (gf) {
    var shots = Array.prototype.slice.call(document.querySelectorAll('.gal .shot'));
    var select = function (key, updateUrl) {
      var btn = (key && gf.querySelector('button[data-filter="' + CSS.escape(key) + '"]'))
        || gf.querySelector('button[data-filter="all"]');
      key = btn.getAttribute('data-filter');
      gf.querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-pressed', String(b === btn)); });
      shots.forEach(function (s) {
        s.hidden = key !== 'all' && s.getAttribute('data-cat') !== key;
        if (!s.hidden) s.classList.add('in');
      });
      if (updateUrl && window.history && window.URL) {
        var url = new URL(window.location.href);
        if (key === 'all') url.searchParams.delete('filter');
        else url.searchParams.set('filter', key);
        history.replaceState(null, '', url.pathname + url.search + url.hash);
      }
    };
    gf.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (b) select(b.getAttribute('data-filter'), true);
    });
    select(new URLSearchParams(window.location.search).get('filter'), false);
  }

  /* ---------- Estimate form ---------- */
  var form = document.querySelector('.qform');
  if (form) {
    // Without JS the browser's own required-field checks apply; with it, these inline ones do.
    form.noValidate = true;
    var ok = document.querySelector('.qok');
    var sendErr = form.querySelector('.qsend-err');
    var digits = function (v) { return (v || '').replace(/\D/g, ''); };
    var rules = {
      name: function (v) { return v.trim().length > 0; },
      phone: function (v) { var d = digits(v); return d.length === 10 || (d.length === 11 && d.charAt(0) === '1'); },
      email: function (v) { return !v.trim() || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.trim()); }
    };
    var validate = function (el) {
      var good = rules[el.name](el.value);
      var field = el.closest('.field');
      var err = field.querySelector('.field__err');
      field.classList.toggle('field--err', !good);
      el.setAttribute('aria-invalid', String(!good));
      if (err) {
        if (!err.id) err.id = el.id + '-err';
        if (good) el.removeAttribute('aria-describedby');
        else el.setAttribute('aria-describedby', err.id);
      }
      return good;
    };
    Object.keys(rules).forEach(function (name) {
      var el = form.elements[name];
      if (!el) return;
      el.addEventListener('blur', function () { if (el.value) validate(el); });
      el.addEventListener('input', function () {
        if (el.closest('.field').classList.contains('field--err')) validate(el);
      });
    });

    var tel = form.elements.phone;
    if (tel) {
      tel.addEventListener('input', function () {
        var d = digits(tel.value);
        if (d.length === 11 && d.charAt(0) === '1') d = d.slice(1);
        d = d.slice(0, 10);
        var out = d.length > 6 ? '(' + d.slice(0, 3) + ') ' + d.slice(3, 6) + '-' + d.slice(6)
          : d.length > 3 ? '(' + d.slice(0, 3) + ') ' + d.slice(3)
          : d;
        if (out !== tel.value) tel.value = out;
      });
    }

    var wanted = new URLSearchParams(window.location.search).get('service');
    if (wanted) {
      var box = form.querySelector('input[name="services"][value="' + CSS.escape(wanted) + '"]');
      if (box) box.checked = true;
    }

    // Fill the hidden fields Mike's inbox relies on: a sortable subject line,
    // reply-to set to the customer, and the page they asked from.
    var prepare = function () {
      var picked = Array.prototype.slice.call(form.querySelectorAll('input[name="services"]:checked'))
        .map(function (c) { return c.nextElementSibling ? c.nextElementSibling.textContent.trim() : c.value; });
      var what = picked.length === 0 ? 'Estimate request'
        : picked.length <= 2 ? picked.join(' + ')
        : picked.length + ' services';
      var town = form.elements.town ? form.elements.town.value.trim() : '';
      var who = form.elements.name.value.trim();
      form.elements._subject.value = '[SudsAway Web] ' + what + (town ? ' · ' + town : '') + ' — ' + who;
      if (form.elements._replyto && form.elements.email) form.elements._replyto.value = form.elements.email.value.trim();
      var from = form.elements['Submitted from'];
      if (from) {
        var ref = document.referrer && document.referrer.indexOf(window.location.origin) === 0
          ? document.referrer.slice(window.location.origin.length) : '';
        from.value = (ref ? ref + ' → ' : '') + window.location.pathname + window.location.search;
      }
    };

    form.addEventListener('submit', function (e) {
      var firstBad = null;
      ['name', 'phone', 'email'].forEach(function (n) {
        var el = form.elements[n];
        if (el && !validate(el) && !firstBad) firstBad = el;
      });
      if (firstBad) { e.preventDefault(); firstBad.focus(); return; }
      prepare();
      if (!window.fetch || !window.FormData) return; // plain POST, lands on thanks.html

      e.preventDefault();
      var btn = form.querySelector('button[type="submit"]');
      var label = btn.innerHTML;
      btn.disabled = true;
      btn.textContent = 'Sending…';
      if (sendErr) sendErr.hidden = true;
      fetch(form.action.replace('formsubmit.co/', 'formsubmit.co/ajax/'), {
        method: 'POST',
        body: new FormData(form),
        headers: { Accept: 'application/json' }
      }).then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json().catch(function () { return {}; });
      }).then(function (data) {
        // FormSubmit answers 200 with success "false" when the form isn't activated yet.
        if (data && String(data.success) === 'false') throw new Error(data.message || 'not delivered');
        form.hidden = true;
        if (ok) { ok.hidden = false; ok.focus(); }
      }).catch(function () {
        btn.disabled = false;
        btn.innerHTML = label;
        if (sendErr) sendErr.hidden = false;
      });
    });
  }

  /* ---------- Footer year ---------- */
  var year = String(new Date().getFullYear());
  document.querySelectorAll('[data-year]').forEach(function (el) { el.textContent = year; });
})();
