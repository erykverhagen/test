(function(){
  function state(){return window.DW_SUPABASE_STATE||{};}
  function client(){return state().client;}
  function user(){return state().user;}
  function ratingToReaction(r){r=Number(r||0); if(r>=3)return 'favorite'; if(r===2)return 'liked'; if(r===1)return 'disliked'; return null;}
  function cleanArray(v){return Array.isArray(v)?v:[];}
  function yearValue(v){ if(v===undefined||v===null||v==='') return null; const n=Number(v); return Number.isFinite(n)?n:null; }
  function shelfId(rec){return String(rec?.shelf_id||rec?.code||'').trim().toUpperCase()||null;}
  function hasDg(dg){return !!(dg && !dg.empty && (dg.coverUrl || dg.cover_url || dg.genre || cleanArray(dg.styles).length || cleanArray(dg.genres).length || cleanArray(dg.tracklist).length || dg.dgUrl || dg.discogs_url || dg.id || dg.discogsId));}
  function mergeDiscogsIntoRecord(rec, dg){
    if(!rec || !hasDg(dg)) return rec;
    const id=dg.discogsId ?? dg.id ?? dg.discogs_id;
    if(id!=null){ rec.discogsId=String(id); if(!rec.id) rec.id=String(id); }
    if(dg.type||dg.discogs_type) rec.type=dg.type||dg.discogs_type;
    if(dg.coverUrl||dg.cover_url) rec.coverUrl=dg.coverUrl||dg.cover_url;
    if(dg.genre) rec.genre=dg.genre;
    if(Array.isArray(dg.genres)) rec.genres=dg.genres;
    if(Array.isArray(dg.styles)) rec.styles=dg.styles;
    if(Array.isArray(dg.tracklist)) rec.tracklist=dg.tracklist;
    if(dg.dgUrl||dg.discogs_url) rec.dgUrl=dg.dgUrl||dg.discogs_url;
    if(dg.year!==undefined || dg.release_year!==undefined) rec.year=yearValue(dg.year??dg.release_year) ?? (dg.year??dg.release_year);
    if(dg.label) rec.label=dg.label;
    if(dg.country) rec.country=dg.country;
    rec._discogsMergedAt=new Date().toISOString();
    return rec;
  }
  function recPayload(rec){
    const code=shelfId(rec);
    const rating=Number(rec.rating||0);
    return {
      user_id:user().id,
      artist:rec.artist||'',
      album:rec.album||'',
      shelf_id:code,
      copies_owned:Number(rec.owned||rec.copies_owned||1)||1,
      note:rec.note||null,
      grail:!!rec.grail,
      listened:!!rec.listened,
      liked:rating>=2 || !!rec.liked,
      reaction:ratingToReaction(rating)||rec.reaction||null,
      listened_at:rec.listenedAt||rec.listened_at||null,
      discogs_id:rec.discogsId||rec.id||rec.discogs_id||null,
      discogs_type:rec.type||rec.discogs_type||null,
      cover_url:rec.img||rec.coverUrl||rec.cover_url||null,
      genre:rec.genre||null,
      genres:cleanArray(rec.genres),
      styles:cleanArray(rec.styles),
      tracklist:cleanArray(rec.tracklist),
      discogs_url:rec.dgUrl||rec.discogs_url||null,
      release_year:yearValue(rec.year||rec.release_year),
      label:rec.label||null,
      country:rec.country||null,
      source_key:code?`code:${code}`:null,
      raw_data:rec
    };
  }
  async function logChange(recordId, action, after){
    try{ await client().from('change_log').insert({user_id:user().id,record_id:recordId||null,action,before_data:null,after_data:after}); }catch(e){ console.warn('Dead Wax change_log failed',e); }
  }
  async function upsertRecord(rec, action='upsert'){
    if(!client()||!user()||!rec) return null;
    const payload=recPayload(rec);
    let res;
    if(rec.supabaseId){
      res=await client().from('records').update(payload).eq('id',rec.supabaseId).eq('user_id',user().id).select('id,shelf_id,artist,album').maybeSingle();
      if(!res.error && res.data){ await logChange(res.data.id,action,payload); return res.data; }
    }
    if(!payload.shelf_id){ console.warn('Dead Wax Supabase save skipped: no Shelf ID', rec); return null; }
    res=await client().from('records').upsert(payload,{onConflict:'user_id,shelf_id'}).select('id,shelf_id,artist,album').single();
    if(res.error){ console.warn('Dead Wax Supabase save failed',res.error,payload); throw res.error; }
    rec.supabaseId=res.data.id;
    await logChange(res.data.id,action,payload);
    return res.data;
  }
  async function saveDiscogsResult(rec,dg,key){
    if(!hasDg(dg)) return null;
    mergeDiscogsIntoRecord(rec,dg);
    const saved=await upsertRecord(rec,'discogs_enrichment');
    console.info('Dead Wax Supabase: persisted Discogs enrichment', {shelf_id:shelfId(rec), key, saved});
    return saved;
  }
  function findRecordForDiscogsKey(key){
    try{
      if(typeof getAll!=='function') return null;
      const all=getAll()||[];
      return all.find(rec=>{
        if(!rec) return false;
        const code=shelfId(rec);
        if(code && key===`code:${code}`) return true;
        if(typeof discogsAliasKeysForRec==='function'){
          try{ if(discogsAliasKeysForRec(rec).includes(key)) return true; }catch(e){}
        }
        if(typeof cacheKey==='function'){
          try{ if(cacheKey(rec)===key) return true; }catch(e){}
        }
        const dgUrl=String(rec.dgUrl||rec.discogs_url||'');
        const m=dgUrl.match(/discogs\.com\/(release|master)\/(\d+)/i);
        if(m && key===`discogs:${m[1]}:${m[2]}`) return true;
        return false;
      })||null;
    }catch(e){ return null; }
  }
  function installIdbFallbackHook(){
    try{
      if(typeof window.idbSet==='function' && !window.idbSet.__dwSupabasePersistV5){
        const orig=window.idbSet;
        window.idbSet=function(key,val){
          const stored=orig.apply(this,arguments);
          try{ const rec=findRecordForDiscogsKey(key); if(rec) saveDiscogsResult(rec,stored||val,key); }catch(e){ console.warn('Dead Wax Supabase idb persistence failed', e); }
          return stored;
        };
        window.idbSet.__dwSupabasePersistV5=true;
      }
    }catch(e){ console.warn(e); }
  }
  window.DW_SUPABASE_MERGE_DISCOGS_INTO_RECORD=mergeDiscogsIntoRecord;
  window.DW_SUPABASE_SAVE_DISCOGS_RESULT=saveDiscogsResult;
  window.DW_SUPABASE_PERSIST_DISCOGS_FOR_KEY=function(key,dg){ const rec=findRecordForDiscogsKey(key); if(rec) return saveDiscogsResult(rec,dg,key); };
  window.DW_SUPABASE_UPSERT_RECORD=upsertRecord;
  window.DW_SUPABASE_DELETE_RECORD=async function(rec){
    if(!client()||!user()||!rec) return;
    try{
      const code=shelfId(rec);
      let q=client().from('records').delete().eq('user_id',user().id);
      if(rec.supabaseId) q=q.eq('id',rec.supabaseId); else if(code) q=q.eq('shelf_id',code); else return;
      await q;
      await logChange(rec.supabaseId||null,'delete',null);
    }catch(e){ console.warn('Dead Wax Supabase delete failed', e); }
  };
  function hook(){ installIdbFallbackHook(); }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>setTimeout(hook,0)); else setTimeout(hook,0);
})();
