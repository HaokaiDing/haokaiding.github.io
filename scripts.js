// scripts.js
document.addEventListener('DOMContentLoaded', () => {
  // 主题切换
  const themeSwitcher = document.getElementById('theme-switcher');
  const applyTheme = (theme) => {
    if (theme === 'dark') {
      document.body.classList.add('dark-mode');
      themeSwitcher.textContent = '☀️';
    } else {
      document.body.classList.remove('dark-mode');
      themeSwitcher.textContent = '🌙';
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

  // 语言切换
  function setLanguage(lang) {
    document.documentElement.setAttribute('data-lang', lang);
    const langLinks = document.querySelectorAll('#lang-switcher .lang-link');
    langLinks.forEach(link => {
      link.classList.toggle('active', link.dataset.lang === lang);
    });
    try {
      localStorage.setItem('preferredLanguage', lang);
    } catch (e) {
      console.error('Error saving language preference:', e);
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

  // 触摸头像切换
  let touchCapable = false;
  window.addEventListener('touchstart', () => {
    touchCapable = true;
  }, { once: true });
  
  const profileBox = document.getElementById('profileBox');
  profileBox.addEventListener('click', () => {
    if (touchCapable) {
      profileBox.classList.toggle('toggled');
    }
  });

  // 论文 PDF 预览弹窗
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
  }
  
  function closePdfModal() {
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    pdfViewer.src = '';
    if (lastFocused && lastFocused.focus) {
      lastFocused.focus();
    }
  }
  
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closePdfModal();
    }
  });
  
  window.addEventListener('click', (e) => {
    if (e.target === modal) {
      closePdfModal();
    }
  });
  
  pdfClose.addEventListener('click', closePdfModal);
  
  document.addEventListener('click', (e) => {
    const pdfLink = e.target.closest('.pdf-link');
    if (!pdfLink) return;
    e.preventDefault();
    openPdfModal(pdfLink.getAttribute('data-pdf'));
  });

  // 返回顶部
  const backBtn = document.getElementById('backToTop');
  const onScroll = () => {
    backBtn.style.display = (window.scrollY > 300) ? 'block' : 'none';
  };
  
  window.addEventListener('scroll', onScroll, { passive: true });
  backBtn.addEventListener('click', () => {
    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  });

  // 作者徽章自动化
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
        const text = node.textContent.trim();
        const badge = text === '†' 
          ? makeBadge('author-badge', 'Co-first Author', '共同第一作者')
          : makeBadge('advisor-badge', 'Advisor', '导师');
        el.replaceChild(badge, node);
        return;
      }
      
      if (node.nodeType === 3) {
        const text = node.nodeValue;
        if (!text || (!text.includes('†') && !text.includes('*'))) return;
        
        const fragment = document.createDocumentFragment();
        const regex = /[†*]/g;
        let index = 0;
        let match;
        
        while ((match = regex.exec(text)) !== null) {
          const chunk = text.slice(index, match.index);
          if (chunk) {
            fragment.appendChild(document.createTextNode(chunk));
          }
          
          const badge = match[0] === '†' 
            ? makeBadge('author-badge', 'Co-first Author', '共同第一作者')
            : makeBadge('advisor-badge', 'Advisor', '导师');
          
          fragment.appendChild(badge);
          index = regex.lastIndex;
        }
        
        const tail = text.slice(index);
        if (tail) {
          fragment.appendChild(document.createTextNode(tail));
        }
        
        el.replaceChild(fragment, node);
      }
    });
  });
  
  // 平滑滚动导航
  document.querySelectorAll('nav.site-nav a').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
      e.preventDefault();
      const targetId = this.getAttribute('href');
      const targetElement = document.querySelector(targetId);
      
      if (targetElement) {
        window.scrollTo({
          top: targetElement.offsetTop - 80,
          behavior: 'smooth'
        });
      }
    });
  });
});
