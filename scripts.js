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

const profileBox = $('#profileBox');
profileBox?.addEventListener('click', () => {
  const isToggled = profileBox.classList.toggle('toggled');
  profileBox.setAttribute('aria-pressed', String(isToggled));
});

const modalRegistry = [
  {
    trigger: '.pdf-link',
    dataAttr: 'data-pdf',
    modal: $('#pdfModal'),
    viewer: $('#pdf-viewer'),
    closeButton: $('#pdfClose'),
  },
  {
    trigger: '.image-link',
    dataAttr: 'data-image',
    modal: $('#imageModal'),
    viewer: $('#imageViewer'),
    closeButton: $('#imageClose'),
  },
  {
    trigger: '.video-link',
    dataAttr: 'data-video',
    modal: $('#videoModal'),
    viewer: $('#videoPlayer'),
    closeButton: $('#videoClose'),
    onOpen: viewer => {
      viewer.muted = true;
      viewer.play().catch(() => {});
    },
    onClose: viewer => {
      viewer.pause();
      viewer.removeAttribute('src');
      viewer.load();
    },
  },
];
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

const getOpenModal = () =>
  modalRegistry.find(entry => entry.modal?.classList.contains('open'))?.modal ?? null;

const getFocusableModalElements = modal => {
  if (!modal) return [];
  return Array.from(modal.querySelectorAll(modalFocusableSelector)).filter(element => {
    if (element.hasAttribute('hidden') || element.getAttribute('aria-hidden') === 'true') {
      return false;
    }
    return element.getClientRects().length > 0;
  });
};

const openModal = (entry, path) => {
  const { modal, viewer } = entry;
  if (!modal || !viewer || !path) return;
  lastFocused = document.activeElement;
  setPageInert(true);
  if (viewer instanceof HTMLIFrameElement) {
    viewer.addEventListener('load', () => {
      if (modal.classList.contains('open')) entry.closeButton?.focus();
    }, { once: true });
  }
  viewer.src = path;
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
  entry.onOpen?.(viewer);
  window.requestAnimationFrame(() => {
    if (modal.classList.contains('open')) entry.closeButton?.focus();
  });
};

const closeModal = entry => {
  const { modal, viewer } = entry;
  if (!modal || !viewer) return;
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
  if (entry.onClose) entry.onClose(viewer);
  else viewer.src = '';
  setPageInert(false);
  if (lastFocused && typeof lastFocused.focus === 'function') lastFocused.focus();
  lastFocused = null;
};

document.addEventListener('click', event => {
  for (const entry of modalRegistry) {
    const trigger = event.target.closest(entry.trigger);
    if (trigger) {
      event.preventDefault();
      openModal(entry, trigger.getAttribute(entry.dataAttr));
      return;
    }
  }
});

modalRegistry.forEach(entry => {
  entry.closeButton?.addEventListener('click', () => closeModal(entry));
});

window.addEventListener('click', event => {
  for (const entry of modalRegistry) {
    if (event.target === entry.modal) closeModal(entry);
  }
});

document.addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    const openEntry = modalRegistry.find(entry => entry.modal?.classList.contains('open'));
    if (openEntry) closeModal(openEntry);
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

const updateCopyrightYear = () => {
  const footer = document.querySelector('.footer-meta');
  if (!footer) return;
  const currentYear = new Date().getFullYear();
  const walker = document.createTreeWalker(footer, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    if (/© \d{4}–\d{4}/.test(node.nodeValue)) {
      node.nodeValue = node.nodeValue.replace(/© \d{4}–\d{4}/, `© 2025–${currentYear}`);
    }
  }
};

document.addEventListener('DOMContentLoaded', () => {
  updateLastUpdated();
  updateCopyrightYear();
});
