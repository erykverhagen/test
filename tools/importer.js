const SB = window.supabase.createClient(window.DEAD_WAX_SUPABASE.url, window.DEAD_WAX_SUPABASE.anonKey);
const $ = (s) => document.querySelector(s);
const state = { session:null, db:null, plan:null, report:[] };

function log(t){ $('#log').textContent = t || ''; }
function detail(t){ $('#details').textContent += `${t}\n`; $('#details').scrollTop = $('#details').scrollHeight; }
function clearDetails(){ $('#details').textContent=''; state.report=[]; }
function addReport(type,msg,obj){ const row={time:new Date().toISOString(),type,msg,obj:obj||null}; state.report.push(row); if(type !== 'debug') detail(`${type==='error'?'✗':type==='warn'?'!':'✓'} ${msg}`); }
function setProgress(done,total){ const pct = total ? Math.round((done/total)*100) : 0; $('#bar').style.width = `${Math.max(0,Math.min(100,pct))}%`; }
function showSummary(items){ $('#summary').innerHTML = items.map(([label,value]) => `<div class="summary-card"><strong>${value}</strong><span>${label}</span></div>`).join(''); }
function normalizeText(s){ return String(s ?? '').trim().replace(/\s+/g,' '); }
function normKey(artist, album){ return `${normalizeText(artist).toLowerCase()}|||${normalizeText(album).toLowerCase()}`; }
function splitEntryKey(key){ const parts=String(key).replace(/^fallback(?::fallback(?::fallback)?)?:/,'').split('|||'); return {artist:normalizeText(parts[0] || ''), album:normalizeText(parts.slice(1).join('|||') || '')}; }
function codeValue(v){ return normalizeText(v).toUpperCase(); }
function pick(...vals){ for(const v of vals){ if(v!==undefined && v!==null && v!=='' && !(Array.isArray(v)&&!v.length)) return v; } return null; }
function toBool(v){ return v===true || v===1 || v==='1' || v==='true'; }
function ratingToReaction(r){ r=Number(r||0); if(r>=3) return 'favorite'; if(r===2) return 'liked'; if(r===1) return 'disliked'; return null; }
function yearValue(v){ const n=Number(v); return Number.isFinite(n) && n>0 ? n : null; }
function discogsIdFromUrl(url){ const m=String(url||'').match(/discogs\.com\/(?:[^/]+\/)?(release|master)\/(\d+)/i); return m?{type:m[1].toLowerCase(),id:m[2]}:null; }
function hasMetadata(e){ return !!(e && !e.empty && (e.id || e.discogsId || e.coverUrl || e.genre || (Array.isArray(e.tracklist)&&e.tracklist.length) || e.dgUrl || e.year || e.label || e.country)); }

async function init(){
  const {data} = await SB.auth.getSession(); state.session=data.session;
  SB.auth.onAuthStateChange((_event, session)=>{ state.session=session; showAuth(); });
  $('#signin').onclick=signIn; $('#signout').onclick=signOut; $('#analyzeBtn').onclick=analyzeSelectedDb;
  $('#wipeBtn').onclick=wipeMine; $('#importBtn').onclick=importSelectedDb; $('#downloadReportBtn').onclick=downloadReport;
  showAuth();
}
function showAuth(){ const on=!!state.session; $('#authBox').classList.toggle('hidden',on); $('#importBox').classList.toggle('hidden',!on); if(on) $('#who').textContent=state.session.user.email || state.session.user.id; }
async function signIn(){ log('Signing in...'); const {data,error}=await SB.auth.signInWithPassword({email:$('#email').value.trim(),password:$('#password').value}); if(error){log(`Sign-in failed: ${error.message}`);return} state.session=data.session; log('Signed in.'); showAuth(); }
async function signOut(){ log('Signing out...'); await SB.auth.signOut(); state.session=null; showAuth(); log('Signed out.'); }

async function readDbFile(){
  const file=$('#dbFile').files[0];
  if(!file) throw new Error('Choose your local dead_wax_db.js file first.');
  const txt=await file.text();
  const win={};
  const db = Function('window', `${txt}\n; return window.VINYL_ARCHIVE_DISCOGS_DB;`)(win);
  if(!db || !db.entries) throw new Error('Could not find window.VINYL_ARCHIVE_DISCOGS_DB.entries in that file.');
  state.db=db; return db;
}
function allShelfRecords(db){
  const rows=[];
  for(const [key,o] of Object.entries(db.recordOverrides||{})){
    const code=codeValue(o.code || key);
    if(!code) continue;
    rows.push({kind:'override',key,code,record:o});
  }
  const customs = Array.isArray(db.customRecords) ? db.customRecords.map((r,i)=>[String(i),r]) : Object.entries(db.customRecords||{});
  for(const [key,o] of customs){
    const code=codeValue(o && o.code);
    if(!code) continue;
    rows.push({kind:'custom',key,code,record:o});
  }
  const byCode=new Map();
  for(const row of rows) byCode.set(row.code,row);
  return [...byCode.values()].sort((a,b)=>a.code.localeCompare(b.code,undefined,{numeric:true}));
}
function buildIndexes(db){
  const byCode=new Map(), byDiscogs=new Map(), byArtistAlbum=new Map();
  let fallback=0, codeEntries=0, nonEmpty=0;
  for(const [key,e] of Object.entries(db.entries||{})){
    if(/^fallback(?::fallback(?::fallback)?)?:/.test(key)) fallback++;
    if(/^code:/i.test(key)){ codeEntries++; byCode.set(codeValue(key.slice(5)), e); }
    if(hasMetadata(e)){
      nonEmpty++;
      const did=pick(e.id,e.discogsId); const dtype=pick(e.type,e.discogs_type);
      if(did) byDiscogs.set(`${String(dtype||'release').toLowerCase()}:${String(did)}`, e);
      const fromUrl=discogsIdFromUrl(e.dgUrl || e.discogs_url);
      if(fromUrl) byDiscogs.set(`${fromUrl.type}:${fromUrl.id}`, e);
      const {artist,album}=splitEntryKey(key);
      if(artist && album) byArtistAlbum.set(normKey(artist,album), e);
    }
  }
  return {byCode,byDiscogs,byArtistAlbum,stats:{entriesTotal:Object.keys(db.entries||{}).length,fallback,codeEntries,nonEmpty}};
}
function metadataForShelf(row, idx){
  const codeMeta=idx.byCode.get(row.code);
  if(hasMetadata(codeMeta)) return {metadata:codeMeta, source:`code:${row.code}`, method:'code'};
  const urlInfo=discogsIdFromUrl(row.record.dgUrl || row.record.discogs_url);
  if(urlInfo){
    const via=idx.byDiscogs.get(`${urlInfo.type}:${urlInfo.id}`) || idx.byDiscogs.get(`release:${urlInfo.id}`) || idx.byDiscogs.get(`master:${urlInfo.id}`);
    if(hasMetadata(via)) return {metadata:via, source:`discogs:${urlInfo.type}:${urlInfo.id}`, method:'discogs_url'};
  }
  const aa=idx.byArtistAlbum.get(normKey(row.record.artist||row.record.last,row.record.album));
  if(hasMetadata(aa)) return {metadata:aa, source:`${row.record.artist}|||${row.record.album}`, method:'artist_album'};
  return {metadata:codeMeta||{}, source:`code:${row.code}`, method:'shelf_only'};
}
function buildImportPlan(db){
  const shelf=allShelfRecords(db);
  const idx=buildIndexes(db);
  const candidates=[]; const counts={code:0,discogs_url:0,artist_album:0,shelf_only:0,withTracklist:0,withCover:0,withGenre:0,withDgUrl:0};
  for(const row of shelf){
    const found=metadataForShelf(row,idx);
    counts[found.method]++;
    const meta=found.metadata||{};
    if(Array.isArray(meta.tracklist)&&meta.tracklist.length) counts.withTracklist++;
    if(meta.coverUrl||meta.cover_url) counts.withCover++;
    if(meta.genre) counts.withGenre++;
    if(meta.dgUrl||meta.discogs_url||row.record.dgUrl) counts.withDgUrl++;
    candidates.push({...row, metadata:meta, metadataSource:found.source, matchMethod:found.method});
  }
  return {stats:{dbVersion:db.version??'unknown',exportedAt:db.exportedAt||'unknown',shelfIdRecords:shelf.length,recordOverrides:Object.keys(db.recordOverrides||{}).length,customRecords:Array.isArray(db.customRecords)?db.customRecords.length:Object.keys(db.customRecords||{}).length,...idx.stats,...counts},candidates};
}
function renderPlan(plan){
  const s=plan.stats;
  showSummary([
    ['Shelf ID records',s.shelfIdRecords],['code entries',s.codeEntries],['matched by code',s.code],['other matches',s.discogs_url+s.artist_album],['shelf-only / not found',s.shelf_only],['with tracklist',s.withTracklist],['with cover',s.withCover],['fallback entries ignored',s.fallback]
  ]);
  detail(`DB version: ${s.dbVersion}`); detail(`Exported at: ${s.exportedAt}`); detail(`Shelf ID records planned: ${s.shelfIdRecords}`);
}
async function analyzeSelectedDb(){
  try{ clearDetails(); setProgress(0,1); log('Analyzing DB...'); const db=await readDbFile(); const plan=buildImportPlan(db); state.plan=plan; renderPlan(plan); setProgress(1,1); log(`Analysis complete: ${plan.stats.shelfIdRecords} Shelf ID records ready.`); }
  catch(e){ log(`Analysis failed: ${e.message}`); addReport('error',e.message); }
}
async function ensurePlan(){ if(!state.plan){ const db=await readDbFile(); state.plan=buildImportPlan(db); renderPlan(state.plan); } return state.plan; }
async function ensureCollections(db){
  const uid=state.session.user.id; const map=new Map();
  const source=(db.user&&Array.isArray(db.user.collections))?db.user.collections:[];
  const needed=[...source];
  if(!needed.some(c=>c.id==='imported')) needed.push({id:'imported',name:'Imported Records',locked:false});
  for(const c of needed){
    const name=normalizeText(c.name||c.id||'Imported Collection');
    const {data,error}=await SB.from('collections').upsert({user_id:uid,name,locked:!!c.locked,source_id:c.id||name},{onConflict:'user_id,name'}).select('id,name,source_id').single();
    if(error) throw new Error(`Collection ${name}: ${error.message}`);
    map.set(String(c.id||name),data.id); map.set(name,data.id);
  }
  return map;
}
function collectionIdsForCandidate(c){
  const ids=[];
  for(const src of [c.record,c.metadata]){ if(!src) continue; const raw=src.collections||src.collectionIds||src.collection_ids||[]; if(Array.isArray(raw)) ids.push(...raw); }
  return [...new Set(ids.map(String).filter(Boolean))];
}
function candidateToRecord(c,uid){
  const ov=c.record||{}, m=c.metadata||{};
  const rating=Number(pick(ov.rating,m.rating,0)||0);
  const dgUrl=pick(ov.dgUrl,ov.discogs_url,m.dgUrl,m.discogs_url);
  const discogsId=pick(m.discogsId,m.id,ov.discogsId,ov.id);
  const raw_data={shelf_record:ov,metadata:m,metadata_source:c.metadataSource,match_method:c.matchMethod,kind:c.kind};
  return {
    user_id:uid,
    artist:normalizeText(pick(ov.artist,m.artist,ov.last,'Unknown Artist')),
    album:normalizeText(pick(ov.album,m.album,'Unknown Album')),
    shelf_id:c.code,
    copies_owned:Math.max(1,Number(pick(ov.owned,ov.copiesOwned,m.owned,m.copiesOwned,1))||1),
    note:pick(ov.note,m.note),
    grail:toBool(pick(ov.grail,m.grail,false)),
    listened:toBool(pick(ov.listened,m.listened,false)),
    liked:rating>=2 || toBool(pick(ov.liked,m.liked,false)),
    reaction:ratingToReaction(rating) || pick(ov.reaction,m.reaction),
    listened_at:pick(ov.listenedAt,ov.listened_at,m.listenedAt,m.listened_at),
    discogs_id:discogsId ? String(discogsId) : null,
    discogs_type:pick(m.type,m.discogs_type,ov.type,ov.discogs_type),
    cover_url:pick(ov.img,ov.coverUrl,ov.cover_url,m.coverUrl,m.cover_url,m.img),
    genre:pick(m.genre,ov.genre),
    genres:Array.isArray(pick(m.genres,ov.genres)) ? pick(m.genres,ov.genres) : [],
    styles:Array.isArray(pick(m.styles,ov.styles)) ? pick(m.styles,ov.styles) : [],
    tracklist:Array.isArray(pick(ov.tracklist,m.tracklist)) ? pick(ov.tracklist,m.tracklist) : [],
    discogs_url:dgUrl,
    release_year:yearValue(pick(m.year,ov.year)),
    label:pick(m.label,ov.label),
    country:pick(m.country,ov.country),
    source_key:`code:${c.code}`,
    raw_data
  };
}
function chunk(arr,size){ const out=[]; for(let i=0;i<arr.length;i+=size) out.push(arr.slice(i,i+size)); return out; }
async function wipeMine(){
  if(!state.session) return log('Sign in first.');
  const ok=confirm('This deletes YOUR Dead Wax records, record/collection links, and collections from Supabase. Continue?');
  if(!ok) return;
  try{
    clearDetails(); log('Wiping your Supabase records...'); setProgress(0,3); const uid=state.session.user.id;
    let r=await SB.from('record_collections').delete().eq('user_id',uid); if(r.error) throw r.error; setProgress(1,3); addReport('ok','Deleted record/collection links.');
    r=await SB.from('records').delete().eq('user_id',uid); if(r.error) throw r.error; setProgress(2,3); addReport('ok','Deleted records.');
    r=await SB.from('collections').delete().eq('user_id',uid); if(r.error) throw r.error; setProgress(3,3); addReport('ok','Deleted collections.');
    await SB.from('change_log').insert({user_id:uid,action:'shelf_import_wipe',before_data:null,after_data:{wiped_at:new Date().toISOString()}});
    log('Wipe complete.');
  }catch(e){ log(`Wipe failed: ${e.message}`); addReport('error',`Wipe failed: ${e.message}`); }
}
async function importSelectedDb(){
  if(!state.session) return log('Sign in first.');
  try{
    clearDetails(); log('Preparing import...'); setProgress(0,1);
    const db=state.db || await readDbFile(); const plan=await ensurePlan(); const uid=state.session.user.id;
    renderPlan(plan); const colMap=await ensureCollections(db); addReport('ok','Collections prepared.');
    const records=plan.candidates.map(c=>candidateToRecord(c,uid)); const batches=chunk(records,100);
    let imported=0, failed=0; const importedRows=[];
    for(let i=0;i<batches.length;i++){
      const batch=batches[i]; log(`Importing records batch ${i+1}/${batches.length}...`);
      const {data,error}=await SB.from('records').upsert(batch,{onConflict:'user_id,shelf_id'}).select('id,artist,album,shelf_id');
      if(error){ failed+=batch.length; addReport('error',`Batch ${i+1} failed: ${error.message}`,{batchStart:i*100,batchSize:batch.length}); }
      else { imported+=data.length; importedRows.push(...data); addReport('ok',`Batch ${i+1}: ${data.length} Shelf ID records upserted.`); }
      setProgress(i+1,batches.length+2);
    }
    const idByCode=new Map(importedRows.map(r=>[codeValue(r.shelf_id),r.id]));
    const linkRows=[];
    for(const c of plan.candidates){
      const rid=idByCode.get(c.code); if(!rid) continue;
      const colIds=collectionIdsForCandidate(c).map(x=>colMap.get(x)).filter(Boolean);
      for(const cid of [...new Set(colIds)]) linkRows.push({user_id:uid,record_id:rid,collection_id:cid});
    }
    let links=0, linkFail=0;
    for(const [idx,batch] of chunk(linkRows,250).entries()){
      if(!batch.length) continue;
      const {error}=await SB.from('record_collections').upsert(batch,{onConflict:'record_id,collection_id'});
      if(error){ linkFail+=batch.length; addReport('error',`Collection link batch ${idx+1} failed: ${error.message}`); }
      else links+=batch.length;
    }
    setProgress(batches.length+1,batches.length+2);
    const summary={expected_shelf_records:records.length, imported, failed, collection_links:links, collection_link_failures:linkFail, stats:plan.stats, imported_at:new Date().toISOString()};
    const {error:logErr}=await SB.from('change_log').insert({user_id:uid,action:'shelf_id_code_metadata_import',before_data:null,after_data:summary});
    if(logErr) addReport('warn',`Import summary change_log failed: ${logErr.message}`); else addReport('ok','Import summary written to change_log.');
    setProgress(1,1); showSummary([['Shelf ID records',records.length],['upserted',imported],['failed',failed],['collection links',links],['link failures',linkFail],['shelf-only',plan.stats.shelf_only]]);
    log(`Import complete: ${imported}/${records.length} records imported, ${failed} failed.`);
  }catch(e){ log(`Import failed: ${e.message}`); addReport('error',`Import failed: ${e.message}`); }
}
function downloadReport(){
  const blob=new Blob([JSON.stringify({generated_at:new Date().toISOString(),summary:state.plan?.stats||null,report:state.report},null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='dead_wax_shelf_id_import_report.json'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}
init();
