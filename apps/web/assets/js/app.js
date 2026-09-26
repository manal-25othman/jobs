/* NAQLA — app shell behaviour
 * Handoff §6 nav · §9 score drill-down · §10 toasts · §11 companion · §12 motion
 * No framework. No build step. Replace data.js with a real domain layer.
 */
(function () {
  'use strict';

  var D = window.NAQLA_DATA || {};
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Icons (Phosphor-style, 1.5px stroke, 18px) ---------- */
  var ICON = {
    home:     '<path d="M2.5 7L8 2.5 13.5 7v6.5h-11z"/>',
    career:   '<circle cx="8" cy="8" r="5.5"/><path d="M8 4.5V8l2.5 1.5"/>',
    projects: '<rect x="2" y="3" width="12" height="10" rx="2"/><path d="M2 7h12"/>',
    skills:   '<path d="M3 12l3-3 2.5 2.5L13 6"/><path d="M10 6h3v3"/>',
    profile:  '<circle cx="8" cy="5.5" r="2.5"/><path d="M3 13.5c0-2.5 2.2-4 5-4s5 1.5 5 4"/>'
  };
  function svg(body, size) {
    return '<svg width="' + (size || 18) + '" height="' + (size || 18) + '" viewBox="0 0 16 16" ' +
           'fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">' + body + '</svg>';
  }
  var LOGO =
    '<svg width="30" height="30" viewBox="0 0 160 160" fill="none" aria-hidden="true">' +
    '<circle cx="40" cy="124" r="14" fill="#1F5A4E"/>' +
    '<path d="M40 124 C40 70 70 46 104 42" stroke="#1F5A4E" stroke-width="20" stroke-linecap="round"/>' +
    '<circle cx="134" cy="40" r="10" fill="#7FC8B4"/></svg>';

  /* ---------- Locale (§5) ----------
     The shell is bilingual: direction and labels come from <html lang/dir>,
     never from hard-coded Arabic strings inside components. */
  var LANG = (document.documentElement.getAttribute('lang') || 'ar').slice(0, 2);
  var BASE = document.body && document.body.getAttribute('data-base') || '';
  var T = {
    ar: { logo: 'نَقْلة', logoAria: 'نَقْلة — الرئيسية', nav: 'التنقّل الرئيسي',
          newThing: 'يوجد جديد', ready: function (n) { return n + ' تحسينات جاهزة'; },
          how: 'كيف حُسبت؟', hide: 'إخفاء التفاصيل',
          labels: ['الرئيسية', 'مساري', 'المشاريع', 'المهارات', 'ملفي'] },
    en: { logo: 'NAQLA', logoAria: 'NAQLA — Home', nav: 'Main navigation',
          newThing: 'New activity', ready: function (n) { return n + ' improvements ready'; },
          how: 'How was this calculated?', hide: 'Hide details',
          labels: ['Home', 'My Career', 'Projects', 'Skills', 'Profile'] }
  };
  var t = T[LANG] || T.ar;

  /* ---------- Primary navigation — fixed order (§1) ---------- */
  var NAV = [
    { id: 'home',     href: 'index.html',    icon: 'home' },
    { id: 'career',   href: 'career.html',   icon: 'career' },
    { id: 'projects', href: 'projects.html', icon: 'projects', badge: 'dot' },
    { id: 'skills',   href: 'skills.html',   icon: 'skills' },
    { id: 'profile',  href: 'profile.html',  icon: 'profile',  badge: 'num' }
  ];

  function navItems(active, readyCount) {
    return NAV.map(function (n) {
      var cur = n.id === active ? ' aria-current="page"' : '';
      var badge = '';
      if (n.badge === 'dot') {
        badge = '<span class="badge-dot" aria-hidden="true"></span><span class="sr-only">' + t.newThing + '</span>';
      } else if (n.badge === 'num' && readyCount) {
        badge = '<span class="badge-num">' + readyCount + '</span>' +
                '<span class="sr-only">' + t.ready(readyCount) + '</span>';
      }
      return '<a class="nav-item" href="' + BASE + n.href + '"' + cur + '>' +
             svg(ICON[n.icon]) + t.labels[NAV.indexOf(n)] + badge + '</a>';
    }).join('');
  }

  function mountShell() {
    var active = document.body.getAttribute('data-page') || '';
    var ready = (D.notifications || []).length;

    var side = document.querySelector('[data-shell="nav"]');
    if (side) {
      side.className = 'side-nav';
      side.innerHTML =
        '<a class="side-nav__logo" href="' + BASE + 'index.html" title="' + t.logo + '" aria-label="' + t.logoAria + '">' + LOGO + '</a>' +
        navItems(active, ready) +
        '<span class="side-nav__avatar" aria-hidden="true">' + ((D.user && D.user.initial) || '') + '</span>';
    }

    var bottom = document.querySelector('[data-shell="bottom-nav"]');
    if (bottom) {
      bottom.className = 'bottom-nav';
      bottom.setAttribute('aria-label', t.nav);
      bottom.innerHTML = navItems(active, ready);
    }
  }

  /* ---------- Tabs (§7) ---------- */
  function initTabs() {
    document.querySelectorAll('[role="tablist"]').forEach(function (list) {
      list.addEventListener('click', function (e) {
        var tab = e.target.closest('[role="tab"]');
        if (!tab || tab.tagName === 'A') return;
        list.querySelectorAll('[role="tab"]').forEach(function (t) {
          var on = t === tab;
          t.setAttribute('aria-selected', on ? 'true' : 'false');
          var panel = document.getElementById(t.getAttribute('aria-controls') || '');
          if (panel) panel.hidden = !on;
        });
      });
    });
  }

  /* ---------- Filter pills ---------- */
  function initPills() {
    document.querySelectorAll('[data-pills]').forEach(function (group) {
      group.addEventListener('click', function (e) {
        var p = e.target.closest('.pill');
        if (!p) return;
        group.querySelectorAll('.pill').forEach(function (x) {
          x.setAttribute('aria-pressed', x === p ? 'true' : 'false');
        });
        var key = p.getAttribute('data-filter');
        var scope = document.querySelector(group.getAttribute('data-pills'));
        if (!scope) return;
        scope.querySelectorAll('[data-tag]').forEach(function (item) {
          item.hidden = !(key === 'all' || item.getAttribute('data-tag') === key);
        });
      });
    });
  }

  /* ---------- Score bars + drill-down (§9) ---------- */
  function initScores() {
    document.querySelectorAll('.score__fill').forEach(function (fill) {
      var pct = fill.getAttribute('data-value');
      if (pct == null) return;
      if (reduced) { fill.style.width = pct + '%'; return; }
      requestAnimationFrame(function () {
        requestAnimationFrame(function () { fill.style.width = pct + '%'; });
      });
    });

    document.querySelectorAll('[data-drilldown]').forEach(function (btn) {
      var panel = document.querySelector(btn.getAttribute('data-drilldown'));
      if (!panel) return;
      btn.setAttribute('aria-expanded', 'false');
      btn.addEventListener('click', function () {
        var open = panel.classList.toggle('is-open');
        btn.setAttribute('aria-expanded', open ? 'true' : 'false');
        btn.textContent = open ? t.hide : t.how;
      });
    });
  }

  /* ---------- Banner dismiss (§10) ---------- */
  function initBanners() {
    document.addEventListener('click', function (e) {
      var x = e.target.closest('.banner__close');
      if (!x) return;
      var b = x.closest('.banner');
      if (b) b.remove();
    });
  }

  /* ---------- Toasts — one at a time, queued (§10) ---------- */
  var queue = [], showing = false;
  function toast(opts) { queue.push(opts); pump(); }
  function pump() {
    if (showing || !queue.length) return;
    var region = document.querySelector('.toast-region');
    if (!region) return;
    showing = true;
    var o = queue.shift();
    var el = document.createElement('div');
    el.className = 'toast toast--' + (o.type || 'info');
    el.setAttribute('role', 'status');
    el.innerHTML = '<span class="toast__dot" aria-hidden="true"></span>' +
                   '<span class="grow">' + o.text + '</span>' +
                   (o.action ? '<a class="link" href="' + (o.href || '#') + '">' + o.action + '</a>' : '');
    region.appendChild(el);

    var life = o.action ? 8000 : 4000, timer, hovered = false;
    function close() {
      if (hovered) { timer = setTimeout(close, 1000); return; }
      el.classList.add('is-leaving');
      setTimeout(function () { el.remove(); showing = false; pump(); }, 200);
    }
    el.addEventListener('mouseenter', function () { hovered = true; });
    el.addEventListener('mouseleave', function () { hovered = false; });
    el.addEventListener('focusin',  function () { hovered = true; });
    el.addEventListener('focusout', function () { hovered = false; });
    timer = setTimeout(close, life);
  }
  window.NAQLA_toast = toast;

  /* ---------- Generic disclosure (preview panels, §9) ---------- */
  function initToggles() {
    document.querySelectorAll('[data-toggle]').forEach(function (btn) {
      var panel = document.querySelector(btn.getAttribute('data-toggle'));
      if (!panel) return;
      btn.setAttribute('aria-expanded', panel.classList.contains('is-open') ? 'true' : 'false');
      btn.addEventListener('click', function () {
        var open = panel.classList.toggle('is-open');
        btn.setAttribute('aria-expanded', open ? 'true' : 'false');
        if (open) { var f = panel.querySelector('.btn, a, button'); if (f) f.focus(); }
      });
    });
  }

  /* ---------- Declarative toast triggers ----------
     Any control with data-toast fires one toast. Optional:
     data-toast-type, data-toast-action, data-toast-href. */
  function initToastTriggers() {
    document.addEventListener('click', function (e) {
      var t = e.target.closest('[data-toast]');
      if (!t) return;
      toast({
        text:   t.getAttribute('data-toast'),
        type:   t.getAttribute('data-toast-type') || 'success',
        action: t.getAttribute('data-toast-action'),
        href:   t.getAttribute('data-toast-href')
      });
    });
  }

  /* ---------- Career Companion (§11) ---------- */
  function initCompanion() {
    var el = document.querySelector('.companion');
    if (!el) return;
    var c = D.companion || {};
    el.setAttribute('data-state', c.state || 'silent');

    var mark = el.querySelector('.companion__mark');
    var panel = el.querySelector('.companion__panel');
    var nudge = el.querySelector('.companion__nudge');

    function setState(s) { el.setAttribute('data-state', s); }

    if (mark)  mark.addEventListener('click', function () { setState('expanded'); });
    if (nudge) {
      nudge.addEventListener('click', function (e) {
        if (e.target.closest('a,button')) return;
        setState('expanded');
      });
    }
    var min = el.querySelector('[data-companion-min]');
    if (min) min.addEventListener('click', function () { setState('new-insight'); });

    // Collision: collapse to the mark when it would overlap a primary CTA (§11)
    function avoidCollision() {
      if (el.getAttribute('data-state') !== 'nudge') return;
      var r = el.getBoundingClientRect();
      var hit = Array.prototype.some.call(
        document.querySelectorAll('.btn--primary, .next-action__actions .btn'),
        function (b) {
          var t = b.getBoundingClientRect();
          return !(r.right < t.left || r.left > t.right || r.bottom < t.top || r.top > t.bottom);
        });
      if (hit) setState('new-insight');
    }
    window.addEventListener('scroll', function () {
      if (el.getAttribute('data-state') === 'nudge') setState('new-insight');
    }, { once: true, passive: true });
    window.addEventListener('resize', avoidCollision);
    avoidCollision();
  }

  /* ---------- Boot ---------- */
  document.addEventListener('DOMContentLoaded', function () {
    mountShell();
    initTabs();
    initPills();
    initScores();
    initBanners();
    initToggles();
    initToastTriggers();
    initCompanion();
  });
})();
