import { createAppearanceController } from '../shared/appearance.mjs';

(() => {
  'use strict';
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fmt$ = (n) => '$' + Math.round(n).toLocaleString('en-US');
  const RATE = 150,
    PRICE = 48.78;

  /* =====================================================================
   MODERN AVATARS — deterministic flat portraits + optional logo badge
   ===================================================================== */
  const LOGOS = {
    nw: {
      h: 212,
      m: '<path d="M12 2.5 17 16l-5-3-5 3z" fill="currentColor"/><path d="M7 19.5h10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    },
    halcyon: {
      h: 158,
      m: '<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor"/>',
    },
    okafor: {
      h: 262,
      m: '<circle cx="12" cy="12" r="7.5" fill="none" stroke="currentColor" stroke-width="2.4"/><circle cx="12" cy="12" r="3" fill="currentColor"/>',
    },
    marlow: {
      h: 26,
      m: '<path d="M4.5 19.5 12 4.5l7.5 15" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"/><path d="M8.5 14h7" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>',
    },
    sl: {
      h: 152,
      m: '<path transform="scale(.666667)" d="M4 9 30 4v9L4 18v-9Zm5 14 23-4.5v9L9 32v-9Z" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linejoin="round"/>',
    },
  };
  const avatar = (() => {
    const hash = (str) => {
      let h = 2166136261;
      for (const c of str) {
        h ^= c.charCodeAt(0);
        h = Math.imul(h, 16777619);
      }
      return h >>> 0;
    };
    const SKIN = ['#f7d7bf', '#efc3a1', '#e0ab86', '#c98d66', '#a8704c', '#7f5238', '#5f3c2a'];
    const HAIR = [
      '#1d1a18',
      '#2f241d',
      '#4a3222',
      '#6e4526',
      '#a8703f',
      '#d4a86a',
      '#2a2a31',
      '#8a8a91',
      '#7a2f22',
    ];
    const BG = [158, 212, 262, 28, 340, 190, 46, 120, 290, 8];
    const HAIRS = [
      // [behind-head, front]
      ['', 'M20 28c-.5-9.5 5-15 12-15s12.5 5.5 12 15c-2.5-4.5-6.5-7-12-7s-9.5 2.5-12 7z'],
      [
        'M18.5 31c0-12 6-18 13.5-18s13.5 6 13.5 18v13c-3 2.2-6.2 3-9.5 3h-8c-3.3 0-6.5-.8-9.5-3z',
        'M20.5 27c1-8 5.5-12 11.5-12s10.5 4 11.5 12c-4-3.5-7.5-5-11.5-5s-7.5 1.5-11.5 5z',
      ],
      [
        '',
        'M20 28c-.5-9.5 5-15 12-15s12.5 5.5 12 15c-2.5-4.5-6.5-7-12-7s-9.5 2.5-12 7z M32 5.5a5.2 5.2 0 1 1 0 10.4 5.2 5.2 0 0 1 0-10.4z',
      ],
      [
        'M32 9c9 0 15.5 6.5 15.5 15.5 0 4-1.2 7-3 9.5H19.5c-1.8-2.5-3-5.5-3-9.5C16.5 15.5 23 9 32 9z',
        'M21 25c1.5-6.5 5.5-9.5 11-9.5s9.5 3 11 9.5c-3.5-2.2-7-3.2-11-3.2s-7.5 1-11 3.2z',
      ],
      [
        '',
        'M20 29c-1.5-10 4.5-16 13-16 7.5 0 12.5 5.5 11.5 14-5.5 0-10.5-2.2-13.5-6.5-2 4.2-6 7.3-11 8.5z',
      ],
      ['', 'M21 25.5c.5-7 5-10.5 11-10.5s10.5 3.5 11 10.5c-3-2.5-6.5-3.5-11-3.5s-8 1-11 3.5z'],
      [
        'M18.5 30c0-11 6-17 13.5-17s13.5 6 13.5 17v8.5c0 2.3-1.7 3.5-4 3.5H22.5c-2.3 0-4-1.2-4-3.5z',
        'M20 26.5c.5-8 5.5-12 12-12s11.5 4 12 12H20z',
      ],
      [
        '',
        'M19.5 28.5c-1-9 4-15.5 12.5-15.5 5 0 7.5 2 9 4 2.5.5 4.5 3.5 3.5 11.5-2-3-4.5-5-7.5-5.5-3.5 2.5-11 3-17.5 5.5z',
      ],
    ];
    const LN = [
      'Morgan',
      'Riley',
      'Casey',
      'Jamie',
      'Avery',
      'Quinn',
      'Rowan',
      'Sasha',
      'Kai',
      'Robin',
      'Elliot',
      'Noor',
      'Iris',
      'Leo',
      'Ana',
      'Omar',
    ];
    const FEM = new Set(
      'Dana Maya Priya Sofia Nina Lena Tala Olivia Yui Hannah Aoife Camille Mia Elsa Lucía Aroha Wei Giulia Ivy Kira Isla Wanjiru Ingrid Noa Georgia Rachel Poppy Margaux Grace Zoe Aino Eilidh Sigrún Nabila Iris Ana Noor Sasha'.split(
        ' ',
      ),
    );
    const MASC = new Set(
      'Tom Marcus Jon Evan Noah Daan Thabo Marco Piotr Chris Mads Caleb Ben Diego Luca Ethan Matteo Haruto Andre Felix Arjun Rafael Sam Jordan Leo Omar Kai Elliot'.split(
        ' ',
      ),
    );
    const POOL = { f: [1, 2, 3, 6, 1, 6], m: [0, 4, 5, 7, 3, 0], n: [0, 1, 2, 3, 4, 5, 6, 7] };
    function face(name) {
      const h = hash(name),
        pick = (arr, sh) => arr[(h >>> sh) % arr.length];
      const first = name.split(' ')[0],
        g = FEM.has(first) ? 'f' : MASC.has(first) ? 'm' : 'n';
      const skin = pick(SKIN, 0),
        hair = pick(HAIR, 3),
        hs = HAIRS[pick(POOL[g], 7)],
        bg = pick(BG, 11),
        shirtH = pick(BG, 15);
      const glasses = ((h >>> 19) & 7) === 1,
        beard = g === 'm' && ((h >>> 22) & 3) === 2;
      const ey = 30.5;
      return (
        `<svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">` +
        `<rect width="64" height="64" fill="hsl(${bg} 62% 86%)"/><rect width="64" height="64" fill="url(#avSheen)"/>` +
        `<path d="M9 66c1.5-12.5 11-19 23-19s21.5 6.5 23 19z" fill="hsl(${shirtH} 38% 42%)"/>` +
        `<path d="M26.5 47.5c1.8 2.6 3.6 3.8 5.5 3.8s3.7-1.2 5.5-3.8" fill="none" stroke="rgba(255,255,255,.35)" stroke-width="1.3"/>` +
        (hs[0] ? `<path d="${hs[0]}" fill="${hair}"/>` : '') +
        `<rect x="27.5" y="37" width="9" height="11" rx="4" fill="${skin}"/><rect x="27.5" y="40" width="9" height="4" fill="rgba(0,0,0,.08)"/>` +
        `<circle cx="20.8" cy="31" r="2.6" fill="${skin}"/><circle cx="43.2" cy="31" r="2.6" fill="${skin}"/>` +
        `<ellipse cx="32" cy="29.5" rx="11.2" ry="12.6" fill="${skin}"/>` +
        (beard
          ? `<path d="M21.5 31c.5 8 5 12.5 10.5 12.5S42 39 42.5 31c-2 3.5-5.5 5.5-10.5 5.5S23.5 34.5 21.5 31z" fill="${hair}" opacity=".9"/>`
          : '') +
        `<path d="${hs[1]}" fill="${hair}"/>` +
        `<circle cx="27.6" cy="${ey}" r="1.35" fill="#1b1b1f"/><circle cx="36.4" cy="${ey}" r="1.35" fill="#1b1b1f"/>` +
        `<circle cx="25" cy="34.5" r="2.2" fill="#f28b82" opacity=".22"/><circle cx="39" cy="34.5" r="2.2" fill="#f28b82" opacity=".22"/>` +
        `<path d="M29.3 35.6c1.7 1.5 3.7 1.5 5.4 0" fill="none" stroke="#1b1b1f" stroke-width="1.25" stroke-linecap="round" opacity=".8"/>` +
        (glasses
          ? `<g fill="none" stroke="#1b1b1f" stroke-width="1.1" opacity=".85"><rect x="23.6" y="27.4" width="7.6" height="6" rx="2.6"/><rect x="32.8" y="27.4" width="7.6" height="6" rx="2.6"/><path d="M31.2 30h1.6"/></g>`
          : '') +
        `</svg>`
      );
    }
    const api = (name, opt = {}) => {
      const L = opt.logo && LOGOS[opt.logo];
      return (
        face(name) +
        (L
          ? `<span class="av-badge" style="--bh:${L.h}"><svg viewBox="0 0 24 24" aria-hidden="true">${L.m}</svg></span>`
          : '')
      );
    };
    api.teammate = (seed) =>
      LN[hash(seed) % LN.length] + ' ' + String.fromCharCode(65 + (hash(seed + 'x') % 26));
    return api;
  })();
  /* one shared sheen gradient for every avatar */
  document.body.insertAdjacentHTML(
    'afterbegin',
    '<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs><radialGradient id="avSheen" cx="30%" cy="20%" r="80%"><stop offset="0" stop-color="#fff" stop-opacity=".35"/><stop offset=".6" stop-color="#fff" stop-opacity="0"/></radialGradient></defs></svg>',
  );
  const fillAvatars = (root = document) =>
    $$('[data-av]', root).forEach((el) => {
      el.innerHTML = avatar(el.dataset.av, { logo: el.dataset.logo });
      el.classList.add('has-av');
      el.setAttribute('title', el.dataset.av);
    });

  function tween(el, to, { dur = 900, format = fmt$, from } = {}) {
    if (!el) return;
    const start = from ?? el._v ?? 0;
    el._v = to;
    if (RM) {
      el.textContent = format(to);
      return;
    }
    cancelAnimationFrame(el._raf);
    const t0 = performance.now();
    const step = (t) => {
      const p = Math.min(1, (t - t0) / dur),
        e = 1 - Math.pow(1 - p, 4);
      el.textContent = format(start + (to - start) * e);
      if (p < 1) el._raf = requestAnimationFrame(step);
    };
    el._raf = requestAnimationFrame(step);
  }
  const fmts = {
    $: fmt$,
    h: (n) => Math.round(n) + 'h',
    '%': (n) => Math.round(n) + '%',
    s: (n) => Math.round(n) + 's',
    n: (n) => Math.round(n).toLocaleString('en-US'),
  };

  let toastT;
  function toast(msg) {
    $('#toastTxt').textContent = msg;
    const t = $('#toast');
    t.classList.add('show');
    clearTimeout(toastT);
    toastT = setTimeout(() => t.classList.remove('show'), 2600);
  }

  /* split headlines (keeps inner spans like .soft) */
  $$('[data-split]').forEach((h) => {
    let i = 0;
    const wrapWords = (node) => {
      [...node.childNodes].forEach((n) => {
        if (n.nodeType === 3) {
          const frag = document.createDocumentFragment();
          n.textContent.split(/(\s+)/).forEach((part) => {
            if (!part) return;
            if (/^\s+$/.test(part)) {
              frag.appendChild(document.createTextNode(' '));
              return;
            }
            const w = document.createElement('span');
            w.className = 'w';
            const inner = document.createElement('span');
            inner.style.setProperty('--d', i++ * 45 + 'ms');
            inner.textContent = part;
            w.appendChild(inner);
            frag.appendChild(w);
          });
          n.replaceWith(frag);
        } else if (n.nodeType === 1) wrapWords(n);
      });
    };
    wrapWords(h);
  });

  $$('[data-stagger]').forEach((p) =>
    [...p.children].forEach((c, i) => {
      if (!c.hasAttribute('data-reveal')) c.setAttribute('data-reveal', '');
      c.style.setProperty('--d', i * 80 + 'ms');
    }),
  );

  const onReveal = new Map();
  const io = new IntersectionObserver(
    (entries) =>
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        e.target.classList.add('is-in');
        io.unobserve(e.target);
        const fn = onReveal.get(e.target);
        fn && fn();
        $$('[data-count]', e.target).forEach(countUp);
        if (e.target.hasAttribute('data-count')) countUp(e.target);
      }),
    { threshold: 0.14, rootMargin: '0px 0px -6% 0px' },
  );
  function countUp(el) {
    if (el._counted) return;
    el._counted = true;
    tween(el, +el.dataset.count, { dur: 1600, format: fmts[el.dataset.fmt] || fmt$, from: 0 });
  }

  fillAvatars();

  /* nav */
  const nav = $('#nav'),
    mcta = $('#mcta'),
    progress = $('#progress');
  let ticking = false;
  function onScroll() {
    const y = scrollY;
    nav.classList.toggle('scrolled', y > 8);
    mcta.classList.toggle(
      'show',
      y > 700 && y < document.documentElement.scrollHeight - innerHeight - 600,
    );
    progress.style.setProperty(
      '--sp',
      Math.min(1, y / Math.max(1, document.documentElement.scrollHeight - innerHeight)).toFixed(4),
    );
    ticking = false;
  }
  const paper = $('.paper'),
    stage = $('.paper-stage');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  function parallax() {
    if (reduce || !paper) return;
    const r = stage.getBoundingClientRect();
    if (r.bottom < 0 || r.top > innerHeight) return;
    const k = (r.top + r.height / 2 - innerHeight / 2) / innerHeight;
    paper.style.setProperty('--par', (k * -18).toFixed(1) + 'px');
  }
  const heroAur = $('.hb-aur'),
    heroDots = $('.hb-dots');
  function heroPar() {
    if (reduce) return;
    const y = scrollY;
    if (y > innerHeight * 1.2) return;
    heroAur.style.transform = `translate3d(0,${(y * 0.18).toFixed(1)}px,0)`;
    heroDots.style.transform = `translate3d(0,${(y * 0.08).toFixed(1)}px,0)`;
  }
  addEventListener(
    'scroll',
    () =>
      requestAnimationFrame(() => {
        parallax();
        heroPar();
      }),
    { passive: true },
  );
  (() => {
    const hero = $('.hero'),
      hv = $('#hv');
    if (!hv || reduce || !matchMedia('(hover:hover) and (pointer:fine)').matches) return;
    hero.addEventListener('pointermove', (e) => {
      const r = hv.getBoundingClientRect();
      const x = Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / r.width));
      const y = Math.max(-1, Math.min(1, (e.clientY - (r.top + r.height / 2)) / r.height));
      hv.style.setProperty('--px', x.toFixed(3));
      hv.style.setProperty('--py', y.toFixed(3));
      const hr = hero.getBoundingClientRect();
      hero.style.setProperty('--hx', e.clientX - hr.left + 'px');
      hero.style.setProperty('--hy', e.clientY - hr.top + 'px');
    });
    hero.addEventListener('pointerleave', () => {
      hv.style.setProperty('--px', 0);
      hv.style.setProperty('--py', 0);
    });
  })();
  addEventListener(
    'scroll',
    () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(onScroll);
      }
    },
    { passive: true },
  );
  onScroll();

  (() => {
    const ind = $('#navInd'),
      links = $$('.nav-links a');
    const map = new Map(links.map((a) => [a.getAttribute('href').slice(1), a]));
    let active = null;
    const move = (a) => {
      links.forEach((l) => l.classList.toggle('on', l === a));
      if (!a) {
        ind.style.opacity = 0;
        return;
      }
      ind.style.width = a.offsetWidth + 'px';
      ind.style.transform = `translateX(${a.offsetLeft}px)`;
      ind.style.opacity = 1;
    };
    const spy = new IntersectionObserver(
      (es) => {
        es.forEach((e) => {
          if (e.isIntersecting) active = map.get(e.target.id) || null;
        });
        move(active);
      },
      { rootMargin: '-45% 0px -50% 0px' },
    );
    [
      'problem',
      'proof',
      'founder',
      'compare',
      'how',
      'playbook',
      'change-orders',
      'roi',
      'pricing',
      'faq',
    ].forEach((id) => {
      const s = document.getElementById(id);
      s && spy.observe(s);
    });
    new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          active = null;
          move(null);
        }
      },
      { rootMargin: '0px 0px -60% 0px' },
    ).observe($('.hero'));
    addEventListener('resize', () => move(active));
  })();

  (() => {
    const btn = $('#menuBtn'),
      root = document.documentElement;
    const menu = $('#mnav');
    const set = (open) => {
      root.classList.toggle('menu-open', open);
      mcta.style.visibility = open ? 'hidden' : '';
      btn.setAttribute('aria-expanded', String(open));
      btn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      menu.inert = !open;
      menu.setAttribute('aria-hidden', String(!open));
      $('main').inert = open;
      $('footer').inert = open;
      mcta.inert = open;
      if (open) menu.querySelector('a')?.focus({ preventScroll: true });
    };
    set(false);
    btn.addEventListener('click', () => set(!root.classList.contains('menu-open')));
    $$('#mnav a').forEach((a) => a.addEventListener('click', () => set(false)));
    document.addEventListener('keydown', (e) => {
      if (!root.classList.contains('menu-open')) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        set(false);
        btn.focus({ preventScroll: true });
      }
      if (e.key === 'Tab') {
        const items = [
          ...$('#nav').querySelectorAll('a,button'),
          ...menu.querySelectorAll('a,button'),
        ].filter(
          (item) => item.getClientRects().length && getComputedStyle(item).visibility !== 'hidden',
        );
        const first = items[0],
          last = items.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    });
    addEventListener('resize', () => {
      if (innerWidth > 1023) set(false);
    });
  })();

  /* Shared manual/system appearance, including live device and cross-tab changes. */
  (() => {
    const controller = createAppearanceController();
    const picker = $('#appearancePicker');
    const trigger = $('#themeBtn');
    const buttons = $$('[data-set]');
    const label = (value) => value[0].toUpperCase() + value.slice(1);
    const sync = ({ preference, theme }) => {
      buttons.forEach((button) => {
        const selected = button.dataset.set === preference;
        button.classList.toggle('on', selected);
        button.setAttribute('aria-pressed', String(selected));
      });
      trigger.setAttribute(
        'aria-label',
        `Appearance: ${label(preference)}${preference === 'system' ? ` (${label(theme)})` : ''}`,
      );
      $('#appearanceStatus').textContent =
        preference === 'system'
          ? `Follows your device · ${label(theme)}`
          : 'Choose System to match your device.';
    };
    controller.subscribe(sync);
    controller.start();
    buttons.forEach((button) =>
      button.addEventListener('click', () => {
        controller.setPreference(button.dataset.set);
        if (button.closest('#appearancePicker')) {
          picker.open = false;
          trigger.focus({ preventScroll: true });
        }
      }),
    );
    document.addEventListener('pointerdown', (event) => {
      if (picker.open && !picker.contains(event.target)) picker.open = false;
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && picker.open) {
        picker.open = false;
        trigger.focus({ preventScroll: true });
        event.preventDefault();
      }
    });
  })();

  /* spotlight */
  document.addEventListener(
    'pointermove',
    (e) => {
      const el = e.target.closest && e.target.closest('.spot');
      if (!el) return;
      const r = el.getBoundingClientRect();
      el.style.setProperty('--mx', e.clientX - r.left + 'px');
      el.style.setProperty('--my', e.clientY - r.top + 'px');
    },
    { passive: true },
  );

  /* =====================================================================
   HERO — the moment
   ===================================================================== */
  (() => {
    const S = [
      {
        i: 'DK',
        c: '#f5c26b',
        who: 'Dana Kim',
        src: 'Client request',
        txt: 'Can you just quickly add a monthly/annual toggle to the pricing page? Should be easy!',
        title: 'Monthly/annual pricing toggle',
        h: 6,
        m: 'bill',
        res: 'Brief ready for review',
        v: '+$900',
        saved: 900,
      },
      {
        i: 'MR',
        c: '#86abff',
        who: 'Marcus Reed',
        src: 'Client request',
        txt: 'Loved round three — could the team try one more direction for the hero? Something bolder.',
        title: 'Extra hero concept (round 4)',
        h: 10,
        m: 'swap',
        res: 'Swapped for the Careers template',
        v: '0h net',
        saved: 1500,
      },
      {
        i: 'PS',
        c: '#c9a2ff',
        who: 'Priya Shah',
        src: 'Client request',
        txt: 'Oh, and we’ll need all 140 old blog posts moved over before launch.',
        title: 'Migrate 140 blog posts',
        h: 18,
        m: 'defer',
        res: 'Saved for future work',
        v: '$2,700',
        saved: 2700,
      },
    ];
    const col = { bill: 'var(--bill)', swap: 'var(--swap)', defer: 'var(--defer)' };
    const msg = $('#hvMsg'),
      txt = $('#hvTxt'),
      body = $('#hvBody'),
      res = $('#hvRes'),
      resIn = $('#hvResIn'),
      moves = $$('.hv-move');
    let i = 0,
      total = 0,
      timer,
      running = false,
      visible = false;
    const sleep = (ms) =>
      new Promise((r) => {
        timer = setTimeout(r, ms);
      });
    const TARGET = 6000;
    async function loop() {
      if (running) return;
      running = true;
      while (visible) {
        const s = S[i % S.length];
        if (i % S.length === 0 && i) {
          total = 0;
          tween($('#hvSaved'), 0, { dur: 500 });
          $('#hvBar').style.width = '0%';
        }
        // incoming message
        $('#hvAv').innerHTML = avatar(s.who, { logo: 'nw' });
        $('#hvWho').textContent = s.who;
        $('#hvSrc').textContent = s.src;
        txt.innerHTML = '<span class="typing"><i></i><i></i><i></i></span>';
        msg.classList.remove('out');
        body.classList.add('loading');
        res.classList.remove('show');
        moves.forEach((m) => m.classList.remove('on'));
        await sleep(900);
        if (!visible) break;
        txt.textContent = '“' + s.txt + '”';
        await sleep(700);
        $('#hvTitle').textContent = s.title;
        $('#hvH').textContent = s.h + 'h';
        $('#hvCost').textContent = '−' + fmt$(s.h * RATE);
        body.classList.remove('loading');
        await sleep(1500);
        if (!visible) break;
        moves.find((m) => m.dataset.m === s.m).classList.add('on');
        await sleep(450);
        resIn.style.setProperty('--rc', col[s.m]);
        resIn.innerHTML = `<span class="ck"><svg width="11" height="11"><use href="#i-check"/></svg></span><span>${s.res}</span><span class="v">${s.v}</span>`;
        res.classList.add('show');
        total += s.saved;
        tween($('#hvSaved'), total, { dur: 900 });
        $('#hvBar').style.width = Math.min(100, (total / TARGET) * 100) + '%';
        await sleep(2800);
        if (!visible) break;
        msg.classList.add('out');
        await sleep(450);
        i++;
      }
      running = false;
    }
    new IntersectionObserver(
      ([e]) => {
        visible = e.isIntersecting && !document.hidden;
        if (visible) setTimeout(loop, 700);
        else {
          clearTimeout(timer);
          running = false;
        }
      },
      { threshold: 0.2 },
    ).observe($('#hv'));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        visible = false;
        clearTimeout(timer);
        running = false;
        return;
      }
      const r = $('#hv').getBoundingClientRect();
      if (r.top < innerHeight && r.bottom > 0) {
        visible = true;
        setTimeout(loop, 300);
      }
    });
  })();

  /* problem */
  onReveal.set($('#feed'), () =>
    $$('#feed .msg').forEach((m, i) => setTimeout(() => m.classList.add('show'), 150 + i * 200)),
  );
  onReveal.set($('#receipt'), () =>
    setTimeout(() => {
      $('#mKeep').style.width = '42%';
      $('#mLost').style.width = '58%';
    }, 400),
  );

  /* =====================================================================
   TRIAGE ENGINE
   ===================================================================== */
  const T = (() => {
    const FEE = 24000,
      PLANNED = 9600;
    const people = {
      DK: ['#ffc662', 'Dana Kim', 'Client PM'],
      MR: ['#80a8ff', 'Marcus Reed', 'CEO'],
      PS: ['#c79bff', 'Priya Shah', 'Marketing lead'],
      JL: ['#5ef0a8', 'Jon Lee', 'Legal'],
    };
    const reqs = [
      {
        id: 1,
        who: 'DK',
        src: 'Client request',
        ago: '4m ago',
        title: 'Monthly/annual pricing toggle',
        q: 'Can you just quickly add a monthly/annual toggle to the pricing page? Should be easy with Webflow interactions!',
        h: 6,
        co: 'Animated monthly/annual pricing toggle',
        cod: 'Webflow interactions, 2 breakpoints, CMS-bound prices',
      },
      {
        id: 2,
        who: 'MR',
        src: 'Client request',
        ago: '1h ago',
        title: 'Additional homepage hero concept',
        q: 'Loved round three, but can the team explore one more direction for the hero? Something bolder before we sign off.',
        h: 10,
        co: 'Homepage hero — design round 4',
        cod: 'Beyond the 3 revision rounds in SOW §3.1',
      },
      {
        id: 3,
        who: 'PS',
        src: 'Client request',
        ago: '3h ago',
        title: 'Migrate 140 legacy blog posts',
        q: 'Oh — we’ll also need all 140 blog posts moved over from WordPress before launch, with the old URLs redirected.',
        h: 18,
        co: 'WordPress → Webflow CMS migration',
        cod: '140 posts, 301 redirect map, image re-hosting',
      },
      {
        id: 4,
        who: 'JL',
        src: 'Client request',
        ago: 'Yesterday',
        title: 'Custom-built cookie banner',
        q: 'Small thing — the stock cookie banner won’t pass our review. Can we get a custom-designed one with granular toggles?',
        h: 4,
        co: 'Custom consent banner with category toggles',
        cod: 'Design + build, GTM consent mode wiring',
      },
    ];
    const deliverables = [
      { n: 'Careers page template', h: 8 },
      { n: 'Case study CMS template', h: 10 },
      { n: 'Lottie hero animation', h: 6 },
      { n: 'Custom 404 + legal pages', h: 4 },
      { n: 'Newsletter integration', h: 5 },
      { n: 'Team bios collection', h: 18 },
    ];
    const state = { sel: 1, dec: {}, swapFor: {} };
    const total = reqs.reduce((s, r) => s + r.h, 0) * RATE; // 5700
    const tq = $('#tq'),
      reqBox = $('#req'),
      stage = $('#stage');
    const label = { swap: 'Swapped', bill: 'Billed', defer: 'Deferred' };
    const C = 2 * Math.PI * 42;

    function bestSwap(h) {
      return deliverables.reduce((b, d) => (Math.abs(d.h - h) < Math.abs(b.h - h) ? d : b)).n;
    }
    function renderQueue() {
      tq.innerHTML = reqs
        .map((r) => {
          const d = state.dec[r.id],
            p = people[r.who];
          const st = d
            ? `<span class="chip ${d} st">${label[d]}</span>`
            : `<span class="chip leak st">−${fmt$(r.h * RATE)}</span>`;
          return `<button class="tq-item ${state.sel === r.id ? 'active' : ''}" data-id="${r.id}" role="option" aria-selected="${state.sel === r.id}">
        <div class="tq-t">${r.title}</div>
        <div class="tq-m"><span class="tq-av has-av">${avatar(p[1])}</span>${p[1].split(' ')[0]} · ${r.src} · ${r.h}h${st}</div></button>`;
        })
        .join('');
      const pend = reqs.filter((r) => !state.dec[r.id]).length;
      $('#tqCount').textContent = pend ? `${pend} pending` : 'Inbox zero ✓';
    }
    function renderReq(animate) {
      const r = reqs.find((x) => x.id === state.sel),
        p = people[r.who];
      reqBox.innerHTML = `
      <div class="req-top"><span class="av has-av" title="${p[1]}">${avatar(p[1], { logo: 'nw' })}</span><span><b>${p[1]}</b> · ${p[2]}</span><span class="src">${r.src} · ${r.ago}</span></div>
      <p class="req-q">“${r.q}”</p>
      <div class="req-meta">
        <span class="meta"><svg width="13" height="13"><use href="#i-clock"/></svg>Est. <b>${r.h}h</b></span>
        <span class="meta">Status <b style="color:var(--leak)">Out of scope</b> · SOW §4.2</span>
        <span class="meta r">If absorbed <b>−${fmt$(r.h * RATE)}</b></span>
      </div>`;
      if (animate && !RM) {
        reqBox.classList.remove('enter');
        void reqBox.offsetWidth;
        reqBox.classList.add('enter');
      }
      $$('.move').forEach((m) => m.classList.toggle('on', state.dec[r.id] === m.dataset.move));
    }
    function nextBtn() {
      const nxt = reqs.find((x) => !state.dec[x.id] && x.id !== state.sel);
      return nxt
        ? `<button class="btn btn-ghost btn-sm next-btn" data-next="${nxt.id}">Next request <svg class="arr" width="14" height="14"><use href="#i-arrow"/></svg></button>`
        : `<span class="chip bill next-btn" style="margin-top:14px">All requests triaged — margin protected</span>`;
    }
    function renderStage() {
      const r = reqs.find((x) => x.id === state.sel),
        d = state.dec[r.id];
      let html;
      if (!d) {
        html = `<div class="stage-empty"><div><div class="keys"><kbd>S</kbd><kbd>B</kbd><kbd>D</kbd></div>Choose a move to see what happens to your margin.<div style="font-size:12.5px;color:var(--dim);margin-top:6px">Saying “sure, no problem” costs you <span style="color:var(--leak)">${fmt$(r.h * RATE)}</span>.</div></div></div>`;
      } else if (d === 'bill') {
        html = `<div class="stage-h"><span class="chip bill">Billed</span><h4>Priced and ready to send</h4><span class="sub">Illustrative fee and brief</span></div>
        <div class="price-tag"><span class="big" id="bigPrice">$0</span><span class="calc">${r.h}h × $${RATE}/h · Net 14</span></div>
        <div class="co-line"><span class="doc"></span><span>Change order <b style="color:var(--text)">CO-0${13 + r.id}</b> · “${r.co}”</span><a href="#change-orders">Preview PDF <svg width="13" height="13"><use href="#i-arrow"/></svg></a></div>
        ${nextBtn()}`;
      } else if (d === 'swap') {
        const sw = state.swapFor[r.id];
        const out = deliverables.find((x) => x.n === sw);
        const net = r.h - out.h;
        html = `<div class="stage-h"><span class="chip swap">Swapped</span><h4>Trade it for something already in scope</h4><span class="sub">Pick a deliverable</span></div>
        <div class="swap-list">${deliverables.map((x) => `<button class="swap-opt ${x.n === sw ? 'sel' : ''}" data-swap="${x.n}"><span class="n">${x.n}</span><span class="h">${x.h}h</span></button>`).join('')}</div>
        <div class="swap-eq"><span class="pill in">+${r.h}h in</span><span>−</span><span class="pill out">${out.h}h out</span><span>=</span><span class="pill ${net <= 0 ? 'net' : 'in'}">${net > 0 ? '+' + net + 'h over' : net === 0 ? '0h net · scope-neutral' : Math.abs(net) + 'h under'}</span></div>
        ${nextBtn()}`;
      } else {
        const items = reqs.filter((x) => state.dec[x.id] === 'defer');
        const sum = items.reduce((s, x) => s + x.h * RATE, 0);
        html = `<div class="stage-h"><span class="chip defer">Deferred</span><h4>Kept for future work</h4><span class="sub">Launch date protected</span></div>
        <div class="phase2">${items.map((x) => `<div class="p2-row"><span>${x.co}</span><span class="h">${x.h}h · ${fmt$(x.h * RATE)}</span></div>`).join('')}</div>
        <div class="p2-total"><span>Phase 2 pipeline value</span><b id="p2Sum">$0</b></div>
        ${nextBtn()}`;
      }
      stage.innerHTML = `<div class="${RM ? '' : 'enter'}">${html}</div>`;
      if (d === 'bill') tween($('#bigPrice'), r.h * RATE, { from: 0, dur: 900 });
      if (d === 'defer') {
        const items = reqs.filter((x) => state.dec[x.id] === 'defer');
        tween(
          $('#p2Sum'),
          items.reduce((s, x) => s + x.h * RATE, 0),
          { from: 0, dur: 900 },
        );
      }
    }
    function renderSide() {
      let risk = 0,
        swapH = 0,
        bill = 0,
        defer = 0;
      reqs.forEach((r) => {
        const d = state.dec[r.id],
          v = r.h * RATE;
        if (!d) risk += v;
        else if (d === 'bill') bill += v;
        else if (d === 'defer') defer += v;
        else if (d === 'swap') {
          const o = deliverables.find((x) => x.n === state.swapFor[r.id]);
          const net = Math.max(0, r.h - o.h);
          risk += net * RATE;
          swapH += r.h;
        }
      });
      const margin = ((PLANNED - risk) / FEE) * 100;
      const worst = ((PLANNED - total) / FEE) * 100;
      tween($('#ringPct'), margin, { format: fmts['%'], dur: 900 });
      $('#worst').textContent = Math.round(worst) + '%';
      const fgLen = Math.max(0, margin / 40) * C * 0.999;
      $('#ringFg').style.strokeDasharray = `${fgLen} ${C}`;
      const riskLen = (risk / PLANNED) * C;
      $('#ringRisk').style.strokeDasharray = `${riskLen} ${C}`;
      $('#ringRisk').style.strokeDashoffset = -fgLen;
      tween($('#atRisk'), risk, { dur: 800 });
      $('#riskBox').classList.toggle('safe', risk === 0);
      const pend = reqs.filter((r) => !state.dec[r.id]).length;
      const note = $('#ringNote');
      note.textContent = pend
        ? `${pend} decision${pend > 1 ? 's' : ''} pending`
        : 'Fully protected ✓';
      note.style.color = pend ? 'var(--leak)' : 'var(--brand)';
      $('#tSwap').textContent = swapH + 'h';
      tween($('#tBill'), bill, { dur: 800 });
      tween($('#tDefer'), defer, { dur: 800 });
    }
    function select(id, animate = true) {
      state.sel = id;
      renderQueue();
      renderReq(animate);
      renderStage();
    }
    function decide(move) {
      const r = reqs.find((x) => x.id === state.sel);
      state.dec[r.id] = move;
      if (move === 'swap' && !state.swapFor[r.id]) state.swapFor[r.id] = bestSwap(r.h);
      renderQueue();
      renderReq(false);
      renderStage();
      renderSide();
    }
    tq.addEventListener('click', (e) => {
      const b = e.target.closest('.tq-item');
      if (b) select(+b.dataset.id);
    });
    $$('.move').forEach((m) => m.addEventListener('click', () => decide(m.dataset.move)));
    stage.addEventListener('click', (e) => {
      const s = e.target.closest('[data-swap]');
      if (s) {
        state.swapFor[state.sel] = s.dataset.swap;
        renderStage();
        renderSide();
        return;
      }
      const n = e.target.closest('[data-next]');
      if (n) select(+n.dataset.next);
    });
    $('#tReset').addEventListener('click', () => {
      state.dec = {};
      state.swapFor = {};
      select(1);
      renderSide();
    });

    let inView = false;
    new IntersectionObserver(([e]) => (inView = e.isIntersecting), { threshold: 0.3 }).observe(
      $('.triage'),
    );
    document.addEventListener('keydown', (e) => {
      if (
        !inView ||
        document.querySelector('dialog[open]') ||
        !$('#cmdk').hidden ||
        document.documentElement.classList.contains('menu-open') ||
        e.metaKey ||
        e.ctrlKey ||
        e.altKey ||
        /input|textarea|select/i.test(e.target.tagName) ||
        e.target.isContentEditable
      )
        return;
      const k = e.key.toLowerCase();
      const map = { s: 'swap', b: 'bill', d: 'defer' };
      if (map[k]) {
        decide(map[k]);
        const btn = $(`.move[data-move=${map[k]}]`);
        btn.animate &&
          !RM &&
          btn.animate([{ transform: 'scale(.96)' }, { transform: 'scale(1)' }], {
            duration: 260,
            easing: 'cubic-bezier(.34,1.56,.64,1)',
          });
      }
      if (
        (k === 'arrowdown' || k === 'arrowup') &&
        document.activeElement &&
        document.activeElement.closest &&
        document.activeElement.closest('.triage')
      ) {
        e.preventDefault();
        const i = reqs.findIndex((x) => x.id === state.sel);
        const ni = (i + (k === 'arrowdown' ? 1 : -1) + reqs.length) % reqs.length;
        select(reqs[ni].id);
      }
    });
    return {
      init() {
        select(1, false);
        renderSide();
      },
    };
  })();

  /* Download the same document shown on Home, from the actual workspace renderer. */
  (() => {
    let busy = false;
    async function exportPDF() {
      if (busy) return;
      busy = true;
      const bar = $('#exportBar'),
        label = $('#exportTxt');
      bar.classList.add('busy');
      label.textContent = 'Preparing sample PDF…';
      let url;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      try {
        const response = await fetch('/samples/change-brief.pdf?v=4', {
          signal: controller.signal,
        });
        if (!response.ok || !response.headers.get('content-type')?.includes('application/pdf'))
          throw new Error('sample_unavailable');
        const blob = await response.blob();
        if (!(await blob.slice(0, 5).text()).startsWith('%PDF-')) throw new Error('invalid_sample');
        url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = 'ScopeLedger-sample-brief.pdf';
        document.body.appendChild(anchor);
        try {
          anchor.click();
        } finally {
          anchor.remove();
        }
        label.textContent = 'Sample brief downloaded';
        toast('Sample brief downloaded. Prepare your own document in the workspace.');
      } catch {
        label.textContent = 'Sample PDF unavailable — try again';
        toast('The sample PDF could not download. Try again shortly.');
      } finally {
        clearTimeout(timeout);
        if (url) setTimeout(() => URL.revokeObjectURL(url), 4000);
        bar.classList.remove('busy');
        busy = false;
      }
    }
    $('#exportBtn').addEventListener('click', exportPDF);
    $('#exportBtn2').addEventListener('click', exportPDF);
  })();

  /* =====================================================================
   PLAYBOOK
   ===================================================================== */
  (() => {
    const S = [
      {
        t: 'Delayed client copy',
        s: 'Content is late, launch date isn’t moving.',
        risk: 'High',
        move: 'defer',
        what: 'The client’s copy is two weeks late, but they still expect the original launch date. Your team is now expected to compress QA and absorb overtime.',
        steps: [
          'Log the delay against the content deadline in your SOW.',
          'Offer two dated options: shift launch, or launch with placeholder sections.',
          'Defer late sections to a post-launch sprint at the agreed rate.',
        ],
        subj: 'Launch timeline — two options for {project}',
        body: `Hi {client},\n\nQuick timeline check on {project}. Final copy was scheduled for {date1}, and we’re now {days} past that — so to protect quality, here are two paths:\n\n1. Keep launch on {launch}: we go live with the approved pages and add the remaining sections in a post-launch sprint.\n2. Move launch to {newlaunch}: we build everything in one pass.\n\nEither works on our side — just let me know which you prefer by {reply} and we’ll lock it in.\n\nBest,\n{you}`,
        vars: {
          client: 'Dana',
          project: 'the Webflow rebuild',
          date1: 'Sep 12',
          days: '12 business days',
          launch: 'Nov 14',
          newlaunch: 'Dec 2',
          reply: 'Friday',
          you: 'Alex',
        },
      },
      {
        t: 'Rogue stakeholder',
        s: 'A new exec appears late with new direction.',
        risk: 'Severe',
        move: 'bill',
        what: 'The CEO — absent for three rounds — joins the final review and asks for a new visual direction. The approved work is suddenly “not quite there.”',
        steps: [
          'Acknowledge the input and reference the signed-off round.',
          'Frame the new direction as a new creative round, not a revision.',
          'Send a priced change order before any work starts.',
        ],
        subj: 'New direction for the homepage — scope & pricing',
        body: `Hi {client},\n\nGreat to get {exec}’s perspective — a bolder direction could be really strong.\n\nFor context: the current design was approved in round {round} on {date1}. Exploring a fresh direction is a new creative round, so I’ve attached change order {co} for {price} ({hours} hours).\n\nOnce it’s approved we can start {start}, and it shifts launch by {shift}.\n\nHappy to jump on a quick call if it’s easier to walk through together.\n\nBest,\n{you}`,
        vars: {
          client: 'Dana',
          exec: 'Marcus',
          round: '3',
          date1: 'Sep 18',
          co: 'CO-015',
          price: '$1,500',
          hours: '10',
          start: 'Monday',
          shift: '3 business days',
          you: 'Alex',
        },
      },
      {
        t: 'Extra design revisions',
        s: 'Round 4, 5, 6… of the same page.',
        risk: 'High',
        move: 'bill',
        what: 'Your SOW includes three revision rounds. The client is asking for round five on the pricing page — each “small” pass is 3–4 hours of design and dev.',
        steps: [
          'Show the revision tracker: rounds used vs. included.',
          'Offer a per-round price or a discounted revision bundle.',
          'Consolidate feedback into one document before starting.',
        ],
        subj: 'Pricing page — revision round {n}',
        body: `Hi {client},\n\nThanks for the notes on the pricing page! A quick heads-up: we’ve now completed the {included} revision rounds included in the SOW, so this would be round {n}.\n\nAdditional rounds are {price} each, or {bundle} for a bundle of three. If you collect all feedback into a single doc, we can usually cover it in one pass.\n\nWant me to send over the change order so we can keep moving?\n\nBest,\n{you}`,
        vars: {
          client: 'Dana',
          included: '3',
          n: '5',
          price: '$525',
          bundle: '$1,350',
          you: 'Alex',
        },
      },
      {
        t: '“Just one more page”',
        s: 'A new page appears mid-build.',
        risk: 'Medium',
        move: 'swap',
        what: 'Mid-build, the client asks for an extra “Partners” landing page. It’s roughly the same effort as the Careers template they haven’t mentioned in weeks.',
        steps: [
          'Find an in-scope deliverable of similar size.',
          'Offer the swap first — it keeps budget and timeline intact.',
          'If they want both, fall back to a priced change order.',
        ],
        subj: 'Adding a Partners page — easy option inside the budget',
        body: `Hi {client},\n\nLove the idea of a {page} page. The simplest way to fit it in without touching budget or timeline is a swap: we build {page} instead of the {swap} (similar effort, ~{hours} hours).\n\nIf you’d rather keep both, no problem — I’ll send a change order for {price}.\n\nWhich would you prefer?\n\nBest,\n{you}`,
        vars: {
          client: 'Dana',
          page: 'Partners',
          swap: 'Careers template',
          hours: '8',
          price: '$1,200',
          you: 'Alex',
        },
      },
      {
        t: 'Post-launch “while you’re in there”',
        s: 'Launch is done, requests keep coming.',
        risk: 'Medium',
        move: 'defer',
        what: 'The site shipped and was signed off. Now a steady drip of “while you’re in there” asks is arriving — SEO tweaks, a new form, an integration.',
        steps: [
          'Thank them, confirm the project is complete per sign-off.',
          'Bundle incoming asks into a Phase 2 list with estimates.',
          'Offer a retainer or a fixed Phase 2 proposal.',
        ],
        subj: 'Phase 2 — rolling up your new ideas',
        body: `Hi {client},\n\nIt’s been great seeing {project} live! I’ve started a Phase 2 list so none of your new ideas get lost:\n\n• {item1}\n• {item2}\n• {item3}\n\nTogether that’s about {hours} hours ({price}). I can send a fixed Phase 2 proposal this week, or set up a small monthly retainer if you expect more to come.\n\nBest,\n{you}`,
        vars: {
          client: 'Priya',
          project: 'the new site',
          item1: 'Blog migration (140 posts)',
          item2: 'HubSpot form integration',
          item3: 'Technical SEO pass',
          hours: '32',
          price: '$4,800',
          you: 'Alex',
        },
      },
    ];
    const tabs = $('#pbTabs'),
      ind = $('#pbInd'),
      panel = $('#pbPanel');
    tabs.insertAdjacentHTML(
      'beforeend',
      S.map(
        (s, i) =>
          `<button class="pb-tab" role="tab" data-i="${i}" aria-selected="false"><span class="ix">0${i + 1}</span><span><span class="tt">${s.t}</span><span class="ts">${s.s}</span></span></button>`,
      ).join('') + `<div class="pb-more">+ 19 more scenarios in the full playbook</div>`,
    );
    const riskChip = { Severe: 'leak', High: 'leak', Medium: 'defer' };
    const moveLbl = { swap: 'Swap', bill: 'Bill', defer: 'Defer' };
    const fill = (str, v, hl) =>
      str.replace(/\{(\w+)\}/g, (_, k) =>
        hl ? `<span class="v">${v[k] ?? k}</span>` : (v[k] ?? k),
      );
    let cur = -1;
    function show(i) {
      if (i === cur) return;
      cur = i;
      const s = S[i];
      $$('.pb-tab', tabs).forEach((t, j) => {
        t.classList.toggle('on', j === i);
        t.setAttribute('aria-selected', j === i);
      });
      const t = $$('.pb-tab', tabs)[i];
      if (tabs.scrollWidth > tabs.clientWidth + 2)
        tabs.scrollTo({ left: t.offsetLeft - 8, behavior: 'smooth' });
      ind.style.transform = `translateY(${t.offsetTop}px)`;
      ind.style.height = t.offsetHeight + 'px';
      panel.innerHTML = `
      <div class="pb-top"><h3>${s.t}</h3><span class="chip ${riskChip[s.risk]}">Leak risk · ${s.risk}</span><span class="chip ${s.move}"><svg width="12" height="12"><use href="#i-${s.move}"/></svg>Recommended: ${moveLbl[s.move]}</span></div>
      <div class="pb-cols">
        <div class="pb-box"><div class="l">What’s happening</div><p>${s.what}</p></div>
        <div class="pb-box"><div class="l">The move</div><ol class="pb-steps">${s.steps.map((x) => `<li>${x}</li>`).join('')}</ol></div>
      </div>
      <div class="email">
        <div class="email-h"><svg width="14" height="14"><use href="#i-inbox"/></svg><span class="subj">${fill(s.subj, s.vars, false)}</span><button class="copy" data-copy><svg width="13" height="13"><use href="#i-copy"/></svg><span>Copy script</span></button></div>
        <div class="email-b">${fill(s.body, s.vars, true)}</div>
      </div>
      <div style="font-size:12.5px;color:var(--dim);margin-top:12px">Illustrative wording. Review and edit it for your agreement before sharing.</div>`;
      if (!RM) {
        panel.classList.remove('enter');
        void panel.offsetWidth;
        panel.classList.add('enter');
      }
      $('[data-copy]', panel).addEventListener('click', (e) => {
        const btn = e.currentTarget,
          text = fill(s.body, s.vars, false);
        const done = () => {
          btn.classList.add('ok');
          btn.querySelector('span').textContent = 'Copied';
          toast('Script copied to clipboard');
          setTimeout(() => {
            btn.classList.remove('ok');
            btn.querySelector('span').textContent = 'Copy script';
          }, 1800);
        };
        (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject())
          .then(done)
          .catch(() => {
            const ta = document.createElement('textarea');
            ta.value = text;
            document.body.appendChild(ta);
            ta.select();
            try {
              if (!document.execCommand('copy')) throw new Error('copy_failed');
              done();
            } catch (_) {
              toast('Copy could not complete. Select the script text and copy it.');
            } finally {
              ta.remove();
            }
          });
      });
    }
    tabs.addEventListener('click', (e) => {
      const t = e.target.closest('.pb-tab');
      if (t) show(+t.dataset.i);
    });
    tabs.addEventListener('keydown', (e) => {
      if (!['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;
      e.preventDefault();
      const n =
        (cur + (e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : -1) + S.length) % S.length;
      show(n);
      $$('.pb-tab', tabs)[n].focus();
    });
    show(0);
    addEventListener('resize', () => {
      const t = $$('.pb-tab', tabs)[cur];
      if (t) {
        ind.style.transform = `translateY(${t.offsetTop}px)`;
        ind.style.height = t.offsetHeight + 'px';
      }
    });
  })();

  /* =====================================================================
   ROI
   ===================================================================== */
  (() => {
    const ids = ['rRate', 'rHrs', 'rTw', 'rPr', 'rCatch'];
    const el = Object.fromEntries(ids.map((i) => [i, $('#' + i)]));
    const paint = (inp) =>
      inp.style.setProperty('--p', ((inp.value - inp.min) / (inp.max - inp.min)) * 100 + '%');
    function calc(first) {
      ids.forEach((i) => paint(el[i]));
      const rate = +el.rRate.value,
        hrs = +el.rHrs.value,
        tw = +el.rTw.value,
        pr = +el.rPr.value,
        cat = +el.rCatch.value / 100;
      $('#oRate').textContent = '$' + rate;
      $('#oHrs').textContent = hrs + 'h';
      $('#oTw').textContent = tw;
      $('#oPr').textContent = pr;
      $('#oCatch').textContent = Math.round(cat * 100) + '%';
      const per = rate * hrs,
        count = tw * pr,
        leak = per * count,
        rec = leak * cat,
        roi = rec / PRICE;
      const o = first ? { dur: 1400, from: 0 } : { dur: 450 };
      tween($('#vLeak'), leak, o);
      tween($('#vRec'), rec, o);
      tween($('#barRecV'), rec, o);
      tween($('#ctaRec'), rec, o);
      tween($('#vRoi'), roi, {
        ...o,
        format: (n) => (n >= 10 ? Math.round(n) : n.toFixed(1)) + '×',
      });
      tween($('#vHrs'), hrs * count * cat, { ...o, format: fmts.h });
      const max = Math.max(rec, PRICE);
      $('#barCost').style.width = Math.max(1.5, (PRICE / max) * 100) + '%';
      $('#barRec').style.width = Math.max(1.5, (rec / max) * 100) + '%';
      const need = Math.ceil(PRICE / per);
      $('#payTxt').innerHTML =
        need <= 1
          ? `Catching <b>just one</b> ${hrs}-hour request (${fmt$(per)}) covers ScopeLedger <b>${(per / PRICE).toFixed(1)}× over</b>. Everything after that is profit you keep.`
          : `Catching <b>${need} requests</b> covers ScopeLedger. At your pace, you’ll catch <b>${Math.round(count * cat)}</b> this year.`;
    }
    const presets = $$('.roi-presets button');
    const syncPreset = () => {
      const v = ids.map((i) => +el[i].value).join(',');
      presets.forEach((b) =>
        b.classList.toggle('on', b.dataset.p.split(',').map(Number).join(',') === v),
      );
    };
    const personalise = () => {
      const rec =
        +el.rRate.value * +el.rHrs.value * +el.rTw.value * +el.rPr.value * (+el.rCatch.value / 100);
      const a = mcta.querySelector('a');
      if (a) a.textContent = 'View lifetime options';
    };
    ids.forEach((i) =>
      el[i].addEventListener('input', () => {
        calc(false);
        syncPreset();
        personalise();
      }),
    );
    presets.forEach((b) =>
      b.addEventListener('click', () => {
        const to = b.dataset.p.split(',').map(Number),
          from = ids.map((i) => +el[i].value);
        ids.forEach((i, k) => (el[i].value = to[k]));
        calc(false);
        syncPreset();
        personalise();
        if (RM) return;
        const t0 = performance.now();
        const step = (t) => {
          const p = Math.min(1, (t - t0) / 420),
            e = 1 - Math.pow(1 - p, 3);
          ids.forEach((i, k) => {
            const inp = el[i],
              v = from[k] + (to[k] - from[k]) * e;
            inp.style.setProperty('--p', ((v - inp.min) / (inp.max - inp.min)) * 100 + '%');
            inp.value = p < 1 ? v : to[k];
          });
          if (p < 1) requestAnimationFrame(step);
          else ids.forEach((i) => paint(el[i]));
        };
        requestAnimationFrame(step);
      }),
    );
    // restore shared numbers: ?roi=rate,hours,tweaks,projects,catch
    try {
      const q = new URLSearchParams(location.search).get('roi');
      if (q) {
        const v = q.split(',').map(Number);
        if (v.length === 5 && v.every((n) => isFinite(n))) {
          ids.forEach((i, k) => {
            const inp = el[i];
            inp.value = Math.min(+inp.max, Math.max(+inp.min, v[k]));
          });
          syncPreset();
          personalise();
        }
      }
    } catch (e) {}
    $('#roiShare').addEventListener('click', async (e) => {
      const btn = e.currentTarget,
        label = btn.querySelector('span');
      const url =
        location.href.split(/[?#]/)[0] + '?roi=' + ids.map((i) => el[i].value).join(',') + '#roi';
      const ok = () => {
        btn.classList.add('ok');
        label.textContent = 'Link copied';
        toast('Link copied — it opens with your numbers filled in');
        clearTimeout(btn._t);
        btn._t = setTimeout(() => {
          btn.classList.remove('ok');
          label.textContent = 'Copy a link to these numbers';
        }, 2200);
      };
      if (navigator.share && matchMedia('(pointer:coarse)').matches) {
        try {
          await navigator.share({
            title: 'My ScopeLedger numbers',
            text: `I’m giving away ${$('#vLeak').textContent} a year in unbilled “quick tweaks”.`,
            url,
          });
          return;
        } catch (err) {
          if (err && err.name === 'AbortError') return;
        }
      }
      try {
        await navigator.clipboard.writeText(url);
        ok();
      } catch (err) {
        const t = document.createElement('textarea');
        t.value = url;
        t.style.cssText = 'position:fixed;opacity:0';
        document.body.appendChild(t);
        t.select();
        try {
          if (!document.execCommand('copy')) throw new Error('copy_failed');
          ok();
        } catch (_) {
          toast('Copy failed — your link: ' + url);
        } finally {
          t.remove();
        }
      }
    });
    calc(false);
    onReveal.set($('.roi-out'), () => calc(true));
  })();

  /* =====================================================================
   FAQ
   ===================================================================== */
  (() => {
    const F = [
      [
        'What does the lifetime license include?',
        'Individual is <b>$48.78 once for one activated browser/device</b>. Agency is <b>$99 once for five</b>. Both have the same paid features. Purchase availability and seller terms are shown before checkout.',
      ],
      [
        'How does a client approve a change?',
        'Export the brief and share it through your usual channel. Record the client’s written response in the workspace. Imported signatures and signing lines are supported; the app does not send approval links or authenticate client signatures.',
      ],
      [
        'How is this different from my project management tool?',
        'ScopeLedger focuses on the commercial decision behind a scope change: the agreed baseline, additional costs, a chosen fee and a reviewed client document. It can sit alongside your existing task tools.',
      ],
      [
        'Does it connect to Slack, email or Figma?',
        'There are no live capture integrations. Enter or paste the request and review it against the project baseline. Links and source text can provide context, but ScopeLedger does not fetch or interpret them automatically.',
      ],
      [
        'I don’t have a detailed SOW. Can I still use it?',
        'Yes. Enter the agreed deliverables, baseline fee and delivery costs. Use the scenario prompts to describe the change and review what is included, excluded or dependent on the client.',
      ],
      [
        'Can my whole team use it?',
        'Agency allows five activated browsers/devices. <b>Each has an independent local workspace</b>; there are no shared accounts, client viewers or automatic synchronization. Backups transfer records deliberately.',
      ],
      [
        'Where is my client data stored?',
        'Project records and document drafts are saved in this browser. Password-protected backups encrypt your exported copy; optional plain JSON backups contain readable records. Keep your backup and passphrase safely. Activation uses the licensing service. Deliberate PDF export sends public client-document fields to the rendering service; internal cost and margin fields are excluded. There is no selectable cloud region.',
      ],
      [
        'How do I keep a copy of my work?',
        'Export a password-protected workspace backup from Settings & backup, or deliberately choose plain JSON. Download issued documents as individual PDFs while export is available. Clearing browser storage removes local records, so keep copies outside this browser.',
      ],
      [
        'Can I try it before purchasing?',
        'Yes. Explore one sample project in the demo workspace and download the public sample brief and invoice. Checkout remains unavailable until seller setup is complete. Review the published seller terms when purchasing becomes available.',
      ],
    ];
    const list = $('#faqList');
    list.innerHTML = F.map(
      ([q, a], i) =>
        `<div class="fq${i === 0 ? ' open' : ''}" data-reveal style="--d:${i * 60}ms"><button aria-expanded="${i === 0}" aria-controls="fa${i}" id="fq${i}">${q}<span class="pm"></span></button><div class="fq-a" id="fa${i}" role="region" aria-labelledby="fq${i}"><div><p>${a}</p></div></div></div>`,
    ).join('');
    list.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      const item = b.parentElement,
        open = !item.classList.contains('open');
      $$('.fq', list).forEach((f) => {
        f.classList.remove('open');
        f.querySelector('button').setAttribute('aria-expanded', 'false');
      });
      if (open) {
        item.classList.add('open');
        b.setAttribute('aria-expanded', 'true');
      }
    });
  })();

  /* =====================================================================
   COMMAND MENU  (⌘K / Ctrl+K / "/")
   ===================================================================== */
  (() => {
    const box = $('#cmdk'),
      q = $('#cmdkQ'),
      list = $('#cmdkList'),
      root = document.documentElement;
    const mac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
    if (!mac) {
      $('#cmdkKey').textContent = 'Ctrl K';
      $('#cmdkKey2').textContent = 'Ctrl K';
    }
    const I = {
      arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
      play: '<path d="M8 5.5v13l10-6.5z"/>',
      book: '<path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H20v14H5.5A1.5 1.5 0 0 0 4 19.5z"/><path d="M4 19.5A1.5 1.5 0 0 0 5.5 21H20"/>',
      doc: '<path d="M14 3H6.5A1.5 1.5 0 0 0 5 4.5v15A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>',
      calc: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 7h6M9 12h.01M12 12h.01M15 12h.01M9 16h.01M12 16h.01M15 16h.01"/>',
      cols: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16M15 4v16"/>',
      tag: '<path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9z"/><circle cx="8" cy="8" r="1.5"/>',
      help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17h.01"/>',
      user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
      quote:
        '<path d="M7 17c-2 0-3-1.5-3-3.5C4 10 6 7 9 6M17 17c-2 0-3-1.5-3-3.5 0-3.5 2-6.5 5-7.5"/>',
      theme: '<path d="M12 3a9 9 0 1 0 9 9 7 7 0 0 1-9-9z"/>',
      down: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
      link: '<path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1"/>',
      mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/>',
      buy: '<path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4 6.7 19.4l1.2-6L3.4 9.3l6-.7z"/>',
    };
    const go = (sel) => () => {
      const t = $(sel);
      if (t) {
        t.scrollIntoView({ behavior: RM ? 'auto' : 'smooth', block: 'start' });
        const destination = t.querySelector('h1,h2,h3') || t;
        destination.tabIndex = -1;
        destination.focus({ preventScroll: true });
      }
    };
    const C = [
      ['Jump to', 'How it works', 'steps capture decide send', 'play', go('#how')],
      [
        'Jump to',
        'Try the triage demo',
        'swap bill defer interactive requests',
        'play',
        () => {
          const t = $('.triage');
          t && t.scrollIntoView({ behavior: RM ? 'auto' : 'smooth', block: 'center' });
        },
      ],
      [
        'Jump to',
        'Scenario playbook',
        'scripts templates late copy stakeholder revisions',
        'book',
        go('#playbook'),
      ],
      ['Jump to', 'Change orders', 'pdf paper signature', 'doc', go('#change-orders')],
      ['Jump to', 'ROI calculator', 'numbers margin savings return', 'calc', go('#roi')],
      ['Jump to', 'Product evidence', 'trust features proof', 'quote', go('#proof')],
      ['Jump to', 'Compare options', 'versus spreadsheet absorb', 'cols', go('#compare')],
      [
        'Jump to',
        'Open workspace',
        'app projects clients dashboard documents',
        'cols',
        () => {
          location.href = '/workspace/';
        },
      ],
      ['Jump to', 'Pricing', 'price lifetime cost 48.78 99', 'tag', go('#pricing')],
      ['Jump to', 'FAQ', 'questions refund team data', 'help', go('#faq')],
      ['Jump to', 'Why this exists', 'purpose about scope', 'user', go('#founder')],
      [
        'Actions',
        'Get lifetime access — $48.78',
        'buy checkout purchase',
        'buy',
        () =>
          document.dispatchEvent(
            new CustomEvent('scopeledger:choose-license', {
              detail: { opener: document.activeElement },
            }),
          ),
      ],
      [
        'Actions',
        'Choose appearance',
        'theme dark light system mode appearance',
        'theme',
        () => $('#themeBtn').click(),
      ],
      [
        'Actions',
        'Download a sample brief',
        'pdf export example',
        'down',
        () => $('#exportBtn2').click(),
      ],
      [
        'Actions',
        'Copy a link to my ROI numbers',
        'share calculator url',
        'link',
        () => $('#roiShare').click(),
      ],
      [
        'Actions',
        'Open help & support',
        'contact support help',
        'mail',
        () => {
          location.href = '/workspace/?view=support';
        },
      ],
    ];
    let items = [],
      sel = 0,
      lastFocus = null;
    const esc = (t) => t.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
    const hl = (t, w) => {
      if (!w) return esc(t);
      const i = t.toLowerCase().indexOf(w);
      return i < 0
        ? esc(t)
        : esc(t.slice(0, i)) +
            '<mark>' +
            esc(t.slice(i, i + w.length)) +
            '</mark>' +
            esc(t.slice(i + w.length));
    };
    function render() {
      const w = q.value.trim().toLowerCase();
      items = C.map((c) => ({
        g: c[0],
        t: typeof c[1] === 'function' ? c[1]() : c[1],
        k: c[2],
        ic: c[3],
        run: c[4],
      })).filter(
        (c) =>
          !w ||
          w.split(/\s+/).every((p) => (c.t + ' ' + c.k + ' ' + c.g).toLowerCase().includes(p)),
      );
      sel = Math.min(sel, Math.max(0, items.length - 1));
      if (!items.length) {
        list.innerHTML = `<div class="cmdk-empty">No results for “${esc(q.value)}”</div>`;
        q.removeAttribute('aria-activedescendant');
        return;
      }
      let html = '',
        g = '';
      items.forEach((c, i) => {
        if (c.g !== g) {
          g = c.g;
          html += `<div class="cmdk-g" role="presentation">${g}</div>`;
        }
        html += `<button type="button" class="cmdk-i" role="option" id="ck${i}" data-i="${i}" aria-selected="${i === sel}"><span class="ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I[c.ic]}</svg></span><span class="lb">${hl(c.t, w.split(/\s+/)[0])}</span>${c.g === 'Jump to' ? '<span class="h">Section</span>' : ''}</button>`;
      });
      list.innerHTML = html;
      q.setAttribute('aria-activedescendant', 'ck' + sel);
    }
    const move = (d) => {
      if (!items.length) return;
      sel = (sel + d + items.length) % items.length;
      $$('.cmdk-i', list).forEach((b, i) => b.setAttribute('aria-selected', i === sel));
      const b = $('#ck' + sel);
      b && b.scrollIntoView({ block: 'nearest' });
      q.setAttribute('aria-activedescendant', 'ck' + sel);
    };
    function open() {
      if (!box.hidden) return;
      const visibleOpener = [$('#cmdkBtn'), $('#menuBtn'), $('#themeBtn')].find(
        (button) => button.getClientRects().length,
      );
      lastFocus = document.activeElement === document.body ? visibleOpener : document.activeElement;
      if (root.classList.contains('menu-open')) {
        $('#menuBtn').click();
        lastFocus = visibleOpener;
      }
      box.hidden = false;
      root.style.overflow = 'hidden';
      q.value = '';
      sel = 0;
      render();
      requestAnimationFrame(() => {
        box.classList.add('open');
        q.focus();
      });
    }
    function close(restore = true) {
      if (box.hidden) return;
      box.classList.remove('open');
      root.style.overflow = '';
      setTimeout(
        () => {
          box.hidden = true;
        },
        RM ? 0 : 220,
      );
      if (restore && lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
    }
    const run = (i) => {
      const c = items[i];
      if (!c) return;
      close(true);
      setTimeout(c.run, RM ? 0 : 120);
    };
    q.addEventListener('input', () => {
      sel = 0;
      render();
    });
    q.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        move(1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        move(-1);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        run(sel);
      } else if (e.key === 'Tab') {
        e.preventDefault();
        move(e.shiftKey ? -1 : 1);
      }
    });
    list.addEventListener('click', (e) => {
      const b = e.target.closest('.cmdk-i');
      if (b) run(+b.dataset.i);
    });
    list.addEventListener('pointermove', (e) => {
      const b = e.target.closest('.cmdk-i');
      if (b && +b.dataset.i !== sel) {
        sel = +b.dataset.i;
        $$('.cmdk-i', list).forEach((x, i) => x.setAttribute('aria-selected', i === sel));
        q.setAttribute('aria-activedescendant', 'ck' + sel);
      }
    });
    box.addEventListener('click', (e) => {
      if (e.target.hasAttribute('data-close')) close();
    });
    $('#cmdkBtn').addEventListener('click', open);
    document.addEventListener(
      'keydown',
      (e) => {
        if (document.querySelector('dialog[open]')) return;
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
          e.preventDefault();
          box.hidden ? open() : close();
          return;
        }
        if (e.key === 'Escape' && !box.hidden) {
          e.preventDefault();
          close();
          return;
        }
        if (
          e.key === '/' &&
          box.hidden &&
          !/input|textarea|select/i.test(e.target.tagName) &&
          !e.target.isContentEditable
        ) {
          e.preventDefault();
          open();
        }
      },
      true,
    );
  })();

  T.init();
  $$('[data-reveal],[data-split]').forEach((el) => io.observe(el));
  requestAnimationFrame(() =>
    $$('.hero [data-reveal], .hero [data-split]').forEach((el) => {
      el.classList.add('is-in');
      io.unobserve(el);
    }),
  );
  window.scopeLedgerHomeReady = true;
})();
