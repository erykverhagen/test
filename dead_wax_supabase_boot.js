
(function(){
  const CONFIG = window.DEAD_WAX_SUPABASE || {};
  const state = window.DW_SUPABASE_STATE = { client:null, session:null, user:null, collections:[], recordCollections:new Map(), records:[], ready:false };

  function svgMark(){return `<svg class="dw-mark" viewBox="0 0 64 64" aria-hidden="true"><defs><radialGradient id="dwg" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#e8b840"/><stop offset="60%" stop-color="#b07818"/><stop offset="100%" stop-color="#7a5010"/></radialGradient></defs><circle cx="32" cy="32" r="30" fill="url(#dwg)"/><circle cx="32" cy="32" r="25" fill="none" stroke="#0b0906" stroke-width="3"/><circle cx="32" cy="32" r="20" fill="none" stroke="#0b0906" stroke-width="2.5"/><circle cx="32" cy="32" r="13" fill="#d09a24" stroke="#7a5010"/><text x="32" y="38" text-anchor="middle" font-family="serif" font-size="14" font-weight="700" fill="#0b0906">DW</text></svg>`}
  function ensureAuthShell(){
    let el=document.getElementById('dwAuthShell'); if(el) return el;
    el=document.createElement('section'); el.id='dwAuthShell'; el.className='auth-shell-dw';
    el.innerHTML=`<div class="auth-card-dw"><div style="width:54px;height:54px;margin-bottom:.9rem">${svgMark()}</div><h1>Dead Wax</h1><div class="tag">A private vinyl archive</div><form id="dwAuthForm"><div class="field"><label for="dwAuthEmail">Email</label><input id="dwAuthEmail" type="email" autocomplete="email" required></div><div class="field"><label for="dwAuthPassword">Password</label><input id="dwAuthPassword" type="password" autocomplete="current-password" required></div><div class="row"><button class="primary" id="dwSignIn" type="submit">Sign in</button><button id="dwSignUp" type="button">Sign up</button></div></form><div class="msg" id="dwAuthMsg">Sign in to load your collection from Supabase.</div></div>`;
    document.documentElement.appendChild(el);
    return el;
  }
  function msg(t){const m=document.getElementById('dwAuthMsg'); if(m)m.textContent=t;}
  async function requireSession(){
    const shell=ensureAuthShell();
    const {data}=await state.client.auth.getSession();
    if(data.session){state.session=data.session;state.user=data.session.user;shell.remove();return;}
    document.getElementById('dwAuthForm').onsubmit=async e=>{e.preventDefault(); msg('Signing in...'); const email=document.getElementById('dwAuthEmail').value.trim(); const password=document.getElementById('dwAuthPassword').value; const {data,error}=await state.client.auth.signInWithPassword({email,password}); if(error){msg(error.message);return;} state.session=data.session;state.user=data.user; shell.remove(); await bootAfterAuth();};
    document.getElementById('dwSignUp').onclick=async()=>{msg('Creating account...'); const email=document.getElementById('dwAuthEmail').value.trim(); const password=document.getElementById('dwAuthPassword').value; const {data,error}=await state.client.auth.signUp({email,password}); if(error){msg(error.message);return;} msg(data.session?'Account created. Loading...':'Account created. Check your email confirmation, then sign in.'); if(data.session){state.session=data.session;state.user=data.user;shell.remove(); await bootAfterAuth();}};
    await new Promise(resolve=>{ const iv=setInterval(()=>{ if(state.session){clearInterval(iv); resolve();}},150); });
  }
  async function selectAll(table, columns='*'){
    let from=0, size=1000, rows=[];
    while(true){ const {data,error}=await state.client.from(table).select(columns).range(from,from+size-1); if(error){ console.warn('Supabase select failed',table,error); return rows; } rows=rows.concat(data||[]); if(!data || data.length<size) break; from+=size; }
    return rows;
  }
  function colId(c){return String(c.source_id||c.id||c.name||'').trim();}
  function reactionToRating(r){ if(r===3||r==='3'||r==='favorite') return 3; if(r===2||r==='2'||r==='liked'||r===true) return 2; if(r===1||r==='1'||r==='disliked') return 1; return 0; }
  function recordToRec(row){
    const code=String(row.shelf_id||row.code||'').trim().toUpperCase();
    return { supabaseId:row.id, code, artist:row.artist||'', last:row.last||'', first:row.first||'', album:row.album||'', owned:Number(row.copies_owned||row.owned||1), note:row.note||'', img:row.img||row.cover_url||'', dgUrl:row.discogs_url||row.dgUrl||'', listened:!!row.listened, rating: reactionToRating(row.rating??row.reaction??(row.liked?2:0)), collections:(state.recordCollections.get(row.id)||row.collections||[]).map(String), listenedAt:row.listened_at||row.listenedAt||'', grail:!!row.grail, _supabase:true };
  }
  function recordToEntry(row, rec){
    const entry={ ts: Date.parse(row.updated_at||row.created_at||new Date())||Date.now(), empty: false };
    const id=row.discogs_id||row.discogsId||row.id_discogs; if(id) {entry.id=String(id); entry.discogsId=String(id);}
    if(row.discogs_type) entry.type=row.discogs_type;
    if(row.cover_url||row.coverUrl) entry.coverUrl=row.cover_url||row.coverUrl;
    if(row.genre) entry.genre=row.genre;
    if(Array.isArray(row.genres)) entry.genres=row.genres;
    if(Array.isArray(row.styles)) entry.styles=row.styles;
    if(Array.isArray(row.tracklist)) entry.tracklist=row.tracklist;
    if(row.discogs_url||row.dgUrl) entry.dgUrl=row.discogs_url||row.dgUrl;
    if(row.release_year||row.year) entry.year=Number(row.release_year||row.year)||null;
    if(row.label) entry.label=row.label;
    if(row.country) entry.country=row.country;
    if(!entry.coverUrl && rec.img) entry.coverUrl=rec.img;
    const has=Object.keys(entry).some(k=>!['ts','empty'].includes(k) && entry[k]!==null && entry[k]!=='' && !(Array.isArray(entry[k])&&!entry[k].length));
    if(!has) return {ts:entry.ts, empty:true};
    delete entry.empty; return entry;
  }
  async function loadUserDb(){
    const [collections, records, links] = await Promise.all([selectAll('collections'), selectAll('records'), selectAll('record_collections')]);
    state.collections=collections||[]; state.records=records||[]; state.recordCollections=new Map();
    const collById=new Map((collections||[]).map(c=>[String(c.id), colId(c)]));
    (links||[]).forEach(l=>{ const arr=state.recordCollections.get(l.record_id)||[]; arr.push(collById.get(String(l.collection_id))||String(l.collection_id)); state.recordCollections.set(l.record_id, arr); });
    const userCollections=(collections&&collections.length?collections:[{id:'dads-collection',name:"Dad's Collection",locked:false},{id:'augmented-collection',name:'Augmented Collection',locked:false}]).map(c=>({id:colId(c),name:c.name||c.id,locked:!!c.locked}));
    const customRecords=[]; const entries={};
    for(const row of records||[]){ const rec=recordToRec(row); customRecords.push(rec); const e=recordToEntry(row,rec); const code=rec.code; if(code) entries[`code:${code}`]=e; const key=`${rec.artist||''}|||${rec.album||''}`; entries[key]=e; if((e.id||e.discogsId) && (e.type||row.discogs_type)) entries[`discogs:${e.type||row.discogs_type||'release'}:${e.id||e.discogsId}`]=e; }
    window.VINYL_ARCHIVE_DISCOGS_DB={version:5,exportedAt:new Date().toISOString(),user:{id:state.user.id,name:state.user.email||'Current user',collections:userCollections},entries,recordOverrides:{},customRecords};
  }
  async function bootAfterAuth(){ await loadUserDb(); state.ready=true; }
  window.DW_SUPABASE_BOOT = async function(){
    if(!CONFIG.url || !CONFIG.anonKey){ console.warn('Missing Supabase config; running without remote data.'); return; }
    state.client = window.supabase.createClient(CONFIG.url, CONFIG.anonKey, {auth:{persistSession:true,autoRefreshToken:true}});
    await requireSession();
    if(!state.ready) await bootAfterAuth();
  };
})();
