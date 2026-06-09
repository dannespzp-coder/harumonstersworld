'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Cookies from 'js-cookie'
import API, { worldInfo, getDigiseres, getYggmonLog, getUsuarios, getEventos, divineAction, logout, worldDay, getSprite } from '@/lib/api'

const STAGE_NAMES  = ['Huevo','Child','Adult','Perfect','Mega']
const STAGE_COLORS = ['#C9A84C','#4CAF50','#2196F3','#9C27B0','#FF5722']

// Límites de zona en mapa 800x600
const ZONE_BOUNDS: Record<string,[number,number,number,number]> = {
  forest:  [20, 20, 370, 280],
  sea:     [430,20, 780, 280],
  volcano: [20, 320,370, 580],
  void:    [430,320,780, 580],
}

function posToCanvas(px: number, py: number, bioma: string): [number,number] {
  const b = ZONE_BOUNDS[bioma]
  if(!b) return [400,300]
  const [x1,y1,x2,y2]=b, pad=35
  return [
    Math.round(x1+pad+(px/100)*(x2-x1-pad*2)),
    Math.round(y1+pad+(py/100)*(y2-y1-pad*2))
  ]
}

function stColor(s:string){ return s==='combat'?'#F44336':s==='resting'?'#FF9800':s==='egg'?'#C9A84C':'#4CAF50' }
function alignColor(a:string){
  if(!a)return'#888'
  if(a.includes('Good'))return'#4CAF50'
  if(a.includes('Evil'))return'#F44336'
  if(a.includes('Lawful'))return'#2196F3'
  if(a.includes('Chaotic'))return'#9C27B0'
  return'#9E9E9E'
}

export default function WorldPage(){
  const router=useRouter()
  const [user,setUser]=useState<any>(null)
  const [world,setWorld]=useState<any>(null)
  const [digis,setDigis]=useState<any[]>([])
  const [selDigi,setSelDigi]=useState<any>(null)
  const [sprites,setSprites]=useState<Record<string,string>>({})
  const [events,setEvents]=useState<any[]>([])
  const [yggLog,setYggLog]=useState<any[]>([])
  const [users,setUsers]=useState<any[]>([])
  const [overlay,setOverlay]=useState<string|null>(null)
  const [paused,setPaused]=useState(false)
  const [notifMsg,setNotifMsg]=useState('')
  const [notifOn,setNotifOn]=useState(false)
  const [editMode,setEditMode]=useState(false)
  const [editVals,setEditVals]=useState<any>({})
  const [fusionSel,setFusionSel]=useState<any[]>([])
  const [dragDigi,setDragDigi]=useState<any>(null)
  const [evPanelH,setEvPanelH]=useState(220)
  const resizeRef=useRef<boolean>(false)
  const svgRef=useRef<SVGSVGElement>(null)

  const isGod=user?.role==='god'||user?.role==='demigod'

  function notify(msg:string){setNotifMsg(msg);setNotifOn(true);setTimeout(()=>setNotifOn(false),3000)}

  async function loadSprites(list:any[]){
    for(const d of list){
      if(sprites[d.id])continue
      const url=await getSprite(d.api_species||'Botamon',d.sprite_url)
      if(url)setSprites(p=>({...p,[d.id]:url}))
    }
  }

  const loadWorld=useCallback(async()=>{
    try{
      const[wInfo,digiList,evList]=await Promise.all([worldInfo(),getDigiseres(),getEventos()])
      setWorld(wInfo);setDigis(digiList);setEvents(evList)
      loadSprites(digiList)
    }catch{}
  },[])

  useEffect(()=>{
    const raw=Cookies.get('hmw_user')
    if(!raw){router.push('/login');return}
    setUser(JSON.parse(raw))
    loadWorld()
    const iv=setInterval(()=>loadWorld(),10000)
    return()=>clearInterval(iv)
  },[])

  useEffect(()=>{
    if(selDigi){
      const updated=digis.find(d=>d.id===selDigi.id)
      if(updated)setSelDigi(updated)
    }
  },[digis])

  async function handleDivine(tipo:string,digiId?:string){
    const id=digiId||selDigi?.id
    if(!id)return
    try{const r=await divineAction(tipo,id);notify(r.desc||'Acción ejecutada');loadWorld()}
    catch(e:any){notify(e?.response?.data?.detail||'Error')}
  }

  async function handleUpdate(){
    if(!selDigi||!isGod)return
    try{await API.patch(`/digiseres/${selDigi.id}`,editVals);notify('Cambios guardados');setEditMode(false);loadWorld()}
    catch(e:any){notify(e?.response?.data?.detail||'Error')}
  }

  async function handleLogout(){
    await logout().catch(()=>{})
    Cookies.remove('hmw_token');Cookies.remove('hmw_user');router.push('/login')
  }

  async function togglePause(){
    try{
      const r=await API.post('/world/pause',{paused:!paused})
      setPaused(!paused)
      notify(!paused?'Mundo pausado — el tiempo se detiene':'Mundo reanudado')
    }catch(e:any){notify('Error al pausar')}
  }

  async function openUsers(){
    if(!isGod)return
    try{const u=await getUsuarios();setUsers(u)}catch{}
    setOverlay('users')
  }

  async function openYgg(){
    try{const y=await getYggmonLog();setYggLog(y)}catch{}
    setOverlay('ygg')
  }

  async function resetWorld(){
    if(!isGod)return
    if(!confirm('¿Reiniciar el mundo al Día 1?'))return
    try{await API.post('/world/reset');notify('Nueva era comienza.');loadWorld()}
    catch(e:any){notify(e?.response?.data?.detail||'Error al reiniciar')}
  }

  async function initFusion(tipo:'temporal'|'permanente'='temporal'){
    if(fusionSel.length<2){notify('Selecciona 2 digiseres');return}
    try{
      const r=await API.post('/fusion',{ser_a:fusionSel[0].id,ser_b:fusionSel[1].id,tipo})
      notify(`Fusión: ${r.data.nombre} nació`)
      setFusionSel([]);loadWorld()
    }catch(e:any){notify(e?.response?.data?.detail||'Error')}
  }

  function toggleFusionSel(d:any){
    setFusionSel(prev=>{
      if(prev.find(x=>x.id===d.id))return prev.filter(x=>x.id!==d.id)
      if(prev.length>=2)return[prev[1],d]
      return[...prev,d]
    })
  }

  function onDragFusion(a:any,b:any){
    setFusionSel([a,b])
    notify(`${a.nombre} + ${b.nombre} — Click ⚗ para fusionar`)
  }

  if(!user)return(
    <div style={{minHeight:'100vh',background:'#0A0A0F',display:'flex',alignItems:'center',justifyContent:'center',color:'#C9A84C',fontFamily:'"Cinzel Decorative",serif'}}>
      Cargando...
    </div>
  )

  const myDigi=digis.find(d=>d.tamer_id===user.id)

  return(
    <div style={{display:'flex',flexDirection:'column',height:'100vh',background:'#0A0A0F',overflow:'hidden'}}>

      {/* TOPBAR */}
      <div style={{height:'46px',background:'#0F0F18',borderBottom:'1px solid rgba(201,168,76,0.14)',display:'flex',alignItems:'center',padding:'0 10px',gap:'8px',flexShrink:0,overflowX:'auto'}}>
        <div style={{fontFamily:'"Cinzel Decorative",serif',fontSize:'10px',color:'#C9A84C',whiteSpace:'nowrap',lineHeight:1}}>
          HMW<small style={{color:'#7A6E5A',fontSize:'7px',fontFamily:'Cinzel,serif',display:'block',letterSpacing:'0.15em'}}>{user.role==='god'?'Dios':user.role==='demigod'?'Semidios':'Habitante'}</small>
        </div>
        <Div/><TS v={String(world?.seres||digis.length)} l="Seres"/>
        <Div/><TS v={`Día ${world?.day||worldDay()}`} l="Era"/>
        <Div/><TS v={String(events.length)} l="Eventos"/>
        {isGod&&<><Div/>
          <TB color="#C9A84C" onClick={openYgg} style={{display:'flex',alignItems:'center',gap:'4px'}}>
            <span style={{width:'5px',height:'5px',borderRadius:'50%',background:'#C9A84C',animation:'pg 2s ease-in-out infinite'}}/>Ygg
          </TB>
          <TB onClick={togglePause} color={paused?'#FF9800':'#7A6E5A'}>{paused?'▶':'⏸'}</TB>
          <TB color="#C9A84C" onClick={openUsers}>👥</TB>
          <TB color="#F44336" onClick={resetWorld}>🔄</TB>
        </>}
        {fusionSel.length>0&&isGod&&(
          <>
            <TB color="#9C27B0" onClick={()=>initFusion('temporal')}>⚗ Fusión temp ({fusionSel.length}/2)</TB>
            <TB color="#CE93D8" onClick={()=>initFusion('permanente')}>⚗ Fusión perm</TB>
            <TB color="#7A6E5A" onClick={()=>setFusionSel([])}>✕</TB>
          </>
        )}
        <div style={{marginLeft:'auto',display:'flex',alignItems:'center',gap:'5px',padding:'2px 8px',border:'1px solid rgba(201,168,76,0.15)',borderRadius:'20px',background:'rgba(201,168,76,0.04)',flexShrink:0}}>
          <span style={{width:'5px',height:'5px',borderRadius:'50%',background:user.role==='god'?'#C9A84C':user.role==='demigod'?'#CE93D8':'#4CAF50'}}/>
          <span style={{fontFamily:'Cinzel,serif',fontSize:'9px',color:'#C9A84C'}}>{user.username}</span>
        </div>
        <button onClick={handleLogout} style={{fontSize:'9px',color:'#7A6E5A',cursor:'pointer',padding:'2px 6px',border:'1px solid rgba(255,255,255,0.08)',borderRadius:'3px',background:'none',flexShrink:0}}>Salir</button>
      </div>

      {/* MAIN — sidebar izquierda + mapa + ficha */}
      <div style={{display:'grid',gridTemplateColumns:'170px 1fr 295px',flex:1,overflow:'hidden'}}>

        {/* LEFT */}
        <div style={{background:'#0F0F18',borderRight:'1px solid rgba(201,168,76,0.1)',overflowY:'auto',padding:'8px 0',display:'flex',flexDirection:'column'}}>
          <PT>Biomas</PT>
          {[
            {slug:'forest',name:'Bosque Binario',color:'#4CAF50',guardian:'Sylvorn'},
            {slug:'sea',name:'Mar de Bytes',color:'#2196F3',guardian:'Tidalux'},
            {slug:'volcano',name:'Volcán del Kernel',color:'#FF5722',guardian:'Pyrathos'},
            {slug:'void',name:'Vacío Null',color:'#9C27B0',guardian:'Nulliax'},
          ].map(b=>(
            <div key={b.slug} style={{padding:'5px 10px',cursor:'default',display:'flex',alignItems:'center',gap:'7px'}}>
              <div style={{width:'7px',height:'7px',borderRadius:'50%',background:b.color,flexShrink:0}}/>
              <div>
                <div style={{fontFamily:'Cinzel,serif',fontSize:'9px',color:'#F0E6CC'}}>{b.name}</div>
                <div style={{fontSize:'8px',color:'#7A6E5A'}}>{digis.filter(d=>d.bioma_slug===b.slug).length} seres · {b.guardian}</div>
              </div>
            </div>
          ))}

          <div style={{height:'1px',background:'rgba(201,168,76,0.08)',margin:'6px 10px'}}/>
          <PT>Eventos en vivo</PT>

          {/* Panel de eventos redimensionable */}
          <div style={{flex:1,overflowY:'auto',padding:'0 8px',minHeight:'120px'}}>
            {events.slice(0,20).map((e,i)=>(
              <div key={i} style={{padding:'4px 0',borderBottom:'1px solid rgba(255,255,255,0.04)',fontSize:'11px',lineHeight:1.4}}>
                <div style={{color:'#7A6E5A',fontSize:'9px'}}>{new Date(e.created_at).toLocaleTimeString()}</div>
                <div style={{color:'#D4C5A9',marginTop:'1px'}}>
                  <em style={{color:'#8B6E2E',fontStyle:'italic'}}>{e.digi_nombre}</em>
                  <span style={{color:'#7A6E5A'}}> — </span>
                  {e.descripcion?.slice(0,60)}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* CENTER — MAPA SVG */}
        <div style={{position:'relative',background:'#050810',overflow:'hidden'}}>
          <SVGMap
            digis={digis}
            sprites={sprites}
            selectedId={selDigi?.id||null}
            onSelect={setSelDigi}
            fusionSel={fusionSel}
            onDragFusion={onDragFusion}
            dragDigi={dragDigi}
            setDragDigi={setDragDigi}
          />

          {/* Notif */}
          {notifOn&&<div style={{position:'absolute',top:'8px',left:'50%',transform:'translateX(-50%)',background:'rgba(10,10,15,0.93)',border:'1px solid #8B6E2E',borderRadius:'4px',padding:'5px 14px',fontFamily:'Cinzel,serif',fontSize:'10px',color:'#C9A84C',letterSpacing:'0.08em',zIndex:50,whiteSpace:'nowrap',pointerEvents:'none'}}>{notifMsg}</div>}

          {/* OVERLAYS */}
          {overlay&&(
            <div style={{position:'absolute',inset:0,zIndex:30,display:'flex',flexDirection:'column'}}>
              <div style={{position:'absolute',inset:0,background:'rgba(5,5,10,0.97)'}}/>
              <div style={{position:'relative',zIndex:1,flex:1,overflowY:'auto',padding:'14px'}}>
                <div style={{fontFamily:'Cinzel,serif',fontSize:'12px',color:'#C9A84C',marginBottom:'10px',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                  <span>{overlay==='ygg'?'⊕ Yggmon · Registro':overlay==='users'?'👥 Usuarios':''}</span>
                  <span onClick={()=>setOverlay(null)} style={{cursor:'pointer',color:'#7A6E5A',fontSize:'16px'}}>✕</span>
                </div>
                {overlay==='ygg'&&yggLog.map((l,i)=>(
                  <div key={i} style={{padding:'6px 0',borderBottom:'1px solid rgba(201,168,76,0.08)'}}>
                    <div style={{fontFamily:'Cinzel,serif',fontSize:'8px',letterSpacing:'0.12em',color:l.tipo==='GRAN_REINICIO'?'#F44336':l.tipo==='EQUILIBRIO'?'#FF9800':'#C9A84C',marginBottom:'2px'}}>{l.tipo}</div>
                    <div style={{fontSize:'11px',color:'#D4C5A9',fontStyle:'italic'}}>{l.descripcion}</div>
                    <div style={{fontSize:'8px',color:'#7A6E5A',marginTop:'1px'}}>Día {l.dia_mundo}</div>
                  </div>
                ))}
                {overlay==='users'&&(
                  <>
                    <div style={{display:'flex',gap:'8px',marginBottom:'12px'}}>
                      {[{v:users.filter(u=>u.online).length,l:'Online',c:'#4CAF50'},{v:users.filter(u=>!u.online).length,l:'Offline',c:'#F44336'},{v:users.length,l:'Total',c:'#C9A84C'}].map(s=>(
                        <div key={s.l} style={{flex:1,background:`${s.c}11`,border:`1px solid ${s.c}33`,borderRadius:'5px',padding:'8px',textAlign:'center'}}>
                          <div style={{fontFamily:'Cinzel,serif',fontSize:'16px',color:s.c}}>{s.v}</div>
                          <div style={{fontSize:'8px',color:'#7A6E5A',letterSpacing:'0.1em'}}>{s.l}</div>
                        </div>
                      ))}
                    </div>
                    {users.map((u,i)=>(
                      <div key={i} style={{display:'flex',alignItems:'center',gap:'8px',padding:'7px',border:'1px solid rgba(201,168,76,0.1)',borderRadius:'5px',marginBottom:'6px',background:'rgba(255,255,255,0.02)'}}>
                        <div style={{width:'7px',height:'7px',borderRadius:'50%',background:u.online?'#4CAF50':'#F44336',flexShrink:0}}/>
                        <div style={{width:'30px',height:'30px',borderRadius:'50%',background:'rgba(201,168,76,0.1)',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'Cinzel,serif',fontSize:'11px',color:'#C9A84C',flexShrink:0}}>{u.username[0].toUpperCase()}</div>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontFamily:'Cinzel,serif',fontSize:'10px',color:'#F0E6CC'}}>{u.username}</div>
                          <div style={{fontSize:'8px',color:'#7A6E5A'}}>{u.digi_nombre?`${u.digi_nombre}`:' Sin digisér'} · Día {u.joined_day}</div>
                        </div>
                        <span style={{fontSize:'7px',fontFamily:'Cinzel,serif',padding:'2px 5px',borderRadius:'8px',border:`1px solid ${u.role==='god'?'#C9A84C44':'#4CAF5044'}`,color:u.role==='god'?'#C9A84C':'#4CAF50',background:u.role==='god'?'#C9A84C11':'#4CAF5011'}}>
                          {u.role==='god'?'Dios':u.role==='demigod'?'Semidios':'Habitante'}
                        </span>
                        {isGod&&u.role==='user'&&(
                          <button onClick={async()=>{await API.post('/promote',{username:u.username});notify(`${u.username} ascendido`);openUsers()}} style={{fontSize:'7px',padding:'2px 5px',border:'1px solid #CE93D844',borderRadius:'3px',background:'#CE93D811',color:'#CE93D8',cursor:'pointer'}}>↑</button>
                        )}
                      </div>
                    ))}
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {/* RIGHT — FICHA */}
        <div style={{background:'#0F0F18',borderLeft:'1px solid rgba(201,168,76,0.1)',overflowY:'auto',display:'flex',flexDirection:'column'}}>
          {myDigi&&!selDigi&&(
            <div onClick={()=>setSelDigi(myDigi)} style={{padding:'7px 12px',background:'rgba(201,168,76,0.05)',borderBottom:'1px solid rgba(201,168,76,0.1)',cursor:'pointer',display:'flex',alignItems:'center',gap:'7px'}}>
              <div style={{width:'5px',height:'5px',borderRadius:'50%',background:'#C9A84C'}}/>
              <div>
                <div style={{fontFamily:'Cinzel,serif',fontSize:'7px',letterSpacing:'0.12em',color:'#C9A84C',textTransform:'uppercase'}}>Tu digisér</div>
                <div style={{fontSize:'11px',color:'#F0E6CC',fontStyle:'italic'}}>{myDigi.nombre}</div>
              </div>
            </div>
          )}
          {!selDigi?(
            <div style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'20px',textAlign:'center',gap:'8px',color:'#7A6E5A',fontStyle:'italic',fontSize:'11px'}}>
              <div style={{fontSize:'24px',opacity:0.13}}>⊕</div>
              <span>Haz click en un ser del mapa</span>
            </div>
          ):(
            <DigiPanel
              digi={selDigi}
              user={user}
              sprite={sprites[selDigi.id]}
              isGod={isGod}
              editMode={editMode}
              editVals={editVals}
              setEditVals={setEditVals}
              onDivine={handleDivine}
              onClose={()=>{setSelDigi(null);setEditMode(false)}}
              onEdit={()=>{
                setEditMode(true)
                setEditVals({nivel:selDigi.nivel,etapa:selDigi.etapa,hp:selDigi.hp,hp_max:selDigi.hp_max,fuerza:selDigi.fuerza,inteligencia:selDigi.inteligencia,velocidad:selDigi.velocidad,fe:selDigi.fe,caos:selDigi.caos,lealtad:selDigi.lealtad,agresion:selDigi.agresion,alineamiento:selDigi.alineamiento,genes_divinos:selDigi.genes_divinos,api_species:selDigi.api_species})
              }}
              onSave={handleUpdate}
              onCancelEdit={()=>setEditMode(false)}
              onFusionSelect={()=>isGod&&toggleFusionSel(selDigi)}
              inFusion={!!fusionSel.find(x=>x.id===selDigi.id)}
            />
          )}
        </div>
      </div>
      <style>{`@keyframes pg{0%,100%{box-shadow:0 0 0 0 rgba(201,168,76,0.5)}50%{box-shadow:0 0 0 4px rgba(201,168,76,0)}}`}</style>
    </div>
  )
}

// ── SVG MAP ──────────────────────────────────────────
function SVGMap({digis,sprites,selectedId,onSelect,fusionSel,onDragFusion,dragDigi,setDragDigi}:any){
  return(
    <svg viewBox="0 0 800 600" style={{width:'100%',height:'100%',display:'block'}} xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="fg" cx="50%" cy="50%" r="70%"><stop offset="0%" stopColor="#1a4a1a"/><stop offset="100%" stopColor="#071a07"/></radialGradient>
        <radialGradient id="sg" cx="50%" cy="50%" r="70%"><stop offset="0%" stopColor="#0a2a4a"/><stop offset="100%" stopColor="#030d16"/></radialGradient>
        <radialGradient id="vog" cx="50%" cy="50%" r="70%"><stop offset="0%" stopColor="#4a1a0a"/><stop offset="100%" stopColor="#1a0703"/></radialGradient>
        <radialGradient id="vdg" cx="50%" cy="50%" r="70%"><stop offset="0%" stopColor="#1a0a2e"/><stop offset="100%" stopColor="#07030d"/></radialGradient>
        <radialGradient id="ocean" cx="50%" cy="50%" r="100%"><stop offset="0%" stopColor="#050a14"/><stop offset="100%" stopColor="#020508"/></radialGradient>
        <filter id="gg"><feGaussianBlur stdDeviation="3" result="b"/><feComposite in="SourceGraphic" in2="b" operator="over"/></filter>
        <pattern id="tp" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse"><circle cx="10" cy="10" r="4" fill="#1d5c1d" opacity="0.35"/></pattern>
        <pattern id="wp" x="0" y="0" width="20" height="10" patternUnits="userSpaceOnUse"><path d="M0,5 Q5,0 10,5 Q15,10 20,5" fill="none" stroke="#0a3a5a" strokeWidth="1" opacity="0.4"/></pattern>
        <pattern id="lp" x="0" y="0" width="30" height="30" patternUnits="userSpaceOnUse"><path d="M0,15 Q7,5 15,15 Q22,25 30,15" fill="none" stroke="#8b2200" strokeWidth="1.5" opacity="0.3"/></pattern>
        <pattern id="vp" x="0" y="0" width="25" height="25" patternUnits="userSpaceOnUse"><circle cx="12" cy="12" r="2" fill="#4a1a6b" opacity="0.3"/><circle cx="0" cy="0" r="1" fill="#4a1a6b" opacity="0.2"/></pattern>
      </defs>

      {/* Fondo océano */}
      <rect width="800" height="600" fill="url(#ocean)"/>
      {[...Array(35)].map((_,i)=>(
        <circle key={i} cx={(i*173.5)%800} cy={(i*97.3)%600} r="0.8" fill="white" opacity="0.08"/>
      ))}

      {/* ZONA BOSQUE */}
      <rect x="20" y="20" width="350" height="260" rx="12" fill="url(#fg)" stroke="#2d6b2d" strokeWidth="1.5"/>
      <rect x="20" y="20" width="350" height="260" rx="12" fill="url(#tp)" opacity="0.6"/>
      <polygon points="50,280 90,210 130,280" fill="#1a3d1a" stroke="#2d6b2d" strokeWidth="1"/>
      <polygon points="280,280 315,215 350,280" fill="#1a3d1a" stroke="#2d6b2d" strokeWidth="1"/>
      <circle cx="180" cy="75" r="22" fill="#1d5c1d" opacity="0.75"/><circle cx="180" cy="60" r="15" fill="#246624" opacity="0.8"/><rect x="177" y="82" width="6" height="14" fill="#4a3000" opacity="0.6"/>
      <circle cx="280" cy="95" r="18" fill="#1d5c1d" opacity="0.65"/><circle cx="280" cy="82" r="12" fill="#246624" opacity="0.7"/>
      <circle cx="75" cy="135" r="15" fill="#1d5c1d" opacity="0.6"/><circle cx="75" cy="124" r="10" fill="#246624" opacity="0.7"/>
      <path d="M110,20 Q148,85 125,165 Q112,205 132,260" fill="none" stroke="#1a6688" strokeWidth="4" opacity="0.5"/>
      <path d="M110,20 Q148,85 125,165 Q112,205 132,260" fill="none" stroke="#2a88aa" strokeWidth="2" opacity="0.35"/>
      <text x="195" y="244" fontFamily="Cinzel, serif" fontSize="10" fill="#4CAF50" opacity="0.8" textAnchor="middle">BOSQUE BINARIO</text>
      <text x="195" y="257" fontFamily="Cinzel, serif" fontSize="7" fill="#4CAF50" opacity="0.5" textAnchor="middle">Sylvorn el Ancestral</text>

      {/* ZONA MAR */}
      <rect x="430" y="20" width="350" height="260" rx="12" fill="url(#sg)" stroke="#1a4a7a" strokeWidth="1.5"/>
      <rect x="430" y="20" width="350" height="260" rx="12" fill="url(#wp)" opacity="0.7"/>
      <path d="M430,75 Q490,55 550,75 Q610,95 670,75 Q730,55 780,75" fill="none" stroke="#1a6699" strokeWidth="2" opacity="0.4"/>
      <path d="M430,115 Q490,95 550,115 Q610,135 670,115 Q730,95 780,115" fill="none" stroke="#1a6699" strokeWidth="1.5" opacity="0.3"/>
      <path d="M430,155 Q490,135 550,155 Q610,175 670,155 Q730,135 780,155" fill="none" stroke="#1a6699" strokeWidth="1" opacity="0.25"/>
      <ellipse cx="505" cy="195" rx="28" ry="18" fill="#0a2a0a" opacity="0.7"/>
      <ellipse cx="700" cy="145" rx="22" ry="14" fill="#0a2a0a" opacity="0.6"/>
      <polygon points="545,280 575,235 605,280" fill="#0a1e3a" stroke="#1a4a7a" strokeWidth="1" opacity="0.8"/>
      <polygon points="645,280 670,242 695,280" fill="#0a1e3a" stroke="#1a4a7a" strokeWidth="1" opacity="0.7"/>
      <circle cx="475" cy="95" r="14" fill="none" stroke="#0a5588" strokeWidth="2" opacity="0.4"/>
      <circle cx="475" cy="95" r="8" fill="none" stroke="#0a5588" strokeWidth="1.5" opacity="0.3"/>
      <text x="605" y="244" fontFamily="Cinzel, serif" fontSize="10" fill="#2196F3" opacity="0.8" textAnchor="middle">MAR DE BYTES</text>
      <text x="605" y="257" fontFamily="Cinzel, serif" fontSize="7" fill="#2196F3" opacity="0.5" textAnchor="middle">Tidalux la Eterna</text>

      {/* ZONA VOLCÁN */}
      <rect x="20" y="320" width="350" height="260" rx="12" fill="url(#vog)" stroke="#7a2a0a" strokeWidth="1.5"/>
      <rect x="20" y="320" width="350" height="260" rx="12" fill="url(#lp)" opacity="0.7"/>
      <polygon points="195,330 258,465 132,465" fill="#3a1500" stroke="#7a2a0a" strokeWidth="1.5"/>
      <polygon points="195,330 228,398 162,398" fill="#5a2000" opacity="0.8"/>
      <path d="M195,342 Q210,378 218,418 Q224,438 214,465" fill="none" stroke="#cc4400" strokeWidth="4" opacity="0.7"/>
      <path d="M195,342 Q180,382 176,418 Q170,442 178,465" fill="none" stroke="#cc4400" strokeWidth="3" opacity="0.5"/>
      <circle cx="195" cy="335" r="11" fill="#ff6600" opacity="0.65"/>
      <circle cx="195" cy="330" r="6" fill="#ffaa00" opacity="0.75"/>
      <polygon points="55,580 85,525 115,580" fill="#2a1000" stroke="#7a2a0a" strokeWidth="1" opacity="0.8"/>
      <polygon points="295,580 325,530 355,580" fill="#2a1000" stroke="#7a2a0a" strokeWidth="1" opacity="0.7"/>
      <path d="M238,418 Q288,438 355,448" fill="none" stroke="#cc4400" strokeWidth="3" opacity="0.5"/>
      <path d="M152,438 Q102,458 25,452" fill="none" stroke="#cc4400" strokeWidth="2" opacity="0.4"/>
      <text x="195" y="548" fontFamily="Cinzel, serif" fontSize="10" fill="#FF5722" opacity="0.8" textAnchor="middle">VOLCÁN DEL KERNEL</text>
      <text x="195" y="561" fontFamily="Cinzel, serif" fontSize="7" fill="#FF5722" opacity="0.5" textAnchor="middle">Pyrathos el Furioso</text>

      {/* ZONA VACÍO */}
      <rect x="430" y="320" width="350" height="260" rx="12" fill="url(#vdg)" stroke="#4a1a6b" strokeWidth="1.5"/>
      <rect x="430" y="320" width="350" height="260" rx="12" fill="url(#vp)" opacity="0.8"/>
      <path d="M430,378 Q500,388 540,368 Q580,348 620,378 Q660,398 700,378 Q740,358 780,368" fill="none" stroke="#6b1a9b" strokeWidth="2" opacity="0.4"/>
      <path d="M430,428 Q480,448 530,428 Q580,408 640,438 Q700,458 780,438" fill="none" stroke="#6b1a9b" strokeWidth="1.5" opacity="0.3"/>
      <ellipse cx="528" cy="418" rx="26" ry="18" fill="#0a0014" stroke="#8b30cc" strokeWidth="2" opacity="0.8"/>
      <ellipse cx="528" cy="418" rx="16" ry="10" fill="#14003a" opacity="0.9"/>
      <ellipse cx="698" cy="375" rx="18" ry="12" fill="#0a0014" stroke="#8b30cc" strokeWidth="1.5" opacity="0.7"/>
      <polygon points="475,580 485,532 495,580" fill="#1a0a2e" stroke="#8b30cc" strokeWidth="1" opacity="0.8"/>
      <polygon points="678,580 693,522 708,580" fill="#1a0a2e" stroke="#8b30cc" strokeWidth="1" opacity="0.7"/>
      <polygon points="748,348 758,320 768,348" fill="#1a0a2e" stroke="#8b30cc" strokeWidth="1" opacity="0.6"/>
      <ellipse cx="605" cy="448" rx="95" ry="38" fill="#0a0020" opacity="0.3"/>
      <text x="605" y="548" fontFamily="Cinzel, serif" fontSize="10" fill="#9C27B0" opacity="0.8" textAnchor="middle">VACÍO NULL</text>
      <text x="605" y="561" fontFamily="Cinzel, serif" fontSize="7" fill="#9C27B0" opacity="0.5" textAnchor="middle">Nulliax el Corrupto</text>

      {/* RUTAS */}
      <rect x="372" y="128" width="56" height="18" rx="3" fill="#0a0f0a" stroke="rgba(201,168,76,0.25)" strokeWidth="1"/>
      <path d="M372,137 L428,137" stroke="#C9A84C" strokeWidth="1.5" strokeDasharray="3,3" opacity="0.5"/>
      <text x="400" y="134" fontFamily="Cinzel, serif" fontSize="6" fill="#C9A84C" opacity="0.6" textAnchor="middle">PASO N</text>

      <rect x="372" y="428" width="56" height="18" rx="3" fill="#0f0a0a" stroke="rgba(201,168,76,0.25)" strokeWidth="1"/>
      <path d="M372,437 L428,437" stroke="#C9A84C" strokeWidth="1.5" strokeDasharray="3,3" opacity="0.5"/>
      <text x="400" y="434" fontFamily="Cinzel, serif" fontSize="6" fill="#C9A84C" opacity="0.6" textAnchor="middle">GRIETA</text>

      <rect x="182" y="282" width="26" height="36" rx="3" fill="#0a0f0a" stroke="rgba(201,168,76,0.25)" strokeWidth="1"/>
      <path d="M195,282 L195,318" stroke="#C9A84C" strokeWidth="1.5" strokeDasharray="3,3" opacity="0.5"/>

      <rect x="592" y="282" width="26" height="36" rx="3" fill="#0a0a0f" stroke="rgba(201,168,76,0.25)" strokeWidth="1"/>
      <path d="M605,282 L605,318" stroke="#C9A84C" strokeWidth="1.5" strokeDasharray="3,3" opacity="0.5"/>

      {/* Centro Yggmon */}
      <circle cx="400" cy="300" r="16" fill="#0a0a0f" stroke="rgba(201,168,76,0.25)" strokeWidth="1"/>
      <text x="400" y="305" fontFamily="Cinzel Decorative, serif" fontSize="12" fill="#C9A84C" opacity="0.35" textAnchor="middle">⊕</text>

      {/* DIGISERES */}
      {digis.map((d:any)=>{
        const [cx,cy]=posToCanvas(d.pos_x,d.pos_y,d.bioma_slug)
        const isSel=selectedId===d.id
        const inFusion=fusionSel?.find((x:any)=>x.id===d.id)
        const imgUrl=sprites[d.id]
        const bc=d.es_guardian?(d.color_borde||'#FFD700'):isSel?'#C9A84C':inFusion?'#9C27B0':'rgba(201,168,76,0.25)'
        const glow=d.es_guardian?(d.color_borde||'#FFD700'):null
        return(
          <g key={d.id} style={{cursor:'pointer'}}
            onClick={()=>onSelect(d)}
            onMouseDown={()=>setDragDigi(d)}
            onMouseUp={()=>{
              if(dragDigi&&dragDigi.id!==d.id){onDragFusion(dragDigi,d)}
              setDragDigi(null)
            }}
          >
            {glow&&<circle cx={cx} cy={cy} r="25" fill="none" stroke={glow} strokeWidth="1.5" opacity="0.3" style={{filter:`drop-shadow(0 0 5px ${glow})`}}/>}
            {isSel&&<circle cx={cx} cy={cy} r="23" fill="none" stroke="#C9A84C" strokeWidth="2" opacity="0.8"/>}
            <rect x={cx-18} y={cy-18} width="36" height="36" rx="6"
              fill="rgba(10,10,15,0.85)"
              stroke={bc}
              strokeWidth={d.es_guardian?2:1}
              style={glow?{filter:`drop-shadow(0 0 3px ${glow})`}:{}}
            />
            {imgUrl
              ?<image href={imgUrl} x={cx-15} y={cy-15} width="30" height="30" style={{imageRendering:'pixelated'}}/>
              :<text x={cx} y={cy+5} fontSize="14" textAnchor="middle">🥚</text>
            }
            <circle cx={cx+13} cy={cy+13} r="4" fill={stColor(d.status)} stroke="#0a0a0f" strokeWidth="1"/>
            <rect x={cx-17} y={cy+19} width="34" height="3" rx="1" fill="rgba(255,255,255,0.08)"/>
            <rect x={cx-17} y={cy+19} width={Math.round(34*(d.hp/(d.hp_max||1)))} height="3" rx="1" fill="#2ECC71"/>
            {d.es_guardian&&<text x={cx-14} y={cy-13} fontSize="8" fill={d.color_borde||'#FFD700'} opacity="0.9">⊕</text>}
          </g>
        )
      })}
    </svg>
  )
}

// ── DIGI PANEL ───────────────────────────────────────
function DigiPanel({digi,user,sprite,isGod,editMode,editVals,setEditVals,onDivine,onClose,onEdit,onSave,onCancelEdit,onFusionSelect,inFusion}:any){
  const sc=STAGE_COLORS[digi.etapa]||'#888'
  const sn=STAGE_NAMES[digi.etapa]||'?'
  const isMine=digi.tamer_id===user.id
  const glow=digi.es_guardian?(digi.color_borde||'#FFD700'):null
  return(
    <>
      <div style={{padding:'12px',borderBottom:'1px solid rgba(201,168,76,0.1)',background:'#151520',boxShadow:glow?`0 0 16px ${glow}22`:'none'}}>
        <div style={{display:'flex',gap:'9px',alignItems:'flex-start',marginBottom:'8px'}}>
          <div style={{width:'60px',height:'60px',borderRadius:'7px',overflow:'hidden',border:`2px solid ${glow||'rgba(201,168,76,0.22)'}`,background:'rgba(255,255,255,0.02)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,boxShadow:glow?`0 0 10px ${glow}55`:'none'}}>
            {sprite?<img src={sprite} alt={digi.nombre} style={{width:'56px',height:'56px',objectFit:'contain',imageRendering:'pixelated'}}/>:<span style={{fontSize:'24px'}}>🥚</span>}
          </div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontFamily:'Cinzel,serif',fontSize:'12px',color:'#F0E6CC',fontWeight:500}}>
              {digi.es_guardian&&<span style={{color:glow||'#FFD700',fontSize:'10px'}}>⊕ </span>}
              {digi.nombre}{isMine&&<span style={{color:'#C9A84C',fontSize:'8px'}}> ★</span>}
            </div>
            <div style={{fontSize:'9px',color:'#7A6E5A',marginTop:'1px',fontStyle:'italic'}}>{digi.elemento} · {digi.edad} días{digi.tamer_name?` · ${digi.tamer_name}`:''}</div>
            <div style={{display:'flex',alignItems:'center',gap:'6px',marginTop:'4px'}}>
              <span style={{fontFamily:'Cinzel,serif',fontSize:'17px',color:'#C9A84C',lineHeight:1}}>{digi.nivel}</span>
              <span style={{fontSize:'7px',color:'#7A6E5A'}}>NV</span>
              <div style={{flex:1,height:'2px',background:'rgba(255,255,255,0.06)',borderRadius:'1px',overflow:'hidden',maxWidth:'55px'}}>
                <div style={{height:'100%',background:'#C9A84C',width:`${digi.nivel}%`}}/>
              </div>
            </div>
            <div style={{display:'flex',gap:'3px',flexWrap:'wrap',marginTop:'4px'}}>
              <Pill color={sc}>{sn}</Pill>
              <Pill color={alignColor(digi.alineamiento)}>{digi.alineamiento||'?'}</Pill>
            </div>
          </div>
          <span onClick={onClose} style={{cursor:'pointer',color:'#7A6E5A',fontSize:'14px',lineHeight:1,flexShrink:0}}>✕</span>
        </div>
        <div style={{display:'flex',flexDirection:'column',gap:'3px'}}>
          <BarRow label={`HP ${digi.hp}/${digi.hp_max||20}`} val={digi.hp} max={digi.hp_max||20} color="#2ECC71"/>
          <BarRow label={`MP ${digi.mp||50}/${digi.mp_max||50}`} val={digi.mp||50} max={digi.mp_max||50} color="#3498DB"/>
        </div>
      </div>

      {editMode&&isGod?(
        <div style={{padding:'10px 12px',borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
          <div style={{fontFamily:'Cinzel,serif',fontSize:'8px',letterSpacing:'0.15em',color:'#C9A84C',marginBottom:'8px',textTransform:'uppercase'}}>Editar en BD</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'5px'}}>
            {[['nivel','int'],['etapa','int'],['hp','int'],['hp_max','int'],['fuerza','int'],['inteligencia','int'],['velocidad','int'],['fe','float'],['caos','float'],['lealtad','float'],['agresion','float'],['alineamiento','text'],['genes_divinos','float'],['api_species','text']].map(([k,t])=>(
              <div key={k}>
                <div style={{fontSize:'7px',color:'#7A6E5A',fontFamily:'Cinzel,serif',marginBottom:'2px',textTransform:'uppercase'}}>{k}</div>
                <input value={editVals[k]??''} onChange={e=>setEditVals((p:any)=>({...p,[k]:t==='int'?parseInt(e.target.value)||0:t==='float'?parseFloat(e.target.value)||0:e.target.value}))}
                  style={{width:'100%',background:'rgba(255,255,255,0.04)',border:'1px solid rgba(201,168,76,0.15)',borderRadius:'3px',padding:'2px 5px',color:'#F0E6CC',fontFamily:'"Crimson Pro",serif',fontSize:'10px',outline:'none'}}/>
              </div>
            ))}
          </div>
          <div style={{display:'flex',gap:'5px',marginTop:'7px'}}>
            <button onClick={onSave} style={{flex:1,padding:'5px',border:'1px solid rgba(201,168,76,0.3)',borderRadius:'3px',fontFamily:'Cinzel,serif',fontSize:'9px',color:'#C9A84C',background:'rgba(201,168,76,0.08)',cursor:'pointer'}}>Guardar</button>
            <button onClick={onCancelEdit} style={{padding:'5px 9px',border:'1px solid rgba(255,255,255,0.1)',borderRadius:'3px',fontFamily:'Cinzel,serif',fontSize:'9px',color:'#7A6E5A',background:'none',cursor:'pointer'}}>✕</button>
          </div>
        </div>
      ):(
        <>
          <FSec title="Stats">
            {[['HP',Math.round((digi.hp||0)/(digi.hp_max||1)*100),'#2ECC71'],['Fuerza',digi.fuerza,'#F44336'],['Int',digi.inteligencia,'#2196F3'],['Vel',digi.velocidad,'#FF9800']].map(([n,v,c]:any)=><StatRow key={n} name={n} val={v} color={c}/>)}
          </FSec>
          <FSec title="Personalidad">
            {[['Fe',Math.round((digi.fe||0)*100),'#C9A84C'],['Caos',Math.round((digi.caos||0)*100),'#9C27B0'],['Lealtad',Math.round((digi.lealtad||0)*100),'#4CAF50'],['Agresión',Math.round((digi.agresion||0)*100),'#F44336']].map(([n,v,c]:any)=><StatRow key={n} name={n} val={v} color={c}/>)}
          </FSec>
          <FSec title="Origen">
            <div style={{textAlign:'center',padding:'3px 0'}}>
              <div style={{fontFamily:'Cinzel,serif',fontSize:'15px',color:'#C9A84C'}}>{Number(digi.genes_divinos||0).toFixed(4)}%</div>
              <div style={{fontSize:'8px',color:'#7A6E5A',letterSpacing:'0.1em'}}>SANGRE DIVINA</div>
            </div>
          </FSec>
          {digi.log?.length>0&&(
            <FSec title={`Historial (${digi.log.length})`}>
              {digi.log.slice(0,5).map((l:any,i:number)=>(
                <div key={i} style={{padding:'3px 0',borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
                  <div style={{fontFamily:'Cinzel,serif',fontSize:'7px',letterSpacing:'0.1em',color:l.tipo==='COMBATE'?'#F44336':l.tipo==='EVOLUCION'?'#9C27B0':'#C9A84C',marginBottom:'1px'}}>{l.tipo}</div>
                  <div style={{fontSize:'9px',color:'#7A6E5A',fontStyle:'italic',lineHeight:1.3}}>{l.descripcion?.slice(0,65)}</div>
                </div>
              ))}
            </FSec>
          )}
        </>
      )}

      <div style={{padding:'8px 12px',display:'flex',flexDirection:'column',gap:'3px'}}>
        <div style={{fontFamily:'Cinzel,serif',fontSize:'7px',letterSpacing:'0.15em',color:'#7A6E5A',textTransform:'uppercase',marginBottom:'3px'}}>Acciones</div>
        {isGod&&<>
          <DBtn color="#4CAF50" onClick={()=>onDivine('bless')}>⊕ Bendecir</DBtn>
          <DBtn color="#F44336" onClick={()=>onDivine('curse')}>✕ Maldecir</DBtn>
          <DBtn color="#FF9800" onClick={()=>onDivine('eliminate')}>↺ Reiniciar (huevo)</DBtn>
          <DBtn color="#C9A84C" onClick={onEdit}>✎ Editar en BD</DBtn>
          <DBtn color="#9C27B0" onClick={onFusionSelect}>{inFusion?'✕ Quitar fusión':'⚗ Seleccionar fusión'}</DBtn>
        </>}
      </div>
    </>
  )
}

function BarRow({label,val,max,color}:any){
  return(
    <div style={{display:'flex',alignItems:'center',gap:'5px'}}>
      <span style={{fontSize:'8px',color:'#7A6E5A',width:'70px',flexShrink:0,fontFamily:'Cinzel,serif'}}>{label}</span>
      <div style={{flex:1,height:'4px',background:'rgba(255,255,255,0.06)',borderRadius:'2px',overflow:'hidden'}}>
        <div style={{height:'100%',background:color,width:`${Math.round(Math.min(100,Math.max(0,(val/max)*100)))}%`,borderRadius:'2px',transition:'width 0.4s'}}/>
      </div>
    </div>
  )
}
function StatRow({name,val,color}:any){
  return(
    <div style={{display:'flex',alignItems:'center',gap:'5px',marginBottom:'3px'}}>
      <span style={{fontSize:'8px',color:'#7A6E5A',width:'55px',flexShrink:0}}>{name}</span>
      <div style={{flex:1,height:'2px',background:'rgba(255,255,255,0.06)',borderRadius:'1px',overflow:'hidden'}}>
        <div style={{height:'100%',background:color,width:`${val}%`}}/>
      </div>
      <span style={{fontSize:'8px',color:'#D4C5A9',width:'20px',textAlign:'right',fontFamily:'Cinzel,serif'}}>{val}</span>
    </div>
  )
}
function FSec({title,children}:any){
  return(
    <div style={{padding:'7px 12px',borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
      <div style={{fontFamily:'Cinzel,serif',fontSize:'7px',letterSpacing:'0.15em',color:'#7A6E5A',textTransform:'uppercase',marginBottom:'5px'}}>{title}</div>
      {children}
    </div>
  )
}
function Pill({color,children}:any){
  return<span style={{display:'inline-block',fontFamily:'Cinzel,serif',fontSize:'7px',letterSpacing:'0.07em',padding:'1px 5px',borderRadius:'8px',border:`1px solid ${color}44`,color,background:`${color}11`}}>{children}</span>
}
function DBtn({color,onClick,children,disabled}:any){
  return<button onClick={onClick} disabled={disabled} style={{padding:'5px 8px',borderRadius:'3px',fontFamily:'Cinzel,serif',fontSize:'8px',letterSpacing:'0.06em',cursor:disabled?'not-allowed':'pointer',border:`1px solid ${color}33`,background:`${color}0F`,color:disabled?'rgba(255,255,255,0.2)':color,opacity:disabled?0.4:1,textAlign:'center',width:'100%',transition:'all 0.2s'}}>{children}</button>
}
function Div(){return<div style={{width:'1px',height:'18px',background:'rgba(201,168,76,0.14)',flexShrink:0}}/>}
function TS({v,l}:{v:string,l:string}){return<div style={{display:'flex',flexDirection:'column',alignItems:'center',minWidth:'34px'}}><span style={{fontFamily:'Cinzel,serif',fontSize:'10px',color:'#C9A84C'}}>{v}</span><span style={{fontSize:'7px',color:'#7A6E5A',letterSpacing:'0.06em',whiteSpace:'nowrap'}}>{l}</span></div>}
function TB({children,onClick,color='#7A6E5A',style={}}:any){return<div onClick={onClick} style={{fontFamily:'Cinzel,serif',fontSize:'9px',cursor:'pointer',padding:'3px 7px',borderRadius:'3px',border:`1px solid ${color}44`,background:`${color}0A`,color,whiteSpace:'nowrap',flexShrink:0,...style}}>{children}</div>}
function PT({children}:any){return<div style={{fontFamily:'Cinzel,serif',fontSize:'8px',letterSpacing:'0.18em',color:'#7A6E5A',padding:'0 10px 5px',textTransform:'uppercase'}}>{children}</div>}
