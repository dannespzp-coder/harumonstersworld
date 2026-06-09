'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Cookies from 'js-cookie'

export default function Home() {
  const router = useRouter()
  useEffect(() => {
    const token = Cookies.get('hmw_token')
    if (token) router.push('/world')
    else router.push('/login')
  }, [router])
  return (
    <div style={{
      display:'flex',alignItems:'center',justifyContent:'center',
      minHeight:'100vh',background:'#0A0A0F',
      fontFamily:'"Cinzel Decorative",serif',fontSize:'18px',color:'#C9A84C'
    }}>
      Harumonstersworld...
    </div>
  )
}
