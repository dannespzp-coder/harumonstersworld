'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Cookies from 'js-cookie'
import { login, register } from '@/lib/api'

export default function LoginPage() {
  const router = useRouter()
  const [mode, setMode]     = useState<'login'|'register'>('login')
  const [user, setUser]     = useState('')
  const [pass, setPass]     = useState('')
  const [pass2, setPass2]   = useState('')
  const [err, setErr]       = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin() {
    setErr(''); setLoading(true)
    try {
      const data = await login(user, pass)
      Cookies.set('hmw_token', data.token, { expires: 7 })
      Cookies.set('hmw_user', JSON.stringify(data.user), { expires: 7 })
      router.push('/world')
    } catch (e: any) {
      setErr(e?.response?.data?.detail || 'Error al iniciar sesión')
    } finally { setLoading(false) }
  }

  async function handleRegister() {
    setErr('')
    if (pass !== pass2) { setErr('Las contraseñas no coinciden'); return }
    setLoading(true)
    try {
      const data = await register(user, pass)
      Cookies.set('hmw_token', data.token, { expires: 7 })
      Cookies.set('hmw_user', JSON.stringify(data.user), { expires: 7 })
      router.push('/welcome')
    } catch (e: any) {
      setErr(e?.response?.data?.detail || 'Error al registrarse')
    } finally { setLoading(false) }
  }

  return (
    <div style={{
      minHeight:'100vh',background:'#0A0A0F',display:'flex',
      alignItems:'center',justifyContent:'center',padding:'24px'
    }}>
      {/* partículas */}
      <div style={{position:'fixed',inset:0,overflow:'hidden',pointerEvents:'none',zIndex:0}}>
        {[...Array(12)].map((_,i)=>(
          <div key={i} style={{
            position:'absolute',borderRadius:'50%',background:'#C9A84C',
            width:`${Math.random()*3+1}px`,height:`${Math.random()*3+1}px`,
            left:`${Math.random()*100}%`,
            opacity:0.12,
            animation:`float ${6+Math.random()*8}s ease-in-out ${Math.random()*6}s infinite`
          }}/>
        ))}
      </div>

      <div style={{
        position:'relative',zIndex:1,background:'#0F0F18',
        border:'1px solid rgba(201,168,76,0.25)',borderRadius:'12px',
        padding:'32px',width:'100%',maxWidth:'400px'
      }}>
        {/* Logo */}
        <div style={{textAlign:'center',marginBottom:'24px'}}>
          <div style={{fontFamily:'"Cinzel Decorative",serif',fontSize:'20px',color:'#C9A84C',letterSpacing:'0.1em'}}>
            HARUMONSTERSWORLD
          </div>
          <div style={{fontFamily:'Cinzel,serif',fontSize:'9px',letterSpacing:'0.22em',color:'#7A6E5A',marginTop:'4px'}}>
            EL DIGITAL WORLD TE ESPERA
          </div>
        </div>

        {mode === 'login' ? (
          <>
            <Field label="Usuario" value={user} onChange={setUser} placeholder="tu nombre de usuario"/>
            <Field label="Contraseña" value={pass} onChange={setPass} placeholder="••••••••" type="password"/>
            {err && <p style={{fontSize:'11px',color:'#F44336',marginTop:'6px',fontStyle:'italic'}}>{err}</p>}
            <Btn onClick={handleLogin} disabled={loading}>{loading ? 'Entrando...' : 'Entrar al mundo'}</Btn>
            <div style={{height:'1px',background:'rgba(201,168,76,0.12)',margin:'16px 0'}}/>
            <div style={{fontSize:'12px',color:'#7A6E5A',textAlign:'center',marginBottom:'8px'}}>¿Primera vez aquí?</div>
            <GhostBtn onClick={()=>{setMode('register');setErr('')}}>Crear cuenta</GhostBtn>
          </>
        ) : (
          <>
            <div style={{fontFamily:'Cinzel,serif',fontSize:'12px',color:'#F0E6CC',textAlign:'center',marginBottom:'14px'}}>
              Crear cuenta
            </div>
            <Field label="Usuario" value={user} onChange={setUser} placeholder="elige tu nombre"/>
            <Field label="Contraseña" value={pass} onChange={setPass} placeholder="••••••••" type="password"/>
            <Field label="Confirmar contraseña" value={pass2} onChange={setPass2} placeholder="••••••••" type="password"/>
            {err && <p style={{fontSize:'11px',color:'#F44336',marginTop:'6px',fontStyle:'italic'}}>{err}</p>}
            <Btn onClick={handleRegister} disabled={loading}>{loading ? 'Creando...' : 'Crear cuenta'}</Btn>
            <GhostBtn onClick={()=>{setMode('login');setErr('')}} style={{marginTop:'6px'}}>← Volver al login</GhostBtn>
          </>
        )}
      </div>

      <style>{`
        @keyframes float {
          0%{opacity:0;transform:translateY(100vh) scale(0)}
          20%{opacity:0.15}80%{opacity:0.08}
          100%{opacity:0;transform:translateY(-20px) scale(1)}
        }
      `}</style>
    </div>
  )
}

function Field({ label, value, onChange, placeholder, type='text' }: any) {
  return (
    <div style={{marginBottom:'12px'}}>
      <label style={{fontFamily:'Cinzel,serif',fontSize:'10px',letterSpacing:'0.14em',color:'#7A6E5A',display:'block',marginBottom:'5px',textTransform:'uppercase'}}>
        {label}
      </label>
      <input
        type={type} value={value} onChange={e=>onChange(e.target.value)}
        placeholder={placeholder}
        style={{width:'100%',background:'rgba(255,255,255,0.04)',border:'1px solid rgba(201,168,76,0.18)',borderRadius:'5px',padding:'9px 12px',color:'#F0E6CC',fontFamily:'"Crimson Pro",serif',fontSize:'14px',outline:'none'}}
        onKeyDown={e=>{ if(e.key==='Enter') (document.activeElement as HTMLElement)?.blur() }}
      />
    </div>
  )
}

function Btn({ children, onClick, disabled }: any) {
  return (
    <button onClick={onClick} disabled={disabled} style={{width:'100%',padding:'10px',borderRadius:'5px',fontFamily:'Cinzel,serif',fontSize:'11px',letterSpacing:'0.12em',cursor:'pointer',background:'rgba(201,168,76,0.12)',border:'1px solid rgba(201,168,76,0.38)',color:'#C9A84C',marginTop:'6px',transition:'all 0.2s'}}>
      {children}
    </button>
  )
}

function GhostBtn({ children, onClick, style }: any) {
  return (
    <button onClick={onClick} style={{width:'100%',padding:'9px',borderRadius:'5px',fontFamily:'Cinzel,serif',fontSize:'10px',letterSpacing:'0.1em',cursor:'pointer',background:'transparent',border:'1px solid rgba(255,255,255,0.1)',color:'#7A6E5A',...style}}>
      {children}
    </button>
  )
}
