import { useState, useEffect, useCallback, useRef } from "react";

 const GROQ_KEY = import.meta.env.VITE_GROQ_API_KEY;

const C = {
  bg:"#07080f", surface:"#0d1018", card:"#111520", border:"#1c2232",
  teal:"#3de8df", purple:"#9b7dff", amber:"#ffb740", pink:"#ff6eb4",
  red:"#ff5252", green:"#4ade80", text:"#e8ecf4", muted:"#5a6278", dim:"#222840",
};

const MEAL_META = {
  colazione:{ icon:"☀️", color:C.amber,  label:"Colazione" },
  pranzo:   { icon:"🍽️", color:C.teal,   label:"Pranzo"    },
  cena:     { icon:"🌙", color:C.purple, label:"Cena"      },
  spuntino: { icon:"🍎", color:C.pink,   label:"Spuntino"  },
};

const QUICK_ADDS = {
  colazione: ["Caffè con latte","Cornetto","Uova strapazzate 2","Yogurt greco 150g","Avena 60g con frutta"],
  pranzo:    ["Pasta al pomodoro 180g","Insalata di pollo","Riso con verdure","Panino prosciutto","Zuppa legumi"],
  cena:      ["Salmone 150g","Petto di pollo 200g","Minestrone","Bistecca 200g","Pesce al forno"],
  spuntino:  ["Mela","Mandorle 30g","Yogurt greco","Banana","Barretta proteica"],
};

const todayKey = () => new Date().toDateString();
const todayLabel = () => new Date().toLocaleDateString("it-IT",{weekday:"long",day:"numeric",month:"long"});
const safePct = (a,b) => b>0 ? Math.min(Math.max(a/b,0),1) : 0;
const safeNum = (v,fb=0) => { const n=Number(v); return isFinite(n)&&n>=0 ? Math.round(n) : fb; };

function calcMacros(goalType, kcal, weight) {
  const w = Math.max(parseFloat(weight)||70, 30);
  const k = Math.max(safeNum(kcal,2000), 800);
  const pG = goalType==="perdita" ? w*2.2 : goalType==="massa" ? w*2.0 : w*1.8;
  const fG = goalType==="perdita" ? k*0.25/9 : goalType==="massa" ? k*0.30/9 : k*0.28/9;
  const cG = Math.max((k - pG*4 - fG*9)/4, 50);
  return { p:Math.round(pG), c:Math.round(cG), f:Math.round(fG) };
}

function migrateFromLegacy() {
  try {
    if (localStorage.getItem("nutriai_v3_migrated")) return;
    const op = JSON.parse(localStorage.getItem("nutriai_profile"));
    if (op?.setup) {
      const macros = op.macros || calcMacros(op.goalType||"mantenimento", op.goal||2000, op.weight||70);
      localStorage.setItem("nutriai_v3_profile", JSON.stringify({
        name:op.name||"", kcal:op.goal||op.calories||2000, macros,
        goalType:op.goalType||"mantenimento", weight:op.weight||70, setup:true,
      }));
    }
    const om = JSON.parse(localStorage.getItem("nutriai_meals"));
    if (om && typeof om==="object") {
      Object.entries(om).forEach(([day,meals]) => {
        if (Array.isArray(meals)&&meals.length>0)
          localStorage.setItem("nutriai_v3_meals_"+day, JSON.stringify(meals));
      });
    }
    localStorage.setItem("nutriai_v3_migrated","1");
  } catch(e) {}
}
migrateFromLegacy();

function loadProfile() { try{ return JSON.parse(localStorage.getItem("nutriai_v3_profile"))||null }catch{ return null } }
function saveProfileLocal(p) { try{ localStorage.setItem("nutriai_v3_profile",JSON.stringify(p)) }catch{} }
function loadMeals(key) { try{ return JSON.parse(localStorage.getItem("nutriai_v3_meals_"+key))||[] }catch{ return [] } }
function saveMealsLocal(key,meals) { try{ localStorage.setItem("nutriai_v3_meals_"+key,JSON.stringify(meals)) }catch{} }
function loadHistory() {
  try {
    const keys = Object.keys(localStorage).filter(k=>k.startsWith("nutriai_v3_meals_"));
    const out = {};
    keys.forEach(k=>{ out[k.replace("nutriai_v3_meals_","")] = JSON.parse(localStorage.getItem(k))||[]; });
    return out;
  } catch { return {}; }
}

/* ── ATOMS ── */
function GradBtn({ children, onClick, disabled, style={} }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      background: disabled?C.dim:`linear-gradient(135deg,${C.teal},${C.purple})`,
      border:"none", borderRadius:14, color:disabled?C.muted:"#07080f",
      padding:"15px 20px", fontSize:15, fontWeight:700,
      cursor:disabled?"not-allowed":"pointer",
      fontFamily:"inherit", transition:"all .2s", width:"100%", ...style,
    }}>{children}</button>
  );
}
function Tag({ children, color }) {
  return <span style={{ background:`${color}18`,color,borderRadius:8,padding:"3px 9px",fontSize:12,fontWeight:700,fontFamily:"'DM Mono',monospace" }}>{children}</span>;
}
function Spinner() { return <span style={{ display:"inline-block",animation:"spin .8s linear infinite" }}>⏳</span>; }

/* ── RING ── */
function Ring({ eaten, goal, size=180, strokeW=10, color=C.teal, label="Rimanenti", unit="kcal" }) {
  const pct = safePct(eaten,goal);
  const over = goal>0 && eaten>goal;
  const col = over?C.red:pct>.88?C.amber:color;
  const r=(size/2)-strokeW-4, cx=size/2, cy=size/2;
  const circ=2*Math.PI*r, dash=pct*circ;
  const id=`g${color.replace(/[^a-z0-9]/gi,"")}${size}`;
  return (
    <div style={{ position:"relative",width:size,height:size,flexShrink:0 }}>
      <svg width={size} height={size} style={{ display:"block" }}>
        <defs><filter id={id}><feGaussianBlur stdDeviation="2.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#1a2035" strokeWidth={strokeW}/>
        {pct>0 && <circle cx={cx} cy={cy} r={r} fill="none" stroke={col} strokeWidth={strokeW}
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
          transform={`rotate(-90 ${cx} ${cy})`} filter={`url(#${id})`}
          style={{ transition:"stroke-dasharray .65s cubic-bezier(.4,0,.2,1),stroke .35s" }}/>}
        {[0,25,50,75].map(p=>{ const a=(p/100*360-90)*Math.PI/180; return <line key={p} x1={cx+r*Math.cos(a)} y1={cy+r*Math.sin(a)} x2={cx+(r+5)*Math.cos(a)} y2={cy+(r+5)*Math.sin(a)} stroke={C.dim} strokeWidth={1.5}/>; })}
      </svg>
      <div style={{ position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",pointerEvents:"none" }}>
        <span style={{ fontSize:10,color:C.muted,textTransform:"uppercase",letterSpacing:".1em" }}>{over?"Eccesso":label}</span>
        <span style={{ fontSize:size>120?32:20,fontWeight:800,color:over?C.red:C.text,fontFamily:"'DM Mono',monospace",lineHeight:1.1,marginTop:2 }}>{over?`+${eaten-goal}`:Math.max(goal-eaten,0)}</span>
        <span style={{ fontSize:10,color:C.muted,marginTop:2 }}>{unit}</span>
        {goal>0 && <span style={{ fontSize:10,color:C.dim,marginTop:4 }}>{eaten} / {goal}</span>}
      </div>
    </div>
  );
}

function MacroCard({ label, eaten, goal, color, icon }) {
  const pct=safePct(eaten,goal), over=goal>0&&eaten>goal;
  const col=over?C.red:pct>.9?C.amber:color;
  return (
    <div style={{ background:`${color}0c`,border:`1px solid ${color}22`,borderRadius:18,padding:"16px 10px",display:"flex",flexDirection:"column",alignItems:"center",gap:8,flex:"1 1 0" }}>
      <span style={{ fontSize:20 }}>{icon}</span>
      <Ring eaten={safeNum(eaten)} goal={safeNum(goal)} size={88} strokeW={7} color={color} label="left" unit="g"/>
      <div style={{ textAlign:"center",width:"100%" }}>
        <div style={{ fontSize:10,color:C.muted,textTransform:"uppercase",letterSpacing:".08em",marginBottom:4 }}>{label}</div>
        <div style={{ background:C.dim,borderRadius:6,height:5,overflow:"hidden" }}>
          <div style={{ width:`${Math.round(pct*100)}%`,height:"100%",background:col,borderRadius:6,transition:"width .6s" }}/>
        </div>
        <div style={{ display:"flex",justifyContent:"space-between",marginTop:4 }}>
          <span style={{ fontSize:10,color:C.dim }}>{eaten}g</span>
          <span style={{ fontSize:10,color:over?C.red:col,fontWeight:700 }}>{over?`+${eaten-goal}g`:`${Math.max(goal-eaten,0)}g left`}</span>
        </div>
      </div>
    </div>
  );
}

function MealCard({ meal, onDelete }) {
  const meta = MEAL_META[meal.mealType]||MEAL_META.spuntino;
  return (
    <div style={{ background:C.card,border:`1px solid ${C.border}`,borderRadius:18,padding:"15px 17px",display:"flex",gap:13,alignItems:"flex-start",position:"relative",overflow:"hidden" }}>
      <div style={{ position:"absolute",left:0,top:0,bottom:0,width:3,background:meta.color }}/>
      <div style={{ width:40,height:40,borderRadius:12,flexShrink:0,background:`${meta.color}15`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:19,marginLeft:4 }}>{meta.icon}</div>
      <div style={{ flex:1,minWidth:0 }}>
        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start" }}>
          <div style={{ flex:1,paddingRight:8 }}>
            <span style={{ fontSize:10,fontWeight:700,color:meta.color,textTransform:"uppercase",letterSpacing:".1em" }}>{meta.label}</span>
            {meal.time && <span style={{ fontSize:10,color:C.dim,marginLeft:8 }}>{meal.time}</span>}
            <p style={{ margin:"3px 0 8px",fontSize:14,color:C.text,lineHeight:1.4 }}>{meal.description}</p>
          </div>
          <button onClick={()=>onDelete(meal.id)} style={{ background:"none",border:"none",color:C.dim,cursor:"pointer",fontSize:14,padding:"2px 5px",borderRadius:6,transition:"color .2s" }}
            onMouseEnter={e=>e.currentTarget.style.color=C.red} onMouseLeave={e=>e.currentTarget.style.color=C.dim}>✕</button>
        </div>
        <div style={{ display:"flex",gap:5,flexWrap:"wrap",marginBottom:meal.photo?8:0 }}>
          <Tag color={C.amber}>{safeNum(meal.calories)} kcal</Tag>
          {safeNum(meal.protein)>0 && <Tag color={C.teal}>P {safeNum(meal.protein)}g</Tag>}
          {safeNum(meal.carbs)>0   && <Tag color={C.purple}>C {safeNum(meal.carbs)}g</Tag>}
          {safeNum(meal.fat)>0     && <Tag color={C.pink}>G {safeNum(meal.fat)}g</Tag>}
        </div>
        {meal.note && <p style={{ margin:"0 0 6px",fontSize:12,color:C.muted,fontStyle:"italic",lineHeight:1.35 }}>💡 {meal.note}</p>}
        {meal.photo && <img src={meal.photo} alt="pasto" style={{ width:"100%",maxHeight:140,objectFit:"cover",borderRadius:10,border:`1px solid ${C.border}` }}/>}
      </div>
    </div>
  );
}

function WaterTracker({ glasses, setGlasses }) {
  const goal=8;
  return (
    <div style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:20,padding:"16px 18px" }}>
      <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12 }}>
        <span style={{ fontSize:11,color:C.muted,textTransform:"uppercase",letterSpacing:".1em" }}>💧 Acqua</span>
        <span style={{ fontSize:13,color:C.teal,fontFamily:"'DM Mono',monospace",fontWeight:700 }}>{glasses}/{goal} bicchieri</span>
      </div>
      <div style={{ display:"flex",gap:6,flexWrap:"wrap",marginBottom:10 }}>
        {Array.from({length:goal}).map((_,i)=>(
          <button key={i} onClick={()=>setGlasses(i<glasses?i:i+1)} style={{ width:34,height:34,borderRadius:10,border:`1px solid ${i<glasses?"#3de8df55":C.border}`,background:i<glasses?"#3de8df18":C.dim,cursor:"pointer",fontSize:16,transition:"all .2s" }}>💧</button>
        ))}
      </div>
      <div style={{ background:C.dim,borderRadius:6,height:5,overflow:"hidden" }}>
        <div style={{ width:`${safePct(glasses,goal)*100}%`,height:"100%",background:C.teal,borderRadius:6,transition:"width .4s" }}/>
      </div>
    </div>
  );
}

/* ── SETUP ── */
function SetupScreen({ onSave }) {
  const [name,setName]=useState(""); const [age,setAge]=useState("");
  const [weight,setWeight]=useState(""); const [height,setHeight]=useState("");
  const [sex,setSex]=useState("m"); const [activity,setActivity]=useState("moderato");
  const [goalType,setGoalType]=useState("mantenimento"); const [step,setStep]=useState(0);

  const actMult={sedentario:1.2,leggero:1.375,moderato:1.55,attivo:1.725,moltattivo:1.9};
  const goalDelta={perdita:-500,mantenimento:0,massa:300};
  const calcKcal=()=>{
    if(!weight||!height||!age) return 2000;
    const bmr=sex==="m"?10*+weight+6.25*+height-5*+age+5:10*+weight+6.25*+height-5*+age-161;
    return Math.max(Math.round(bmr*actMult[activity]+goalDelta[goalType]),1200);
  };
  const kcal=calcKcal(); const macros=calcMacros(goalType,kcal,weight);

  const inp={background:"#0a0c14",border:`1px solid ${C.border}`,borderRadius:14,color:C.text,padding:"13px 15px",fontSize:15,width:"100%",fontFamily:"inherit",outline:"none",boxSizing:"border-box",transition:"border-color .2s"};
  const lbl={color:C.muted,fontSize:11,marginBottom:6,display:"block",textTransform:"uppercase",letterSpacing:".1em"};

  const steps=[
    <div key="s0" style={{display:"flex",flexDirection:"column",gap:18}}>
      <div style={{textAlign:"center",padding:"8px 0 16px"}}>
        <div style={{fontSize:52,marginBottom:8}}>👋</div>
        <h2 style={{margin:0,fontSize:24,fontWeight:800,color:C.text}}>Benvenuto!</h2>
        <p style={{margin:"6px 0 0",color:C.muted,fontSize:14}}>Inizia il tuo percorso nutrizionale</p>
      </div>
      <div><label style={lbl}>Come ti chiami?</label>
        <input value={name} onChange={e=>setName(e.target.value)} placeholder="Il tuo nome" style={inp}
          onFocus={e=>e.target.style.borderColor=C.teal} onBlur={e=>e.target.style.borderColor=C.border}/>
      </div>
      <div style={{display:"flex",gap:8}}>
        {[["m","👨 Uomo"],["f","👩 Donna"]].map(([v,lb])=>(
          <button key={v} onClick={()=>setSex(v)} style={{flex:1,padding:"12px",background:sex===v?`${C.teal}15`:"#0a0c14",border:`1px solid ${sex===v?C.teal:C.border}`,borderRadius:12,color:sex===v?C.teal:C.muted,cursor:"pointer",fontFamily:"inherit",fontSize:14,fontWeight:sex===v?700:400,transition:"all .2s"}}>{lb}</button>
        ))}
      </div>
      <GradBtn onClick={()=>setStep(1)} disabled={!name.trim()}>Avanti →</GradBtn>
    </div>,

    <div key="s1" style={{display:"flex",flexDirection:"column",gap:14}}>
      <div style={{textAlign:"center",padding:"8px 0 14px"}}>
        <div style={{fontSize:44,marginBottom:6}}>📏</div>
        <h2 style={{margin:0,fontSize:20,fontWeight:800,color:C.text}}>Dati fisici</h2>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
        {[["Età","30",age,setAge],["Peso kg","70",weight,setWeight],["Altezza cm","175",height,setHeight]].map(([l,ph,v,sv])=>(
          <div key={l}><label style={lbl}>{l}</label>
            <input value={v} onChange={e=>sv(e.target.value)} type="number" placeholder={ph} style={inp}
              onFocus={e=>e.target.style.borderColor=C.teal} onBlur={e=>e.target.style.borderColor=C.border}/>
          </div>
        ))}
      </div>
      <div><label style={lbl}>Attività fisica</label>
        <select value={activity} onChange={e=>setActivity(e.target.value)} style={{...inp,appearance:"none"}}>
          <option value="sedentario">😴 Sedentario</option>
          <option value="leggero">🚶 Leggero (1-3 gg/sett)</option>
          <option value="moderato">🏃 Moderato (3-5 gg/sett)</option>
          <option value="attivo">💪 Attivo (6-7 gg/sett)</option>
          <option value="moltattivo">🔥 Molto attivo</option>
        </select>
      </div>
      <div style={{display:"flex",gap:8}}>
        <button onClick={()=>setStep(0)} style={{flex:"0 0 48px",background:"none",border:`1px solid ${C.border}`,borderRadius:12,color:C.muted,cursor:"pointer",fontSize:18}}>←</button>
        <GradBtn onClick={()=>setStep(2)} disabled={!age||!weight||!height} style={{flex:1}}>Avanti →</GradBtn>
      </div>
    </div>,

    <div key="s2" style={{display:"flex",flexDirection:"column",gap:12}}>
      <div style={{textAlign:"center",padding:"8px 0 14px"}}>
        <div style={{fontSize:44,marginBottom:6}}>🎯</div>
        <h2 style={{margin:0,fontSize:20,fontWeight:800,color:C.text}}>Obiettivo</h2>
      </div>
      {[["perdita","📉","Perdita peso","Deficit -500 kcal"],["mantenimento","⚖️","Mantenimento","Equilibrio calorico"],["massa","📈","Aumento massa","Surplus +300 kcal"]].map(([v,ic,lb,sub])=>(
        <button key={v} onClick={()=>setGoalType(v)} style={{background:goalType===v?`linear-gradient(135deg,${C.teal}15,${C.purple}15)`:"#0a0c14",border:`1px solid ${goalType===v?C.teal:C.border}`,borderRadius:14,padding:"13px 16px",cursor:"pointer",display:"flex",alignItems:"center",gap:12,textAlign:"left",transition:"all .2s"}}>
          <span style={{fontSize:24}}>{ic}</span>
          <div><div style={{color:goalType===v?C.text:C.muted,fontWeight:700,fontSize:14,fontFamily:"inherit"}}>{lb}</div><div style={{color:C.muted,fontSize:12,fontFamily:"inherit"}}>{sub}</div></div>
          {goalType===v&&<span style={{marginLeft:"auto",color:C.teal,fontSize:16}}>✓</span>}
        </button>
      ))}
      {weight&&height&&age&&(
        <div style={{background:`${C.teal}0a`,border:`1px solid ${C.teal}25`,borderRadius:14,padding:"14px"}}>
          <div style={{textAlign:"center",marginBottom:10}}>
            <span style={{color:C.muted,fontSize:12}}>Fabbisogno: </span>
            <span style={{color:C.teal,fontSize:22,fontWeight:800,fontFamily:"'DM Mono',monospace"}}>{kcal} kcal/g</span>
          </div>
          <div style={{display:"flex",gap:8}}>
            {[["🥩","P",macros.p,C.teal],["🍞","C",macros.c,C.purple],["🥑","G",macros.f,C.pink]].map(([ic,lb,v,col])=>(
              <div key={lb} style={{flex:1,background:`${col}10`,borderRadius:10,padding:"8px 4px",textAlign:"center"}}>
                <div style={{fontSize:15}}>{ic}</div>
                <div style={{fontSize:14,fontWeight:800,color:col,fontFamily:"'DM Mono',monospace"}}>{v}g</div>
                <div style={{fontSize:9,color:C.muted}}>{lb}</div>
              </div>
            ))}
          </div>
        </div>
      )}
      <div style={{display:"flex",gap:8}}>
        <button onClick={()=>setStep(1)} style={{flex:"0 0 48px",background:"none",border:`1px solid ${C.border}`,borderRadius:12,color:C.muted,cursor:"pointer",fontSize:18}}>←</button>
        <GradBtn onClick={()=>onSave({name,kcal,macros,goalType,weight})} style={{flex:1}}>Inizia 🚀</GradBtn>
      </div>
    </div>,
  ];

  return (
    <div style={{minHeight:"100vh",background:C.bg,display:"flex",alignItems:"center",justifyContent:"center",padding:24,fontFamily:"'Inter',sans-serif"}}>
      <div style={{width:"100%",maxWidth:420}}>
        <div style={{display:"flex",justifyContent:"center",gap:8,marginBottom:28}}>
          {[0,1,2].map(i=><div key={i} style={{width:i===step?22:8,height:8,borderRadius:4,background:i<=step?C.teal:C.dim,transition:"all .3s"}}/>)}
        </div>
        {steps[step]}
      </div>
    </div>
  );
}

/* ══════════════ MAIN ══════════════ */
export default function NutriAI() {
  const [profile,setProfile]   = useState(loadProfile);
  const [meals,setMeals]       = useState(()=>loadMeals(todayKey()));
  const [history,setHistory]   = useState(loadHistory);
  const [input,setInput]       = useState("");
  const [mealType,setMealType] = useState("pranzo");
  const [loading,setLoading]   = useState(false);
  const [tab,setTab]           = useState("oggi");
  const [glasses,setGlasses]   = useState(()=>{ try{ return parseInt(localStorage.getItem("nutriai_water_"+todayKey()))||0 }catch{ return 0 } });
  const [toast,setToast]       = useState(null);
  const [quickVisible,setQuickVisible] = useState(false);
  const [photo,setPhoto]       = useState(null);
  const fileRef = useRef(null);
  const taRef   = useRef(null);

  useEffect(()=>{ if(profile){ saveMealsLocal(todayKey(),meals); } },[meals]);
  useEffect(()=>{ try{ localStorage.setItem("nutriai_water_"+todayKey(),glasses) }catch{} },[glasses]);

  const showToast = (msg,type="success") => { setToast({msg,type}); setTimeout(()=>setToast(null),2800); };

  const totals = meals.reduce((a,m)=>({
    cal:a.cal+safeNum(m.calories), p:a.p+safeNum(m.protein),
    c:a.c+safeNum(m.carbs), f:a.f+safeNum(m.fat),
  }),{cal:0,p:0,c:0,f:0});

  const macros   = profile?.macros || {p:150,c:200,f:65};
  const kcalGoal = Math.max(safeNum(profile?.kcal||profile?.goal||2000,2000),800);

  const handlePhoto = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setPhoto(reader.result);
    reader.readAsDataURL(file);
  };

  const analyzeMeal = useCallback(async (text=input, retry=0) => {
    if (!text.trim() && !photo) return;
    setLoading(true);

    const prompt = `Sei un nutrizionista esperto. Analizza questo pasto e stima i valori nutrizionali.
${text ? `Descrizione: "${text}"` : "Analizza la foto del piatto."}
Tipo pasto: ${mealType}
${photo ? "Usa la foto per identificare ingredienti e stimare le porzioni." : ""}
Stima porzioni medie italiane se non specificate.
Rispondi SOLO con JSON valido senza markdown:
{"calories":0,"protein":0,"carbs":0,"fat":0,"note":""}`;

    try {
      const model = photo ? "meta-llama/llama-4-scout-17b-16e-instruct" : "llama3-8b-8192";
      const content = photo
        ? [{ type:"text",text:prompt },{ type:"image_url",image_url:{ url:photo } }]
        : prompt;

      const res = await fetch("https://api.groq.com/openai/v1/chat/completions",{
        method:"POST",
        headers:{ "Content-Type":"application/json", "Authorization":`Bearer ${GROQ_KEY}` },
        body:JSON.stringify({ model, max_tokens:200, temperature:0, messages:[{ role:"user", content }] }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error.message);

      const raw = data.choices?.[0]?.message?.content || "";
      const match = raw.match(/\{[\s\S]*?\}/);
      if (!match) throw new Error("No JSON");
      const parsed = JSON.parse(match[0]);

      const cal=safeNum(parsed.calories,0), prot=safeNum(parsed.protein,0);
      const carb=safeNum(parsed.carbs,0), fat=safeNum(parsed.fat,0);
      if (cal===0 && retry<2) { setLoading(false); return analyzeMeal(text,retry+1); }

      setMeals(prev=>[...prev,{
        id:Date.now(), description:text.trim()||"Foto pasto", mealType,
        calories:cal, protein:prot, carbs:carb, fat,
        note:typeof parsed.note==="string" ? parsed.note.slice(0,100) : "",
        photo:photo||null,
        time:new Date().toLocaleTimeString("it-IT",{hour:"2-digit",minute:"2-digit"}),
      }]);
      setInput(""); setPhoto(null); setQuickVisible(false);
      showToast(`✅ +${cal} kcal aggiunte`);
    } catch(e) {
      if (retry<2) { await new Promise(r=>setTimeout(r,800*(retry+1))); setLoading(false); return analyzeMeal(text,retry+1); }
      showToast("❌ Errore analisi. Riprova.","error");
    }
    setLoading(false);
  },[input,mealType,photo]);

  const deleteMeal = useCallback(id=>{ setMeals(p=>p.filter(m=>m.id!==id)); showToast("🗑️ Pasto eliminato"); },[]);

  const handleSaveProfile = (p) => {
    const np={...p,setup:true}; setProfile(np); saveProfileLocal(np);
  };

  if (!profile?.setup) return <SetupScreen onSave={handleSaveProfile}/>;

  const histDays = Object.entries(history).filter(([d])=>d!==todayKey()).sort((a,b)=>new Date(b[0])-new Date(a[0])).slice(0,7);
  const streak = (()=>{ let s=0,d=new Date(); d.setDate(d.getDate()-1); while(true){ const k=d.toDateString(); if(!(history[k]?.length>0)) break; s++; d.setDate(d.getDate()-1); } return s; })();
  const goalLabels={perdita:"📉 Perdita peso",mantenimento:"⚖️ Mantenimento",massa:"📈 Aumento massa"};

  return (
    <div style={{minHeight:"100vh",background:C.bg,color:C.text,fontFamily:"'Inter','DM Sans',sans-serif",paddingBottom:80}}>

      {toast && (
        <div style={{position:"fixed",top:16,left:"50%",transform:"translateX(-50%)",background:toast.type==="error"?"#2a1015":"#0f2a20",border:`1px solid ${toast.type==="error"?C.red:C.green}`,borderRadius:14,padding:"10px 18px",color:toast.type==="error"?C.red:C.green,fontSize:13,fontWeight:700,zIndex:999,boxShadow:"0 8px 32px #00000060",animation:"fadeIn .25s ease",whiteSpace:"nowrap"}}>
          {toast.msg}
        </div>
      )}

      {/* NAV */}
      <div style={{background:`${C.surface}f0`,backdropFilter:"blur(20px)",borderBottom:`1px solid ${C.border}`,padding:"0 18px",position:"sticky",top:0,zIndex:20}}>
        <div style={{maxWidth:580,margin:"0 auto"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"14px 0 11px"}}>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <div style={{width:36,height:36,borderRadius:11,background:`linear-gradient(135deg,${C.teal},${C.purple})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>🥗</div>
              <div>
                <div style={{fontSize:16,fontWeight:800,background:`linear-gradient(135deg,${C.teal},${C.purple})`,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>NutriAI</div>
                <div style={{fontSize:11,color:C.muted,marginTop:-1}}>
                  {profile.name} · {goalLabels[profile.goalType]||"⚖️ Mantenimento"}
                  {streak>0 && <span style={{marginLeft:6,color:C.amber}}>🔥{streak}g</span>}
                </div>
              </div>
            </div>
            <button onClick={()=>{localStorage.removeItem("nutriai_v3_profile");setProfile(null);}} style={{background:"none",border:`1px solid ${C.border}`,borderRadius:10,color:C.muted,padding:"6px 11px",cursor:"pointer",fontSize:12,fontFamily:"inherit"}}>⚙️</button>
          </div>
          <div style={{display:"flex"}}>
            {[["oggi","📅 Oggi"],["storico","📊 Storico"]].map(([id,lb])=>(
              <button key={id} onClick={()=>setTab(id)} style={{flex:1,padding:"10px 0",background:"none",border:"none",borderBottom:`2px solid ${tab===id?C.teal:"transparent"}`,color:tab===id?C.teal:C.muted,fontSize:12,fontWeight:tab===id?700:400,cursor:"pointer",fontFamily:"inherit",textTransform:"uppercase",letterSpacing:".08em",transition:"all .2s"}}>{lb}</button>
            ))}
          </div>
        </div>
      </div>

      <div style={{maxWidth:580,margin:"0 auto",padding:"18px 15px"}}>
        {tab==="oggi" && <>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
            <span style={{fontSize:13,color:C.muted,background:C.surface,border:`1px solid ${C.border}`,borderRadius:20,padding:"5px 13px",textTransform:"capitalize"}}>📅 {todayLabel()}</span>
            <span style={{fontSize:12,color:C.dim,fontFamily:"'DM Mono',monospace"}}>{meals.length} pasti</span>
          </div>

          {/* calorie ring */}
          <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:22,padding:"22px 18px",marginBottom:10,display:"flex",flexDirection:"column",alignItems:"center",gap:6}}>
            <div style={{fontSize:11,color:C.muted,textTransform:"uppercase",letterSpacing:".1em",marginBottom:4}}>🔥 Calorie</div>
            <Ring eaten={totals.cal} goal={kcalGoal}/>
            <div style={{display:"flex",gap:16,marginTop:4}}>
              {[["☀️",C.amber,"colazione"],["🍽️",C.teal,"pranzo"],["🌙",C.purple,"cena"],["🍎",C.pink,"spuntino"]].map(([ic,col,type])=>(
                <div key={type} style={{textAlign:"center"}}>
                  <div style={{fontSize:10,color:C.dim}}>{ic}</div>
                  <div style={{fontSize:12,color:col,fontFamily:"'DM Mono',monospace",fontWeight:700}}>{meals.filter(m=>m.mealType===type).reduce((s,m)=>s+safeNum(m.calories),0)}</div>
                </div>
              ))}
            </div>
          </div>

          {/* macro rings */}
          <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:22,padding:"18px 14px",marginBottom:10}}>
            <div style={{fontSize:11,color:C.muted,textTransform:"uppercase",letterSpacing:".1em",marginBottom:12}}>💊 Macronutrienti</div>
            <div style={{display:"flex",gap:8}}>
              <MacroCard label="Proteine"    eaten={totals.p} goal={macros.p} color={C.teal}   icon="🥩"/>
              <MacroCard label="Carboidrati" eaten={totals.c} goal={macros.c} color={C.purple} icon="🍞"/>
              <MacroCard label="Grassi"      eaten={totals.f} goal={macros.f} color={C.pink}   icon="🥑"/>
            </div>
          </div>

          {/* water */}
          <div style={{marginBottom:10}}>
            <WaterTracker glasses={glasses} setGlasses={setGlasses}/>
          </div>

          {/* input pasto */}
          <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:22,padding:"18px",marginBottom:10}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
              <p style={{margin:0,fontSize:11,color:C.muted,textTransform:"uppercase",letterSpacing:".1em"}}>✏️ Aggiungi pasto</p>
              <button onClick={()=>setQuickVisible(v=>!v)} style={{background:`${C.purple}15`,border:`1px solid ${C.purple}30`,borderRadius:8,color:C.purple,padding:"4px 10px",cursor:"pointer",fontSize:11,fontFamily:"inherit",fontWeight:600}}>
                {quickVisible?"Chiudi":"⚡ Veloci"}
              </button>
            </div>

            {quickVisible && (
              <div style={{marginBottom:12}}>
                <div style={{fontSize:11,color:C.dim,marginBottom:6}}>Suggerimenti {MEAL_META[mealType].label.toLowerCase()}:</div>
                <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                  {QUICK_ADDS[mealType].map(s=>(
                    <button key={s} onClick={()=>analyzeMeal(s)} disabled={loading} style={{background:C.dim,border:"none",borderRadius:8,color:C.muted,padding:"6px 10px",cursor:"pointer",fontSize:12,fontFamily:"inherit",transition:"all .2s"}}
                      onMouseEnter={e=>e.currentTarget.style.background=`${C.teal}20`}
                      onMouseLeave={e=>e.currentTarget.style.background=C.dim}>{s}</button>
                  ))}
                </div>
              </div>
            )}

            {/* tipo pasto */}
            <div style={{display:"flex",gap:6,marginBottom:12,flexWrap:"wrap"}}>
              {Object.entries(MEAL_META).map(([k,m])=>(
                <button key={k} onClick={()=>setMealType(k)} style={{padding:"7px 13px",background:mealType===k?`${m.color}18`:"#0a0c14",border:`1px solid ${mealType===k?m.color:C.border}`,borderRadius:20,color:mealType===k?m.color:C.muted,fontSize:13,cursor:"pointer",fontFamily:"inherit",fontWeight:mealType===k?700:400,transition:"all .2s",display:"flex",alignItems:"center",gap:4}}>{m.icon} {m.label}</button>
              ))}
            </div>

            <textarea ref={taRef} value={input} onChange={e=>setInput(e.target.value)}
              onKeyDown={e=>{ if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();analyzeMeal();} }}
              placeholder={`Descrivi la tua ${MEAL_META[mealType].label.toLowerCase()}… (opzionale con foto)`}
              style={{width:"100%",minHeight:84,background:"#0a0c14",border:`1px solid ${C.border}`,borderRadius:13,color:C.text,padding:"13px",fontSize:14,fontFamily:"inherit",resize:"vertical",outline:"none",boxSizing:"border-box",lineHeight:1.55,transition:"border-color .2s"}}
              onFocus={e=>e.target.style.borderColor=C.teal} onBlur={e=>e.target.style.borderColor=C.border}
            />

            {/* foto preview */}
            {photo && (
              <div style={{position:"relative",marginTop:10}}>
                <img src={photo} alt="Foto pasto" style={{width:"100%",maxHeight:200,objectFit:"cover",borderRadius:13,border:`1px solid ${C.teal}40`}}/>
                <button onClick={()=>setPhoto(null)} style={{position:"absolute",top:8,right:8,background:"#00000099",border:"none",borderRadius:20,color:"#fff",width:28,height:28,cursor:"pointer",fontSize:14,display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
                <div style={{position:"absolute",bottom:8,left:8,background:"#00000099",borderRadius:8,padding:"3px 8px",fontSize:11,color:C.teal}}>📸 Foto caricata</div>
              </div>
            )}

            {/* bottoni */}
            <div style={{display:"flex",gap:8,marginTop:10}}>
              <input ref={fileRef} type="file" accept="image/*" onChange={handlePhoto} style={{display:"none"}}/>
              <button onClick={()=>fileRef.current?.click()} style={{
                width:50,height:50,flexShrink:0,
                background:photo?`${C.teal}20`:"#0a0c14",
                border:`1px solid ${photo?C.teal:C.border}`,
                borderRadius:13,cursor:"pointer",fontSize:22,
                display:"flex",alignItems:"center",justifyContent:"center",transition:"all .2s",
              }} title="Scatta foto o scegli dalla galleria">📷</button>
              <button onClick={()=>analyzeMeal()} disabled={loading||(!input.trim()&&!photo)} style={{
                flex:1,height:50,
                background:loading||(!input.trim()&&!photo)?C.dim:`linear-gradient(135deg,${C.teal},${C.purple})`,
                border:"none",borderRadius:13,
                color:loading||(!input.trim()&&!photo)?C.muted:"#07080f",
                fontSize:15,fontWeight:700,
                cursor:loading||(!input.trim()&&!photo)?"not-allowed":"pointer",
                fontFamily:"inherit",transition:"all .2s",
                display:"flex",alignItems:"center",justifyContent:"center",gap:8,
              }}>
                {loading ? <><Spinner/>{photo?" Analisi foto…":" Analisi pasto…"}</> : photo&&!input.trim() ? "🔍 Analizza foto" : "🔍 Analizza con AI"}
              </button>
            </div>
          </div>

          {/* lista pasti */}
          {meals.length>0 ? (
            <div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                <span style={{fontSize:11,color:C.muted,textTransform:"uppercase",letterSpacing:".1em"}}>Pasti di oggi</span>
                <span style={{fontSize:12,color:C.dim,fontFamily:"'DM Mono',monospace"}}>{meals.length} · {totals.cal} kcal</span>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:7}}>
                {[...meals].reverse().map(m=><MealCard key={m.id} meal={m} onDelete={deleteMeal}/>)}
              </div>
            </div>
          ) : (
            <div style={{textAlign:"center",padding:"44px 20px"}}>
              <div style={{fontSize:48,marginBottom:10,filter:"grayscale(1)",opacity:.3}}>🍽️</div>
              <p style={{margin:0,fontSize:14,color:C.muted}}>Nessun pasto ancora</p>
              <p style={{margin:"5px 0 0",fontSize:12,color:C.dim}}>Scrivi o scatta una foto del tuo pasto</p>
            </div>
          )}
        </>}

        {tab==="storico" && <>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
            <span style={{fontSize:11,color:C.muted,textTransform:"uppercase",letterSpacing:".1em"}}>Ultimi 7 giorni</span>
            {streak>0 && <span style={{fontSize:13,color:C.amber,fontWeight:700}}>🔥 Streak: {streak}gg</span>}
          </div>
          {histDays.length===0 ? (
            <div style={{textAlign:"center",padding:"50px"}}>
              <div style={{fontSize:40,marginBottom:10,opacity:.3}}>📅</div>
              <p style={{color:C.muted}}>Nessuno storico disponibile</p>
            </div>
          ) : histDays.map(([d,ms])=>{
            const dc=ms.reduce((s,m)=>s+safeNum(m.calories),0);
            const dp=ms.reduce((s,m)=>s+safeNum(m.protein),0);
            const dcarb=ms.reduce((s,m)=>s+safeNum(m.carbs),0);
            const df=ms.reduce((s,m)=>s+safeNum(m.fat),0);
            const pct=safePct(dc,kcalGoal), over=dc>kcalGoal;
            const col=over?C.red:pct>.88?C.amber:C.teal;
            const lbl=new Date(d).toLocaleDateString("it-IT",{weekday:"short",day:"numeric",month:"short"});
            return (
              <div key={d} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:16,padding:"16px 18px",marginBottom:8}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                  <span style={{fontSize:13,color:C.muted,textTransform:"capitalize"}}>{lbl}</span>
                  <span style={{color:col,fontSize:15,fontWeight:800,fontFamily:"'DM Mono',monospace"}}>{dc} <span style={{fontSize:11,fontWeight:400,color:C.muted}}>kcal</span></span>
                </div>
                <div style={{background:C.dim,borderRadius:6,height:5,overflow:"hidden",marginBottom:10}}>
                  <div style={{width:`${pct*100}%`,height:"100%",background:col,borderRadius:6}}/>
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:5}}>
                  {[["🥩 P",dp,macros.p,C.teal],["🍞 C",dcarb,macros.c,C.purple],["🥑 G",df,macros.f,C.pink]].map(([lb,val,goal,c])=>(
                    <div key={lb} style={{display:"flex",alignItems:"center",gap:8}}>
                      <span style={{fontSize:11,color:C.muted,width:32}}>{lb}</span>
                      <div style={{flex:1,background:C.dim,borderRadius:4,height:4,overflow:"hidden"}}>
                        <div style={{width:`${safePct(val,goal)*100}%`,height:"100%",background:c,borderRadius:4}}/>
                      </div>
                      <span style={{fontSize:11,color:c,fontFamily:"'DM Mono',monospace",width:48,textAlign:"right"}}>{val}g</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </>}
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500;700&family=Inter:wght@400;500;700;800&display=swap');
        *{box-sizing:border-box;-webkit-font-smoothing:antialiased;}
        ::-webkit-scrollbar{width:4px;}
        ::-webkit-scrollbar-track{background:${C.bg};}
        ::-webkit-scrollbar-thumb{background:${C.dim};border-radius:4px;}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes fadeIn{from{opacity:0;transform:translateX(-50%) translateY(-8px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}
      `}</style>
    </div>
  );
          }
                                                                                                                                                         
