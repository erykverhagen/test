
(function(){
  function state(){return window.DW_SUPABASE_STATE||{};}
  function client(){return state().client;}
  function user(){return state().user;}
  function ratingToReaction(r){r=Number(r||0); if(r>=3)return 'favorite'; if(r===2)return 'liked'; if(r===1)return 'disliked'; return null;}
  function recPayload(rec){
    return { user_id:user().id, artist:rec.artist||'', album:rec.album||'', shelf_id:rec.code||null, copies_owned:Number(rec.owned||1), note:rec.note||null, cover_url:rec.img||rec.coverUrl||null, discogs_url:rec.dgUrl||rec.discogs_url||null, listened:!!rec.listened, liked:Number(rec.rating||0)>=2, reaction:ratingToReaction(rec.rating), listened_at:rec.listenedAt||null, grail:!!rec.grail, genre:rec.genre||null, genres:Array.isArray(rec.genres)?rec.genres:[], styles:Array.isArray(rec.styles)?rec.styles:[], tracklist:Array.isArray(rec.tracklist)?rec.tracklist:[], discogs_id:rec.discogsId||rec.id||null, discogs_type:rec.type||null, release_year:rec.year?Number(rec.year):null, label:rec.label||null, country:rec.country||null, source_key:rec.code?`code:${rec.code}`:null, raw_data:rec };
  }

  function hasDg(dg){
    return !!(dg && !dg.empty && (dg.coverUrl || dg.genre || (Array.isArray(dg.styles)&&dg.styles.length) || (Array.isArray(dg.genres)&&dg.genres.length) || (Array.isArray(dg.tracklist)&&dg.tracklist.length) || dg.dgUrl || dg.id));
  }
  function mergeDiscogsIntoRecord(rec, dg){
    if(!rec || !hasDg(dg)) return rec;
    if(dg.id!=null){ rec.discogsId=String(dg.id); if(!rec.id) rec.id=String(dg.id); }
    if(dg.type) rec.type=dg.type;
    if(dg.coverUrl) rec.coverUrl=dg.coverUrl;
    if(dg.genre) rec.genre=dg.genre;
    if(Array.isArray(dg.genres)) rec.genres=dg.genres;
    if(Array.isArray(dg.styles)) rec.styles=dg.styles;
    if(Array.isArray(dg.tracklist)) rec.tracklist=dg.tracklist;
    if(dg.dgUrl) rec.dgUrl=dg.dgUrl;
    if(dg.year!==undefined && dg.year!==null && dg.year!=='') rec.year=Number(dg.year)||dg.year;
    if(dg.label) rec.label=dg.label;
    if(dg.country) rec.country=dg.country;
    rec._discogsMergedAt=new Date().toISOString();
    return rec;
  }
  function findRecordForDiscogsKey(key){
    try{
      if(typeof getAll!=='function') return null;
      const all=getAll()||[];
      return all.find(rec=>{
        if(!rec) return false;
        if(typeof discogsAliasKeysForRec==='function'){
          try{ if(discogsAliasKeysForRec(rec).includes(key)) return true; }catch(e){}
        }
        if(typeof cacheKey==='function'){
          try{ if(cacheKey(rec)===key) return true; }catch(e){}
        }
        const code=String(rec.code||rec.shelf_id||'').trim().toUpperCase();
        if(code && key===`code:${code}`) return true;
        const dgUrl=String(rec.dgUrl||rec.discogs_url||'');
        const m=dgUrl.match(/discogs\.com\/(release|master)\/(\d+)/i);
        if(m && key===`discogs:${m[1]}:${m[2]}`) return true;
        return false;
      })||null;
    }catch(e){ return null; }
  }
  function persistDiscogsForKey(key, dg){
    if(!hasDg(dg)) return;
    const rec=findRecordForDiscogsKey(key);
    if(!rec) return;
    mergeDiscogsIntoRecord(rec,dg);
    upsertRecord(rec,'discogs_enrichment');
  }
  function installDiscogsPersistenceHooks(){
    try{
      if(typeof window.idbSet==='function' && !window.idbSet.__dwSupabasePersist){
        const orig=window.idbSet;
        window.idbSet=function(key,val){
          const stored=orig.apply(this,arguments);
          try{ persistDiscogsForKey(key, stored||val); }catch(e){ console.warn('Dead Wax Supabase Discogs persistence failed', e); }
          return stored;
        };
        window.idbSet.__dwSupabasePersist=true;
      }
    }catch(e){ console.warn(e); }
    try{
      if(typeof window.onDgLoaded==='function' && !window.onDgLoaded.__dwSupabasePersist){
        const orig=window.onDgLoaded;
        window.onDgLoaded=function(rec,dg){
          try{ if(hasDg(dg)){ mergeDiscogsIntoRecord(rec,dg); upsertRecord(rec,'discogs_enrichment'); } }catch(e){ console.warn('Dead Wax Supabase onDgLoaded persistence failed', e); }
          return orig.apply(this,arguments);
        };
        window.onDgLoaded.__dwSupabasePersist=true;
      }
    }catch(e){ console.warn(e); }
  }

  async function upsertRecord(rec, action='upsert'){
    if(!client()||!user()||!rec) return;
    try{
      const payload=recPayload(rec);
      let res;
      if(rec.supabaseId){ res=await client().from('records').update(payload).eq('id',rec.supabaseId).select().single(); }
      else { res=await client().from('records').upsert(payload,{onConflict:'user_id,shelf_id'}).select().single(); }
      if(res.error) throw res.error;
      rec.supabaseId=res.data.id;
      await client().from('change_log').insert({user_id:user().id,record_id:res.data.id,action,before_data:null,after_data:payload});
    }catch(e){ console.warn('Dead Wax Supabase save failed', e); }
  }
  window.DW_SUPABASE_MERGE_DISCOGS_INTO_RECORD=mergeDiscogsIntoRecord;
  window.DW_SUPABASE_PERSIST_DISCOGS_FOR_KEY=persistDiscogsForKey;
  window.DW_SUPABASE_DELETE_RECORD=async function(rec){
    if(!client()||!user()||!rec) return;
    try{
      if(rec.supabaseId) await client().from('records').delete().eq('id',rec.supabaseId);
      else if(rec.code) await client().from('records').delete().eq('user_id',user().id).eq('shelf_id',rec.code);
      await client().from('change_log').insert({user_id:user().id,record_id:rec.supabaseId||null,action:'delete',before_data:rec,after_data:null});
    }catch(e){ console.warn('Dead Wax Supabase delete failed', e); }
  };
  window.DW_SUPABASE_UPSERT_RECORD=upsertRecord;
  function hook(){
    installDiscogsPersistenceHooks();
    if(typeof saveCustom==='function' && !saveCustom.__dwSupabase){ const orig=saveCustom; saveCustom=function(){ orig(); try{ customRecs.forEach(r=>upsertRecord(r,'save_custom')); }catch(e){console.warn(e)} }; saveCustom.__dwSupabase=true; }
    if(typeof saveOv==='function' && !saveOv.__dwSupabase){ const orig=saveOv; saveOv=function(){ orig(); try{ Object.values(overrides||{}).forEach(r=>upsertRecord(r,'save_override')); }catch(e){console.warn(e)} }; saveOv.__dwSupabase=true; }
    if(typeof removeRecord==='function' && !removeRecord.__dwSupabase){ const orig=removeRecord; removeRecord=function(idx){ try{ const rec=getRec(idx); window.DW_SUPABASE_DELETE_RECORD?.(rec); }catch(e){console.warn(e)} return orig(idx); }; removeRecord.__dwSupabase=true; }
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>setTimeout(hook,0)); else setTimeout(hook,0);
})();
