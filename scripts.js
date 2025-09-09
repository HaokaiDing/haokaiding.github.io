    const $=(s,r=document)=>r.querySelector(s); const $$=(s,r=document)=>Array.from(r.querySelectorAll(s));

    /* 主题切换 */
    const themeSwitcher=$('#theme-switcher');
    const applyTheme=t=>{ if(t==='dark'){document.body.classList.add('dark-mode');themeSwitcher.textContent='☀️';}else{document.body.classList.remove('dark-mode');themeSwitcher.textContent='🌙';} };
    applyTheme(localStorage.getItem('theme')||'light');
    themeSwitcher.addEventListener('click',()=>{const cur=document.body.classList.contains('dark-mode')?'dark':'light';const nxt=cur==='dark'?'light':'dark';localStorage.setItem('theme',nxt);applyTheme(nxt);});

    /* 语言切换 */
    function setLanguage(lang){document.documentElement.setAttribute('data-lang',lang); $$('#lang-switcher .lang-link').forEach(a=>a.classList.toggle('active',a.dataset.lang===lang)); try{localStorage.setItem('preferredLanguage',lang);}catch{}}
    $('#lang-switcher').addEventListener('click',e=>{const a=e.target.closest('.lang-link');if(!a)return;e.preventDefault();setLanguage(a.dataset.lang);});
    document.addEventListener('DOMContentLoaded',()=>setLanguage(localStorage.getItem('preferredLanguage')||'en'));

    /* 触摸头像切换 */
    let touchCapable=false; window.addEventListener('touchstart',()=>{touchCapable=true;},{once:true});
    $('#profileBox').addEventListener('click',()=>{ if(touchCapable) $('#profileBox').classList.toggle('toggled'); });

    /* 论文 PDF 预览弹窗（简历导出已删除） */
    const modal=$('#pdfModal'), pdfViewer=$('#pdf-viewer'), pdfClose=$('#pdfClose'); let lastFocused=null;
    function openPdfModal(path){lastFocused=document.activeElement;pdfViewer.src=path;modal.classList.add('open');modal.setAttribute('aria-hidden','false');pdfClose.focus();}
    function closePdfModal(){modal.classList.remove('open');modal.setAttribute('aria-hidden','true');pdfViewer.src='';if(lastFocused&&lastFocused.focus)lastFocused.focus();}
    document.addEventListener('keydown',e=>{ if(e.key==='Escape') closePdfModal(); });
    window.addEventListener('click',e=>{ if(e.target===modal) closePdfModal(); });
    pdfClose.addEventListener('click', closePdfModal);
    document.addEventListener('click',e=>{const t=e.target.closest('.pdf-link');if(!t)return;e.preventDefault();openPdfModal(t.getAttribute('data-pdf'));});

    /* 返回顶部 */
    const backBtn=$('#backToTop');
    const onScroll=()=>{ backBtn.style.display=(window.scrollY>300)?'block':'none'; };
    window.addEventListener('scroll', onScroll, { passive:true });
    backBtn.addEventListener('click', ()=>window.scrollTo({top:0,behavior:'smooth'}));

    /* 作者徽章自动化：†=Co-first；*=Advisor；不自动判定 First Author */
    document.addEventListener('DOMContentLoaded', ()=>{
      document.querySelectorAll('.pub-authors').forEach(el=>{
        const nodes=[...el.childNodes];
        const makeBadge=(cls,en,zh)=>{const s=document.createElement('span');s.className=cls;s.innerHTML=`<span class="lang-en">${en}</span><span class="lang-zh">${zh}</span>`;return s;}
        nodes.forEach(node=>{
          if(node.nodeType===1 && node.tagName==='SUP'){
            const t=node.textContent.trim();
            el.replaceChild(t==='†'
              ? makeBadge('author-badge','Co-first Author','共同第一作者')
              : makeBadge('advisor-badge','Advisor','导师')
            , node);
            return;
          }
          if(node.nodeType===3){
            const txt=node.nodeValue; if(!txt||(!txt.includes('†')&&!txt.includes('*'))) return;
            const frag=document.createDocumentFragment(); const re=/[†*]/g; let i=0,m;
            while((m=re.exec(txt))){
              const chunk=txt.slice(i,m.index); if(chunk) frag.appendChild(document.createTextNode(chunk));
              frag.appendChild(m[0]==='†'
                ? makeBadge('author-badge','Co-first Author','共同第一作者')
                : makeBadge('advisor-badge','Advisor','导师'));
              i=re.lastIndex;
            }
            const tail=txt.slice(i); if(tail) frag.appendChild(document.createTextNode(tail));
            el.replaceChild(frag,node);
          }
        });
      });
    });

