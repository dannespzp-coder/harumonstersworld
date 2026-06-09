from fastapi import FastAPI, HTTPException, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from typing import Optional, List
import asyncpg
import bcrypt
import jwt
import os
import math
from datetime import datetime, timedelta, date
from world_engine import start_engine

app = FastAPI(title="Harumonstersworld API")
_scheduler = None

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DATABASE_URL = os.getenv("DATABASE_URL")
JWT_SECRET   = os.getenv("JWT_SECRET", "harumonstersworld_secret")
GOD_PASSWORD = os.getenv("GOD_PASSWORD", "danielharu123")
WORLD_EPOCH  = date(2025, 1, 1)

security = HTTPBearer()

# ── DB pool ──────────────────────────────────────────
async def get_db():
    conn = await asyncpg.connect(DATABASE_URL)
    try:
        yield conn
    finally:
        await conn.close()

def world_day() -> int:
    return max(1, (date.today() - WORLD_EPOCH).days + 1)

# ── Auth helpers ─────────────────────────────────────
def make_token(user_id: str, role: str) -> str:
    payload = {
        "sub": user_id,
        "role": role,
        "exp": datetime.utcnow() + timedelta(days=7)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")

def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
    except Exception:
        raise HTTPException(status_code=401, detail="Token inválido")

async def current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db=Depends(get_db)
):
    data = decode_token(credentials.credentials)
    row = await db.fetchrow("SELECT * FROM usuarios WHERE id=$1", data["sub"])
    if not row:
        raise HTTPException(status_code=401, detail="Usuario no encontrado")
    return dict(row)

def require_god(user=Depends(current_user)):
    if user["role"] not in ("god", "demigod"):
        raise HTTPException(status_code=403, detail="Se requiere rol divino")
    return user

# ── Startup: crear usuario dios si no existe ─────────
@app.on_event("startup")
async def startup():
    global _scheduler
    conn = await asyncpg.connect(DATABASE_URL)
    try:
        exists = await conn.fetchrow("SELECT id FROM usuarios WHERE username='haru'")
        if not exists:
            hashed = bcrypt.hashpw(GOD_PASSWORD.encode(), bcrypt.gensalt()).decode()
            await conn.execute(
                "INSERT INTO usuarios (username, password_hash, role, joined_day) VALUES ($1,$2,'god',$3)",
                "haru", hashed, world_day()
            )
    finally:
        await conn.close()
    # Arrancar motor del mundo
    _scheduler = start_engine()

@app.on_event("shutdown")
async def shutdown():
    global _scheduler
    if _scheduler:
        _scheduler.shutdown()

# ── MODELOS ───────────────────────────────────────────
class LoginBody(BaseModel):
    username: str
    password: str

class RegisterBody(BaseModel):
    username: str
    password: str

class CreateDigiBody(BaseModel):
    nombre: str
    biome_slug: str

class UpdateDigiBody(BaseModel):
    nivel:        Optional[int] = None
    etapa:        Optional[int] = None
    hp:           Optional[int] = None
    hp_max:       Optional[int] = None
    fuerza:       Optional[int] = None
    inteligencia: Optional[int] = None
    velocidad:    Optional[int] = None
    fe:           Optional[float] = None
    caos:         Optional[float] = None
    lealtad:      Optional[float] = None
    agresion:     Optional[float] = None
    curiosidad:   Optional[float] = None
    alineamiento: Optional[str] = None
    genes_divinos:Optional[float] = None
    elemento:     Optional[str] = None
    api_species:  Optional[str] = None
    sprite_url:   Optional[str] = None
    status:       Optional[str] = None

class DivineAction(BaseModel):
    tipo:     str   # "bless" | "curse" | "promote" | "eliminate"
    objetivo: str   # UUID del digiser

class PromoteBody(BaseModel):
    username: str

# ── ENDPOINTS ────────────────────────────────────────

@app.get("/")
def root():
    return {"world": "Harumonstersworld", "day": world_day(), "status": "alive"}

# ── Auth ──────────────────────────────────────────────
@app.post("/auth/login")
async def login(body: LoginBody, db=Depends(get_db)):
    user = await db.fetchrow("SELECT * FROM usuarios WHERE username=$1", body.username)
    if not user:
        raise HTTPException(status_code=401, detail="Usuario o contraseña incorrectos")
    if not bcrypt.checkpw(body.password.encode(), user["password_hash"].encode()):
        raise HTTPException(status_code=401, detail="Usuario o contraseña incorrectos")
    await db.execute("UPDATE usuarios SET online=TRUE WHERE id=$1", user["id"])
    token = make_token(str(user["id"]), user["role"])
    return {
        "token": token,
        "user": {
            "id": str(user["id"]),
            "username": user["username"],
            "role": user["role"],
        }
    }

@app.post("/auth/register")
async def register(body: RegisterBody, db=Depends(get_db)):
    if len(body.username) < 3:
        raise HTTPException(status_code=400, detail="Mínimo 3 caracteres")
    if len(body.password) < 6:
        raise HTTPException(status_code=400, detail="Contraseña mínimo 6 caracteres")
    exists = await db.fetchrow("SELECT id FROM usuarios WHERE username=$1", body.username)
    if exists:
        raise HTTPException(status_code=400, detail="Ese nombre ya existe")
    hashed = bcrypt.hashpw(body.password.encode(), bcrypt.gensalt()).decode()
    row = await db.fetchrow(
        "INSERT INTO usuarios (username,password_hash,role,joined_day,online) VALUES ($1,$2,'user',$3,TRUE) RETURNING *",
        body.username, hashed, world_day()
    )
    token = make_token(str(row["id"]), "user")
    return {"token": token, "user": {"id": str(row["id"]), "username": row["username"], "role": row["role"]}}

@app.post("/auth/logout")
async def logout(user=Depends(current_user), db=Depends(get_db)):
    await db.execute("UPDATE usuarios SET online=FALSE WHERE id=$1", user["id"])
    return {"ok": True}

@app.get("/auth/me")
async def me(user=Depends(current_user)):
    return user

# ── Mundo ─────────────────────────────────────────────
@app.get("/world")
async def world_info(db=Depends(get_db)):
    seres     = await db.fetchval("SELECT COUNT(*) FROM digiseres WHERE vivo=TRUE")
    online    = await db.fetchval("SELECT COUNT(*) FROM usuarios WHERE online=TRUE")
    combates  = await db.fetchval("SELECT COUNT(*) FROM digiseres WHERE status='combat'")
    return {
        "day":      world_day(),
        "seres":    seres,
        "online":   online,
        "combates": combates,
    }

# ── Biomas ────────────────────────────────────────────
@app.get("/biomas")
async def get_biomas(db=Depends(get_db)):
    rows = await db.fetch("SELECT * FROM biomas ORDER BY nombre")
    return [dict(r) for r in rows]

# ── Digiseres ─────────────────────────────────────────
@app.get("/digiseres")
async def get_digiseres(bioma: Optional[str] = None, db=Depends(get_db)):
    if bioma:
        rows = await db.fetch("""
            SELECT d.*, b.slug as bioma_slug, b.nombre as bioma_nombre, b.emoji as bioma_emoji,
                   u.username as tamer_name
            FROM digiseres d
            LEFT JOIN biomas b ON d.bioma_id=b.id
            LEFT JOIN usuarios u ON d.tamer_id=u.id
            WHERE b.slug=$1 AND d.vivo=TRUE
        """, bioma)
    else:
        rows = await db.fetch("""
            SELECT d.*, b.slug as bioma_slug, b.nombre as bioma_nombre, b.emoji as bioma_emoji,
                   u.username as tamer_name
            FROM digiseres d
            LEFT JOIN biomas b ON d.bioma_id=b.id
            LEFT JOIN usuarios u ON d.tamer_id=u.id
            WHERE d.vivo=TRUE
        """)
    return [dict(r) for r in rows]

@app.get("/digiseres/{digi_id}")
async def get_digiser(digi_id: str, db=Depends(get_db)):
    row = await db.fetchrow("""
        SELECT d.*, b.slug as bioma_slug, b.nombre as bioma_nombre, b.emoji as bioma_emoji,
               u.username as tamer_name
        FROM digiseres d
        LEFT JOIN biomas b ON d.bioma_id=b.id
        LEFT JOIN usuarios u ON d.tamer_id=u.id
        WHERE d.id=$1
    """, digi_id)
    if not row:
        raise HTTPException(status_code=404, detail="Digiser no encontrado")
    digi = dict(row)
    # Cargar relaciones
    rels = await db.fetch("""
        SELECT r.*, d.nombre as nombre_b
        FROM relaciones r
        JOIN digiseres d ON d.id=r.ser_b
        WHERE r.ser_a=$1
    """, digi_id)
    digi["relaciones"] = [dict(r) for r in rels]
    # Cargar log
    logs = await db.fetch("""
        SELECT * FROM eventos WHERE ser_id=$1 ORDER BY created_at DESC LIMIT 20
    """, digi_id)
    digi["log"] = [dict(l) for l in logs]
    # Cargar familia
    fam = await db.fetchrow("SELECT * FROM familia WHERE hijo_id=$1", digi_id)
    if fam:
        digi["familia"] = dict(fam)
    return digi

@app.post("/digiseres")
async def create_digiser(body: CreateDigiBody, user=Depends(current_user), db=Depends(get_db)):
    # Verificar que no tenga ya un digiser
    existing = await db.fetchrow("SELECT id FROM digiseres WHERE tamer_id=$1 AND vivo=TRUE", user["id"])
    if existing and user["role"] == "user":
        raise HTTPException(status_code=400, detail="Ya tienes un digiser vivo")
    bioma = await db.fetchrow("SELECT * FROM biomas WHERE slug=$1", body.biome_slug)
    if not bioma:
        raise HTTPException(status_code=404, detail="Bioma no encontrado")
    # Posición según bioma
    positions = {
        "forest":  (25, 30),
        "sea":     (75, 25),
        "volcano": (25, 75),
        "void":    (75, 75),
    }
    px, py = positions.get(body.biome_slug, (50, 50))
    import random
    px += random.uniform(-8, 8)
    py += random.uniform(-8, 8)

    row = await db.fetchrow("""
        INSERT INTO digiseres
          (nombre, bioma_id, tamer_id, nivel, etapa, genes_divinos, pos_x, pos_y, status)
        VALUES ($1, $2, $3, 1, 0, 0.001, $4, $5, 'egg')
        RETURNING *
    """, body.nombre, bioma["id"], user["id"], px, py)

    # Log de nacimiento
    await db.execute("""
        INSERT INTO eventos (ser_id, tipo, descripcion, dia_mundo)
        VALUES ($1, 'NACIMIENTO', $2, $3)
    """, row["id"], f"Nació como huevo en {bioma['nombre']}. Tamer: {user['username']}.", world_day())

    # Yggmon log
    await db.execute("""
        INSERT INTO yggmon_log (tipo, descripcion, objetivo_id, dia_mundo)
        VALUES ('CREACIÓN', $1, $2, $3)
    """, f"{body.nombre} nació en {bioma['nombre']} — tamer: {user['username']}.", row["id"], world_day())

    return dict(row)

@app.patch("/digiseres/{digi_id}")
async def update_digiser(digi_id: str, body: UpdateDigiBody, user=Depends(require_god), db=Depends(get_db)):
    updates = {k: v for k, v in body.dict().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="Nada que actualizar")
    fields = ", ".join([f"{k}=${i+2}" for i, k in enumerate(updates.keys())])
    values = list(updates.values())
    await db.execute(f"UPDATE digiseres SET {fields} WHERE id=$1", digi_id, *values)
    # Log del cambio
    cambios = ", ".join([f"{k}={v}" for k, v in updates.items()])
    await db.execute("""
        INSERT INTO eventos (ser_id, tipo, descripcion, dia_mundo)
        VALUES ($1, 'EDICION', $2, $3)
    """, digi_id, f"Dios editó: {cambios}", world_day())
    return {"ok": True, "updated": updates}

# ── Acciones divinas ──────────────────────────────────
@app.post("/divine")
async def divine_action(body: DivineAction, user=Depends(require_god), db=Depends(get_db)):
    digi = await db.fetchrow("SELECT * FROM digiseres WHERE id=$1", body.objetivo)
    if not digi:
        raise HTTPException(status_code=404, detail="Digiser no encontrado")

    if body.tipo == "bless":
        await db.execute("""
            UPDATE digiseres SET fe=LEAST(fe+0.1,1), hp=LEAST(hp+10,hp_max),
            nivel=LEAST(nivel+2,100) WHERE id=$1
        """, body.objetivo)
        desc = f"Yggmon bendijo a {digi['nombre']} — fe y poder aumentados."

    elif body.tipo == "curse":
        await db.execute("""
            UPDATE digiseres SET agresion=LEAST(agresion+0.15,1),
            hp=GREATEST(hp-15,1) WHERE id=$1
        """, body.objetivo)
        desc = f"Yggmon maldijo a {digi['nombre']} — marcado por la oscuridad."

    elif body.tipo == "eliminate":
        await db.execute("UPDATE digiseres SET vivo=FALSE, status='dead' WHERE id=$1", body.objetivo)
        await db.execute("""
            INSERT INTO digiseres
              (nombre, bioma_id, tamer_id, nivel, etapa, genes_divinos, pos_x, pos_y, status)
            SELECT nombre||' (Renacido)', bioma_id, tamer_id, 1, 0,
                   genes_divinos*0.3, pos_x, pos_y, 'egg'
            FROM digiseres WHERE id=$1
        """, body.objetivo)
        desc = f"Yggmon eliminó a {digi['nombre']} — renació como huevo."

    else:
        raise HTTPException(status_code=400, detail="Tipo de acción inválido")

    await db.execute("""
        INSERT INTO eventos (ser_id, tipo, descripcion, dia_mundo)
        VALUES ($1, $2, $3, $4)
    """, body.objetivo, body.tipo.upper(), desc, world_day())

    await db.execute("""
        INSERT INTO yggmon_log (tipo, descripcion, objetivo_id, ejecutado_por, dia_mundo)
        VALUES ($1, $2, $3, $4, $5)
    """, body.tipo.upper(), desc, body.objetivo, user["id"], world_day())

    return {"ok": True, "desc": desc}

# ── Promover usuario a demigod ────────────────────────
@app.post("/promote")
async def promote(body: PromoteBody, user=Depends(require_god), db=Depends(get_db)):
    if user["role"] != "god":
        raise HTTPException(status_code=403, detail="Solo el Dios Soberano puede promover")
    target = await db.fetchrow("SELECT * FROM usuarios WHERE username=$1", body.username)
    if not target:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    await db.execute("UPDATE usuarios SET role='demigod' WHERE id=$1", target["id"])
    await db.execute("""
        INSERT INTO yggmon_log (tipo, descripcion, ejecutado_por, dia_mundo)
        VALUES ('ASCENSIÓN', $1, $2, $3)
    """, f"{body.username} fue elevado a Dios-Humano.", user["id"], world_day())
    return {"ok": True}

# ── Usuarios ──────────────────────────────────────────
@app.get("/usuarios")
async def get_usuarios(user=Depends(require_god), db=Depends(get_db)):
    rows = await db.fetch("""
        SELECT u.*, d.nombre as digi_nombre, d.id as digi_id, b.slug as bioma_slug, b.emoji as bioma_emoji
        FROM usuarios u
        LEFT JOIN digiseres d ON d.tamer_id=u.id AND d.vivo=TRUE
        LEFT JOIN biomas b ON d.bioma_id=b.id
        ORDER BY u.created_at ASC
    """)
    return [dict(r) for r in rows]

# ── Yggmon log ────────────────────────────────────────
@app.get("/yggmon")
async def get_yggmon_log(user=Depends(current_user), db=Depends(get_db)):
    rows = await db.fetch("""
        SELECT y.*, u.username as ejecutado_por_nombre, d.nombre as objetivo_nombre
        FROM yggmon_log y
        LEFT JOIN usuarios u ON y.ejecutado_por=u.id
        LEFT JOIN digiseres d ON y.objetivo_id=d.id
        ORDER BY y.created_at DESC LIMIT 50
    """)
    return [dict(r) for r in rows]

# ── Eventos del mundo (feed) ──────────────────────────
@app.get("/eventos")
async def get_eventos(db=Depends(get_db)):
    rows = await db.fetch("""
        SELECT e.*, d.nombre as digi_nombre
        FROM eventos e
        JOIN digiseres d ON e.ser_id=d.id
        ORDER BY e.created_at DESC LIMIT 30
    """)
    return [dict(r) for r in rows]

# ── Mitología ─────────────────────────────────────────
@app.get("/mitologia")
async def get_mitologia(db=Depends(get_db)):
    rows = await db.fetch("SELECT * FROM mitologia ORDER BY dia_origen ASC")
    return [dict(r) for r in rows]

# ── Reset mundo ───────────────────────────────────────
@app.post("/world/reset")
async def reset_world(user=Depends(require_god), db=Depends(get_db)):
    result = await db.fetchval("SELECT reiniciar_mundo()")
    return {"ok": True, "msg": result}

# ── Fusión ────────────────────────────────────────────
class FusionBody(BaseModel):
    ser_a: str
    ser_b: str
    tipo: str = "temporal"

@app.post("/fusion")
async def crear_fusion(body: FusionBody, user=Depends(current_user), db=Depends(get_db)):
    da = await db.fetchrow("SELECT * FROM digiseres WHERE id=$1 AND vivo=TRUE", body.ser_a)
    db2 = await db.fetchrow("SELECT * FROM digiseres WHERE id=$1 AND vivo=TRUE", body.ser_b)
    if not da or not db2:
        raise HTTPException(status_code=404, detail="Digiser no encontrado")
    # Solo puede fusionar si es dios o es su propio digiser
    if user["role"] not in ("god","demigod"):
        if str(da["tamer_id"]) != str(user["id"]) and str(db2["tamer_id"]) != str(user["id"]):
            raise HTTPException(status_code=403, detail="Solo puedes fusionar tu propio digiser")

    # Calcular stats del fusionado
    nombre_fusion = f"{da['nombre'][:5]}+{db2['nombre'][:5]}"
    genes = (da['genes_divinos'] + db2['genes_divinos']) * 0.8
    bioma_id = da['bioma_id']

    resultado_id = await db.fetchval("""
        INSERT INTO digiseres
          (nombre, bioma_id, nivel, etapa, genes_divinos, pos_x, pos_y,
           hp, hp_max, fuerza, inteligencia, velocidad,
           fe, caos, lealtad, agresion, curiosidad,
           alineamiento, elemento, api_species, status)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,'idle')
        RETURNING id
    """,
        nombre_fusion, bioma_id,
        min(100, (da['nivel'] + db2['nivel']) // 2 + 10),
        max(da['etapa'], db2['etapa']),
        genes,
        (da['pos_x'] + db2['pos_x']) / 2,
        (da['pos_y'] + db2['pos_y']) / 2,
        da['hp_max'] + db2['hp_max'],
        da['hp_max'] + db2['hp_max'],
        int((da['fuerza'] + db2['fuerza']) * 0.9),
        int((da['inteligencia'] + db2['inteligencia']) * 0.9),
        int((da['velocidad'] + db2['velocidad']) * 0.9),
        (da['fe'] + db2['fe']) / 2,
        (da['caos'] + db2['caos']) / 2,
        (da['lealtad'] + db2['lealtad']) / 2,
        (da['agresion'] + db2['agresion']) / 2,
        (da['curiosidad'] + db2['curiosidad']) / 2,
        da['alineamiento'], da['elemento'], da['api_species']
    )

    # Registrar fusión
    await db.execute("""
        INSERT INTO fusiones_activas (ser_a, ser_b, resultado_id, tipo, dias_restantes, iniciada_dia)
        VALUES ($1,$2,$3,$4,$5,$6)
    """, body.ser_a, body.ser_b, resultado_id, body.tipo,
        7 if body.tipo == 'temporal' else None, world_day())

    # Desactivar originales si permanente
    if body.tipo == 'permanente':
        await db.execute("UPDATE digiseres SET vivo=FALSE WHERE id=$1 OR id=$2", body.ser_a, body.ser_b)

    await db.execute("""
        INSERT INTO eventos (ser_id, tipo, descripcion, dia_mundo)
        VALUES ($1,'FUSION',$2,$3)
    """, resultado_id, f"Nació de la fusión de {da['nombre']} y {db2['nombre']}.", world_day())

    await db.execute("""
        INSERT INTO yggmon_log (tipo, descripcion, objetivo_id, dia_mundo)
        VALUES ('FUSIÓN',$1,$2,$3)
    """, f"{da['nombre']} y {db2['nombre']} se fusionaron en {nombre_fusion}.", resultado_id, world_day())

    return {"ok": True, "resultado_id": str(resultado_id), "nombre": nombre_fusion}

# ── Config mundo ──────────────────────────────────────
@app.get("/world/config")
async def get_config(user=Depends(require_god), db=Depends(get_db)):
    rows = await db.fetch("SELECT * FROM mundo_config")
    return {r['key']: r['value'] for r in rows}

@app.patch("/world/config")
async def update_config(data: dict, user=Depends(require_god), db=Depends(get_db)):
    for k, v in data.items():
        await db.execute(
            "INSERT INTO mundo_config (key,value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value=$2",
            k, str(v)
        )
    return {"ok": True}
