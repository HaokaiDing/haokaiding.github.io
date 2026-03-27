const $ = (selector, root = document) => root.querySelector(selector);

const safeStorage = (() => {
  try {
    const storage = window.localStorage;
    const key = '__storage_test__';
    storage.setItem(key, key);
    storage.removeItem(key);
    return {
      get(name) {
        try {
          return storage.getItem(name);
        } catch {
          return null;
        }
      },
      set(name, value) {
        try {
          storage.setItem(name, value);
        } catch {}
      },
    };
  } catch {
    return {
      get: () => null,
      set: () => {},
    };
  }
})();

const themeSwitcher = $('#theme-switcher');
let themeTransitionTimeout = null;

const runThemeTransition = () => {
  document.documentElement.classList.add('theme-transition');
  if (themeTransitionTimeout) window.clearTimeout(themeTransitionTimeout);
  themeTransitionTimeout = window.setTimeout(() => {
    document.documentElement.classList.remove('theme-transition');
  }, 300);
};

const applyTheme = (theme, { animate = true } = {}) => {
  if (animate) runThemeTransition();
  document.body.classList.toggle('dark-mode', theme === 'dark');
  if (themeSwitcher) {
    themeSwitcher.textContent = theme === 'dark' ? '☼' : '☾';
    themeSwitcher.setAttribute('aria-pressed', String(theme === 'dark'));
  }
};

const inferInitialTheme = () => {
  const storedTheme = safeStorage.get('theme');
  if (storedTheme === 'light' || storedTheme === 'dark') return storedTheme;

  const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  const prefersLight = window.matchMedia?.('(prefers-color-scheme: light)').matches;
  if (prefersDark) return 'dark';
  if (prefersLight) return 'light';

  const hour = new Date().getHours();
  return hour >= 19 || hour < 7 ? 'dark' : 'light';
};

applyTheme(inferInitialTheme(), { animate: false });

themeSwitcher?.addEventListener('click', () => {
  const next = document.body.classList.contains('dark-mode') ? 'light' : 'dark';
  safeStorage.set('theme', next);
  applyTheme(next);
});

const updateLastUpdated = () => {
  const target = $('#lastUpdated');
  if (!target) return;

  const parsed = new Date(document.lastModified);
  if (Number.isNaN(parsed.getTime())) {
    target.textContent = document.lastModified || '—';
    return;
  }

  const pad = value => String(value).padStart(2, '0');
  const formatted = `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}`;
  target.textContent = formatted;
  target.setAttribute('datetime', formatted);
};

let touchCapable = false;
window.addEventListener('touchstart', () => {
  touchCapable = true;
}, { once: true });

const profileBox = $('#profileBox');
profileBox?.addEventListener('click', () => {
  if (touchCapable) profileBox.classList.toggle('toggled');
});

const pdfModal = $('#pdfModal');
const pdfViewer = $('#pdf-viewer');
const pdfClose = $('#pdfClose');
const videoModal = $('#videoModal');
const videoPlayer = $('#videoPlayer');
const videoClose = $('#videoClose');
let lastFocused = null;

const openPdfModal = path => {
  if (!pdfModal || !pdfViewer || !path) return;
  lastFocused = document.activeElement;
  pdfViewer.src = path;
  pdfModal.classList.add('open');
  pdfModal.setAttribute('aria-hidden', 'false');
  pdfClose?.focus();
};

const closePdfModal = () => {
  if (!pdfModal || !pdfViewer) return;
  pdfModal.classList.remove('open');
  pdfModal.setAttribute('aria-hidden', 'true');
  pdfViewer.src = '';
  if (lastFocused && typeof lastFocused.focus === 'function') lastFocused.focus();
};

const openVideoModal = path => {
  if (!videoModal || !videoPlayer || !path) return;
  lastFocused = document.activeElement;
  videoPlayer.src = path;
  videoModal.classList.add('open');
  videoModal.setAttribute('aria-hidden', 'false');
  videoPlayer.play().catch(() => {});
  videoClose?.focus();
};

const closeVideoModal = () => {
  if (!videoModal || !videoPlayer) return;
  videoModal.classList.remove('open');
  videoModal.setAttribute('aria-hidden', 'true');
  videoPlayer.pause();
  videoPlayer.removeAttribute('src');
  videoPlayer.load();
  if (lastFocused && typeof lastFocused.focus === 'function') lastFocused.focus();
};

document.addEventListener('click', event => {
  const pdfTrigger = event.target.closest('.pdf-link');
  if (pdfTrigger) {
    event.preventDefault();
    openPdfModal(pdfTrigger.getAttribute('data-pdf'));
    return;
  }

  const videoTrigger = event.target.closest('.video-link');
  if (videoTrigger) {
    event.preventDefault();
    openVideoModal(videoTrigger.getAttribute('data-video'));
  }
});

pdfClose?.addEventListener('click', closePdfModal);
videoClose?.addEventListener('click', closeVideoModal);

window.addEventListener('click', event => {
  if (event.target === pdfModal) closePdfModal();
  if (event.target === videoModal) closeVideoModal();
});

document.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return;
  closePdfModal();
  closeVideoModal();
});

const setupVisitorMapFallback = () => {
  const container = $('#visitorMap');
  const fallback = $('#visitorMapFallback');
  const scriptEl = $('#clustrmaps');
  if (!container || !fallback || !scriptEl) return;

  fallback.dataset.state = 'loading';
  const widgetSelector = 'img, iframe, .clustrmaps-map, .clustrmaps-widget, .clustrmaps-globe';
  const hasWidget = () => Boolean(container.querySelector(widgetSelector));

  const markLoaded = () => {
    fallback.dataset.state = 'loaded';
    fallback.classList.remove('show-help');
  };

  const showFallback = () => {
    fallback.classList.add('show-help');
  };

  if (hasWidget()) {
    markLoaded();
    return;
  }

  scriptEl.addEventListener('error', showFallback);
  scriptEl.addEventListener('load', () => {
    window.setTimeout(() => {
      if (hasWidget()) markLoaded();
      else showFallback();
    }, 200);
  });

  const observer = new MutationObserver(() => {
    if (!hasWidget()) return;
    markLoaded();
    observer.disconnect();
  });

  observer.observe(container, { childList: true, subtree: true });

  window.setTimeout(() => {
    if (fallback.dataset.state !== 'loaded' && !hasWidget()) showFallback();
  }, 6000);
};

document.addEventListener('DOMContentLoaded', () => {
  updateLastUpdated();
  setupVisitorMapFallback();
});
