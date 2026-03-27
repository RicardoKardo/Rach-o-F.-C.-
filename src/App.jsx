import { useState, useEffect, useRef } from "react";
import { supabase } from './lib/supabase.js';

const ADMIN_PIN = "1234";

const POSITIONS_LINE = [
  { id: "fixo", label: "Fixo",  short: "FX",  color: "#4FC3F7", emoji: "🛡️" },
  { id: "ala",  label: "Ala",   short: "ALA", color: "#FF8A65", emoji: "⚡" },
  { id: "meia", label: "Meia",  short: "MIA", color: "#81C784", emoji: "⚙️" },
  { id: "pivo", label: "Pivô",  short: "PIV", color: "#CE93D8", emoji: "🎯" },
];
const POSITION_GK = { id: "goleiro", label: "Goleiro", short: "GL", color: "#FFD700", emoji: "🧤" };
const ALL_POS = [POSITION_GK, ...POSITIONS_LINE];
const POS = Object.fromEntries(ALL_POS.map(p => [p.id, p]));

const FORMATIONS = {
  5: ["fixo","ala","ala","meia","pivo"],
  6: ["fixo","fixo","ala","ala","meia","pivo"],
};
const PITCH_SLOTS = {
  5: [
    { pos:"pivo", x:50, y:16 }, { pos:"ala", x:14, y:36 }, { pos:"ala", x:86, y:36 },
    { pos:"meia", x:50, y:55 }, { pos:"fixo", x:50, y:74 },
  ],
  6: [
    { pos:"pivo", x:50, y:14 }, { pos:"ala", x:14, y:33 }, { pos:"ala", x:86, y:33 },
    { pos:"meia", x:50, y:52 }, { pos:"fixo", x:26, y:72 }, { pos:"fixo", x:74, y:72 },
  ],
};
const TEAM_COLORS = [
  { name:"Branco",   bg:"#f0f0f0", text:"#111",    accent:"#d5d5d5", gkBg:"#e0e0e0" },
  { name:"Preto",    bg:"#181818", text:"#f0f0f0", accent:"#2a2a2a", gkBg:"#222" },
  { name:"Vermelho", bg:"#991b1b", text:"#fff",    accent:"#b91c1c", gkBg:"#7f1d1d" },
  { name:"Azul",     bg:"#1e3a8a", text:"#fff",    accent:"#1d4ed8", gkBg:"#1e3a8a" },
];
const GROUP_EMOJIS = ["⚽","🏆","🥇","🔥","⭐","🎯","🦁","🐯","🦊","🐺"];
const FONT = "'Barlow Condensed', Arial Narrow, Arial, sans-serif";

// ─── Supabase helpers ─────────────────────────────────────────────────────────

// Converte snake_case do banco → camelCase do app
function dbToPlayer(p) {
  return {
    ...p,
    isGoalkeeper: p.is_goalkeeper ?? false,
    positions:    Array.isArray(p.positions) ? p.positions : [],
    aliases:      Array.isArray(p.aliases)   ? p.aliases   : [],
  };
}

async function loadGroups() {
  const { data, error } = await supabase
    .from('groups')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) { console.error('loadGroups:', error); return []; }
  return data.map(g => ({
    id:          g.id,
    name:        g.name,
    emoji:       g.emoji || '⚽',
    playerCount: g.player_count || 0,
    created_at:  g.created_at,
  }));
}

async function saveGroup(group) {
  const { error } = await supabase
    .from('groups')
    .upsert({
      id:    group.id,
      name:  group.name,
      emoji: group.emoji || '⚽',
      player_count: group.playerCount || 0,
    }, { onConflict: 'id' });
  if (error) console.error('saveGroup:', error);
}

async function updateGroupPlayerCount(groupId, count) {
  const { error } = await supabase
    .from('groups')
    .update({ player_count: count })
    .eq('id', groupId);
  if (error) console.error('updateGroupPlayerCount:', error);
}

async function deleteGroupById(id) {
  const { error } = await supabase
    .from('groups')
    .delete()
    .eq('id', id);
  if (error) console.error('deleteGroupById:', error);
}

async function loadPlayers(groupId) {
  const { data, error } = await supabase
    .from('players')
    .select('*')
    .eq('group_id', groupId)
    .order('created_at', { ascending: true });
  if (error) { console.error('loadPlayers:', error); return []; }
  return data.map(dbToPlayer);
}

async function savePlayer(player, groupId) {
  const { error } = await supabase
    .from('players')
    .upsert({
      id:            player.id,
      group_id:      groupId,
      name:          player.name,
      is_goalkeeper: player.isGoalkeeper || false,
      positions:     player.positions    || [],
      aliases:       player.aliases      || [],
      foot:          player.foot         || 'direita',
      side:          player.side         || 'ambos',
      fisico:        player.fisico       || 2,
      defensivo:     player.defensivo    || 2,
      ofensivo:      player.ofensivo     || 2,
    }, { onConflict: 'id' });
  if (error) console.error('savePlayer:', error);
}

async function deletePlayerById(id) {
  const { error } = await supabase
    .from('players')
    .delete()
    .eq('id', id);
  if (error) console.error('deletePlayerById:', error);
}

async function loadWeekPlayers(groupId) {
  const today = new Date().toISOString().split('T')[0];
  const { data, error } = await supabase
    .from('week_players')
    .select('*')
    .eq('group_id', groupId)
    .eq('week_date', today);
  if (error) { console.error('loadWeekPlayers:', error); return { line: [], gk: [] }; }
  const line = data.filter(p => !p.is_goalkeeper).map(p => ({
    id:          p.player_id || p.id,
    name:        p.player_name,
    isGoalkeeper:false,
    avulso:      p.is_avulso,
    positions:   p.positions || ["ala"],
    aliases:     p.aliases   || [],
    foot:        p.foot      || 'direita',
    side:        p.side      || 'ambos',
    fisico:      p.fisico    || 2,
    defensivo:   p.defensivo || 2,
    ofensivo:    p.ofensivo  || 2,
  }));
  const gk = data.filter(p => p.is_goalkeeper).map(p => ({
    id:          p.player_id || p.id,
    name:        p.player_name,
    isGoalkeeper:true,
    avulso:      p.is_avulso,
  }));
  return { line, gk };
}

async function saveWeekPlayers(groupId, linePlayers, gkPlayers) {
  const today = new Date().toISOString().split('T')[0];
  // Apaga a lista atual do dia
  await supabase
    .from('week_players')
    .delete()
    .eq('group_id', groupId)
    .eq('week_date', today);

  const allPlayers = [
    ...linePlayers.map((p, i) => ({
      id:           `${groupId}_line_${i}_${today}`,
      group_id:     groupId,
      player_id:    p.id && !p.avulso ? p.id : null,
      player_name:  p.name,
      week_date:    today,
      is_goalkeeper:false,
      is_avulso:    p.avulso || false,
      positions:    p.positions || [],
      fisico:       p.fisico    || 2,
      defensivo:    p.defensivo || 2,
      ofensivo:     p.ofensivo  || 2,
    })),
    ...gkPlayers.map((p, i) => ({
      id:           `${groupId}_gk_${i}_${today}`,
      group_id:     groupId,
      player_id:    p.id && !p.avulso ? p.id : null,
      player_name:  p.name,
      week_date:    today,
      is_goalkeeper:true,
      is_avulso:    p.avulso || false,
    })),
  ];

  if (allPlayers.length > 0) {
    const { error } = await supabase.from('week_players').insert(allPlayers);
    if (error) console.error('saveWeekPlayers:', error);
  }
}

async function clearWeekPlayers(groupId) {
  const today = new Date().toISOString().split('T')[0];
  await supabase
    .from('week_players')
    .delete()
    .eq('group_id', groupId)
    .eq('week_date', today);
}

// ─── Utils ────────────────────────────────────────────────────────────────────
function normName(s) {
  return (s||"").toLowerCase().normalize("NFD")
    .replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9 ]/g,"").trim();
}
function stripExtras(s) {
  return s.replace(/[\u{1F000}-\u{1FFFF}]/gu,"")
    .replace(/[\u2600-\u27BF]/g,"").replace(/[^\w\s\u00C0-\u024F]/g,"")
    .replace(/\s+/g," ").trim();
}
function fuzzyMatch(rawName, players) {
  const norm  = normName(rawName);
  const words = norm.split(" ").filter(Boolean);
  if (!words.length) return null;
  for (const p of players) {
    const al = (p.aliases||[]).map(a => normName(a));
    if (al.includes(norm)) return p;
  }
  for (const p of players) {
    const al = (p.aliases||[]).map(a => normName(a));
    if (al.some(a => a.startsWith(words[0]) || words[0].startsWith(a.split(" ")[0]))) return p;
  }
  let m = players.find(p => normName(p.name) === norm);
  if (m) return m;
  m = players.find(p => normName(p.name).split(" ")[0] === words[0]);
  if (m) return m;
  if (words.length >= 2) {
    m = players.find(p => { const pn = normName(p.name); return words.every(w => w.length > 1 && pn.includes(w)); });
    if (m) return m;
  }
  return players.find(p => normName(p.name).startsWith(words[0])) || null;
}

function parseWhatsApp(text, players) {
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  let mode = "line";
  const lineNames = [], gkNames = [];
  for (const line of lines) {
    const plain = normName(line);
    if (/^goleiro/.test(plain))  { mode = "gk";   continue; }
    if (/^fora/.test(plain) || /^ausente/.test(plain)) { mode = "fora"; continue; }
    if (mode === "fora") continue;
    if (mode === "line") {
      const m = line.match(/^(\d+)\s*[\.\-\s]\s*(.+)/);
      if (m) { const n = stripExtras(m[2]); if (n.length > 1) lineNames.push(n); }
    } else if (mode === "gk") {
      if (line.match(/^\d+[\.\-]/)) continue;
      const n = stripExtras(line);
      if (n.length > 1) gkNames.push(n);
    }
  }
  const dbLine = players.filter(p => !p.isGoalkeeper);
  const dbGK   = players.filter(p =>  p.isGoalkeeper);
  return {
    lineResult: lineNames.map(raw => { const found = fuzzyMatch(raw, dbLine); return { raw, player: found, matched: !!found }; }),
    gkResult:   gkNames.map(raw  => { const found = fuzzyMatch(raw, dbGK) || fuzzyMatch(raw, dbLine); return { raw, player: found, matched: !!found }; }),
  };
}

function playerScore(p) { return (p.fisico||1) + (p.defensivo||1) + (p.ofensivo||1); }

function makeGhost(pos) {
  return { id:"ghost_"+pos+"_"+Math.random(), name:"Da fila", assignedPos:pos, isGhost:true, positions:[pos], fisico:1, defensivo:1, ofensivo:1 };
}

function assignPositions(team, formation) {
  const slots  = [...formation];
  const filled = new Array(slots.length).fill(false);
  const result = team.map(p => ({ ...p, assignedPos: null }));
  const order  = [...result.keys()].sort((a,b) => (result[a].positions?.length||1) - (result[b].positions?.length||1));
  for (const idx of order) {
    const pl = result[idx]; let done = false;
    for (let i = 0; i < slots.length; i++) {
      if (!filled[i] && (pl.positions||[]).includes(slots[i])) {
        result[idx].assignedPos = slots[i]; filled[i] = true; done = true; break;
      }
    }
    if (!done) { const e = filled.findIndex(f => !f); if (e >= 0) { result[idx].assignedPos = slots[e]; filled[e] = true; } }
  }
  return result;
}

function balanceTeams(linePlayers, teamSize) {
  const formation = FORMATIONS[teamSize];
  const numFull   = Math.min(4, Math.floor(linePlayers.length / teamSize));
  if (numFull < 2) return null;
  const pool  = linePlayers.slice(0, numFull * teamSize);
  const extra = linePlayers.slice(numFull * teamSize);
  const shuffle = a => [...a].sort(() => Math.random() - 0.5);
  let best = null, bestScore = -Infinity;
  for (let i = 0; i < 600; i++) {
    const s     = shuffle(pool);
    const teams = Array.from({ length: numFull }, (_, k) => assignPositions(s.slice(k*teamSize, (k+1)*teamSize), formation));
    const totals   = teams.map(t => t.reduce((a,p) => a + playerScore(p), 0));
    const avg      = totals.reduce((a,b) => a+b, 0) / numFull;
    const variance = totals.reduce((s,t) => s + Math.pow(t-avg,2), 0);
    const posFit   = teams.reduce((a,t) => a + t.filter(p => (p.positions||[]).includes(p.assignedPos)).length, 0);
    const sc = -variance + posFit * 6;
    if (sc > bestScore) { bestScore = sc; best = teams; }
  }
  if (extra.length > 0 && numFull < 4) {
    const partialReal = assignPositions(extra, formation.slice(0, extra.length));
    const ghosts = formation.slice(extra.length).map(pos => makeGhost(pos));
    best = [...best, [...partialReal, ...ghosts]];
  }
  return best;
}

// ─── CSS global ───────────────────────────────────────────────────────────────
const GLOBAL_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;600;700;800;900&display=swap');
  * { -webkit-tap-highlight-color:transparent; box-sizing:border-box; }
  body { margin:0; background:#060d06; }
  input::placeholder, textarea::placeholder { color:#1e3a1e; }
  select option { background:#0a130a; color:#e8f5e8; }
  button:active { opacity:.82; transform:scale(0.97); }
  @keyframes pop { 0%{opacity:0;transform:translateX(-50%) scale(0.85)} 100%{opacity:1;transform:translateX(-50%) scale(1)} }
`;

// ─── Shared style helpers ─────────────────────────────────────────────────────
const S = {
  card: (x={}) => ({ background:"#0d160d", border:"1px solid #162616", borderRadius:12, padding:14, marginBottom:12, ...x }),
  lbl:  (x={}) => ({ fontSize:10, color:"#3a5a3a", letterSpacing:2.5, textTransform:"uppercase", marginBottom:8, fontWeight:700, ...x }),
  inp:  { width:"100%", background:"#0a130a", border:"1px solid #1e3a1e", color:"#e8f5e8", padding:"11px 13px", borderRadius:8, fontSize:15, outline:"none", boxSizing:"border-box", fontFamily:FONT },
  sel:  (x={}) => ({ background:"#0a130a", border:"1px solid #1e3a1e", color:"#e8f5e8", padding:"8px 12px", borderRadius:8, fontSize:13, outline:"none", fontFamily:FONT, ...x }),
  btnG: (x={}) => ({ background:"linear-gradient(135deg,#16a34a,#15803d)", color:"#fff", border:"none", borderRadius:8, padding:"12px", fontSize:14, fontWeight:800, cursor:"pointer", letterSpacing:1, textTransform:"uppercase", width:"100%", marginTop:8, boxShadow:"0 4px 16px #16a34a44", fontFamily:FONT, ...x }),
  btnSm:(col,x={}) => ({ background:"transparent", color:col, border:`1px solid ${col}33`, borderRadius:6, padding:"4px 10px", fontSize:11, cursor:"pointer", fontWeight:700, fontFamily:FONT, ...x }),
};

// ─── Small components ─────────────────────────────────────────────────────────
function Badge({ posId }) {
  const p = POS[posId] || { short:"?", color:"#888", emoji:"?" };
  return (
    <span style={{ background:p.color+"22", color:p.color, border:`1px solid ${p.color}44`, borderRadius:20, padding:"1px 7px", fontSize:10, fontWeight:800, letterSpacing:0.5, whiteSpace:"nowrap" }}>
      {p.emoji} {p.short}
    </span>
  );
}

function Stars({ value, color }) {
  return (
    <span>
      {[1,2,3].map(v => (
        <span key={v} style={{ color: v <= (value||1) ? color : "#1e2e1e", fontSize:13 }}>★</span>
      ))}
    </span>
  );
}

function Toast({ msg, type }) {
  return (
    <div style={{ position:"fixed", top:14, left:"50%", transform:"translateX(-50%)", background:type==="err"?"#7f1d1d":"#14532d", color:"#fff", padding:"10px 22px", borderRadius:24, fontSize:13, fontWeight:700, zIndex:9999, border:`1px solid ${type==="err"?"#f87171":"#4ade80"}`, boxShadow:"0 4px 24px #00000099", animation:"pop .22s cubic-bezier(.34,1.56,.64,1)", whiteSpace:"nowrap" }}>
      {msg}
    </div>
  );
}

function Loader() {
  return (
    <div style={{ minHeight:"100vh", background:"#060d06", display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ textAlign:"center", color:"#3a5a3a", fontFamily:FONT }}>
        <div style={{ fontSize:56, animation:"pulse 1s infinite" }}>⚽</div>
        <div style={{ fontSize:13, marginTop:12, letterSpacing:2 }}>CARREGANDO...</div>
      </div>
    </div>
  );
}

// ─── Pitch ────────────────────────────────────────────────────────────────────
function Pitch({ team, teamSize, tc }) {
  const slots = PITCH_SLOTS[teamSize] || PITCH_SLOTS[5];
  const posGroups = {};
  team.forEach(p => {
    const ap = p.assignedPos || "fixo";
    if (!posGroups[ap]) posGroups[ap] = [];
    posGroups[ap].push(p);
  });
  return (
    <div style={{ position:"relative", width:"100%", paddingBottom:"148%", background:"linear-gradient(175deg,#14532d 0%,#166534 48%,#14532d 100%)", borderRadius:10, overflow:"hidden" }}>
      <svg style={{ position:"absolute", inset:0, width:"100%", height:"100%", pointerEvents:"none" }} viewBox="0 0 100 148" preserveAspectRatio="none">
        <rect x="2.5" y="2.5" width="95" height="143" fill="none" stroke="rgba(255,255,255,.28)" strokeWidth=".8"/>
        <line x1="2.5" y1="74" x2="97.5" y2="74" stroke="rgba(255,255,255,.22)" strokeWidth=".6"/>
        <circle cx="50" cy="74" r="13" fill="none" stroke="rgba(255,255,255,.22)" strokeWidth=".6"/>
        <ellipse cx="50" cy="74" rx="2" ry="2" fill="rgba(255,255,255,.2)"/>
        <rect x="31" y="2.5" width="38" height="13" fill="none" stroke="rgba(255,255,255,.18)" strokeWidth=".6"/>
        <rect x="31" y="132.5" width="38" height="13" fill="none" stroke="rgba(255,255,255,.18)" strokeWidth=".6"/>
        {[0,1,2,3,4,5,6].map(i => (
          <rect key={i} x="2.5" y={2.5+i*20.5} width="95" height="10.2" fill={i%2===0?"rgba(255,255,255,.025)":"transparent"}/>
        ))}
      </svg>
      {slots.map((slot, i) => {
        const pGroup  = posGroups[slot.pos] || [];
        const slotIdx = slots.filter((s,j) => j < i && s.pos === slot.pos).length;
        const player  = pGroup[slotIdx];
        const posData = POS[slot.pos];
        const isGhost = player?.isGhost;
        const total   = player && !isGhost ? playerScore(player) : 0;
        const stars   = total >= 8 ? 3 : total >= 6 ? 2 : 1;
        return (
          <div key={i} style={{ position:"absolute", left:`${slot.x}%`, top:`${slot.y}%`, transform:"translate(-50%,-50%)", display:"flex", flexDirection:"column", alignItems:"center", zIndex:2 }}>
            <div style={{ width:40, height:40, borderRadius:"50%", background:isGhost?"rgba(0,0,0,.35)":tc.accent, border:isGhost?"2px dashed rgba(255,255,255,.3)":`2.5px solid ${tc.text}30`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, fontWeight:900, color:isGhost?"rgba(255,255,255,.4)":tc.text, boxShadow:"0 2px 10px rgba(0,0,0,.6)", textAlign:"center", padding:"0 2px", lineHeight:1.15 }}>
              {isGhost ? "?" : player ? player.name.split(" ")[0].slice(0,7) : "?"}
            </div>
            <div style={{ marginTop:2, background:"rgba(0,0,0,.75)", color:isGhost?"rgba(255,255,255,.3)":(posData?.color||"#fff"), fontSize:8, fontWeight:800, borderRadius:4, padding:"1px 5px", letterSpacing:.5, display:"flex", gap:3, alignItems:"center" }}>
              <span>{posData?.short}</span>
              {player && !isGhost && <span style={{ color:"#facc15" }}>{"★".repeat(stars)}</span>}
            </div>
          </div>
        );
      })}
      <div style={{ position:"absolute", left:"50%", bottom:"1.5%", transform:"translateX(-50%)", display:"flex", flexDirection:"column", alignItems:"center", zIndex:2 }}>
        <div style={{ width:36, height:36, borderRadius:"50%", background:"#78350f", border:"2px solid #fbbf2430", display:"flex", alignItems:"center", justifyContent:"center", fontSize:16, boxShadow:"0 2px 10px rgba(0,0,0,.6)" }}>🧤</div>
        <div style={{ marginTop:2, background:"rgba(0,0,0,.75)", color:"#FFD700", fontSize:8, fontWeight:800, borderRadius:4, padding:"1px 5px" }}>GL</div>
      </div>
    </div>
  );
}

// ─── PIN ──────────────────────────────────────────────────────────────────────
function PinScreen({ onUnlock }) {
  const [pin, setPin] = useState("");
  const [err, setErr] = useState(false);

  function press(d) {
    const next = (pin + d).slice(0, 4);
    setPin(next); setErr(false);
    if (next.length === 4) {
      if (next === ADMIN_PIN) onUnlock();
      else { setErr(true); setTimeout(() => setPin(""), 700); }
    }
  }

  return (
    <div style={{ minHeight:"100vh", background:"#060d06", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:28, fontFamily:FONT }}>
      <style>{GLOBAL_CSS}</style>
      <div style={{ textAlign:"center" }}>
        <div style={{ fontSize:56 }}>⚽</div>
        <div style={{ fontSize:32, fontWeight:900, color:"#4ade80", letterSpacing:3, marginTop:8 }}>RACHÃO FC</div>
        <div style={{ fontSize:11, color:"#2a4a2a", letterSpacing:4, marginTop:4 }}>ÁREA DO ADMIN</div>
      </div>
      <div style={{ display:"flex", gap:16 }}>
        {[0,1,2,3].map(i => (
          <div key={i} style={{ width:16, height:16, borderRadius:"50%", background:pin.length>i?(err?"#ef4444":"#4ade80"):"#162616", border:`2px solid ${pin.length>i?(err?"#ef4444":"#4ade80"):"#1e3a1e"}`, transition:"all .15s" }}/>
        ))}
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3, 74px)", gap:10 }}>
        {[1,2,3,4,5,6,7,8,9,"",0,"⌫"].map((d,i) => (
          <button key={i}
            onClick={() => { if (d==="⌫") setPin(p=>p.slice(0,-1)); else if (d!=="") press(String(d)); }}
            style={{ height:74, borderRadius:12, fontSize:d==="⌫"?22:28, fontWeight:800, cursor:d===""?"default":"pointer", background:d===""?"transparent":"#0d160d", color:d==="⌫"?"#4a6a4a":"#e8f5e8", border:d===""?"none":"1px solid #1a2e1a", opacity:d===""?0:1, fontFamily:FONT }}>
            {d}
          </button>
        ))}
      </div>
      {err && <div style={{ color:"#ef4444", fontSize:13, fontWeight:700 }}>PIN incorreto</div>}
    </div>
  );
}

// ─── Groups screen ────────────────────────────────────────────────────────────
function GroupsScreen({ groups, onSelect, onCreate, onDelete, onLock }) {
  const [newName,  setNewName]  = useState("");
  const [creating, setCreating] = useState(false);
  const [emojiIdx, setEmojiIdx] = useState(0);

  function handleCreate() {
    if (!newName.trim()) return;
    onCreate({ name: newName.trim(), emoji: GROUP_EMOJIS[emojiIdx], id: Date.now().toString() });
    setNewName(""); setCreating(false);
  }

  return (
    <div style={{ minHeight:"100vh", background:"#060d06", fontFamily:FONT, color:"#e8f5e8", maxWidth:480, margin:"0 auto", paddingBottom:40 }}>
      <style>{GLOBAL_CSS}</style>
      <div style={{ background:"linear-gradient(160deg,#0b1e0b,#060d06)", borderBottom:"1px solid #162616", padding:"14px 16px 10px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <span style={{ fontSize:24 }}>⚽</span>
          <div>
            <div style={{ fontSize:20, fontWeight:900, color:"#4ade80", letterSpacing:2 }}>RACHÃO FC</div>
            <div style={{ fontSize:10, color:"#2e4e2e", letterSpacing:3 }}>MEUS RACHÕES</div>
          </div>
        </div>
        <button onClick={onLock} style={{ background:"transparent", color:"#2e4e2e", border:"1px solid #162616", borderRadius:6, padding:"5px 10px", fontSize:11, cursor:"pointer", fontWeight:700, fontFamily:FONT }}>SAIR</button>
      </div>
      <div style={{ padding:16 }}>
        {groups.length === 0 && !creating && (
          <div style={{ textAlign:"center", padding:"50px 20px", color:"#1e2e1e" }}>
            <div style={{ fontSize:56, marginBottom:12 }}>🏟️</div>
            <div style={{ fontSize:18, fontWeight:800, color:"#2e4e2e" }}>Nenhum rachão ainda</div>
            <div style={{ fontSize:13, color:"#1e2e1e", marginTop:6 }}>Crie seu primeiro grupo abaixo</div>
          </div>
        )}
        {groups.map(g => (
          <div key={g.id} style={{ background:"#0d160d", border:"1px solid #162616", borderRadius:12, padding:"14px 16px", marginBottom:10, display:"flex", alignItems:"center", gap:14 }}>
            <div style={{ fontSize:36 }}>{g.emoji||"⚽"}</div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:18, fontWeight:900, color:"#e8f5e8", letterSpacing:1 }}>{g.name}</div>
              <div style={{ fontSize:11, color:"#3a5a3a", marginTop:2 }}>{g.playerCount||0} atletas cadastrados</div>
            </div>
            <div style={{ display:"flex", gap:6 }}>
              <button onClick={() => onSelect(g)} style={{ background:"linear-gradient(135deg,#16a34a,#15803d)", color:"#fff", border:"none", borderRadius:8, padding:"10px 16px", fontSize:13, fontWeight:900, cursor:"pointer", fontFamily:FONT, letterSpacing:1 }}>ENTRAR →</button>
              <button onClick={() => onDelete(g.id)} style={{ background:"transparent", color:"#ef4444", border:"1px solid #ef444433", borderRadius:8, padding:"10px", fontSize:12, cursor:"pointer", fontFamily:FONT }}>✕</button>
            </div>
          </div>
        ))}
        {creating ? (
          <div style={S.card({ border:"1px solid #1e4a3a", marginTop:8 })}>
            <div style={S.lbl()}>NOVO RACHÃO</div>
            <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:12 }}>
              {GROUP_EMOJIS.map((e,i) => (
                <button key={e} onClick={() => setEmojiIdx(i)} style={{ fontSize:24, background:emojiIdx===i?"#1a3a2a":"transparent", border:emojiIdx===i?"1px solid #4ade80":"1px solid #162616", borderRadius:8, padding:"6px 10px", cursor:"pointer" }}>{e}</button>
              ))}
            </div>
            <input style={{ ...S.inp, marginBottom:10 }} placeholder="Nome do rachão..." value={newName}
              onChange={e => setNewName(e.target.value)} onKeyDown={e => e.key==="Enter" && handleCreate()} autoFocus/>
            <div style={{ display:"flex", gap:8 }}>
              <button onClick={handleCreate} style={{ flex:1, background:"linear-gradient(135deg,#16a34a,#15803d)", color:"#fff", border:"none", borderRadius:8, padding:"12px", fontSize:14, fontWeight:800, cursor:"pointer", fontFamily:FONT }}>✅ CRIAR</button>
              <button onClick={() => setCreating(false)} style={{ flex:1, background:"#1f2937", color:"#e8f5e8", border:"none", borderRadius:8, padding:"12px", fontSize:14, fontWeight:800, cursor:"pointer", fontFamily:FONT }}>CANCELAR</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setCreating(true)} style={{ width:"100%", background:"transparent", border:"1.5px dashed #1e3a1e", borderRadius:12, padding:"18px", fontSize:15, fontWeight:800, cursor:"pointer", color:"#3a5a3a", fontFamily:FONT, marginTop:6, letterSpacing:1 }}>
            + NOVO RACHÃO
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Player row ───────────────────────────────────────────────────────────────
function PlayerRow({ pl, onEdit, onDelete }) {
  return (
    <div style={{ background:"#0a130a", border:"1px solid #141e14", borderRadius:10, padding:"10px 12px", marginBottom:6, display:"flex", alignItems:"flex-start", gap:10 }}>
      <div style={{ flex:1 }}>
        <div style={{ fontWeight:800, fontSize:15 }}>{pl.name}</div>
        {pl.aliases?.length > 0 && (
          <div style={{ fontSize:10, color:"#2a4a2a", marginTop:2, fontStyle:"italic" }}>aka: {pl.aliases.join(", ")}</div>
        )}
        <div style={{ display:"flex", gap:4, flexWrap:"wrap", marginTop:4 }}>
          {pl.isGoalkeeper
            ? <Badge posId="goleiro"/>
            : (pl.positions||[]).map(pos => <Badge key={pos} posId={pos}/>)
          }
          {!pl.isGoalkeeper && (
            <span style={{ fontSize:10, color:"#2a4a2a", alignSelf:"center" }}>
              🦵{pl.foot==="ambas"?"±":pl.foot==="esquerda"?"E":"D"}
              {" "}{pl.side==="canhoto"?"◀":pl.side==="destro"?"▶":"◀▶"}
            </span>
          )}
        </div>
        {!pl.isGoalkeeper && (
          <div style={{ display:"flex", gap:10, marginTop:5 }}>
            <span style={{ fontSize:11 }}>💪 <Stars value={pl.fisico} color="#f97316"/></span>
            <span style={{ fontSize:11 }}>🛡️ <Stars value={pl.defensivo} color="#4FC3F7"/></span>
            <span style={{ fontSize:11 }}>🎯 <Stars value={pl.ofensivo} color="#4ade80"/></span>
          </div>
        )}
      </div>
      <div style={{ display:"flex", gap:6 }}>
        <button onClick={() => onEdit(pl)} style={{ background:"transparent", color:"#facc15", border:"1px solid #facc1533", borderRadius:6, padding:"4px 9px", fontSize:11, cursor:"pointer", fontWeight:700, fontFamily:FONT }}>✏️</button>
        <button onClick={() => onDelete(pl.id)} style={{ background:"transparent", color:"#ef4444", border:"1px solid #ef444433", borderRadius:6, padding:"4px 9px", fontSize:11, cursor:"pointer", fontWeight:700, fontFamily:FONT }}>✕</button>
      </div>
    </div>
  );
}

// ─── Group App ────────────────────────────────────────────────────────────────
function GroupApp({ group, onBack, notify }) {
  const gid = group.id;
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

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [pl, week] = await Promise.all([
        loadPlayers(gid),
        loadWeekPlayers(gid),
      ]);
      setPlayers(pl);
      setWeekLine(week.line);
      setWeekGK(week.gk);
      setPasteOpen(week.line.length === 0);
      setLoading(false);
    })();
  }, [gid]);

  const emptyForm = () => ({ name:"", isGoalkeeper:false, positions:[], foot:"direita", side:"ambos", fisico:2, defensivo:2, ofensivo:2, aliases:[] });
  const openAdd  = () => { setEditId(null); setForm(emptyForm()); setAliasInput(""); };
  const openEdit = pl => {
    setEditId(pl.id);
    setForm({ name:pl.name, isGoalkeeper:pl.isGoalkeeper||false, positions:[...(pl.positions||[])], foot:pl.foot||"direita", side:pl.side||"ambos", fisico:pl.fisico||2, defensivo:pl.defensivo||2, ofensivo:pl.ofensivo||2, aliases:[...(pl.aliases||[])] });
    setAliasInput("");
    setTab("atletas");
  };
  const addAlias    = () => { const a = aliasInput.trim(); if (!a || form.aliases.includes(a)) return; setForm(f => ({ ...f, aliases:[...f.aliases,a] })); setAliasInput(""); };
  const removeAlias = a => setForm(f => ({ ...f, aliases: f.aliases.filter(x => x !== a) }));
  const togglePos   = pos => setForm(f => ({ ...f, positions: f.positions.includes(pos) ? f.positions.filter(p => p !== pos) : [...f.positions, pos] }));

  async function saveForm() {
    if (!form.name.trim()) { notify("Nome obrigatório","err"); return; }
    if (!form.isGoalkeeper && form.positions.length === 0) { notify("Selecione pelo menos uma posição","err"); return; }
    setSaving(true);
    const id   = editId || Date.now().toString();
    const data = { ...form, id, name: form.name.trim() };
    await savePlayer(data, gid);
    const updated = editId
      ? players.map(p => p.id === editId ? data : p)
      : [...players, data];
    setPlayers(updated);
    await updateGroupPlayerCount(gid, updated.length);
    onBack(updated.length, gid);
    notify(editId ? "Atleta atualizado ✓" : "Atleta adicionado ✓");
    setForm(null); setEditId(null); setSaving(false);
  }

  async function deletePlayer(id) {
    await deletePlayerById(id);
    const updated = players.filter(p => p.id !== id);
    setPlayers(updated);
    setWeekLine(wl => wl.filter(p => p.id !== id));
    await updateGroupPlayerCount(gid, updated.length);
    onBack(updated.length, gid);
    notify("Removido");
  }

  function doParse() {
    if (!listText.trim()) { notify("Cole a lista primeiro","err"); return; }
    const result = parseWhatsApp(listText, players);
    if (!result.lineResult.length && !result.gkResult.length) { notify("Nenhum jogador encontrado","err"); return; }
    setParsed(result);
  }

  async function confirmParsed() {
    if (!parsed) return;
    setSaving(true);
    const newLine = parsed.lineResult.map(r => r.player || { id:"av_"+Date.now()+Math.random(), name:r.raw, isGoalkeeper:false, positions:["ala"], foot:"direita", side:"ambos", fisico:2, defensivo:2, ofensivo:2, avulso:true });
    const newGK   = parsed.gkResult.map(r  => r.player || { id:"gkav_"+Date.now()+Math.random(), name:r.raw, isGoalkeeper:true, avulso:true });
    await saveWeekPlayers(gid, newLine, newGK);
    setWeekLine(newLine); setWeekGK(newGK);
    setTeams(null); setAssignedGKs({});
    setParsed(null); setListText(""); setPasteOpen(false); setSaving(false);
    notify(`✓ ${newLine.length} jogadores + ${newGK.length} goleiro${newGK.length!==1?"s":""}`);
  }

  async function clearWeek() {
    await clearWeekPlayers(gid);
    setWeekLine([]); setWeekGK([]);
    setTeams(null); setAssignedGKs({});
    setParsed(null); setListText(""); setPasteOpen(true);
    notify("Nova semana — lista zerada ✓");
  }

  function doSort() {
    const numFull = Math.min(4, Math.floor(weekLine.length / teamSize));
    if (numFull < 2) { notify(`Precisa de pelo menos ${teamSize*2} jogadores de linha!`,"err"); return; }
    const result = balanceTeams(weekLine, teamSize);
    if (!result) { notify("Não foi possível sortear","err"); return; }
    setTeams(result); setAssignedGKs({});
    const rem = weekLine.length - numFull * teamSize;
    if (rem > 0 && numFull < 4) notify(`Times sorteados! ⚽  Time ${numFull+1} incompleto (${rem}/${teamSize})`);
    else notify("Times sorteados! ⚽");
  }

  if (loading) return <Loader />;

  const tabs = [
    { id:"lista",   icon:"📋", label:"Lista",   badge: weekLine.length || null },
    { id:"atletas", icon:"👥", label:"Atletas", badge: players.length  || null },
    { id:"sorteio", icon:"⚽", label:"Sorteio", badge: teams ? teams.length : null },
  ];

  return (
    <div style={{ minHeight:"100vh", background:"#060d06", fontFamily:FONT, color:"#e8f5e8", maxWidth:480, margin:"0 auto", paddingBottom:90 }}>
      <style>{GLOBAL_CSS}</style>

      {/* Header */}
      <div style={{ background:"linear-gradient(160deg,#0b1e0b,#060d06)", borderBottom:"1px solid #162616", padding:"14px 16px 10px", position:"sticky", top:0, zIndex:10, boxShadow:"0 2px 20px #00000090", display:"flex", alignItems:"center", gap:10 }}>
        <button onClick={() => onBack(players.length, gid, true)} style={{ background:"transparent", border:"none", color:"#3a5a3a", fontSize:28, cursor:"pointer", padding:"0 4px 0 0", lineHeight:1, fontFamily:FONT }}>‹</button>
        <span style={{ fontSize:22 }}>{group.emoji||"⚽"}</span>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:18, fontWeight:900, color:"#4ade80", letterSpacing:1 }}>{group.name.toUpperCase()}</div>
          <div style={{ fontSize:10, color:"#2e4e2e", letterSpacing:3 }}>PAINEL ADMIN</div>
        </div>
        {saving && <div style={{ fontSize:11, color:"#3a5a3a", letterSpacing:1 }}>💾 salvando...</div>}
      </div>

      {/* Tabs */}
      <div style={{ display:"flex", background:"#0a100a", borderBottom:"1px solid #162616", position:"sticky", top:52, zIndex:9 }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{ flex:1, padding:"11px 2px", fontSize:10, fontWeight:tab===t.id?800:600, letterSpacing:1.2, textAlign:"center", cursor:"pointer", textTransform:"uppercase", color:tab===t.id?"#4ade80":"#2e4e2e", background:"none", border:"none", borderBottom:tab===t.id?"2px solid #4ade80":"2px solid transparent", fontFamily:FONT }}>
            {t.icon} {t.label}
            {t.badge != null && (
              <span style={{ marginLeft:4, background:tab===t.id?"#4ade80":"#162616", color:tab===t.id?"#060d06":"#2e4e2e", borderRadius:10, padding:"0 5px", fontSize:9, fontWeight:900 }}>{t.badge}</span>
            )}
          </button>
        ))}
      </div>

      <div style={{ padding:14 }}>

        {/* ── LISTA ── */}
        {tab === "lista" && (
          <div>
            {weekLine.length > 0 && (
              <div style={S.card()}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                  <div>
                    <span style={{ fontSize:34, fontWeight:900, color:"#4ade80" }}>{weekLine.length}</span>
                    <span style={{ fontSize:13, color:"#3a5a3a", marginLeft:8 }}>de linha</span>
                    {weekGK.length > 0 && <span style={{ fontSize:12, color:"#fbbf24", marginLeft:12 }}>🧤 {weekGK.length} goleiro{weekGK.length>1?"s":""}</span>}
                  </div>
                  <button onClick={clearWeek} style={S.btnSm("#f87171", { padding:"7px 12px" })}>🔄 Nova semana</button>
                </div>
                <div style={{ marginTop:10, display:"flex", flexWrap:"wrap", gap:5 }}>
                  {weekLine.map((p,i) => (
                    <div key={p.id||i} style={{ background:p.avulso?"#2a1e0a":"#0a1e0a", border:`1px solid ${p.avulso?"#d97706":"#1e4a1e"}33`, borderRadius:8, padding:"3px 9px", fontSize:12, fontWeight:700, color:p.avulso?"#d97706":"#4ade80", display:"flex", alignItems:"center", gap:4 }}>
                      <span style={{ fontSize:10, color:"#3a5a3a" }}>{i+1}.</span>
                      {p.name}{p.avulso && <span style={{ fontSize:9, opacity:.6 }}>av</span>}
                    </div>
                  ))}
                </div>
                {weekGK.length > 0 && (
                  <div style={{ marginTop:8, paddingTop:8, borderTop:"1px solid #162616" }}>
                    <div style={{ fontSize:10, color:"#fbbf24", fontWeight:700, letterSpacing:2, marginBottom:5 }}>🧤 GOLEIROS</div>
                    <div style={{ display:"flex", flexWrap:"wrap", gap:5 }}>
                      {weekGK.map((p,i) => <div key={p.id||i} style={{ background:"#1c1200", border:"1px solid #fbbf2433", borderRadius:8, padding:"3px 9px", fontSize:12, fontWeight:700, color:"#fbbf24" }}>🧤 {p.name}</div>)}
                    </div>
                  </div>
                )}
                {!pasteOpen && <button onClick={() => setPasteOpen(true)} style={S.btnG({ marginTop:10, background:"#162616", boxShadow:"none", letterSpacing:0 })}>📋 Colar nova lista</button>}
              </div>
            )}
            {pasteOpen && (
              <div style={S.card()}>
                <div style={S.lbl()}>📋 COLE A LISTA DO WHATSAPP</div>
                <textarea style={{ ...S.inp, height:200, resize:"vertical", fontSize:13, lineHeight:1.6 }}
                  placeholder={"Futebol ⚽ 18/03\n1-Arthur\n2-Vinicius\n...\n\nGoleiros\nAlan\n\nFora:\nCoca"}
                  value={listText} onChange={e => setListText(e.target.value)}/>
                <button onClick={doParse} style={S.btnG()}>🔍 PROCESSAR LISTA</button>
              </div>
            )}
            {parsed && (
              <div style={S.card({ border:"1px solid #1e3a1e" })}>
                <div style={S.lbl()}>RESULTADO DO CRUZAMENTO</div>
                <div style={{ marginBottom:10 }}>
                  <div style={{ fontSize:11, color:"#3a5a3a", marginBottom:6, fontWeight:700, letterSpacing:2 }}>👥 LINHA ({parsed.lineResult.length})</div>
                  {parsed.lineResult.map((r,i) => (
                    <div key={i} style={{ display:"flex", alignItems:"center", gap:8, padding:"6px 0", borderBottom:"1px solid #0f1e0f" }}>
                      <span style={{ fontSize:11, color:"#2a3a2a", minWidth:20 }}>{i+1}.</span>
                      <span style={{ flex:1, fontSize:13, fontWeight:700 }}>{r.raw}</span>
                      {r.matched
                        ? <span style={{ fontSize:10, color:"#4ade80", fontWeight:800 }}>✓ {r.player.name!==r.raw?r.player.name:"ok"}</span>
                        : <span style={{ fontSize:10, color:"#f97316", fontWeight:800 }}>⚠ avulso</span>
                      }
                    </div>
                  ))}
                </div>
                {parsed.gkResult.length > 0 && (
                  <div style={{ marginBottom:10 }}>
                    <div style={{ fontSize:11, color:"#fbbf24", marginBottom:6, fontWeight:700, letterSpacing:2 }}>🧤 GOLEIROS ({parsed.gkResult.length})</div>
                    {parsed.gkResult.map((r,i) => (
                      <div key={i} style={{ display:"flex", alignItems:"center", gap:8, padding:"5px 0" }}>
                        <span style={{ flex:1, fontSize:13, fontWeight:700 }}>{r.raw}</span>
                        <span style={{ fontSize:10, color:r.matched?"#fbbf24":"#f97316", fontWeight:800 }}>
                          {r.matched ? `✓ ${r.player.name!==r.raw?r.player.name:"ok"}` : "⚠ não cadastrado"}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                <button onClick={confirmParsed} style={S.btnG()}>✅ CONFIRMAR LISTA</button>
                <button onClick={() => setParsed(null)} style={S.btnG({ background:"#1f2937", boxShadow:"none", marginTop:6 })}>CANCELAR</button>
              </div>
            )}
          </div>
        )}

        {/* ── ATLETAS ── */}
        {tab === "atletas" && (
          <div>
            <div style={{ display:"flex", gap:8, marginBottom:12 }}>
              <div style={S.card({ flex:1, marginBottom:0, textAlign:"center", padding:"10px 6px" })}>
                <div style={{ fontSize:26, fontWeight:900, color:"#4ade80" }}>{players.filter(p=>!p.isGoalkeeper).length}</div>
                <div style={{ fontSize:10, color:"#3a5a3a" }}>JOGADORES</div>
              </div>
              <div style={S.card({ flex:1, marginBottom:0, textAlign:"center", padding:"10px 6px" })}>
                <div style={{ fontSize:26, fontWeight:900, color:"#FFD700" }}>{players.filter(p=>p.isGoalkeeper).length}</div>
                <div style={{ fontSize:10, color:"#3a5a3a" }}>GOLEIROS</div>
              </div>
              <button onClick={openAdd} style={{ background:"linear-gradient(135deg,#16a34a,#15803d)", color:"#fff", border:"none", borderRadius:10, padding:"0 22px", fontSize:26, cursor:"pointer", fontWeight:900, boxShadow:"0 4px 16px #16a34a44" }}>+</button>
            </div>

            {form && (
              <div style={S.card({ border:"1px solid #1e4a3a" })}>
                <div style={S.lbl()}>{editId ? "✏️ EDITAR ATLETA" : "➕ NOVO ATLETA"}</div>
                <input style={S.inp} placeholder="Nome do atleta..." value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  onKeyDown={e => e.key==="Enter" && saveForm()}/>
                <div style={{ marginTop:10 }}>
                  <button onClick={() => setForm(f => ({ ...f, isGoalkeeper: !f.isGoalkeeper, positions: [] }))}
                    style={{ padding:"8px 16px", borderRadius:8, fontSize:13, fontWeight:800, cursor:"pointer", fontFamily:FONT, background:form.isGoalkeeper?"#78350f":"#0d160d", color:form.isGoalkeeper?"#fbbf24":"#3a5a3a", border:`1px solid ${form.isGoalkeeper?"#fbbf2444":"#162616"}` }}>
                    🧤 {form.isGoalkeeper ? "É GOLEIRO" : "Marcar como Goleiro"}
                  </button>
                </div>
                {!form.isGoalkeeper && (
                  <div style={{ marginTop:12 }}>
                    <div style={S.lbl({ marginBottom:6 })}>POSIÇÕES</div>
                    <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                      {POSITIONS_LINE.map(p => {
                        const on = form.positions.includes(p.id);
                        return (
                          <button key={p.id} onClick={() => togglePos(p.id)}
                            style={{ padding:"8px 14px", borderRadius:8, fontSize:12, fontWeight:800, cursor:"pointer", fontFamily:FONT, background:on?p.color+"22":"#0d160d", color:on?p.color:"#2a3a2a", border:`1px solid ${on?p.color+"55":"#162616"}` }}>
                            {p.emoji} {p.label}
                          </button>
                        );
                      })}
                    </div>
                    {form.positions.length > 1 && <div style={{ fontSize:11, color:"#3a5a3a", marginTop:6 }}>✓ Jogador polivalente</div>}
                  </div>
                )}
                <div style={{ marginTop:12 }}>
                  <div style={S.lbl({ marginBottom:6 })}>📝 APELIDOS</div>
                  <div style={{ display:"flex", gap:6 }}>
                    <input style={{ ...S.inp, flex:1, fontSize:13, padding:"9px 12px" }} placeholder="ex: Rod, Rodrigão..."
                      value={aliasInput} onChange={e => setAliasInput(e.target.value)} onKeyDown={e => e.key==="Enter" && addAlias()}/>
                    <button onClick={addAlias} style={{ background:"#1a3a2a", border:"1px solid #2a5a3a", color:"#4ade80", borderRadius:8, padding:"0 14px", cursor:"pointer", fontSize:18, fontWeight:900, fontFamily:FONT }}>+</button>
                  </div>
                  {form.aliases.length > 0 && (
                    <div style={{ display:"flex", flexWrap:"wrap", gap:5, marginTop:8 }}>
                      {form.aliases.map(a => (
                        <div key={a} style={{ background:"#0a1e1a", border:"1px solid #1e4a3a", borderRadius:8, padding:"4px 10px", fontSize:12, color:"#4ade80", display:"flex", alignItems:"center", gap:6 }}>
                          {a}
                          <button onClick={() => removeAlias(a)} style={{ background:"none", border:"none", color:"#ef4444", cursor:"pointer", fontSize:12, padding:0 }}>✕</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginTop:12 }}>
                  <div>
                    <div style={S.lbl({ marginBottom:4 })}>PERNA</div>
                    <select style={S.sel({ width:"100%" })} value={form.foot} onChange={e => setForm(f => ({ ...f, foot: e.target.value }))}>
                      <option value="direita">🦵 Direita</option>
                      <option value="esquerda">🦵 Esquerda</option>
                      <option value="ambas">🦵 Ambas</option>
                    </select>
                  </div>
                  <div>
                    <div style={S.lbl({ marginBottom:4 })}>LADO</div>
                    <select style={S.sel({ width:"100%" })} value={form.side} onChange={e => setForm(f => ({ ...f, side: e.target.value }))}>
                      <option value="canhoto">◀ Canhoto</option>
                      <option value="ambos">◀▶ Ambos</option>
                      <option value="destro">▶ Destro</option>
                    </select>
                  </div>
                </div>
                {!form.isGoalkeeper && (
                  <div style={{ marginTop:12 }}>
                    <div style={S.lbl()}>ATRIBUTOS</div>
                    {[
                      { key:"fisico",    icon:"💪", label:"Físico",    color:"#f97316" },
                      { key:"defensivo", icon:"🛡️", label:"Defensivo", color:"#4FC3F7" },
                      { key:"ofensivo",  icon:"🎯", label:"Ofensivo",  color:"#4ade80" },
                    ].map(attr => (
                      <div key={attr.key} style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
                        <span style={{ fontSize:13, width:90, color:"#a0c0a0" }}>{attr.icon} {attr.label}</span>
                        <div style={{ display:"flex", gap:2 }}>
                          {[1,2,3].map(v => (
                            <button key={v} onClick={() => setForm(f => ({ ...f, [attr.key]: v }))}
                              style={{ background:"none", border:"none", cursor:"pointer", fontSize:22, color:form[attr.key]>=v?attr.color:"#1e3a1e", padding:"0 2px", transition:"color .1s" }}>★</button>
                          ))}
                        </div>
                        <span style={{ fontSize:11, color:"#3a5a3a" }}>{["","Básico","Regular","Forte"][form[attr.key]||1]}</span>
                      </div>
                    ))}
                  </div>
                )}
                <button onClick={saveForm} disabled={saving} style={S.btnG({ opacity:saving?0.6:1 })}>
                  {saving ? "💾 SALVANDO..." : editId ? "💾 SALVAR" : "➕ ADICIONAR"}
                </button>
                <button onClick={() => { setForm(null); setEditId(null); }} style={S.btnG({ background:"#1f2937", boxShadow:"none", marginTop:6 })}>CANCELAR</button>
              </div>
            )}

            {players.filter(p => p.isGoalkeeper).length > 0 && (
              <div>
                <div style={S.lbl({ color:"#fbbf24", marginBottom:6, marginTop:4 })}>🧤 GOLEIROS</div>
                {players.filter(p => p.isGoalkeeper).map(pl => <PlayerRow key={pl.id} pl={pl} onEdit={openEdit} onDelete={deletePlayer}/>)}
              </div>
            )}
            {players.filter(p => !p.isGoalkeeper).length > 0 && (
              <div>
                <div style={S.lbl({ marginBottom:6, marginTop:8 })}>👥 JOGADORES DE LINHA</div>
                {players.filter(p => !p.isGoalkeeper).map(pl => <PlayerRow key={pl.id} pl={pl} onEdit={openEdit} onDelete={deletePlayer}/>)}
              </div>
            )}
            {players.length === 0 && !form && (
              <div style={{ textAlign:"center", color:"#1e2e1e", padding:"40px 20px", fontSize:14 }}>Nenhum atleta cadastrado — clique em + ⚽</div>
            )}
          </div>
        )}

        {/* ── SORTEIO ── */}
        {tab === "sorteio" && (
          <div>
            {weekLine.length === 0 ? (
              <div style={{ textAlign:"center", padding:"50px 20px", color:"#1e2e1e" }}>
                <div style={{ fontSize:56, marginBottom:16 }}>📋</div>
                <div style={{ fontSize:16, fontWeight:800 }}>Nenhuma lista confirmada</div>
                <button onClick={() => setTab("lista")} style={S.btnG({ maxWidth:220, margin:"20px auto 0" })}>IR PARA LISTA →</button>
              </div>
            ) : (
              <div>
                <div style={S.card()}>
                  <div style={{ fontSize:15, fontWeight:800, marginBottom:10 }}>
                    {weekLine.length} jogadores de linha
                    {weekGK.length > 0 && <span style={{ fontSize:12, color:"#fbbf24", marginLeft:10 }}>🧤 {weekGK.map(g=>g.name).join(", ")}</span>}
                  </div>
                  <div style={S.lbl()}>JOGADORES POR TIME (sem goleiro)</div>
                  <div style={{ display:"flex", gap:8, marginBottom:10 }}>
                    {[5,6].map(n => {
                      const numFull = Math.min(4, Math.floor(weekLine.length / n));
                      const rem     = weekLine.length - numFull * n;
                      const ok      = numFull >= 2;
                      const hasInc  = rem > 0 && numFull < 4;
                      return (
                        <button key={n} onClick={() => setTeamSize(n)}
                          style={{ flex:1, padding:"10px 6px", borderRadius:8, fontWeight:800, cursor:"pointer", fontFamily:FONT, background:teamSize===n?"#16a34a":"#0d160d", color:teamSize===n?"#fff":ok?"#3a5a3a":"#1e2e1e", border:`1px solid ${teamSize===n?"#4ade80":ok?"#1e3a1e":"#111"}` }}>
                          <div style={{ fontSize:18 }}>{n+1}x{n+1}</div>
                          <div style={{ fontSize:9, opacity:.7, marginTop:2, fontWeight:600, lineHeight:1.4 }}>
                            {ok ? `${numFull} times${hasInc?` + 1 incompleto`:""}` : "jogadores insuf."}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  <div style={{ fontSize:11, color:"#3a5a3a", marginBottom:12 }}>
                    {teamSize===5 ? "GL · FX · ALA · ALA · MEIA · PIV" : "GL · FX · FX · ALA · ALA · MEIA · PIV"}
                  </div>
                  <button onClick={doSort} style={{ background:"linear-gradient(135deg,#4ade80,#16a34a)", color:"#060d06", border:"none", borderRadius:12, padding:"16px", fontSize:19, fontWeight:900, cursor:"pointer", letterSpacing:2, width:"100%", boxShadow:"0 6px 32px #4ade8055", fontFamily:FONT }}>
                    🎲 SORTEAR TIMES
                  </button>
                </div>

                {teams && (
                  <div>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
                      <div style={{ fontSize:18, fontWeight:900, color:"#4ade80" }}>{teams.length} TIMES SORTEADOS</div>
                      <button onClick={doSort} style={S.btnSm("#4ade80", { padding:"7px 12px" })}>🔄 Novo sorteio</button>
                    </div>
                    {teams.map((team, i) => {
                      const tc    = TEAM_COLORS[i % TEAM_COLORS.length];
                      const isInc = team.some(p => p.isGhost);
                      const total = team.filter(p => !p.isGhost).reduce((s,p) => s+playerScore(p), 0);
                      return (
                        <div key={i} style={{ background:tc.bg, borderRadius:16, overflow:"hidden", marginBottom:16, boxShadow:"0 8px 32px #00000070" }}>
                          <div style={{ background:tc.accent, padding:"12px 16px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                            <div>
                              <div style={{ fontSize:20, fontWeight:900, color:tc.text, letterSpacing:2 }}>
                                TIME {i+1} · {tc.name.toUpperCase()}
                                {isInc && <span style={{ fontSize:11, marginLeft:8, opacity:.7 }}>⚠ incompleto</span>}
                              </div>
                              {isInc && <div style={{ fontSize:11, color:tc.text, opacity:.65, marginTop:2 }}>🔄 Completar com jogador da fila</div>}
                            </div>
                            <div style={{ fontSize:12, color:tc.text, opacity:.6, fontWeight:700 }}>{total} pts</div>
                          </div>
                          <div style={{ padding:"10px 10px 4px" }}>
                            <Pitch team={team} teamSize={teamSize} tc={tc}/>
                          </div>
                          {weekGK.length > 0 && (
                            <div style={{ padding:"8px 14px", margin:"0 10px 8px", background:`${tc.text}10`, borderRadius:8, display:"flex", alignItems:"center", gap:10 }}>
                              <span style={{ fontSize:18 }}>🧤</span>
                              <select style={S.sel({ flex:1, background:tc.gkBg, color:tc.text, border:`1px solid ${tc.text}22` })}
                                value={assignedGKs[i]||""} onChange={e => setAssignedGKs(g => ({ ...g, [i]: e.target.value }))}>
                                <option value="">Atribuir goleiro...</option>
                                {weekGK.map(g => <option key={g.id||g.name} value={g.name}>{g.name}</option>)}
                              </select>
                            </div>
                          )}
                          <div style={{ paddingBottom:8 }}>
                            {team.map((pl, j) => {
                              const pd = POS[pl.assignedPos];
                              return (
                                <div key={pl.id||j} style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 14px", borderTop:`1px solid ${tc.text}${j===0?"18":"0a"}`, color:tc.text, opacity:pl.isGhost?.45:1 }}>
                                  <span style={{ width:22, height:22, borderRadius:"50%", background:`${tc.text}22`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, fontWeight:900, flexShrink:0 }}>{j+1}</span>
                                  <div style={{ flex:1 }}>
                                    {pl.isGhost
                                      ? <div style={{ fontStyle:"italic", fontSize:13 }}>🔄 Pegar jogador da fila</div>
                                      : (
                                        <div>
                                          <div style={{ fontWeight:800, fontSize:15 }}>{pl.name}</div>
                                          {pd && <span style={{ fontSize:10, background:`${tc.text}15`, color:tc.text, borderRadius:6, padding:"1px 6px", fontWeight:700 }}>{pd.emoji} {pd.label}</span>}
                                        </div>
                                      )
                                    }
                                  </div>
                                  {!pl.isGhost && (
                                    <div style={{ textAlign:"right", fontSize:10, opacity:.65, lineHeight:1.6 }}>
                                      <div>💪{"★".repeat(pl.fisico||1)}{"☆".repeat(3-(pl.fisico||1))}</div>
                                      <div>🛡️{"★".repeat(pl.defensivo||1)}{"☆".repeat(3-(pl.defensivo||1))}</div>
                                      <div>🎯{"★".repeat(pl.ofensivo||1)}{"☆".repeat(3-(pl.ofensivo||1))}</div>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
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
  const [unlocked,    setUnlocked]    = useState(false);
  const [groups,      setGroups]      = useState([]);
  const [activeGroup, setActiveGroup] = useState(null);
  const [loadingRoot, setLoadingRoot] = useState(true);
  const [toast,       setToast]       = useState(null);
  const toastT = useRef(null);

  useEffect(() => {
    (async () => {
      const g = await loadGroups();
      setGroups(g);
      setLoadingRoot(false);
    })();
  }, []);

  function notify(msg, type="ok") {
    clearTimeout(toastT.current);
    setToast({ msg, type });
    toastT.current = setTimeout(() => setToast(null), 2600);
  }

  async function handleCreate(g) {
    await saveGroup({ ...g, playerCount: 0 });
    setGroups(gs => [...gs, { ...g, playerCount: 0 }]);
    notify(`${g.emoji} ${g.name} criado!`);
  }

  async function handleDelete(id) {
    await deleteGroupById(id);
    setGroups(gs => gs.filter(g => g.id !== id));
    notify("Rachão removido");
  }

  function handleBack(count, gid, goBack=false) {
    setGroups(gs => gs.map(g => g.id === gid ? { ...g, playerCount: count } : g));
    if (goBack) setActiveGroup(null);
  }

  if (!unlocked) {
    return (
      <>
        {toast && <Toast msg={toast.msg} type={toast.type}/>}
        <PinScreen onUnlock={() => setUnlocked(true)}/>
      </>
    );
  }

  if (loadingRoot) return <Loader />;

  if (activeGroup) {
    return (
      <>
        {toast && <Toast msg={toast.msg} type={toast.type}/>}
        <GroupApp group={activeGroup} onBack={handleBack} notify={notify}/>
      </>
    );
  }

  return (
    <>
      {toast && <Toast msg={toast.msg} type={toast.type}/>}
      <GroupsScreen
        groups={groups}
        onSelect={g => setActiveGroup(g)}
        onCreate={handleCreate}
        onDelete={handleDelete}
        onLock={() => setUnlocked(false)}
      />
    </>
  );
}
