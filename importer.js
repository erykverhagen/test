const SB = window.supabase.createClient(window.DEAD_WAX_SUPABASE.url, window.DEAD_WAX_SUPABASE.anonKey);
const $ = (s) => document.querySelector(s);
const state = { session:null, db:null, plan:null, report:[] };

function log(t){ $('#log').textContent = t || ''; }
function detail(t){ $('#details').textContent += `${t}\n`; $('#details').scrollTop = $('#details').scrollHeight; }
function clearDetails(){ $('#details').textContent=''; state.report=[]; }
function addReport(type,msg,obj){ const row={time:new Date().toISOString(),type,msg,obj:obj||null}; state.report.push(row); if(type !== 'debug') detail(`${type==='error'?'✗':type==='warn'?'!':'✓'} ${msg}`); }
function setProgress(done,total){ const pct = total ? Math.round((done/total)*100) : 0; $('#bar').style.width = `${Math.max(0,Math.min(100,pct))}%`; }
function showSummary(items){ $('#summary').innerHTML = items.map(([label,value]) => `<div class="summary-card"><strong>${value}</strong><span>${label}</span></div>`).join(''); }

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
function normalizeText(s){ return String(s ?? '').trim().replace(/\s+/g,' '); }
function normKey(artist, album){ return `${normalizeText(artist).toLowerCase()}|||${normalizeText(album).toLowerCase()}`; }
function splitEntryKey(key){ const parts=String(key).split('|||'); return {artist:normalizeText(parts[0] || 'Unknown Artist'), album:normalizeText(parts.slice(1).join('|||') || 'Unknown Album')}; }
function isImportableEntry(e){
  if(!e || e.empty === true) return false;
  return !!(e.id || e.coverUrl || e.dgUrl || e.tracklist || e.genre || e.genres || e.styles || e.year || e.label || e.country || e.code || e.shelfId || e.shelf_id);
}
function isMeaningfulOverride(o){
  if(!o) return false;
  const artist=normalizeText(o.artist||o.last||'');
  const album=normalizeText(o.album||'');
  if(!artist || !album) return false;
  return !!(o.code || o.dgUrl || o.img || o.note || o.listened || o.rating || o.grail || o.owned || o.copiesOwned || (Array.isArray(o.collections)&&o.collections.length));
}
function candidateFromMap(map, artist, album){ const nk=normKey(artist,album); if(!map.has(nk)) map.set(nk,{artist:normalizeText(artist)||'Unknown Artist',album:normalizeText(album)||'Unknown Album',entry:null,entryKey:null,override:null,overrideKey:null,custom:null}); return map.get(nk); }

function buildImportPlan(db){
  const entries=Object.entries(db.entries||{}); const overrides=Object.entries(db.recordOverrides||{}); const customs=Array.isArray(db.customRecords)?db.customRecords: Object.values(db.customRecords||{});
  const map=new Map(); let emptySkipped=0, enrichedEntries=0;
  for(const [entryKey,e] of entries){
    const {artist,album}=splitEntryKey(entryKey);
    if(e && e.empty === true){ emptySkipped++; continue; }
    if(!isImportableEntry(e)){ emptySkipped++; continue; }
    enrichedEntries++;
    const c=candidateFromMap(map,artist,album); c.entry=e; c.entryKey=entryKey;
  }
  let overridesMerged=0, overridesNew=0, overridesSkipped=0;
  for(const [overrideKey,o] of overrides){
    if(!isMeaningfulOverride(o)){ overridesSkipped++; continue; }
    const artist=normalizeText(o.artist||o.last||'Unknown Artist'); const album=normalizeText(o.album||'Unknown Album');
    const existed=map.has(normKey(artist,album)); const c=candidateFromMap(map,artist,album); c.override=o; c.overrideKey=overrideKey; existed?overridesMerged++:overridesNew++;
  }
  let customMerged=0, customNew=0;
  for(const cst of customs){
    if(!cst || (!cst.artist && !cst.album)) continue;
    const artist=normalizeText(cst.artist||'Unknown Artist'); const album=normalizeText(cst.album||'Unknown Album');
    const existed=map.has(normKey(artist,album)); const c=candidateFromMap(map,artist,album); c.custom=cst; existed?customMerged++:customNew++;
  }
  const candidates=[...map.values()].sort((a,b)=>`${a.artist} ${a.album}`.localeCompare(`${b.artist} ${b.album}`));
  const stats={
    dbVersion:db.version ?? 'unknown', exportedAt:db.exportedAt || 'unknown',
    entriesTotal:entries.length, emptySkipped, enrichedEntries,
    overridesTotal:overrides.length, overridesMerged, overridesNew, overridesSkipped,
    customTotal:customs.length, customMerged, customNew,
    uniqueToImport:candidates.length
  };
  return {stats,candidates};
}

function pick(...vals){ for(const v of vals){ if(v!==undefined && v!==null && v!=='') return v; } return null; }
function numOrNull(v){ if(v===undefined||v===null||v==='') return null; const n=Number(v); return Number.isFinite(n)?n:null; }
function toBool(v){ return v===true || v===1 || v==='1' || v==='true'; }
function ratingToLiked(v){ const n=Number(v); return Number.isFinite(n) ? n>0 : toBool(v); }
function yearValue(v){ const n=numOrNull(v); return n && n>0 ? n : null; }
function collectionIdsForCandidate(c){
  const ids=[]; for(const src of [c.override,c.custom,c.entry]){ if(!src) continue; const raw=src.collections||src.collectionIds||src.collection_ids||[]; if(Array.isArray(raw)) ids.push(...raw); }
  return [...new Set(ids.map(String).filter(Boolean))];
}
function candidateToRecord(c, uid){
  const base=c.entry||{}; const ov=c.override||{}; const custom=c.custom||{}; const merged={...base,...ov,...custom};
  const sourceKey = c.entryKey || c.overrideKey || normKey(c.artist,c.album);
  const raw_data={source_key:sourceKey, entry_key:c.entryKey, override_key:c.overrideKey, entry:c.entry, override:c.override, custom:c.custom};
  return {
    user_id:uid,
    artist:normalizeText(pick(custom.artist,ov.artist,c.artist,'Unknown Artist')),
    album:normalizeText(pick(custom.album,ov.album,c.album,'Unknown Album')),
    shelf_id:pick(custom.code,ov.code,base.code,base.shelfId,base.shelf_id),
    copies_owned:Math.max(1,Number(pick(custom.owned,custom.copiesOwned,ov.owned,ov.copiesOwned,base.owned,base.copiesOwned,1))||1),
    grail:toBool(pick(custom.grail,ov.grail,base.grail,false)),
    listened:toBool(pick(custom.listened,ov.listened,base.listened,false)),
    liked:ratingToLiked(pick(custom.liked,ov.liked,base.liked,custom.rating,ov.rating,base.rating,0)),
    reaction:pick(custom.reaction,ov.reaction,base.reaction,custom.rating,ov.rating,base.rating),
    listened_at:pick(custom.listenedAt,custom.listened_at,ov.listenedAt,ov.listened_at,base.listenedAt,base.listened_at),
    discogs_id:pick(base.id,custom.id,ov.id) ? String(pick(base.id,custom.id,ov.id)) : null,
    discogs_type:pick(base.type,custom.type,ov.type),
    cover_url:pick(base.coverUrl,base.cover_url,custom.coverUrl,custom.cover_url,custom.img,ov.coverUrl,ov.cover_url,ov.img),
    genre:pick(base.genre,custom.genre,ov.genre),
    genres:Array.isArray(pick(base.genres,custom.genres,ov.genres)) ? pick(base.genres,custom.genres,ov.genres) : [],
    styles:Array.isArray(pick(base.styles,custom.styles,ov.styles)) ? pick(base.styles,custom.styles,ov.styles) : [],
    tracklist:Array.isArray(pick(custom.tracklist,base.tracklist,ov.tracklist)) ? pick(custom.tracklist,base.tracklist,ov.tracklist) : [],
    discogs_url:pick(custom.dgUrl,custom.discogs_url,ov.dgUrl,ov.discogs_url,base.dgUrl,base.discogs_url),
    release_year:yearValue(pick(base.year,custom.year,ov.year)),
    label:pick(base.label,custom.label,ov.label),
    country:pick(base.country,custom.country,ov.country),
    source_key:sourceKey,
    raw_data
  };
}

function renderPlan(plan){
  const s=plan.stats;
  showSummary([
    ['entries in file',s.entriesTotal],['empty placeholders skipped',s.emptySkipped],['enriched entries',s.enrichedEntries],['record overrides',s.overridesTotal],['override-only records',s.overridesNew],['custom records',s.customTotal],['unique records to import',s.uniqueToImport]
  ]);
  detail(`DB version: ${s.dbVersion}`); detail(`Exported at: ${s.exportedAt}`); detail(`Unique Artist + Album records planned: ${s.uniqueToImport}`);
}
async function analyzeSelectedDb(){
  try{ clearDetails(); setProgress(0,1); log('Analyzing DB...'); const db=await readDbFile(); const plan=buildImportPlan(db); state.plan=plan; renderPlan(plan); setProgress(1,1); log(`Analysis complete: ${plan.stats.uniqueToImport} unique records ready for import.`); }
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
async function wipeMine(){
  if(!state.session) return log('Sign in first.');
  const ok=confirm('This deletes YOUR imported record rows, collection links, and collections from Supabase. It does not delete tables or other users. Continue?');
  if(!ok) return;
  try{
    clearDetails(); log('Wiping your imported data...'); setProgress(0,3); const uid=state.session.user.id;
    let r=await SB.from('record_collections').delete().eq('user_id',uid); if(r.error) throw r.error; setProgress(1,3); addReport('ok','Deleted your record/collection links.');
    r=await SB.from('records').delete().eq('user_id',uid); if(r.error) throw r.error; setProgress(2,3); addReport('ok','Deleted your records.');
    r=await SB.from('collections').delete().eq('user_id',uid); if(r.error) throw r.error; setProgress(3,3); addReport('ok','Deleted your collections.');
    await SB.from('change_log').insert({user_id:uid,action:'import_v3_wipe',before_data:null,after_data:{wiped_at:new Date().toISOString()}});
    log('Wipe complete. Change log history is kept because the current schema intentionally has no delete permission for change_log.');
  }catch(e){ log(`Wipe failed: ${e.message}`); addReport('error',`Wipe failed: ${e.message}`); }
}
function chunk(arr,size){ const out=[]; for(let i=0;i<arr.length;i+=size) out.push(arr.slice(i,i+size)); return out; }
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
      const {data,error}=await SB.from('records').upsert(batch,{onConflict:'user_id,artist,album'}).select('id,artist,album,source_key');
      if(error){ failed+=batch.length; addReport('error',`Batch ${i+1} failed: ${error.message}`,{batchStart:i*100,batchSize:batch.length}); }
      else { imported+=data.length; importedRows.push(...data); addReport('ok',`Batch ${i+1}: ${data.length} records upserted.`); }
      setProgress(i+1,batches.length+2);
    }
    const idByNorm=new Map(importedRows.map(r=>[normKey(r.artist,r.album),r.id]));
    let links=0, linkFail=0;
    const linkRows=[];
    for(const c of plan.candidates){
      const rid=idByNorm.get(normKey(c.artist,c.album)); if(!rid) continue;
      const colIds=collectionIdsForCandidate(c).map(x=>colMap.get(x)).filter(Boolean);
      for(const cid of [...new Set(colIds)]) linkRows.push({user_id:uid,record_id:rid,collection_id:cid});
    }
    for(const [idx,batch] of chunk(linkRows,250).entries()){
      if(!batch.length) continue;
      const {error}=await SB.from('record_collections').upsert(batch,{onConflict:'record_id,collection_id'});
      if(error){ linkFail+=batch.length; addReport('error',`Collection link batch ${idx+1} failed: ${error.message}`); }
      else { links+=batch.length; }
    }
    setProgress(batches.length+1,batches.length+2);
    const summary={expected_unique:records.length, imported, failed, collection_links:links, collection_link_failures:linkFail, skipped_empty_archive_placeholders:plan.stats.emptySkipped, enriched_entries:plan.stats.enrichedEntries, override_only_records:plan.stats.overridesNew, db_version:db.version, exported_at:db.exportedAt, imported_at:new Date().toISOString()};
    const {error:logErr}=await SB.from('change_log').insert({user_id:uid,action:'import_v3_unique_nonempty_records_only',before_data:null,after_data:summary});
    if(logErr) addReport('warn',`Import summary change_log failed: ${logErr.message}`); else addReport('ok','Import summary written to change_log.');
    setProgress(1,1); showSummary([['expected unique',records.length],['records imported/upserted',imported],['failed',failed],['collection links',links],['link failures',linkFail]]);
    log(`Import v3 complete: ${imported}/${records.length} records imported, ${failed} failed.`);
  }catch(e){ log(`Import failed: ${e.message}`); addReport('error',`Import failed: ${e.message}`); }
}
function downloadReport(){
  const blob=new Blob([JSON.stringify({generated_at:new Date().toISOString(),summary:state.plan?.stats||null,report:state.report},null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='dead_wax_import_v3_report.json'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}
init();
