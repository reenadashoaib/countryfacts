/* Ad slots for Country Facts.
   Settings come from window.CF_ADS (assets/js/ads-config.js, generated from site.config.json).

   Slots in the page: <div class="ad" data-ad="top|footer|railLeft|railRight|tile|inContent">.
   - With an AdSense client ID and a slot ID, the slot gets an AdSense unit.
   - Without them, it shows a labelled placeholder (or hides, if showPlaceholders is false).

   Two slots are created here rather than in the HTML:
   - the bottom-right video box (corner), and
   - the full-screen ad shown between page views (popup).
   AdSense's policies don't allow its ad code in these, so they show your own
   or direct-sold creative (a video file, an image, or a video partner's tag).
   For AdSense full-screen ads, set popup.mode to "adsense-vignette" and turn on
   vignette ads in AdSense under Ads > Auto ads. */

(function () {
  var C = window.CF_ADS || {};
  var slots = C.slots || {};
  var SIZES = {
    leaderboard: 'banner, 728 × 90 on desktop',
    skyscraper: '160 × 600 vertical banner',
    halfpage: '300 × 600 vertical banner',
    rectangle: '336 × 280 rectangle',
    tile: 'Tile ad, 300 × 250',
  };

  function store(kind) {
    try { var s = window[kind]; s.setItem('cf_t', '1'); s.removeItem('cf_t'); return s; } catch (e) { return null; }
  }
  var local = store('localStorage');
  var session = store('sessionStorage');
  function get(s, k) { try { return s ? s.getItem(k) : null; } catch (e) { return null; } }
  function set(s, k, v) { try { if (s) s.setItem(k, v); } catch (e) { /* ignore */ } }

  function adsenseUnit(name) {
    var ins = document.createElement('ins');
    ins.className = 'adsbygoogle';
    ins.style.display = 'block';
    ins.setAttribute('data-ad-client', C.client);
    ins.setAttribute('data-ad-slot', slots[name]);
    if (name === 'tile' && C.tileLayoutKey) {
      ins.setAttribute('data-ad-format', 'fluid');
      ins.setAttribute('data-ad-layout-key', C.tileLayoutKey);
    } else {
      ins.setAttribute('data-ad-format', 'auto');
      ins.setAttribute('data-full-width-responsive', 'true');
    }
    return ins;
  }

  function fill(el) {
    var name = el.getAttribute('data-ad');
    var slot = el.querySelector('.ad__slot');
    if (!slot) return;
    // Skip slots hidden at this screen size (rails on mobile); AdSense errors on zero-width slots.
    if (!el.offsetWidth) return;
    if (C.client && slots[name]) {
      slot.appendChild(adsenseUnit(name));
      el.classList.add('is-live');
      try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch (e) { /* ignore */ }
    } else if (C.showPlaceholders) {
      el.classList.add('is-placeholder');
      slot.setAttribute('data-placeholder', 'Ad space: ' + (SIZES[el.getAttribute('data-size')] || 'banner'));
    } else {
      el.classList.add('is-empty');
    }
  }

  // Inserts third-party HTML so that its <script> tags run.
  function injectHtml(target, html) {
    target.innerHTML = html;
    target.querySelectorAll('script').forEach(function (old) {
      var s = document.createElement('script');
      for (var i = 0; i < old.attributes.length; i++) s.setAttribute(old.attributes[i].name, old.attributes[i].value);
      s.text = old.text;
      old.replaceWith(s);
    });
  }

  function corner() {
    var cfg = C.corner || {};
    if (!cfg.enabled) return;
    if (!cfg.showOnMobile && window.matchMedia('(max-width: 767px)').matches) return;
    if (get(session, 'cf_corner_closed')) return;
    var video = cfg.video || {};
    var hasCreative = !!(cfg.html || video.src);
    if (!hasCreative && !C.showPlaceholders) return;

    var box = document.createElement('aside');
    box.className = 'corner';
    box.setAttribute('aria-label', 'Advertisement');
    box.innerHTML = '<div class="corner__head"><span class="ad__label">Advertisement</span>' +
      '<button type="button" class="close" aria-label="Close video ad">Close</button></div><div class="corner__body"></div>';
    var body = box.querySelector('.corner__body');

    if (cfg.html) {
      injectHtml(body, cfg.html);
    } else if (video.src) {
      var v = document.createElement('video');
      v.src = video.src;
      if (video.poster) v.poster = video.poster;
      v.muted = true; v.autoplay = true; v.loop = true; v.playsInline = true;
      v.setAttribute('muted', ''); v.setAttribute('playsinline', '');
      if (video.clickUrl) {
        var a = document.createElement('a');
        a.href = video.clickUrl; a.target = '_blank'; a.rel = 'sponsored noopener';
        a.setAttribute('aria-label', 'Open advertiser site');
        a.appendChild(v); body.appendChild(a);
      } else body.appendChild(v);
    } else {
      body.classList.add('is-placeholder');
      body.textContent = 'Ad space: video, 16:9';
    }

    box.querySelector('.close').addEventListener('click', function () {
      box.classList.remove('is-open');
      set(session, 'cf_corner_closed', '1');
      var vid = box.querySelector('video'); if (vid) vid.pause();
      setTimeout(function () { box.remove(); }, 400);
    });
    document.body.appendChild(box);
    setTimeout(function () { box.classList.add('is-open'); }, Math.max(0, (cfg.delaySeconds || 0) * 1000));
  }

  // Full-screen ad shown when the visitor follows a link to another page on this site,
  // at most once every `everyHours`, and only after `afterPageviews` pages.
  function popup() {
    var cfg = C.popup || {};
    if (cfg.mode !== 'custom') return;
    var creative = cfg.creative || {};
    if (!creative.image && !C.showPlaceholders) return;

    var views = parseInt(get(local, 'cf_views') || '0', 10) + 1;
    set(local, 'cf_views', String(views));

    function due() {
      if (views < (cfg.afterPageviews || 1)) return false;
      var last = parseInt(get(local, 'cf_popup_at') || '0', 10);
      return Date.now() - last > (cfg.everyHours || 12) * 3600 * 1000;
    }

    document.addEventListener('click', function (e) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      var a = e.target.closest && e.target.closest('a[href]');
      if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
      if (a.closest('.corner, .popup, .ad')) return;
      var dest = new URL(a.href, location.href);
      if (dest.origin !== location.origin || dest.pathname === location.pathname) return;
      if (!due()) return;
      e.preventDefault();
      show(dest.href);
    });

    function show(next) {
      set(local, 'cf_popup_at', String(Date.now()));
      var wrap = document.createElement('div');
      wrap.className = 'popup';
      wrap.setAttribute('role', 'dialog');
      wrap.setAttribute('aria-modal', 'true');
      wrap.setAttribute('aria-label', 'Advertisement');
      wrap.innerHTML = '<div class="popup__card"><div class="popup__head"><span class="ad__label">Advertisement</span>' +
        '<button type="button" class="close" data-go>Close ad</button></div><div class="popup__creative"></div>' +
        '<div class="popup__foot"><button type="button" class="button" data-go>Continue to page</button></div></div>';
      var box = wrap.querySelector('.popup__creative');
      if (creative.image) {
        var img = document.createElement('img');
        img.src = creative.image; img.alt = creative.alt || 'Advertisement';
        if (creative.clickUrl) {
          var link = document.createElement('a');
          link.href = creative.clickUrl; link.target = '_blank'; link.rel = 'sponsored noopener';
          link.appendChild(img); box.appendChild(link);
        } else box.appendChild(img);
      } else {
        box.classList.add('is-placeholder');
        box.textContent = 'Ad space: full-screen ad';
      }
      function go() { location.href = next; }
      wrap.querySelectorAll('[data-go]').forEach(function (b) { b.addEventListener('click', go); });
      wrap.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') go();
        if (e.key !== 'Tab') return;
        // Keep keyboard focus inside the dialog.
        var f = wrap.querySelectorAll('a[href], button');
        var first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      });
      document.body.appendChild(wrap);
      wrap.querySelector('[data-go]').focus();
    }
  }

  function init() {
    document.querySelectorAll('.ad[data-ad]').forEach(fill);
    corner();
    popup();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
