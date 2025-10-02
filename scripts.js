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

    /* 匿名访客地图与日志 */
    document.addEventListener('DOMContentLoaded', ()=>{
      const container=document.getElementById('visitorMap');
      if(!container) return;
      const status=document.getElementById('visitorMapStatus');
      const summaryEl=document.getElementById('visitorSummary');
      const listEl=document.getElementById('visitorLogList');
      const fallback=document.getElementById('visitorLogFallback');
      const rawEndpoint=(container.getAttribute('data-storage-endpoint')||'').trim();
      const storageEndpoint=/PUT_YOUR_PANTRY_ID_HERE/i.test(rawEndpoint)?'':rawEndpoint;
      const autoLog=(container.getAttribute('data-auto-log')||'true')!=='false';
      const maxEntries=Math.max(25,Math.min(1000,parseInt(container.getAttribute('data-max-entries')||'250',10)||250));
      const localCacheKey='visitorMapLocalCache';

      const setDualText=(target,en,zh)=>{
        if(!target) return;
        const enNode=target.querySelector('.lang-en');
        const zhNode=target.querySelector('.lang-zh');
        if(enNode) enNode.textContent=en;
        if(zhNode) zhNode.textContent=zh;
      };

      const setStatus=(en,zh,isError=false)=>{
        if(!status) return;
        setDualText(status,en,zh);
        container.classList.toggle('map-error',isError);
      };

      const escapeHtml=str=>String(str??'').replace(/[&<>"']/g,c=>({
        '&':'&amp;',
        '<':'&lt;',
        '>':'&gt;',
        '"':'&quot;',
        "'":'&#39;'
      })[c]);

      const readLocalCache=()=>{
        try{
          const parsed=JSON.parse(localStorage.getItem(localCacheKey)||'[]');
          if(!Array.isArray(parsed)) return [];
          return parsed.filter(entry=>entry && typeof entry==='object');
        }catch(err){
          console.error('Failed to read cached visitor log', err);
          return [];
        }
      };

      const writeLocalCache=data=>{
        try{
          localStorage.setItem(localCacheKey,JSON.stringify(data));
        }catch(err){
          console.error('Failed to persist visitor log locally', err);
        }
      };

      const detectDevice=()=>{
        if(navigator.userAgentData){
          const brands=(navigator.userAgentData.brands||[])
            .map(b=>b.brand)
            .filter(Boolean)
            .join(', ');
          const platform=navigator.userAgentData.platform||'';
          return [brands||'Unknown Browser',platform||'Unknown Platform'].join(' • ');
        }
        const ua=(navigator.userAgent||'').toLowerCase();
        const browsers=[
          ['edg','Microsoft Edge'],
          ['chrome','Chrome'],
          ['safari','Safari'],
          ['firefox','Firefox'],
          ['opr','Opera'],
          ['trident','Internet Explorer']
        ];
        const systems=[
          ['windows nt 10','Windows 10/11'],
          ['windows nt 6.3','Windows 8.1'],
          ['windows nt 6.2','Windows 8'],
          ['windows nt 6.1','Windows 7'],
          ['mac os x','macOS'],
          ['iphone','iOS'],
          ['ipad','iPadOS'],
          ['android','Android'],
          ['linux','Linux']
        ];
        const browser=(browsers.find(([sig])=>ua.includes(sig))||[])[1]||'Unknown Browser';
        const os=(systems.find(([sig])=>ua.includes(sig))||[])[1]||'Unknown Platform';
        return `${browser} • ${os}`;
      };

      const hashIdentifier=async input=>{
        const encoder=new TextEncoder();
        try{
          const buffer=await crypto.subtle.digest('SHA-256',encoder.encode(input));
          return Array.from(new Uint8Array(buffer)).map(b=>b.toString(16).padStart(2,'0')).join('').slice(0,20);
        }catch{
          let hash=0;
          for(let i=0;i<input.length;i+=1){
            hash=(hash<<5)-hash+input.charCodeAt(i);
            hash|=0;
          }
          return Math.abs(hash).toString(16).padStart(8,'0');
        }
      };

      const fetchVisitorLog=async()=>{
        if(!storageEndpoint){
          const cached=readLocalCache();
          if(!cached.length){
            setStatus('No remote storage configured. Data is kept on this device only.','尚未配置远程存储，访客数据仅保存在此设备。');
          }
          return cached;
        }
        try{
          const res=await fetch(storageEndpoint,{cache:'no-store'});
          if(res.status===404) return [];
          if(!res.ok) throw new Error(`HTTP ${res.status}`);
          const payload=await res.json().catch(()=>({visitors:[]}));
          const list=Array.isArray(payload)?payload:payload?.visitors;
          if(!Array.isArray(list)) return [];
          const visitors=list
            .filter(entry=>entry && typeof entry==='object' && !Number.isNaN(Number(entry.lat)) && !Number.isNaN(Number(entry.lng)))
            .map(entry=>({
              id:entry.id||'',
              city:entry.city||'',
              region:entry.region||'',
              country:entry.country||'',
              iso2:entry.iso2||'',
              lat:Number(entry.lat),
              lng:Number(entry.lng),
              visits:Number(entry.visits)||1,
              lastSeen:entry.lastSeen||entry.timestamp||'',
              device:entry.device||'',
              timezone:entry.timezone||'',
              notes:entry.notes||''
            }));
          writeLocalCache(visitors);
          return visitors;
        }catch(err){
          console.error('Failed to load visitor log', err);
          const cached=readLocalCache();
          if(cached.length){
            setStatus('Remote visitor data unavailable. Showing cached copy.','远程访客数据不可用，已显示本地缓存。',true);
            return cached;
          }
          setStatus('Unable to load visitor data. Please refresh later.','访客数据加载失败，请稍后重试。',true);
          return [];
        }
      };

      const persistVisitorLog=async visitors=>{
        writeLocalCache(visitors);
        if(!storageEndpoint) return visitors;
        try{
          await fetch(storageEndpoint,{
            method:'PUT',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({visitors})
          });
        }catch(err){
          console.error('Failed to persist visitor log', err);
          setStatus('Unable to save visitor data, showing cached view only.','访客数据无法写入，当前仅显示已缓存的记录。',true);
        }
        return visitors;
      };

      const locateVisitor=async()=>{
        const providers=[
          async()=>{
            const res=await fetch('https://ipwho.is/?lang=en',{cache:'no-store'});
            const data=await res.json();
            if(!data||data.success===false) throw new Error(data?.message||'Lookup failed');
            return {
              ip:data.ip||'',
              city:data.city||'',
              region:data.region||data.region_name||'',
              country:data.country||'',
              iso2:data.country_code||'',
              lat:Number(data.latitude),
              lng:Number(data.longitude),
              timezone:data.timezone?.id||data.timezone||''
            };
          },
          async()=>{
            const res=await fetch('https://ipapi.co/json/',{cache:'no-store'});
            if(!res.ok) throw new Error(`HTTP ${res.status}`);
            const data=await res.json();
            return {
              ip:data.ip||'',
              city:data.city||'',
              region:data.region||data.region_name||data.region_code||'',
              country:data.country_name||data.country||'',
              iso2:data.country_code||'',
              lat:Number(data.latitude),
              lng:Number(data.longitude),
              timezone:data.timezone||''
            };
          },
          async()=>{
            const res=await fetch('https://get.geojs.io/v1/ip/geo.json',{cache:'no-store'});
            if(!res.ok) throw new Error(`HTTP ${res.status}`);
            const data=await res.json();
            return {
              ip:data.ip||'',
              city:data.city||'',
              region:data.region||'',
              country:data.country||'',
              iso2:data.country_code||'',
              lat:Number(data.latitude),
              lng:Number(data.longitude),
              timezone:data.timezone||''
            };
          }
        ];
        for(const provider of providers){
          try{
            const location=await provider();
            if(location && !Number.isNaN(location.lat) && !Number.isNaN(location.lng)){
              return location;
            }
          }catch(err){
            console.error('Geolocation provider failed', err);
          }
        }
        setStatus('Unable to determine visitor location. Existing data is still shown.','无法获取访客定位，将仅显示已记录的数据。',true);
        return null;
      };

      const aggregateByCoordinate=visitors=>{
        const groups=new Map();
        visitors.forEach(item=>{
          const key=`${item.lat.toFixed(2)}|${item.lng.toFixed(2)}`;
          if(!groups.has(key)){
            groups.set(key,{
              lat:item.lat,
              lng:item.lng,
              city:item.city,
              region:item.region,
              country:item.country,
              iso2:item.iso2,
              entries:[]
            });
          }
          groups.get(key).entries.push(item);
        });
        return Array.from(groups.values()).map(group=>{
          group.entries.sort((a,b)=>new Date(b.lastSeen||0)-new Date(a.lastSeen||0));
          return group;
        });
      };

      const ensureMapInstance=()=>{
        if(!window.L){
          setStatus('Leaflet library failed to load.','Leaflet 地图库加载失败。',true);
          return null;
        }
        if(container._visitorMapInstance) return container._visitorMapInstance;
        const mapHost=document.createElement('div');
        mapHost.className='leaflet-map-host';
        mapHost.style.height='100%';
        mapHost.style.width='100%';
        container.appendChild(mapHost);
        const map=L.map(mapHost,{
          worldCopyJump:true,
          attributionControl:true,
          zoomControl:true
        }).setView([20,0],2);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
          maxZoom:11,
          attribution:'&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors'
        }).addTo(map);
        container._visitorLayer=L.layerGroup().addTo(map);
        container._visitorMapInstance=map;
        return map;
      };

      const renderMapMarkers=visitors=>{
        const map=ensureMapInstance();
        if(!map) return;
        const layer=(container._visitorLayer)||(container._visitorLayer=L.layerGroup().addTo(map));
        layer.clearLayers();
        const groups=aggregateByCoordinate(visitors);
        if(!groups.length){
          map.setView([20,0],2);
          return;
        }
        const bounds=[];
        groups.forEach(group=>{
          const {lat,lng,city,region,country,entries}=group;
          const marker=L.circleMarker([lat,lng],{
            radius:8,
            color:'#0b63c7',
            weight:1,
            fillOpacity:0.8,
            fillColor:'#0b63c7'
          });
          const locationText=[city,region,country].filter(Boolean).join(', ');
          const listHtml=entries.slice(0,6).map(entry=>{
            const id=entry.id?entry.id.toString().slice(0,8).toUpperCase():'ANON';
            const device=escapeHtml(entry.device||'Unknown device');
            const seen=entry.lastSeen?new Date(entry.lastSeen):null;
            const seenText=seen&&!Number.isNaN(seen.getTime())?seen.toISOString().replace('T',' ').replace('Z',' UTC'):'Unknown';
            return `<li><strong>${escapeHtml(id)}</strong> · ${device} · ${escapeHtml(seenText)} · ×${entry.visits||1}</li>`;
          }).join('');
          marker.bindPopup(`
            <div class="visitor-popup">
              <strong>${escapeHtml(locationText||'Unknown location')}</strong>
              <ul>${listHtml}</ul>
              <p style="margin:6px 0 0;font-size:.8em;">Approximate location only · 粗略位置信息</p>
            </div>
          `);
          layer.addLayer(marker);
          bounds.push([lat,lng]);
        });
        if(bounds.length===1){
          map.setView(bounds[0],6);
        }else{
          map.fitBounds(bounds,{padding:[30,30]});
        }
      };

      const renderSummary=visitors=>{
        if(!summaryEl) return;
        if(!visitors.length){
          summaryEl.innerHTML='';
          if(fallback) fallback.hidden=false;
          return;
        }
        if(fallback) fallback.hidden=true;
        const totalVisits=visitors.reduce((sum,item)=>sum+(Number(item.visits)||1),0);
        const countries=new Set(visitors.map(v=>v.iso2||v.country).filter(Boolean));
        summaryEl.innerHTML=`
          <div class="summary-card">
            <span class="summary-number">${visitors.length}</span>
            <span class="lang-en">Unique devices</span>
            <span class="lang-zh">唯一访客</span>
          </div>
          <div class="summary-card">
            <span class="summary-number">${totalVisits}</span>
            <span class="lang-en">Total visits</span>
            <span class="lang-zh">累计访问</span>
          </div>
          <div class="summary-card">
            <span class="summary-number">${countries.size}</span>
            <span class="lang-en">Countries/regions</span>
            <span class="lang-zh">覆盖国家/地区</span>
          </div>`;
      };

      const listVisitors=visitors=>{
        if(!listEl) return;
        if(!visitors.length){
          listEl.innerHTML='';
          return;
        }
        const formatterEn=new Intl.DateTimeFormat('en-GB',{
          timeZone:'UTC',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'
        });
        const formatterZh=new Intl.DateTimeFormat('zh-CN',{
          timeZone:'UTC',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'
        });
        const formatted=visitors
          .slice()
          .sort((a,b)=>new Date(b.lastSeen||0)-new Date(a.lastSeen||0))
          .slice(0,20)
          .map(entry=>{
            const location=[entry.city,entry.region,entry.country].filter(Boolean);
            const id=entry.id?entry.id.toString().slice(0,8).toUpperCase():'ANON';
            const device=entry.device||'Unknown device';
            const lastSeen=entry.lastSeen?new Date(entry.lastSeen):null;
            const enTime=lastSeen&&!Number.isNaN(lastSeen.getTime())?formatterEn.format(lastSeen):'Unknown';
            const zhTime=lastSeen&&!Number.isNaN(lastSeen.getTime())?formatterZh.format(lastSeen):'未知';
            const visits=Number(entry.visits)||1;
            const locationEn=location.length?location.join(', '):'Unknown location';
            const locationZh=location.length?location.join('，'):'位置未知';
            return `<li class="visitor-log-entry">
              <span class="lang-en">${escapeHtml(id)} • ${escapeHtml(device)} • ${escapeHtml(locationEn)} • ${visits} visit${visits>1?'s':''} • ${escapeHtml(enTime)} UTC</span>
              <span class="lang-zh">${escapeHtml(id)} · ${escapeHtml(device)} · ${escapeHtml(locationZh)} · 共 ${visits} 次 · ${escapeHtml(zhTime)}（世界时）</span>
            </li>`;
          }).join('');
        listEl.innerHTML=formatted;
      };

      const trimVisitors=visitors=>{
        if(visitors.length<=maxEntries) return visitors;
        return visitors
          .slice()
          .sort((a,b)=>new Date(b.lastSeen||0)-new Date(a.lastSeen||0))
          .slice(0,maxEntries);
      };

      const upsertVisitor=async visitors=>{
        if(!autoLog) return visitors;
        const location=await locateVisitor();
        if(!location) return visitors;
        if(Number.isNaN(location.lat)||Number.isNaN(location.lng)) return visitors;
        const hashed=await hashIdentifier(location.ip||`${location.lat},${location.lng}`);
        const now=new Date().toISOString();
        const device=detectDevice();
        const existing=visitors.findIndex(item=>item.id===hashed);
        if(existing>=0){
          const current=visitors[existing];
          visitors[existing]={
            ...current,
            city:location.city||current.city,
            region:location.region||current.region,
            country:location.country||current.country,
            iso2:location.iso2||current.iso2,
            lat:location.lat||current.lat,
            lng:location.lng||current.lng,
            lastSeen:now,
            visits:(Number(current.visits)||1)+1,
            device
          };
        }else{
          visitors.push({
            id:hashed,
            city:location.city||'',
            region:location.region||'',
            country:location.country||'',
            iso2:location.iso2||'',
            lat:location.lat,
            lng:location.lng,
            visits:1,
            lastSeen:now,
            device,
            timezone:location.timezone||''
          });
        }
        return trimVisitors(visitors);
      };

      const init=async()=>{
        setStatus('Loading visitor data…','正在加载访客数据…');
        let visitors=await fetchVisitorLog();
        visitors=await upsertVisitor(visitors);
        await persistVisitorLog(visitors);
        container.classList.add('map-ready');
        if(status) status.remove();
        if(!storageEndpoint && fallback){
          setDualText(fallback,
            'Visitor details will appear here once available. Records are saved only on this device until remote storage is configured.',
            '一旦有访问记录，将在此显示详细信息。在配置远程存储之前，访客记录仅保存在此设备。'
          );
        }
        renderSummary(visitors);
        listVisitors(visitors);
        renderMapMarkers(visitors);
      };

      init();
    });
