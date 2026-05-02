
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
    collectionLinks: [],
    filtered: [],
    view: 'grid',
    group: 'shelf',
    secondary: 'artist',
    currentId: null,
    random: false,
    cfIndex: 0,
    cfActiveId: null,
    cfPos: 0,
    cfFlipId: null,
    cfTurnLock: false,
    cfWheelAccum: 0,
    cfManualQueue: 0,
    cfMomentumPower: 0,
    cfMomentumDir: 0,
    cfVelocity: 0,
    collapsed: new Set(),
    filters: {global:'', code:'', artist:'', last:'', first:'', album:'', genre:'', listened:false, doubles:false, rating:'', lastListened:'', grail:false}
  };

  function esc(v){ return String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function arr(v){ return Array.isArray(v) ? v : (typeof v === 'string' && v.trim().startsWith('[') ? JSON.parse(v) : []); }
  function norm(s){ return String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim(); }
  const RECORD_CABINET_ID = 'record-cabinet';
  function isRecordCabinet(v){ const n=norm(typeof v==='string'?v:(v?.name||v?.id||'')); return n==='record cabinet' || n==='record-cabinet' || n==='recordcabinet'; }
  function visibleCollections(cols){ return arr(cols).filter(c => !isRecordCabinet(c)); }
  function visibleCollectionRows(cols){ return arr(cols).filter(c => !isRecordCabinet(c)); }
  function internalCollections(cols){
    const out=[];
    for(const c of arr(cols)){
      const v = typeof c === 'string' ? c : (c?.id || c?.name || '');
      if(!v) continue;
      if(isRecordCabinet(v)){
        if(!out.includes(RECORD_CABINET_ID)) out.push(RECORD_CABINET_ID);
      }else if(!out.includes(v)){
        out.push(v);
      }
    }
    if(!out.includes(RECORD_CABINET_ID)) out.unshift(RECORD_CABINET_ID);
    return out;
  }
  function shelfParts(id){ const m=String(id||'').match(/^([A-Za-z]+)\s*0*([0-9]+)(.*)$/); return m ? [m[1].toUpperCase(), parseInt(m[2],10), m[3]||''] : [String(id||'~'), 999999, '']; }
  function shelfCompare(a,b){ const A=shelfParts(a?.shelf_id||a?.code), B=shelfParts(b?.shelf_id||b?.code); return A[0].localeCompare(B[0]) || A[1]-B[1] || A[2].localeCompare(B[2]); }
  function alphaKey(r){ return (r.last || r.artist || '#').trim().charAt(0).toUpperCase().replace(/[^A-Z0-9]/,'#'); }
  function artistSort(a,b){ return norm(a.last||a.artist).localeCompare(norm(b.last||b.artist)) || norm(a.first).localeCompare(norm(b.first)) || norm(a.album).localeCompare(norm(b.album)) || shelfCompare(a,b); }
  function displayYear(r){ return r.release_year || r.year || ''; }
  function extractTracklist(r){
    const candidates = [r?.tracklist,r?.discogsTracklist,r?.raw_data?.tracklist,r?.raw_data?.discogs?.tracklist,r?.raw_data?.entry?.tracklist,r?.raw_data?.metadata?.tracklist,r?.raw_data?.source?.tracklist,r?.raw_data?.original?.tracklist,r?.raw_data?.code_entry?.tracklist,r?.raw_data?.record?.tracklist];
    for(const c of candidates){
      const t=arr(c).filter(x => x && (x.title || x.name || x.position || typeof x === 'string'));
      if(t.length) return t.map((x,i)=> typeof x === 'string' ? {position:String(i+1), title:x, duration:''} : {position:x.position||x.pos||'', title:x.title||x.name||'', duration:x.duration||''});
    }
    return [];
  }
  function tracks(r){ return extractTracklist(r); }
  function reactionValue(r){ if(r.reaction) return r.reaction; if(Number(r.rating)===3) return 'favorite'; if(Number(r.rating)===2 || r.liked) return 'liked'; if(Number(r.rating)===1) return 'disliked'; return ''; }
  function recordCode(r){ return r.shelf_id || r.code || ''; }
  function coverUrl(r){ return r.cover_url || r.coverUrl || r.img || ''; }
  function collectionNames(r){
    const fromLinks = arr(r.collection_ids || r.collectionIds).map(id => {
      const hit = state.collections.find(c => c.id === id);
      return hit ? hit.name : id;
    }).filter(Boolean);
    const raw = visibleCollections(r.collections);
    const fromJson = raw.map(x => {
      if(typeof x === 'string'){
        const hit = state.collections.find(c => c.id === x || c.name === x);
        return hit ? hit.name : x;
      }
      return x?.name || '';
    }).filter(Boolean);
    return [...new Set([...fromLinks, ...fromJson].filter(x => !isRecordCabinet(x)))];
  }
  function collectionIdsForRecord(r){
    const ids = arr(r.collection_ids || r.collectionIds);
    if(ids.length) return ids.filter(id => !isRecordCabinet(id));
    return visibleCollections(r.collections).map(x => {
      if(typeof x !== 'string') return x?.id || x?.name || '';
      const hit = state.collections.find(c => c.id === x || c.name === x);
      return hit ? hit.id : x;
    }).filter(Boolean).filter(id => !isRecordCabinet(id));
  }
  function setSync(txt){ const n=$('#stDbStatus'); if(n) n.textContent=txt || 'Ready'; }

  function dwLogo(){
    return `<svg class="dw-mark" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><defs><radialGradient id="g${Math.random().toString(36).slice(2)}" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#e8b840"/><stop offset="60%" stop-color="#b07818"/><stop offset="100%" stop-color="#7a5010"/></radialGradient></defs><circle cx="32" cy="32" r="30" fill="#d09a24"/><circle cx="32" cy="32" r="25" fill="none" stroke="#0b0906" stroke-width="3"/><circle cx="32" cy="32" r="20" fill="none" stroke="#0b0906" stroke-width="2.5"/><circle cx="32" cy="32" r="13" fill="#d09a24" stroke="#7a5010" stroke-width="1"/><text x="32" y="38" text-anchor="middle" font-family="serif" font-size="14" font-weight="600" fill="#0b0906">DW</text></svg>`;
  }

  function dwLoginMark(){
    return `<svg class="dw-login-mark" viewBox="0 0 280 280" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <radialGradient id="g-body-login" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#e8b840"/><stop offset="40%" stop-color="#c8901e"/><stop offset="75%" stop-color="#a87018"/><stop offset="100%" stop-color="#7a5010"/></radialGradient>
        <radialGradient id="g-dwax-login" cx="42%" cy="38%" r="60%"><stop offset="0%" stop-color="#f0cc60" stop-opacity="0.15"/><stop offset="100%" stop-color="#8a6010" stop-opacity="0.3"/></radialGradient>
        <radialGradient id="g-lbl-login" cx="36%" cy="34%" r="62%"><stop offset="0%" stop-color="#f8dc70" stop-opacity="0.45"/><stop offset="55%" stop-color="#d09a24" stop-opacity="0"/><stop offset="100%" stop-color="#7a5010" stop-opacity="0.3"/></radialGradient>
        <path id="m-arc-login" d="M140,140 m-64,0 a64,64 0 1,1 128,0 a64,64 0 1,1 -128,0"/>
      </defs>
      <circle cx="140" cy="140" r="139" fill="url(#g-body-login)" stroke="#6a4c10" stroke-width="0.8"/>
      <circle cx="140" cy="140" r="134" fill="none" stroke="#0b0906" stroke-width="1.9"/>
      <circle cx="140" cy="140" r="131" fill="none" stroke="#c88020" stroke-width="0.8"/>
      <circle cx="140" cy="140" r="128" fill="none" stroke="#0b0906" stroke-width="1.9"/>
      <circle cx="140" cy="140" r="125" fill="none" stroke="#c07a1c" stroke-width="0.8"/>
      <circle cx="140" cy="140" r="122" fill="none" stroke="#0b0906" stroke-width="1.8"/>
      <circle cx="140" cy="140" r="119" fill="none" stroke="#b87618" stroke-width="0.8"/>
      <circle cx="140" cy="140" r="116" fill="none" stroke="#0b0906" stroke-width="1.8"/>
      <circle cx="140" cy="140" r="113" fill="none" stroke="#b07218" stroke-width="0.7"/>
      <circle cx="140" cy="140" r="110" fill="none" stroke="#0b0906" stroke-width="1.7"/>
      <circle cx="140" cy="140" r="107" fill="none" stroke="#a86e16" stroke-width="0.7"/>
      <circle cx="140" cy="140" r="104" fill="none" stroke="#0b0906" stroke-width="1.7"/>
      <circle cx="140" cy="140" r="101" fill="none" stroke="#a06a14" stroke-width="0.7"/>
      <circle cx="140" cy="140" r="98" fill="none" stroke="#0b0906" stroke-width="1.6"/>
      <circle cx="140" cy="140" r="95" fill="none" stroke="#986614" stroke-width="0.7"/>
      <circle cx="140" cy="140" r="92" fill="none" stroke="#0b0906" stroke-width="1.6"/>
      <circle cx="140" cy="140" r="89" fill="none" stroke="#906212" stroke-width="0.7"/>
      <circle cx="140" cy="140" r="86" fill="none" stroke="#0b0906" stroke-width="1.5"/>
      <circle cx="140" cy="140" r="83" fill="none" stroke="#886010" stroke-width="0.7"/>
      <circle cx="140" cy="140" r="82" fill="none" stroke="#0b0906" stroke-width="1.2"/>
      <circle cx="140" cy="140" r="80" fill="none" stroke="#806010" stroke-width="0.6"/>
      <circle cx="140" cy="140" r="78" fill="none" stroke="#0b0906" stroke-width="0.9"/>
      <circle cx="140" cy="140" r="76" fill="none" stroke="#786010" stroke-width="0.4"/>
      <circle cx="140" cy="140" r="74" fill="#c8880c"/>
      <circle cx="140" cy="140" r="74" fill="url(#g-dwax-login)"/>
      <circle cx="140" cy="140" r="74" fill="none" stroke="#7a5a10" stroke-width="0.8"/>
      <circle cx="140" cy="140" r="54" fill="none" stroke="#7a5a10" stroke-width="0.5"/>
      <text font-family="Jost,sans-serif" font-size="4.1" fill="#3a2a08" letter-spacing="1.55" font-weight="400" opacity="0.52">
        <textPath href="#m-arc-login" startOffset="0%">Dead Wax was made in honor of dad · so his collection may live for generations</textPath>
      </text>
      <circle cx="141" cy="141" r="52" fill="#5a3c0a" opacity="0.5"/>
      <circle cx="140" cy="140" r="52" fill="#d09a24"/>
      <circle cx="140" cy="140" r="52" fill="url(#g-lbl-login)"/>
      <circle cx="140" cy="140" r="52" fill="none" stroke="#a87218" stroke-width="0.9"/>
      <circle cx="140" cy="140" r="47" fill="none" stroke="#b8861e" stroke-width="0.5" opacity="0.5"/>
      <circle cx="140" cy="140" r="44" fill="none" stroke="#b8861e" stroke-width="0.3" opacity="0.3"/>
      <text x="140" y="151" text-anchor="middle" font-family="Cormorant Garamond, serif" font-size="40" font-weight="600" fill="#0b0906" letter-spacing="3">DW</text>
      <circle cx="140" cy="140" r="5" fill="#0b0906" stroke="#6a4c10" stroke-width="0.6"/>
    </svg>`;
  }

  function ensureAuthShell(){
    if($('#dwAuth')) return;
    const css = document.createElement('style');
    css.textContent = `
      .dw-auth{position:fixed;inset:0;z-index:9999;display:none;align-items:center;justify-content:center;background:radial-gradient(circle at 50% 8%,rgba(240,195,79,.09),transparent 28%),linear-gradient(180deg,#130e08 0%,#080604 58%,#030201 100%);padding:clamp(.75rem,2vw,1.4rem);overflow:hidden;color:var(--cream)}
      .dw-auth.on{display:flex}.dw-auth::before{content:'';position:absolute;inset:-12%;pointer-events:none;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.8' numOctaves='4' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='180' height='180' filter='url(%23n)' opacity='.12'/%3E%3C/svg%3E");opacity:.18;mix-blend-mode:screen}.dw-auth::after{content:'';position:absolute;left:50%;top:50%;width:min(1120px,92vw);height:min(760px,86vh);transform:translate(-50%,-50%);border-radius:36px;background:radial-gradient(ellipse at 50% 100%,rgba(0,0,0,.55),transparent 58%);filter:blur(18px);pointer-events:none}
      .dw-turntable{position:relative;z-index:1;width:min(1080px,96vw);min-height:min(700px,88vh);display:grid;grid-template-columns:minmax(360px,1.08fr) minmax(310px,.76fr);gap:clamp(1rem,3vw,2.4rem);align-items:center;padding:clamp(1rem,3vw,2rem);border:1px solid rgba(208,154,36,.22);border-radius:30px;background:linear-gradient(145deg,#24180d 0%,#110c07 42%,#070503 100%);box-shadow:0 34px 110px rgba(0,0,0,.72),inset 0 1px 0 rgba(255,255,255,.055),inset 0 -1px 0 rgba(0,0,0,.72);overflow:hidden}.dw-turntable::before{content:'';position:absolute;inset:18px;border:1px solid rgba(208,154,36,.12);border-radius:24px;pointer-events:none}.dw-turntable::after{content:'';position:absolute;left:2.8rem;right:2.8rem;bottom:1.45rem;height:8px;border-radius:999px;background:linear-gradient(90deg,transparent,rgba(208,154,36,.16),transparent);filter:blur(4px);pointer-events:none}
      .dw-deck{position:relative;min-height:540px;display:flex;align-items:center;justify-content:center}.dw-platter{position:relative;width:min(520px,44vw);min-width:340px;aspect-ratio:1;border-radius:50%;background:radial-gradient(circle at 50% 50%,#030302 0 5%,#14110d 5.4% 8%,#070605 8.4% 16%,#1a1712 16.4% 17.1%,#090807 17.5% 31%,#1f1b15 31.4% 32.1%,#080706 32.5% 48%,#231d15 48.4% 49.1%,#090705 49.4% 62%,#272018 62.4% 63.1%,#090705 63.5% 100%);box-shadow:0 22px 60px rgba(0,0,0,.7),inset 0 0 0 2px rgba(255,255,255,.025),inset 0 0 42px rgba(0,0,0,.9)}.dw-platter::before{content:'';position:absolute;inset:-18px;border-radius:50%;background:conic-gradient(from 0deg,rgba(208,154,36,.14),rgba(255,255,255,.03),rgba(208,154,36,.08),rgba(0,0,0,.18),rgba(208,154,36,.14));z-index:-1;box-shadow:inset 0 0 0 1px rgba(208,154,36,.18)}.dw-record{position:absolute;inset:7%;border-radius:50%;background:repeating-radial-gradient(circle at center,#080706 0 3px,#14110e 4px 5px,#080706 6px 9px);box-shadow:inset 0 0 0 1px rgba(255,255,255,.04),inset 0 0 35px rgba(0,0,0,.75);animation:dwRecordSpin 18s linear infinite}.dw-label{position:absolute;inset:34%;border-radius:50%;display:flex;align-items:center;justify-content:center;background:radial-gradient(circle at 50% 42%,#f0c34f 0%,#d09a24 48%,#8d6815 100%);border:2px solid rgba(11,9,6,.75);box-shadow:0 0 0 5px rgba(208,154,36,.16),inset 0 2px 4px rgba(244,234,210,.3)}.dw-label .dw-mark{width:82%;height:82%;filter:drop-shadow(0 2px 5px rgba(0,0,0,.35))}.dw-spindle{position:absolute;left:50%;top:50%;width:10px;height:10px;transform:translate(-50%,-50%);border-radius:50%;background:#f4ead2;box-shadow:0 0 0 3px #0b0906,0 0 20px rgba(240,195,79,.5)}
      .dw-tonearm{position:absolute;right:1.5%;top:8%;width:42%;height:42%;transform-origin:87% 18%;transform:rotate(-20deg);transition:transform .48s cubic-bezier(.18,.86,.22,1);pointer-events:none}.dw-auth.signup .dw-tonearm{transform:rotate(-8deg)}.dw-auth.signin .dw-tonearm{transform:rotate(6deg)}.dw-tonearm::before{content:'';position:absolute;right:8%;top:10%;width:72%;height:12px;border-radius:999px;background:linear-gradient(90deg,#d7c7a5,#6d5a3a 36%,#c7a75b);box-shadow:0 4px 12px rgba(0,0,0,.55);transform:rotate(32deg);transform-origin:right center}.dw-tonearm::after{content:'';position:absolute;left:8%;bottom:22%;width:34px;height:18px;border-radius:4px;background:#0b0906;border:1px solid rgba(240,195,79,.34);transform:rotate(32deg);box-shadow:0 6px 16px rgba(0,0,0,.58)}.dw-pivot{position:absolute;right:0;top:0;width:82px;height:82px;border-radius:50%;background:radial-gradient(circle,#2b2114 0 40%,#0b0906 42% 100%);border:1px solid rgba(208,154,36,.26);box-shadow:0 8px 24px rgba(0,0,0,.58)}
      .dw-auth-panel{position:relative;z-index:3;align-self:center;border-radius:24px;border:1px solid rgba(208,154,36,.22);background:linear-gradient(180deg,rgba(21,16,8,.92),rgba(9,7,4,.96));box-shadow:0 22px 70px rgba(0,0,0,.62),inset 0 1px 0 rgba(255,255,255,.045);padding:1.35rem}.dw-auth-kicker{font-size:.58rem;letter-spacing:.22em;text-transform:uppercase;color:var(--gd);font-weight:700}.dw-auth-title{font-family:'Cormorant Garamond',serif;color:var(--gl);font-size:clamp(2.2rem,4vw,3.8rem);line-height:.92;margin:.3rem 0 .4rem}.dw-auth-copy{color:var(--mt);font-size:.82rem;line-height:1.55;margin:0 0 1.1rem}.dw-auth-card label{display:block;font-size:.58rem;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--m2);margin:.68rem 0 .24rem}.dw-auth-card input{width:100%;background:var(--s2);border:1px solid var(--b2);border-radius:9px;color:var(--cream);padding:.68rem .78rem;font-family:'Jost',sans-serif;outline:none;box-shadow:inset 0 1px 0 rgba(255,255,255,.025)}.dw-auth-card input:focus{border-color:var(--gold);box-shadow:0 0 0 3px rgba(208,154,36,.12),inset 0 1px 0 rgba(255,255,255,.04)}.dw-deck-controls{display:grid;grid-template-columns:1fr 1fr;gap:.78rem;margin-top:1.05rem}.dw-deck-btn{position:relative;min-height:3.2rem;border-radius:999px;border:1px solid rgba(208,154,36,.42);font-family:'Jost',sans-serif;font-weight:800;letter-spacing:.12em;text-transform:uppercase;cursor:pointer;transition:transform .16s ease,filter .16s ease,box-shadow .16s ease;box-shadow:0 8px 18px rgba(0,0,0,.42),inset 0 1px 0 rgba(255,255,255,.16)}.dw-deck-btn:active{transform:translateY(2px);box-shadow:0 4px 10px rgba(0,0,0,.44),inset 0 2px 8px rgba(0,0,0,.34)}.dw-deck-btn.signin{background:linear-gradient(180deg,var(--gl),var(--gold));color:#0b0906}.dw-deck-btn.signup{background:linear-gradient(180deg,#251a0d,#100b06);color:var(--gl);border-color:rgba(240,195,79,.28)}.dw-deck-btn:hover{filter:brightness(1.06)}.dw-deck-btn::before{content:'';position:absolute;left:1rem;top:50%;width:.48rem;height:.48rem;border-radius:50%;transform:translateY(-50%);background:currentColor;opacity:.58;box-shadow:0 0 12px currentColor}.dw-auth-error{color:#ff8a7f;font-size:.74rem;line-height:1.35;margin-top:.72rem;min-height:1rem}.dw-auth-note{display:flex;align-items:center;gap:.48rem;margin-top:.8rem;color:var(--m2);font-size:.62rem}.dw-auth-note::before{content:'';width:8px;height:8px;border-radius:50%;background:var(--gold);box-shadow:0 0 12px rgba(208,154,36,.6)}.dw-booting:before{content:'Loading Dead Wax…';position:fixed;inset:0;z-index:9998;display:flex;align-items:center;justify-content:center;background:var(--bg);color:var(--gold);font-family:'Cormorant Garamond',serif;font-size:1.4rem}@keyframes dwRecordSpin{to{transform:rotate(360deg)}}
      @media(max-width:840px){.dw-turntable{grid-template-columns:1fr;min-height:auto}.dw-deck{min-height:390px}.dw-platter{width:min(420px,82vw);min-width:260px}.dw-tonearm{right:8%;top:5%;width:36%;height:36%}.dw-auth-panel{width:100%}}
      @media(max-width:520px){.dw-auth{padding:.55rem}.dw-turntable{border-radius:22px;padding:.85rem}.dw-deck{min-height:310px}.dw-auth-title{font-size:2.25rem}.dw-deck-controls{grid-template-columns:1fr}.dw-auth-panel{padding:1rem}.dw-pivot{width:58px;height:58px}}
      @media(prefers-reduced-motion:reduce){.dw-record{animation:none}.dw-tonearm,.dw-deck-btn{transition:none}}
    `;
    document.head.appendChild(css);

    const loginFix = document.createElement('style');
    loginFix.textContent = `
      html body .dw-auth{position:fixed!important;inset:0!important;z-index:9999!important;display:none!important;padding:0!important;background:radial-gradient(circle at 62% 22%,rgba(208,154,36,.10),transparent 30%),linear-gradient(135deg,#1a1108 0%,#0b0805 44%,#050302 100%)!important;overflow:hidden!important;color:var(--cream)!important}
      html body .dw-auth.on{display:block!important}
      html body .dw-auth::before{content:''!important;position:absolute!important;inset:0!important;pointer-events:none!important;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='220' height='220'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.72' numOctaves='4' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='220' height='220' filter='url(%23n)' opacity='.10'/%3E%3C/svg%3E")!important;opacity:.12!important;mix-blend-mode:screen!important;z-index:1!important}
      html body .dw-auth::after{content:none!important;display:none!important}
      html body .dw-turntable{position:absolute!important;inset:0!important;z-index:2!important;display:block!important;overflow:hidden!important;background:linear-gradient(145deg,rgba(244,234,210,.025),transparent 24%,rgba(0,0,0,.20)),radial-gradient(circle at 78% 74%,rgba(208,154,36,.055),transparent 30%)!important;border:0!important;border-radius:0!important;box-shadow:none!important;padding:0!important;width:auto!important;min-height:0!important;max-width:none!important;grid-template-columns:none!important}
      html body .dw-turntable::before{content:''!important;position:absolute!important;right:-8vmax!important;bottom:-12vmax!important;width:62vmax!important;height:62vmax!important;border-radius:50%!important;border:1px solid rgba(208,154,36,.08)!important;background:radial-gradient(circle,rgba(240,195,79,.045),transparent 56%)!important;filter:blur(1px)!important;pointer-events:none!important;inset:auto!important}
      html body .dw-turntable::after{content:''!important;position:absolute!important;left:46vw!important;top:0!important;bottom:0!important;width:1px!important;height:auto!important;background:linear-gradient(180deg,transparent,rgba(208,154,36,.12),transparent)!important;opacity:.9!important;pointer-events:none!important;right:auto!important;filter:none!important}
      html body .dw-deck{position:absolute!important;left:clamp(-58rem,-42vw,-20rem)!important;top:50%!important;width:clamp(720px,96vmax,1320px)!important;height:clamp(720px,96vmax,1320px)!important;min-width:0!important;min-height:0!important;transform:translateY(-50%)!important;display:block!important;z-index:2!important;pointer-events:none!important}
      html body .dw-platter{position:absolute!important;inset:0!important;border-radius:50%!important;aspect-ratio:1!important;background:radial-gradient(circle at 50% 50%,rgba(244,234,210,.15) 0 .45%,#0b0906 .7% 1.2%,transparent 1.35%),conic-gradient(from 16deg,rgba(240,195,79,.22),rgba(122,80,16,.18),rgba(240,195,79,.20),rgba(0,0,0,.05),rgba(240,195,79,.22))!important;box-shadow:0 34px 110px rgba(0,0,0,.72),inset 0 0 0 2px rgba(240,195,79,.20),inset 0 0 0 18px rgba(11,9,6,.48),inset 0 0 80px rgba(0,0,0,.58)!important;width:auto!important;min-width:0!important}
      html body .dw-platter::before{content:''!important;position:absolute!important;inset:4.5%!important;border-radius:50%!important;background:repeating-radial-gradient(circle at center,rgba(11,9,6,.28) 0 2px,rgba(244,234,210,.035) 3px 4px,rgba(11,9,6,.25) 5px 8px),radial-gradient(circle at 50% 50%,#e8b840 0,#d09a24 22%,#b07818 62%,#7a5010 100%)!important;box-shadow:inset 0 0 0 1px rgba(11,9,6,.38),inset 0 0 62px rgba(11,9,6,.38)!important;animation:dwRecordSpin 28s linear infinite!important;z-index:1!important}
      html body .dw-platter::after{content:''!important;position:absolute!important;inset:18%!important;border-radius:50%!important;border:2px solid rgba(11,9,6,.42)!important;box-shadow:0 0 0 26px rgba(11,9,6,.12),0 0 0 54px rgba(244,234,210,.035),inset 0 0 0 1px rgba(244,234,210,.10)!important;z-index:2!important;background:none!important}
      html body .dw-record{display:none!important}
      html body .dw-label{position:absolute!important;inset:36%!important;border-radius:50%!important;display:flex!important;align-items:center!important;justify-content:center!important;background:radial-gradient(circle at 50% 42%,#f3c951 0%,#d09a24 50%,#8d6815 100%)!important;border:2px solid rgba(11,9,6,.72)!important;box-shadow:0 0 0 8px rgba(11,9,6,.22),inset 0 2px 5px rgba(244,234,210,.35),0 8px 36px rgba(0,0,0,.34)!important;z-index:3!important;animation:dwRecordSpin 28s linear infinite!important;width:auto!important;height:auto!important}
      html body .dw-label .dw-mark{width:82%!important;height:82%!important;filter:drop-shadow(0 2px 5px rgba(0,0,0,.30))!important}
      html body .dw-spindle{position:absolute!important;left:50%!important;top:50%!important;width:12px!important;height:12px!important;transform:translate(-50%,-50%)!important;border-radius:50%!important;background:#f4ead2!important;box-shadow:0 0 0 4px rgba(11,9,6,.88),0 0 20px rgba(240,195,79,.46)!important;z-index:4!important}
      html body .dw-tonearm{position:absolute!important;left:clamp(410px,43vw,660px)!important;top:clamp(10px,2.4vh,32px)!important;width:clamp(250px,28vw,430px)!important;height:clamp(250px,28vw,430px)!important;transform-origin:82% 14%!important;transform:rotate(-19deg)!important;transition:transform .52s cubic-bezier(.18,.86,.22,1)!important;pointer-events:none!important;z-index:5!important;right:auto!important;bottom:auto!important}
      html body .dw-auth.signup .dw-tonearm{transform:rotate(-24deg)!important}
      html body .dw-auth.signin .dw-tonearm{transform:rotate(-10deg)!important}
      html body .dw-auth.playing .dw-tonearm{transform:rotate(-4deg)!important}
      html body .dw-tonearm::before{content:''!important;position:absolute!important;right:14%!important;top:14%!important;width:82%!important;height:10px!important;border-radius:999px!important;background:linear-gradient(90deg,#f0dfbd 0%,#a98d58 32%,#302418 66%,#c7a75b 100%)!important;box-shadow:0 5px 14px rgba(0,0,0,.55)!important;transform:rotate(33deg)!important;transform-origin:right center!important}
      html body .dw-tonearm::after{content:''!important;position:absolute!important;left:3%!important;top:61%!important;width:16px!important;height:28px!important;border-radius:2px 2px 8px 8px!important;background:linear-gradient(180deg,#2d2114,#0b0906)!important;border:1px solid rgba(240,195,79,.26)!important;transform:rotate(33deg)!important;box-shadow:0 7px 18px rgba(0,0,0,.5)!important;bottom:auto!important}
      html body .dw-pivot{position:absolute!important;right:0!important;top:0!important;width:88px!important;height:88px!important;border-radius:50%!important;background:radial-gradient(circle,#4a3824 0 32%,#20170d 34% 52%,#0b0906 54% 100%)!important;border:1px solid rgba(208,154,36,.30)!important;box-shadow:0 8px 26px rgba(0,0,0,.62),inset 0 1px 0 rgba(244,234,210,.08)!important}
      html body .dw-auth-intro{position:absolute!important;right:clamp(1.2rem,5.3vw,5rem)!important;top:clamp(3.4rem,12vh,8.5rem)!important;z-index:6!important;width:min(520px,calc(100vw - 2.4rem))!important;padding-left:.1rem!important}
      html body .dw-auth-intro-kicker{font-size:.58rem!important;letter-spacing:.22em!important;text-transform:uppercase!important;color:var(--gd)!important;font-weight:800!important;margin-bottom:.42rem!important}
      html body .dw-auth-intro h1{font-family:'Cormorant Garamond',serif!important;color:var(--gl)!important;font-size:clamp(3.2rem,6vw,5.9rem)!important;line-height:.88!important;margin:0 0 .68rem!important;text-shadow:0 10px 34px rgba(0,0,0,.50)!important}
      html body .dw-auth-intro p{max-width:46ch!important;color:var(--mt)!important;font-size:clamp(.84rem,1.05vw,.98rem)!important;line-height:1.65!important;font-weight:300!important}
      html body .dw-auth-panel{position:absolute!important;right:clamp(1.2rem,5.3vw,5rem)!important;top:clamp(22rem,48vh,33rem)!important;transform:translateY(-50%)!important;z-index:7!important;width:min(430px,calc(100vw - 2.4rem))!important;padding:1.08rem 1.18rem 1.08rem!important;border-radius:18px!important;background:linear-gradient(145deg,rgba(24,17,9,.94),rgba(8,6,3,.98))!important;border:1px solid rgba(208,154,36,.30)!important;box-shadow:inset 0 1px 0 rgba(244,234,210,.08),0 22px 62px rgba(0,0,0,.48)!important;backdrop-filter:none!important;align-self:auto!important;max-width:none!important}
      html body .dw-auth-panel::before,html body .dw-auth-panel::after{content:none!important;display:none!important}
      html body .dw-auth-kicker,html body .dw-auth-title,html body .dw-auth-copy{display:none!important}
      html body .dw-auth-card label{display:block!important;font-size:.58rem!important;font-weight:800!important;letter-spacing:.15em!important;text-transform:uppercase!important;color:var(--m2)!important;margin:.68rem 0 .25rem!important}
      html body .dw-auth-card label:first-of-type{margin-top:0!important}
      html body .dw-auth-card input{width:100%!important;background:var(--s2)!important;border:1px solid var(--b2)!important;border-radius:9px!important;color:var(--cream)!important;padding:.72rem .82rem!important;font-family:'Jost',sans-serif!important;outline:none!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.025)!important}
      html body .dw-auth-card input:focus{border-color:var(--gold)!important;box-shadow:0 0 0 3px rgba(208,154,36,.12),inset 0 1px 0 rgba(255,255,255,.04)!important}
      html body .dw-deck-controls{display:grid!important;grid-template-columns:1fr 1fr!important;gap:.82rem!important;margin-top:1.1rem!important}
      html body .dw-deck-btn{position:relative!important;min-height:3.15rem!important;border-radius:999px!important;border:1px solid rgba(208,154,36,.42)!important;font-family:'Jost',sans-serif!important;font-weight:900!important;letter-spacing:.13em!important;text-transform:uppercase!important;cursor:pointer!important;transition:transform .16s ease,filter .16s ease,box-shadow .16s ease!important;box-shadow:0 8px 18px rgba(0,0,0,.42),inset 0 1px 0 rgba(255,255,255,.16)!important}
      html body .dw-deck-btn:active{transform:translateY(2px)!important;box-shadow:0 4px 10px rgba(0,0,0,.44),inset 0 2px 8px rgba(0,0,0,.34)!important}
      html body .dw-deck-btn.signin{background:linear-gradient(180deg,var(--gl),var(--gold))!important;color:#0b0906!important}
      html body .dw-deck-btn.signup{background:linear-gradient(180deg,#251a0d,#100b06)!important;color:var(--gl)!important;border-color:rgba(240,195,79,.28)!important}
      html body .dw-deck-btn:hover{filter:brightness(1.06)!important}
      html body .dw-deck-btn::before{content:''!important;position:absolute!important;left:1rem!important;top:50%!important;width:.72rem!important;height:.72rem!important;border-radius:50%!important;transform:translateY(-50%)!important;background:currentColor!important;opacity:.34!important;box-shadow:0 0 12px currentColor!important}
      html body .dw-auth-error{color:#ff8a7f!important;font-size:.74rem!important;line-height:1.35!important;margin-top:.72rem!important;min-height:1rem!important}
      html body .dw-auth-note{display:flex!important;align-items:center!important;gap:.48rem!important;margin-top:.78rem!important;color:var(--m2)!important;font-size:.62rem!important}
      html body .dw-auth-note::before{content:''!important;width:8px!important;height:8px!important;border-radius:50%!important;background:var(--gold)!important;box-shadow:0 0 12px rgba(208,154,36,.6)!important}
      @media(max-width:980px){html body .dw-deck{left:-520px!important;width:920px!important;height:920px!important}html body .dw-tonearm{left:48vw!important;top:1.2rem!important;width:280px!important;height:280px!important}html body .dw-auth-intro{top:2rem!important;right:1.2rem!important;width:min(420px,calc(100vw - 2.4rem))!important}html body .dw-auth-panel{right:1.2rem!important;top:auto!important;bottom:1.2rem!important;transform:none!important;width:min(430px,calc(100vw - 2.4rem))!important}html body .dw-auth-intro h1{font-size:3.4rem!important}html body .dw-auth-intro p{font-size:.82rem!important}}
      @media(max-width:640px){html body .dw-deck{left:50%!important;top:-420px!important;transform:translateX(-50%)!important;width:780px!important;height:780px!important}html body .dw-tonearm{left:auto!important;right:1rem!important;top:.7rem!important;width:210px!important;height:210px!important}html body .dw-pivot{width:62px!important;height:62px!important}html body .dw-auth-intro{left:1rem!important;right:1rem!important;top:15.5rem!important;width:auto!important}html body .dw-auth-intro h1{font-size:2.7rem!important}html body .dw-auth-intro p{font-size:.78rem!important;line-height:1.5!important}html body .dw-auth-panel{left:1rem!important;right:1rem!important;bottom:1rem!important;width:auto!important;padding:1rem!important}html body .dw-deck-controls{grid-template-columns:1fr!important}html body .dw-deck-btn{min-height:2.95rem!important}}


      /* v20 stable login patch: keep v15 vinyl, remove arm/rectangles, align right column */
      html body .dw-tonearm,
      html body .dw-tonearm::before,
      html body .dw-tonearm::after,
      html body .dw-pivot{
        display:none!important;
        content:none!important;
      }
      html body .dw-turntable::after{
        content:none!important;
        display:none!important;
      }
      html body .dw-auth-intro,
      html body .dw-auth-panel{
        right:clamp(1.5rem,6vw,5.4rem)!important;
        width:min(480px,calc(100vw - 3rem))!important;
      }
      html body .dw-auth-intro{
        top:50%!important;
        transform:translateY(calc(-50% - 10.5rem))!important;
        z-index:7!important;
      }
      html body .dw-auth-intro p{
        max-width:43ch!important;
      }
      html body .dw-auth-panel{
        top:50%!important;
        transform:translateY(calc(-50% + 5.25rem))!important;
        z-index:8!important;
      }
      @media(max-width:980px){
        html body .dw-auth-intro,
        html body .dw-auth-panel{
          right:1.2rem!important;
          width:min(430px,calc(100vw - 2.4rem))!important;
        }
        html body .dw-auth-intro{
          top:2rem!important;
          transform:none!important;
        }
        html body .dw-auth-panel{
          top:auto!important;
          bottom:1.2rem!important;
          transform:none!important;
        }
      }
      @media(max-width:640px){
        html body .dw-auth-intro{
          left:1rem!important;
          right:1rem!important;
          top:15.5rem!important;
          width:auto!important;
          transform:none!important;
        }
        html body .dw-auth-panel{
          left:1rem!important;
          right:1rem!important;
          bottom:1rem!important;
          width:auto!important;
          transform:none!important;
        }
      }



      /* v24 login styleguide pass: tagline, dead wax inscription, right-column rhythm */
      html body .dw-deadwax-etch{
        position:absolute!important;
        inset:4.6%!important;
        width:auto!important;
        height:auto!important;
        border-radius:50%!important;
        z-index:1!important;
        pointer-events:none!important;
        animation:dwRecordSpin 18s linear infinite!important;
        opacity:.18!important;
        mix-blend-mode:screen!important;
      }
      html body .dw-deadwax-etch text{
        fill:rgba(240,195,79,.52)!important;
        letter-spacing:3.4px!important;
        font-weight:400!important;
      }
      html body .dw-auth-intro-kicker,
      html body .dw-auth-kicker{
        color:var(--gd)!important;
        letter-spacing:.22em!important;
      }
      html body .dw-auth-intro p{
        max-width:44ch!important;
        line-height:1.72!important;
      }
      html body .dw-auth-intro{
        transform:translateY(calc(-50% - 12rem))!important;
      }
      html body .dw-auth-panel{
        transform:translateY(calc(-50% + 6.25rem))!important;
      }
      @media(max-width:980px){
        html body .dw-auth-intro{transform:none!important;}
        html body .dw-auth-panel{transform:none!important;}
      }

      @media(prefers-reduced-motion:reduce){html body .dw-platter::before,html body .dw-label{animation:none!important}html body .dw-tonearm,html body .dw-deck-btn{transition:none!important}}
    `;

      const loginSketchFix = document.createElement('style');
      loginSketchFix.textContent = `
        html body .dw-tonearm,
        html body .dw-deadwax-etch{display:none!important}
        html body .dw-auth-side{position:absolute!important;right:clamp(1.2rem,5vw,4.5rem)!important;top:50%!important;transform:translateY(-50%)!important;z-index:8!important;width:min(440px,calc(100vw - 2.4rem))!important;display:flex!important;flex-direction:column!important;gap:1.2rem!important;align-items:stretch!important}
        html body .dw-auth-intro,
        html body .dw-auth-panel{position:relative!important;left:auto!important;right:auto!important;top:auto!important;bottom:auto!important;transform:none!important;width:100%!important;max-width:none!important}
        html body .dw-auth-intro{padding-left:0!important;margin:0!important}
        html body .dw-auth-intro-kicker,
        html body .dw-auth-kicker{font-size:.64rem!important;letter-spacing:.18em!important;color:var(--gd)!important;text-transform:uppercase!important;font-weight:700!important}
        html body .dw-auth-intro h1{margin:0 0 .5rem!important;font-size:clamp(3rem,5.2vw,5.6rem)!important;line-height:.88!important}
        html body .dw-auth-intro p{margin:0!important;max-width:34ch!important;color:var(--mt)!important;font-size:clamp(.9rem,1.08vw,.98rem)!important;line-height:1.68!important}
        html body .dw-auth-panel{padding:1.18rem 1.18rem 1.05rem!important;border-radius:20px!important;background:linear-gradient(180deg,rgba(18,13,7,.94),rgba(8,6,3,.98))!important;border:1px solid rgba(208,154,36,.24)!important;box-shadow:0 20px 52px rgba(0,0,0,.40), inset 0 1px 0 rgba(255,255,255,.04)!important}
        html body .dw-auth-title,
        html body .dw-auth-copy,
        html body .dw-auth-note{display:none!important}
        html body .dw-deck-btn{min-height:3rem!important}
        html body .dw-label{inset:35.5%!important;box-shadow:0 0 0 8px rgba(11,9,6,.18),inset 0 2px 5px rgba(244,234,210,.32),0 8px 36px rgba(0,0,0,.26)!important}
        html body .dw-label .dw-login-mark{width:92%!important;height:92%!important;display:block!important;opacity:.96!important;filter:drop-shadow(0 2px 4px rgba(0,0,0,.26))!important}
        html body .dw-spindle{z-index:5!important}
        html body .dw-turntable::after{left:calc(100% - min(440px,calc(100vw - 2.4rem)) - clamp(1.2rem,5vw,4.5rem) - 1.5rem)!important;opacity:.55!important}
        @media (max-width: 980px){
          html body .dw-auth-side{right:1.1rem!important;width:min(420px,calc(100vw - 2.2rem))!important}
          html body .dw-auth-intro h1{font-size:3.6rem!important}
          html body .dw-auth-intro p{max-width:36ch!important}
        }
        @media (max-width: 720px){
          html body .dw-auth-side{left:1rem!important;right:1rem!important;top:auto!important;bottom:1rem!important;transform:none!important;width:auto!important;gap:.95rem!important}
          html body .dw-auth-intro{padding-right:0!important}
          html body .dw-auth-intro h1{font-size:2.8rem!important}
          html body .dw-auth-intro p{font-size:.82rem!important;max-width:none!important;line-height:1.56!important}
          html body .dw-deck{left:clamp(-44rem,-67vw,-28rem)!important;top:32%!important;width:clamp(620px,110vw,860px)!important;height:clamp(620px,110vw,860px)!important}
        }
      `;
      document.head.appendChild(loginSketchFix);

    document.head.appendChild(loginFix);
    const d=document.createElement('div');
    d.id='dwAuth';
    d.className='dw-auth signin';
    d.innerHTML=`<div class="dw-turntable" role="dialog" aria-modal="true" aria-labelledby="dwAuthTitle"><div class="dw-deck" aria-hidden="true"><div class="dw-platter"><div class="dw-record"></div><div class="dw-label">${dwLoginMark()}</div><div class="dw-spindle"></div></div></div><div class="dw-auth-side"><section class="dw-auth-intro"><div class="dw-auth-intro-kicker">Your private vinyl collection</div><h1 id="dwAuthTitle">Dead Wax</h1><p>Dead Wax is your private vinyl collection: shelf IDs, collection labels, listening notes, and Discogs details in one warm, searchable home.</p></section><section class="dw-auth-panel"><form class="dw-auth-card" id="dwAuthForm"><label for="dwEmail">Email</label><input id="dwEmail" type="email" autocomplete="email" required><label for="dwPassword">Password</label><input id="dwPassword" type="password" autocomplete="current-password" required><div class="dw-deck-controls"><button type="submit" class="dw-deck-btn signin" id="dwSignInBtn">Sign in</button><button type="button" class="dw-deck-btn signup" id="dwSignUp">Sign up</button></div><div class="dw-auth-error" id="dwAuthError"></div></form></section></div></div>`;
    document.body.appendChild(d);
    const setAuthMode=(mode)=>{ d.classList.toggle('signup',mode==='signup'); d.classList.toggle('signin',mode!=='signup'); };
    $('#dwSignInBtn').addEventListener('mouseenter',()=>setAuthMode('signin'));
    $('#dwSignInBtn').addEventListener('focus',()=>setAuthMode('signin'));
    $('#dwSignUp').addEventListener('mouseenter',()=>setAuthMode('signup'));
    $('#dwSignUp').addEventListener('focus',()=>setAuthMode('signup'));
    $('#dwAuthForm').addEventListener('submit', async e => { e.preventDefault(); setAuthMode('signin'); await authIn(false); });
    $('#dwSignUp').addEventListener('click', async () => { setAuthMode('signup'); await authIn(true); });
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
    const [recRes, colRes, linkRes] = await Promise.all([
      SB.from('records').select(FIELDS).eq('user_id',state.user.id).order('shelf_id',{ascending:true}),
      SB.from('collections').select('*').eq('user_id',state.user.id).order('name',{ascending:true}),
      SB.from('record_collections').select('record_id,collection_id').eq('user_id',state.user.id)
    ]);
    if(recRes.error){ alert(recRes.error.message); return; }
    if(colRes.error){ console.warn(colRes.error); }
    if(linkRes.error){ console.warn(linkRes.error); }
    state.collections = visibleCollectionRows(colRes.data || []);
    state.collectionLinks = linkRes.data || [];
    const linkMap = new Map();
    state.collectionLinks.forEach(l => {
      if(!linkMap.has(l.record_id)) linkMap.set(l.record_id, []);
      if(!isRecordCabinet(l.collection_id)) linkMap.get(l.record_id).push(l.collection_id);
    });
    state.records = (recRes.data || []).map(r => normalizeRecord({...r, collection_ids: linkMap.get(r.id) || []}));
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
    r.tracklist = extractTracklist(r);
    r.collections = internalCollections(r.collections);
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
    if(f.doubles) a=a.filter(r=>Number(r.copies_owned||r.owned||1)>1);
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
    else if(g==='shelf') a.forEach(r=>{ const p=shelfParts(recordCode(r)); add(p[0] && p[0] !== '~' ? p[0] : 'No Shelf ID', r); });
    else a.forEach(r=>add(alphaKey(r),r));
    let groups=[...map.entries()];
    groups.sort((x,y)=>{
      if(g==='decade') return x[0].localeCompare(y[0],undefined,{numeric:true});
      if(g==='alpha') return x[0].localeCompare(y[0]);
      if(g==='shelf') return x[0].localeCompare(y[0],undefined,{numeric:true});
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
      return `<section class="${(state.group==='alpha'||state.group==='shelf')?'letter-section':'genre-section'}" id="grp-${slug(label)}">${groupHeader(label,rs.length,(state.group==='alpha'||state.group==='shelf')?'letter':'genre')}<div class="grp-body ${state.collapsed.has(key)?'collapsed':''}"><div class="records-grid">${rs.map(renderCard).join('')}</div></div></section>`;
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

  function flowEntries(){
    const entries=[];
    groupRecords(state.filtered).forEach(([label,rs])=>{
      rs.forEach(record=>entries.push({label,record}));
    });
    return entries;
  }

  function cfClamp(){
    const entries=flowEntries();
    if(!entries.length){ state.cfIndex=0; state.cfPos=0; state.cfActiveId=null; return entries; }
    state.cfIndex=Math.max(0,Math.min(Math.round(state.cfIndex||0),entries.length-1));
    state.cfPos=Math.max(0,Math.min(Number(state.cfPos||state.cfIndex),entries.length-1));
    if(state.cfActiveId){
      const hit=entries.findIndex(e=>e.record.id===state.cfActiveId);
      if(hit>=0){ state.cfIndex=hit; state.cfPos=hit; }
    }
    state.cfActiveId=entries[state.cfIndex]?.record?.id || null;
    return entries;
  }

  function flowPose(offset){
    const sign=offset<0?-1:1;
    const d=Math.abs(offset);
    if(d<.001) return {x:0,y:0,z:0,rot:0,scale:1,opacity:1};
    const near=Math.min(d,1);
    const far=Math.max(0,d-1);
    return {
      x: sign*(42 + far*15),
      y: Math.min(10, far*1.4),
      z: -165 - far*82,
      rot: sign*(-58 + Math.min(18,far*3.6)),
      scale: Math.max(.56,.84 - far*.035),
      opacity: d>8 ? 0 : Math.max(.18,1 - far*.105)
    };
  }

  function flowTransform(p){
    return `translateX(calc(-50% + ${p.x}%)) translateY(calc(-50% + ${p.y}px)) translateZ(${p.z}px) rotateY(${p.rot}deg) scale(${p.scale})`;
  }

  function renderFlowDivider(label,offset){
    const pose=flowPose(offset);
    return `<div class="cf-divider" style="transform:${flowTransform(pose)};opacity:${Math.max(.2,pose.opacity*.72)};z-index:${Math.max(1,650-Math.round(Math.abs(offset)*10))}"><div class="cf-divider-main"><span class="cf-divider-letter">${esc(label)}</span><span class="cf-divider-sub">Section</span></div></div>`;
  }

  function renderFlow(){
    const stage=$('#cfStage'), meta=$('#cfMeta');
    const entries=cfClamp();
    if(!stage || !meta) return;
    if(!entries.length){
      stage.innerHTML='<div class="cf-empty-state"><h3>No records found</h3><p>Try adjusting your filters.</p></div>';
      meta.innerHTML='';
      return;
    }
    const center=state.cfPos;
    const start=Math.max(0,Math.floor(center)-10);
    const end=Math.min(entries.length-1,Math.ceil(center)+10);
    const active=entries[state.cfIndex];
    const pieces=['<div class="cf-stage-rail"></div>'];
    for(let i=Math.max(1,start);i<=end;i++){
      if(entries[i].label!==entries[i-1].label){
        pieces.push(renderFlowDivider(entries[i].label, i-center));
      }
    }
    for(let i=start;i<=end;i++) pieces.push(renderFlowCard(entries[i].record,i,i-center));
    stage.innerHTML=pieces.join('');
    updateCoverFlowMeta(active, entries.length);
  }

  function updateCoverFlowMeta(entry,total){
    const meta=$('#cfMeta');
    if(!meta || !entry) return;
    const r=entry.record;
    meta.innerHTML=`<div class="flow-meta-main"><div class="flow-meta-code">${esc(recordCode(r))}</div><div class="flow-meta-artist">${esc(r.artist)}</div><div class="flow-meta-album">${esc(r.album)}</div><div class="flow-meta-tags">${tag(r.genre,'g')}${collectionNames(r).slice(0,3).map(x=>tag(x)).join('')}</div><div class="flow-section-line"><span class="flow-section-pill">${esc(entry.label)}</span><span class="flow-section-pill">${state.cfIndex+1} / ${total}</span></div><div class="flow-hint">Hover the centered cover for the tracklist. Click the centered cover to open details.</div></div>`;
  }

  function renderFlowCard(r,idx,offset){
    const active=Math.round(offset)===0;
    const distance=Math.abs(offset);
    const pose=flowPose(offset);
    const flipped=active && state.cfFlipId===r.id;
    return `<div class="cf-card ${active?'active':''}${distance>8?' off':''} cf-ready" data-id="${esc(r.id)}" style="z-index:${Math.max(1,700-Math.round(distance*10))};opacity:${pose.opacity};transform:${flowTransform(pose)};" onclick="cfClick('${esc(r.id)}',event)"><div class="cf-scene card-scene ${flipped?'flipped':''}"><div class="card-inner"><div class="card-front"><div class="card-cover">${coverHtml(r)}${r.grail?`<span class="grail-mark">${dwLogo()}</span>`:''}<div class="cf-code">${esc(recordCode(r))}</div></div></div><div class="card-back">${trackBack(r)}</div></div></div><div class="cf-cover-shadow"></div></div>`;
  }

  function cfStageMoving(on){
    const stage=$('#cfStage');
    if(stage) stage.classList.toggle('moving', !!on);
    if(!on) cfSetMotionBlur(0,0);
  }

  function cfSetMotionBlur(amount=0, dir=0){
    const stage=$('#cfStage');
    if(!stage) return;
    const a=Math.max(0,Math.min(1,Math.abs(amount)));
    stage.classList.toggle('cf-motion-blur', a>.035);
    stage.style.setProperty('--cf-motion-blur', (a*1.15).toFixed(2)+'px');
    stage.style.setProperty('--cf-active-blur', (a*.42).toFixed(2)+'px');
    stage.style.setProperty('--cf-motion-smear', (a*.34).toFixed(3));
    stage.style.setProperty('--cf-motion-dir', dir<0 ? -1 : 1);
  }

  function cfStopMomentum(){
    state.cfVelocity=0;
    state.cfWheelAccum=0;
    state.cfManualQueue=0;
    state.cfMomentumPower=0;
    state.cfMomentumDir=0;
    state.cfTurnLock=false;
    cfStageMoving(false);
  }

  function cfMomentumDelay(){
    const p=Math.max(0,Math.min(1,state.cfMomentumPower/2.35));
    return Math.round(30 + (1-p)*118);
  }

  function cfAddMomentum(delta){
    const dir=delta<0?-1:1;
    const impulse=Math.min(3.25,Math.max(.14,Math.abs(delta)/86));
    if(state.cfMomentumDir && state.cfMomentumDir!==dir) state.cfMomentumPower=0;
    state.cfMomentumDir=dir;
    state.cfMomentumPower=Math.min(3.5,Math.max(state.cfMomentumPower*.94,impulse));
    state.cfVelocity=state.cfMomentumPower*dir;
    cfSetMotionBlur(Math.min(1,.34 + state.cfMomentumPower*.22),dir);
    if(!state.cfTurnLock) cfRunMomentumTurn();
  }

  function cfRunMomentumTurn(){
    if(state.view!=='flow') return;
    if(state.cfTurnLock) return;
    if(state.cfMomentumPower<.18){
      state.cfMomentumPower=0;
      state.cfMomentumDir=0;
      state.cfVelocity=0;
      cfStageMoving(false);
      return;
    }
    cfPageTurn(state.cfMomentumDir || 1,{momentum:true});
  }

  function cfCompleteTurn(dir,opts={}){
    const momentum=!!opts.momentum;
    if(momentum){
      state.cfMomentumPower*=.62;
      state.cfVelocity=state.cfMomentumPower*dir;
    }
    const hasMomentum=momentum && state.cfMomentumPower>=.18;
    const hasManual=state.cfManualQueue!==0;
    const delay=momentum ? Math.max(34, cfMomentumDelay()-18) : (hasManual?150:230);
    cfSetMotionBlur(hasMomentum?Math.min(.5,.18+state.cfMomentumPower*.24):.18,dir);
    window.setTimeout(()=>{
      state.cfTurnLock=false;
      if(hasMomentum && state.cfMomentumDir){ cfRunMomentumTurn(); return; }
      if(state.cfManualQueue!==0){
        const q=state.cfManualQueue<0?-1:1;
        state.cfManualQueue-=q;
        cfPageTurn(q,{momentum:false});
        return;
      }
      cfStageMoving(false);
    },delay);
  }

  function cfPageTurn(dir,opts={}){
    const entries=cfClamp();
    if(!entries.length) return;
    dir=dir<0?-1:1;
    if(state.cfTurnLock){
      if(opts.momentum){
        state.cfMomentumDir=dir;
        state.cfMomentumPower=Math.min(3.5,state.cfMomentumPower);
      }else{
        state.cfManualQueue+=dir;
        state.cfManualQueue=Math.max(-5,Math.min(5,state.cfManualQueue));
      }
      return;
    }
    const next=Math.max(0,Math.min(entries.length-1,state.cfIndex+dir));
    if(next===state.cfIndex){
      state.cfMomentumPower=0;
      state.cfVelocity=0;
      state.cfManualQueue=0;
      cfStageMoving(false);
      return;
    }
    state.cfTurnLock=true;
    state.cfFlipId=null;
    state.cfPos=next;
    state.cfIndex=next;
    state.cfActiveId=entries[next].record.id;
    const motionAmount=opts.momentum ? Math.min(1,.38 + state.cfMomentumPower*.20) : .58;
    cfStageMoving(true);
    cfSetMotionBlur(motionAmount,dir);
    renderFlow();
    window.setTimeout(()=>cfSetMotionBlur(opts.momentum ? Math.min(.62,.14+state.cfMomentumPower*.18) : .28,dir),70);
    cfCompleteTurn(dir,opts);
  }

  function cfClick(id,event){
    if(event?.target?.closest('.tl-dg,a,button')) return;
    const entries=flowEntries();
    const idx=entries.findIndex(e=>e.record.id===id);
    if(idx<0) return;
    if(idx!==state.cfIndex){
      const dir=idx>state.cfIndex?1:-1;
      const distance=Math.abs(idx-state.cfIndex);
      if(distance<=2){ cfPageTurn(dir,{momentum:false}); }
      else{
        cfStopMomentum();
        state.cfPos=idx; state.cfIndex=idx; state.cfActiveId=id; state.cfFlipId=null;
        cfStageMoving(true); cfSetMotionBlur(.7,dir); renderFlow(); window.setTimeout(()=>cfStageMoving(false),280);
      }
      return;
    }
    openRecordById(id);
  }
  window.cfClick=cfClick;

  function cfStep(dir){ cfPageTurn(dir,{momentum:false}); }

  function cfHandleWheel(e){
    if(state.view!=='flow') return;
    const delta=Math.abs(e.deltaX)>Math.abs(e.deltaY)?e.deltaX:e.deltaY;
    if(Math.abs(delta)<3) return;
    e.preventDefault();
    state.cfWheelAccum+=delta;
    const threshold=10;
    if(Math.abs(state.cfWheelAccum)>=threshold){
      const impulse=state.cfWheelAccum;
      state.cfWheelAccum*=.08;
      cfAddMomentum(impulse);
    }
  }

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

  function lockPage(){ document.body.classList.add('dw-modal-open'); }
  function unlockPage(){ if(!document.querySelector('.ov.on,.f-ov.on,.s-ov.on')) document.body.classList.remove('dw-modal-open'); }

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
    const metaBits = [
      displayYear(r) ? `Released ${esc(displayYear(r))}` : '',
      r.label ? `Label: ${esc(r.label)}` : '',
      r.country ? `Country: ${esc(r.country)}` : '',
      r.genre ? `Genre: ${esc(r.genre)}` : '',
      r.discogs_id ? `Discogs ID: ${esc(r.discogs_id)}` : ''
    ].filter(Boolean);
    $('#mWiki').className='wiki-txt';
    $('#mWiki').innerHTML=metaBits.length ? metaBits.join('. ') + '.' : 'No extra metadata saved yet.';
    $('#mStyles').innerHTML=(r.genres||[]).concat(r.styles||[]).filter(Boolean).map(x=>`<span class="style-pill">${esc(x)}</span>`).join('');
    $('#mLinks').innerHTML=`${r.discogs_url?`<a class="ext-link" href="${esc(r.discogs_url)}" target="_blank" rel="noopener">Release on Discogs ↗</a>`:''}<button class="btn-sec" id="mForceBtn" onclick="forceDiscogs()">Refresh Discogs</button>`;
    $('#mNote').innerHTML=r.note?esc(r.note):'';
    $('#mNote').style.display=r.note?'block':'none';
    const modalTracks=tracks(r);
    $('#mTl').style.display=modalTracks.length ? 'block' : 'none';
    $('#mTlC').innerHTML=trackHtml(r).replaceAll('tl-','m-tl-');
    renderRelated(r);
    $('#detOv').classList.add('on'); $('#detOv').setAttribute('aria-hidden','false'); lockPage(); $('#detModal').focus();
  }
  window.openModal=openModal;

  function current(){ return state.records.find(r=>r.id===state.currentId) || state.filtered.find(r=>r.id===state.currentId); }

  function renderModalState(r){
    $('#mStateBox').innerHTML=`<div class="m-state-row"><button type="button" class="m-listen-btn ${r.listened?'on':''}" onclick="toggleListened()" title="Listened">♪</button><span class="m-state-divider"></span><div class="m-rating-row"><button type="button" class="m-rate-btn disliked ${reactionValue(r)==='disliked'?'on':''}" onclick="setReaction('disliked')" title="Disliked">⌄</button><button type="button" class="m-rate-btn liked ${reactionValue(r)==='liked'?'on':''}" onclick="setReaction('liked')" title="Liked">⌃</button><button type="button" class="m-rate-btn favorite ${reactionValue(r)==='favorite'?'on':''}" onclick="setReaction('favorite')" title="Favorite">★</button></div></div>${r.listened_at?`<span class="listened-stamp">Last listened ${esc(new Date(r.listened_at).toLocaleDateString())}</span>`:''}`;
  }

  function renderModalCollections(r){
    const selected = new Set(collectionIdsForRecord(r));
    const names = collectionNames(r);
    const available = visibleCollectionRows(state.collections).filter(c => !selected.has(c.id));
    const chips = names.map(n=>{
      const c = state.collections.find(x=>x.name===n || x.id===n);
      const id = c?.id || n;
      return `<span class="m-collection-chip">${esc(n)} <button type="button" class="m-collection-chip-remove" title="Remove ${esc(n)}" onclick="removeCollectionFromCurrent('${esc(id)}')">×</button></span>`;
    }).join('') || '<span class="collection-hint">No extra collection labels</span>';
    $('#mCollectionBox').innerHTML=`<div class="m-collection-head">Collections</div><div class="m-collection-row">${chips}<button type="button" class="m-collection-add-btn" onclick="toggleModalCollectionPicker()" title="Add collection label">+</button></div><div class="m-collection-picker" id="modalCollectionPicker" hidden><div class="m-collection-picker-title">Add collection label</div>${available.length?available.map(c=>`<button type="button" class="m-collection-option" onclick="addCollectionToCurrent('${esc(c.id)}')"><span class="m-collection-option-check">+</span><span>${esc(c.name)}</span><small>Add</small></button>`).join(''):'<div class="collection-hint" style="padding:.5rem">All labels already assigned.</div>'}<button type="button" class="m-collection-option" onclick="createCollectionForCurrent()"><span class="m-collection-option-check">+</span><span>New label…</span><small>Create</small></button></div>`;
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

  function closeModal(){ $('#detOv').classList.remove('on'); $('#detOv').setAttribute('aria-hidden','true'); state.currentId=null; unlockPage(); }
  window.closeModal=closeModal;

  async function saveRecord(r,patch,action='record_update', reopen=true){
    if(patch && Object.prototype.hasOwnProperty.call(patch,'collections')) patch.collections = internalCollections(patch.collections);
    if(!r) return;
    setSync('Saving');
    const linkIds = patch && Object.prototype.hasOwnProperty.call(patch,'collection_ids') ? arr(patch.collection_ids) : null;
    const payload={...patch, updated_at:new Date().toISOString()};
    delete payload.collection_ids;
    const {data,error}=await SB.from('records').update(payload).eq('id',r.id).eq('user_id',state.user.id).select(FIELDS).single();
    if(error){ setSync('Save error'); alert(error.message); return; }
    if(linkIds){
      try{ await syncRecordCollections(data.id, linkIds); }catch(e){ setSync('Collection save error'); alert(e.message); return; }
      data.collection_ids = linkIds;
    }
    await logChange(action,r,data);
    const idx=state.records.findIndex(x=>x.id===r.id);
    if(idx>=0) state.records[idx]=normalizeRecord(data);
    applyFilters();
    if(reopen){ const fi=state.filtered.findIndex(x=>x.id===data.id); if(fi>=0) openModal(fi); }
  }

  async function logChange(action,before,after){
    try{ await SB.from('change_log').insert({user_id:state.user.id,action,before_data:before||null,after_data:after||null}); }catch(e){}
  }

  async function syncRecordCollections(recordId, ids){
    const clean=[...new Set(arr(ids).filter(Boolean).filter(id => !isRecordCabinet(id)))];
    const del=await SB.from('record_collections').delete().eq('user_id',state.user.id).eq('record_id',recordId);
    if(del.error) throw del.error;
    if(clean.length){
      const rows=clean.map(collection_id => ({user_id:state.user.id, record_id:recordId, collection_id}));
      const ins=await SB.from('record_collections').insert(rows);
      if(ins.error) throw ins.error;
    }
  }

  function toggleModalCollectionPicker(){ const p=$('#modalCollectionPicker'); if(p) p.hidden=!p.hidden; }
  window.toggleModalCollectionPicker=toggleModalCollectionPicker;
  async function addCollectionToCurrent(collectionId){
    const r=current(); if(!r || !collectionId || isRecordCabinet(collectionId)) return;
    const ids=[...new Set([...collectionIdsForRecord(r), collectionId])];
    await saveRecord(r,{collection_ids:ids, collections:internalCollections(ids)},'collection_update');
  }
  window.addCollectionToCurrent=addCollectionToCurrent;
  async function removeCollectionFromCurrent(collectionId){
    const r=current(); if(!r || !collectionId || isRecordCabinet(collectionId)) return;
    const ids=collectionIdsForRecord(r).filter(id=>id!==collectionId);
    await saveRecord(r,{collection_ids:ids, collections:internalCollections(ids)},'collection_update');
  }
  window.removeCollectionFromCurrent=removeCollectionFromCurrent;
  async function createCollectionForCurrent(){
    const name=prompt('New collection label');
    if(!name || !name.trim()) return;
    if(isRecordCabinet(name)){ alert('Record Cabinet is the hidden base layer, not a visible label.'); return; }
    const id=name.trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
    const {error}=await SB.from('collections').upsert({id,name:name.trim(),user_id:state.user.id,locked:false},{onConflict:'user_id,id'});
    if(error){ alert(error.message); return; }
    await loadAll();
    await addCollectionToCurrent(id);
  }
  window.createCollectionForCurrent=createCollectionForCurrent;

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
    $('#fOv').classList.add('on'); lockPage(); $('#fOv').setAttribute('aria-hidden','false');
  }
  window.openForm=openForm;
  function closeForm(){ $('#fOv').classList.remove('on'); $('#fOv').setAttribute('aria-hidden','true'); unlockPage(); }
  window.closeForm=closeForm;

  function renderCollectionSelect(r){
    const selected=new Set(collectionIdsForRecord(r||{}));
    $('#fldCollections').innerHTML=state.collections.map(c=>`<option value="${esc(c.id)}" ${selected.has(c.id)?'selected':''}>${esc(c.name)}</option>`).join('');
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
      collection_ids:[...document.querySelector('#fldCollections').selectedOptions].map(o=>o.value),
      collections:internalCollections([...document.querySelector('#fldCollections').selectedOptions].map(o=>o.value)),
      user_id:state.user.id,
      updated_at:new Date().toISOString()
    };
    if(!payload.shelf_id || !payload.artist){ alert('Shelf ID and Artist are required.'); return; }
    if(r){
      await saveRecord(r,payload,'record_edit',false);
    }else{
      const {data,error}=await SB.from('records').upsert(payload,{onConflict:'user_id,shelf_id'}).select(FIELDS).single();
      if(error){ alert(error.message); return; }
      try{ await syncRecordCollections(data.id, payload.collection_ids); }catch(e){ alert(e.message); return; }
      data.collection_ids = payload.collection_ids;
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

  function setView(v){ state.view=v; if(v==='flow' && state.filtered[state.cfIndex]) state.cfActiveId=state.filtered[state.cfIndex].id; render(); }
  window.setView=setView;
  function setGroup(v){ state.group=v; state.cfIndex=0; state.cfActiveId=null; render(); }
  window.setGroup=setGroup;
  function setSecondaryGroup(v){ state.secondary=v; state.cfIndex=0; state.cfActiveId=null; render(); }
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

  function openSett(){ renderUserSettings(); $('#sOv').classList.add('on'); $('#sOv').setAttribute('aria-hidden','false'); lockPage(); }
  window.openSett=openSett;
  function closeSett(){ $('#sOv').classList.remove('on'); $('#sOv').setAttribute('aria-hidden','true'); unlockPage(); }
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
    const rows=visibleCollectionRows(state.collections);
    list.innerHTML=rows.map(c=>`<div class="collection-item"><div><div class="collection-name">${esc(c.name)}</div><div class="collection-meta">${esc(c.id)}</div></div><div style="display:flex;gap:.35rem"><button class="btn-sec" onclick="renameCollection('${esc(c.id)}')">Rename</button><button class="btn-sec dng" onclick="deleteCollection('${esc(c.id)}')">Remove</button></div></div>`).join('') || '<div class="tip">No collection labels yet.</div>';
  }

  async function addCollection(){
    const name=$('#newCollectionName').value.trim(); if(!name) return;
    if(isRecordCabinet(name)){ alert('Record Cabinet is the implicit base collection and is not shown as a label.'); return; }
    const id=name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
    const {error}=await SB.from('collections').upsert({id,name,user_id:state.user.id,locked:false},{onConflict:'user_id,id'});
    if(error){ alert(error.message); return; }
    $('#newCollectionName').value=''; await loadAll(); renderUserSettings();
  }
  window.addCollection=addCollection;
  async function renameCollection(id){
    if(isRecordCabinet(id)){ alert('Record Cabinet is implicit and cannot be renamed.'); return; }
    const row=state.collections.find(c=>c.id===id); if(!row) return;
    const name=prompt('Rename collection label', row.name);
    if(!name || !name.trim() || name.trim()===row.name) return;
    if(isRecordCabinet(name)){ alert('Record Cabinet is the hidden base layer, not a visible label.'); return; }
    const {error}=await SB.from('collections').update({name:name.trim()}).eq('user_id',state.user.id).eq('id',id);
    if(error){ alert(error.message); return; }
    await loadAll(); renderUserSettings(); if(state.currentId){ const r=current(); if(r) renderModalCollections(r); }
  }
  window.renameCollection=renameCollection;
  async function deleteCollection(id){
    if(isRecordCabinet(id)){ alert('Record Cabinet is implicit and cannot be removed as a visible label.'); return; }
    if(!confirm('Remove this collection label?')) return;
    const linkDel=await SB.from('record_collections').delete().eq('user_id',state.user.id).eq('collection_id',id);
    if(linkDel.error){ alert(linkDel.error.message); return; }
    const {error}=await SB.from('collections').delete().eq('user_id',state.user.id).eq('id',id);
    if(error){ alert(error.message); return; }
    await loadAll(); renderUserSettings();
  }
  window.deleteCollection=deleteCollection;

  function saveSett(){ localStorage.setItem('dw_discogs_token',$('#stToken').value.trim()); renderUserSettings(); }
  window.saveSett=saveSett;
  function fetchMissingDiscogs(){ alert('Bulk Discogs fetching is intentionally not enabled yet. Refresh per record for now.'); }
  window.fetchMissingDiscogs=fetchMissingDiscogs;
  function csvEscape(v){ const str=String(v??''); return /[",\n;]/.test(str) ? '"'+str.replace(/"/g,'""')+'"' : str; }
  function collectionExportName(r){ return collectionNames(r).join('; '); }
  function recordsForExport(){ return [...state.records].sort(shelfCompare); }
  function downloadBlob(name, type, content){ const blob=new Blob([content],{type}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),1500); }
  function exportCsv(){
    const headers=['Shelf ID','Artist','Album','First name','Last name','Copies owned','Listened','Reaction','Grail','Collections','Genre','Year','Label','Country','Discogs URL','Cover URL','Notes','Tracklist'];
    const rows=recordsForExport().map(r=>[recordCode(r),r.artist,r.album,r.first,r.last,r.copies_owned,r.listened?'yes':'no',reactionValue(r),r.grail?'yes':'no',collectionExportName(r),r.genre,displayYear(r),r.label,r.country,r.discogs_url,coverUrl(r),r.note,tracks(r).map(t=>[t.position,t.title,t.duration].filter(Boolean).join(' | ')).join('\n')]);
    downloadBlob(`dead-wax-collection-${new Date().toISOString().slice(0,10)}.csv`,'text/csv;charset=utf-8',[headers,...rows].map(row=>row.map(csvEscape).join(',')).join('\n'));
  }
  window.exportCsv=exportCsv;
  function exportExcel(){
    const headers=['Shelf ID','Artist','Album','First name','Last name','Copies owned','Listened','Reaction','Grail','Collections','Genre','Year','Label','Country','Discogs URL','Cover URL','Notes'];
    const body=recordsForExport().map(r=>`<tr>${[recordCode(r),r.artist,r.album,r.first,r.last,r.copies_owned,r.listened?'yes':'no',reactionValue(r),r.grail?'yes':'no',collectionExportName(r),r.genre,displayYear(r),r.label,r.country,r.discogs_url,coverUrl(r),r.note].map(x=>`<td>${esc(x)}</td>`).join('')}</tr>`).join('');
    const html=`<!doctype html><html><head><meta charset="utf-8"><style>td,th{border:1px solid #999;padding:4px;font-family:Arial;font-size:11pt}th{background:#eee}</style></head><body><table><thead><tr>${headers.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></body></html>`;
    downloadBlob(`dead-wax-collection-${new Date().toISOString().slice(0,10)}.xls`,'application/vnd.ms-excel;charset=utf-8',html);
  }
  window.exportExcel=exportExcel;
  function exportPdf(){
    const w=window.open('','_blank');
    const rows=recordsForExport().map(r=>`<tr><td>${esc(recordCode(r))}</td><td>${esc(r.artist)}</td><td>${esc(r.album)}</td><td>${esc(collectionExportName(r))}</td><td>${esc(r.genre||'')}</td></tr>`).join('');
    w.document.write(`<!doctype html><html><head><title>Dead Wax Collection</title><style>body{font-family:Arial,sans-serif;padding:24px;color:#111}h1{font-family:Georgia,serif}table{border-collapse:collapse;width:100%}th,td{border-bottom:1px solid #ddd;text-align:left;padding:6px 8px;font-size:11px}th{background:#f2f2f2}.meta{color:#666;margin-bottom:18px}@media print{button{display:none}}</style></head><body><button onclick="window.print()">Save as PDF / Print</button><h1>Dead Wax Collection</h1><div class="meta">${state.records.length} records · exported ${new Date().toLocaleString()}</div><table><thead><tr><th>Shelf ID</th><th>Artist</th><th>Album</th><th>Collections</th><th>Genre</th></tr></thead><tbody>${rows}</tbody></table><script>setTimeout(()=>window.print(),400)<\/script></body></html>`);
    w.document.close();
  }
  window.exportPdf=exportPdf;
  function parseCsv(text){ const rows=[]; let row=[], cell='', q=false; for(let i=0;i<text.length;i++){ const ch=text[i], nx=text[i+1]; if(q){ if(ch==='"'&&nx==='"'){cell+='"';i++;} else if(ch==='"'){q=false;} else cell+=ch; } else if(ch==='"') q=true; else if(ch===','||ch===';'){ row.push(cell); cell=''; } else if(ch==='\n'){ row.push(cell); rows.push(row); row=[]; cell=''; } else if(ch!=='\r') cell+=ch; } row.push(cell); rows.push(row); return rows.filter(r=>r.some(c=>String(c).trim())); }
  function getField(obj, names){ for(const n of names){ const k=Object.keys(obj).find(x=>norm(x)===norm(n)); if(k && obj[k]!==undefined) return obj[k]; } return ''; }
  async function handleImport(event){
    const file=event?.target?.files?.[0]; if(!file) return;
    if(!/\.csv$|\.txt$/i.test(file.name)){ alert('For now this native importer accepts CSV. Excel can export as CSV, and full .xlsx support can be added later.'); return; }
    const rows=parseCsv(await file.text()); if(rows.length<2){ alert('No rows found.'); return; }
    const headers=rows[0].map(h=>String(h).trim());
    const objects=rows.slice(1).map(r=>Object.fromEntries(headers.map((h,i)=>[h,r[i]||''])));
    const valid=objects.map((o,i)=>({o,i:i+2,artist:getField(o,['artist','artist name','artis']),album:getField(o,['album','title','record','release'])})).filter(x=>x.artist.trim() && x.album.trim());
    if(!valid.length){ alert('Import needs at least Artist and Album columns. Shelf ID, First name and Last name are optional.'); return; }
    if(!confirm(`Import ${valid.length} records from CSV? Artist and Album are required; Shelf ID is optional.`)) return;
    setSync('Importing CSV'); let ok=0, fail=0;
    for(const {o,artist,album} of valid){
      const shelf=(getField(o,['shelf id','shelf_id','code','id'])||'').trim();
      const cols=(getField(o,['collections','collection','labels'])||'').split(/[|;]/).map(x=>x.trim()).filter(Boolean).filter(x=>!isRecordCabinet(x));
      const colIds=[];
      for(const name of cols){ const id=name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,''); if(!id) continue; const {error}=await SB.from('collections').upsert({id,name,user_id:state.user.id,locked:false},{onConflict:'user_id,id'}); if(!error) colIds.push(id); }
      const payload={user_id:state.user.id,shelf_id:shelf||null,artist:artist.trim(),album:album.trim(),first:getField(o,['first','first name']).trim(),last:getField(o,['last','last name']).trim(),copies_owned:Number(getField(o,['copies','copies owned','owned'])||1),genre:getField(o,['genre']).trim(),discogs_url:getField(o,['discogs url','discogs','url']).trim(),note:getField(o,['notes','note']).trim(),collections:internalCollections(colIds),updated_at:new Date().toISOString()};
      let res=shelf ? await SB.from('records').upsert(payload,{onConflict:'user_id,shelf_id'}).select('id').single() : await SB.from('records').insert(payload).select('id').single();
      if(res.error){ fail++; continue; }
      try{ await syncRecordCollections(res.data.id,colIds); }catch(e){} ok++;
    }
    await logChange('csv_import',null,{ok,fail,total:valid.length}); alert(`CSV import complete: ${ok} imported, ${fail} failed.`); event.target.value=''; await loadAll();
  }
  window.handleImport=handleImport;
  function exportDiscogsDb(){ alert('This Supabase-native build does not export dead_wax_db.js. Use CSV, Excel-compatible .xls, or PDF from Database settings.'); }
  window.exportDiscogsDb=exportDiscogsDb;
  function clearDgCache(){ alert('No record cache is used as source of truth in this native build.'); }
  window.clearDgCache=clearDgCache;
  function openWebViewer(){ window.open('web.html','_blank'); }
  window.openWebViewer=openWebViewer;

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


  function ensureDatabaseTools(){
    const panel=$('#userPanelDatabase .settings-section');
    if(panel && !$('#dwExportTools')){
      panel.insertAdjacentHTML('beforeend',`<div class="s-btns" id="dwExportTools"><button type="button" class="btn-sec" onclick="exportCsv()">Download CSV</button><button type="button" class="btn-sec" onclick="exportExcel()">Download Excel</button><button type="button" class="btn-sec" onclick="exportPdf()">Download PDF</button><button type="button" class="btn-sec" onclick="document.getElementById('importFile').click()">Upload CSV</button></div><div class="tip">CSV import requires Artist and Album. Shelf ID, First name and Last name are optional. Extra columns such as Collection, Genre, Discogs URL, Notes and Copies are used when present.</div>`);
    }
    const f=$('#importFile'); if(f) f.setAttribute('accept','.csv,.txt');
  }

  function ensureExactStaticAdditions(){
    const gs=$('#groupSelect');
    if(gs && ![...gs.options].some(o=>o.value==='shelf')){
      gs.insertAdjacentHTML('beforeend','<option value="shelf">Shelf ID</option>');
    }
    const menu=$('#userMenu');
    if(menu && !menu.querySelector('[data-dw-signout]')){
      menu.insertAdjacentHTML('beforeend','<button type="button" class="user-menu-item" role="menuitem" data-dw-signout onclick="signOut()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/></svg><span>Sign out</span></button>');
    }
  }

  function bindEvents(){
    ensureExactStaticAdditions(); ensureDatabaseTools();
    $('#gSearch')?.addEventListener('input',e=>{ state.filters.global=e.target.value; renderSearchFlyout(e.target.value); applyFilters(); });
    [['fCode','code'],['fArtist','artist'],['fLast','last'],['fFirst','first'],['fAlbum','album']].forEach(([id,k])=>$('#'+id)?.addEventListener('input',e=>{state.filters[k]=e.target.value; applyFilters();}));
    $('#fGenre')?.addEventListener('change',e=>{state.filters.genre=e.target.value; applyFilters();});
    $('#fListened')?.addEventListener('change',e=>{state.filters.listened=e.target.checked; applyFilters();});
    $('#fDoubles')?.addEventListener('change',e=>{state.filters.doubles=e.target.checked; applyFilters();});
    $('#fRating')?.addEventListener('change',e=>{state.filters.rating=e.target.value; applyFilters();});
    $('#fLastListened')?.addEventListener('change',e=>{state.filters.lastListened=e.target.value; applyFilters();});
    $('#fGrail')?.addEventListener('change',e=>{state.filters.grail=e.target.checked; applyFilters();});
    $('#btnClr')?.addEventListener('click',()=>{ state.filters={global:'', code:'', artist:'', last:'', first:'', album:'', genre:'', listened:false, doubles:false, rating:'', lastListened:'', grail:false}; ['gSearch','fCode','fArtist','fLast','fFirst','fAlbum'].forEach(id=>$('#'+id)&&( $('#'+id).value='' )); ['fGenre','fRating','fLastListened'].forEach(id=>$('#'+id)&&($('#'+id).value='')); ['fListened','fDoubles','fGrail'].forEach(id=>$('#'+id)&&($('#'+id).checked=false)); applyFilters(); });
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
    $('#cfStage')?.addEventListener('wheel',cfHandleWheel,{passive:false});
    document.addEventListener('keydown',e=>{
      if(e.key==='Escape'){ closeSf(); closeUserMenu(); }
      if(state.view==='flow' && (e.key==='ArrowRight'||e.key==='ArrowLeft')){ e.preventDefault(); cfStep(e.key==='ArrowRight'?1:-1); }
      if(state.view==='flow' && (e.key==='Enter'||e.key===' ')){ if(!['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)){ e.preventDefault(); const entries=cfClamp(); const active=entries[state.cfIndex]?.record; if(active) openRecordById(active.id); } }
    });
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
