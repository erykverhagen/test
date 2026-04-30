(() => {
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const C = window.DEAD_WAX_SUPABASE || window.DW_SUPABASE || {};
  const SB = window.supabase.createClient(C.url || C.SUPABASE_URL, C.anonKey || C.anon_key || C.SUPABASE_ANON_KEY);
  const state = { session:null, user:null, records:[], collections:[], links:[], view:'grid', current:null, filters:{}, flowIndex:0 };
  const FIELDS = 'id,user_id,shelf_id,artist,album,last,first,copies_owned,note,grail,listened,liked,reaction,listened_at,discogs_id,discogs_type,cover_url,genre,genres,styles,tracklist,discogs_url,release_year,label,country,source_key,raw_data,created_at,updated_at';
  const esc = v => String(v ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const norm = v => String(v ?? '').trim();
  const shelfKey = r => norm(r.shelf_id || r.code || '').toUpperCase();
  const naturalShelf = s => { const m=String(s||'').match(/^([A-Za-z]+)\s*([0-9]+)?(.*)$/); return m ? [m[1].toUpperCase(), +(m[2]||0), m[3]||''] : [String(s||''),0,'']; };
  const cmpShelf = (a,b) => { const A=naturalShelf(shelfKey(a)), B=naturalShelf(shelfKey(b)); return A[0].localeCompare(B[0]) || A[1]-B[1] || A[2].localeCompare(B[2]); };
  const reactionValue = r => r.reaction || (r.liked ? 'liked' : '');
  const displayYear = r => r.release_year || r.year || '';
  const tracks = r => Array.isArray(r.tracklist) ? r.tracklist : [];
  const collectionNames = r => (Array.isArray(r.collection_names) ? r.collection_names : []);
  function setSync(s){ $('#syncState').textContent=s; }
  async function init(){
    applySettings(); bind(); const {data}=await SB.auth.getSession(); handleSession(data.session); SB.auth.onAuthStateChange((_e,s)=>handleSession(s));
  }
  async function handleSession(session){ state.session=session; state.user=session?.user||null; $('#authScreen').classList.toggle('hidden',!!session); $('#appShell').classList.toggle('hidden',!session); if(session) await loadAll(); }
  function bind(){
    $('#signInBtn').onclick=async()=>auth('signIn'); $('#signUpBtn').onclick=async()=>auth('signUp'); $('#signOutBtn').onclick=()=>SB.auth.signOut();
    $('#filterToggle').onclick=()=>$('#filters').classList.toggle('on'); $('#homeBtn').onclick=()=>{ window.scrollTo(0,0); clearSelection(); };
    $('#randomBtn').onclick=()=>{ const arr=filtered(); if(arr.length) openDetail(arr[Math.floor(Math.random()*arr.length)].id); };
    $$('.view-toggle button').forEach(b=>b.onclick=()=>{ $$('.view-toggle button').forEach(x=>x.classList.remove('on')); b.classList.add('on'); state.view=b.dataset.view; render(); });
    ['searchInput','fShelf','fArtist','fAlbum','fGenre','fListened','fDoubles','fReaction','fLast','fGrail'].forEach(id=>{ const el=$('#'+id); el.oninput=el.onchange=()=>render(); });
    $('#clearFilters').onclick=()=>{ ['searchInput','fShelf','fArtist','fAlbum'].forEach(id=>$('#'+id).value=''); ['fGenre','fReaction','fLast'].forEach(id=>$('#'+id).value=''); ['fListened','fDoubles','fGrail'].forEach(id=>$('#'+id).checked=false); render(); };
    $('#closeDetail').onclick=closeDetail; $('#detailOverlay').onclick=e=>{ if(e.target.id==='detailOverlay') closeDetail(); };
    $('#closeEdit').onclick=closeEdit; $('#cancelEdit').onclick=closeEdit; $('#editForm').onsubmit=saveEdit;
    $('#settingsBtn').onclick=()=>$('#settingsOverlay').classList.remove('hidden'); $('#closeSettings').onclick=()=>$('#settingsOverlay').classList.add('hidden');
    $('#saveToken').onclick=()=>{ localStorage.setItem('dw_discogs_token',$('#discogsToken').value||''); alert('Token saved.'); };
    $('#highContrast').onchange=e=>{ localStorage.setItem('dw_high_contrast',e.target.checked?'1':'0'); applySettings(); };
    $('#typeScale').onchange=e=>{ localStorage.setItem('dw_type_scale',e.target.value); applySettings(); };
    document.addEventListener('keydown',e=>{ if(e.key==='Escape'){ closeDetail(); closeEdit(); $('#settingsOverlay').classList.add('hidden'); }});
  }
  function applySettings(){
    document.documentElement.classList.toggle('dw-high-contrast',localStorage.getItem('dw_high_contrast')==='1');
    const t=localStorage.getItem('dw_type_scale')||'12'; document.documentElement.classList.toggle('dw-type-double-album',t==='double'); document.documentElement.classList.toggle('dw-type-box-set',t==='box');
    if($('#highContrast')) $('#highContrast').checked=localStorage.getItem('dw_high_contrast')==='1'; if($('#typeScale')) $('#typeScale').value=t; if($('#discogsToken')) $('#discogsToken').value=localStorage.getItem('dw_discogs_token')||'';
  }
  async function auth(mode){
    const email=$('#authEmail').value.trim(), password=$('#authPassword').value; $('#authMsg').textContent='Working…';
    const res = mode==='signUp' ? await SB.auth.signUp({email,password}) : await SB.auth.signInWithPassword({email,password});
    $('#authMsg').textContent = res.error ? res.error.message : (mode==='signUp'?'Check your email if confirmation is enabled.':'Signed in.');
  }
  async function loadAll(){
    setSync('Loading');
    const [{data:records,error:e1},{data:cols},{data:links}] = await Promise.all([
      SB.from('records').select(FIELDS).order('shelf_id',{ascending:true}),
      SB.from('collections').select('id,name,source_id,locked').order('name'),
      SB.from('record_collections').select('record_id,collection_id')
    ]);
    if(e1){ setSync('Read error'); console.error(e1); return; }
    state.collections=cols||[]; state.links=links||[]; const cById=new Map(state.collections.map(c=>[c.id,c.name])); const map=new Map();
    for(const l of state.links) { if(!map.has(l.record_id)) map.set(l.record_id,[]); const n=cById.get(l.collection_id); if(n) map.get(l.record_id).push(n); }
    state.records=(records||[]).map(r=>({...r,collection_names:map.get(r.id)||[]})).sort(cmpShelf);
    buildGenreFilter(); render(); setSync('Synced');
  }
  function buildGenreFilter(){ const genres=[...new Set(state.records.map(r=>r.genre).filter(Boolean))].sort(); const sel=$('#fGenre'), old=sel.value; sel.innerHTML='<option value="">All genres</option>'+genres.map(g=>`<option>${esc(g)}</option>`).join(''); sel.value=old; }
  function filtered(){
    const q=$('#searchInput').value.toLowerCase().trim(), shelf=$('#fShelf').value.toLowerCase().trim(), artist=$('#fArtist').value.toLowerCase().trim(), album=$('#fAlbum').value.toLowerCase().trim();
    const genre=$('#fGenre').value, react=$('#fReaction').value, last=$('#fLast').value; const now=new Date();
    return state.records.filter(r=>{
      const hay=[r.shelf_id,r.artist,r.album,r.genre,r.label,r.country,...tracks(r).map(t=>t.title)].join(' ').toLowerCase();
      if(q && !hay.includes(q)) return false; if(shelf && !String(r.shelf_id||'').toLowerCase().includes(shelf)) return false; if(artist && !String(r.artist||'').toLowerCase().includes(artist)) return false; if(album && !String(r.album||'').toLowerCase().includes(album)) return false;
      if(genre && r.genre!==genre) return false; if($('#fListened').checked && !r.listened) return false; if($('#fDoubles').checked && !(Number(r.copies_owned||1)>1)) return false; if($('#fGrail').checked && !r.grail) return false; if(react && reactionValue(r)!==react) return false;
      if(last){ if(!r.listened_at) return false; const d=new Date(r.listened_at), days=(now-d)/86400000; if(last==='week'&&days>7) return false; if(last==='month'&&days>31) return false; if(last==='year'&&days>366) return false; }
      return true;
    }).sort(cmpShelf);
  }
  function render(){ const arr=filtered(); $('#shownCount').textContent=arr.length; $('#totalCount').textContent=state.records.length; if(state.view==='list') renderList(arr); else if(state.view==='flow') renderFlow(arr); else renderGrid(arr); }
  function groupAZ(arr){ const m=new Map(); for(const r of arr){ const k=(String(r.artist||'#').trim()[0]||'#').toUpperCase(); if(!m.has(k)) m.set(k,[]); m.get(k).push(r); } return [...m.entries()].sort((a,b)=>a[0].localeCompare(b[0])); }
  function header(k,n){ return `<div class="group-header"><span>▸</span><h2>${esc(k)}</h2><span>${n} records</span></div>`; }
  function renderGrid(arr){ $('#records').className=''; $('#records').innerHTML= groupAZ(arr).map(([k,rs])=>header(k,rs.length)+`<section class="grid">${rs.map(card).join('')}</section>`).join('') || empty(); bindCards(); }
  function renderList(arr){ $('#records').className='list'; $('#records').innerHTML= groupAZ(arr).map(([k,rs])=>header(k,rs.length)+rs.map(row).join('')).join('') || empty(); bindCards(); }
  function renderFlow(arr){ state.flowIndex=Math.min(state.flowIndex,Math.max(0,arr.length-1)); const start=Math.max(0,state.flowIndex-2), view=arr.slice(start,start+5); $('#records').className='flow'; $('#records').innerHTML=view.map((r,i)=>card(r,(start+i)===state.flowIndex?'active':'')).join('') || empty(); bindCards(); }
  function empty(){ return '<div class="muted" style="padding:4rem;text-align:center">No records found. Use Settings → Open importer, or add your first record later.</div>'; }
  function cover(r){ const u=r.cover_url || r.img; return u ? `<img src="${esc(u)}" loading="lazy" alt="${esc(r.album)} cover">` : '<span>No cover</span>'; }
  function card(r,extra=''){ return `<article class="card ${extra}" data-id="${r.id}"><div class="card-inner"><div class="front"><div class="cover">${cover(r)}${r.grail?'<b class="grail-mark">DW</b>':''}</div><div class="card-info"><div class="code">${esc(r.shelf_id||'No ID')}</div><div class="artist">${esc(r.artist)}</div><div class="album">${esc(r.album)}</div><div class="pills">${pill(r.genre)}${pill((r.copies_owned||1)+' copy'+((r.copies_owned||1)>1?'ies':''))}${r.listened?pill('Listened'):''}${reactionValue(r)?pill(reactionValue(r)):''}</div></div></div><div class="back"><div class="tl">${trackHtml(r,true)}</div></div></div></article>`; }
  function row(r){ return `<article class="row" data-id="${r.id}"><div class="thumb">${cover(r)}${r.grail?'<b class="grail-mark">DW</b>':''}</div><div class="code">${esc(r.shelf_id)}</div><div class="artist">${esc(r.artist)}</div><div class="album">${esc(r.album)}</div><div class="hide-sm">${esc(r.genre||'')}</div><div class="hide-sm">${esc(collectionNames(r).join(', '))}</div></article>`; }
  function pill(v){ return v?`<span class="pill">${esc(v)}</span>`:''; }
  function bindCards(){ $$('#records [data-id]').forEach(el=>el.onclick=e=>{ if(state.view==='flow' && !el.classList.contains('active')){ const ids=filtered().map(r=>r.id); state.flowIndex=ids.indexOf(el.dataset.id); render(); return; } openDetail(el.dataset.id); }); }
  function trackHtml(r,compact=false){ const t=tracks(r); if(!t.length) return '<p class="muted">No tracklist saved.</p>'; let cur=''; return t.map(tr=>{ const side=String(tr.position||'').match(/^[A-Z]+/)?.[0]||'Tracks'; const h=side!==cur ? (cur=side,`<h4>${esc(side)}</h4>`) : ''; return h+`<div class="track"><span>${esc(tr.position||'')}</span><span>${esc(tr.title||'Untitled')}</span><span>${esc(tr.duration||'')}</span></div>`; }).join(''); }
  function openDetail(id){ const r=state.records.find(x=>x.id===id); if(!r) return; state.current=r; const more=state.records.filter(x=>x.id!==r.id && (x.artist===r.artist || x.genre===r.genre)).slice(0,4); $('#detailModal').classList.toggle('grail-detail',!!r.grail); $('#detailContent').innerHTML=`<section class="detail-top ${r.grail?'grail':''}"><div><div class="detail-cover">${cover(r)}</div><div class="state-row"><button data-act="listen" class="${r.listened?'on':''}">♪</button><button data-act="disliked" class="${reactionValue(r)==='disliked'?'on':''}">☟</button><button data-act="liked" class="${reactionValue(r)==='liked'?'on':''}">☝</button><button data-act="favorite" class="${reactionValue(r)==='favorite'?'on':''}">☆</button></div></div><div><div class="code">${esc(r.shelf_id)}${r.grail?' · GRAIL RECORD':''}</div><h2 style="font-size:2.2rem">${esc(r.artist)}</h2><div class="album" style="font-size:1.25rem">${esc(r.album)}</div><div class="pills">${pill((r.copies_owned||1)+' copy')}${pill(r.genre)}${r.styles?.slice?.(0,2).map(pill).join('')||''}</div><div class="pills">${collectionNames(r).map(pill).join('')}</div><div class="detail-actions"><button class="delete" data-act="delete">× Remove</button><button class="edit" data-act="edit">✎ Edit Record</button></div></div></section><section class="detail-body"><div><div class="sec-lbl">About</div><p class="about">${displayYear(r)?'Released '+esc(displayYear(r))+' · ':''}${r.label?'Label: '+esc(r.label)+' · ':''}${r.country?'Country: '+esc(r.country)+' · ':''}${r.genre?'Genre: '+esc([r.genre,...(r.genres||[]).filter(g=>g!==r.genre)].join(', ')):''}</p><div class="pills">${(r.genres||[]).map(pill).join('')}${(r.styles||[]).map(pill).join('')}</div><div class="linkbar">${r.discogs_url?`<a href="${esc(r.discogs_url)}" target="_blank">Release on Discogs ↗</a>`:''}<button class="ghost" data-act="refresh">↻ Refresh Discogs</button></div><div class="sec-lbl">Tracklist</div>${trackHtml(r)}</div><aside class="similar"><div class="sec-lbl">Similar to this</div>${more.map(m=>`<div class="rec" data-id="${m.id}"><div class="thumb">${cover(m)}</div><div><b>${esc(m.album)}</b><br><span class="muted">${esc(m.artist)}</span></div></div>`).join('')||'<p class="muted">No suggestions.</p>'}</aside></section>`;
    $('#detailOverlay').classList.remove('hidden'); $$('#detailContent [data-act]').forEach(b=>b.onclick=detailAction); $$('#detailContent .rec').forEach(x=>x.onclick=()=>openDetail(x.dataset.id)); }
  function closeDetail(){ $('#detailOverlay').classList.add('hidden'); state.current=null; }
  function clearSelection(){}
  async function detailAction(e){ const a=e.currentTarget.dataset.act, r=state.current; if(!r) return; if(a==='edit') return openEdit(r); if(a==='delete') return deleteRecord(r); if(a==='refresh') return refreshDiscogs(r); if(a==='listen') return saveRecord(r,{listened:!r.listened,listened_at:!r.listened?new Date().toISOString():r.listened_at},'listen_update'); if(['disliked','liked','favorite'].includes(a)) return saveRecord(r,{reaction:reactionValue(r)===a?'':a, liked:a==='liked'||a==='favorite'},'reaction_update'); }
  function openEdit(r){ state.current=r; const f=$('#editForm'); f.reset(); ['shelf_id','artist','album','last','first','copies_owned','note','discogs_url','cover_url','genre','release_year','label','country'].forEach(k=>{ if(f.elements[k]) f.elements[k].value=r[k]??''; }); f.elements.grail.checked=!!r.grail; f.elements.tracklist_text.value=tracks(r).map(t=>[t.position,t.title,t.duration].filter(Boolean).join(' | ')).join('\n'); const sel=f.elements.collections; sel.innerHTML=state.collections.map(c=>`<option value="${c.id}" ${collectionNames(r).includes(c.name)?'selected':''}>${esc(c.name)}</option>`).join(''); $('#editOverlay').classList.remove('hidden'); }
  function closeEdit(){ $('#editOverlay').classList.add('hidden'); }
  function parseTrackText(txt){ return txt.split('\n').map(x=>x.trim()).filter(Boolean).map(line=>{ const p=line.split('|').map(s=>s.trim()); return {position:p[0]||'', title:p[1]||p[0]||'', duration:p[2]||''}; }); }
  async function saveEdit(e){ e.preventDefault(); const r=state.current; const fd=new FormData(e.currentTarget); const patch={}; for(const [k,v] of fd.entries()) if(k!=='collections') patch[k]=v; patch.copies_owned=Number(patch.copies_owned||1); patch.grail=e.currentTarget.elements.grail.checked; patch.tracklist=parseTrackText(e.currentTarget.elements.tracklist_text.value); delete patch.tracklist_text; await saveRecord(r,patch,'record_edit'); await saveCollections(r,[...e.currentTarget.elements.collections.selectedOptions].map(o=>o.value)); closeEdit(); }
  async function saveCollections(r,ids){ setSync('Saving'); await SB.from('record_collections').delete().eq('record_id',r.id); if(ids.length){ const rows=ids.map(id=>({user_id:state.user.id,record_id:r.id,collection_id:id})); await SB.from('record_collections').insert(rows); } await logChange('collections_update',r,{collection_ids:ids}); await loadAll(); }
  async function saveRecord(r,patch,action='record_update'){ setSync('Saving'); const before={...r}; const {data,error}=await SB.from('records').update({...patch,updated_at:new Date().toISOString()}).eq('id',r.id).select(FIELDS).single(); if(error){ setSync('Save error'); alert(error.message); return; } await logChange(action,before,data); Object.assign(r,data); await loadAll(); openDetail(data.id); }
  async function deleteRecord(r){ if(!confirm(`Remove ${r.artist} — ${r.album}?`)) return; setSync('Deleting'); await SB.from('record_collections').delete().eq('record_id',r.id); const {error}=await SB.from('records').delete().eq('id',r.id); if(error){ alert(error.message); return; } await logChange('record_delete',r,null); closeDetail(); await loadAll(); }
  async function logChange(action,before,after){ await SB.from('change_log').insert({user_id:state.user.id,action,before_data:before,after_data:after}); }
  function discogsIdFromUrl(url){ const m=String(url||'').match(/discogs\.com\/(release|master)\/(\d+)/i); return m?{type:m[1],id:m[2]}:null; }
  async function refreshDiscogs(r){ const parsed=discogsIdFromUrl(r.discogs_url); if(!parsed){ alert('Add a Discogs release/master URL first, then refresh.'); return; } setSync('Discogs'); try{ const token=localStorage.getItem('dw_discogs_token')||''; const url=`https://api.discogs.com/${parsed.type}s/${parsed.id}`; const res=await fetch(url,{headers:{'User-Agent':'DeadWax/1.0',...(token?{Authorization:`Discogs token=${token}`}:{})}}); if(!res.ok) throw new Error(await res.text()); const d=await res.json(); const patch={discogs_id:String(d.id||parsed.id),discogs_type:parsed.type,discogs_url:d.uri||r.discogs_url,cover_url:d.images?.[0]?.uri150||d.images?.[0]?.resource_url||r.cover_url,genre:d.genres?.[0]||r.genre,genres:d.genres||[],styles:d.styles||[],tracklist:d.tracklist||[],release_year:d.year||r.release_year,label:d.labels?.[0]?.name||r.label,country:d.country||r.country,raw_data:{...(r.raw_data||{}),discogs:d,discogs_refreshed_at:new Date().toISOString()}}; await saveRecord(r,patch,'discogs_enrichment'); }catch(e){ setSync('Discogs error'); alert('Discogs refresh failed: '+e.message); }}
  init();
})();
