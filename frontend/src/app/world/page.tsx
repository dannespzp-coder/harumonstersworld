'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Cookies from 'js-cookie'
import { worldInfo, getDigiseres, getYggmonLog, getUsuarios, getEventos, divineAction, logout, worldDay, getSprite } from '@/lib/api'

const STAGE_NAMES = ['Huevo','Child','Adult','Perfect','Mega']
const STAGE_COLORS = ['#C9A84C','#4CAF50','#2196F3','#9C27B0','#FF5722']

export default function WorldPage() {
  const router = useRouter()
  const [user, setUser]         = useState<any>(null)
  const [world, setWorld]       = useState<any>(null)
  const [digis, setDigis]       = useState<any[]>([])
  const [selDigi, setSelDigi]   = useState<any>(null)
  const [sprites, setSprites]   = useState<Record<string,string>>({})
  const [events, setEvents]     = useState<any[]>([])
  const [yggLog, setYggLog]     = useState<any[]>([])
  const [users, setUsers]       = useState<any[]>([])
  const [overlay, setOverlay]   = useState<string|null>(null)
  const [paused, setPaused]     = useState(false)
  const [notif, setNotif]       = useState('')
  const [showNotif, setShowNotif] = useState(false)

  const isGod = user?.role === 'god' || user?.role === 'demigod'

  function notify(msg: string) {
    setNotif(msg); setShowNotif(true)
    setTimeout(()=>setShowNotif(false), 2800)
  }

  // Cargar sprites de forma progresiva
  async function loadSprites(list: any[]) {
    for (const d of list) {
      const url = await getSprite(d.api_species || 'Botamon', d.sprite_url)
      if (url) setSprites(prev=>({...prev,[d.id]:url}))
    }
  }

  const loadWorld = useCallback(async () => {
    try {
      const [wInfo, digiList, evList] = await Promise.all([
        worldInfo(), getDigiseres(), getEventos()
      ])
      setWorld(wInfo)
      setDigis(digiList)
      setEvents(evList)
      loadSprites(digiList)
    } catch {}
  },[])

  useEffect(()=>{
    const raw = Cookies.get('hmw_user')
    if(!raw){ router.push('/login'); return }
    const u = JSON.parse(raw)
    setUser(u)
    loadWorld()
    const interval = setInterval(()=>{ if(!paused) loadWorld() }, 15000)
    return ()=>clearInterval(interval)
  },[])

  async function handleDivine(tipo: string) {
    if(!selDigi) return
    try {
      const r = await divineAction(tipo, selDigi.id)
      notify(r.desc)
      loadWorld()
    } catch(e:any){ notify(e?.response?.data?.detail || 'Error') }
  }

  async function handleLogout() {
    await logout().catch(()=>{})
    Cookies.remove('hmw_token'); Cookies.remove('hmw_user')
    router.push('/login')
  }

  async function openUsers() {
    if(!isGod) return
    try { const u = await getUsuarios(); setUsers(u) } catch {}
    setOverlay('users')
  }

  async function openYgg() {
    try { const y = await getYggmonLog(); setYggLog(y) } catch {}
    setOverlay('ygg')
  }

  if(!user) return <div style={{minHeight:'100vh',background:'#0A0A0F',display:'flex',alignItems:'center',justifyContent:'center',color:'#C9A84C',fontFamily:'"Cinzel Decorative",serif'}}>Cargando...</div>

  const myDigi = digis.find(d=>d.tamer_id===user.id)

  return (
    <div style={{display:'flex',flexDirection:'column',height:'100vh',background:'#0A0A0F',overflow:'hidden'}}>

      {/* TOPBAR */}
      <div style={{height:'48px',background:'#0F0F18',borderBottom:'1px solid rgba(201,168,76,0.14)',display:'flex',alignItems:'center',padding:'0 12px',gap:'10px',flexShrink:0,overflowX:'auto'}}>
        <div style={{fontFamily:'"Cinzel Decorative",serif',fontSize:'11px',color:'#C9A84C',whiteSpace:'nowrap',lineHeight:1}}>
          HARUMONSTERSWORLD
          <small style={{color:'#7A6E5A',fontSize:'8px',fontFamily:'Cinzel,serif',display:'block',letterSpacing:'0.18em'}}>
            {user.role==='god'?'Portal del Dios':user.role==='demigod'?'Dios-Humano':'Habitante'}
          </small>
        </div>
        <Div/><TStat v={String(world?.seres||digis.length)} l="Seres"/>
        <Div/><TStat v={`Día ${world?.day||worldDay()}`} l="Era Primordial"/>
        <Div/><TStat v={String(events.length)} l="Eventos"/>
        {isGod && <><Div/><TBtn color="#F44336" onClick={()=>setOverlay('combat')}>⚔ Combate</TBtn></>}
        <TBtn color="#C9A84C" onClick={openYgg} style={{display:'flex',alignItems:'center',gap:'5px'}}>
          <span style={{width:'6px',height:'6px',borderRadius:'50%',background:'#C9A84C',flexShrink:0,animation:'pulse-gold 2s ease-in-out infinite'}}/>
          Yggmon
        </TBtn>
        {isGod && <><TBtn onClick={()=>setPaused(p=>!p)} color={paused?'#FF9800':'#7A6E5A'}>{paused?'▶ Reanudar':'⏸ Pausar'}</TBtn>
        <TBtn color="#C9A84C" onClick={openUsers}>👥 Usuarios</TBtn></>}
        <div style={{marginLeft:'auto',display:'flex',alignItems:'center',gap:'6px',padding:'3px 9px',border:'1px solid rgba(201,168,76,0.15)',borderRadius:'20px',background:'rgba(201,168,76,0.04)',flexShrink:0}}>
          <span style={{width:'6px',height:'6px',borderRadius:'50%',background:user.role==='god'?'#C9A84C':user.role==='demigod'?'#CE93D8':'#4CAF50'}}/>
          <div>
            <div style={{fontFamily:'Cinzel,serif',fontSize:'10px',color:'#C9A84C',letterSpacing:'0.06em'}}>{user.username}</div>
            <div style={{fontSize:'8px',color:'#7A6E5A'}}>{user.role==='god'?'⊕ Dios Soberano':user.role==='demigod'?'✦ Dios-Humano':'Habitante'}</div>
          </div>
        </div>
        <button onClick={handleLogout} style={{fontSize:'9px',color:'#7A6E5A',cursor:'pointer',padding:'3px 7px',border:'1px solid rgba(255,255,255,0.08)',borderRadius:'3px',background:'none',flexShrink:0}}>Salir</button>
      </div>

      {/* MAIN GRID */}
      <div style={{display:'grid',gridTemplateColumns:'190px 1fr 280px',flex:1,overflow:'hidden'}}>

        {/* LEFT */}
        <div style={{background:'#0F0F18',borderRight:'1px solid rgba(201,168,76,0.1)',overflowY:'auto',padding:'10px 0'}}>
          <PTitle>Biomas</PTitle>
          {[{slug:'all',name:'Todos',color:'#8B6E2E',sub:`${digis.length} seres`},
            {slug:'forest',name:'Bosque Binario',color:'#4CAF50',sub:'Sylvorn'},
            {slug:'sea',name:'Mar de Bytes',color:'#2196F3',sub:'Tidalux'},
            {slug:'volcano',name:'Volcán del Kernel',color:'#FF5722',sub:'Pyrathos'},
            {slug:'void',name:'Vacío Null',color:'#9C27B0',sub:'Nulliax'},
          ].map(b=>(
            <div key={b.slug} onClick={()=>b.slug!=='all'&&setOverlay('biome-'+b.slug)}
              style={{padding:'6px 12px',cursor:'pointer',borderLeft:'2px solid transparent',display:'flex',alignItems:'center',gap:'8px',transition:'all 0.2s'}}
              onMouseEnter={e=>(e.currentTarget.style.background='rgba(201,168,76,0.05)')}
              onMouseLeave={e=>(e.currentTarget.style.background='transparent')}>
              <div style={{width:'8px',height:'8px',borderRadius:'50%',background:b.color,flexShrink:0}}/>
              <div>
                <div style={{fontFamily:'Cinzel,serif',fontSize:'10px',color:'#F0E6CC'}}>{b.name}</div>
                <div style={{fontSize:'9px',color:'#7A6E5A'}}>{b.sub}</div>
              </div>
            </div>
          ))}
          <div style={{height:'1px',background:'rgba(201,168,76,0.08)',margin:'8px 12px'}}/>
          <PTitle>Eventos en vivo</PTitle>
          <div style={{padding:'0 10px'}}>
            {events.slice(0,10).map((e,i)=>(
              <div key={i} style={{padding:'4px 0',borderBottom:'1px solid rgba(255,255,255,0.04)',fontSize:'9px',lineHeight:1.4}}>
                <div style={{color:'#7A6E5A',fontSize:'8px'}}>{new Date(e.created_at).toLocaleTimeString()}</div>
                <div style={{color:'#D4C5A9',marginTop:'1px'}}><em style={{fontStyle:'italic',color:'#8B6E2E'}}>{e.digi_nombre}</em> — {e.descripcion}</div>
              </div>
            ))}
          </div>
        </div>

        {/* CENTER MAP */}
        <div style={{position:'relative',background:'#0A0A0F',overflow:'hidden'}}>
          {/* Zones */}
          {[
            {slug:'forest',label:'Norte',name:'Bosque Binario',guardian:'Sylvorn el Ancestral',bg:'rgba(20,50,20,0.28)',emoji:'🌳',pos:'left:1%;top:1%;width:48%;height:48%'},
            {slug:'sea',label:'Este',name:'Mar de Bytes',guardian:'Tidalux la Eterna',bg:'rgba(10,20,50,0.28)',emoji:'🌊',pos:'right:1%;top:1%;width:48%;height:48%'},
            {slug:'volcano',label:'Sur',name:'Volcán del Kernel',guardian:'Pyrathos el Furioso',bg:'rgba(50,20,5,0.28)',emoji:'🌋',pos:'left:1%;bottom:1%;width:48%;height:48%'},
            {slug:'void',label:'Oeste',name:'Vacío Null',guardian:'Nulliax el Corrupto',bg:'rgba(20,5,40,0.28)',emoji:'🌑',pos:'right:1%;bottom:1%;width:48%;height:48%'},
          ].map(z=>(
            <div key={z.slug} onClick={()=>setOverlay('biome-'+z.slug)} style={{position:'absolute',border:'1px solid rgba(201,168,76,0.06)',display:'flex',flexDirection:'column',justifyContent:'flex-end',padding:'7px 9px',cursor:'pointer',transition:'all 0.3s',background:z.bg,
              ...Object.fromEntries(z.pos.split(';').map(p=>p.trim().split(':')).map(([k,v])=>[k.trim(),v.trim()]))
            }}>
              <div style={{position:'absolute',top:'7px',right:'9px',fontSize:'16px',opacity:0.13}}>{z.emoji}</div>
              <div style={{fontFamily:'Cinzel,serif',fontSize:'8px',letterSpacing:'0.12em',color:'rgba(255,255,255,0.22)',textTransform:'uppercase'}}>{z.label}</div>
              <div style={{fontFamily:'Cinzel,serif',fontSize:'10px',color:'rgba(255,255,255,0.42)'}}>{z.name}</div>
              <div style={{fontSize:'8px',fontStyle:'italic',color:'rgba(255,255,255,0.22)',marginTop:'1px'}}>{z.guardian}</div>
            </div>
          ))}
          {/* Center symbol */}
          <div style={{position:'absolute',left:'50%',top:'50%',transform:'translate(-50%,-50%)',fontSize:'24px',opacity:0.1,fontFamily:'"Cinzel Decorative",serif',color:'#C9A84C',pointerEvents:'none',zIndex:1}}>⊕</div>
          {/* Digimon dots */}
          {digis.map(d=>{
            const isMine = d.tamer_id===user.id
            const isSel  = selDigi?.id===d.id
            const imgUrl = sprites[d.id]
            return (
              <div key={d.id} onClick={()=>setSelDigi(d)} style={{position:'absolute',cursor:'pointer',zIndex:5,display:'flex',flexDirection:'column',alignItems:'center',gap:'2px',left:`calc(${d.pos_x}% - 20px)`,top:`calc(${d.pos_y}% - 24px)`,transition:'transform 0.2s'}}
                onMouseEnter={e=>(e.currentTarget.style.transform='scale(1.15)')}
                onMouseLeave={e=>(e.currentTarget.style.transform='scale(1)')}>
                <div style={{width:'40px',height:'40px',borderRadius:'7px',background:'rgba(255,255,255,0.04)',border:`1px solid ${isSel?'#C9A84C':'rgba(201,168,76,0.14)'}`,overflow:'hidden',display:'flex',alignItems:'center',justifyContent:'center',boxShadow:isSel?'0 0 0 2px #C9A84C':'none'}}>
                  {imgUrl ? <img src={imgUrl} alt={d.nombre} style={{width:'36px',height:'36px',objectFit:'contain',imageRendering:'pixelated'}}/> : <span style={{fontSize:'16px'}}>🥚</span>}
                </div>
                <div style={{width:'6px',height:'6px',borderRadius:'50%',border:'1px solid #0A0A0F',marginTop:'-3px',background:d.status==='combat'?'#F44336':'#4CAF50',boxShadow:isMine?'0 0 0 2px #C9A84C':'none'}}/>
              </div>
            )
          })}
          {/* Notif */}
          {showNotif && <div style={{position:'absolute',top:'10px',left:'50%',transform:'translateX(-50%)',background:'rgba(10,10,15,0.93)',border:'1px solid #8B6E2E',borderRadius:'4px',padding:'5px 14px',fontFamily:'Cinzel,serif',fontSize:'10px',color:'#C9A84C',letterSpacing:'0.08em',zIndex:50,whiteSpace:'nowrap',transition:'opacity 0.3s'}}>{notif}</div>}
          {/* OVERLAYS */}
          {overlay && (
            <div style={{position:'absolute',inset:0,zIndex:30,display:'flex',flexDirection:'column'}}>
              <div style={{position:'absolute',inset:0,background:'rgba(5,5,10,0.97)'}}/>
              <div style={{position:'relative',zIndex:1,flex:1,overflowY:'auto',padding:'16px'}}>
                <div style={{fontFamily:'Cinzel,serif',fontSize:'13px',color:'#C9A84C',marginBottom:'12px',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                  <span>{overlay==='ygg'?'Yggmon · Registro':overlay==='users'?'👥 Usuarios del mundo':overlay.startsWith('biome-')?`Bioma — ${overlay.replace('biome-','')}`:'⚔ Combate'}</span>
                  <span onClick={()=>setOverlay(null)} style={{cursor:'pointer',color:'#7A6E5A',fontSize:'18px'}}>✕</span>
                </div>
                {overlay==='ygg' && yggLog.map((l,i)=>(
                  <div key={i} style={{padding:'7px 0',borderBottom:'1px solid rgba(201,168,76,0.08)'}}>
                    <div style={{fontFamily:'Cinzel,serif',fontSize:'8px',letterSpacing:'0.12em',color:'#C9A84C',marginBottom:'2px'}}>{l.tipo}</div>
                    <div style={{fontSize:'11px',color:'#D4C5A9',fontStyle:'italic'}}>{l.descripcion}</div>
                    <div style={{fontSize:'8px',color:'#7A6E5A',marginTop:'2px'}}>Día {l.dia_mundo}</div>
                  </div>
                ))}
                {overlay==='users' && (
                  <>
                    <div style={{display:'flex',gap:'10px',marginBottom:'14px'}}>
                      {[{v:users.filter(u=>u.online).length,l:'Conectados',c:'#4CAF50'},{v:users.filter(u=>!u.online).length,l:'Desconectados',c:'#F44336'},{v:users.length,l:'Total',c:'#C9A84C'}].map(s=>(
                        <div key={s.l} style={{flex:1,background:`${s.c}11`,border:`1px solid ${s.c}33`,borderRadius:'6px',padding:'10px',textAlign:'center'}}>
                          <div style={{fontFamily:'Cinzel,serif',fontSize:'18px',color:s.c}}>{s.v}</div>
                          <div style={{fontSize:'8px',color:'#7A6E5A',letterSpacing:'0.1em',fontFamily:'Cinzel,serif'}}>{s.l.toUpperCase()}</div>
                        </div>
                      ))}
                    </div>
                    {users.map((u,i)=>(
                      <div key={i} style={{display:'flex',alignItems:'center',gap:'10px',padding:'8px',border:'1px solid rgba(201,168,76,0.1)',borderRadius:'6px',marginBottom:'7px',background:'rgba(255,255,255,0.02)'}}>
                        <div style={{width:'8px',height:'8px',borderRadius:'50%',background:u.online?'#4CAF50':'#F44336',boxShadow:u.online?'0 0 0 2px rgba(76,175,80,0.3)':'none',flexShrink:0}}/>
                        <div style={{width:'34px',height:'34px',borderRadius:'50%',background:'rgba(201,168,76,0.1)',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'Cinzel,serif',fontSize:'13px',color:'#C9A84C',flexShrink:0}}>{u.username[0].toUpperCase()}</div>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontFamily:'Cinzel,serif',fontSize:'11px',color:'#F0E6CC'}}>{u.username}</div>
                          <div style={{fontSize:'9px',color:'#7A6E5A',marginTop:'1px'}}>{u.digi_nombre?`Ser: ${u.digi_nombre}`:' Sin digisér'} · Unido: Día {u.joined_day}</div>
                        </div>
                        <span style={{fontSize:'8px',fontFamily:'Cinzel,serif',padding:'2px 6px',borderRadius:'10px',border:`1px solid ${u.role==='god'?'#C9A84C44':u.role==='demigod'?'#CE93D844':'#4CAF5044'}`,color:u.role==='god'?'#C9A84C':u.role==='demigod'?'#CE93D8':'#4CAF50',background:u.role==='god'?'#C9A84C11':u.role==='demigod'?'#CE93D811':'#4CAF5011'}}>
                          {u.role==='god'?'Dios Soberano':u.role==='demigod'?'Dios-Humano':'Habitante'}
                        </span>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {/* RIGHT — ficha */}
        <div style={{background:'#0F0F18',borderLeft:'1px solid rgba(201,168,76,0.1)',overflowY:'auto',display:'flex',flexDirection:'column'}}>
          {myDigi && !selDigi && (
            <div onClick={()=>setSelDigi(myDigi)} style={{padding:'8px 13px',background:'rgba(201,168,76,0.05)',borderBottom:'1px solid rgba(201,168,76,0.1)',cursor:'pointer',display:'flex',alignItems:'center',gap:'8px'}}>
              <div>
                <div style={{fontFamily:'Cinzel,serif',fontSize:'8px',letterSpacing:'0.12em',color:'#C9A84C',textTransform:'uppercase'}}>Tu digisér</div>
                <div style={{fontSize:'12px',color:'#F0E6CC',fontStyle:'italic'}}>{myDigi.nombre}</div>
              </div>
            </div>
          )}
          {!selDigi ? (
            <div style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'20px',textAlign:'center',gap:'8px',color:'#7A6E5A',fontStyle:'italic',fontSize:'12px'}}>
              <div style={{fontSize:'26px',opacity:0.13}}>⊕</div>
              <span>Haz click en un ser del mapa</span>
            </div>
          ) : (
            <DigiPanel digi={selDigi} user={user} sprite={sprites[selDigi.id]} isGod={isGod} onDivine={handleDivine} onClose={()=>setSelDigi(null)}/>
          )}
        </div>
      </div>
      <style>{`@keyframes pulse-gold{0%,100%{box-shadow:0 0 0 0 rgba(201,168,76,0.5)}50%{box-shadow:0 0 0 5px rgba(201,168,76,0)}}`}</style>
    </div>
  )
}

function DigiPanel({digi,user,sprite,isGod,onDivine,onClose}:any){
  const sc=STAGE_COLORS[digi.etapa]||'#888'
  const sn=STAGE_NAMES[digi.etapa]||'?'
  const isMine=digi.tamer_id===user.id
  return (
    <>
      <div style={{padding:'12px 13px',borderBottom:'1px solid rgba(201,168,76,0.1)',background:'#151520'}}>
        <div style={{display:'flex',gap:'10px',alignItems:'flex-start',marginBottom:'8px'}}>
          <div style={{width:'60px',height:'60px',borderRadius:'7px',overflow:'hidden',border:'1px solid rgba(201,168,76,0.22)',background:'rgba(255,255,255,0.02)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
            {sprite?<img src={sprite} alt={digi.nombre} style={{width:'56px',height:'56px',objectFit:'contain',imageRendering:'pixelated'}}/>:<span style={{fontSize:'26px'}}>🥚</span>}
          </div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontFamily:'Cinzel,serif',fontSize:'13px',color:'#F0E6CC',fontWeight:500}}>{digi.nombre}{isMine&&<span style={{color:'#C9A84C',fontSize:'9px'}}> ★</span>}</div>
            <div style={{fontSize:'10px',color:'#7A6E5A',marginTop:'2px',fontStyle:'italic'}}>{digi.elemento} · {digi.edad} días</div>
            <div style={{display:'flex',alignItems:'center',gap:'6px',marginTop:'5px'}}>
              <span style={{fontFamily:'Cinzel,serif',fontSize:'19px',color:'#C9A84C',lineHeight:1}}>{digi.nivel}</span>
              <span style={{fontSize:'8px',color:'#7A6E5A'}}>NV</span>
              <div style={{width:'50px',height:'2px',background:'rgba(255,255,255,0.06)',borderRadius:'2px',overflow:'hidden'}}><div style={{height:'100%',background:'#C9A84C',width:`${digi.nivel}%`,borderRadius:'2px'}}/></div>
            </div>
            <div style={{display:'flex',gap:'3px',flexWrap:'wrap',marginTop:'5px'}}>
              <span style={{display:'inline-block',fontFamily:'Cinzel,serif',fontSize:'7px',letterSpacing:'0.07em',padding:'2px 6px',borderRadius:'10px',border:`1px solid ${sc}44`,color:sc,background:`${sc}11`}}>{sn}</span>
            </div>
          </div>
          <span onClick={onClose} style={{cursor:'pointer',color:'#7A6E5A',fontSize:'16px',lineHeight:1}}>✕</span>
        </div>
      </div>
      <FSec title="Estadísticas">
        {[['HP',Math.round(digi.hp/(digi.hp_max||20)*100),'#2ECC71'],['Fuerza',digi.fuerza,'#F44336'],['Inteligencia',digi.inteligencia,'#2196F3'],['Velocidad',digi.velocidad,'#FF9800']].map(([n,v,c]:any)=>(
          <div key={n} style={{display:'flex',alignItems:'center',gap:'6px',marginBottom:'3px'}}>
            <span style={{fontSize:'9px',color:'#7A6E5A',width:'68px',flexShrink:0}}>{n}</span>
            <div style={{flex:1,height:'2px',background:'rgba(255,255,255,0.06)',borderRadius:'2px',overflow:'hidden'}}><div style={{height:'100%',background:c,width:`${v}%`,borderRadius:'2px'}}/></div>
            <span style={{fontSize:'9px',color:'#D4C5A9',width:'20px',textAlign:'right',fontFamily:'Cinzel,serif'}}>{v}</span>
          </div>
        ))}
      </FSec>
      <FSec title="Sangre divina">
        <div style={{fontFamily:'Cinzel,serif',fontSize:'18px',color:'#C9A84C',textAlign:'center',padding:'2px 0'}}>{digi.genes_divinos?.toFixed(4)}%</div>
      </FSec>
      {digi.log?.length>0 && (
        <FSec title="Historial">
          {digi.log.slice(0,5).map((l:any,i:number)=>(
            <div key={i} style={{padding:'3px 0',borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
              <div style={{fontFamily:'Cinzel,serif',fontSize:'8px',letterSpacing:'0.1em',color:l.tipo==='BENDICIÓN'?'#4CAF50':l.tipo==='MALDICIÓN'?'#F44336':'#C9A84C',marginBottom:'1px'}}>{l.tipo}</div>
              <div style={{fontSize:'10px',color:'#7A6E5A',fontStyle:'italic'}}>{l.descripcion}</div>
            </div>
          ))}
        </FSec>
      )}
      <div style={{padding:'8px 13px',display:'flex',flexDirection:'column',gap:'4px'}}>
        <div style={{fontFamily:'Cinzel,serif',fontSize:'8px',letterSpacing:'0.16em',color:'#7A6E5A',textTransform:'uppercase',marginBottom:'4px'}}>Acciones</div>
        <DBtn color="#4CAF50" disabled={!isGod} onClick={()=>onDivine('bless')}>Bendecir a {digi.nombre}</DBtn>
        <DBtn color="#F44336" disabled={!isGod} onClick={()=>onDivine('curse')}>Maldecir a {digi.nombre}</DBtn>
        <DBtn color="#C9A84C" disabled={!isGod} onClick={()=>onDivine('eliminate')}>Reiniciar (volver a huevo)</DBtn>
      </div>
    </>
  )
}

function FSec({title,children}:any){
  return (
    <div style={{padding:'8px 13px',borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
      <div style={{fontFamily:'Cinzel,serif',fontSize:'8px',letterSpacing:'0.16em',color:'#7A6E5A',textTransform:'uppercase',marginBottom:'6px'}}>{title}</div>
      {children}
    </div>
  )
}

function DBtn({color,disabled,onClick,children}:any){
  return (
    <button onClick={onClick} disabled={disabled} style={{padding:'5px 9px',borderRadius:'3px',fontFamily:'Cinzel,serif',fontSize:'9px',letterSpacing:'0.07em',cursor:disabled?'not-allowed':'pointer',border:`1px solid ${color}33`,background:`${color}11`,color:disabled?'rgba(255,255,255,0.2)':color,opacity:disabled?0.4:1,textAlign:'center',width:'100%',transition:'all 0.2s'}}>
      {children}
    </button>
  )
}

function Div(){return <div style={{width:'1px',height:'20px',background:'rgba(201,168,76,0.14)',flexShrink:0}}/>}
function TStat({v,l}:{v:string,l:string}){return <div style={{display:'flex',flexDirection:'column',alignItems:'center',minWidth:'36px'}}><span style={{fontFamily:'Cinzel,serif',fontSize:'11px',color:'#C9A84C'}}>{v}</span><span style={{fontSize:'8px',color:'#7A6E5A',letterSpacing:'0.06em',whiteSpace:'nowrap'}}>{l}</span></div>}
function TBtn({children,onClick,color='#7A6E5A',style={}}:any){return <div onClick={onClick} style={{fontFamily:'Cinzel,serif',fontSize:'9px',cursor:'pointer',padding:'3px 8px',borderRadius:'3px',border:`1px solid ${color}44`,background:`${color}0A`,color,transition:'all 0.2s',whiteSpace:'nowrap',flexShrink:0,...style}}>{children}</div>}
function PTitle({children}:any){return <div style={{fontFamily:'Cinzel,serif',fontSize:'9px',letterSpacing:'0.18em',color:'#7A6E5A',padding:'0 12px 6px',textTransform:'uppercase'}}>{children}</div>}
