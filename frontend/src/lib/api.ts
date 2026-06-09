import axios from 'axios'
import Cookies from 'js-cookie'

const API = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000',
})

API.interceptors.request.use(cfg => {
  const token = Cookies.get('hmw_token')
  if (token) cfg.headers.Authorization = `Bearer ${token}`
  return cfg
})

export default API

// ── Auth ──────────────────────────────────────────────
export const login = (username: string, password: string) =>
  API.post('/auth/login', { username, password }).then(r => r.data)

export const register = (username: string, password: string) =>
  API.post('/auth/register', { username, password }).then(r => r.data)

export const logout = () =>
  API.post('/auth/logout').then(r => r.data)

export const me = () =>
  API.get('/auth/me').then(r => r.data)

// ── Mundo ─────────────────────────────────────────────
export const worldInfo = () =>
  API.get('/world').then(r => r.data)

export const getBiomas = () =>
  API.get('/biomas').then(r => r.data)

export const getDigiseres = (bioma?: string) =>
  API.get('/digiseres', { params: bioma ? { bioma } : {} }).then(r => r.data)

export const getDigiser = (id: string) =>
  API.get(`/digiseres/${id}`).then(r => r.data)

export const createDigiser = (nombre: string, biome_slug: string) =>
  API.post('/digiseres', { nombre, biome_slug }).then(r => r.data)

export const updateDigiser = (id: string, data: Record<string, unknown>) =>
  API.patch(`/digiseres/${id}`, data).then(r => r.data)

export const divineAction = (tipo: string, objetivo: string) =>
  API.post('/divine', { tipo, objetivo }).then(r => r.data)

export const promoteUser = (username: string) =>
  API.post('/promote', { username }).then(r => r.data)

export const getUsuarios = () =>
  API.get('/usuarios').then(r => r.data)

export const getYggmonLog = () =>
  API.get('/yggmon').then(r => r.data)

export const getEventos = () =>
  API.get('/eventos').then(r => r.data)

// ── Sprites ───────────────────────────────────────────
const spriteCache: Record<string, string> = {}

export async function getSprite(apiSpecies: string, spriteUrl?: string): Promise<string | null> {
  if (spriteUrl) return spriteUrl
  if (spriteCache[apiSpecies]) return spriteCache[apiSpecies]
  try {
    const r = await fetch(
      `https://digimon-api.vercel.app/api/digimon/name/${apiSpecies.toLowerCase()}`
    )
    const data = await r.json()
    const url = Array.isArray(data) ? data[0]?.img : data?.img
    if (url) { spriteCache[apiSpecies] = url; return url }
  } catch {}
  return null
}

// ── Día del mundo ─────────────────────────────────────
export function worldDay(): number {
  const epoch = new Date('2025-01-01').getTime()
  return Math.max(1, Math.floor((Date.now() - epoch) / 86400000) + 1)
}
