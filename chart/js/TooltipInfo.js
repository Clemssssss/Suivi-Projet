/**
 * TooltipInfo.js — Module icônes ⓘ avec tooltips
 * Usage : <span class="info-icon" data-info="Texte ici">ⓘ</span>
 * API   : TooltipInfo.init([root])  — attache tous les [data-info]
 *         TooltipInfo.inject(el, text)  — injecte une icône dans el
 *         TooltipInfo.injectAll(map)    — { '#selector': 'texte', ... }
 * Vanilla JS, zéro dépendance. Compatible mobile (tap). Fermeture au clic extérieur.
 */
(function (global) {
  'use strict';

  /* ── CSS injecté une seule fois ── */
  var _stylesInjected = false;
  function injectStyles() {
    if (_stylesInjected) return;
    _stylesInjected = true;
    var s = document.createElement('style');
    s.id = '__tipinfo_css__';
    s.textContent = `
/* ── TooltipInfo.js styles ── */
.info-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: rgba(0, 212, 170, 0.10);
  border: 1px solid rgba(0, 212, 170, 0.30);
  color: rgba(0, 212, 170, 0.80);
  font-size: 9px;
  font-style: normal;
  font-weight: 700;
  font-family: var(--sans, system-ui, sans-serif);
  line-height: 1;
  cursor: pointer !important;
  pointer-events: auto !important;
  vertical-align: middle;
  margin-left: 5px;
  flex-shrink: 0;
  transition: background 0.15s, border-color 0.15s, color 0.15s, transform 0.12s;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
  position: relative;
  top: -1px;
  z-index: 10;
}
.info-icon:hover,
.info-icon:focus,
.info-icon[aria-expanded="true"] {
  background: rgba(0, 212, 170, 0.20);
  border-color: rgba(0, 212, 170, 0.60);
  color: #00d4aa;
  transform: scale(1.15);
  outline: none;
}

.__tipinfo-box {
  position: absolute;
  z-index: 999999;
  max-width: 270px;
  min-width: 160px;
  background: #0b1322;
  border: 1px solid rgba(0, 212, 170, 0.22);
  border-radius: 10px;
  padding: 10px 13px;
  font-family: var(--sans, 'DM Sans', system-ui, sans-serif);
  font-size: 11.5px;
  line-height: 1.55;
  color: #8fa3b8;
  box-shadow:
    0 10px 36px rgba(0, 0, 0, 0.60),
    0 0 0 1px rgba(255, 255, 255, 0.03),
    inset 0 1px 0 rgba(255, 255, 255, 0.04);
  pointer-events: none;
  opacity: 0;
  transform: translateY(5px) scale(0.98);
  transition: opacity 0.17s ease, transform 0.17s ease;
  word-break: break-word;
}
.__tipinfo-box.--visible {
  opacity: 1;
  transform: translateY(0) scale(1);
  pointer-events: auto;
}
.__tipinfo-box strong {
  color: #d8e8f5;
  font-weight: 600;
}
.__tipinfo-box code {
  font-family: var(--mono, 'DM Mono', monospace);
  font-size: 10px;
  background: rgba(0, 212, 170, 0.08);
  border: 1px solid rgba(0, 212, 170, 0.18);
  border-radius: 4px;
  padding: 1px 5px;
  color: #00d4aa;
  display: inline-block;
  margin: 1px 0;
}
.__tipinfo-box br + code,
.__tipinfo-box code + br { margin-top: 2px; }
`;
    document.head.appendChild(s);
  }

  /* ── Singleton tooltip DOM ── */
  var _box = null;
  var _activeIcon = null;
  var _hideTimer = null;

  function getBox() {
    if (!_box) {
      _box = document.createElement('div');
      _box.className = '__tipinfo-box';
      _box.setAttribute('role', 'tooltip');
      _box.setAttribute('aria-live', 'polite');
      document.body.appendChild(_box);
    }
    return _box;
  }

  function show(icon) {
    clearTimeout(_hideTimer);
    var text = icon.getAttribute('data-info') || '';
    if (!text) return;

    if (_activeIcon && _activeIcon !== icon) {
      _activeIcon.setAttribute('aria-expanded', 'false');
    }
    _activeIcon = icon;
    icon.setAttribute('aria-expanded', 'true');

    var box = getBox();
    box.innerHTML = text;
    box.classList.remove('--visible');

    /* off-screen pour mesurer */
    box.style.left = '-9999px';
    box.style.top  = '-9999px';

    /* force reflow */
    void box.offsetWidth;

    var ir   = icon.getBoundingClientRect();
    var scrollX = window.pageXOffset || document.documentElement.scrollLeft;
    var scrollY = window.pageYOffset || document.documentElement.scrollTop;
    var bw   = box.offsetWidth  || 260;
    var bh   = box.offsetHeight || 60;
    var vw   = window.innerWidth;
    var vh   = window.innerHeight;
    var gap  = 9;

    /* Coordonnées viewport de l'icône */
    var iconCenterX = ir.left + ir.width / 2;
    var iconBottom  = ir.bottom;
    var iconTop     = ir.top;

    /* Horizontal : centrer sur icône, éviter débords viewport */
    var left = iconCenterX - bw / 2;
    left = Math.max(gap, Math.min(left, vw - bw - gap));

    /* Vertical : préférer en-dessous, sinon au-dessus */
    var top;
    if (iconBottom + bh + gap <= vh) {
      top = iconBottom + gap;
    } else {
      top = iconTop - bh - gap;
    }
    top = Math.max(gap, Math.min(top, vh - bh - gap));

    /* Convertir viewport → coordonnées page (pour position:absolute sur body) */
    box.style.left = (left + scrollX) + 'px';
    box.style.top  = (top  + scrollY) + 'px';

    requestAnimationFrame(function () {
      box.classList.add('--visible');
    });
  }

  function hide(immediate) {
    if (_activeIcon) {
      _activeIcon.setAttribute('aria-expanded', 'false');
      _activeIcon = null;
    }
    if (!_box) return;
    if (immediate) {
      _box.classList.remove('--visible');
    } else {
      _hideTimer = setTimeout(function () {
        if (_box) _box.classList.remove('--visible');
      }, 100);
    }
  }

  /* ── Attacher un icon ── */
  function attach(icon) {
    if (icon.__tipBound) return;
    icon.__tipBound = true;
    icon.setAttribute('tabindex', '0');
    icon.setAttribute('role', 'button');
    icon.setAttribute('aria-expanded', 'false');
    icon.setAttribute('aria-haspopup', 'true');

    icon.addEventListener('mouseenter', function () { show(icon); });
    icon.addEventListener('mouseleave', function () { hide(false); });
    icon.addEventListener('focus',      function () { show(icon); });
    icon.addEventListener('blur',       function () { hide(false); });

    icon.addEventListener('click', function (e) {
      e.stopPropagation();
      if (icon.getAttribute('aria-expanded') === 'true') {
        hide(true);
      } else {
        show(icon);
      }
    });

    icon.addEventListener('touchstart', function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (icon.getAttribute('aria-expanded') === 'true') {
        hide(true);
      } else {
        show(icon);
      }
    }, { passive: false });
  }

  /* ── Fermer au clic extérieur / Escape ── */
  document.addEventListener('click', function (e) {
    if (!_box || !_activeIcon) return;
    if (!_activeIcon.contains(e.target) && !_box.contains(e.target)) {
      hide(true);
    }
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') hide(true);
  });

  /* ── Repositionner au scroll/resize ── */
  window.addEventListener('scroll', function () {
    if (_activeIcon) show(_activeIcon);
  }, true);
  window.addEventListener('resize', function () {
    if (_activeIcon) show(_activeIcon);
  });

  /* ── API publique ── */
  var TooltipInfo = {

    /** Scanner root et attacher tous les [data-info] (ou root lui-même) */
    init: function (root) {
      injectStyles();
      var scope = root || document;
      /* Si root est lui-même un [data-info], l'attacher directement */
      if (scope.hasAttribute && scope.hasAttribute('data-info')) {
        attach(scope);
      }
      scope.querySelectorAll && scope.querySelectorAll('[data-info]').forEach(attach);
    },

    /** Injecter une icône ⓘ comme dernier enfant de el */
    inject: function (el, text) {
      if (!el) return null;
      injectStyles();
      var icon = document.createElement('span');
      icon.className = 'info-icon';
      icon.setAttribute('data-info', text);
      icon.textContent = 'ⓘ';
      el.appendChild(icon);
      attach(icon);
      return icon;
    },

    /** Injecter en masse. map = { 'selector': 'texte tooltip', ... } */
    injectAll: function (map, root) {
      var scope = root || document;
      Object.keys(map).forEach(function (sel) {
        scope.querySelectorAll(sel).forEach(function (el) {
          TooltipInfo.inject(el, map[sel]);
        });
      });
    }
  };

  global.TooltipInfo = TooltipInfo;

})(typeof window !== 'undefined' ? window : this);
