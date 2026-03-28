import { useState, useEffect, useRef } from "react";
import { supabase } from './lib/supabase.js';

// ─── Constantes ───────────────────────────────────────────────────────────────
const PLAN_LIMITS = {
  free:    { groups: 1, players: 30 },
  premium: { groups: 7, players: 30 },
};
const POSITIONS_LINE = [
  { id:"fixo", label:"Fixo",  short:"FX",  color:"#4FC3F7", emoji:"🛡️" },
  { id:"ala",  label:"Ala",   short:"ALA", color:"#FF8A65", emoji:"⚡"  },
  { id:"meia", label:"Meia",  short:"MIA", color:"#81C784", emoji:"⚙️" },
  { id:"pivo", label:"Pivô",  short:"PIV", color:"#CE93D8", emoji:"🎯" },
];
const POSITION_GK  = { id:"goleiro", label:"Goleiro", short:"GL", color:"#FFD700", emoji:"🧤" };
const ALL_POS      = [POSITION_GK, ...POSITIONS_LINE];
const POS          = Object.fromEntries(ALL_POS.map(p => [p.id, p]));
const FORMATIONS   = { 5:["fixo","ala","ala","meia","pivo"], 6:["fixo","fixo","ala","ala","meia","pivo"] };
const PITCH_SLOTS  = {
  5:[{pos:"pivo",x:50,y:16},{pos:"ala",x:14,y:36},{pos:"ala",x:86,y:36},{pos:"meia",x:50,y:55},{pos:"fixo",x:50,y:74}],
  6:[{pos:"pivo",x:50,y:14},{pos:"ala",x:14,y:33},{pos:"ala",x:86,y:33},{pos:"meia",x:50,y:52},{pos:"fixo",x:26,y:72},{pos:"fixo",x:74,y:72}],
};
const TEAM_COLORS  = [
  { name:"Branco",   bg:"#f0f0f0", text:"#111",    accent:"#d5d5d5", gkBg:"#e0e0e0" },
  { name:"Preto",    bg:"#181818", text:"#f0f0f0", accent:"#2a2a2a", gkBg:"#222"    },
  { name:"Vermelho", bg:"#991b1b", text:"#fff",    accent:"#b91c1c", gkBg:"#7f1d1d" },
  { name:"Azul",     bg:"#1e3a8a", text:"#fff",    accent:"#1d4ed8", gkBg:"#1e3a8a" },
];
const GROUP_EMOJIS = ["⚽","🏆","🥇","🔥","⭐","🎯","🦁","🐯","🦊","🐺"];
const FONT         = "'Barlow Condensed', Arial Narrow, Arial, sans-serif";

// ─── Supabase helpers ─────────────────────────────────────────────────────────
function dbToPlayer(p) {
  return {
    ...p,
    isGoalkeeper: p.is_goalkeeper ?? false,
    positions:    Array.isArray(p.positions) ? p.positions : [],
    aliases:      Array.isArray(p.aliases)   ? p.aliases   : [],
  };
}

async function loadProfile(userId) {
  const { data } = await supabase.from('profiles').select('*').eq('id', userId).single();
  return data;
}
async function saveProfileName(userId, name) {
  await supabase.from('profiles').update({ name }).eq('id', userId);
}

async function loadGroups(userId) {
  const { data, error } = await supabase.from('groups').select('*').eq('user_id', userId).order('created_at', { ascending:true });
  if (error) { console.error('loadGroups:', error); return []; }
  return data.map(g => ({ id:g.id, name:g.name, emoji:g.emoji||'⚽', playerCount:g.player_count||0 }));
}
async function upsertGroup(group, userId) {
  const { error } = await supabase.from('groups').upsert({ id:group.id, name:group.name, emoji:group.emoji||'⚽', player_count:group.playerCount||0, user_id:userId }, { onConflict:'id' });
  if (error) console.error('upsertGroup:', error);
}
async function updateGroupCount(groupId, count) {
  await supabase.from('groups').update({ player_count:count }).eq('id', groupId);
}
async function deleteGroupById(id) {
  await supabase.from('groups').delete().eq('id', id);
}

async function loadPlayers(groupId) {
  const { data, error } = await supabase.from('players').select('*').eq('group_id', groupId).order('created_at', { ascending:true });
  if (error) { console.error('loadPlayers:', error); return []; }
  return data.map(dbToPlayer);
}
async function upsertPlayer(player, groupId, userId) {
  const { error } = await supabase.from('players').upsert({
    id: player.id, group_id: groupId, user_id: userId,
    name: player.name, is_goalkeeper: player.isGoalkeeper||false,
    positions: player.positions||[], aliases: player.aliases||[],
    foot: player.foot||'direita', side: player.side||'ambos',
    fisico: player.fisico||2, defensivo: player.defensivo||2, ofensivo: player.ofensivo||2,
  }, { onConflict:'id' });
  if (error) console.error('upsertPlayer:', error);
}
async function deletePlayerById(id) {
  await supabase.from('players').delete().eq('id', id);
}

async function loadWeekPlayers(groupId, allPlayers) {
  const today = new Date().toISOString().split('T')[0];
  const { data, error } = await supabase.from('week_players').select('*').eq('group_id', groupId).eq('week_date', today);
  if (error) { console.error('loadWeekPlayers:', error); return { line:[], gk:[] }; }
  const enrich = wp => {
    if (!wp.is_avulso && wp.player_id) {
      const full = allPlayers.find(p => p.id === wp.player_id);
      if (full) return full;
    }
    return { id:wp.player_id||wp.id, name:wp.player_name, isGoalkeeper:wp.is_goalkeeper, avulso:wp.is_avulso, positions:["ala"], aliases:[], foot:'direita', side:'ambos', fisico:2, defensivo:2, ofensivo:2 };
  };
  return { line:data.filter(p=>!p.is_goalkeeper).map(enrich), gk:data.filter(p=>p.is_goalkeeper).map(enrich) };
}
async function saveWeekPlayers(groupId, userId, linePlayers, gkPlayers) {
  const today = new Date().toISOString().split('T')[0];
  await supabase.from('week_players').delete().eq('group_id', groupId).eq('week_date', today);
  const rows = [
    ...linePlayers.map((p,i) => ({ id:`${groupId}_l${i}_${today}`, group_id:groupId, user_id:userId, player_id:!p.avulso?p.id:null, player_name:p.name, week_date:today, is_goalkeeper:false, is_avulso:p.avulso||false })),
    ...gkPlayers.map((p,i)   => ({ id:`${groupId}_g${i}_${today}`, group_id:groupId, user_id:userId, player_id:!p.avulso?p.id:null, player_name:p.name, week_date:today, is_goalkeeper:true,  is_avulso:p.avulso||false })),
  ];
  if (rows.length > 0) {
    const { error } = await supabase.from('week_players').insert(rows);
    if (error) console.error('saveWeekPlayers:', error);
  }
}
async function clearWeekPlayers(groupId) {
  const today = new Date().toISOString().split('T')[0];
  await supabase.from('week_players').delete().eq('group_id', groupId).eq('week_date', today);
}

// ─── Utils ────────────────────────────────────────────────────────────────────
function normName(s) {
  return (s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9 ]/g,"").trim();
}
function stripExtras(s) {
  return s.replace(/[\u{1F000}-\u{1FFFF}]/gu,"").replace(/[\u2600-\u27BF]/g,"").replace(/[^\w\s\u00C0-\u024F]/g,"").replace(/\s+/g," ").trim();
}
function fuzzyMatch(rawName, players) {
  const norm=normName(rawName); const words=norm.split(" ").filter(Boolean);
  if (!words.length) return null;
  for (const p of players) { const al=(p.aliases||[]).map(a=>normName(a)); if (al.includes(norm)) return p; }
  for (const p of players) { const al=(p.aliases||[]).map(a=>normName(a)); if (al.some(a=>a.startsWith(words[0])||words[0].startsWith(a.split(" ")[0]))) return p; }
  let m=players.find(p=>normName(p.name)===norm); if (m) return m;
  m=players.find(p=>normName(p.name).split(" ")[0]===words[0]); if (m) return m;
  if (words.length>=2) { m=players.find(p=>{const pn=normName(p.name);return words.every(w=>w.length>1&&pn.includes(w));}); if (m) return m; }
  return players.find(p=>normName(p.name).startsWith(words[0]))||null;
}
function parseWhatsApp(text, players) {
  const lines=text.split("\n").map(l=>l.trim()).filter(Boolean);
  let mode="line"; const lineNames=[],gkNames=[];
  for (const line of lines) {
    const plain=normName(line);
    if (/^goleiro/.test(plain)){mode="gk";continue;}
    if (/^fora/.test(plain)||/^ausente/.test(plain)){mode="fora";continue;}
    if (mode==="fora") continue;
    if (mode==="line"){const m=line.match(/^(\d+)\s*[\.\-\s]\s*(.+)/);if(m){const n=stripExtras(m[2]);if(n.length>1)lineNames.push(n);}}
    else if(mode==="gk"){if(line.match(/^\d+[\.\-]/))continue;const n=stripExtras(line);if(n.length>1)gkNames.push(n);}
  }
  const dbLine=players.filter(p=>!p.isGoalkeeper), dbGK=players.filter(p=>p.isGoalkeeper);
  return {
    lineResult:lineNames.map(raw=>{const found=fuzzyMatch(raw,dbLine);return{raw,player:found,matched:!!found};}),
    gkResult:  gkNames.map(raw=>{const found=fuzzyMatch(raw,dbGK)||fuzzyMatch(raw,dbLine);return{raw,player:found,matched:!!found};}),
  };
}
function playerScore(p){return(p.fisico||1)+(p.defensivo||1)+(p.ofensivo||1);}
function makeGhost(pos){return{id:"ghost_"+pos+"_"+Math.random(),name:"Da fila",assignedPos:pos,isGhost:true,positions:[pos],fisico:1,defensivo:1,ofensivo:1};}
function assignPositions(team,formation){
  const slots=[...formation],filled=new Array(slots.length).fill(false);
  const result=team.map(p=>({...p,assignedPos:null}));
  const order=[...result.keys()].sort((a,b)=>(result[a].positions?.length||1)-(result[b].positions?.length||1));
  for(const idx of order){
    const pl=result[idx];let done=false;
    for(let i=0;i<slots.length;i++){if(!filled[i]&&(pl.positions||[]).includes(slots[i])){result[idx].assignedPos=slots[i];filled[i]=true;done=true;break;}}
    if(!done){const e=filled.findIndex(f=>!f);if(e>=0){result[idx].assignedPos=slots[e];filled[e]=true;}}
  }
  return result;
}
function balanceTeams(linePlayers,teamSize){
  const formation=FORMATIONS[teamSize];
  const numFull=Math.min(4,Math.floor(linePlayers.length/teamSize));
  if(numFull<2)return null;
  const pool=linePlayers.slice(0,numFull*teamSize),extra=linePlayers.slice(numFull*teamSize);
  const shuffle=a=>[...a].sort(()=>Math.random()-.5);
  let best=null,bestScore=-Infinity;
  for(let i=0;i<600;i++){
    const s=shuffle(pool);
    const teams=Array.from({length:numFull},(_,k)=>assignPositions(s.slice(k*teamSize,(k+1)*teamSize),formation));
    const totals=teams.map(t=>t.reduce((a,p)=>a+playerScore(p),0));
    const avg=totals.reduce((a,b)=>a+b,0)/numFull;
    const variance=totals.reduce((s,t)=>s+Math.pow(t-avg,2),0);
    const posFit=teams.reduce((a,t)=>a+t.filter(p=>(p.positions||[]).includes(p.assignedPos)).length,0);
    const sc=-variance+posFit*6;
    if(sc>bestScore){bestScore=sc;best=teams;}
  }
  if(extra.length>0&&numFull<4)best=[...best,[...assignPositions(extra,formation.slice(0,extra.length)),...formation.slice(extra.length).map(makeGhost)]];
  return best;
}

function shareWhatsApp(teams, weekGK, assignedGKs) {
  const ICONS = ["🤍","🖤","❤️","💙"];
  let text = "⚽ *RACHÃO FC — TIMES DE HOJE* ⚽\n\n";
  teams.forEach((team, i) => {
    const tc = TEAM_COLORS[i % TEAM_COLORS.length];
    text += `${ICONS[i]||"⚽"} *TIME ${i+1} — ${tc.name.toUpperCase()}*\n`;
    const gk = assignedGKs[i];
    if (gk) text += `🧤 GL: ${gk}\n`;
    team.filter(p=>!p.isGhost).forEach((p,j) => {
      const pd = POS[p.assignedPos];
      text += `${j+1}. ${p.name}${pd?` _(${pd.short})_`:""}\n`;
    });
    if (team.some(p=>p.isGhost)) text += `_+ jogador da fila_\n`;
    text += "\n";
  });
  text += "_Gerado pelo Rachão FC_ ⚽";
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
}

// ─── CSS ──────────────────────────────────────────────────────────────────────
const GLOBAL_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;600;700;800;900&display=swap');
  *{-webkit-tap-highlight-color:transparent;box-sizing:border-box;}
  body{margin:0;background:#060d06;}
  input::placeholder,textarea::placeholder{color:#1e3a1e;}
  select option{background:#0a130a;color:#e8f5e8;}
  button:active{opacity:.82;transform:scale(0.97);}
  @keyframes pop{0%{opacity:0;transform:translateX(-50%) scale(0.85)}100%{opacity:1;transform:translateX(-50%) scale(1)}}
`;
const S = {
  card:  (x={})=>({background:"#0d160d",border:"1px solid #162616",borderRadius:12,padding:14,marginBottom:12,...x}),
  lbl:   (x={})=>({fontSize:10,color:"#3a5a3a",letterSpacing:2.5,textTransform:"uppercase",marginBottom:8,fontWeight:700,...x}),
  inp:   {width:"100%",background:"#0a130a",border:"1px solid #1e3a1e",color:"#e8f5e8",padding:"11px 13px",borderRadius:8,fontSize:15,outline:"none",boxSizing:"border-box",fontFamily:FONT},
  sel:   (x={})=>({background:"#0a130a",border:"1px solid #1e3a1e",color:"#e8f5e8",padding:"8px 12px",borderRadius:8,fontSize:13,outline:"none",fontFamily:FONT,...x}),
  btnG:  (x={})=>({background:"linear-gradient(135deg,#16a34a,#15803d)",color:"#fff",border:"none",borderRadius:8,padding:"12px",fontSize:14,fontWeight:800,cursor:"pointer",letterSpacing:1,textTransform:"uppercase",width:"100%",marginTop:8,boxShadow:"0 4px 16px #16a34a44",fontFamily:FONT,...x}),
  btnSm: (col,x={})=>({background:"transparent",color:col,border:`1px solid ${col}33`,borderRadius:6,padding:"4px 10px",fontSize:11,cursor:"pointer",fontWeight:700,fontFamily:FONT,...x}),
};

// ─── Componentes pequenos ─────────────────────────────────────────────────────
function Badge({posId}){const p=POS[posId]||{short:"?",color:"#888",emoji:"?"};return<span style={{background:p.color+"22",color:p.color,border:`1px solid ${p.color}44`,borderRadius:20,padding:"1px 7px",fontSize:10,fontWeight:800,letterSpacing:0.5,whiteSpace:"nowrap"}}>{p.emoji} {p.short}</span>;}
function Stars({value,color}){return<span>{[1,2,3].map(v=><span key={v} style={{color:v<=(value||1)?color:"#1e2e1e",fontSize:13}}>★</span>)}</span>;}
function Toast({msg,type}){return<div style={{position:"fixed",top:14,left:"50%",transform:"translateX(-50%)",background:type==="err"?"#7f1d1d":"#14532d",color:"#fff",padding:"10px 22px",borderRadius:24,fontSize:13,fontWeight:700,zIndex:9999,border:`1px solid ${type==="err"?"#f87171":"#4ade80"}`,boxShadow:"0 4px 24px #00000099",animation:"pop .22s cubic-bezier(.34,1.56,.64,1)",whiteSpace:"nowrap"}}>{msg}</div>;}
function Loader({text="CARREGANDO..."}){return<div style={{minHeight:"100vh",background:"#060d06",display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:12,fontFamily:FONT}}><div style={{fontSize:48}}>⚽</div><div style={{fontSize:11,color:"#3a5a3a",letterSpacing:3}}>{text}</div></div>;}

// ─── Pitch ────────────────────────────────────────────────────────────────────
function Pitch({team,teamSize,tc}){
  const slots=PITCH_SLOTS[teamSize]||PITCH_SLOTS[5];
  const posGroups={};
  team.forEach(p=>{const ap=p.assignedPos||"fixo";if(!posGroups[ap])posGroups[ap]=[];posGroups[ap].push(p);});
  return(
    <div style={{position:"relative",width:"100%",paddingBottom:"148%",background:"linear-gradient(175deg,#14532d 0%,#166534 48%,#14532d 100%)",borderRadius:10,overflow:"hidden"}}>
      <svg style={{position:"absolute",inset:0,width:"100%",height:"100%",pointerEvents:"none"}} viewBox="0 0 100 148" preserveAspectRatio="none">
        <rect x="2.5" y="2.5" width="95" height="143" fill="none" stroke="rgba(255,255,255,.28)" strokeWidth=".8"/>
        <line x1="2.5" y1="74" x2="97.5" y2="74" stroke="rgba(255,255,255,.22)" strokeWidth=".6"/>
        <circle cx="50" cy="74" r="13" fill="none" stroke="rgba(255,255,255,.22)" strokeWidth=".6"/>
        <ellipse cx="50" cy="74" rx="2" ry="2" fill="rgba(255,255,255,.2)"/>
        <rect x="31" y="2.5" width="38" height="13" fill="none" stroke="rgba(255,255,255,.18)" strokeWidth=".6"/>
        <rect x="31" y="132.5" width="38" height="13" fill="none" stroke="rgba(255,255,255,.18)" strokeWidth=".6"/>
        {[0,1,2,3,4,5,6].map(i=><rect key={i} x="2.5" y={2.5+i*20.5} width="95" height="10.2" fill={i%2===0?"rgba(255,255,255,.025)":"transparent"}/>)}
      </svg>
      {slots.map((slot,i)=>{
        const pGroup=posGroups[slot.pos]||[];
        const slotIdx=slots.filter((s,j)=>j<i&&s.pos===slot.pos).length;
        const player=pGroup[slotIdx];const posData=POS[slot.pos];const isGhost=player?.isGhost;
        const total=player&&!isGhost?playerScore(player):0;const stars=total>=8?3:total>=6?2:1;
        return(
          <div key={i} style={{position:"absolute",left:`${slot.x}%`,top:`${slot.y}%`,transform:"translate(-50%,-50%)",display:"flex",flexDirection:"column",alignItems:"center",zIndex:2}}>
            <div style={{width:40,height:40,borderRadius:"50%",background:isGhost?"rgba(0,0,0,.35)":tc.accent,border:isGhost?"2px dashed rgba(255,255,255,.3)":`2.5px solid ${tc.text}30`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:900,color:isGhost?"rgba(255,255,255,.4)":tc.text,boxShadow:"0 2px 10px rgba(0,0,0,.6)",textAlign:"center",padding:"0 2px",lineHeight:1.15}}>
              {isGhost?"?":player?player.name.split(" ")[0].slice(0,7):"?"}
            </div>
            <div style={{marginTop:2,background:"rgba(0,0,0,.75)",color:isGhost?"rgba(255,255,255,.3)":(posData?.color||"#fff"),fontSize:8,fontWeight:800,borderRadius:4,padding:"1px 5px",letterSpacing:.5,display:"flex",gap:3,alignItems:"center"}}>
              <span>{posData?.short}</span>{player&&!isGhost&&<span style={{color:"#facc15"}}>{"★".repeat(stars)}</span>}
            </div>
          </div>
        );
      })}
      <div style={{position:"absolute",left:"50%",bottom:"1.5%",transform:"translateX(-50%)",display:"flex",flexDirection:"column",alignItems:"center",zIndex:2}}>
        <div style={{width:36,height:36,borderRadius:"50%",background:"#78350f",border:"2px solid #fbbf2430",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,boxShadow:"0 2px 10px rgba(0,0,0,.6)"}}>🧤</div>
        <div style={{marginTop:2,background:"rgba(0,0,0,.75)",color:"#FFD700",fontSize:8,fontWeight:800,borderRadius:4,padding:"1px 5px"}}>GL</div>
      </div>
    </div>
  );
}

// ─── AuthScreen ───────────────────────────────────────────────────────────────
function AuthScreen() {
  const [step,    setStep]    = useState('email');
  const [email,   setEmail]   = useState('');
  const [otp,     setOtp]     = useState('');
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  async function sendOTP() {
    if (!email.trim()) return;
    setLoading(true); setError('');
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim() });
    if (error) { setError(error.message); setLoading(false); return; }
    setStep('otp'); setLoading(false);
  }

  async function verifyOTP() {
    if (otp.length < 6) return;
    setLoading(true); setError('');
    const { error } = await supabase.auth.verifyOtp({ email, token: otp, type: 'email' });
    if (error) { setError('Código inválido ou expirado. Tente novamente.'); setLoading(false); }
    setLoading(false);
  }

  return (
    <div style={{minHeight:"100vh",background:"#060d06",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:24,fontFamily:FONT}}>
      <style>{GLOBAL_CSS}</style>
      <div style={{textAlign:"center",marginBottom:40}}>
        <div style={{fontSize:60}}>⚽</div>
        <div style={{fontSize:34,fontWeight:900,color:"#4ade80",letterSpacing:3,marginTop:8}}>RACHÃO FC</div>
        <div style={{fontSize:11,color:"#2a4a2a",letterSpacing:4,marginTop:4}}>GERENCIADOR DE TIMES</div>
      </div>
      <div style={{width:"100%",maxWidth:360}}>
        {step === 'email' ? (
          <div>
            <div style={S.lbl({marginBottom:10})}>SEU EMAIL</div>
            <input style={{...S.inp,fontSize:16,marginBottom:12}} type="email" placeholder="seu@email.com"
              value={email} onChange={e=>setEmail(e.target.value)} onKeyDown={e=>e.key==='Enter'&&sendOTP()} autoFocus/>
            <button onClick={sendOTP} disabled={loading||!email.trim()} style={S.btnG({opacity:loading||!email.trim()?0.6:1})}>
              {loading?"ENVIANDO...":"ENVIAR CÓDIGO ✉️"}
            </button>
          </div>
        ) : (
          <div>
            <div style={{fontSize:13,color:"#3a5a3a",marginBottom:14,textAlign:"center",lineHeight:1.7}}>
              Código enviado para<br/>
              <span style={{color:"#4ade80",fontWeight:800}}>{email}</span>
            </div>
            <div style={S.lbl({marginBottom:10})}>CÓDIGO DE 6 DÍGITOS</div>
            <input style={{...S.inp,fontSize:28,letterSpacing:12,textAlign:"center",marginBottom:12}}
              type="number" inputMode="numeric" placeholder="000000" maxLength={6}
              value={otp} onChange={e=>setOtp(e.target.value.slice(0,6))}
              onKeyDown={e=>e.key==='Enter'&&verifyOTP()} autoFocus/>
            <button onClick={verifyOTP} disabled={loading||otp.length<6} style={S.btnG({opacity:loading||otp.length<6?0.6:1})}>
              {loading?"VERIFICANDO...":"ENTRAR ✅"}
            </button>
            <button onClick={()=>{setStep('email');setOtp('');setError('');}}
              style={S.btnG({background:"transparent",boxShadow:"none",color:"#3a5a3a",border:"1px solid #162616",marginTop:6})}>
              ← TROCAR EMAIL
            </button>
          </div>
        )}
        {error && (
          <div style={{marginTop:12,background:"#7f1d1d",border:"1px solid #f8717144",borderRadius:8,padding:"10px 14px",fontSize:13,color:"#fca5a5",textAlign:"center"}}>
            {error}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── ProfileSetupScreen ───────────────────────────────────────────────────────
function ProfileSetupScreen({userId, onComplete}) {
  const [name,    setName]    = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSave() {
    setLoading(true);
    if (name.trim()) await saveProfileName(userId, name.trim());
    const profile = await loadProfile(userId);
    onComplete(profile || { id:userId, plan:'free', name:name.trim() });
    setLoading(false);
  }

  return (
    <div style={{minHeight:"100vh",background:"#060d06",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:24,fontFamily:FONT}}>
      <style>{GLOBAL_CSS}</style>
      <div style={{textAlign:"center",marginBottom:36}}>
        <div style={{fontSize:56}}>👋</div>
        <div style={{fontSize:26,fontWeight:900,color:"#4ade80",letterSpacing:2,marginTop:10}}>BEM-VINDO!</div>
        <div style={{fontSize:13,color:"#3a5a3a",marginTop:6}}>Como quer ser chamado?</div>
      </div>
      <div style={{width:"100%",maxWidth:360}}>
        <input style={{...S.inp,fontSize:18,marginBottom:12,textAlign:"center"}} placeholder="Seu nome (opcional)"
          value={name} onChange={e=>setName(e.target.value)} onKeyDown={e=>e.key==='Enter'&&handleSave()} autoFocus/>
        <button onClick={handleSave} disabled={loading} style={S.btnG({opacity:loading?0.6:1})}>
          {loading?"SALVANDO...":"COMEÇAR ⚽"}
        </button>
      </div>
    </div>
  );
}

// ─── GroupsScreen ─────────────────────────────────────────────────────────────
function GroupsScreen({groups, plan, userName, onSelect, onCreate, onDelete, onLogout}) {
  const [newName,  setNewName]  = useState('');
  const [creating, setCreating] = useState(false);
  const [emojiIdx, setEmojiIdx] = useState(0);
  const limit   = PLAN_LIMITS[plan] || PLAN_LIMITS.free;
  const atLimit = groups.length >= limit.groups;

  function handleCreate() {
    if (!newName.trim()) return;
    onCreate({ name:newName.trim(), emoji:GROUP_EMOJIS[emojiIdx], id:Date.now().toString() });
    setNewName(""); setCreating(false);
  }

  return (
    <div style={{minHeight:"100vh",background:"#060d06",fontFamily:FONT,color:"#e8f5e8",maxWidth:480,margin:"0 auto",paddingBottom:40}}>
      <style>{GLOBAL_CSS}</style>
      <div style={{background:"linear-gradient(160deg,#0b1e0b,#060d06)",borderBottom:"1px solid #162616",padding:"14px 16px 10px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontSize:24}}>⚽</span>
          <div>
            <div style={{fontSize:20,fontWeight:900,color:"#4ade80",letterSpacing:2}}>RACHÃO FC</div>
            <div style={{display:"flex",alignItems:"center",gap:6}}>
              <div style={{fontSize:10,color:"#2e4e2e",letterSpacing:2}}>{userName ? `Olá, ${userName}` : "MEUS RACHÕES"}</div>
              <span style={{fontSize:9,fontWeight:800,padding:"1px 7px",borderRadius:10,background:plan==='premium'?"#78350f":"#162616",color:plan==='premium'?"#fbbf24":"#3a5a3a",border:`1px solid ${plan==='premium'?"#fbbf2444":"#1e3a1e"}`}}>
                {plan === 'premium' ? '★ PREMIUM' : 'FREE'}
              </span>
            </div>
          </div>
        </div>
        <button onClick={onLogout} style={S.btnSm("#2e4e2e",{padding:"5px 10px",border:"1px solid #162616"})}>SAIR</button>
      </div>

      <div style={{padding:16}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,padding:"8px 12px",background:"#0a130a",borderRadius:8,border:"1px solid #162616"}}>
          <span style={{fontSize:11,color:"#3a5a3a"}}>Grupos: <span style={{color:atLimit?"#f87171":"#4ade80",fontWeight:800}}>{groups.length}/{limit.groups}</span></span>
          {atLimit && plan==='free' && <span style={{fontSize:10,color:"#fbbf24",fontWeight:700}}>⭐ Premium = até 7 grupos</span>}
        </div>

        {groups.length===0&&!creating&&(
          <div style={{textAlign:"center",padding:"40px 20px",color:"#1e2e1e"}}>
            <div style={{fontSize:56,marginBottom:12}}>🏟️</div>
            <div style={{fontSize:18,fontWeight:800,color:"#2e4e2e"}}>Nenhum rachão ainda</div>
            <div style={{fontSize:13,color:"#1e2e1e",marginTop:6}}>Crie seu primeiro grupo abaixo</div>
          </div>
        )}

        {groups.map(g=>(
          <div key={g.id} style={{background:"#0d160d",border:"1px solid #162616",borderRadius:12,padding:"14px 16px",marginBottom:10,display:"flex",alignItems:"center",gap:14}}>
            <div style={{fontSize:36}}>{g.emoji||"⚽"}</div>
            <div style={{flex:1}}>
              <div style={{fontSize:18,fontWeight:900,color:"#e8f5e8",letterSpacing:1}}>{g.name}</div>
              <div style={{fontSize:11,color:"#3a5a3a",marginTop:2}}>{g.playerCount||0} / {limit.players} atletas</div>
            </div>
            <div style={{display:"flex",gap:6}}>
              <button onClick={()=>onSelect(g)} style={{background:"linear-gradient(135deg,#16a34a,#15803d)",color:"#fff",border:"none",borderRadius:8,padding:"10px 16px",fontSize:13,fontWeight:900,cursor:"pointer",fontFamily:FONT,letterSpacing:1}}>ENTRAR →</button>
              <button onClick={()=>onDelete(g.id)} style={{background:"transparent",color:"#ef4444",border:"1px solid #ef444433",borderRadius:8,padding:"10px",fontSize:12,cursor:"pointer",fontFamily:FONT}}>✕</button>
            </div>
          </div>
        ))}

        {!creating ? (
          <button onClick={()=>{if(!atLimit)setCreating(true);}}
            style={{width:"100%",background:"transparent",border:`1.5px dashed ${atLimit?"#1e2e1e":"#1e3a1e"}`,borderRadius:12,padding:"18px",fontSize:15,fontWeight:800,cursor:atLimit?"not-allowed":"pointer",color:atLimit?"#1e2e1e":"#3a5a3a",fontFamily:FONT,marginTop:6,letterSpacing:1}}>
            {atLimit?`🔒 Limite: ${limit.groups} grupo no plano free`:"+ NOVO RACHÃO"}
          </button>
        ) : (
          <div style={S.card({border:"1px solid #1e4a3a",marginTop:8})}>
            <div style={S.lbl()}>NOVO RACHÃO</div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:12}}>
              {GROUP_EMOJIS.map((e,i)=><button key={e} onClick={()=>setEmojiIdx(i)} style={{fontSize:24,background:emojiIdx===i?"#1a3a2a":"transparent",border:emojiIdx===i?"1px solid #4ade80":"1px solid #162616",borderRadius:8,padding:"6px 10px",cursor:"pointer"}}>{e}</button>)}
            </div>
            <input style={{...S.inp,marginBottom:10}} placeholder="Nome do rachão..." value={newName}
              onChange={e=>setNewName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleCreate()} autoFocus/>
            <div style={{display:"flex",gap:8}}>
              <button onClick={handleCreate} style={{flex:1,background:"linear-gradient(135deg,#16a34a,#15803d)",color:"#fff",border:"none",borderRadius:8,padding:"12px",fontSize:14,fontWeight:800,cursor:"pointer",fontFamily:FONT}}>✅ CRIAR</button>
              <button onClick={()=>setCreating(false)} style={{flex:1,background:"#1f2937",color:"#e8f5e8",border:"none",borderRadius:8,padding:"12px",fontSize:14,fontWeight:800,cursor:"pointer",fontFamily:FONT}}>CANCELAR</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── PlayerRow ────────────────────────────────────────────────────────────────
function PlayerRow({pl,onEdit,onDelete}){
  return(
    <div style={{background:"#0a130a",border:"1px solid #141e14",borderRadius:10,padding:"10px 12px",marginBottom:6,display:"flex",alignItems:"flex-start",gap:10}}>
      <div style={{flex:1}}>
        <div style={{fontWeight:800,fontSize:15}}>{pl.name}</div>
        {pl.aliases?.length>0&&<div style={{fontSize:10,color:"#2a4a2a",marginTop:2,fontStyle:"italic"}}>aka: {pl.aliases.join(", ")}</div>}
        <div style={{display:"flex",gap:4,flexWrap:"wrap",marginTop:4}}>
          {pl.isGoalkeeper?<Badge posId="goleiro"/>:(pl.positions||[]).map(pos=><Badge key={pos} posId={pos}/>)}
          {!pl.isGoalkeeper&&<span style={{fontSize:10,color:"#2a4a2a",alignSelf:"center"}}>🦵{pl.foot==="ambas"?"±":pl.foot==="esquerda"?"E":"D"}{" "}{pl.side==="canhoto"?"◀":pl.side==="destro"?"▶":"◀▶"}</span>}
        </div>
        {!pl.isGoalkeeper&&<div style={{display:"flex",gap:10,marginTop:5}}><span style={{fontSize:11}}>💪 <Stars value={pl.fisico} color="#f97316"/></span><span style={{fontSize:11}}>🛡️ <Stars value={pl.defensivo} color="#4FC3F7"/></span><span style={{fontSize:11}}>🎯 <Stars value={pl.ofensivo} color="#4ade80"/></span></div>}
      </div>
      <div style={{display:"flex",gap:6}}>
        <button onClick={()=>onEdit(pl)} style={{background:"transparent",color:"#facc15",border:"1px solid #facc1533",borderRadius:6,padding:"4px 9px",fontSize:11,cursor:"pointer",fontWeight:700,fontFamily:FONT}}>✏️</button>
        <button onClick={()=>onDelete(pl.id)} style={{background:"transparent",color:"#ef4444",border:"1px solid #ef444433",borderRadius:6,padding:"4px 9px",fontSize:11,cursor:"pointer",fontWeight:700,fontFamily:FONT}}>✕</button>
      </div>
    </div>
  );
}

// ─── GroupApp ─────────────────────────────────────────────────────────────────
function GroupApp({group, userId, plan, onBack, notify}) {
  const gid          = group.id;
  const playerLimit  = (PLAN_LIMITS[plan]||PLAN_LIMITS.free).players;

  const [players,     setPlayers]     = useState([]);
  const [weekLine,    setWeekLine]    = useState([]);
  const [weekGK,      setWeekGK]      = useState([]);
  const [teams,       setTeams]       = useState(null);
  const [assignedGKs, setAssignedGKs] = useState({});
  const [teamSize,    setTeamSize]    = useState(5);
  const [loading,     setLoading]     = useState(true);
  const [saving,      setSaving]      = useState(false);
  const [tab,         setTab]         = useState("lista");
  const [form,        setForm]        = useState(null);
  const [editId,      setEditId]      = useState(null);
  const [aliasInput,  setAliasInput]  = useState("");
  const [listText,    setListText]    = useState("");
  const [parsed,      setParsed]      = useState(null);
  const [pasteOpen,   setPasteOpen]   = useState(true);
  // Novo: mapa de resolução para jogadores não encontrados
  const [resolveMap,  setResolveMap]  = useState({}); // { rawName: 'avulso' | 'roster' }

  useEffect(()=>{
    (async()=>{
      setLoading(true);
      const pl   = await loadPlayers(gid);
      const week = await loadWeekPlayers(gid, pl);
      setPlayers(pl);
      setWeekLine(week.line);
      setWeekGK(week.gk);
      setPasteOpen(week.line.length === 0);
      setLoading(false);
    })();
  },[gid]);

  const emptyForm = ()=>({name:"",isGoalkeeper:false,positions:[],foot:"direita",side:"ambos",fisico:2,defensivo:2,ofensivo:2,aliases:[]});
  const openAdd   = ()=>{setEditId(null);setForm(emptyForm());setAliasInput("");};
  const openEdit  = pl=>{setEditId(pl.id);setForm({name:pl.name,isGoalkeeper:pl.isGoalkeeper||false,positions:[...(pl.positions||[])],foot:pl.foot||"direita",side:pl.side||"ambos",fisico:pl.fisico||2,defensivo:pl.defensivo||2,ofensivo:pl.ofensivo||2,aliases:[...(pl.aliases||[])]});setAliasInput("");setTab("atletas");};
  const addAlias  = ()=>{const a=aliasInput.trim();if(!a||form.aliases.includes(a))return;setForm(f=>({...f,aliases:[...f.aliases,a]}));setAliasInput("");};
  const removeAlias=a=>setForm(f=>({...f,aliases:f.aliases.filter(x=>x!==a)}));
  const togglePos =pos=>setForm(f=>({...f,positions:f.positions.includes(pos)?f.positions.filter(p=>p!==pos):[...f.positions,pos]}));

  async function saveForm() {
    if (!form.name.trim()) { notify("Nome obrigatório","err"); return; }
    if (!form.isGoalkeeper && form.positions.length===0) { notify("Selecione pelo menos uma posição","err"); return; }
    // Limite de jogadores
    const lineCount = players.filter(p=>!p.isGoalkeeper).length;
    if (!editId && !form.isGoalkeeper && lineCount >= playerLimit) {
      notify(`Limite de ${playerLimit} jogadores atingido!`,"err"); return;
    }
    setSaving(true);
    const id   = editId || Date.now().toString();
    const data = {...form, id, name:form.name.trim()};
    await upsertPlayer(data, gid, userId);
    const updated = editId ? players.map(p=>p.id===editId?data:p) : [...players, data];
    setPlayers(updated);
    await updateGroupCount(gid, updated.length);
    onBack(updated.length, gid);
    notify(editId?"Atleta atualizado ✓":"Atleta adicionado ✓");
    setForm(null); setEditId(null); setSaving(false);
  }

  async function deletePlayer(id) {
    await deletePlayerById(id);
    const updated = players.filter(p=>p.id!==id);
    setPlayers(updated);
    setWeekLine(wl=>wl.filter(p=>p.id!==id));
    await updateGroupCount(gid, updated.length);
    onBack(updated.length, gid);
    notify("Removido");
  }

  function doParse() {
    if (!listText.trim()) { notify("Cole a lista primeiro","err"); return; }
    const result = parseWhatsApp(listText, players);
    if (!result.lineResult.length && !result.gkResult.length) { notify("Nenhum jogador encontrado","err"); return; }
    // Inicializa resolveMap: todos os não-encontrados começam como 'avulso'
    const initMap = {};
    result.lineResult.filter(r=>!r.matched).forEach(r=>{ initMap[r.raw]='avulso'; });
    setResolveMap(initMap);
    setParsed(result);
  }

  function toggleResolve(raw) {
    setResolveMap(m=>({...m,[raw]:m[raw]==='roster'?'avulso':'roster'}));
  }

  async function confirmParsed() {
    if (!parsed) return;
    setSaving(true);

    // Salva no DB os jogadores marcados como 'roster'
    const newDbPlayers = [];
    for (const r of parsed.lineResult) {
      if (!r.matched && resolveMap[r.raw]==='roster') {
        const np = {
          id:          Date.now().toString()+Math.random().toString(36).slice(2),
          name:        r.raw,
          isGoalkeeper:false,
          positions:   ["ala"],
          aliases:     [],
          foot:        'direita', side:'ambos',
          fisico:2, defensivo:2, ofensivo:2,
        };
        await upsertPlayer(np, gid, userId);
        newDbPlayers.push(np);
      }
    }

    // Atualiza lista de players se adicionou novos
    let updatedPlayers = players;
    if (newDbPlayers.length > 0) {
      updatedPlayers = [...players, ...newDbPlayers];
      setPlayers(updatedPlayers);
      await updateGroupCount(gid, updatedPlayers.length);
      onBack(updatedPlayers.length, gid);
    }

    // Monta lista da semana com jogadores resolvidos
    const newLine = parsed.lineResult.map(r => {
      if (r.matched) return r.player;
      const rp = newDbPlayers.find(p=>normName(p.name)===normName(r.raw));
      if (rp) return rp; // Adicionado ao elenco
      return { id:"av_"+Date.now()+Math.random(), name:r.raw, isGoalkeeper:false, positions:["ala"], foot:"direita", side:"ambos", fisico:2, defensivo:2, ofensivo:2, avulso:true };
    });
    const newGK = parsed.gkResult.map(r=>r.player||{id:"gkav_"+Date.now()+Math.random(),name:r.raw,isGoalkeeper:true,avulso:true});

    await saveWeekPlayers(gid, userId, newLine, newGK);
    setWeekLine(newLine); setWeekGK(newGK);
    setTeams(null); setAssignedGKs({});
    setParsed(null); setListText(""); setPasteOpen(false);
    setResolveMap({});

    const rCount = newDbPlayers.length;
    notify(`✓ ${newLine.length} jogadores${rCount>0?` · ${rCount} adicionado${rCount>1?"s":""} ao elenco`:""}`);
    setSaving(false);
  }

  async function clearWeek() {
    await clearWeekPlayers(gid);
    setWeekLine([]); setWeekGK([]);
    setTeams(null); setAssignedGKs({});
    setParsed(null); setListText(""); setPasteOpen(true);
    notify("Nova semana — lista zerada ✓");
  }

  function doSort() {
    const numFull = Math.min(4,Math.floor(weekLine.length/teamSize));
    if (numFull<2) { notify(`Precisa de pelo menos ${teamSize*2} jogadores de linha!`,"err"); return; }
    const result = balanceTeams(weekLine,teamSize);
    if (!result) { notify("Não foi possível sortear","err"); return; }
    setTeams(result); setAssignedGKs({});
    const rem = weekLine.length-numFull*teamSize;
    if (rem>0&&numFull<4) notify(`Times sorteados! ⚽  Time ${numFull+1} incompleto (${rem}/${teamSize})`);
    else notify("Times sorteados! ⚽");
  }

  if (loading) return <Loader />;

  const lineCount = players.filter(p=>!p.isGoalkeeper).length;
  const tabs = [
    {id:"lista",   icon:"📋", label:"Lista",   badge:weekLine.length||null},
    {id:"atletas", icon:"👥", label:"Atletas", badge:players.length||null},
    {id:"sorteio", icon:"⚽", label:"Sorteio", badge:teams?teams.length:null},
  ];

  return (
    <div style={{minHeight:"100vh",background:"#060d06",fontFamily:FONT,color:"#e8f5e8",maxWidth:480,margin:"0 auto",paddingBottom:90}}>
      <style>{GLOBAL_CSS}</style>

      {/* Header */}
      <div style={{background:"linear-gradient(160deg,#0b1e0b,#060d06)",borderBottom:"1px solid #162616",padding:"14px 16px 10px",position:"sticky",top:0,zIndex:10,boxShadow:"0 2px 20px #00000090",display:"flex",alignItems:"center",gap:10}}>
        <button onClick={()=>onBack(players.length,gid,true)} style={{background:"transparent",border:"none",color:"#3a5a3a",fontSize:28,cursor:"pointer",padding:"0 4px 0 0",lineHeight:1,fontFamily:FONT}}>‹</button>
        <span style={{fontSize:22}}>{group.emoji||"⚽"}</span>
        <div style={{flex:1}}>
          <div style={{fontSize:18,fontWeight:900,color:"#4ade80",letterSpacing:1}}>{group.name.toUpperCase()}</div>
          <div style={{fontSize:10,color:"#2e4e2e",letterSpacing:3}}>PAINEL ADMIN</div>
        </div>
        {saving&&<div style={{fontSize:11,color:"#3a5a3a"}}>💾...</div>}
      </div>

      {/* Tabs */}
      <div style={{display:"flex",background:"#0a100a",borderBottom:"1px solid #162616",position:"sticky",top:52,zIndex:9}}>
        {tabs.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)} style={{flex:1,padding:"11px 2px",fontSize:10,fontWeight:tab===t.id?800:600,letterSpacing:1.2,textAlign:"center",cursor:"pointer",textTransform:"uppercase",color:tab===t.id?"#4ade80":"#2e4e2e",background:"none",border:"none",borderBottom:tab===t.id?"2px solid #4ade80":"2px solid transparent",fontFamily:FONT}}>
            {t.icon} {t.label}
            {t.badge!=null&&<span style={{marginLeft:4,background:tab===t.id?"#4ade80":"#162616",color:tab===t.id?"#060d06":"#2e4e2e",borderRadius:10,padding:"0 5px",fontSize:9,fontWeight:900}}>{t.badge}</span>}
          </button>
        ))}
      </div>

      <div style={{padding:14}}>

        {/* ── LISTA ── */}
        {tab==="lista"&&(
          <div>
            {weekLine.length>0&&(
              <div style={S.card()}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div>
                    <span style={{fontSize:34,fontWeight:900,color:"#4ade80"}}>{weekLine.length}</span>
                    <span style={{fontSize:13,color:"#3a5a3a",marginLeft:8}}>de linha</span>
                    {weekGK.length>0&&<span style={{fontSize:12,color:"#fbbf24",marginLeft:12}}>🧤 {weekGK.length}</span>}
                  </div>
                  <button onClick={clearWeek} style={S.btnSm("#f87171",{padding:"7px 12px"})}>🔄 Nova semana</button>
                </div>
                <div style={{marginTop:10,display:"flex",flexWrap:"wrap",gap:5}}>
                  {weekLine.map((p,i)=>(
                    <div key={p.id||i} style={{background:p.avulso?"#2a1e0a":"#0a1e0a",border:`1px solid ${p.avulso?"#d97706":"#1e4a1e"}33`,borderRadius:8,padding:"3px 9px",fontSize:12,fontWeight:700,color:p.avulso?"#d97706":"#4ade80",display:"flex",alignItems:"center",gap:4}}>
                      <span style={{fontSize:10,color:"#3a5a3a"}}>{i+1}.</span>{p.name}
                      {p.avulso&&<span style={{fontSize:9,opacity:.6}}>av</span>}
                    </div>
                  ))}
                </div>
                {weekGK.length>0&&(
                  <div style={{marginTop:8,paddingTop:8,borderTop:"1px solid #162616"}}>
                    <div style={{fontSize:10,color:"#fbbf24",fontWeight:700,letterSpacing:2,marginBottom:5}}>🧤 GOLEIROS</div>
                    <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
                      {weekGK.map((p,i)=><div key={p.id||i} style={{background:"#1c1200",border:"1px solid #fbbf2433",borderRadius:8,padding:"3px 9px",fontSize:12,fontWeight:700,color:"#fbbf24"}}>🧤 {p.name}</div>)}
                    </div>
                  </div>
                )}
                {!pasteOpen&&<button onClick={()=>setPasteOpen(true)} style={S.btnG({marginTop:10,background:"#162616",boxShadow:"none",letterSpacing:0})}>📋 Colar nova lista</button>}
              </div>
            )}

            {pasteOpen&&(
              <div style={S.card()}>
                <div style={S.lbl()}>📋 COLE A LISTA DO WHATSAPP</div>
                <textarea style={{...S.inp,height:200,resize:"vertical",fontSize:13,lineHeight:1.6}}
                  placeholder={"Futebol ⚽ 18/03\n1-Arthur\n2-Vinicius\n...\n\nGoleiros\nAlan\n\nFora:\nCoca"}
                  value={listText} onChange={e=>setListText(e.target.value)}/>
                <button onClick={doParse} style={S.btnG()}>🔍 PROCESSAR LISTA</button>
              </div>
            )}

            {parsed&&(
              <div style={S.card({border:"1px solid #1e3a1e"})}>
                <div style={S.lbl()}>RESULTADO DO CRUZAMENTO</div>

                {/* Linha */}
                <div style={{marginBottom:12}}>
                  <div style={{fontSize:11,color:"#3a5a3a",marginBottom:8,fontWeight:700,letterSpacing:2}}>👥 LINHA ({parsed.lineResult.length})</div>
                  {parsed.lineResult.map((r,i)=>(
                    <div key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 0",borderBottom:"1px solid #0f1e0f"}}>
                      <span style={{fontSize:11,color:"#2a3a2a",minWidth:20}}>{i+1}.</span>
                      <span style={{flex:1,fontSize:13,fontWeight:700}}>{r.raw}</span>
                      {r.matched ? (
                        <span style={{fontSize:10,color:"#4ade80",fontWeight:800}}>✓ {r.player.name!==r.raw?r.player.name:"ok"}</span>
                      ) : (
                        /* Toggle: Avulso vs Adicionar ao Elenco */
                        <div style={{display:"flex",gap:4}}>
                          <button onClick={()=>toggleResolve(r.raw)}
                            style={{fontSize:9,fontWeight:800,padding:"3px 8px",borderRadius:6,cursor:"pointer",fontFamily:FONT,
                              background:resolveMap[r.raw]==='roster'?"#1a3a2a":"transparent",
                              color:resolveMap[r.raw]==='roster'?"#4ade80":"#3a5a3a",
                              border:`1px solid ${resolveMap[r.raw]==='roster'?"#4ade80":"#1e3a1e"}`}}>
                            {resolveMap[r.raw]==='roster'?"✓ ELENCO":"+ ELENCO"}
                          </button>
                          <span style={{fontSize:9,color:resolveMap[r.raw]==='avulso'?"#f97316":"#2a3a2a",fontWeight:800,alignSelf:"center"}}>
                            {resolveMap[r.raw]==='avulso'?"⚠ avulso":""}
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Aviso sobre jogadores marcados para elenco */}
                {Object.values(resolveMap).some(v=>v==='roster')&&(
                  <div style={{background:"#0a1e1a",border:"1px solid #1e4a3a",borderRadius:8,padding:"8px 12px",marginBottom:10,fontSize:11,color:"#4ade80"}}>
                    ✅ {Object.values(resolveMap).filter(v=>v==='roster').length} jogador(es) serão salvos no elenco com atributos padrão. Edite depois se quiser ajustar.
                  </div>
                )}

                {/* Goleiros */}
                {parsed.gkResult.length>0&&(
                  <div style={{marginBottom:10}}>
                    <div style={{fontSize:11,color:"#fbbf24",marginBottom:6,fontWeight:700,letterSpacing:2}}>🧤 GOLEIROS ({parsed.gkResult.length})</div>
                    {parsed.gkResult.map((r,i)=>(
                      <div key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"5px 0"}}>
                        <span style={{flex:1,fontSize:13,fontWeight:700}}>{r.raw}</span>
                        <span style={{fontSize:10,color:r.matched?"#fbbf24":"#f97316",fontWeight:800}}>
                          {r.matched?`✓ ${r.player.name!==r.raw?r.player.name:"ok"}`:"⚠ avulso"}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                <button onClick={confirmParsed} disabled={saving} style={S.btnG({opacity:saving?0.6:1})}>
                  {saving?"💾 SALVANDO...":"✅ CONFIRMAR LISTA"}
                </button>
                <button onClick={()=>{setParsed(null);setResolveMap({});}} style={S.btnG({background:"#1f2937",boxShadow:"none",marginTop:6})}>CANCELAR</button>
              </div>
            )}
          </div>
        )}

        {/* ── ATLETAS ── */}
        {tab==="atletas"&&(
          <div>
            <div style={{display:"flex",gap:8,marginBottom:12}}>
              <div style={S.card({flex:1,marginBottom:0,textAlign:"center",padding:"10px 6px"})}>
                <div style={{fontSize:22,fontWeight:900,color:lineCount>=playerLimit?"#f87171":"#4ade80"}}>{lineCount}<span style={{fontSize:12,color:"#3a5a3a"}}>/{playerLimit}</span></div>
                <div style={{fontSize:10,color:"#3a5a3a"}}>JOGADORES</div>
              </div>
              <div style={S.card({flex:1,marginBottom:0,textAlign:"center",padding:"10px 6px"})}>
                <div style={{fontSize:26,fontWeight:900,color:"#FFD700"}}>{players.filter(p=>p.isGoalkeeper).length}</div>
                <div style={{fontSize:10,color:"#3a5a3a"}}>GOLEIROS</div>
              </div>
              <button onClick={openAdd} style={{background:"linear-gradient(135deg,#16a34a,#15803d)",color:"#fff",border:"none",borderRadius:10,padding:"0 22px",fontSize:26,cursor:"pointer",fontWeight:900,boxShadow:"0 4px 16px #16a34a44"}}>+</button>
            </div>

            {lineCount>=playerLimit&&(
              <div style={{background:"#2a1a0a",border:"1px solid #d9770633",borderRadius:8,padding:"8px 12px",marginBottom:10,fontSize:11,color:"#d97706",fontWeight:700}}>
                ⚠️ Limite de {playerLimit} jogadores atingido
              </div>
            )}

            {form&&(
              <div style={S.card({border:"1px solid #1e4a3a"})}>
                <div style={S.lbl()}>{editId?"✏️ EDITAR ATLETA":"➕ NOVO ATLETA"}</div>
                <input style={S.inp} placeholder="Nome do atleta..." value={form.name}
                  onChange={e=>setForm(f=>({...f,name:e.target.value}))} onKeyDown={e=>e.key==="Enter"&&saveForm()}/>
                <div style={{marginTop:10}}>
                  <button onClick={()=>setForm(f=>({...f,isGoalkeeper:!f.isGoalkeeper,positions:[]}))}
                    style={{padding:"8px 16px",borderRadius:8,fontSize:13,fontWeight:800,cursor:"pointer",fontFamily:FONT,background:form.isGoalkeeper?"#78350f":"#0d160d",color:form.isGoalkeeper?"#fbbf24":"#3a5a3a",border:`1px solid ${form.isGoalkeeper?"#fbbf2444":"#162616"}`}}>
                    🧤 {form.isGoalkeeper?"É GOLEIRO":"Marcar como Goleiro"}
                  </button>
                </div>
                {!form.isGoalkeeper&&(
                  <div style={{marginTop:12}}>
                    <div style={S.lbl({marginBottom:6})}>POSIÇÕES</div>
                    <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                      {POSITIONS_LINE.map(p=>{const on=form.positions.includes(p.id);return(
                        <button key={p.id} onClick={()=>togglePos(p.id)}
                          style={{padding:"8px 14px",borderRadius:8,fontSize:12,fontWeight:800,cursor:"pointer",fontFamily:FONT,background:on?p.color+"22":"#0d160d",color:on?p.color:"#2a3a2a",border:`1px solid ${on?p.color+"55":"#162616"}`}}>
                          {p.emoji} {p.label}
                        </button>
                      );})}
                    </div>
                    {form.positions.length>1&&<div style={{fontSize:11,color:"#3a5a3a",marginTop:6}}>✓ Jogador polivalente</div>}
                  </div>
                )}
                <div style={{marginTop:12}}>
                  <div style={S.lbl({marginBottom:6})}>📝 APELIDOS</div>
                  <div style={{display:"flex",gap:6}}>
                    <input style={{...S.inp,flex:1,fontSize:13,padding:"9px 12px"}} placeholder="ex: Rod, Rodrigão..."
                      value={aliasInput} onChange={e=>setAliasInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addAlias()}/>
                    <button onClick={addAlias} style={{background:"#1a3a2a",border:"1px solid #2a5a3a",color:"#4ade80",borderRadius:8,padding:"0 14px",cursor:"pointer",fontSize:18,fontFamily:FONT}}>+</button>
                  </div>
                  {form.aliases.length>0&&(
                    <div style={{display:"flex",flexWrap:"wrap",gap:5,marginTop:8}}>
                      {form.aliases.map(a=>(
                        <div key={a} style={{background:"#0a1e1a",border:"1px solid #1e4a3a",borderRadius:8,padding:"4px 10px",fontSize:12,color:"#4ade80",display:"flex",alignItems:"center",gap:6}}>
                          {a}<button onClick={()=>removeAlias(a)} style={{background:"none",border:"none",color:"#ef4444",cursor:"pointer",fontSize:12,padding:0}}>✕</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginTop:12}}>
                  <div>
                    <div style={S.lbl({marginBottom:4})}>PERNA</div>
                    <select style={S.sel({width:"100%"})} value={form.foot} onChange={e=>setForm(f=>({...f,foot:e.target.value}))}>
                      <option value="direita">🦵 Direita</option><option value="esquerda">🦵 Esquerda</option><option value="ambas">🦵 Ambas</option>
                    </select>
                  </div>
                  <div>
                    <div style={S.lbl({marginBottom:4})}>LADO</div>
                    <select style={S.sel({width:"100%"})} value={form.side} onChange={e=>setForm(f=>({...f,side:e.target.value}))}>
                      <option value="canhoto">◀ Canhoto</option><option value="ambos">◀▶ Ambos</option><option value="destro">▶ Destro</option>
                    </select>
                  </div>
                </div>
                {!form.isGoalkeeper&&(
                  <div style={{marginTop:12}}>
                    <div style={S.lbl()}>ATRIBUTOS</div>
                    {[{key:"fisico",icon:"💪",label:"Físico",color:"#f97316"},{key:"defensivo",icon:"🛡️",label:"Defensivo",color:"#4FC3F7"},{key:"ofensivo",icon:"🎯",label:"Ofensivo",color:"#4ade80"}].map(attr=>(
                      <div key={attr.key} style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
                        <span style={{fontSize:13,width:90,color:"#a0c0a0"}}>{attr.icon} {attr.label}</span>
                        <div style={{display:"flex",gap:2}}>
                          {[1,2,3].map(v=><button key={v} onClick={()=>setForm(f=>({...f,[attr.key]:v}))} style={{background:"none",border:"none",cursor:"pointer",fontSize:22,color:form[attr.key]>=v?attr.color:"#1e3a1e",padding:"0 2px"}}>★</button>)}
                        </div>
                        <span style={{fontSize:11,color:"#3a5a3a"}}>{["","Básico","Regular","Forte"][form[attr.key]||1]}</span>
                      </div>
                    ))}
                  </div>
                )}
                <button onClick={saveForm} disabled={saving} style={S.btnG({opacity:saving?0.6:1})}>{saving?"💾 SALVANDO...":editId?"💾 SALVAR":"➕ ADICIONAR"}</button>
                <button onClick={()=>{setForm(null);setEditId(null);}} style={S.btnG({background:"#1f2937",boxShadow:"none",marginTop:6})}>CANCELAR</button>
              </div>
            )}

            {players.filter(p=>p.isGoalkeeper).length>0&&(
              <div>
                <div style={S.lbl({color:"#fbbf24",marginBottom:6,marginTop:4})}>🧤 GOLEIROS</div>
                {players.filter(p=>p.isGoalkeeper).map(pl=><PlayerRow key={pl.id} pl={pl} onEdit={openEdit} onDelete={deletePlayer}/>)}
              </div>
            )}
            {players.filter(p=>!p.isGoalkeeper).length>0&&(
              <div>
                <div style={S.lbl({marginBottom:6,marginTop:8})}>👥 JOGADORES DE LINHA</div>
                {players.filter(p=>!p.isGoalkeeper).map(pl=><PlayerRow key={pl.id} pl={pl} onEdit={openEdit} onDelete={deletePlayer}/>)}
              </div>
            )}
            {players.length===0&&!form&&<div style={{textAlign:"center",color:"#1e2e1e",padding:"40px 20px",fontSize:14}}>Nenhum atleta cadastrado — clique em + ⚽</div>}
          </div>
        )}

        {/* ── SORTEIO ── */}
        {tab==="sorteio"&&(
          <div>
            {weekLine.length===0?(
              <div style={{textAlign:"center",padding:"50px 20px",color:"#1e2e1e"}}>
                <div style={{fontSize:56,marginBottom:16}}>📋</div>
                <div style={{fontSize:16,fontWeight:800}}>Nenhuma lista confirmada</div>
                <button onClick={()=>setTab("lista")} style={S.btnG({maxWidth:220,margin:"20px auto 0"})}>IR PARA LISTA →</button>
              </div>
            ):(
              <div>
                <div style={S.card()}>
                  <div style={{fontSize:15,fontWeight:800,marginBottom:10}}>
                    {weekLine.length} jogadores de linha
                    {weekGK.length>0&&<span style={{fontSize:12,color:"#fbbf24",marginLeft:10}}>🧤 {weekGK.map(g=>g.name).join(", ")}</span>}
                  </div>
                  <div style={S.lbl()}>JOGADORES POR TIME (sem goleiro)</div>
                  <div style={{display:"flex",gap:8,marginBottom:10}}>
                    {[5,6].map(n=>{
                      const numFull=Math.min(4,Math.floor(weekLine.length/n));
                      const rem=weekLine.length-numFull*n;
                      const ok=numFull>=2;const hasInc=rem>0&&numFull<4;
                      return(
                        <button key={n} onClick={()=>setTeamSize(n)}
                          style={{flex:1,padding:"10px 6px",borderRadius:8,fontWeight:800,cursor:"pointer",fontFamily:FONT,background:teamSize===n?"#16a34a":"#0d160d",color:teamSize===n?"#fff":ok?"#3a5a3a":"#1e2e1e",border:`1px solid ${teamSize===n?"#4ade80":ok?"#1e3a1e":"#111"}`}}>
                          <div style={{fontSize:18}}>{n+1}x{n+1}</div>
                          <div style={{fontSize:9,opacity:.7,marginTop:2,fontWeight:600,lineHeight:1.4}}>{ok?`${numFull} times${hasInc?` + 1 inc.`:""}` :"insuf."}</div>
                        </button>
                      );
                    })}
                  </div>
                  <div style={{fontSize:11,color:"#3a5a3a",marginBottom:12}}>{teamSize===5?"GL · FX · ALA · ALA · MEIA · PIV":"GL · FX · FX · ALA · ALA · MEIA · PIV"}</div>
                  <button onClick={doSort} style={{background:"linear-gradient(135deg,#4ade80,#16a34a)",color:"#060d06",border:"none",borderRadius:12,padding:"16px",fontSize:19,fontWeight:900,cursor:"pointer",letterSpacing:2,width:"100%",boxShadow:"0 6px 32px #4ade8055",fontFamily:FONT}}>
                    🎲 SORTEAR TIMES
                  </button>
                </div>

                {teams&&(
                  <div>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                      <div style={{fontSize:18,fontWeight:900,color:"#4ade80"}}>{teams.length} TIMES SORTEADOS</div>
                      <div style={{display:"flex",gap:8}}>
                        <button onClick={doSort} style={S.btnSm("#4ade80",{padding:"7px 12px"})}>🔄 Novo</button>
                        <button onClick={()=>shareWhatsApp(teams,weekGK,assignedGKs)}
                          style={{background:"#1a3a2a",color:"#4ade80",border:"1px solid #4ade8044",borderRadius:6,padding:"7px 12px",fontSize:11,cursor:"pointer",fontWeight:700,fontFamily:FONT}}>
                          📲 WhatsApp
                        </button>
                      </div>
                    </div>

                    {teams.map((team,i)=>{
                      const tc=TEAM_COLORS[i%TEAM_COLORS.length];
                      const isInc=team.some(p=>p.isGhost);
                      const total=team.filter(p=>!p.isGhost).reduce((s,p)=>s+playerScore(p),0);
                      return(
                        <div key={i} style={{background:tc.bg,borderRadius:16,overflow:"hidden",marginBottom:16,boxShadow:"0 8px 32px #00000070"}}>
                          <div style={{background:tc.accent,padding:"12px 16px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                            <div>
                              <div style={{fontSize:20,fontWeight:900,color:tc.text,letterSpacing:2}}>
                                TIME {i+1} · {tc.name.toUpperCase()}
                                {isInc&&<span style={{fontSize:11,marginLeft:8,opacity:.7}}>⚠ incompleto</span>}
                              </div>
                              {isInc&&<div style={{fontSize:11,color:tc.text,opacity:.65,marginTop:2}}>🔄 Completar com jogador da fila</div>}
                            </div>
                            <div style={{fontSize:12,color:tc.text,opacity:.6,fontWeight:700}}>{total} pts</div>
                          </div>
                          <div style={{padding:"10px 10px 4px"}}><Pitch team={team} teamSize={teamSize} tc={tc}/></div>
                          {weekGK.length>0&&(
                            <div style={{padding:"8px 14px",margin:"0 10px 8px",background:`${tc.text}10`,borderRadius:8,display:"flex",alignItems:"center",gap:10}}>
                              <span style={{fontSize:18}}>🧤</span>
                              <select style={S.sel({flex:1,background:tc.gkBg,color:tc.text,border:`1px solid ${tc.text}22`})}
                                value={assignedGKs[i]||""} onChange={e=>setAssignedGKs(g=>({...g,[i]:e.target.value}))}>
                                <option value="">Atribuir goleiro...</option>
                                {weekGK.map(g=><option key={g.id||g.name} value={g.name}>{g.name}</option>)}
                              </select>
                            </div>
                          )}
                          <div style={{paddingBottom:8}}>
                            {team.map((pl,j)=>{const pd=POS[pl.assignedPos];return(
                              <div key={pl.id||j} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 14px",borderTop:`1px solid ${tc.text}${j===0?"18":"0a"}`,color:tc.text,opacity:pl.isGhost?.45:1}}>
                                <span style={{width:22,height:22,borderRadius:"50%",background:`${tc.text}22`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:900,flexShrink:0}}>{j+1}</span>
                                <div style={{flex:1}}>
                                  {pl.isGhost
                                    ?<div style={{fontStyle:"italic",fontSize:13}}>🔄 Pegar jogador da fila</div>
                                    :<div><div style={{fontWeight:800,fontSize:15}}>{pl.name}</div>{pd&&<span style={{fontSize:10,background:`${tc.text}15`,color:tc.text,borderRadius:6,padding:"1px 6px",fontWeight:700}}>{pd.emoji} {pd.label}</span>}</div>
                                  }
                                </div>
                                {!pl.isGhost&&(
                                  <div style={{textAlign:"right",fontSize:10,opacity:.65,lineHeight:1.6}}>
                                    <div>💪{"★".repeat(pl.fisico||1)}{"☆".repeat(3-(pl.fisico||1))}</div>
                                    <div>🛡️{"★".repeat(pl.defensivo||1)}{"☆".repeat(3-(pl.defensivo||1))}</div>
                                    <div>🎯{"★".repeat(pl.ofensivo||1)}{"☆".repeat(3-(pl.ofensivo||1))}</div>
                                  </div>
                                )}
                              </div>
                            );})}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── ROOT ─────────────────────────────────────────────────────────────────────
export default function RachaoFC() {
  const [session,     setSession]     = useState(null);
  const [profile,     setProfile]     = useState(null);
  const [groups,      setGroups]      = useState([]);
  const [activeGroup, setActiveGroup] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [toast,       setToast]       = useState(null);
  const toastT = useRef(null);

  useEffect(()=>{
    supabase.auth.getSession().then(async({ data:{ session } })=>{
      setSession(session);
      if (session) {
        const [prof, grps] = await Promise.all([loadProfile(session.user.id), loadGroups(session.user.id)]);
        setProfile(prof);
        setGroups(grps);
      }
      setAuthLoading(false);
    });

    const { data:{ subscription } } = supabase.auth.onAuthStateChange(async(event, session)=>{
      setSession(session);
      if (session) {
        const [prof, grps] = await Promise.all([loadProfile(session.user.id), loadGroups(session.user.id)]);
        setProfile(prof);
        setGroups(grps);
      } else {
        setProfile(null); setGroups([]); setActiveGroup(null);
      }
    });
    return ()=>subscription.unsubscribe();
  },[]);

  function notify(msg, type="ok") {
    clearTimeout(toastT.current);
    setToast({msg,type});
    toastT.current = setTimeout(()=>setToast(null), 2600);
  }

  async function handleCreate(g) {
    const plan = profile?.plan || 'free';
    const limit = PLAN_LIMITS[plan]||PLAN_LIMITS.free;
    if (groups.length >= limit.groups) {
      notify(`Plano ${plan} permite até ${limit.groups} grupo(s)`, "err"); return;
    }
    const newGroup = {...g, playerCount:0};
    await upsertGroup(newGroup, session.user.id);
    setGroups(gs=>[...gs, newGroup]);
    notify(`${g.emoji} ${g.name} criado!`);
  }

  async function handleDelete(id) {
    await deleteGroupById(id);
    setGroups(gs=>gs.filter(g=>g.id!==id));
    notify("Rachão removido");
  }

  function handleBack(count, gid, goBack=false) {
    setGroups(gs=>gs.map(g=>g.id===gid?{...g,playerCount:count}:g));
    if (goBack) setActiveGroup(null);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    setSession(null); setProfile(null); setGroups([]); setActiveGroup(null);
  }

  if (authLoading) return <Loader text="CARREGANDO..." />;
  if (!session)    return <AuthScreen />;
  if (!profile)    return <Loader text="CARREGANDO..." />;
  if (!profile.name) return <ProfileSetupScreen userId={session.user.id} onComplete={p=>{setProfile(p);}} />;

  if (activeGroup) {
    return (
      <>
        {toast&&<Toast msg={toast.msg} type={toast.type}/>}
        <GroupApp group={activeGroup} userId={session.user.id} plan={profile?.plan||'free'} onBack={handleBack} notify={notify}/>
      </>
    );
  }

  return (
    <>
      {toast&&<Toast msg={toast.msg} type={toast.type}/>}
      <GroupsScreen
        groups={groups}
        plan={profile?.plan||'free'}
        userName={profile?.name}
        onSelect={g=>setActiveGroup(g)}
        onCreate={handleCreate}
        onDelete={handleDelete}
        onLogout={handleLogout}
      />
    </>
  );
}
