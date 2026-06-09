'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Cookies from 'js-cookie'
import { createDigiser } from '@/lib/api'

const QUESTIONS = [
  { q:'Estás en un bosque desconocido. ¿Qué haces primero?', opts:[{t:'Exploro metódicamente cada rincón',s:{forest:2}},{t:'Busco agua o un río',s:{sea:2}},{t:'Escalo lo más alto posible',s:{volcano:2}},{t:'Me siento y observo en silencio',s:{void:2}}] },
  { q:'Un extraño te pide ayuda sin explicar por qué. ¿Qué haces?', opts:[{t:'Le ayudo sin dudarlo',s:{forest:2}},{t:'Le ayudo pero lo observo con cuidado',s:{sea:1,forest:1}},{t:'Le ignoro y sigo mi camino',s:{void:2}},{t:'Le pregunto qué quiere primero',s:{forest:1,sea:1}}] },
  { q:'¿Qué tipo de poder te atrae más?', opts:[{t:'La sabiduría y el conocimiento',s:{forest:2}},{t:'La velocidad y la adaptación',s:{sea:2}},{t:'La fuerza bruta y el fuego',s:{volcano:2}},{t:'La oscuridad y el misterio',s:{void:2}}] },
  { q:'Tu mejor amigo te traiciona. ¿Primera reacción?', opts:[{t:'Dolor. Necesito entender por qué.',s:{forest:2}},{t:'Tristeza, pero lo perdono con el tiempo.',s:{sea:2}},{t:'Rabia. Jamás lo perdonaré.',s:{volcano:2}},{t:'Nada. Sabía que eventualmente pasaría.',s:{void:2}}] },
  { q:'¿Cómo describes tu relación con las reglas?', opts:[{t:'Las respeto — existen por algo.',s:{forest:2}},{t:'Las sigo si tienen sentido.',s:{sea:2}},{t:'Las desafío cuando me limitan.',s:{volcano:2}},{t:'Ignoro las ajenas. Solo mis propias leyes.',s:{void:2}}] },
  { q:'Es medianoche. ¿Dónde estás idealmente?', opts:[{t:'En casa, con mi familia.',s:{forest:2}},{t:'Caminando solo bajo la lluvia.',s:{sea:2}},{t:'En una fiesta, soy la energía del lugar.',s:{volcano:2}},{t:'Solo en la oscuridad, pensando.',s:{void:2}}] },
  { q:'Si fueras un elemento, ¿cuál serías?', opts:[{t:'Tierra — estable, nutritiva, protectora.',s:{forest:3}},{t:'Agua — fluida, profunda, cambiante.',s:{sea:3}},{t:'Fuego — intenso, destructor y creador.',s:{volcano:3}},{t:'Vacío — sin forma, todo lo absorbe.',s:{void:3}}] },
  { q:'Yggmon te ofrece un don. ¿Qué eliges?', opts:[{t:'Vida larga para proteger a los demás.',s:{forest:2}},{t:'Capacidad de entender cualquier ser.',s:{sea:2}},{t:'Poder para nunca ser vencido.',s:{volcano:2}},{t:'Conocer la verdad detrás de todo.',s:{void:2}}] },
  { q:'¿Cómo reaccionas ante lo desconocido?', opts:[{t:'Con cautela y curiosidad genuina.',s:{forest:1,sea:1}},{t:'Con entusiasmo, me lanzo a explorarlo.',s:{sea:2}},{t:'Con desconfianza, me preparo primero.',s:{volcano:2}},{t:'Con indiferencia, todo se revela eventualmente.',s:{void:2}}] },
  { q:'Al final de tu vida, ¿qué quieres que recuerden?', opts:[{t:'Mi lealtad y amor hacia los que protegí.',s:{forest:3}},{t:'Mi adaptabilidad y sabiduría.',s:{sea:3}},{t:'Mi fuerza y el miedo que inspiré.',s:{volcano:3}},{t:'El misterio que nunca pudieron descifrar.',s:{void:3}}] },
]

const BIOME_RESULTS: Record<string,any> = {
  forest:{name:'Bosque Binario',emoji:'🌳',color:'#4CAF50',slug:'forest',desc:'Tierra de lealtad y crecimiento.',flav:'El Bosque Binario te llama. Eres un ser de vínculos profundos, protector por naturaleza. Sylvorn te recibirá como uno de los suyos.'},
  sea:   {name:'Mar de Bytes',emoji:'🌊',color:'#2196F3',slug:'sea',desc:'Aguas de curiosidad y adaptación.',flav:'El Mar de Bytes es tu hogar. Tu espíritu fluye donde otros se rompen. Tidalux reconoce en ti un alma verdaderamente libre.'},
  volcano:{name:'Volcán del Kernel',emoji:'🌋',color:'#FF5722',slug:'volcano',desc:'Fuego de pasión y poder bruto.',flav:'El Volcán del Kernel te reclama. Tienes el fuego por dentro. Pyrathos forjará algo poderoso de ti.'},
  void:  {name:'Vacío Null',emoji:'🌑',color:'#9C27B0',slug:'void',desc:'Oscuridad de misterio y verdad cruda.',flav:'El Vacío Null te absorbe. Tu mente ve más allá de las ilusiones. Nulliax te esperaba.'},
}

type Screen = 'welcome'|'name'|'test'|'result'

export default function WelcomePage() {
  const router = useRouter()
  const [screen, setScreen] = useState<Screen>('welcome')
  const [digiName, setDigiName] = useState('')
  const [nameErr, setNameErr] = useState('')
  const [qIdx, setQIdx] = useState(0)
  const [scores, setScores] = useState({forest:0,sea:0,volcano:0,void:0})
  const [selOpt, setSelOpt] = useState<number|null>(null)
  const [result, setResult] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  function answerQ(i: number) {
    setSelOpt(i)
    const opt = QUESTIONS[qIdx].opts[i]
    const ns = {...scores}
    Object.entries(opt.s).forEach(([k,v])=>{ (ns as any)[k]+=(v as number) })
    setTimeout(()=>{
      setSelOpt(null)
      if(qIdx+1 >= QUESTIONS.length) {
        const biome = Object.entries(ns).sort((a,b)=>b[1]-a[1])[0][0]
        setResult(BIOME_RESULTS[biome])
        setScreen('result')
      } else {
        setScores(ns); setQIdx(qIdx+1)
      }
    },380)
  }

  async function handleEnter() {
    setLoading(true)
    try {
      await createDigiser(digiName, result.slug)
      router.push('/world')
    } catch(e:any) {
      alert(e?.response?.data?.detail || 'Error al crear tu digisér')
    } finally { setLoading(false) }
  }

  const S: React.CSSProperties = {minHeight:'100vh',background:'#0A0A0F',display:'flex',alignItems:'center',justifyContent:'center',padding:'24px'}
  const C: React.CSSProperties = {background:'#0F0F18',border:'1px solid rgba(201,168,76,0.25)',borderRadius:'12px',padding:'28px 32px',width:'100%',maxWidth:'460px',textAlign:'center'}

  if(screen==='welcome') return (
    <div style={S}><div style={C}>
      <div style={{fontSize:'44px',marginBottom:'14px',animation:'breathe 3s ease-in-out infinite'}}>⊕</div>
      <div style={{fontFamily:'"Cinzel Decorative",serif',fontSize:'15px',color:'#C9A84C',marginBottom:'8px'}}>El Digital World</div>
      <p style={{fontSize:'14px',color:'#D4C5A9',lineHeight:1.65,fontStyle:'italic',marginBottom:'20px'}}>
        Bienvenido, viajero. El mundo digital existe más allá de esta puerta. Criaturas de datos viven, evolucionan y mueren en sus tierras. ¿Deseas formar parte de este mundo?
      </p>
      <Btn onClick={()=>setScreen('name')}>Sí, quiero entrar</Btn>
      <GhostBtn onClick={()=>router.push('/login')} style={{marginTop:'8px'}}>No por ahora</GhostBtn>
      <style>{`@keyframes breathe{0%,100%{transform:scale(1)}50%{transform:scale(1.05)}}`}</style>
    </div></div>
  )

  if(screen==='name') return (
    <div style={S}><div style={C}>
      <div style={{fontFamily:'"Cinzel Decorative",serif',fontSize:'15px',color:'#C9A84C',marginBottom:'6px'}}>Tu Digisér</div>
      <div style={{fontFamily:'Cinzel,serif',fontSize:'9px',letterSpacing:'0.2em',color:'#7A6E5A',marginBottom:'18px'}}>DALE UN NOMBRE A TU COMPAÑERO</div>
      <p style={{fontSize:'13px',color:'#7A6E5A',fontStyle:'italic',marginBottom:'16px'}}>Este ser nacerá como huevo. Su destino dependerá de su espíritu.</p>
      <div style={{textAlign:'left',marginBottom:'12px'}}>
        <label style={{fontFamily:'Cinzel,serif',fontSize:'10px',letterSpacing:'0.14em',color:'#7A6E5A',display:'block',marginBottom:'5px',textTransform:'uppercase'}}>Nombre del digisér</label>
        <input value={digiName} onChange={e=>setDigiName(e.target.value)} placeholder="Ej: Shadowveil, Luminos..." maxLength={20}
          style={{width:'100%',background:'rgba(255,255,255,0.04)',border:'1px solid rgba(201,168,76,0.18)',borderRadius:'5px',padding:'9px 12px',color:'#F0E6CC',fontFamily:'"Crimson Pro",serif',fontSize:'14px',outline:'none'}}/>
        {nameErr && <p style={{fontSize:'11px',color:'#F44336',marginTop:'4px'}}>{nameErr}</p>}
      </div>
      <Btn onClick={()=>{
        if(digiName.trim().length<2){setNameErr('Mínimo 2 caracteres');return}
        setNameErr('');setScreen('test')
      }}>Continuar al test</Btn>
    </div></div>
  )

  if(screen==='test') {
    const q = QUESTIONS[qIdx]
    return (
      <div style={S}><div style={{...C,maxWidth:'500px'}}>
        <div style={{display:'flex',gap:'4px',marginBottom:'12px'}}>
          {QUESTIONS.map((_,i)=>(
            <div key={i} style={{flex:1,height:'3px',borderRadius:'2px',background:i<qIdx?'#C9A84C':i===qIdx?'rgba(201,168,76,0.45)':'rgba(255,255,255,0.08)'}}/>
          ))}
        </div>
        <div style={{fontFamily:'Cinzel,serif',fontSize:'10px',color:'#7A6E5A',textAlign:'right',marginBottom:'12px',letterSpacing:'0.1em'}}>{qIdx+1} / {QUESTIONS.length}</div>
        <p style={{fontSize:'15px',color:'#F0E6CC',lineHeight:1.65,fontStyle:'italic',marginBottom:'18px',textAlign:'left'}}>{q.q}</p>
        <div style={{display:'flex',flexDirection:'column',gap:'8px'}}>
          {q.opts.map((o,i)=>(
            <button key={i} onClick={()=>answerQ(i)} style={{padding:'10px 14px',border:`1px solid ${selOpt===i?'#C9A84C':'rgba(201,168,76,0.14)'}`,borderRadius:'6px',background:selOpt===i?'rgba(201,168,76,0.12)':'rgba(255,255,255,0.02)',cursor:'pointer',fontSize:'13px',color:selOpt===i?'#E8C97A':'#D4C5A9',textAlign:'left',transition:'all 0.2s'}}>
              {o.t}
            </button>
          ))}
        </div>
      </div></div>
    )
  }

  if(screen==='result' && result) return (
    <div style={S}><div style={C}>
      <div style={{fontSize:'40px',marginBottom:'12px'}}>{result.emoji}</div>
      <div style={{fontFamily:'"Cinzel Decorative",serif',fontSize:'13px',color:'#C9A84C',marginBottom:'8px'}}>{result.name}</div>
      <div style={{border:`1px solid ${result.color}44`,borderRadius:'8px',padding:'14px',marginBottom:'14px',background:`${result.color}08`}}>
        <div style={{fontFamily:'Cinzel,serif',fontSize:'15px',color:result.color,marginBottom:'4px'}}>{result.name}</div>
        <div style={{fontSize:'13px',color:'#7A6E5A',fontStyle:'italic'}}>{result.desc}</div>
      </div>
      <p style={{fontSize:'13px',color:'#7A6E5A',fontStyle:'italic',lineHeight:1.6,marginBottom:'16px'}}>{result.flav}</p>
      <Btn onClick={handleEnter} disabled={loading}>{loading?'Entrando...':'Entrar como '+digiName}</Btn>
    </div></div>
  )

  return null
}

function Btn({children,onClick,disabled}:any){
  return <button onClick={onClick} disabled={disabled} style={{width:'100%',padding:'10px',borderRadius:'5px',fontFamily:'Cinzel,serif',fontSize:'11px',letterSpacing:'0.12em',cursor:'pointer',background:'rgba(201,168,76,0.12)',border:'1px solid rgba(201,168,76,0.38)',color:'#C9A84C',marginTop:'6px'}}>{children}</button>
}
function GhostBtn({children,onClick,style}:any){
  return <button onClick={onClick} style={{width:'100%',padding:'9px',borderRadius:'5px',fontFamily:'Cinzel,serif',fontSize:'10px',cursor:'pointer',background:'transparent',border:'1px solid rgba(255,255,255,0.1)',color:'#7A6E5A',...style}}>{children}</button>
}
