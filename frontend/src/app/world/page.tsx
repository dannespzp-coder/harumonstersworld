'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Cookies from 'js-cookie'
import { worldInfo, getDigiseres, getYggmonLog, getUsuarios, getEventos, divineAction, logout, worldDay, getSprite } from '@/lib/api'
import API from '@/lib/api'

const STAGE_NAMES  = ['Huevo','Child','Adult','Perfect','Mega']
const STAGE_COLORS = ['#C9A84C','#4CAF50','#2196F3','#9C27B0','#FF5722']
const BIOME_BOUNDS: Record<string,[number,number,number,number]> = {
  forest:[1,49,1,49], sea:[51,99,1,49], volcano:[1,49,51,99], void:[51,99,51,99]
}

// ── helpers ──────────────────────────────────────────
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
  const [fusionDrag,setFusionDrag]=useState<any>(null)
  const [filterBiome,setFilterBiome]=useState('all')
  const [biomeDigis,setBiomeDigis]=useState<any[]>([])
  const dragRef=useRef<any>(null)

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
    const iv=setInterval(()=>{if(!paused)loadWorld()},15000)
    return()=>clearInterval(iv)
  },[])

  // Actualizar selDigi cuando cambian digis
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
    try{
      await API.patch(`/digiseres/${selDigi.id}`,editVals)
      notify('Cambios guardados');setEditMode(false);loadWorld()
    }catch(e:any){notify(e?.response?.data?.detail||'Error al guardar')}
  }

  async function handleLogout(){
    await logout().catch(()=>{})
    Cookies.remove('hmw_token');Cookies.remove('hmw_user');router.push('/login')
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

  async function openBiomeView(slug:string){
    const filtered=digis.filter(d=>d.bioma_slug===slug)
    setBiomeDigis(filtered)
    setFilterBiome(slug)
    setOverlay('biome-'+slug)
  }

  async function resetWorld(){
    if(!isGod)return
    if(!confirm('¿Reiniciar el mundo al Día 1? Los guardianes permanecen.'))return
    try{
      await API.post('/world/reset')
      notify('El mundo fue reiniciado. Nueva era comienza.')
      loadWorld()
    }catch(e:any){notify(e?.response?.data?.detail||'Error al reiniciar')}
  }

  async function initFusion(){
    if(fusionSel.length<2){notify('Selecciona 2 digiseres para fusionar');return}
    try{
      const r=await API.post('/fusion',{ser_a:fusionSel[0].id,ser_b:fusionSel[1].id,tipo:'temporal'})
      notify(`Fusión iniciada: ${fusionSel[0].nombre} + ${fusionSel[1].nombre}`)
      setFusionSel([]);loadWorld()
    }catch(e:any){notify(e?.response?.data?.detail||'Error en fusión')}
  }

  function toggleFusionSel(d:any){
    setFusionSel(prev=>{
      if(prev.find(x=>x.id===d.id))return prev.filter(x=>x.id!==d.id)
      if(prev.length>=2)return[prev[1],d]
      return[...prev,d]
    })
  }

  if(!user)return(
    <div style={{minHeight:'100vh',background:'#0A0A0F',display:'flex',alignItems:'center',justifyContent:'center',color:'#C9A84C',fontFamily:'"Cinzel Decorative",serif'}}>
      Cargando Harumonstersworld...
    </div>
  )

  const myDigi=digis.find(d=>d.tamer_id===user.id)

  const BIOME_META:Record<string,any>={
    forest:{name:'Bosque Binario',color:'#4CAF50',bg:'rgba(20,50,20,0.3)',emoji:'🌳',guardian:'Sylvorn',label:'Norte',pos:'left:1%;top:1%;width:48%;height:48%'},
    sea:   {name:'Mar de Bytes',color:'#2196F3',bg:'rgba(10,20,50,0.3)',emoji:'🌊',guardian:'Tidalux',label:'Este',pos:'right:1%;top:1%;width:48%;height:48%'},
    volcano:{name:'Volcán del Kernel',color:'#FF5722',bg:'rgba(50,20,5,0.3)',emoji:'🌋',guardian:'Pyrathos',label:'Sur',pos:'left:1%;bottom:1%;width:48%;height:48%'},
    void:  {name:'Vacío Null',color:'#9C27B0',bg:'rgba(20,5,40,0.3)',emoji:'🌑',guardian:'Nulliax',label:'Oeste',pos:'right:1%;bottom:1%;width:48%;height:48%'},
  }

  return(
    <div style={{display:'flex',flexDirection:'column',height:'100vh',background:'#0A0A0F',overflow:'hidden'}}>

      {/* ── TOPBAR ── */}
      <div style={{height:'48px',background:'#0F0F18',borderBottom:'1px solid rgba(201,168,76,0.14)',display:'flex',alignItems:'center',padding:'0 10px',gap:'8px',flexShrink:0,overflowX:'auto'}}>
        <div style={{fontFamily:'"Cinzel Decorative",serif',fontSize:'10px',color:'#C9A84C',whiteSpace:'nowrap',lineHeight:1}}>
          HMW<small style={{color:'#7A6E5A',fontSize:'7px',fontFamily:'Cinzel,serif',display:'block',letterSpacing:'0.15em'}}>{user.role==='god'?'Dios':user.role==='demigod'?'Semidios':'Habitante'}</small>
        </div>
        <Div/><TS v={String(world?.seres||digis.length)} l="Seres"/>
        <Div/><TS v={`Día ${world?.day||worldDay()}`} l="Era"/>
        <Div/><TS v={String(events.length)} l="Eventos"/>
        {isGod&&<><Div/><TB color="#F44336" onClick={()=>setOverlay('combat')}>⚔</TB></>}
        <TB color="#C9A84C" onClick={openYgg} style={{display:'flex',alignItems:'center',gap:'4px'}}>
          <span style={{width:'5px',height:'5px',borderRadius:'50%',background:'#C9A84C',animation:'pg 2s ease-in-out infinite'}}/>Ygg
        </TB>
        {isGod&&<>
          <TB onClick={()=>setPaused(p=>!p)} color={paused?'#FF9800':'#7A6E5A'}>{paused?'▶':'⏸'}</TB>
          <TB color="#C9A84C" onClick={openUsers}>👥</TB>
          <TB color="#F44336" onClick={resetWorld}>🔄 Reset</TB>
        </>}
        {fusionSel.length>0&&<TB color="#9C27B0" onClick={initFusion}>⚗ Fusionar ({fusionSel.length}/2)</TB>}
        <div style={{marginLeft:'auto',display:'flex',alignItems:'center',gap:'5px',padding:'2px 8px',border:'1px solid rgba(201,168,76,0.15)',borderRadius:'20px',background:'rgba(201,168,76,0.04)',flexShrink:0}}>
          <span style={{width:'5px',height:'5px',borderRadius:'50%',background:user.role==='god'?'#C9A84C':user.role==='demigod'?'#CE93D8':'#4CAF50'}}/>
          <span style={{fontFamily:'Cinzel,serif',fontSize:'9px',color:'#C9A84C'}}>{user.username}</span>
        </div>
        <button onClick={handleLogout} style={{fontSize:'9px',color:'#7A6E5A',cursor:'pointer',padding:'2px 6px',border:'1px solid rgba(255,255,255,0.08)',borderRadius:'3px',background:'none',flexShrink:0}}>Salir</button>
      </div>

      {/* ── MAIN GRID ── */}
      <div style={{display:'grid',gridTemplateColumns:'180px 1fr 300px',flex:1,overflow:'hidden'}}>

        {/* LEFT */}
        <div style={{background:'#0F0F18',borderRight:'1px solid rgba(201,168,76,0.1)',overflowY:'auto',padding:'8px 0'}}>
          <PT>Biomas</PT>
          {Object.entries(BIOME_META).map(([slug,bm])=>(
            <div key={slug} onClick={()=>openBiomeView(slug)}
              style={{padding:'5px 10px',cursor:'pointer',borderLeft:'2px solid transparent',display:'flex',alignItems:'center',gap:'7px',transition:'all 0.2s'}}
              onMouseEnter={e=>(e.currentTarget.style.background='rgba(201,168,76,0.05)')}
              onMouseLeave={e=>(e.currentTarget.style.background='transparent')}>
              <div style={{width:'7px',height:'7px',borderRadius:'50%',background:bm.color,flexShrink:0}}/>
              <div>
                <div style={{fontFamily:'Cinzel,serif',fontSize:'9px',color:'#F0E6CC'}}>{bm.name}</div>
                <div style={{fontSize:'8px',color:'#7A6E5A'}}>{digis.filter(d=>d.bioma_slug===slug).length} seres · {bm.guardian}</div>
              </div>
            </div>
          ))}
          <div style={{height:'1px',background:'rgba(201,168,76,0.08)',margin:'6px 10px'}}/>
          <PT>Eventos</PT>
          <div style={{padding:'0 8px'}}>
            {events.slice(0,10).map((e,i)=>(
              <div key={i} style={{padding:'3px 0',borderBottom:'1px solid rgba(255,255,255,0.04)',fontSize:'8px',lineHeight:1.4}}>
                <div style={{color:'#7A6E5A',fontSize:'7px'}}>{new Date(e.created_at).toLocaleTimeString()}</div>
                <div style={{color:'#D4C5A9',marginTop:'1px'}}><em style={{color:'#8B6E2E'}}>{e.digi_nombre}</em> — {e.descripcion?.slice(0,50)}</div>
              </div>
            ))}
          </div>
        </div>

        {/* CENTER MAP */}
        <div style={{position:'relative',background:'#0A0A0F',overflow:'hidden'}}>
          {/* Zones */}
          {Object.entries(BIOME_META).map(([slug,bm])=>{
            const posObj=Object.fromEntries(bm.pos.split(';').map((p:string)=>p.trim().split(':').map((x:string)=>x.trim())).map(([k,v]:[string,string])=>[k,v]))
            return(
              <div key={slug} onClick={()=>openBiomeView(slug)}
                style={{position:'absolute',border:'1px solid rgba(201,168,76,0.06)',display:'flex',flexDirection:'column',justifyContent:'flex-end',padding:'6px 8px',cursor:'pointer',transition:'all 0.3s',background:bm.bg,...posObj}}>
                <div style={{position:'absolute',top:'6px',right:'8px',fontSize:'14px',opacity:0.13}}>{bm.emoji}</div>
                <div style={{fontFamily:'Cinzel,serif',fontSize:'7px',letterSpacing:'0.12em',color:'rgba(255,255,255,0.22)',textTransform:'uppercase'}}>{bm.label}</div>
                <div style={{fontFamily:'Cinzel,serif',fontSize:'9px',color:'rgba(255,255,255,0.42)'}}>{bm.name}</div>
                <div style={{fontSize:'7px',fontStyle:'italic',color:'rgba(255,255,255,0.22)'}}>{bm.guardian}</div>
              </div>
            )
          })}
          <div style={{position:'absolute',left:'50%',top:'50%',transform:'translate(-50%,-50%)',fontSize:'20px',opacity:0.1,fontFamily:'"Cinzel Decorative",serif',color:'#C9A84C',pointerEvents:'none',zIndex:1}}>⊕</div>

          {/* Digimon dots */}
          {digis.map(d=>{
            const isMine=d.tamer_id===user.id
            const isSel=selDigi?.id===d.id
            const inFusion=fusionSel.find(x=>x.id===d.id)
            const imgUrl=sprites[d.id]
            const isGuardian=d.es_guardian
            const borderColor=isGuardian?(d.color_borde||'#FFD700'):isSel?'#C9A84C':isMine?'#4CAF50':'rgba(201,168,76,0.14)'
            const borderW=isGuardian?2:isSel||isMine?2:1
            return(
              <div key={d.id}
                draggable={isMine||isGod}
                onDragStart={()=>setFusionDrag(d)}
                onDragOver={e=>e.preventDefault()}
                onDrop={()=>{
                  if(fusionDrag&&fusionDrag.id!==d.id){
                    setFusionSel([fusionDrag,d])
                    notify(`Arrastra para fusionar: ${fusionDrag.nombre} + ${d.nombre}. Click ⚗ para confirmar.`)
                  }
                  setFusionDrag(null)
                }}
                onClick={()=>{
                  if(fusionSel.length>0&&!isSel)toggleFusionSel(d)
                  else setSelDigi(d)
                }}
                style={{position:'absolute',cursor:'pointer',zIndex:isGuardian?8:5,display:'flex',flexDirection:'column',alignItems:'center',gap:'2px',
                  left:`calc(${d.pos_x}% - 20px)`,top:`calc(${d.pos_y}% - 24px)`,transition:'transform 0.2s'}}
                onMouseEnter={e=>(e.currentTarget.style.transform='scale(1.15)')}
                onMouseLeave={e=>(e.currentTarget.style.transform='scale(1)')}>
                <div style={{width:'40px',height:'40px',borderRadius:'7px',background:'rgba(255,255,255,0.04)',
                  border:`${borderW}px solid ${inFusion?'#9C27B0':borderColor}`,overflow:'hidden',display:'flex',alignItems:'center',justifyContent:'center',
                  boxShadow:isGuardian?`0 0 10px ${borderColor}66,0 0 0 1px ${borderColor}33`:isSel?`0 0 0 2px #C9A84C`:'none',
                  position:'relative'}}>
                  {imgUrl?<img src={imgUrl} alt={d.nombre} style={{width:'36px',height:'36px',objectFit:'contain',imageRendering:'pixelated'}}/>:<span style={{fontSize:'14px'}}>🥚</span>}
                  {isGuardian&&<div style={{position:'absolute',top:0,right:0,width:'8px',height:'8px',background:'#FFD700',borderRadius:'0 0 0 4px',fontSize:'5px',display:'flex',alignItems:'center',justifyContent:'center'}}>⊕</div>}
                </div>
                <div style={{width:'6px',height:'6px',borderRadius:'50%',border:'1px solid #0A0A0F',marginTop:'-3px',background:stColor(d.status)}}/>
                {/* HP bar mini */}
                <div style={{width:'36px',height:'2px',background:'rgba(255,255,255,0.1)',borderRadius:'1px',overflow:'hidden',marginTop:'1px'}}>
                  <div style={{height:'100%',background:'#2ECC71',width:`${Math.round((d.hp||0)/(d.hp_max||1)*100)}%`,borderRadius:'1px'}}/>
                </div>
              </div>
            )
          })}

          <div className="notif" style={{position:'absolute',top:'10px',left:'50%',transform:'translateX(-50%)',background:'rgba(10,10,15,0.93)',border:'1px solid #8B6E2E',borderRadius:'4px',padding:'5px 14px',fontFamily:'Cinzel,serif',fontSize:'10px',color:'#C9A84C',letterSpacing:'0.08em',zIndex:50,opacity:notifOn?1:0,transition:'opacity 0.3s',whiteSpace:'nowrap',pointerEvents:'none'}}>{notifMsg}</div>

          {/* OVERLAYS */}
          {overlay&&(
            <div style={{position:'absolute',inset:0,zIndex:30,display:'flex',flexDirection:'column'}}>
              <div style={{position:'absolute',inset:0,background:'rgba(5,5,10,0.97)'}}/>
              <div style={{position:'relative',zIndex:1,flex:1,overflowY:'auto',padding:'14px'}}>
                <div style={{fontFamily:'Cinzel,serif',fontSize:'12px',color:'#C9A84C',marginBottom:'10px',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                  <span>
                    {overlay==='ygg'?'⊕ Yggmon · Registro':
                     overlay==='users'?'👥 Usuarios':
                     overlay==='combat'?'⚔ Combates':
                     overlay.startsWith('biome-')?`${BIOME_META[overlay.replace('biome-','')]?.emoji} ${BIOME_META[overlay.replace('biome-','')]?.name}`:''}
                  </span>
                  <span onClick={()=>setOverlay(null)} style={{cursor:'pointer',color:'#7A6E5A',fontSize:'16px'}}>✕</span>
                </div>

                {/* BIOME VIEW — muestra digiseres del bioma */}
                {overlay.startsWith('biome-')&&(()=>{
                  const slug=overlay.replace('biome-','')
                  const bm=BIOME_META[slug]
                  const bDigis=digis.filter(d=>d.bioma_slug===slug)
                  return(
                    <>
                      <div style={{background:bm.bg,borderRadius:'6px',height:'100px',display:'flex',alignItems:'flex-end',padding:'10px',position:'relative',overflow:'hidden',marginBottom:'10px',border:`1px solid ${bm.color}33`}}>
                        <div style={{position:'absolute',inset:0,background:`linear-gradient(135deg,rgba(0,0,0,0.3),${bm.color}22)`}}/>
                        <div style={{position:'relative',zIndex:1}}>
                          <div style={{fontFamily:'"Cinzel Decorative",serif',fontSize:'12px',color:bm.color}}>{bm.name}</div>
                          <div style={{fontSize:'9px',color:'rgba(255,255,255,0.5)',marginTop:'2px'}}>Guardián: {bm.guardian} · {bDigis.length} seres</div>
                        </div>
                      </div>
                      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'6px'}}>
                        {bDigis.length===0&&<div style={{fontSize:'11px',color:'#7A6E5A',fontStyle:'italic',gridColumn:'1/-1'}}>No hay seres en este bioma</div>}
                        {bDigis.map(d=>(
                          <div key={d.id} onClick={()=>{setSelDigi(d);setOverlay(null)}}
                            style={{background:'rgba(255,255,255,0.03)',border:`1px solid ${d.es_guardian?d.color_borde||'#FFD700':'rgba(201,168,76,0.1)'}`,borderRadius:'6px',padding:'8px',display:'flex',alignItems:'center',gap:'8px',cursor:'pointer',
                              boxShadow:d.es_guardian?`0 0 8px ${d.color_borde||'#FFD700'}44`:'none'}}>
                            <div style={{width:'36px',height:'36px',borderRadius:'5px',border:`1px solid ${d.es_guardian?d.color_borde||'#FFD700':'rgba(201,168,76,0.15)'}`,overflow:'hidden',display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(255,255,255,0.02)',flexShrink:0}}>
                              {sprites[d.id]?<img src={sprites[d.id]} alt={d.nombre} style={{width:'32px',height:'32px',objectFit:'contain',imageRendering:'pixelated'}}/>:<span style={{fontSize:'14px'}}>🥚</span>}
                            </div>
                            <div style={{flex:1,minWidth:0}}>
                              <div style={{fontFamily:'Cinzel,serif',fontSize:'10px',color:'#F0E6CC',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                                {d.es_guardian&&'⊕ '}{d.nombre}
                              </div>
                              <div style={{fontSize:'8px',color:'#7A6E5A'}}>{STAGE_NAMES[d.etapa]} · Nv.{d.nivel}</div>
                              <div style={{width:'100%',height:'2px',background:'rgba(255,255,255,0.08)',borderRadius:'1px',marginTop:'3px',overflow:'hidden'}}>
                                <div style={{height:'100%',background:'#2ECC71',width:`${Math.round((d.hp||0)/(d.hp_max||1)*100)}%`}}/>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )
                })()}

                {/* YGGMON LOG */}
                {overlay==='ygg'&&yggLog.map((l,i)=>(
                  <div key={i} style={{padding:'6px 0',borderBottom:'1px solid rgba(201,168,76,0.08)'}}>
                    <div style={{fontFamily:'Cinzel,serif',fontSize:'8px',letterSpacing:'0.12em',color:l.tipo==='GRAN_REINICIO'?'#F44336':l.tipo==='EQUILIBRIO'?'#FF9800':'#C9A84C',marginBottom:'2px'}}>{l.tipo}</div>
                    <div style={{fontSize:'10px',color:'#D4C5A9',fontStyle:'italic'}}>{l.descripcion}</div>
                    <div style={{fontSize:'8px',color:'#7A6E5A',marginTop:'1px'}}>Día {l.dia_mundo}</div>
                  </div>
                ))}

                {/* USUARIOS */}
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
                        <div style={{width:'7px',height:'7px',borderRadius:'50%',background:u.online?'#4CAF50':'#F44336',flexShrink:0,boxShadow:u.online?'0 0 0 2px rgba(76,175,80,0.3)':'none'}}/>
                        <div style={{width:'30px',height:'30px',borderRadius:'50%',background:'rgba(201,168,76,0.1)',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'Cinzel,serif',fontSize:'11px',color:'#C9A84C',flexShrink:0}}>{u.username[0].toUpperCase()}</div>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontFamily:'Cinzel,serif',fontSize:'10px',color:'#F0E6CC'}}>{u.username}</div>
                          <div style={{fontSize:'8px',color:'#7A6E5A'}}>{u.digi_nombre?`Ser: ${u.digi_nombre}`:' Sin digisér'} · Día {u.joined_day}</div>
                        </div>
                        <span style={{fontSize:'7px',fontFamily:'Cinzel,serif',padding:'2px 5px',borderRadius:'8px',border:`1px solid ${u.role==='god'?'#C9A84C44':'#4CAF5044'}`,color:u.role==='god'?'#C9A84C':'#4CAF50',background:u.role==='god'?'#C9A84C11':'#4CAF5011'}}>
                          {u.role==='god'?'Dios':u.role==='demigod'?'Semidios':'Habitante'}
                        </span>
                        {isGod&&u.role==='user'&&<button onClick={async()=>{await API.post('/promote',{username:u.username});notify(`${u.username} ascendido`);openUsers()}} style={{fontSize:'7px',padding:'2px 5px',border:'1px solid #CE93D844',borderRadius:'3px',background:'#CE93D811',color:'#CE93D8',cursor:'pointer'}}>↑ Dios</button>}
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
              {(isGod||(myDigi&&fusionSel.length===0))&&<span style={{fontSize:'9px',color:'#7A6E5A'}}>Arrastra dos seres para fusionar</span>}
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
              onEdit={()=>{setEditMode(true);setEditVals({nivel:selDigi.nivel,etapa:selDigi.etapa,hp:selDigi.hp,hp_max:selDigi.hp_max,fuerza:selDigi.fuerza,inteligencia:selDigi.inteligencia,velocidad:selDigi.velocidad,fe:selDigi.fe,caos:selDigi.caos,lealtad:selDigi.lealtad,agresion:selDigi.agresion,alineamiento:selDigi.alineamiento,genes_divinos:selDigi.genes_divinos,api_species:selDigi.api_species})}}
              onSave={handleUpdate}
              onCancelEdit={()=>setEditMode(false)}
              onFusionSelect={()=>toggleFusionSel(selDigi)}
              inFusion={!!fusionSel.find(x=>x.id===selDigi.id)}
            />
          )}
        </div>
      </div>
      <style>{`@keyframes pg{0%,100%{box-shadow:0 0 0 0 rgba(201,168,76,0.5)}50%{box-shadow:0 0 0 4px rgba(201,168,76,0)}}`}</style>
    </div>
  )
}

// ── DIGI PANEL ───────────────────────────────────────
function DigiPanel({digi,user,sprite,isGod,editMode,editVals,setEditVals,onDivine,onClose,onEdit,onSave,onCancelEdit,onFusionSelect,inFusion}:any){
  const sc=STAGE_COLORS[digi.etapa]||'#888'
  const sn=STAGE_NAMES[digi.etapa]||'?'
  const isMine=digi.tamer_id===user.id
  const isGuardian=digi.es_guardian
  const borderColor=isGuardian?(digi.color_borde||'#FFD700'):'rgba(201,168,76,0.22)'

  return(
    <>
      {/* Header */}
      <div style={{padding:'12px',borderBottom:'1px solid rgba(201,168,76,0.1)',background:'#151520',boxShadow:isGuardian?`0 0 20px ${digi.color_borde||'#FFD700'}22`:'none'}}>
        <div style={{display:'flex',gap:'9px',alignItems:'flex-start',marginBottom:'8px'}}>
          <div style={{width:'60px',height:'60px',borderRadius:'7px',overflow:'hidden',border:`2px solid ${borderColor}`,background:'rgba(255,255,255,0.02)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,
            boxShadow:isGuardian?`0 0 12px ${digi.color_borde||'#FFD700'}55`:'none'}}>
            {sprite?<img src={sprite} alt={digi.nombre} style={{width:'56px',height:'56px',objectFit:'contain',imageRendering:'pixelated'}}/>:<span style={{fontSize:'24px'}}>🥚</span>}
          </div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontFamily:'Cinzel,serif',fontSize:'12px',color:'#F0E6CC',fontWeight:500}}>
              {isGuardian&&<span style={{color:digi.color_borde||'#FFD700',fontSize:'10px'}}>⊕ </span>}
              {digi.nombre}
              {isMine&&<span style={{color:'#C9A84C',fontSize:'8px'}}> ★</span>}
            </div>
            <div style={{fontSize:'9px',color:'#7A6E5A',marginTop:'1px',fontStyle:'italic'}}>{digi.elemento} · {digi.edad} días · {digi.tamer_name?`Tamer: ${digi.tamer_name}`:'Salvaje'}</div>
            <div style={{display:'flex',alignItems:'center',gap:'6px',marginTop:'4px'}}>
              <span style={{fontFamily:'Cinzel,serif',fontSize:'17px',color:'#C9A84C',lineHeight:1}}>{digi.nivel}</span>
              <span style={{fontSize:'7px',color:'#7A6E5A'}}>NV</span>
              <div style={{flex:1,height:'2px',background:'rgba(255,255,255,0.06)',borderRadius:'1px',overflow:'hidden',maxWidth:'60px'}}>
                <div style={{height:'100%',background:'#C9A84C',width:`${digi.nivel}%`}}/>
              </div>
            </div>
            <div style={{display:'flex',gap:'3px',flexWrap:'wrap',marginTop:'4px'}}>
              <Pill color={sc}>{sn}</Pill>
              <Pill color={alignColor(digi.alineamiento)}>{digi.alineamiento||'?'}</Pill>
            </div>
          </div>
          <span onClick={onClose} style={{cursor:'pointer',color:'#7A6E5A',fontSize:'15px',lineHeight:1,flexShrink:0}}>✕</span>
        </div>

        {/* HP y MP bars */}
        <div style={{display:'flex',flexDirection:'column',gap:'4px'}}>
          <BarRow label="HP" val={digi.hp} max={digi.hp_max||20} color="#2ECC71"/>
          <BarRow label="MP" val={digi.mp||50} max={digi.mp_max||50} color="#3498DB"/>
          {digi.cansancio>0&&<BarRow label="Cansancio" val={Math.round(digi.cansancio*100)} max={100} color="#FF9800"/>}
        </div>
      </div>

      {/* Edit mode vs View mode */}
      {editMode&&isGod?(
        <div style={{padding:'10px 12px',borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
          <div style={{fontFamily:'Cinzel,serif',fontSize:'8px',letterSpacing:'0.15em',color:'#C9A84C',marginBottom:'8px',textTransform:'uppercase'}}>Editar en BD</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'6px'}}>
            {[['nivel','int'],['etapa','int'],['hp','int'],['hp_max','int'],['fuerza','int'],['inteligencia','int'],['velocidad','int'],['fe','float'],['caos','float'],['lealtad','float'],['agresion','float'],['alineamiento','text'],['genes_divinos','float'],['api_species','text']].map(([k,t])=>(
              <div key={k}>
                <div style={{fontSize:'7px',color:'#7A6E5A',fontFamily:'Cinzel,serif',letterSpacing:'0.08em',marginBottom:'2px',textTransform:'uppercase'}}>{k}</div>
                <input value={editVals[k]??''} onChange={e=>setEditVals((p:any)=>({...p,[k]:t==='int'?parseInt(e.target.value)||0:t==='float'?parseFloat(e.target.value)||0:e.target.value}))}
                  style={{width:'100%',background:'rgba(255,255,255,0.04)',border:'1px solid rgba(201,168,76,0.15)',borderRadius:'3px',padding:'3px 5px',color:'#F0E6CC',fontFamily:'"Crimson Pro",serif',fontSize:'11px',outline:'none'}}/>
              </div>
            ))}
          </div>
          <div style={{display:'flex',gap:'6px',marginTop:'8px'}}>
            <button onClick={onSave} style={{flex:1,padding:'5px',border:'1px solid rgba(201,168,76,0.3)',borderRadius:'3px',fontFamily:'Cinzel,serif',fontSize:'9px',color:'#C9A84C',background:'rgba(201,168,76,0.08)',cursor:'pointer'}}>Guardar</button>
            <button onClick={onCancelEdit} style={{padding:'5px 10px',border:'1px solid rgba(255,255,255,0.1)',borderRadius:'3px',fontFamily:'Cinzel,serif',fontSize:'9px',color:'#7A6E5A',background:'none',cursor:'pointer'}}>Cancelar</button>
          </div>
        </div>
      ):(
        <>
          {/* Stats */}
          <FSec title="Estadísticas">
            {[['HP',Math.round((digi.hp||0)/(digi.hp_max||1)*100),'#2ECC71'],['Fuerza',digi.fuerza,'#F44336'],['Inteligencia',digi.inteligencia,'#2196F3'],['Velocidad',digi.velocidad,'#FF9800']].map(([n,v,c]:any)=>(
              <StatRow key={n} name={n} val={v} color={c}/>
            ))}
          </FSec>

          {/* Personalidad */}
          <FSec title="Personalidad">
            {[['Fe',Math.round((digi.fe||0)*100),'#C9A84C'],['Caos',Math.round((digi.caos||0)*100),'#9C27B0'],['Lealtad',Math.round((digi.lealtad||0)*100),'#4CAF50'],['Agresión',Math.round((digi.agresion||0)*100),'#F44336']].map(([n,v,c]:any)=>(
              <StatRow key={n} name={n} val={v} color={c}/>
            ))}
          </FSec>

          {/* Sangre divina */}
          <FSec title="Origen">
            <div style={{textAlign:'center',padding:'4px 0'}}>
              <div style={{fontFamily:'Cinzel,serif',fontSize:'16px',color:'#C9A84C'}}>{digi.genes_divinos?.toFixed?.(4)||'?'}%</div>
              <div style={{fontSize:'8px',color:'#7A6E5A',letterSpacing:'0.1em'}}>SANGRE DIVINA</div>
            </div>
          </FSec>

          {/* Historial */}
          {digi.log?.length>0&&(
            <FSec title={`Historial (${digi.log.length})`}>
              {digi.log.slice(0,6).map((l:any,i:number)=>(
                <div key={i} style={{padding:'3px 0',borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
                  <div style={{fontFamily:'Cinzel,serif',fontSize:'7px',letterSpacing:'0.1em',color:l.tipo==='COMBATE'?'#F44336':l.tipo==='EVOLUCION'?'#9C27B0':l.tipo==='NACIMIENTO'?'#C9A84C':'#7A6E5A',marginBottom:'1px'}}>{l.tipo}</div>
                  <div style={{fontSize:'9px',color:'#7A6E5A',fontStyle:'italic',lineHeight:1.3}}>{l.descripcion?.slice(0,60)}</div>
                </div>
              ))}
            </FSec>
          )}
        </>
      )}

      {/* Acciones */}
      <div style={{padding:'8px 12px',display:'flex',flexDirection:'column',gap:'4px'}}>
        <div style={{fontFamily:'Cinzel,serif',fontSize:'8px',letterSpacing:'0.15em',color:'#7A6E5A',textTransform:'uppercase',marginBottom:'3px'}}>Acciones</div>
        {isGod&&<>
          <DBtn color="#4CAF50" onClick={()=>onDivine('bless')}>⊕ Bendecir a {digi.nombre}</DBtn>
          <DBtn color="#F44336" onClick={()=>onDivine('curse')}>✕ Maldecir a {digi.nombre}</DBtn>
          <DBtn color="#FF9800" onClick={()=>onDivine('eliminate')}>↺ Reiniciar (huevo)</DBtn>
          <DBtn color="#C9A84C" onClick={onEdit}>✎ Editar en base de datos</DBtn>
        </>}
        <DBtn color="#9C27B0" onClick={onFusionSelect}>{inFusion?'✕ Quitar de fusión':'⚗ Seleccionar para fusión'}</DBtn>
      </div>
    </>
  )
}

// ── SUBCOMPONENTES ────────────────────────────────────
function BarRow({label,val,max,color}:any){
  const pct=Math.round(Math.min(100,Math.max(0,(val/max)*100)))
  return(
    <div style={{display:'flex',alignItems:'center',gap:'6px'}}>
      <span style={{fontSize:'8px',color:'#7A6E5A',width:'55px',flexShrink:0,fontFamily:'Cinzel,serif',letterSpacing:'0.06em'}}>{label} {val}/{max}</span>
      <div style={{flex:1,height:'4px',background:'rgba(255,255,255,0.06)',borderRadius:'2px',overflow:'hidden'}}>
        <div style={{height:'100%',background:color,width:`${pct}%`,borderRadius:'2px',transition:'width 0.5s'}}/>
      </div>
    </div>
  )
}
function StatRow({name,val,color}:any){
  return(
    <div style={{display:'flex',alignItems:'center',gap:'6px',marginBottom:'3px'}}>
      <span style={{fontSize:'9px',color:'#7A6E5A',width:'68px',flexShrink:0}}>{name}</span>
      <div style={{flex:1,height:'2px',background:'rgba(255,255,255,0.06)',borderRadius:'1px',overflow:'hidden'}}>
        <div style={{height:'100%',background:color,width:`${val}%`,borderRadius:'1px'}}/>
      </div>
      <span style={{fontSize:'9px',color:'#D4C5A9',width:'20px',textAlign:'right',fontFamily:'Cinzel,serif'}}>{val}</span>
    </div>
  )
}
function FSec({title,children}:any){
  return(
    <div style={{padding:'8px 12px',borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
      <div style={{fontFamily:'Cinzel,serif',fontSize:'8px',letterSpacing:'0.15em',color:'#7A6E5A',textTransform:'uppercase',marginBottom:'6px'}}>{title}</div>
      {children}
    </div>
  )
}
function Pill({color,children}:any){
  return<span style={{display:'inline-block',fontFamily:'Cinzel,serif',fontSize:'7px',letterSpacing:'0.07em',padding:'1px 5px',borderRadius:'8px',border:`1px solid ${color}44`,color,background:`${color}11`}}>{children}</span>
}
function DBtn({color,onClick,children,disabled}:any){
  return<button onClick={onClick} disabled={disabled} style={{padding:'5px 8px',borderRadius:'3px',fontFamily:'Cinzel,serif',fontSize:'9px',letterSpacing:'0.06em',cursor:disabled?'not-allowed':'pointer',border:`1px solid ${color}33`,background:`${color}0F`,color:disabled?'rgba(255,255,255,0.2)':color,opacity:disabled?0.4:1,textAlign:'center',width:'100%',transition:'all 0.2s'}}>{children}</button>
}
function Div(){return<div style={{width:'1px',height:'18px',background:'rgba(201,168,76,0.14)',flexShrink:0}}/>}
function TS({v,l}:{v:string,l:string}){return<div style={{display:'flex',flexDirection:'column',alignItems:'center',minWidth:'34px'}}><span style={{fontFamily:'Cinzel,serif',fontSize:'10px',color:'#C9A84C'}}>{v}</span><span style={{fontSize:'7px',color:'#7A6E5A',letterSpacing:'0.06em',whiteSpace:'nowrap'}}>{l}</span></div>}
function TB({children,onClick,color='#7A6E5A',style={}}:any){return<div onClick={onClick} style={{fontFamily:'Cinzel,serif',fontSize:'9px',cursor:'pointer',padding:'3px 7px',borderRadius:'3px',border:`1px solid ${color}44`,background:`${color}0A`,color,whiteSpace:'nowrap',flexShrink:0,...style}}>{children}</div>}
function PT({children}:any){return<div style={{fontFamily:'Cinzel,serif',fontSize:'8px',letterSpacing:'0.18em',color:'#7A6E5A',padding:'0 10px 5px',textTransform:'uppercase'}}>{children}</div>}
