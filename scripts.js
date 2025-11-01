const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

/* 主题切换 */
const safeStorage = (() => {
  try {
    const storage = window.localStorage;
    const testKey = '__storage_test__';
    storage.setItem(testKey, testKey);
    storage.removeItem(testKey);
    return {
      get(key) {
        try {
          return storage.getItem(key);
        } catch (error) {
          console.warn('Failed to read from localStorage', error);
          return null;
        }
      },
      set(key, value) {
        try {
          storage.setItem(key, value);
        } catch (error) {
          console.warn('Failed to write to localStorage', error);
        }
      },
    };
  } catch (error) {
    console.warn('Local storage is not accessible; preferences will not persist.', error);
    return {
      get: () => null,
      set: () => {},
    };
  }
})();

const themeSwitcher = $('#theme-switcher');
const applyTheme = theme => {
  if (theme === 'dark') {
    document.body.classList.add('dark-mode');
    if (themeSwitcher) themeSwitcher.textContent = '☀️';
  } else {
    document.body.classList.remove('dark-mode');
    if (themeSwitcher) themeSwitcher.textContent = '🌙';
  }
};
applyTheme(safeStorage.get('theme') || 'light');
if (themeSwitcher) {
  themeSwitcher.addEventListener('click', () => {
    const current = document.body.classList.contains('dark-mode') ? 'dark' : 'light';
    const next = current === 'dark' ? 'light' : 'dark';
    safeStorage.set('theme', next);
    applyTheme(next);
  });
}

/* 侧边栏菜单 */
const sidebar = $('#siteSidebar');
const sidebarToggle = $('#sidebarToggle');
const sidebarOverlay = $('#sidebarOverlay');
const sidebarClose = $('#sidebarClose');
let sidebarLastFocused = null;
const sidebarFocusableSelector = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

const getSidebarFocusable = () => sidebar ? $$(sidebarFocusableSelector, sidebar).filter(el => !el.hasAttribute('hidden')) : [];

const openSidebar = () => {
  if (!sidebar || !sidebarToggle) return;
  sidebarLastFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  sidebar.classList.add('open');
  sidebar.setAttribute('aria-hidden', 'false');
  document.body.classList.add('no-scroll');
  if (sidebarOverlay) {
    sidebarOverlay.hidden = false;
    sidebarOverlay.classList.add('open');
  }
  sidebarToggle.setAttribute('aria-expanded', 'true');
  const focusables = getSidebarFocusable();
  if (focusables.length) focusables[0].focus();
};

const closeSidebar = () => {
  if (!sidebar || !sidebarToggle) return;
  sidebar.classList.remove('open');
  sidebar.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('no-scroll');
  if (sidebarOverlay) sidebarOverlay.classList.remove('open');
  sidebarToggle.setAttribute('aria-expanded', 'false');
  window.setTimeout(() => {
    if (sidebarOverlay && !sidebar.classList.contains('open')) sidebarOverlay.hidden = true;
  }, 250);
  if (sidebarLastFocused && typeof sidebarLastFocused.focus === 'function') sidebarLastFocused.focus();
};

const handleSidebarTrap = event => {
  if (!sidebar || !sidebar.classList.contains('open') || event.key !== 'Tab') return;
  const focusables = getSidebarFocusable();
  if (focusables.length === 0) return;
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
};

const applySidebarMode = () => {
  if (!sidebar) return;

  document.body.classList.remove('sidebar-static');

  if (!sidebar.classList.contains('open')) {
    sidebar.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('no-scroll');
    if (sidebarOverlay) {
      sidebarOverlay.classList.remove('open');
      sidebarOverlay.hidden = true;
    }
    if (sidebarToggle) sidebarToggle.setAttribute('aria-expanded', 'false');
  } else {
    sidebar.setAttribute('aria-hidden', 'false');
    document.body.classList.add('no-scroll');
    if (sidebarOverlay) {
      sidebarOverlay.hidden = false;
      sidebarOverlay.classList.add('open');
    }
    if (sidebarToggle) sidebarToggle.setAttribute('aria-expanded', 'true');
  }
};

if (sidebar && sidebarToggle && sidebarClose) {
  sidebarToggle.addEventListener('click', () => {
    if (sidebar.classList.contains('open')) {
      closeSidebar();
    } else {
      openSidebar();
    }
  });
  sidebarClose.addEventListener('click', closeSidebar);
  if (sidebarOverlay) sidebarOverlay.addEventListener('click', closeSidebar);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && sidebar.classList.contains('open')) closeSidebar();
  });
  document.addEventListener('keydown', handleSidebarTrap);
}

window.addEventListener('resize', () => {
  window.requestAnimationFrame(applySidebarMode);
});
document.addEventListener('DOMContentLoaded', applySidebarMode, { once: true });
applySidebarMode();

/* 语言切换 */
function setLanguage(lang) {
  document.documentElement.setAttribute('data-lang', lang);
  $$('#lang-switcher .lang-link').forEach(button => {
    button.classList.toggle('active', button.dataset.lang === lang);
  });
  safeStorage.set('preferredLanguage', lang);
}
$$('#lang-switcher .lang-link').forEach(button => {
  button.addEventListener('click', () => setLanguage(button.dataset.lang));
});
document.addEventListener('DOMContentLoaded', () => {
  setLanguage(safeStorage.get('preferredLanguage') || 'en');
});

/* 触摸头像切换 */
let touchCapable = false;
window.addEventListener('touchstart', () => {
  touchCapable = true;
}, { once: true });
const profileBox = $('#profileBox');
if (profileBox) {
  profileBox.addEventListener('click', () => {
    if (touchCapable) profileBox.classList.toggle('toggled');
  });
}

/* 论文 PDF 预览弹窗（简历导出已删除） */
const modal = $('#pdfModal');
const pdfViewer = $('#pdf-viewer');
const pdfClose = $('#pdfClose');
let lastFocused = null;
const openPdfModal = path => {
  if (!modal || !pdfViewer || !pdfClose) return;
  lastFocused = document.activeElement;
  pdfViewer.src = path;
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
  pdfClose.focus();
};
const closePdfModal = () => {
  if (!modal || !pdfViewer) return;
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
  pdfViewer.src = '';
  if (lastFocused && typeof lastFocused.focus === 'function') lastFocused.focus();
};
if (modal && pdfClose) {
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closePdfModal();
  });
  window.addEventListener('click', event => {
    if (event.target === modal) closePdfModal();
  });
  pdfClose.addEventListener('click', closePdfModal);
  document.addEventListener('click', event => {
    const trigger = event.target.closest('.pdf-link');
    if (!trigger) return;
    event.preventDefault();
    openPdfModal(trigger.getAttribute('data-pdf'));
  });
}

/* 视频弹窗 */
const videoModal = $('#videoModal');
const videoPlayer = $('#videoPlayer');
const videoClose = $('#videoClose');
const videoButton = $('#videoButton');
const openVideoModal = () => {
  if (!videoModal || !videoPlayer || !videoClose) return;
  lastFocused = document.activeElement;
  videoModal.classList.add('open');
  videoModal.setAttribute('aria-hidden', 'false');
  videoPlayer.play();
  videoClose.focus();
};
const closeVideoModal = () => {
  if (!videoModal || !videoPlayer) return;
  videoModal.classList.remove('open');
  videoModal.setAttribute('aria-hidden', 'true');
  videoPlayer.pause();
  videoPlayer.currentTime = 0;
  if (lastFocused && typeof lastFocused.focus === 'function') lastFocused.focus();
};
if (videoButton) videoButton.addEventListener('click', openVideoModal);
if (videoClose) videoClose.addEventListener('click', closeVideoModal);
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    closePdfModal();
    closeVideoModal();
    closeSidebar();
  }
});
window.addEventListener('click', event => {
  if (event.target === videoModal) closeVideoModal();
});

/* 返回顶部 */
const backBtn = $('#backToTop');
if (backBtn) {
  const onScroll = () => {
    backBtn.style.display = window.scrollY > 300 ? 'block' : 'none';
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  backBtn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
}

/* 作者徽章自动化：†=Co-first；*=Advisor；不自动判定 First Author */
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.pub-authors').forEach(el => {
    const nodes = [...el.childNodes];
    const makeBadge = (cls, en, zh) => {
      const span = document.createElement('span');
      span.className = cls;
      span.innerHTML = `<span class="lang-en">${en}</span><span class="lang-zh">${zh}</span>`;
      return span;
    };
    nodes.forEach(node => {
      if (node.nodeType === 1 && node.tagName === 'SUP') {
        const marker = node.textContent.trim();
        el.replaceChild(
          marker === '†'
            ? makeBadge('author-badge', 'Co-first Author', '共同第一作者')
            : makeBadge('advisor-badge', 'Advisor', '导师'),
          node
        );
        return;
      }
      if (node.nodeType === 3) {
        const text = node.nodeValue;
        if (!text || (!text.includes('†') && !text.includes('*'))) return;
        const fragment = document.createDocumentFragment();
        const regex = /[†*]/g;
        let index = 0;
        let match;
        while ((match = regex.exec(text))) {
          const chunk = text.slice(index, match.index);
          if (chunk) fragment.appendChild(document.createTextNode(chunk));
          fragment.appendChild(
            match[0] === '†'
              ? makeBadge('author-badge', 'Co-first Author', '共同第一作者')
              : makeBadge('advisor-badge', 'Advisor', '导师')
          );
          index = regex.lastIndex;
        }
        const tail = text.slice(index);
        if (tail) fragment.appendChild(document.createTextNode(tail));
        el.replaceChild(fragment, node);
      }
    });
  });
});

/* 页脚自动更新时间 */
document.addEventListener('DOMContentLoaded', () => {
  const target = document.getElementById('lastUpdated');
  if (!target) return;
  const parsed = new Date(document.lastModified);
  if (Number.isNaN(parsed.getTime())) return;
  const pad = value => String(value).padStart(2, '0');
  target.textContent = `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}`;
});

/* 访客地图加载状态与降级处理 */
document.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('visitorMap');
  const fallback = document.getElementById('visitorMapFallback');
  const scriptEl = document.getElementById('clustrmaps');
  if (!container || !fallback || !scriptEl) return;

  fallback.dataset.state = 'loading';

  const widgetSelector = 'img, iframe, .clustrmaps-map, .clustrmaps-widget, .clustrmaps-globe';
  const hasWidget = () => Boolean(container.querySelector(widgetSelector));

  const markLoaded = () => {
    fallback.dataset.state = 'loaded';
    fallback.classList.remove('show-help');
  };

  const showHelp = state => {
    fallback.dataset.state = state;
    fallback.classList.add('show-help');
  };

  if (hasWidget()) {
    markLoaded();
    return;
  }

  scriptEl.addEventListener('error', () => showHelp('error'));
  scriptEl.addEventListener('load', () => {
    window.setTimeout(() => {
      if (fallback.dataset.state === 'loaded') return;
      if (hasWidget()) markLoaded();
    }, 120);
  });

  const observer = new MutationObserver(() => {
    if (!hasWidget()) return;
    markLoaded();
    observer.disconnect();
  });
  observer.observe(container, { childList: true, subtree: true });

  window.setTimeout(() => {
    if (fallback.dataset.state === 'loaded' || fallback.dataset.state === 'error') return;
    if (!hasWidget()) showHelp('timeout');
  }, 6000);
});
