import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from './supabaseClient';
import * as XLSX from 'xlsx';
import './App.css';

const PALETTE = ["#534AB7","#1D9E75","#378ADD","#D4537E","#BA7517","#D85A30","#185FA5","#639922","#993C1D","#3C3489","#0F6E56","#888780","#9F77DD","#5DCAA5","#85B7EB","#ED93B1","#EF9F27"];
const MONTHS = ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];
const MS = ["Janv","Févr","Mars","Avr","Mai","Juin","Juil","Août","Sept","Oct","Nov","Déc"];
const fmt = v => new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR',maximumFractionDigits:2}).format(v);
const ha = (hex,a) => { if(!hex||hex.length<7)return`rgba(128,128,128,${a})`; const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16); return`rgba(${r},${g},${b},${a})`; };
const pct = (a,b) => b>0?Math.min(Math.round((a/b)*100),100):0;

function AuthScreen({ onAuth }) {
  const [email,setEmail]=useState('');
  const [password,setPassword]=useState('');
  const [mode,setMode]=useState('login');
  const [error,setError]=useState('');
  const [loading,setLoading]=useState(false);
  async function handleSubmit(e){
    e.preventDefault(); setLoading(true); setError('');
    const result = mode==='login'
      ? await supabase.auth.signInWithPassword({email,password})
      : await supabase.auth.signUp({email,password});
    if(result.error) setError(result.error.message);
    else onAuth(result.data.user);
    setLoading(false);
  }
  const inp = {width:'100%',padding:'10px 12px',borderRadius:10,border:'1px solid var(--color-border)',fontSize:14,marginBottom:12,boxSizing:'border-box',background:'var(--color-bg)',color:'var(--color-text)'};
  return(
    <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'var(--color-bg)',padding:'1rem'}}>
      <div style={{width:'100%',maxWidth:360,background:'var(--color-card)',borderRadius:16,padding:'2rem',boxShadow:'0 4px 24px rgba(0,0,0,.08)',border:'0.5px solid var(--color-border)'}}>
        <div style={{textAlign:'center',marginBottom:24}}>
          <div style={{fontSize:32,marginBottom:8}}>💰</div>
          <div style={{fontSize:20,fontWeight:600,color:'var(--color-text)'}}>JSJE Finances</div>
          <div style={{fontSize:13,color:'var(--color-muted)',marginTop:4}}>{mode==='login'?'Connexion':'Créer un compte'}</div>
        </div>
        <form onSubmit={handleSubmit}>
          <label style={{fontSize:13,color:'var(--color-muted)',display:'block',marginBottom:4}}>Email</label>
          <input type="email" value={email} onChange={e=>setEmail(e.target.value)} required placeholder="exemple@email.com" style={inp}/>
          <label style={{fontSize:13,color:'var(--color-muted)',display:'block',marginBottom:4}}>Mot de passe</label>
          <input type="password" value={password} onChange={e=>setPassword(e.target.value)} required placeholder="••••••••" style={{...inp,marginBottom:16}}/>
          {error&&<div style={{fontSize:12,color:'#D85A30',marginBottom:12,padding:'8px 12px',background:'rgba(216,90,48,.08)',borderRadius:8}}>{error}</div>}
          <button type="submit" disabled={loading} style={{width:'100%',padding:'11px',borderRadius:10,border:'none',background:'#534AB7',color:'#fff',fontSize:15,fontWeight:600,cursor:'pointer',opacity:loading?.6:1}}>
            {loading?'...':(mode==='login'?'Se connecter':'Créer le compte')}
          </button>
        </form>
        <div style={{textAlign:'center',marginTop:16,fontSize:13,color:'var(--color-muted)'}}>
          {mode==='login'?'Pas encore de compte ?':'Déjà un compte ?'}{' '}
          <span onClick={()=>{setMode(mode==='login'?'register':'login');setError('');}} style={{color:'#534AB7',cursor:'pointer',fontWeight:500}}>
            {mode==='login'?'Créer un compte':'Se connecter'}
          </span>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [user,setUser]=useState(null);
  const [authChecked,setAuthChecked]=useState(false);
  const [categories,setCategories]=useState({revenus:[],depenses:[]});
  const [transactions,setTransactions]=useState([]);
  const [envelopes,setEnvelopes]=useState({});
  const [colorMap,setColorMap]=useState({});
  const [pots,setPots]=useState([]);
  const [potTx,setPotTx]=useState([]);
  const [loading,setLoading]=useState(true);

  const [view,setView]=useState('accueil');
  const [filterMonth,setFilterMonth]=useState(new Date().getMonth());
  const [filterYear,setFilterYear]=useState(new Date().getFullYear());
  const [form,setForm]=useState({type:'depenses',categorie:'',montant:'',description:'',date:new Date().toISOString().slice(0,10),is_recurring:false,recurring_day:1});
  const [editId,setEditId]=useState(null);
  const [deleteId,setDeleteId]=useState(null);
  const [newCatModal,setNewCatModal]=useState(null);
  const [newCatName,setNewCatName]=useState('');
  const [newCatErr,setNewCatErr]=useState('');
  const [envModal,setEnvModal]=useState(null);
  const [envValue,setEnvValue]=useState('');
  const [potModal,setPotModal]=useState(null); // null | 'new' | {pot} pour edit
  const [potForm,setPotForm]=useState({name:'',color:PALETTE[0],target_amount:'',current_amount:''});
  const [potTxModal,setPotTxModal]=useState(null); // pot object
  const [potTxForm,setPotTxForm]=useState({type:'depot',amount:'',description:'',date:new Date().toISOString().slice(0,10),is_recurring:false,recurring_day:1});
  const [deletePotId,setDeletePotId]=useState(null);

  useEffect(()=>{
    supabase.auth.getSession().then(({data:{session}})=>{ setUser(session?.user??null); setAuthChecked(true); });
    const {data:{subscription}}=supabase.auth.onAuthStateChange((_,session)=>setUser(session?.user??null));
    return ()=>subscription.unsubscribe();
  },[]);

  const loadAll = useCallback(async()=>{
    if(!user) return;
    setLoading(true);
    const [cats,txs,envs,potsRes,potTxRes]=await Promise.all([
      supabase.from('categories').select('*').eq('user_id',user.id).order('created_at'),
      supabase.from('transactions').select('*, categories(name,type,color)').eq('user_id',user.id).order('date',{ascending:false}),
      supabase.from('envelopes').select('*, categories(name)').eq('user_id',user.id),
      supabase.from('pots').select('*').eq('user_id',user.id).order('created_at'),
      supabase.from('pot_transactions').select('*').eq('user_id',user.id).order('date',{ascending:false}),
    ]);
    const revCats=(cats.data||[]).filter(c=>c.type==='revenus').map(c=>({id:c.id,name:c.name,color:c.color}));
    const depCats=(cats.data||[]).filter(c=>c.type==='depenses').map(c=>({id:c.id,name:c.name,color:c.color}));
    setCategories({revenus:revCats,depenses:depCats});
    const cm={};(cats.data||[]).forEach(c=>{cm[c.id]=c.color;});
    setColorMap(cm);
    setTransactions((txs.data||[]).map(t=>({id:t.id,type:t.categories?.type||t.type,categorie:t.category_id,categorieName:t.categories?.name||'',montant:t.amount,description:t.description||'',date:t.date,is_recurring:t.is_recurring,recurring_day:t.recurring_day})));
    const em={};(envs.data||[]).forEach(e=>{em[e.category_id]=e.amount;});
    setEnvelopes(em);
    setPots(potsRes.data||[]);
    setPotTx(potTxRes.data||[]);
    setLoading(false);
  },[user]);

  useEffect(()=>{ if(!user){setLoading(false);return;} loadAll(); },[user,loadAll]);

  const getCatName=id=>{const all=[...categories.revenus,...categories.depenses];return all.find(c=>c.id===id)?.name||'';};
  const getCatColor=id=>colorMap[id]||PALETTE[0];

  const filtered=useMemo(()=>transactions.filter(t=>{const d=new Date(t.date);return d.getMonth()===filterMonth&&d.getFullYear()===filterYear;}),[transactions,filterMonth,filterYear]);
  const totalRev=filtered.filter(t=>t.type==='revenus').reduce((s,t)=>s+t.montant,0);
  const totalDep=filtered.filter(t=>t.type==='depenses').reduce((s,t)=>s+t.montant,0);
  const solde=totalRev-totalDep;

  const depBycat=useMemo(()=>{const m={};filtered.filter(t=>t.type==='depenses').forEach(t=>{m[t.categorie]=(m[t.categorie]||0)+t.montant;});return m;},[filtered]);
  const revBycat=useMemo(()=>{const m={};filtered.filter(t=>t.type==='revenus').forEach(t=>{m[t.categorie]=(m[t.categorie]||0)+t.montant;});return m;},[filtered]);

  // Report enveloppes : cumule les surplus des mois précédents
  const envelopeWithCarry=useMemo(()=>{
    const result={};
    Object.entries(envelopes).forEach(([catId,budget])=>{
      let carry=0;
      for(let y=filterYear-1;y<=filterYear;y++){
        const startM=y===filterYear-1?0:0;
        const endM=y===filterYear?filterMonth:11;
        for(let m=startM;m<=endM;m++){
          if(y===filterYear&&m===filterMonth) break;
          const spent=transactions.filter(t=>t.type==='depenses'&&t.categorie===catId&&new Date(t.date).getMonth()===m&&new Date(t.date).getFullYear()===y).reduce((s,t)=>s+t.montant,0);
          const surplus=budget-spent;
          carry+=surplus;
        }
      }
      result[catId]={budget,carry:Math.max(0,carry),total:budget+Math.max(0,carry)};
    });
    return result;
  },[envelopes,transactions,filterMonth,filterYear]);

  const alerts=useMemo(()=>Object.entries(envelopeWithCarry).filter(([id,e])=>e.total>0&&(depBycat[id]||0)>e.total).map(([id,e])=>({id,name:getCatName(id),budget:e.total,spent:depBycat[id]||0,over:(depBycat[id]||0)-e.total})),[envelopeWithCarry,depBycat]); // eslint-disable-line react-hooks/exhaustive-deps

  const monthly=useMemo(()=>{
    const m={};
    transactions.forEach(t=>{const d=new Date(t.date);const k=`${d.getFullYear()}-${String(d.getMonth()).padStart(2,'0')}`;if(!m[k])m[k]={rev:0,dep:0,year:d.getFullYear(),month:d.getMonth()};if(t.type==='revenus')m[k].rev+=t.montant;else m[k].dep+=t.montant;});
    return Object.values(m).sort((a,b)=>a.year!==b.year?a.year-b.year:a.month-b.month).slice(-6);
  },[transactions]);
  const maxM=Math.max(...monthly.flatMap(m=>[m.rev,m.dep]),1);

  const totalPots=pots.reduce((s,p)=>s+p.current_amount,0);
  const totalPotsTarget=pots.reduce((s,p)=>s+(p.target_amount||0),0);

  const years=[...new Set([...transactions.map(t=>new Date(t.date).getFullYear()),filterYear,new Date().getFullYear(),new Date().getFullYear()+1,new Date().getFullYear()+2])];
  years.sort((a,b)=>b-a);

  async function handleSubmit(){
    if(!form.montant||isNaN(+form.montant)||+form.montant<=0||!form.date||!form.categorie)return;
    const payload={user_id:user.id,category_id:form.categorie,type:form.type,amount:parseFloat(form.montant),description:form.description.trim(),date:form.date,is_recurring:form.is_recurring,recurring_day:form.is_recurring?parseInt(form.recurring_day):null};
    if(editId) await supabase.from('transactions').update(payload).eq('id',editId);
    else await supabase.from('transactions').insert(payload);
    await loadAll();
    setForm({type:'depenses',categorie:categories.depenses[0]?.id||'',montant:'',description:'',date:new Date().toISOString().slice(0,10),is_recurring:false,recurring_day:1});
    setEditId(null); setView('liste');
  }

  function startEdit(t){
    setForm({type:t.type,categorie:t.categorie,montant:String(t.montant),description:t.description,date:t.date,is_recurring:t.is_recurring||false,recurring_day:t.recurring_day||1});
    setEditId(t.id); setView('saisie');
  }

  async function confirmDelete(){ await supabase.from('transactions').delete().eq('id',deleteId); await loadAll(); setDeleteId(null); }

  async function confirmNewCat(){
    const name=newCatName.trim();
    if(!name){setNewCatErr('Nom requis.');return;}
    if([...categories.revenus,...categories.depenses].find(c=>c.name===name)){setNewCatErr('Catégorie existante.');return;}
    const used=new Set(Object.values(colorMap));
    const color=PALETTE.find(c=>!used.has(c))||PALETTE[0];
    const {data}=await supabase.from('categories').insert({user_id:user.id,name,type:newCatModal,color}).select().single();
    if(data){setCategories(prev=>({...prev,[newCatModal]:[...prev[newCatModal],{id:data.id,name,color}]}));setColorMap(prev=>({...prev,[data.id]:color}));}
    setNewCatModal(null); setNewCatName('');
  }

  async function deleteCat(type,catId){ await supabase.from('categories').delete().eq('id',catId); setCategories(prev=>({...prev,[type]:prev[type].filter(c=>c.id!==catId)})); }

  async function saveEnvelope(){
    const v=parseFloat(envValue);
    if(!v||v<=0){ await supabase.from('envelopes').delete().eq('user_id',user.id).eq('category_id',envModal); setEnvelopes(prev=>{const e={...prev};delete e[envModal];return e;}); }
    else{ await supabase.from('envelopes').upsert({user_id:user.id,category_id:envModal,amount:v},{onConflict:'user_id,category_id'}); setEnvelopes(prev=>({...prev,[envModal]:v})); }
    setEnvModal(null); setEnvValue('');
  }

  async function savePot(){
    if(!potForm.name.trim()) return;
    const payload={user_id:user.id,name:potForm.name.trim(),color:potForm.color,target_amount:parseFloat(potForm.target_amount)||0,current_amount:parseFloat(potForm.current_amount)||0};
    if(potModal==='new') await supabase.from('pots').insert(payload);
    else await supabase.from('pots').update(payload).eq('id',potModal.id);
    await loadAll(); setPotModal(null); setPotForm({name:'',color:PALETTE[0],target_amount:'',current_amount:''});
  }

  async function confirmDeletePot(){ await supabase.from('pots').delete().eq('id',deletePotId); await loadAll(); setDeletePotId(null); }

  async function savePotTx(){
    if(!potTxForm.amount||isNaN(+potTxForm.amount)||+potTxForm.amount<=0) return;
    const amt=parseFloat(potTxForm.amount);
    const newAmount=potTxForm.type==='depot'?potTxModal.current_amount+amt:Math.max(0,potTxModal.current_amount-amt);
    // Mouvement pot
    await supabase.from('pot_transactions').insert({user_id:user.id,pot_id:potTxModal.id,type:potTxForm.type,amount:amt,description:potTxForm.description,date:potTxForm.date,is_recurring:potTxForm.is_recurring,recurring_day:potTxForm.is_recurring?parseInt(potTxForm.recurring_day):null});
    // Mise à jour solde pot
    await supabase.from('pots').update({current_amount:newAmount}).eq('id',potTxModal.id);
    // Impact budget : dépôt = dépense, retrait = revenu
    const catId=categories.depenses.find(c=>c.name===potTxModal.name)?.id||categories.depenses[0]?.id;
    await supabase.from('transactions').insert({
      user_id:user.id,
      category_id:catId,
      type:potTxForm.type==='depot'?'depenses':'revenus',
      amount:amt,
      description:`${potTxForm.type==='depot'?'Dépôt':'Retrait'} — ${potTxModal.name}${potTxForm.description?` (${potTxForm.description})`:''}`,
      date:potTxForm.date,
      is_recurring:potTxForm.is_recurring,
      recurring_day:potTxForm.is_recurring?parseInt(potTxForm.recurring_day):null
    });
    await loadAll();
    setPotTxModal(null);
    setPotTxForm({type:'depot',amount:'',description:'',date:new Date().toISOString().slice(0,10),is_recurring:false,recurring_day:1});
  }

  function exportExcel(period){
    const rows = period==='mois'
      ? filtered
      : transactions.filter(t=>new Date(t.date).getFullYear()===filterYear);
    const data=rows.map(t=>({'Date':t.date,'Type':t.type==='revenus'?'Revenu':'Dépense','Catégorie':getCatName(t.categorie),'Montant':t.montant,'Description':t.description,'Récurrent':t.is_recurring?'Oui':'Non'}));
    const ws=XLSX.utils.json_to_sheet(data);
    const wb=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb,ws,period==='mois'?`${MS[filterMonth]} ${filterYear}`:String(filterYear));
    XLSX.writeFile(wb,`finances_${period==='mois'?`${filterMonth+1}_${filterYear}`:filterYear}.xlsx`);
  }

  async function logout(){ await supabase.auth.signOut(); setUser(null); }

  if(!authChecked) return <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',fontSize:14,color:'#888'}}>Chargement…</div>;
  if(!user) return <AuthScreen onAuth={u=>setUser(u)}/>;
  if(loading) return <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',fontSize:14,color:'#888'}}>Chargement des données…</div>;

  const pill=(label,active,onClick,color='#534AB7')=>(
    <button onClick={onClick} style={{padding:'5px 12px',borderRadius:20,border:`1.5px solid ${active?color:'var(--color-border)'}`,background:active?ha(color,.12):'transparent',color:active?color:'var(--color-muted)',cursor:'pointer',fontSize:12,fontWeight:active?500:400}}>{label}</button>
  );
  const defCatId=(type)=>categories[type][0]?.id||'';
  const inp={width:'100%',padding:'10px 12px',borderRadius:10,border:'1px solid var(--color-border)',fontSize:14,boxSizing:'border-box',background:'var(--color-bg)',color:'var(--color-text)'};

  return(
    <div style={{maxWidth:480,margin:'0 auto',padding:'1rem',paddingBottom:80}}>
      {/* Header */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16}}>
        <div>
          <div style={{fontSize:20,fontWeight:600,color:'var(--color-text)'}}>JSJE Finances</div>
          <div style={{fontSize:13,color:'var(--color-muted)'}}>{MONTHS[filterMonth]} {filterYear}</div>
        </div>
        <div style={{display:'flex',gap:8}}>
          <button onClick={()=>{setEditId(null);setForm({type:'depenses',categorie:defCatId('depenses'),montant:'',description:'',date:new Date().toISOString().slice(0,10),is_recurring:false,recurring_day:1});setView('saisie');}} style={{padding:'8px 14px',borderRadius:10,border:'1.5px solid #534AB7',background:ha('#534AB7',.1),color:'#534AB7',cursor:'pointer',fontWeight:600,fontSize:14}}>+ Ajouter</button>
          <button onClick={logout} title="Déconnexion" style={{padding:'8px 10px',borderRadius:10,border:'0.5px solid var(--color-border)',background:'transparent',cursor:'pointer',color:'var(--color-muted)',fontSize:13}}>⏏</button>
        </div>
      </div>

      {/* Nav */}
      <div style={{display:'flex',gap:8,marginBottom:14,flexWrap:'wrap'}}>
        {[['accueil','🏠 Accueil'],['pots','🏦 Pots'],['categories','📊 Catégories'],['liste','📋 Transactions'],['saisie',editId?'✏️ Modifier':'✏️ Saisir']].map(([k,l])=>pill(l,view===k,()=>setView(k)))}
      </div>

      {/* Filtre période */}
      {view!=='saisie'&&(
        <div style={{display:'flex',gap:5,marginBottom:18,flexWrap:'wrap',alignItems:'center'}}>
          <span style={{fontSize:11,color:'var(--color-muted)'}}>Période :</span>
          {MS.map((m,i)=>pill(m,filterMonth===i,()=>setFilterMonth(i),'#378ADD'))}
          {years.map(y=>pill(String(y),filterYear===y,()=>setFilterYear(y),'#888780'))}
        </div>
      )}

      {/* ===== ACCUEIL ===== */}
      {view==='accueil'&&(<div>
        {alerts.length>0&&<div style={{marginBottom:14}}>{alerts.map(a=>(
          <div key={a.id} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 14px',borderRadius:12,background:ha('#D85A30',.08),border:'1.5px solid #D85A30',marginBottom:8}}>
            <span>⚠️</span>
            <div><div style={{fontSize:13,fontWeight:500,color:'#D85A30'}}>Enveloppe dépassée — {a.name}</div>
            <div style={{fontSize:12,color:'var(--color-muted)'}}>Dépensé {fmt(a.spent)} / {fmt(a.budget)} · +{fmt(a.over)}</div></div>
          </div>
        ))}</div>}

        {/* 4 KPI */}
        {(()=>{
          const aRev=transactions.filter(t=>new Date(t.date).getFullYear()===filterYear&&t.type==='revenus').reduce((s,t)=>s+t.montant,0);
          const aDep=transactions.filter(t=>new Date(t.date).getFullYear()===filterYear&&t.type==='depenses').reduce((s,t)=>s+t.montant,0);
          const aS=aRev-aDep;
          const cards=[
            {label:'Revenus du mois',val:totalRev,color:'#1D9E75',bg:ha('#1D9E75',.08),icon:'↑'},
            {label:'Dépenses du mois',val:totalDep,color:'#D85A30',bg:ha('#D85A30',.08),icon:'↓'},
            {label:'Solde du mois',val:solde,color:solde>=0?'#1D9E75':'#D85A30',bg:ha(solde>=0?'#1D9E75':'#D85A30',.08),icon:'='},
            {label:`Solde ${filterYear}`,val:aS,color:aS>=0?'#534AB7':'#D85A30',bg:ha(aS>=0?'#534AB7':'#D85A30',.08),icon:'★',accent:true},
          ];
          return(<div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:16}}>
            {cards.map(c=>(
              <div key={c.label} style={{background:c.bg,borderRadius:14,padding:'1rem',border:c.accent?`1.5px solid ${ha(c.color,.35)}`:`1px solid ${ha(c.color,.2)}`}}>
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
                  <span style={{fontSize:11,color:'var(--color-muted)',fontWeight:500}}>{c.label}</span>
                  <span style={{width:22,height:22,borderRadius:'50%',background:ha(c.color,.15),display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:600,color:c.color}}>{c.icon}</span>
                </div>
                <div style={{fontSize:c.accent?20:18,fontWeight:600,color:c.color}}>{fmt(c.val)}</div>
                <div style={{fontSize:11,color:ha(c.color,.7),marginTop:3}}>{c.val>=0?'Bénéficiaire':'Déficitaire'}</div>
              </div>
            ))}
          </div>);
        })()}

        {/* Pots résumé */}
        {pots.length>0&&(<div style={{background:'var(--color-card)',border:'0.5px solid var(--color-border)',borderRadius:14,padding:'1rem',marginBottom:14}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12}}>
            <div style={{fontSize:14,fontWeight:600}}>🏦 Pots d'épargne</div>
            <div style={{fontSize:13,fontWeight:600,color:'#534AB7'}}>{fmt(totalPots)}{totalPotsTarget>0&&<span style={{fontSize:11,color:'var(--color-muted)',fontWeight:400}}> / {fmt(totalPotsTarget)}</span>}</div>
          </div>
          {totalPotsTarget>0&&<div style={{height:6,background:'var(--color-bg)',borderRadius:3,overflow:'hidden',marginBottom:12}}><div style={{height:'100%',width:`${pct(totalPots,totalPotsTarget)}%`,background:'#534AB7',borderRadius:3}}/></div>}
          {pots.map(pot=>(
            <div key={pot.id} style={{display:'flex',alignItems:'center',gap:10,marginBottom:10}}>
              <div style={{width:28,height:28,borderRadius:'50%',background:ha(pot.color,.15),display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}><span style={{fontSize:11,fontWeight:600,color:pot.color}}>{pot.name[0]}</span></div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:'flex',justifyContent:'space-between',fontSize:13,marginBottom:3}}>
                  <span style={{fontWeight:500}}>{pot.name}</span>
                  <span style={{color:pot.color,fontWeight:600}}>{fmt(pot.current_amount)}{pot.target_amount>0&&<span style={{color:'var(--color-muted)',fontWeight:400}}> / {fmt(pot.target_amount)}</span>}</span>
                </div>
                {pot.target_amount>0&&<div style={{height:5,background:'var(--color-bg)',borderRadius:3,overflow:'hidden'}}><div style={{height:'100%',width:`${pct(pot.current_amount,pot.target_amount)}%`,background:pot.color,borderRadius:3}}/></div>}
              </div>
            </div>
          ))}
          <button onClick={()=>setView('pots')} style={{width:'100%',marginTop:8,padding:'8px',borderRadius:10,border:'0.5px solid var(--color-border)',background:'transparent',cursor:'pointer',color:'var(--color-muted)',fontSize:13}}>Voir tous les pots →</button>
        </div>)}

        {/* Graphique */}
        {monthly.length>0&&(<div style={{background:'var(--color-card)',border:'0.5px solid var(--color-border)',borderRadius:14,padding:'1rem',marginBottom:14}}>
          <div style={{fontSize:14,fontWeight:600,marginBottom:12}}>Évolution 6 mois</div>
          <div style={{display:'flex',alignItems:'flex-end',gap:6,height:100}}>
            {monthly.map(m=>(
              <div key={`${m.year}-${m.month}`} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:3}}>
                <div style={{display:'flex',gap:2,alignItems:'flex-end',height:80,width:'100%',justifyContent:'center'}}>
                  <div style={{width:'45%',height:`${Math.round((m.rev/maxM)*100)}%`,background:'#1D9E75',borderRadius:'3px 3px 0 0',minHeight:2}}/>
                  <div style={{width:'45%',height:`${Math.round((m.dep/maxM)*100)}%`,background:'#D85A30',borderRadius:'3px 3px 0 0',minHeight:2}}/>
                </div>
                <div style={{fontSize:9,color:'var(--color-muted)'}}>{MS[m.month]}</div>
              </div>
            ))}
          </div>
          <div style={{display:'flex',gap:14,marginTop:8,fontSize:11}}>
            <span style={{display:'flex',alignItems:'center',gap:4}}><span style={{width:8,height:8,borderRadius:2,background:'#1D9E75',display:'inline-block'}}/>Revenus</span>
            <span style={{display:'flex',alignItems:'center',gap:4}}><span style={{width:8,height:8,borderRadius:2,background:'#D85A30',display:'inline-block'}}/>Dépenses</span>
          </div>
        </div>)}

        {/* Résumé catégories */}
        <div style={{background:'var(--color-card)',border:'0.5px solid var(--color-border)',borderRadius:14,padding:'1rem'}}>
          <div style={{fontSize:14,fontWeight:600,marginBottom:14}}>Résumé par catégorie</div>
          {categories.revenus.filter(c=>revBycat[c.id]).length===0&&categories.depenses.filter(c=>depBycat[c.id]).length===0&&<div style={{fontSize:13,color:'var(--color-muted)'}}>Aucune transaction ce mois-ci.</div>}
          {categories.revenus.filter(c=>revBycat[c.id]).length>0&&(<div style={{marginBottom:14}}>
            <div style={{fontSize:11,fontWeight:600,color:'#1D9E75',marginBottom:8,textTransform:'uppercase',letterSpacing:'.5px'}}>Revenus</div>
            {categories.revenus.filter(c=>revBycat[c.id]).map(cat=>{
              const v=revBycat[cat.id]||0;const maxV=Math.max(...categories.revenus.map(c=>revBycat[c.id]||0),1);
              return(<div key={cat.id} style={{display:'flex',alignItems:'center',gap:10,marginBottom:8}}>
                <div style={{width:28,height:28,borderRadius:'50%',background:ha(cat.color,.15),display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}><span style={{fontSize:11,fontWeight:600,color:cat.color}}>{cat.name[0]}</span></div>
                <div style={{flex:1}}><div style={{display:'flex',justifyContent:'space-between',fontSize:13,marginBottom:3}}><span style={{fontWeight:500}}>{cat.name}</span><span style={{color:'#1D9E75',fontWeight:600}}>{fmt(v)}</span></div>
                <div style={{height:5,background:'var(--color-bg)',borderRadius:3,overflow:'hidden'}}><div style={{height:'100%',width:`${Math.round((v/maxV)*100)}%`,background:'#1D9E75',borderRadius:3}}/></div></div>
              </div>);
            })}
          </div>)}
          {categories.depenses.filter(c=>depBycat[c.id]).length>0&&(<div>
            <div style={{fontSize:11,fontWeight:600,color:'#D85A30',marginBottom:8,textTransform:'uppercase',letterSpacing:'.5px'}}>Dépenses</div>
            {categories.depenses.filter(c=>depBycat[c.id]).map(cat=>{
              const spent=depBycat[cat.id]||0;const env=envelopeWithCarry[cat.id];const budget=env?.total||0;const over=budget>0&&spent>budget;const p=pct(spent,budget);
              const maxV=Math.max(...categories.depenses.map(c=>depBycat[c.id]||0),1);
              return(<div key={cat.id} style={{display:'flex',alignItems:'center',gap:10,marginBottom:10}}>
                <div style={{width:28,height:28,borderRadius:'50%',background:ha(cat.color,.15),display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}><span style={{fontSize:11,fontWeight:600,color:cat.color}}>{cat.name[0]}</span></div>
                <div style={{flex:1}}>
                  <div style={{display:'flex',justifyContent:'space-between',fontSize:13,marginBottom:3}}>
                    <span style={{fontWeight:500}}>{cat.name}</span>
                    <span style={{color:over?'#D85A30':'var(--color-muted)',fontWeight:500}}>{fmt(spent)}{budget>0?` / ${fmt(budget)}`:''}{over&&' ⚠️'}</span>
                  </div>
                  <div style={{height:5,background:'var(--color-bg)',borderRadius:3,overflow:'hidden'}}><div style={{height:'100%',width:`${budget>0?p:Math.round((spent/maxV)*100)}%`,background:over?'#D85A30':p>80?'#BA7517':cat.color,borderRadius:3}}/></div>
                  {budget>0&&env?.carry>0&&<div style={{fontSize:10,color:'#534AB7',marginTop:2}}>Report : +{fmt(env.carry)}</div>}
                  {budget>0&&<div style={{fontSize:10,color:over?'#D85A30':'var(--color-muted)',marginTop:1}}>{over?`Dépassé de ${fmt(spent-budget)}`:`Reste ${fmt(budget-spent)}`}</div>}
                </div>
              </div>);
            })}
          </div>)}
        </div>

        {/* Export */}
        <div style={{marginTop:14,background:'var(--color-card)',border:'0.5px solid var(--color-border)',borderRadius:14,padding:'1rem'}}>
          <div style={{fontSize:14,fontWeight:600,marginBottom:12}}>📥 Export Excel</div>
          <div style={{display:'flex',gap:8}}>
            <button onClick={()=>exportExcel('mois')} style={{flex:1,padding:'9px',borderRadius:10,border:'1.5px solid #1D9E75',background:ha('#1D9E75',.1),color:'#1D9E75',cursor:'pointer',fontWeight:500,fontSize:13}}>Ce mois ({MS[filterMonth]})</button>
            <button onClick={()=>exportExcel('annee')} style={{flex:1,padding:'9px',borderRadius:10,border:'1.5px solid #534AB7',background:ha('#534AB7',.1),color:'#534AB7',cursor:'pointer',fontWeight:500,fontSize:13}}>Année {filterYear}</button>
          </div>
        </div>
      </div>)}

      {/* ===== POTS ===== */}
      {view==='pots'&&(<div>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14}}>
          <div style={{fontSize:14,fontWeight:600}}>Pots d'épargne</div>
          <button onClick={()=>{setPotForm({name:'',color:PALETTE[0],target_amount:'',current_amount:''});setPotModal('new');}} style={{padding:'6px 14px',borderRadius:10,border:'1.5px solid #534AB7',background:ha('#534AB7',.1),color:'#534AB7',cursor:'pointer',fontWeight:600,fontSize:13}}>+ Nouveau pot</button>
        </div>

        {/* Total global */}
        {pots.length>0&&(<div style={{background:ha('#534AB7',.08),border:`1px solid ${ha('#534AB7',.2)}`,borderRadius:14,padding:'1rem',marginBottom:14}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
            <span style={{fontSize:13,fontWeight:600,color:'#534AB7'}}>Total tous les pots</span>
            <span style={{fontSize:18,fontWeight:600,color:'#534AB7'}}>{fmt(totalPots)}</span>
          </div>
          {totalPotsTarget>0&&<><div style={{height:7,background:'var(--color-bg)',borderRadius:3,overflow:'hidden',marginBottom:6}}><div style={{height:'100%',width:`${pct(totalPots,totalPotsTarget)}%`,background:'#534AB7',borderRadius:3}}/></div>
          <div style={{fontSize:12,color:'var(--color-muted)'}}>Objectif total : {fmt(totalPotsTarget)} · {pct(totalPots,totalPotsTarget)}% atteint</div></>}
        </div>)}

        {pots.length===0&&<div style={{textAlign:'center',padding:'2rem',color:'var(--color-muted)',fontSize:14}}>Aucun pot créé. Crée ton premier pot !</div>}

        {pots.map(pot=>{
          const p=pot.target_amount>0?pct(pot.current_amount,pot.target_amount):0;
          const txList=potTx.filter(t=>t.pot_id===pot.id).slice(0,3);
          return(<div key={pot.id} style={{background:'var(--color-card)',border:'0.5px solid var(--color-border)',borderRadius:14,padding:'1rem',marginBottom:10}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
              <div style={{display:'flex',alignItems:'center',gap:8}}>
                <div style={{width:36,height:36,borderRadius:'50%',background:ha(pot.color,.15),display:'flex',alignItems:'center',justifyContent:'center',fontWeight:600,fontSize:16,color:pot.color}}>{pot.name[0]}</div>
                <div>
                  <div style={{fontSize:14,fontWeight:600}}>{pot.name}</div>
                  {pot.target_amount>0&&<div style={{fontSize:11,color:'var(--color-muted)'}}>Objectif : {fmt(pot.target_amount)}</div>}
                </div>
              </div>
              <div style={{display:'flex',alignItems:'center',gap:6}}>
                <div style={{fontSize:18,fontWeight:600,color:pot.color}}>{fmt(pot.current_amount)}</div>
                <button onClick={()=>{setPotForm({name:pot.name,color:pot.color,target_amount:pot.target_amount||'',current_amount:pot.current_amount||''});setPotModal(pot);}} style={{width:26,height:26,borderRadius:'50%',border:'0.5px solid var(--color-border)',background:'var(--color-bg)',cursor:'pointer',fontSize:12,display:'flex',alignItems:'center',justifyContent:'center',color:'var(--color-muted)'}}>✏️</button>
                <button onClick={()=>setDeletePotId(pot.id)} style={{width:26,height:26,borderRadius:'50%',border:'0.5px solid var(--color-border)',background:'var(--color-bg)',cursor:'pointer',fontSize:12,display:'flex',alignItems:'center',justifyContent:'center',color:'#D85A30'}}>🗑</button>
              </div>
            </div>
            {pot.target_amount>0&&(<div style={{marginBottom:10}}>
              <div style={{height:7,background:'var(--color-bg)',borderRadius:3,overflow:'hidden',marginBottom:4}}><div style={{height:'100%',width:`${p}%`,background:pot.color,borderRadius:3}}/></div>
              <div style={{fontSize:11,color:'var(--color-muted)'}}>{p}% atteint · Reste {fmt(pot.target_amount-pot.current_amount)}</div>
            </div>)}
            <div style={{display:'flex',gap:8,marginBottom:txList.length>0?10:0}}>
              <button onClick={()=>{setPotTxForm({type:'depot',amount:'',description:'',date:new Date().toISOString().slice(0,10),is_recurring:false,recurring_day:1});setPotTxModal(pot);}} style={{flex:1,padding:'8px',borderRadius:10,border:'1.5px solid #1D9E75',background:ha('#1D9E75',.1),color:'#1D9E75',cursor:'pointer',fontWeight:500,fontSize:13}}>+ Dépôt</button>
              <button onClick={()=>{setPotTxForm({type:'retrait',amount:'',description:'',date:new Date().toISOString().slice(0,10),is_recurring:false,recurring_day:1});setPotTxModal(pot);}} style={{flex:1,padding:'8px',borderRadius:10,border:'1.5px solid #D85A30',background:ha('#D85A30',.1),color:'#D85A30',cursor:'pointer',fontWeight:500,fontSize:13}}>- Retrait</button>
            </div>
            {txList.length>0&&(<div style={{borderTop:'0.5px solid var(--color-border)',paddingTop:8}}>
              <div style={{fontSize:11,color:'var(--color-muted)',marginBottom:6}}>Derniers mouvements</div>
              {txList.map(t=>(
                <div key={t.id} style={{display:'flex',justifyContent:'space-between',fontSize:12,marginBottom:4}}>
                  <span style={{color:'var(--color-muted)'}}>{t.description||t.type} · {new Date(t.date).toLocaleDateString('fr-FR')}</span>
                  <span style={{color:t.type==='depot'?'#1D9E75':'#D85A30',fontWeight:500}}>{t.type==='depot'?'+':'-'}{fmt(t.amount)}</span>
                </div>
              ))}
            </div>)}
          </div>);
        })}
      </div>)}

      {/* ===== CATÉGORIES ===== */}
      {view==='categories'&&(<div>
        {[...categories.revenus,...categories.depenses].filter(c=>depBycat[c.id]||revBycat[c.id]).map(cat=>{
          const rev=revBycat[cat.id]||0;const dep=depBycat[cat.id]||0;const s=rev-dep;
          const env=envelopeWithCarry[cat.id];const budget=env?.total||0;const over=budget>0&&dep>budget;const maxV=Math.max(rev,dep,1);
          return(<div key={cat.id} style={{background:'var(--color-card)',border:`0.5px solid ${over?'#D85A30':'var(--color-border)'}`,borderRadius:14,padding:'1rem',marginBottom:10}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
              <div style={{display:'flex',alignItems:'center',gap:8}}>
                <div style={{width:32,height:32,borderRadius:'50%',background:ha(cat.color,.15),display:'flex',alignItems:'center',justifyContent:'center',fontWeight:600,fontSize:13,color:cat.color}}>{cat.name[0]}</div>
                <div><div style={{fontSize:14,fontWeight:600}}>{cat.name}</div>
                <div style={{fontSize:11,color:'var(--color-muted)'}}>{budget>0?`Budget : ${fmt(envelopes[cat.id])}/mois${env?.carry>0?` + report ${fmt(env.carry)}`:''}`:"Pas d'enveloppe"}</div></div>
              </div>
              <div style={{display:'flex',alignItems:'center',gap:8}}>
                <div style={{textAlign:'right'}}><div style={{fontSize:15,fontWeight:600,color:s>=0?'#1D9E75':'#D85A30'}}>{s>=0?'+':''}{fmt(s)}</div><div style={{fontSize:10,color:'var(--color-muted)'}}>solde</div></div>
                <button onClick={()=>{setEnvModal(cat.id);setEnvValue(envelopes[cat.id]?String(envelopes[cat.id]):'');}} style={{width:28,height:28,borderRadius:'50%',border:'0.5px solid var(--color-border)',background:'var(--color-bg)',cursor:'pointer',fontSize:13,display:'flex',alignItems:'center',justifyContent:'center',color:'var(--color-muted)'}}>✉</button>
              </div>
            </div>
            {rev>0&&<div style={{marginBottom:6}}><div style={{display:'flex',justifyContent:'space-between',fontSize:12,color:'var(--color-muted)',marginBottom:3}}><span>Revenus</span><span style={{color:'#1D9E75'}}>{fmt(rev)}</span></div><div style={{height:6,background:'var(--color-bg)',borderRadius:3,overflow:'hidden'}}><div style={{height:'100%',width:`${Math.round((rev/maxV)*100)}%`,background:'#1D9E75',borderRadius:3}}/></div></div>}
            {dep>0&&<div><div style={{display:'flex',justifyContent:'space-between',fontSize:12,color:'var(--color-muted)',marginBottom:3}}><span>Dépenses</span><span style={{color:over?'#D85A30':'var(--color-muted)'}}>{fmt(dep)}{over&&' ⚠️'}</span></div><div style={{height:6,background:'var(--color-bg)',borderRadius:3,overflow:'hidden'}}><div style={{height:'100%',width:`${Math.round((dep/maxV)*100)}%`,background:'#D85A30',opacity:over?1:.7,borderRadius:3}}/></div>{budget>0&&<div style={{fontSize:11,color:over?'#D85A30':'var(--color-muted)',marginTop:3}}>{over?`Dépassé de ${fmt(dep-budget)}`:`Reste ${fmt(budget-dep)}`}</div>}</div>}
          </div>);
        })}
        <div style={{marginTop:16,background:'var(--color-card)',border:'0.5px solid var(--color-border)',borderRadius:14,padding:'1rem'}}>
          <div style={{fontSize:14,fontWeight:600,marginBottom:14}}>Gérer les catégories & enveloppes</div>
          {['revenus','depenses'].map(type=>(
            <div key={type} style={{marginBottom:20}}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
                <span style={{fontSize:13,fontWeight:600,color:type==='revenus'?'#1D9E75':'#D85A30'}}>{type==='revenus'?'Revenus':'Dépenses'}</span>
                <button onClick={()=>{setNewCatName('');setNewCatErr('');setNewCatModal(type);}} style={{padding:'4px 12px',fontSize:12,borderRadius:20,border:`1.5px solid ${type==='revenus'?'#1D9E75':'#D85A30'}`,background:ha(type==='revenus'?'#1D9E75':'#D85A30',.1),color:type==='revenus'?'#1D9E75':'#D85A30',cursor:'pointer',fontWeight:500}}>+ Nouvelle</button>
              </div>
              <div style={{display:'flex',flexDirection:'column',gap:6}}>
                {categories[type].map(cat=>(
                  <div key={cat.id} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'8px 12px',borderRadius:10,background:'var(--color-bg)',border:'0.5px solid var(--color-border)'}}>
                    <div style={{display:'flex',alignItems:'center',gap:8,flex:1}}><div style={{width:10,height:10,borderRadius:'50%',background:cat.color}}/><span style={{fontSize:13,fontWeight:500}}>{cat.name}</span></div>
                    <div style={{display:'flex',alignItems:'center',gap:6}}>
                      {type==='depenses'&&<button onClick={()=>{setEnvModal(cat.id);setEnvValue(envelopes[cat.id]?String(envelopes[cat.id]):'');}} style={{padding:'3px 10px',fontSize:12,borderRadius:20,border:'0.5px solid var(--color-border)',background:envelopes[cat.id]>0?ha('#534AB7',.1):'transparent',color:envelopes[cat.id]>0?'#534AB7':'var(--color-muted)',cursor:'pointer',whiteSpace:'nowrap'}}>{envelopes[cat.id]>0?`✉ ${fmt(envelopes[cat.id])}/mois`:'✉ Enveloppe'}</button>}
                      <button onClick={()=>deleteCat(type,cat.id)} style={{padding:'3px 8px',fontSize:11,borderRadius:6,border:'0.5px solid var(--color-border)',background:'transparent',cursor:'pointer',color:'#D85A30'}}>✕</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>)}

      {/* ===== LISTE ===== */}
      {view==='liste'&&(<div>
        <div style={{fontSize:13,color:'var(--color-muted)',marginBottom:12}}>{filtered.length} transaction{filtered.length!==1?'s':''} — {MS[filterMonth]} {filterYear}</div>
        {filtered.length===0&&<div style={{textAlign:'center',padding:'2rem',color:'var(--color-muted)',fontSize:14}}>Aucune transaction pour cette période.</div>}
        {[...filtered].sort((a,b)=>b.date.localeCompare(a.date)).map(t=>(
          <div key={t.id} style={{display:'flex',alignItems:'center',gap:12,padding:'12px 0',borderBottom:'0.5px solid var(--color-border)'}}>
            <div style={{width:38,height:38,borderRadius:'50%',background:ha(getCatColor(t.categorie),.15),display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
              <span style={{fontSize:13,fontWeight:600,color:getCatColor(t.categorie)}}>{(getCatName(t.categorie)||'?')[0]}</span>
            </div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{display:'flex',alignItems:'center',gap:6}}>
                <div style={{fontSize:14,fontWeight:500,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{t.description||getCatName(t.categorie)}</div>
                {t.is_recurring&&<span style={{fontSize:10,padding:'1px 6px',borderRadius:10,background:ha('#534AB7',.1),color:'#534AB7'}}>🔄</span>}
              </div>
              <div style={{fontSize:12,color:'var(--color-muted)'}}>{getCatName(t.categorie)} · {new Date(t.date).toLocaleDateString('fr-FR')}</div>
            </div>
            <div style={{fontWeight:600,fontSize:15,color:t.type==='revenus'?'#1D9E75':'#D85A30',flexShrink:0}}>{t.type==='revenus'?'+':'-'}{fmt(t.montant)}</div>
            <div style={{display:'flex',gap:4,flexShrink:0}}>
              <button onClick={()=>startEdit(t)} style={{padding:'4px 8px',fontSize:12,borderRadius:6,border:'0.5px solid var(--color-border)',background:'transparent',cursor:'pointer',color:'var(--color-muted)'}}>✏️</button>
              <button onClick={()=>setDeleteId(t.id)} style={{padding:'4px 8px',fontSize:12,borderRadius:6,border:'0.5px solid var(--color-border)',background:'transparent',cursor:'pointer',color:'#D85A30'}}>🗑</button>
            </div>
          </div>
        ))}
      </div>)}

      {/* ===== SAISIE ===== */}
      {view==='saisie'&&(
        <div style={{background:'var(--color-card)',border:'0.5px solid var(--color-border)',borderRadius:14,padding:'1.25rem'}}>
          <div style={{fontSize:16,fontWeight:600,marginBottom:16}}>{editId?'Modifier la transaction':'Nouvelle transaction'}</div>
          <div style={{marginBottom:14}}>
            <div style={{fontSize:13,color:'var(--color-muted)',marginBottom:6}}>Type</div>
            <div style={{display:'flex',gap:8}}>
              {[['revenus','Revenu'],['depenses','Dépense']].map(([k,l])=>(
                <button key={k} onClick={()=>setForm(f=>({...f,type:k,categorie:defCatId(k)}))} style={{flex:1,padding:'9px',borderRadius:10,border:`1.5px solid ${form.type===k?(k==='revenus'?'#1D9E75':'#D85A30'):'var(--color-border)'}`,background:form.type===k?ha(k==='revenus'?'#1D9E75':'#D85A30',.1):'transparent',color:form.type===k?(k==='revenus'?'#1D9E75':'#D85A30'):'var(--color-muted)',cursor:'pointer',fontWeight:form.type===k?600:400,fontSize:14}}>{l}</button>
              ))}
            </div>
          </div>
          <div style={{marginBottom:14}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:6}}>
              <span style={{fontSize:13,color:'var(--color-muted)'}}>Catégorie</span>
              <button onClick={()=>{setNewCatName('');setNewCatErr('');setNewCatModal(form.type);}} style={{fontSize:12,padding:'2px 8px',borderRadius:20,border:'1px solid var(--color-border)',background:'transparent',cursor:'pointer',color:'var(--color-muted)'}}>+ Nouvelle</button>
            </div>
            <select value={form.categorie} onChange={e=>setForm(f=>({...f,categorie:e.target.value}))} style={{...inp,marginBottom:0}}>
              {categories[form.type].map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:14}}>
            <div><div style={{fontSize:13,color:'var(--color-muted)',marginBottom:6}}>Montant (€)</div><input type="number" min="0" step="0.01" placeholder="0.00" value={form.montant} onChange={e=>setForm(f=>({...f,montant:e.target.value}))} style={inp}/></div>
            <div><div style={{fontSize:13,color:'var(--color-muted)',marginBottom:6}}>Date</div><input type="date" value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))} style={inp}/></div>
          </div>
          <div style={{marginBottom:14}}><div style={{fontSize:13,color:'var(--color-muted)',marginBottom:6}}>Description (optionnel)</div><input type="text" placeholder="Ex. Courses Aldi, Loyer…" value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))} style={inp}/></div>
          <div style={{marginBottom:20,display:'flex',alignItems:'center',gap:10,padding:'10px 12px',borderRadius:10,background:'var(--color-bg)',border:'0.5px solid var(--color-border)'}}>
            <input type="checkbox" id="recurring" checked={form.is_recurring} onChange={e=>setForm(f=>({...f,is_recurring:e.target.checked}))} style={{width:16,height:16,cursor:'pointer'}}/>
            <label htmlFor="recurring" style={{fontSize:13,cursor:'pointer',flex:1}}>🔄 Transaction récurrente</label>
            {form.is_recurring&&<div style={{display:'flex',alignItems:'center',gap:6}}>
              <span style={{fontSize:12,color:'var(--color-muted)'}}>Jour :</span>
              <input type="number" min="1" max="31" value={form.recurring_day} onChange={e=>setForm(f=>({...f,recurring_day:e.target.value}))} style={{width:50,padding:'4px 8px',borderRadius:8,border:'1px solid var(--color-border)',fontSize:13,background:'var(--color-bg)',color:'var(--color-text)'}}/>
            </div>}
          </div>
          <div style={{display:'flex',gap:8}}>
            <button onClick={handleSubmit} style={{flex:1,padding:'11px',borderRadius:10,border:'none',background:'#534AB7',color:'#fff',cursor:'pointer',fontWeight:600,fontSize:14}}>{editId?'Enregistrer':'Ajouter'}</button>
            <button onClick={()=>{setEditId(null);setView('liste');}} style={{padding:'11px 16px',borderRadius:10,border:'0.5px solid var(--color-border)',background:'transparent',cursor:'pointer',color:'var(--color-muted)',fontSize:14}}>Annuler</button>
          </div>
        </div>
      )}

      {/* Modal nouveau/edit pot */}
      {potModal&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.5)',display:'flex',alignItems:'flex-end',justifyContent:'center',zIndex:999}} onClick={()=>setPotModal(null)}>
          <div onClick={e=>e.stopPropagation()} style={{background:'var(--color-card)',borderRadius:'20px 20px 0 0',padding:'1.5rem',width:'100%',maxWidth:480}}>
            <div style={{fontSize:16,fontWeight:600,marginBottom:16}}>{potModal==='new'?'Nouveau pot':'Modifier le pot'}</div>
            <div style={{marginBottom:12}}><div style={{fontSize:13,color:'var(--color-muted)',marginBottom:6}}>Nom du pot</div><input type="text" placeholder="Ex. Vacances, Voiture…" value={potForm.name} onChange={e=>setPotForm(f=>({...f,name:e.target.value}))} style={inp} autoFocus/></div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:12}}>
              <div><div style={{fontSize:13,color:'var(--color-muted)',marginBottom:6}}>Solde actuel (€)</div><input type="number" min="0" step="0.01" placeholder="0.00" value={potForm.current_amount} onChange={e=>setPotForm(f=>({...f,current_amount:e.target.value}))} style={inp}/></div>
              <div><div style={{fontSize:13,color:'var(--color-muted)',marginBottom:6}}>Objectif (€, optionnel)</div><input type="number" min="0" step="0.01" placeholder="0.00" value={potForm.target_amount} onChange={e=>setPotForm(f=>({...f,target_amount:e.target.value}))} style={inp}/></div>
            </div>
            <div style={{marginBottom:16}}>
              <div style={{fontSize:13,color:'var(--color-muted)',marginBottom:8}}>Couleur</div>
              <div style={{display:'flex',flexWrap:'wrap',gap:8}}>
                {PALETTE.map(c=><div key={c} onClick={()=>setPotForm(f=>({...f,color:c}))} style={{width:28,height:28,borderRadius:'50%',background:c,cursor:'pointer',border:potForm.color===c?'3px solid var(--color-text)':'3px solid transparent'}}/>)}
              </div>
            </div>
            <div style={{display:'flex',gap:8}}>
              <button onClick={savePot} style={{flex:1,padding:'11px',borderRadius:10,border:'none',background:'#534AB7',color:'#fff',cursor:'pointer',fontWeight:600}}>Enregistrer</button>
              <button onClick={()=>setPotModal(null)} style={{flex:1,padding:'11px',borderRadius:10,border:'0.5px solid var(--color-border)',background:'transparent',cursor:'pointer',color:'var(--color-muted)'}}>Annuler</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal dépôt/retrait pot */}
      {potTxModal&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.5)',display:'flex',alignItems:'flex-end',justifyContent:'center',zIndex:999}} onClick={()=>setPotTxModal(null)}>
          <div onClick={e=>e.stopPropagation()} style={{background:'var(--color-card)',borderRadius:'20px 20px 0 0',padding:'1.5rem',width:'100%',maxWidth:480}}>
            <div style={{fontSize:16,fontWeight:600,marginBottom:4}}>Mouvement — {potTxModal.name}</div>
            <div style={{fontSize:13,color:'var(--color-muted)',marginBottom:16}}>Solde actuel : {fmt(potTxModal.current_amount)}</div>
            <div style={{display:'flex',gap:8,marginBottom:14}}>
              {[['depot','+ Dépôt','#1D9E75'],['retrait','- Retrait','#D85A30']].map(([k,l,c])=>(
                <button key={k} onClick={()=>setPotTxForm(f=>({...f,type:k}))} style={{flex:1,padding:'9px',borderRadius:10,border:`1.5px solid ${potTxForm.type===k?c:'var(--color-border)'}`,background:potTxForm.type===k?ha(c,.1):'transparent',color:potTxForm.type===k?c:'var(--color-muted)',cursor:'pointer',fontWeight:potTxForm.type===k?600:400}}>{l}</button>
              ))}
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:12}}>
              <div><div style={{fontSize:13,color:'var(--color-muted)',marginBottom:6}}>Montant (€)</div><input type="number" min="0" step="0.01" placeholder="0.00" value={potTxForm.amount} onChange={e=>setPotTxForm(f=>({...f,amount:e.target.value}))} style={inp} autoFocus/></div>
              <div><div style={{fontSize:13,color:'var(--color-muted)',marginBottom:6}}>Date</div><input type="date" value={potTxForm.date} onChange={e=>setPotTxForm(f=>({...f,date:e.target.value}))} style={inp}/></div>
            </div>
            <div style={{marginBottom:12}}><div style={{fontSize:13,color:'var(--color-muted)',marginBottom:6}}>Description (optionnel)</div><input type="text" placeholder="Ex. Virement mensuel…" value={potTxForm.description} onChange={e=>setPotTxForm(f=>({...f,description:e.target.value}))} style={inp}/></div>
            <div style={{marginBottom:16,display:'flex',alignItems:'center',gap:10,padding:'10px 12px',borderRadius:10,background:'var(--color-bg)',border:'0.5px solid var(--color-border)'}}>
              <input type="checkbox" id="potRecurring" checked={potTxForm.is_recurring} onChange={e=>setPotTxForm(f=>({...f,is_recurring:e.target.checked}))} style={{width:16,height:16,cursor:'pointer'}}/>
              <label htmlFor="potRecurring" style={{fontSize:13,cursor:'pointer',flex:1}}>🔄 Mouvement récurrent</label>
              {potTxForm.is_recurring&&<div style={{display:'flex',alignItems:'center',gap:6}}>
                <span style={{fontSize:12,color:'var(--color-muted)'}}>Jour :</span>
                <input type="number" min="1" max="31" value={potTxForm.recurring_day} onChange={e=>setPotTxForm(f=>({...f,recurring_day:e.target.value}))} style={{width:50,padding:'4px 8px',borderRadius:8,border:'1px solid var(--color-border)',fontSize:13,background:'var(--color-bg)',color:'var(--color-text)'}}/>
              </div>}
            </div>
            <div style={{display:'flex',gap:8}}>
              <button onClick={savePotTx} style={{flex:1,padding:'11px',borderRadius:10,border:'none',background:potTxForm.type==='depot'?'#1D9E75':'#D85A30',color:'#fff',cursor:'pointer',fontWeight:600}}>Confirmer</button>
              <button onClick={()=>setPotTxModal(null)} style={{flex:1,padding:'11px',borderRadius:10,border:'0.5px solid var(--color-border)',background:'transparent',cursor:'pointer',color:'var(--color-muted)'}}>Annuler</button>
            </div>
          </div>
        </div>
      )}

      {/* Modals communs */}
      {newCatModal&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.5)',display:'flex',alignItems:'flex-end',justifyContent:'center',zIndex:999}} onClick={()=>setNewCatModal(null)}>
          <div onClick={e=>e.stopPropagation()} style={{background:'var(--color-card)',borderRadius:'20px 20px 0 0',padding:'1.5rem',width:'100%',maxWidth:480}}>
            <div style={{fontSize:16,fontWeight:600,marginBottom:4}}>Nouvelle catégorie</div>
            <div style={{fontSize:13,color:'var(--color-muted)',marginBottom:16}}>Type : <strong>{newCatModal==='revenus'?'Revenu':'Dépense'}</strong></div>
            <input type="text" placeholder="Nom de la catégorie" value={newCatName} onChange={e=>{setNewCatName(e.target.value);setNewCatErr('');}} style={{...inp,marginBottom:6}} onKeyDown={e=>e.key==='Enter'&&confirmNewCat()} autoFocus/>
            {newCatErr&&<div style={{fontSize:12,color:'#D85A30',marginBottom:8}}>{newCatErr}</div>}
            <div style={{display:'flex',gap:8,marginTop:12}}>
              <button onClick={confirmNewCat} style={{flex:1,padding:'11px',borderRadius:10,border:'none',background:'#534AB7',color:'#fff',cursor:'pointer',fontWeight:600}}>Créer</button>
              <button onClick={()=>setNewCatModal(null)} style={{flex:1,padding:'11px',borderRadius:10,border:'0.5px solid var(--color-border)',background:'transparent',cursor:'pointer',color:'var(--color-muted)'}}>Annuler</button>
            </div>
          </div>
        </div>
      )}
      {envModal&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.5)',display:'flex',alignItems:'flex-end',justifyContent:'center',zIndex:999}} onClick={()=>setEnvModal(null)}>
          <div onClick={e=>e.stopPropagation()} style={{background:'var(--color-card)',borderRadius:'20px 20px 0 0',padding:'1.5rem',width:'100%',maxWidth:480}}>
            <div style={{fontSize:16,fontWeight:600,marginBottom:4}}>Enveloppe mensuelle</div>
            <div style={{fontSize:13,color:'var(--color-muted)',marginBottom:16}}>Catégorie : <strong>{getCatName(envModal)}</strong></div>
            <input type="number" min="0" step="1" placeholder="Ex. 300" value={envValue} onChange={e=>setEnvValue(e.target.value)} style={{...inp,marginBottom:6}} onKeyDown={e=>e.key==='Enter'&&saveEnvelope()} autoFocus/>
            <div style={{fontSize:12,color:'var(--color-muted)',marginBottom:16}}>Laissez vide pour supprimer l'enveloppe.</div>
            <div style={{display:'flex',gap:8}}>
              <button onClick={saveEnvelope} style={{flex:1,padding:'11px',borderRadius:10,border:'none',background:'#534AB7',color:'#fff',cursor:'pointer',fontWeight:600}}>Enregistrer</button>
              <button onClick={()=>setEnvModal(null)} style={{flex:1,padding:'11px',borderRadius:10,border:'0.5px solid var(--color-border)',background:'transparent',cursor:'pointer',color:'var(--color-muted)'}}>Annuler</button>
            </div>
          </div>
        </div>
      )}
      {(deleteId||deletePotId)&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.5)',display:'flex',alignItems:'flex-end',justifyContent:'center',zIndex:999}} onClick={()=>{setDeleteId(null);setDeletePotId(null);}}>
          <div onClick={e=>e.stopPropagation()} style={{background:'var(--color-card)',borderRadius:'20px 20px 0 0',padding:'1.5rem',width:'100%',maxWidth:480}}>
            <div style={{fontSize:16,fontWeight:600,marginBottom:8}}>Supprimer ?</div>
            <div style={{fontSize:13,color:'var(--color-muted)',marginBottom:20}}>Cette action est irréversible.</div>
            <div style={{display:'flex',gap:8}}>
              <button onClick={deleteId?confirmDelete:confirmDeletePot} style={{flex:1,padding:'11px',borderRadius:10,border:'none',background:'#D85A30',color:'#fff',cursor:'pointer',fontWeight:600}}>Supprimer</button>
              <button onClick={()=>{setDeleteId(null);setDeletePotId(null);}} style={{flex:1,padding:'11px',borderRadius:10,border:'0.5px solid var(--color-border)',background:'transparent',cursor:'pointer',color:'var(--color-muted)'}}>Annuler</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}