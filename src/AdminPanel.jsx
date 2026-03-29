-- Adicionar coluna is_admin na tabela profiles
ALTER TABLE profiles ADD COLUMN is_admin BOOLEAN DEFAULT FALSE;

-- Marcar como admin o usuário específico (substitua pelo ID real)
UPDATE profiles SET is_admin = TRUE WHERE id = 'bf1b462c-16d3-41e2-9c75-de485cccd216';

-- Criar índice para melhor performance
CREATE INDEX idx_profiles_is_admin ON profiles(is_admin);import { useState, useEffect } from "react";
import { supabase } from './lib/supabase.js';

const ADMIN_ID = 'bf1b462c-16d3-41e2-9c75-de485cccd216';
const FONT = "'Barlow Condensed', Arial Narrow, Arial, sans-serif";

export default function AdminPanel({ currentUserId }) {
  const [users,   setUsers]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(null);
  const [toast,   setToast]   = useState(null);

  if (currentUserId !== ADMIN_ID) {
    return (
      <div style={{minHeight:"100vh",background:"#060d06",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:FONT}}>
        <div style={{color:"#ef4444",fontSize:24,fontWeight:900}}>⛔ ACESSO NEGADO</div>
      </div>
    );
  }

  useEffect(() => {
    loadUsers();
  }, []);

  function notify(msg) {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }

  async function loadUsers() {
    setLoading(true);
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });
    if (!error) setUsers(data || []);
    setLoading(false);
  }

  async function togglePlan(user) {
    setSaving(user.id);
    const newPlan = user.plan === 'premium' ? 'free' : 'premium';
    const { error } = await supabase
      .from('profiles')
      .update({ plan: newPlan })
      .eq('id', user.id);
    if (!error) {
      setUsers(us => us.map(u => u.id === user.id ? { ...u, plan: newPlan } : u));
      notify(`${user.name || user.id.slice(0,8)} → ${newPlan.toUpperCase()} ✓`);
    }
    setSaving(null);
  }

  return (
    <div style={{minHeight:"100vh",background:"#060d06",fontFamily:FONT,color:"#e8f5e8",maxWidth:480,margin:"0 auto",paddingBottom:40}}>
      <div style={{background:"linear-gradient(160deg,#0b1e0b,#060d06)",borderBottom:"1px solid #162616",padding:"16px",display:"flex",alignItems:"center",gap:10}}>
        <span style={{fontSize:24}}>🛡️</span>
        <div>
          <div style={{fontSize:20,fontWeight:900,color:"#4ade80",letterSpacing:2}}>PAINEL ADMIN</div>
          <div style={{fontSize:10,color:"#2e4e2e",letterSpacing:2}}>RACHÃO FC</div>
        </div>
        <div style={{marginLeft:"auto",fontSize:11,color:"#3a5a3a"}}>{users.length} usuários</div>
      </div>

      {toast && (
        <div style={{position:"fixed",top:14,left:"50%",transform:"translateX(-50%)",background:"#14532d",color:"#fff",padding:"10px 22px",borderRadius:24,fontSize:13,fontWeight:700,zIndex:9999,border:"1px solid #4ade80"}}>
          {toast}
        </div>
      )}

      <div style={{padding:16}}>
        <button onClick={loadUsers} style={{width:"100%",background:"#0d160d",border:"1px solid #162616",borderRadius:8,padding:"10px",fontSize:13,fontWeight:800,cursor:"pointer",color:"#3a5a3a",fontFamily:FONT,marginBottom:16,letterSpacing:1}}>
          🔄 ATUALIZAR LISTA
        </button>

        {loading ? (
          <div style={{textAlign:"center",padding:40,color:"#3a5a3a"}}>Carregando...</div>
        ) : (
          users.map(user => (
            <div key={user.id} style={{background:"#0d160d",border:"1px solid #162616",borderRadius:12,padding:"14px 16px",marginBottom:10}}>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <div style={{flex:1}}>
                  <div style={{fontSize:16,fontWeight:900,color:"#e8f5e8"}}>{user.name || '(sem nome)'}</div>
                  <div style={{fontSize:10,color:"#2e4e2e",marginTop:2,letterSpacing:1}}>{user.id.slice(0,18)}...</div>
                  <div style={{fontSize:10,color:"#2e4e2e",marginTop:2}}>
                    {new Date(user.created_at).toLocaleDateString('pt-BR')}
                  </div>
                </div>
                <button
                  onClick={() => togglePlan(user)}
                  disabled={saving === user.id}
                  style={{
                    padding:"8px 14px",borderRadius:8,fontSize:12,fontWeight:900,cursor:"pointer",fontFamily:FONT,border:"none",
                    background: user.plan === 'premium' ? "#78350f" : "#162616",
                    color:      user.plan === 'premium' ? "#fbbf24" : "#3a5a3a",
                    opacity:    saving === user.id ? 0.6 : 1,
                    minWidth:   80,
                  }}>
                  {saving === user.id ? "..." : user.plan === 'premium' ? "★ PREMIUM" : "FREE"}
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
