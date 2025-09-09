// scripts.js
document.addEventListener('DOMContentLoaded', () => {
  // 主题切换功能优化
  const themeSwitcher = document.getElementById('theme-switcher');
  const applyTheme = (theme) => {
    if (theme === 'dark') {
      document.body.classList.add('dark-mode');
      themeSwitcher.textContent = '☀️';
      themeSwitcher.setAttribute('aria-label', '切换到亮色模式');
    } else {
      document.body.classList.remove('dark-mode');
      themeSwitcher.textContent = '🌙';
      themeSwitcher.setAttribute('aria-label', '切换到深色模式');
    }
  };
  
  // 从本地存储获取主题设置
  const savedTheme = localStorage.getItem('theme') || 'light';
  applyTheme(savedTheme);
  
  themeSwitcher.addEventListener('click', () => {
    const currentTheme = document.body.classList.contains('dark-mode') ? 'dark' : 'light';
    const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('theme', nextTheme);
    applyTheme(nextTheme);
  });

  // 语言切换功能优化
  function setLanguage(lang) {
    document.documentElement.setAttribute('data-lang', lang);
    const langLinks = document.querySelectorAll('#lang-switcher .lang-link');
    langLinks.forEach(link => {
      link.classList.toggle('active', link.dataset.lang === lang);
    });
    try {
      localStorage.setItem('preferredLanguage', lang);
    } catch (e) {
      console.error('保存语言偏好失败:', e);
    }
  }
  
  document.getElementById('lang-switcher').addEventListener('click', (e) => {
    const link = e.target.closest('.lang-link');
    if (!link) return;
    e.preventDefault();
    setLanguage(link.dataset.lang);
  });
  
  // 从本地存储获取语言设置
  const savedLanguage = localStorage.getItem('preferredLanguage') || 'en';
  setLanguage(savedLanguage);

  // 头像切换功能优化
  const profileBox = document.getElementById('profileBox');
  let touchCapable = 'ontouchstart' in window;
  
  profileBox.addEventListener('click', () => {
    if (touchCapable) {
      profileBox.classList.toggle('toggled');
    }
  });

  // PDF预览功能优化
  const modal = document.getElementById('pdfModal');
  const pdfViewer = document.getElementById('pdf-viewer');
  const pdfClose = document.getElementById('pdfClose');
  let lastFocused = null;
  
  function openPdfModal(path) {
    lastFocused = document.activeElement;
    pdfViewer.src = path;
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    pdfClose.focus();
    
    // 添加键盘事件监听
    document.addEventListener('keydown', handleKeyDown);
  }
  
  function closePdfModal() {
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    pdfViewer.src = '';
    if (lastFocused && lastFocused.focus) {
      lastFocused.focus();
    }
    
    // 移除键盘事件监听
    document.removeEventListener('keydown', handleKeyDown);
  }
  
  function handleKeyDown(e) {
    if (e.key === 'Escape') {
      closePdfModal();
    }
  }
  
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      closePdfModal();
    }
  });
  
  pdfClose.addEventListener('click', closePdfModal);
  
  // 使用事件委托处理PDF链接点击
  document.addEventListener('click', (e) => {
    const pdfLink = e.target.closest('.pdf-link');
    if (pdfLink) {
      e.preventDefault();
      openPdfModal(pdfLink.getAttribute('data-pdf'));
    }
  });

  // 返回顶部功能优化（添加防抖）
  const backBtn = document.getElementById('backToTop');
  let scrollTimeout;
  
  const handleScroll = () => {
    clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(() => {
      backBtn.style.display = window.scrollY > 300 ? 'block' : 'none';
    }, 100);
  };
  
  window.addEventListener('scroll', handleScroll, { passive: true });
  
  backBtn.addEventListener('click', () => {
    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  });

  // 作者徽章自动化功能优化
  function createAuthorBadge(type) {
    const badge = document.createElement('span');
    badge.className = type === '†' ? 'author-badge' : 'advisor-badge';
    
    const enSpan = document.createElement('span');
    enSpan.className = 'lang-en';
    enSpan.textContent = type === '†' ? 'Co-first Author' : 'Advisor';
    
    const zhSpan = document.createElement('span');
    zhSpan.className = 'lang-zh';
    zhSpan.textContent = type === '†' ? '共同第一作者' : '导师';
    
    badge.appendChild(enSpan);
    badge.appendChild(zhSpan);
    return badge;
  }
  
  document.querySelectorAll('.pub-authors').forEach(el => {
    const content = el.innerHTML;
    
    // 使用正则表达式替换特殊标记
    const updatedContent = content
      .replace(/(<sup>†<\/sup>)/g, createAuthorBadge('†').outerHTML)
      .replace(/(<sup>\*<\/sup>)/g, createAuthorBadge('*').outerHTML)
      .replace(/†/g, createAuthorBadge('†').outerHTML)
      .replace(/\*/g, createAuthorBadge('*').outerHTML);
    
    el.innerHTML = updatedContent;
  });

  // 平滑滚动导航功能优化
  document.querySelectorAll('nav.site-nav a').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
      e.preventDefault();
      const targetId = this.getAttribute('href');
      const targetElement = document.querySelector(targetId);
      
      if (targetElement) {
        const headerHeight = document.querySelector('header').offsetHeight;
        const targetPosition = targetElement.offsetTop - headerHeight - 20;
        
        window.scrollTo({
          top: targetPosition,
          behavior: 'smooth'
        });
      }
    });
  });

  // 初始化页面时检查滚动位置
  handleScroll();
});
