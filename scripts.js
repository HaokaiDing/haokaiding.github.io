// scripts.js

// 主题切换功能
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

applyTheme(localStorage.getItem('theme') || 'light');

themeSwitcher.addEventListener('click', () => {
  const cur = document.body.classList.contains('dark-mode') ? 'dark' : 'light';
  const nxt = cur === 'dark' ? 'light' : 'dark';
  localStorage.setItem('theme', nxt);
  applyTheme(nxt);
});

// 语言切换功能
function setLanguage(lang) {
  document.documentElement.setAttribute('data-lang', lang);
  const langLinks = document.querySelectorAll('#lang-switcher .lang-link');
  langLinks.forEach((link) => link.classList.toggle('active', link.dataset.lang === lang));

  try {
    localStorage.setItem('preferredLanguage', lang);
  } catch (e) {}
}

document.getElementById('lang-switcher').addEventListener('click', (e) => {
  const langLink = e.target.closest('.lang-link');
  if (!langLink) return;
  e.preventDefault();
  setLanguage(langLink.dataset.lang);
});

document.addEventListener('DOMContentLoaded', () => {
  setLanguage(localStorage.getItem('preferredLanguage') || 'en');
});
