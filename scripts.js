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

  const explicitDate = target.getAttribute('datetime')?.trim();
  if (explicitDate) {
    target.textContent = explicitDate;
    return;
  }

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
const imageModal = $('#imageModal');
const imageViewer = $('#imageViewer');
const imageClose = $('#imageClose');
const videoModal = $('#videoModal');
const videoPlayer = $('#videoPlayer');
const videoClose = $('#videoClose');
const pageShell = $('.container');
const modalFocusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'iframe',
  'video[controls]',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');
let lastFocused = null;

const setPageInert = isInert => {
  if (!pageShell) return;
  if (isInert) pageShell.setAttribute('inert', '');
  else pageShell.removeAttribute('inert');
};

const getOpenModal = () => {
  if (pdfModal?.classList.contains('open')) return pdfModal;
  if (imageModal?.classList.contains('open')) return imageModal;
  if (videoModal?.classList.contains('open')) return videoModal;
  return null;
};

const getFocusableModalElements = modal => {
  if (!modal) return [];
  return Array.from(modal.querySelectorAll(modalFocusableSelector)).filter(element => {
    if (element.hasAttribute('hidden') || element.getAttribute('aria-hidden') === 'true') {
      return false;
    }
    return element.getClientRects().length > 0;
  });
};

const openPdfModal = path => {
  if (!pdfModal || !pdfViewer || !path) return;
  lastFocused = document.activeElement;
  setPageInert(true);
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
  setPageInert(false);
  if (lastFocused && typeof lastFocused.focus === 'function') lastFocused.focus();
};

const openVideoModal = path => {
  if (!videoModal || !videoPlayer || !path) return;
  lastFocused = document.activeElement;
  setPageInert(true);
  videoPlayer.src = path;
  videoPlayer.muted = true;
  videoModal.classList.add('open');
  videoModal.setAttribute('aria-hidden', 'false');
  videoPlayer.play().catch(() => {});
  videoClose?.focus();
};

const openImageModal = path => {
  if (!imageModal || !imageViewer || !path) return;
  lastFocused = document.activeElement;
  setPageInert(true);
  imageViewer.src = path;
  imageModal.classList.add('open');
  imageModal.setAttribute('aria-hidden', 'false');
  imageClose?.focus();
};

const closeImageModal = () => {
  if (!imageModal || !imageViewer) return;
  imageModal.classList.remove('open');
  imageModal.setAttribute('aria-hidden', 'true');
  imageViewer.src = '';
  setPageInert(false);
  if (lastFocused && typeof lastFocused.focus === 'function') lastFocused.focus();
};

const closeVideoModal = () => {
  if (!videoModal || !videoPlayer) return;
  videoModal.classList.remove('open');
  videoModal.setAttribute('aria-hidden', 'true');
  videoPlayer.pause();
  videoPlayer.removeAttribute('src');
  videoPlayer.load();
  setPageInert(false);
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
    return;
  }

  const imageTrigger = event.target.closest('.image-link');
  if (imageTrigger) {
    event.preventDefault();
    openImageModal(imageTrigger.getAttribute('data-image'));
  }
});

pdfClose?.addEventListener('click', closePdfModal);
imageClose?.addEventListener('click', closeImageModal);
videoClose?.addEventListener('click', closeVideoModal);

window.addEventListener('click', event => {
  if (event.target === pdfModal) closePdfModal();
  if (event.target === imageModal) closeImageModal();
  if (event.target === videoModal) closeVideoModal();
});

document.addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    closePdfModal();
    closeImageModal();
    closeVideoModal();
    return;
  }

  if (event.key !== 'Tab') return;

  const openModal = getOpenModal();
  if (!openModal) return;

  const focusableElements = getFocusableModalElements(openModal);
  if (focusableElements.length === 0) {
    event.preventDefault();
    openModal.focus();
    return;
  }

  const firstElement = focusableElements[0];
  const lastElement = focusableElements[focusableElements.length - 1];
  const activeElement = document.activeElement;

  if (event.shiftKey) {
    if (activeElement === firstElement || !openModal.contains(activeElement)) {
      event.preventDefault();
      lastElement.focus();
    }
    return;
  }

  if (activeElement === lastElement || !openModal.contains(activeElement)) {
    event.preventDefault();
    firstElement.focus();
  }
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

const updateCopyrightYear = () => {
  const footer = document.querySelector('.footer-meta');
  if (!footer) return;
  const currentYear = new Date().getFullYear();
  footer.innerHTML = footer.innerHTML.replace(/© \d{4}–\d{4}/, `© 2025–${currentYear}`);
};

document.addEventListener('DOMContentLoaded', () => {
  updateLastUpdated();
  updateCopyrightYear();
  setupVisitorMapFallback();
});
