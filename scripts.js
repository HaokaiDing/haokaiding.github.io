    const $=(s,r=document)=>r.querySelector(s); const $$=(s,r=document)=>Array.from(r.querySelectorAll(s));

    /* 主题切换 */
    const themeSwitcher=$('#theme-switcher');
    const applyTheme=t=>{ if(t==='dark'){document.body.classList.add('dark-mode');themeSwitcher.textContent='☀️';}else{document.body.classList.remove('dark-mode');themeSwitcher.textContent='🌙';} };
    applyTheme(localStorage.getItem('theme')||'light');
    themeSwitcher.addEventListener('click',()=>{const cur=document.body.classList.contains('dark-mode')?'dark':'light';const nxt=cur==='dark'?'light':'dark';localStorage.setItem('theme',nxt);applyTheme(nxt);});

    /* 语言切换 */
    function setLanguage(lang){document.documentElement.setAttribute('data-lang',lang); $$('#lang-switcher .lang-link').forEach(b=>b.classList.toggle('active',b.dataset.lang===lang)); try{localStorage.setItem('preferredLanguage',lang);}catch{}}
    $$('#lang-switcher .lang-link').forEach(b=>b.addEventListener('click',()=>setLanguage(b.dataset.lang)));
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

    /* 视频弹窗 */
    const videoModal=$('#videoModal'), videoPlayer=$('#videoPlayer'), videoClose=$('#videoClose'), videoButton=$('#videoButton');
    function openVideoModal(){lastFocused=document.activeElement;videoModal.classList.add('open');videoModal.setAttribute('aria-hidden','false');videoPlayer.play();videoClose.focus();}
    function closeVideoModal(){videoModal.classList.remove('open');videoModal.setAttribute('aria-hidden','true');videoPlayer.pause();videoPlayer.currentTime=0;if(lastFocused&&lastFocused.focus)lastFocused.focus();}
    if(videoButton) videoButton.addEventListener('click',openVideoModal);
    videoClose.addEventListener('click',closeVideoModal);
    document.addEventListener('keydown',e=>{ if(e.key==='Escape') closeVideoModal(); });
    window.addEventListener('click',e=>{ if(e.target===videoModal) closeVideoModal(); });

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

    /* 页脚自动更新时间 */
    document.addEventListener('DOMContentLoaded', ()=>{
      const target=document.getElementById('lastUpdated');
      if(!target) return;
      const parsed=new Date(document.lastModified);
      if(Number.isNaN(parsed.getTime())) return;
      const pad=n=>String(n).padStart(2,'0');
      target.textContent=`${parsed.getFullYear()}-${pad(parsed.getMonth()+1)}-${pad(parsed.getDate())}`;
    });

    /* 访问地图 */
    document.addEventListener('DOMContentLoaded', ()=>{
      const mapContainer=document.getElementById('visitorMap');
      if(!mapContainer) return;
      const statusEl=document.getElementById('visitorMapStatus');
      const setStatus=(en,zh)=>{
        if(!statusEl) return;
        statusEl.innerHTML=`<span class="lang-en">${en}</span><span class="lang-zh">${zh}</span>`;
      };
      const clamp=(value,min,max)=>Math.min(Math.max(value,min),max);
      const renderMap=(lat=null,lon=null)=>{
        const precision=value=>Number(value).toFixed(5);
        let src='https://www.openstreetmap.org/export/embed.html?bbox=-180,-90,180,90&layer=mapnik';
        if(Number.isFinite(lat) && Number.isFinite(lon)){
          const latSpan=0.6;
          const lonSpan=0.6;
          const south=clamp(lat-latSpan,-90,90);
          const north=clamp(lat+latSpan,-90,90);
          const west=clamp(lon-lonSpan,-180,180);
          const east=clamp(lon+lonSpan,-180,180);
          src=`https://www.openstreetmap.org/export/embed.html?bbox=${precision(west)},${precision(south)},${precision(east)},${precision(north)}&layer=mapnik&marker=${precision(lat)},${precision(lon)}`;
        }
        mapContainer.innerHTML='';
        const iframe=document.createElement('iframe');
        iframe.src=src;
        iframe.loading='lazy';
        iframe.referrerPolicy='no-referrer-when-downgrade';
        iframe.title='OpenStreetMap view of visitor location';
        mapContainer.appendChild(iframe);
      };
      renderMap();
      setStatus('Locating your approximate position…','正在定位您的大致位置…');

      const providers=[
        'https://ipapi.co/json/',
        'https://get.geojs.io/v1/ip/geo.json',
        'https://ipwho.is/'
      ];

      const parseLocation=data=>{
        if(!data || typeof data!=='object') return null;
        const lat=Number.parseFloat(data.latitude ?? data.lat ?? data.lat_deg ?? data.latDecimal ?? data.location?.latitude);
        const lon=Number.parseFloat(data.longitude ?? data.lon ?? data.lng ?? data.lng_deg ?? data.location?.longitude);
        if(!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
        const locationParts=[
          data.city ?? data.city_name ?? data.cityName ?? data.location?.city,
          data.region ?? data.region_name ?? data.regionName ?? data.state ?? data.state_prov ?? data.regionCode ?? data.location?.region,
          data.country_name ?? data.country ?? data.country_name_en ?? data.countryCode ?? data.location?.country
        ].filter(Boolean);
        const locationText=locationParts.join(', ')||'Unknown location';
        return {lat,lon,locationText};
      };

      (async()=>{
        const headers={Accept:'application/json'};
        for(const url of providers){
          try{
            const response=await fetch(url,{headers});
            if(!response.ok) continue;
            const data=await response.json();
            const parsed=parseLocation(data);
            if(!parsed) continue;
            renderMap(parsed.lat,parsed.lon);
            setStatus(
              `Approximate location based on your IP: ${parsed.locationText}.`,
              `基于您的 IP 推测的大致位置：${parsed.locationText}。`
            );
            return;
          }catch(_err){
            /* 尝试下一个服务 */
          }
        }
        setStatus('Unable to locate your position automatically.','无法自动定位您的位置。');
      })();
    });

