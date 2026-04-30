
(() => {
  'use strict';

  const $ = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => [...r.querySelectorAll(s)];
  const cfg = window.DEAD_WAX_SUPABASE || {};
  const SB = window.supabase?.createClient?.(cfg.url, cfg.anonKey);
  const DW = window.DW_NATIVE = {};

  const FIELDS = '*';
  const META_FIELDS = ['discogs_id','discogs_type','cover_url','genre','genres','styles','tracklist','discogs_url','release_year','label','country','raw_data'];
  const state = {
    user: null,
    records: [],
    collections: [],
    filtered: [],
    view: 'grid',
    group: 'alpha',
    secondary: 'artist',
    currentId: null,
    random: false,
    cfIndex: 0,
    collapsed: new Set(),
    filters: {global:'', code:'', artist:'', last:'', first:'', album:'', genre:'', listened:false, rating:'', lastListened:'', grail:false}
  };

  function esc(v){ return String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function arr(v){ return Array.isArray(v) ? v : (typeof v === 'string' && v.trim().startsWith('[') ? JSON.parse(v) : []); }
  function norm(s){ return String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim(); }
  function shelfParts(id){ const m=String(id||'').match(/^([A-Za-z]+)\s*0*([0-9]+)(.*)$/); return m ? [m[1].toUpperCase(), parseInt(m[2],10), m[3]||''] : [String(id||'~'), 999999, '']; }
  function shelfCompare(a,b){ const A=shelfParts(a?.shelf_id||a?.code), B=shelfParts(b?.shelf_id||b?.code); return A[0].localeCompare(B[0]) || A[1]-B[1] || A[2].localeCompare(B[2]); }
  function alphaKey(r){ return (r.last || r.artist || '#').trim().charAt(0).toUpperCase().replace(/[^A-Z0-9]/,'#'); }
  function artistSort(a,b){ return norm(a.last||a.artist).localeCompare(norm(b.last||b.artist)) || norm(a.first).localeCompare(norm(b.first)) || norm(a.album).localeCompare(norm(b.album)) || shelfCompare(a,b); }
  function displayYear(r){ return r.release_year || r.year || ''; }
  function tracks(r){ return arr(r.tracklist); }
  function reactionValue(r){ if(r.reaction) return r.reaction; if(Number(r.rating)===3) return 'favorite'; if(Number(r.rating)===2 || r.liked) return 'liked'; if(Number(r.rating)===1) return 'disliked'; return ''; }
  function recordCode(r){ return r.shelf_id || r.code || ''; }
  function coverUrl(r){ return r.cover_url || r.coverUrl || r.img || ''; }
  function collectionNames(r){
    const raw = arr(r.collections);
    return raw.map(x => {
      if(typeof x === 'string'){
        const hit = state.collections.find(c => c.id === x || c.name === x);
        return hit ? hit.name : x;
      }
      return x?.name || '';
    }).filter(Boolean);
  }
  function setSync(txt){ const n=$('#stDbStatus'); if(n) n.textContent=txt || 'Ready'; }

  function dwLogo(){
    return `<svg class="dw-mark" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><defs><radialGradient id="g${Math.random().toString(36).slice(2)}" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#e8b840"/><stop offset="60%" stop-color="#b07818"/><stop offset="100%" stop-color="#7a5010"/></radialGradient></defs><circle cx="32" cy="32" r="30" fill="#d09a24"/><circle cx="32" cy="32" r="25" fill="none" stroke="#0b0906" stroke-width="3"/><circle cx="32" cy="32" r="20" fill="none" stroke="#0b0906" stroke-width="2.5"/><circle cx="32" cy="32" r="13" fill="#d09a24" stroke="#7a5010" stroke-width="1"/><text x="32" y="38" text-anchor="middle" font-family="serif" font-size="14" font-weight="600" fill="#0b0906">DW</text></svg>`;
  }

  function ensureAuthShell(){
    if($('#dwAuth')) return;
    const css = document.createElement('style');
    css.textContent = `
      .dw-auth{position:fixed;inset:0;z-index:9999;display:none;align-items:center;justify-content:center;background:var(--bg);padding:1rem}
      .dw-auth.on{display:flex}.dw-auth-card{width:min(420px,100%);background:var(--s1);border:1px solid var(--b2);border-radius:16px;padding:1.4rem;box-shadow:0 30px 90px rgba(0,0,0,.65)}
      .dw-auth-card h1{font-family:'Cormorant Garamond',serif;color:var(--gl);font-size:2rem}.dw-auth-card p{color:var(--mt);font-size:.82rem;line-height:1.5;margin:.35rem 0 1rem}
      .dw-auth-card label{display:block;font-size:.58rem;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:var(--m2);margin:.6rem 0 .2rem}
      .dw-auth-card input{width:100%;background:var(--s2);border:1px solid var(--b2);border-radius:6px;color:var(--cream);padding:.58rem .7rem;font-family:'Jost',sans-serif}
      .dw-auth-row{display:flex;gap:.5rem;margin-top:1rem}.dw-auth-row button{flex:1}
      .dw-auth-error{color:var(--red);font-size:.74rem;margin-top:.65rem;min-height:1rem}
      .dw-booting:before{content:'Loading Dead Wax…';position:fixed;inset:0;z-index:9998;display:flex;align-items:center;justify-content:center;background:var(--bg);color:var(--gold);font-family:'Cormorant Garamond',serif;font-size:1.4rem}
    `;
    document.head.appendChild(css);
    const d=document.createElement('div');
    d.id='dwAuth';
    d.className='dw-auth';
    d.innerHTML=`<form class="dw-auth-card" id="dwAuthForm"><h1>Dead Wax</h1><p>Sign in to open your Supabase-backed record cabinet.</p><label for="dwEmail">Email</label><input id="dwEmail" type="email" autocomplete="email" required><label for="dwPassword">Password</label><input id="dwPassword" type="password" autocomplete="current-password" required><div class="dw-auth-row"><button type="submit" class="btn-save">Sign in</button><button type="button" class="btn-sec" id="dwSignUp">Sign up</button></div><div class="dw-auth-error" id="dwAuthError"></div></form>`;
    document.body.appendChild(d);
    $('#dwAuthForm').addEventListener('submit', async e => { e.preventDefault(); await authIn(false); });
    $('#dwSignUp').addEventListener('click', async () => authIn(true));
  }

  async function authIn(signup){
    const email=$('#dwEmail').value.trim(), password=$('#dwPassword').value;
    $('#dwAuthError').textContent='';
    const res = signup ? await SB.auth.signUp({email,password}) : await SB.auth.signInWithPassword({email,password});
    if(res.error){ $('#dwAuthError').textContent=res.error.message; return; }
    state.user=res.data.user || (await SB.auth.getUser()).data.user;
    $('#dwAuth').classList.remove('on');
    await loadAll();
  }

  async function signOut(){
    await SB.auth.signOut();
    state.user=null; state.records=[]; state.filtered=[]; render();
    $('#dwAuth').classList.add('on');
    closeUserMenu();
  }
  window.signOut=signOut;

  async function initAuth(){
    ensureAuthShell();
    if(!SB){ alert('Supabase config missing.'); return; }
    document.documentElement.classList.add('dw-booting');
    const {data:{session}} = await SB.auth.getSession();
    document.documentElement.classList.remove('dw-booting');
    if(!session?.user){ $('#dwAuth').classList.add('on'); renderEmptyShell(); return; }
    state.user=session.user;
    await loadAll();
  }

  async function loadAll(){
    if(!state.user) return;
    setSync('Loading');
    const [recRes, colRes] = await Promise.all([
      SB.from('records').select(FIELDS).eq('user_id',state.user.id).order('shelf_id',{ascending:true}),
      SB.from('collections').select('*').eq('user_id',state.user.id).order('name',{ascending:true})
    ]);
    if(recRes.error){ alert(recRes.error.message); return; }
    if(colRes.error){ console.warn(colRes.error); }
    state.collections = colRes.data || [];
    state.records = (recRes.data || []).map(normalizeRecord);
    applyFilters();
    setSync('Synced');
  }

  function normalizeRecord(r){
    r.shelf_id = r.shelf_id || r.code || '';
    r.code = r.shelf_id;
    r.artist = r.artist || '';
    r.album = r.album || '';
    r.copies_owned = Number(r.copies_owned ?? r.owned ?? 1);
    r.owned = r.copies_owned;
    r.genres = arr(r.genres);
    r.styles = arr(r.styles);
    r.tracklist = arr(r.tracklist);
    r.collections = arr(r.collections);
    r.release_year = r.release_year || r.year || null;
    if(!r.reaction && r.rating) r.reaction = reactionValue(r);
    return r;
  }

  function renderEmptyShell(){
    $('#gridWrap').innerHTML='<div class="no-res"><h3>Sign in to open Dead Wax</h3><p>Your records will load from Supabase.</p></div>';
    $('#listBody').innerHTML='';
    $('#cfStage').innerHTML='';
    $('#cfMeta').innerHTML='';
    updateCounts([]);
  }

  function filtered(){
    let a=[...state.records];
    const f=state.filters;
    const q = norm(f.global);
    if(q) a=a.filter(r => {
      const hay=[r.shelf_id,r.artist,r.album,r.last,r.first,r.genre,collectionNames(r).join(' '),tracks(r).map(t=>t.title).join(' ')].join(' ');
      return norm(hay).includes(q);
    });
    if(f.code) a=a.filter(r=>norm(recordCode(r)).includes(norm(f.code)));
    if(f.artist) a=a.filter(r=>norm(r.artist).includes(norm(f.artist)));
    if(f.last) a=a.filter(r=>norm(r.last).includes(norm(f.last)));
    if(f.first) a=a.filter(r=>norm(r.first).includes(norm(f.first)));
    if(f.album) a=a.filter(r=>norm(r.album).includes(norm(f.album)));
    if(f.genre) a=a.filter(r=>(r.genre===f.genre || r.genres?.includes(f.genre)));
    if(f.listened) a=a.filter(r=>!!r.listened);
    if(f.grail) a=a.filter(r=>!!r.grail);
    if(f.rating) a=a.filter(r=>reactionValue(r)===f.rating);
    if(f.lastListened){
      const now=Date.now(), day=86400000;
      a=a.filter(r=>{
        const t=Date.parse(r.listened_at||r.listenedAt||''); if(!t) return f.lastListened==='older';
        const d=(now-t)/day;
        return f.lastListened==='week'?d<=7:f.lastListened==='month'?d<=31:f.lastListened==='year'?d<=366:d>366;
      });
    }
    return a;
  }

  function applyFilters(){
    state.filtered=filtered();
    render();
  }
  window.applyFilters=applyFilters;

  function groupRecords(arrIn){
    const a=[...arrIn];
    const g=state.group;
    const map=new Map();
    function add(k,r){ if(!map.has(k)) map.set(k,[]); map.get(k).push(r); }
    if(g==='genre') a.forEach(r=>add(r.genre || 'Unknown',r));
    else if(g==='artist') a.forEach(r=>add(r.artist || 'Unknown',r));
    else if(g==='decade') a.forEach(r=>{ const y=Number(displayYear(r)); add(y?`${Math.floor(y/10)*10}s`:'Unknown decade',r); });
    else if(g==='collection') a.forEach(r=>{ const names=collectionNames(r); (names.length?names:['Record Cabinet']).forEach(n=>add(n,r)); });
    else a.forEach(r=>add(alphaKey(r),r));
    let groups=[...map.entries()];
    groups.sort((x,y)=>{
      if(g==='decade') return x[0].localeCompare(y[0],undefined,{numeric:true});
      if(g==='alpha') return x[0].localeCompare(y[0]);
      return x[0].localeCompare(y[0],undefined,{sensitivity:'base'});
    });
    groups.forEach(g=>g[1].sort(shelfCompare));
    return groups;
  }

  function updateCounts(a=state.filtered){
    const total=state.records.length, shown=a.length;
    $('#countPill strong').textContent=String(shown);
    $('#countPill').lastChild && null;
    const tip=$('#countTip');
    if(tip){
      const synced=state.records.filter(r=>tracks(r).length || r.cover_url || r.discogs_id).length;
      const grails=state.records.filter(r=>r.grail).length;
      const listened=state.records.filter(r=>r.listened).length;
      tip.innerHTML=`<div class="count-tip-title">Archive status</div>
      <div class="count-tip-row"><span>Total records</span><strong>${total}</strong></div>
      <div class="count-tip-row"><span>Currently showing</span><strong>${shown}</strong></div>
      <div class="count-tip-row"><span>Discogs enriched</span><strong>${synced}</strong></div>
      <div class="count-tip-row"><span>Listened</span><strong>${listened}</strong></div>
      <div class="count-tip-row"><span>Grail records</span><strong>${grails}</strong></div>`;
    }
    $('#resultStatus').textContent=`${shown} records shown`;
    $('#stUserRecords') && ($('#stUserRecords').textContent=total);
    $('#stUserCollections') && ($('#stUserCollections').textContent=state.collections.length);
    $('#stDbBase') && ($('#stDbBase').textContent=total);
    $('#stDbShowing') && ($('#stDbShowing').textContent=shown);
    $('#stDbDiscogs') && ($('#stDbDiscogs').textContent=state.records.filter(r=>tracks(r).length || r.cover_url || r.discogs_id).length);
    $('#stDbOverrides') && ($('#stDbOverrides').textContent=total);
    $('#stUserName') && ($('#stUserName').textContent=state.user?.email || 'Signed in');
  }

  function render(){
    updateButtons();
    updateCounts();
    updateGenres();
    renderJumpBar();
    $('#gridWrap').style.display=state.view==='grid'?'block':'none';
    $('#listWrap').style.display=state.view==='list'?'block':'none';
    $('#flowWrap').style.display=state.view==='flow'?'block':'none';
    $('#mainArea').classList.toggle('list-mode',state.view==='list');
    $('#mainArea').classList.toggle('flow-mode',state.view==='flow');
    if(state.view==='grid') renderGrid();
    if(state.view==='list') renderList();
    if(state.view==='flow') renderFlow();
    updateHdrH();
  }

  function updateButtons(){
    $('#btnGrid')?.classList.toggle('on',state.view==='grid');
    $('#btnList')?.classList.toggle('on',state.view==='list');
    $('#btnFlow')?.classList.toggle('on',state.view==='flow');
    $('#groupSelect') && ($('#groupSelect').value=state.group);
    $('#secondaryGroupSelect') && ($('#secondaryGroupSelect').value=state.secondary);
    $('#secondaryGroupWrap') && ($('#secondaryGroupWrap').hidden = state.group !== 'collection');
  }

  function groupHeader(label,count,kind='letter'){
    const key=`${state.group}:${label}`;
    const collapsed=state.collapsed.has(key);
    const cls=kind==='letter'?'letter-hdr':'genre-hdr';
    const countCls=kind==='letter'?'lt-count':'genre-pill';
    const name = kind==='letter' ? `<span class="lt-char">${esc(label)}</span>` : `<span class="genre-name">${esc(label)}</span>`;
    return `<button class="grp-toggle ${collapsed?'collapsed':''}" onclick="toggleGroup('${esc(key)}')" type="button">${`<div class="${cls}"><span class="grp-icon"></span>${name}<span class="${countCls}">${count} records</span></div>`}</button>`;
  }

  function renderGrid(){
    const html=groupRecords(state.filtered).map(([label,rs])=>{
      const key=`${state.group}:${label}`;
      return `<section class="${state.group==='alpha'?'letter-section':'genre-section'}" id="grp-${slug(label)}">${groupHeader(label,rs.length,state.group==='alpha'?'letter':'genre')}<div class="grp-body ${state.collapsed.has(key)?'collapsed':''}"><div class="records-grid">${rs.map(renderCard).join('')}</div></div></section>`;
    }).join('');
    $('#gridWrap').innerHTML = html || `<div class="no-res"><h3>No records found</h3><p>Try clearing filters.</p></div>`;
  }

  function renderList(){
    const html=groupRecords(state.filtered).map(([label,rs])=>{
      const key=`${state.group}:${label}`;
      return `<section class="list-section" id="grp-${slug(label)}">${groupHeader(label,rs.length,'letter').replace('letter-hdr','list-sec').replace('lt-char','list-sec-c').replace('lt-count','list-sec-n')}<div class="grp-body ${state.collapsed.has(key)?'collapsed':''}">${rs.map(renderRow).join('')}</div></section>`;
    }).join('');
    $('#listBody').innerHTML = html || `<div class="no-res"><h3>No records found</h3></div>`;
  }

  function renderFlow(){
    const arr=state.filtered;
    const stage=$('#cfStage'), meta=$('#cfMeta');
    if(!arr.length){ stage.innerHTML='<div class="cf-empty-state">No records found</div>'; meta.innerHTML=''; return; }
    state.cfIndex=Math.max(0,Math.min(state.cfIndex,arr.length-1));
    const pieces=[];
    for(let off=-4; off<=4; off++){
      const idx=state.cfIndex+off; if(idx<0||idx>=arr.length) continue;
      pieces.push(renderFlowCard(arr[idx],idx,off));
    }
    stage.innerHTML=`<div class="cf-stage-rail"></div>${pieces.join('')}`;
    const r=arr[state.cfIndex];
    meta.innerHTML=`<div class="flow-meta-main"><div class="flow-meta-code">${esc(recordCode(r))}</div><div class="flow-meta-artist">${esc(r.artist)}</div><div class="flow-meta-album">${esc(r.album)}</div><div class="flow-meta-tags">${tag(r.genre,'g')}${collectionNames(r).slice(0,3).map(x=>tag(x)).join('')}</div><div class="flow-hint">Use arrow keys, wheel or click covers</div></div>`;
  }

  function renderFlowCard(r,idx,off){
    const z=100-Math.abs(off), active=off===0;
    const x=off*55, rot=off*-38, scale=active?1:0.82-Math.abs(off)*0.035, op=Math.abs(off)>3?.35:1;
    return `<div class="cf-card ${active?'active':''}" data-id="${esc(r.id)}" style="z-index:${z};opacity:${op};transform:translateX(calc(-50% + ${x}%)) translateY(-50%) rotateY(${rot}deg) scale(${scale});" onclick="cfClick('${esc(r.id)}')"><div class="cf-scene card-scene"><div class="card-inner"><div class="card-front"><div class="card-cover">${coverHtml(r)}${r.grail?`<span class="grail-mark">${dwLogo()}</span>`:''}<div class="cf-code">${esc(recordCode(r))}</div></div></div><div class="card-back">${trackBack(r)}</div></div></div><div class="cf-cover-shadow"></div></div>`;
  }

  function cfClick(id){
    const idx=state.filtered.findIndex(r=>r.id===id);
    if(idx===state.cfIndex) openModal(idx);
    else { state.cfIndex=idx; renderFlow(); }
  }
  window.cfClick=cfClick;

  function coverHtml(r){
    const u=coverUrl(r);
    return u ? `<img src="${esc(u)}" alt="${esc(r.album)} cover" loading="lazy">` : `<div class="vph"><div class="vd" style="width:74%;height:74%"></div></div>`;
  }

  function renderCard(r){
    const idx=state.filtered.findIndex(x=>x.id===r.id);
    return `<article class="card-scene" tabindex="0" data-id="${esc(r.id)}" onclick="openModal(${idx})" onkeydown="if(event.key==='Enter')openModal(${idx})">
      <div class="card-inner">
        <div class="card-front"><div class="card-cover">${coverHtml(r)}${r.grail?`<span class="grail-mark">${dwLogo()}</span>`:''}</div><div class="card-info"><div class="card-code-row"><div class="card-code">${esc(recordCode(r))}</div><div class="card-cover-status">${statusIcons(r)}</div></div><div class="card-artist">${esc(r.artist)}</div><div class="card-album">${esc(r.album)}</div><div class="card-ft"><span class="card-qty">×${esc(r.copies_owned||1)}</span>${r.genre?`<span class="card-genre">${esc(r.genre)}</span>`:''}</div></div></div>
        <div class="card-back">${trackBack(r)}</div>
      </div>
    </article>`;
  }

  function renderRow(r){
    const idx=state.filtered.findIndex(x=>x.id===r.id);
    return `<div class="list-row" tabindex="0" onclick="openModal(${idx})"><div><div class="lthumb">${coverHtml(r)}${r.grail?`<span class="list-grail-mark">${dwLogo()}</span>`:''}</div></div><div class="c-code">${esc(recordCode(r))}</div><div class="c-art">${esc(r.artist)}</div><div class="c-alb">${esc(r.album)}</div><div class="c-nm">${esc(r.last||'')}</div><div class="c-nm">${esc(r.first||'')}</div><div class="c-gn"><span class="c-gn-txt">${esc(r.genre||'')}</span><span class="inline-status">${statusIcons(r)}</span></div><div class="c-qt">×${esc(r.copies_owned||1)}</div></div>`;
  }

  function statusIcons(r){
    const bits=[];
    if(r.listened) bits.push('<span class="csi note" title="Listened">♪</span>');
    const rv=reactionValue(r); if(rv) bits.push(`<span class="csi ${rv}" title="${esc(rv)}">${rv==='favorite'?'★':rv==='liked'?'⌃':'⌄'}</span>`);
    return bits.join('');
  }

  function trackBack(r){
    return `<div class="tl-hdr"><div class="tl-title">${esc(r.album)}</div><div class="tl-sub">${esc(recordCode(r))} · ${esc(r.artist)}</div></div><div class="tl-body">${trackHtml(r)}</div>${r.discogs_url?`<div class="tl-footer"><a class="tl-dg" href="${esc(r.discogs_url)}" target="_blank" rel="noopener">Discogs ↗</a></div>`:''}`;
  }

  function trackHtml(r){
    const t=tracks(r);
    if(!t.length) return `<div class="tl-empty">No tracklist saved.</div>`;
    let cur='', out='';
    t.forEach(tr=>{
      const pos=String(tr.position||'');
      const side=pos.match(/^[A-Z]+/)?.[0] || 'Tracks';
      if(side!==cur){ cur=side; out+=`<div class="tl-side-lbl">${esc(side)}</div>`; }
      out+=`<div class="tl-track"><span class="tl-pos">${esc(pos)}</span><span class="tl-name">${esc(tr.title||tr.name||'Untitled')}</span><span class="tl-dur">${esc(tr.duration||'')}</span></div>`;
    });
    return out;
  }

  function tag(v,cls=''){ return v?`<span class="flow-tag ${cls}">${esc(v)}</span>`:''; }
  function slug(v){ return String(v).replace(/[^a-z0-9]+/gi,'-'); }

  function renderJumpBar(){
    const groups=groupRecords(state.filtered).map(g=>g[0]);
    $('#jumpBar').innerHTML=groups.map(g=>`<a class="jb" href="#grp-${slug(g)}">${esc(String(g).slice(0,3))}</a>`).join('');
  }

  function updateGenres(){
    const sel=$('#fGenre'); if(!sel) return;
    const cur=sel.value;
    const genres=[...new Set(state.records.flatMap(r=>[r.genre,...(r.genres||[])]).filter(Boolean))].sort();
    sel.innerHTML='<option value="">All Genres</option>'+genres.map(g=>`<option ${g===cur?'selected':''}>${esc(g)}</option>`).join('');
  }

  function openModal(idx){
    const r=state.filtered[idx]; if(!r) return;
    state.currentId=r.id; state.random=false;
    const modal=$('#detModal'); modal.classList.toggle('grail-detail',!!r.grail);
    $('#rBanner').style.display=state.random?'flex':'none';
    $('#mCover').innerHTML=coverHtml(r);
    $('#mCode').textContent=recordCode(r);
    $('#mArtist').textContent=r.artist;
    $('#mAlbum').textContent=r.album;
    $('#mChips').innerHTML=[
      r.copies_owned?`×${r.copies_owned} copies`:'',
      displayYear(r)?`Released ${displayYear(r)}`:'',
      r.label, r.country, r.genre
    ].filter(Boolean).map(x=>`<span class="chip ${x===r.genre?'g':''}">${esc(x)}</span>`).join('');
    $('#mActions').innerHTML=`<button type="button" class="btn-sm dl" onclick="deleteCurrent()">Remove</button><button type="button" class="btn-sm ed" onclick="openForm(${idx})">Edit Record</button>`;
    renderModalState(r);
    renderModalCollections(r);
    $('#mWiki').innerHTML=`${displayYear(r)?`Released ${esc(displayYear(r))}. `:''}${r.label?`Label: ${esc(r.label)}. `:''}${r.country?`Country: ${esc(r.country)}. `:''}${r.genre?`Genre: ${esc(r.genre)}.`:''}` || 'No extra metadata saved yet.';
    $('#mStyles').innerHTML=(r.genres||[]).concat(r.styles||[]).map(x=>`<span class="style-pill">${esc(x)}</span>`).join('');
    $('#mLinks').innerHTML=`${r.discogs_url?`<a class="ext-link" href="${esc(r.discogs_url)}" target="_blank" rel="noopener">Release on Discogs ↗</a>`:''}<button class="btn-sec" id="mForceBtn" onclick="forceDiscogs()">Refresh Discogs</button>`;
    $('#mNote').innerHTML=r.note?`<div class="note-box">${esc(r.note)}</div>`:'';
    $('#mTlC').innerHTML=trackHtml(r).replaceAll('tl-','m-tl-');
    renderRelated(r);
    $('#detOv').classList.add('on'); $('#detOv').setAttribute('aria-hidden','false'); $('#detModal').focus();
  }
  window.openModal=openModal;

  function current(){ return state.records.find(r=>r.id===state.currentId) || state.filtered.find(r=>r.id===state.currentId); }

  function renderModalState(r){
    $('#mStateBox').innerHTML=`<div class="m-state-row"><button type="button" class="m-listen-btn ${r.listened?'on':''}" onclick="toggleListened()" title="Listened">♪</button><span class="m-state-divider"></span><div class="m-rating-row"><button type="button" class="m-rate-btn disliked ${reactionValue(r)==='disliked'?'on':''}" onclick="setReaction('disliked')" title="Disliked">⌄</button><button type="button" class="m-rate-btn liked ${reactionValue(r)==='liked'?'on':''}" onclick="setReaction('liked')" title="Liked">⌃</button><button type="button" class="m-rate-btn favorite ${reactionValue(r)==='favorite'?'on':''}" onclick="setReaction('favorite')" title="Favorite">★</button></div></div>${r.listened_at?`<span class="listened-stamp">Last listened ${esc(new Date(r.listened_at).toLocaleDateString())}</span>`:''}`;
  }

  function renderModalCollections(r){
    const names=collectionNames(r);
    $('#mCollectionBox').innerHTML=`<div class="m-collection-head">Collections</div><div class="m-collection-row">${names.map(n=>`<span class="m-collection-chip">${esc(n)}</span>`).join('') || '<span class="m-collection-chip">Record Cabinet</span>'}</div>`;
  }

  function renderRelated(r){
    const artist=state.records.filter(x=>x.id!==r.id && norm(x.artist)===norm(r.artist)).slice(0,4);
    const sim=state.records.filter(x=>x.id!==r.id && x.genre && x.genre===r.genre && norm(x.artist)!==norm(r.artist)).slice(0,4);
    $('#mArtistMoreWrap').style.display=artist.length?'block':'none';
    $('#mSimilarWrap').style.display=sim.length?'block':'none';
    $('#mArtistMore').innerHTML=artist.map(relCard).join('');
    $('#mSimilar').innerHTML=sim.map(relCard).join('');
  }
  function relCard(r){ const idx=state.filtered.findIndex(x=>x.id===r.id); return `<div class="m-rec-chip" onclick="openRecordById('${esc(r.id)}')"><div class="m-rec-thumb">${coverHtml(r)}</div><div class="m-rec-meta"><div class="m-rec-title">${esc(r.album)}</div><div class="m-rec-sub">${esc(r.artist)}</div><div class="m-rec-reason">${esc(recordCode(r))}</div></div></div>`; }
  function openRecordById(id){ const i=state.filtered.findIndex(r=>r.id===id); if(i>=0) openModal(i); }
  window.openRecordById=openRecordById;

  function closeModal(){ $('#detOv').classList.remove('on'); $('#detOv').setAttribute('aria-hidden','true'); state.currentId=null; }
  window.closeModal=closeModal;

  async function saveRecord(r,patch,action='record_update', reopen=true){
    if(!r) return;
    setSync('Saving');
    const payload={...patch, updated_at:new Date().toISOString()};
    const {data,error}=await SB.from('records').update(payload).eq('id',r.id).eq('user_id',state.user.id).select(FIELDS).single();
    if(error){ setSync('Save error'); alert(error.message); return; }
    await logChange(action,r,data);
    const idx=state.records.findIndex(x=>x.id===r.id);
    if(idx>=0) state.records[idx]=normalizeRecord(data);
    applyFilters();
    if(reopen){ const fi=state.filtered.findIndex(x=>x.id===data.id); if(fi>=0) openModal(fi); }
  }

  async function logChange(action,before,after){
    try{ await SB.from('change_log').insert({user_id:state.user.id,action,before_data:before||null,after_data:after||null}); }catch(e){}
  }

  async function toggleListened(){ const r=current(); await saveRecord(r,{listened:!r.listened,listened_at:!r.listened?new Date().toISOString():r.listened_at},'listened_update'); }
  window.toggleListened=toggleListened;
  async function setReaction(v){ const r=current(); const cur=reactionValue(r); await saveRecord(r,{reaction:cur===v?'':v, liked:cur===v?false:(v==='liked'||v==='favorite')},'reaction_update'); }
  window.setReaction=setReaction;

  function discogsIdFromUrl(url){ const m=String(url||'').match(/discogs\.com\/(release|master)\/(\d+)/i); return m?{type:m[1],id:m[2]}:null; }

  async function forceDiscogs(){
    const r=current(); if(!r) return;
    const parsed=discogsIdFromUrl(r.discogs_url);
    if(!parsed){ alert('Add a Discogs release/master URL first, then refresh.'); return; }
    $('#mForceBtn').textContent='Refreshing…';
    try{
      const token=localStorage.getItem('dw_discogs_token')||'';
      const url=`https://api.discogs.com/${parsed.type}s/${parsed.id}`;
      const res=await fetch(url,{headers:{'User-Agent':'DeadWax/1.0',...(token?{Authorization:`Discogs token=${token}`}:{})}});
      if(!res.ok) throw new Error(await res.text());
      const d=await res.json();
      const patch={
        discogs_id:String(d.id||parsed.id),
        discogs_type:parsed.type,
        discogs_url:d.uri || r.discogs_url,
        cover_url:d.images?.[0]?.uri150 || d.images?.[0]?.resource_url || r.cover_url,
        genre:d.genres?.[0] || r.genre,
        genres:d.genres || [],
        styles:d.styles || [],
        tracklist:d.tracklist || [],
        release_year:d.year || r.release_year,
        label:d.labels?.[0]?.name || r.label,
        country:d.country || r.country,
        raw_data:{...(r.raw_data||{}),discogs:d,discogs_refreshed_at:new Date().toISOString()}
      };
      await saveRecord(r,patch,'discogs_enrichment');
    }catch(e){ alert('Discogs refresh failed: '+e.message); }
  }
  window.forceDiscogs=forceDiscogs;

  function openForm(idx){
    const r = typeof idx==='number' ? state.filtered[idx] : null;
    state.currentId = r?.id || null;
    $('#fTitle').textContent = r ? 'Edit Record' : 'Add Record';
    $('#formModal .f-sub').textContent='Saved to Supabase';
    $('#fldCode').value=recordCode(r||{}) || '';
    $('#fldArtist').value=r?.artist || '';
    $('#fldLast').value=r?.last || '';
    $('#fldFirst').value=r?.first || '';
    $('#fldAlbum').value=r?.album || '';
    $('#fldOwned').value=r?.copies_owned || 1;
    $('#fldGrail').checked=!!r?.grail;
    $('#fldDg').value=r?.discogs_url || '';
    $('#fldImg').value=r?.cover_url || '';
    $('#fldNote').value=r?.note || '';
    renderCollectionSelect(r);
    renderTrackEditor(tracks(r||{}));
    prevImg();
    $('#fOv').classList.add('on'); $('#fOv').setAttribute('aria-hidden','false');
  }
  window.openForm=openForm;
  function closeForm(){ $('#fOv').classList.remove('on'); $('#fOv').setAttribute('aria-hidden','true'); }
  window.closeForm=closeForm;

  function renderCollectionSelect(r){
    const selected=new Set(collectionNames(r||{}));
    $('#fldCollections').innerHTML=state.collections.map(c=>`<option value="${esc(c.id)}" ${selected.has(c.name)?'selected':''}>${esc(c.name)}</option>`).join('');
  }

  function renderTrackEditor(ts=[]){
    const grid=$('#fTrackGrid');
    const sides={};
    arr(ts).forEach(t=>{ const side=String(t.position||'A').match(/^[A-Z]+/)?.[0]||'A'; (sides[side] ||= []).push(t); });
    const letters=Object.keys(sides).length?Object.keys(sides):['A','B'];
    grid.innerHTML=letters.map(side=>`<div class="ff"><label for="side_${side}">Side ${side}</label><textarea id="side_${side}" data-side="${side}" placeholder="A1 | Track title | 3:21">${(sides[side]||[]).map(t=>[t.position,t.title,t.duration].filter(Boolean).join(' | ')).join('\n')}</textarea></div>`).join('');
  }

  function parseTrackEditor(){
    return $$('#fTrackGrid textarea').flatMap(t=>t.value.split('\n').map(x=>x.trim()).filter(Boolean).map(line=>{
      const p=line.split('|').map(s=>s.trim());
      return {position:p[0]||'', title:p[1]||p[0]||'', duration:p[2]||''};
    }));
  }

  function addDisc(){
    const used=$$('#fTrackGrid textarea').map(t=>t.dataset.side);
    const next = String.fromCharCode(65+used.length);
    $('#fTrackGrid').insertAdjacentHTML('beforeend',`<div class="ff"><label for="side_${next}">Side ${next}</label><textarea id="side_${next}" data-side="${next}" placeholder="${next}1 | Track title | 3:21"></textarea></div>`);
  }

  async function saveRec(){
    const r=current();
    const payload={
      shelf_id:$('#fldCode').value.trim(),
      artist:$('#fldArtist').value.trim(),
      last:$('#fldLast').value.trim(),
      first:$('#fldFirst').value.trim(),
      album:$('#fldAlbum').value.trim(),
      copies_owned:Number($('#fldOwned').value||1),
      grail:$('#fldGrail').checked,
      discogs_url:$('#fldDg').value.trim(),
      cover_url:$('#fldImg').value.trim(),
      note:$('#fldNote').value.trim(),
      tracklist:parseTrackEditor(),
      collections:[...$('#fldCollections').selectedOptions].map(o=>o.value),
      user_id:state.user.id,
      updated_at:new Date().toISOString()
    };
    if(!payload.shelf_id || !payload.artist){ alert('Shelf ID and Artist are required.'); return; }
    if(r){
      await saveRecord(r,payload,'record_edit',false);
    }else{
      const {data,error}=await SB.from('records').upsert(payload,{onConflict:'user_id,shelf_id'}).select(FIELDS).single();
      if(error){ alert(error.message); return; }
      await logChange('record_add',null,data);
    }
    closeForm(); await loadAll();
  }
  window.saveRec=saveRec;

  function prevImg(){ const u=$('#fldImg')?.value.trim(); const p=$('#imgPrev'); if(!p) return; p.innerHTML=u?`<img src="${esc(u)}" alt="">`:'<span>Preview</span>'; }
  window.prevImg=prevImg;

  async function deleteCurrent(){
    const r=current(); if(!r) return;
    if(!confirm(`Remove ${r.artist} — ${r.album}?`)) return;
    const {error}=await SB.from('records').delete().eq('id',r.id).eq('user_id',state.user.id);
    if(error){ alert(error.message); return; }
    await logChange('record_delete',r,null);
    closeModal(); await loadAll();
  }
  window.deleteCurrent=deleteCurrent;

  function setView(v){ state.view=v; render(); }
  window.setView=setView;
  function setGroup(v){ state.group=v; render(); }
  window.setGroup=setGroup;
  function setSecondaryGroup(v){ state.secondary=v; render(); }
  window.setSecondaryGroup=setSecondaryGroup;
  function syncGroupControls(){ updateButtons(); }
  window.syncGroupControls=syncGroupControls;

  function toggleGroup(k){ const key=k.replaceAll('&amp;','&'); state.collapsed.has(key)?state.collapsed.delete(key):state.collapsed.add(key); render(); }
  window.toggleGroup=toggleGroup;

  function randomize(){
    if(!state.filtered.length) return;
    const i=Math.floor(Math.random()*state.filtered.length);
    const disc=$('#rdisc'); disc?.classList.add('spinning'); setTimeout(()=>disc?.classList.remove('spinning'),900);
    openModal(i); $('#rBanner').style.display='flex';
  }
  window.randomize=randomize;
  function goHomeGrid(){ setView('grid'); window.scrollTo({top:0,behavior:'smooth'}); }
  window.goHomeGrid=goHomeGrid;

  function openSettingsFromMenu(){ closeUserMenu(); openSett(); }
  window.openSettingsFromMenu=openSettingsFromMenu;
  function toggleUserMenu(){ $('#userMenu').classList.toggle('on'); $('#userMenuBtn').setAttribute('aria-expanded',$('#userMenu').classList.contains('on')); }
  window.toggleUserMenu=toggleUserMenu;
  function closeUserMenu(){ $('#userMenu').classList.remove('on'); $('#userMenuBtn').setAttribute('aria-expanded','false'); }
  window.closeUserMenu=closeUserMenu;

  function openSett(){ renderUserSettings(); $('#sOv').classList.add('on'); $('#sOv').setAttribute('aria-hidden','false'); }
  window.openSett=openSett;
  function closeSett(){ $('#sOv').classList.remove('on'); $('#sOv').setAttribute('aria-hidden','true'); }
  window.closeSett=closeSett;
  function showUserTab(name){
    $$('.user-tab').forEach(b=>b.classList.remove('on'));
    $$('.user-panel').forEach(p=>{p.classList.remove('on'); p.hidden=false;});
    $('#tab'+cap(name))?.classList.add('on');
    $('#userPanel'+cap(name))?.classList.add('on');
  }
  window.showUserTab=showUserTab;
  function cap(s){ return s.charAt(0).toUpperCase()+s.slice(1); }

  function renderUserSettings(){
    updateCounts();
    $('#stLoadedDiscogs') && ($('#stLoadedDiscogs').textContent=state.records.filter(r=>tracks(r).length||r.cover_url||r.discogs_id).length);
    $('#stToken') && ($('#stToken').value=localStorage.getItem('dw_discogs_token')||'');
    renderCollectionManager();
    const hc=$('#highContrastToggle'); if(hc) hc.checked=document.documentElement.classList.contains('dw-high-contrast');
    $('#stHighContrast') && ($('#stHighContrast').textContent=hc?.checked?'On':'Off');
    const s=localStorage.getItem('dw_type_scale')||'12';
    $$('input[name="typeScale"]').forEach(x=>x.checked=x.value===s);
    $('#stTypeScale') && ($('#stTypeScale').textContent=s==='12'?'12-inch':s==='double'?'Double Album':'Box Set');
  }

  function renderCollectionManager(){
    const list=$('#collectionList'); if(!list) return;
    list.innerHTML=state.collections.map(c=>`<div class="collection-item"><div><div class="collection-name">${esc(c.name)}</div><div class="collection-meta">${esc(c.id)}</div></div><button class="btn-sec dng" onclick="deleteCollection('${esc(c.id)}')">Remove</button></div>`).join('') || '<div class="tip">No collection labels yet.</div>';
  }

  async function addCollection(){
    const name=$('#newCollectionName').value.trim(); if(!name) return;
    const id=name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
    const {error}=await SB.from('collections').upsert({id,name,user_id:state.user.id,locked:false},{onConflict:'user_id,id'});
    if(error){ alert(error.message); return; }
    $('#newCollectionName').value=''; await loadAll(); renderUserSettings();
  }
  window.addCollection=addCollection;
  async function deleteCollection(id){
    if(!confirm('Remove this collection label?')) return;
    const {error}=await SB.from('collections').delete().eq('user_id',state.user.id).eq('id',id);
    if(error){ alert(error.message); return; }
    await loadAll(); renderUserSettings();
  }
  window.deleteCollection=deleteCollection;

  function saveSett(){ localStorage.setItem('dw_discogs_token',$('#stToken').value.trim()); renderUserSettings(); }
  window.saveSett=saveSett;
  function fetchMissingDiscogs(){ alert('Bulk Discogs fetching is intentionally not enabled yet. Refresh per record for now.'); }
  window.fetchMissingDiscogs=fetchMissingDiscogs;
  function exportDiscogsDb(){ alert('This Supabase-native build does not export dead_wax_db.js. Supabase is the source of truth.'); }
  window.exportDiscogsDb=exportDiscogsDb;
  function clearDgCache(){ alert('No record cache is used as source of truth in this native build.'); }
  window.clearDgCache=clearDgCache;
  function openWebViewer(){ window.open('web.html','_blank'); }
  window.openWebViewer=openWebViewer;
  function handleImport(){ alert('Migration importer lives at /tools/importer.html and should be removed after use.'); }
  window.handleImport=handleImport;
  function setHighContrast(on){
    document.documentElement.classList.toggle('dw-high-contrast',!!on);
    localStorage.setItem('dw_high_contrast',on?'1':'0');
    renderUserSettings();
  }
  window.setHighContrast=setHighContrast;
  function setTypeScale(v){
    localStorage.setItem('dw_type_scale',v);
    document.documentElement.classList.toggle('dw-type-double-album',v==='double');
    document.documentElement.classList.toggle('dw-type-box-set',v==='box');
    document.documentElement.dataset.typeScale=v;
    renderUserSettings();
  }
  window.setTypeScale=setTypeScale;

  function updateHdrH(){
    const h=$('#hdr')?.getBoundingClientRect().height || 108;
    document.documentElement.style.setProperty('--hdr', `${Math.ceil(h)}px`);
  }
  window.updateHdrH=updateHdrH;

  function bindEvents(){
    $('#gSearch')?.addEventListener('input',e=>{ state.filters.global=e.target.value; renderSearchFlyout(e.target.value); applyFilters(); });
    [['fCode','code'],['fArtist','artist'],['fLast','last'],['fFirst','first'],['fAlbum','album']].forEach(([id,k])=>$('#'+id)?.addEventListener('input',e=>{state.filters[k]=e.target.value; applyFilters();}));
    $('#fGenre')?.addEventListener('change',e=>{state.filters.genre=e.target.value; applyFilters();});
    $('#fListened')?.addEventListener('change',e=>{state.filters.listened=e.target.checked; applyFilters();});
    $('#fRating')?.addEventListener('change',e=>{state.filters.rating=e.target.value; applyFilters();});
    $('#fLastListened')?.addEventListener('change',e=>{state.filters.lastListened=e.target.value; applyFilters();});
    $('#fGrail')?.addEventListener('change',e=>{state.filters.grail=e.target.checked; applyFilters();});
    $('#btnClr')?.addEventListener('click',()=>{ state.filters={global:'', code:'', artist:'', last:'', first:'', album:'', genre:'', listened:false, rating:'', lastListened:'', grail:false}; ['gSearch','fCode','fArtist','fLast','fFirst','fAlbum'].forEach(id=>$('#'+id)&&( $('#'+id).value='' )); ['fGenre','fRating','fLastListened'].forEach(id=>$('#'+id)&&($('#'+id).value='')); ['fListened','fGrail'].forEach(id=>$('#'+id)&&($('#'+id).checked=false)); applyFilters(); });
    $('#filterToggle')?.addEventListener('click',()=>{ const d=$('#filterDrawer'), b=$('#filterToggle'); d.classList.toggle('on'); b.setAttribute('aria-expanded',String(d.classList.contains('on'))); updateHdrH(); });
    $('#groupSelect')?.addEventListener('change',e=>setGroup(e.target.value));
    $('#secondaryGroupSelect')?.addEventListener('change',e=>setSecondaryGroup(e.target.value));
    $('#userMenuBtn')?.addEventListener('click',e=>{e.stopPropagation(); toggleUserMenu();});
    document.addEventListener('click',e=>{ if(!e.target.closest?.('#userMenuWrap')) closeUserMenu(); if(!e.target.closest?.('#searchWrap')) closeSf(); });
    $('#mClose')?.addEventListener('click',closeModal);
    $('#detOv')?.addEventListener('click',e=>{ if(e.target.id==='detOv') closeModal(); });
    $('#fOv')?.addEventListener('click',e=>{ if(e.target.id==='fOv') closeForm(); });
    $('#sOv')?.addEventListener('click',e=>{ if(e.target.id==='sOv') closeSett(); });
    $('#addDiscBtn')?.addEventListener('click',addDisc);
    $('#cfStage')?.addEventListener('wheel',e=>{ if(state.view!=='flow') return; e.preventDefault(); state.cfIndex += e.deltaY>0?1:-1; state.cfIndex=Math.max(0,Math.min(state.cfIndex,state.filtered.length-1)); renderFlow(); }, {passive:false});
    document.addEventListener('keydown',e=>{ if(e.key==='Escape'){ closeSf(); closeUserMenu(); } if(state.view==='flow' && (e.key==='ArrowRight'||e.key==='ArrowLeft')){ state.cfIndex += e.key==='ArrowRight'?1:-1; state.cfIndex=Math.max(0,Math.min(state.cfIndex,state.filtered.length-1)); renderFlow(); } });
    new ResizeObserver(updateHdrH).observe($('#hdr'));
  }

  function renderSearchFlyout(q){
    const sf=$('#sf'); q=q.trim(); if(q.length<2){ closeSf(); return; }
    const res=filtered().slice(0,12);
    sf.classList.add('on');
    sf.innerHTML=res.length?`<div class="sf-grp"><div class="sf-grp-lbl">Records</div>${res.map(r=>`<div class="sf-item" onclick="openRecordById('${esc(r.id)}')"><div class="sf-code">${esc(recordCode(r))}</div><div class="sf-thumb">${coverHtml(r)}</div><div class="sf-txt"><div class="sf-name">${esc(r.artist)}</div><div class="sf-sub">${esc(r.album)}</div></div></div>`).join('')}</div>`:`<div class="sf-empty">No search results</div>`;
  }
  function closeSf(){ $('#sf')?.classList.remove('on'); }
  window.closeSf=closeSf;

  function renderFlowCardFallback(){}

  window.addEventListener('scroll',()=>document.body.classList.toggle('dw-scrolled',window.scrollY>4),{passive:true});

  bindEvents();
  initAuth();
})();
