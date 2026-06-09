"""
HARUMONSTERSWORLD — Motor de Eventos
Corre cada 5 minutos via APScheduler
Event-driven: cada acción genera reacciones en cadena
"""

import asyncio
import asyncpg
import random
import math
import os
import logging
from datetime import date, datetime
from apscheduler.schedulers.asyncio import AsyncIOScheduler

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("WorldEngine")

DATABASE_URL = os.getenv("DATABASE_URL")
WORLD_EPOCH  = date(2026, 6, 9)  # Día 1 del mundo

# ── Límites de seguridad BD ───────────────────────────
MAX_EVENTOS_TOTAL    = 50_000   # max filas en tabla eventos
MAX_DIGISERES_TOTAL  = 500      # max digiseres vivos
DB_DANGER_THRESHOLD  = 0.85     # 85% = Yggmon actúa
EVENTOS_POR_TICK     = 8        # eventos generados por ciclo

def world_day() -> int:
    return max(1, (date.today() - WORLD_EPOCH).days + 1)

async def get_conn():
    return await asyncpg.connect(DATABASE_URL)

# ══════════════════════════════════════════════════════
# HELPERS
# ══════════════════════════════════════════════════════

def distance(x1, y1, x2, y2) -> float:
    return math.sqrt((x2-x1)**2 + (y2-y1)**2)

def roll(prob: float) -> bool:
    return random.random() < prob

async def log_evento(conn, ser_id: str, tipo: str, desc: str, contexto: dict = None):
    await conn.execute("""
        INSERT INTO eventos (ser_id, tipo, descripcion, contexto, dia_mundo)
        VALUES ($1, $2, $3, $4, $5)
    """, ser_id, tipo, desc, str(contexto) if contexto else None, world_day())

async def log_yggmon(conn, tipo: str, desc: str, objetivo_id: str = None):
    await conn.execute("""
        INSERT INTO yggmon_log (tipo, descripcion, objetivo_id, dia_mundo)
        VALUES ($1, $2, $3, $4)
    """, tipo, desc, objetivo_id, world_day())

# ══════════════════════════════════════════════════════
# EVENTOS INDIVIDUALES
# ══════════════════════════════════════════════════════

async def evento_movimiento(conn, digi: dict):
    """Digiser se mueve dentro de su bioma"""
    bioma = digi['bioma_slug']
    limits = {
        'forest':  (2, 48, 2, 48),
        'sea':     (52, 98, 2, 48),
        'volcano': (2, 48, 52, 98),
        'void':    (52, 98, 52, 98),
    }
    xmin, xmax, ymin, ymax = limits.get(bioma, (2, 98, 2, 98))

    # Movimiento influenciado por personalidad
    paso = 3 + digi['curiosidad'] * 5
    nx = max(xmin, min(xmax, digi['pos_x'] + random.uniform(-paso, paso)))
    ny = max(ymin, min(ymax, digi['pos_y'] + random.uniform(-paso, paso)))

    await conn.execute(
        "UPDATE digiseres SET pos_x=$1, pos_y=$2, edad=edad+1 WHERE id=$3",
        nx, ny, digi['id']
    )

    if roll(0.3):  # No siempre loguear movimiento
        frases = [
            f"{digi['nombre']} exploró los límites de su bioma.",
            f"{digi['nombre']} se desplazó en busca de recursos.",
            f"{digi['nombre']} patrulló su territorio.",
            f"{digi['nombre']} vagó sin rumbo fijo.",
        ]
        await log_evento(conn, digi['id'], 'MOVIMIENTO', random.choice(frases))

async def evento_hambre_descanso(conn, digi: dict):
    """Ciclo básico de vida: hambre reduce HP, descanso lo recupera"""
    if digi['status'] == 'resting':
        # Recuperar HP
        nuevo_hp = min(digi['hp_max'], digi['hp'] + random.randint(5, 15))
        await conn.execute(
            "UPDATE digiseres SET hp=$1, status='idle' WHERE id=$2",
            nuevo_hp, digi['id']
        )
        await log_evento(conn, digi['id'], 'DESCANSO',
            f"{digi['nombre']} descansó y recuperó energía. HP: {nuevo_hp}/{digi['hp_max']}.")
    else:
        # Perder HP por hambre (más agresivos pierden más)
        perdida = random.randint(2, 8) + int(digi['agresion'] * 5)
        nuevo_hp = max(1, digi['hp'] - perdida)

        if nuevo_hp <= digi['hp_max'] * 0.25:
            # Crítico — necesita descanso
            await conn.execute(
                "UPDATE digiseres SET hp=$1, status='resting' WHERE id=$2",
                nuevo_hp, digi['id']
            )
            await log_evento(conn, digi['id'], 'HAMBRE',
                f"{digi['nombre']} está gravemente herido y necesita descansar urgente.")
        else:
            await conn.execute(
                "UPDATE digiseres SET hp=$1 WHERE id=$2",
                nuevo_hp, digi['id']
            )

async def evento_encuentro(conn, digi_a: dict, digi_b: dict):
    """Dos digiseres se cruzan — reacción basada en alineamiento y relaciones"""
    # Verificar si ya tienen relación
    rel = await conn.fetchrow("""
        SELECT * FROM relaciones WHERE
        (ser_a=$1 AND ser_b=$2) OR (ser_a=$2 AND ser_b=$1)
    """, digi_a['id'], digi_b['id'])

    if rel:
        tipo_rel = rel['tipo']
    else:
        # Primera vez que se encuentran — definir relación basada en alineamiento
        a_evil = 'Evil' in (digi_a['alineamiento'] or '')
        b_evil = 'Evil' in (digi_b['alineamiento'] or '')
        a_good = 'Good' in (digi_a['alineamiento'] or '')
        b_good = 'Good' in (digi_b['alineamiento'] or '')

        if (a_evil and b_good) or (a_good and b_evil):
            tipo_rel = 'rivalidad'
        elif a_evil and b_evil:
            tipo_rel = random.choice(['rivalidad', 'alianza', 'neutral'])
        elif a_good and b_good:
            tipo_rel = random.choice(['amistad', 'neutral', 'amistad'])
        else:
            tipo_rel = 'neutral'

        await conn.execute("""
            INSERT INTO relaciones (ser_a, ser_b, tipo, intensidad, origen)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (ser_a, ser_b) DO NOTHING
        """, digi_a['id'], digi_b['id'], tipo_rel,
            random.uniform(0.3, 0.7),
            f"Se encontraron en el Día {world_day()}")

        rel_tipo = tipo_rel
    else:
        rel_tipo = rel['tipo']

    # Reacción al encuentro
    if rel_tipo == 'rivalidad' and roll(0.6):
        await iniciar_combate(conn, digi_a, digi_b)
    elif rel_tipo == 'amistad' and roll(0.4):
        # Compartir experiencia
        xp_bonus = random.randint(2, 8)
        await conn.execute(
            "UPDATE digiseres SET nivel=LEAST(nivel+$1,100) WHERE id=$2 OR id=$3",
            xp_bonus // 4, digi_a['id'], digi_b['id']
        )
        await log_evento(conn, digi_a['id'], 'ENCUENTRO',
            f"{digi_a['nombre']} y {digi_b['nombre']} se encontraron como amigos. Ambos aprendieron algo.")
        await log_evento(conn, digi_b['id'], 'ENCUENTRO',
            f"Compartió un momento con {digi_a['nombre']}.")
    elif rel_tipo == 'amor' and roll(0.2):
        await intentar_reproduccion(conn, digi_a, digi_b)
    else:
        await log_evento(conn, digi_a['id'], 'ENCUENTRO',
            f"{digi_a['nombre']} cruzó su camino con {digi_b['nombre']}. [{rel_tipo}]")

async def iniciar_combate(conn, atacante: dict, defensor: dict):
    """Combate automático entre dos digiseres"""
    # Calcular daño basado en fuerza
    dano_a = int(atacante['fuerza'] * random.uniform(0.5, 1.2))
    dano_b = int(defensor['fuerza'] * random.uniform(0.3, 0.9))

    nuevo_hp_def = max(0, defensor['hp'] - dano_a)
    nuevo_hp_at  = max(0, atacante['hp'] - dano_b)

    await conn.execute(
        "UPDATE digiseres SET hp=$1, status='combat' WHERE id=$2",
        nuevo_hp_def, defensor['id']
    )
    await conn.execute(
        "UPDATE digiseres SET hp=$1, status='combat' WHERE id=$2",
        nuevo_hp_at, atacante['id']
    )

    # Ganar experiencia
    xp = random.randint(3, 12)
    await conn.execute(
        "UPDATE digiseres SET nivel=LEAST(nivel+$1,100) WHERE id=$2",
        xp, atacante['id']
    )

    await log_evento(conn, atacante['id'], 'COMBATE',
        f"{atacante['nombre']} atacó a {defensor['nombre']}. Infligió {dano_a} daño. Recibió {dano_b}.")
    await log_evento(conn, defensor['id'], 'COMBATE',
        f"Fue atacado por {atacante['nombre']}. HP restante: {nuevo_hp_def}/{defensor['hp_max']}.")

    # ¿Murió el defensor?
    if nuevo_hp_def <= 0:
        await evento_muerte(conn, defensor, atacante)
    else:
        # Ambos vuelven a idle después del combate
        await conn.execute(
            "UPDATE digiseres SET status='idle' WHERE id=$1 OR id=$2",
            atacante['id'], defensor['id']
        )
        # Aumentar rivalidad
        await conn.execute("""
            INSERT INTO relaciones (ser_a, ser_b, tipo, intensidad, origen)
            VALUES ($1, $2, 'rivalidad', 0.8, 'Combate')
            ON CONFLICT (ser_a, ser_b) DO UPDATE
            SET tipo='rivalidad', intensidad=LEAST(relaciones.intensidad+0.1, 1.0)
        """, atacante['id'], defensor['id'])

async def evento_muerte(conn, muerto: dict, asesino: dict = None):
    """Digiser muere y vuelve a huevo (Ley del Huevo)"""
    await conn.execute(
        "UPDATE digiseres SET vivo=FALSE, status='dead' WHERE id=$1",
        muerto['id']
    )

    # Pierde 70% de genes divinos al renacer
    nuevos_genes = muerto['genes_divinos'] * 0.30

    # Renacer como huevo en el mismo bioma
    nuevo_id = await conn.fetchval("""
        INSERT INTO digiseres
          (nombre, bioma_id, nivel, etapa, genes_divinos, pos_x, pos_y,
           hp, hp_max, fuerza, inteligencia, velocidad,
           fe, caos, lealtad, agresion, curiosidad,
           alineamiento, elemento, api_species, status)
        VALUES ($1, $2, 1, 0, $3, $4, $5,
                20, 20, 10, 10, 10,
                $6, $7, $8, $9, $10,
                'Sin definir', $11, 'Botamon', 'egg')
        RETURNING id
    """,
        muerto['nombre'] + ' (Renacido)',
        muerto['bioma_id'],
        nuevos_genes,
        muerto['pos_x'] + random.uniform(-5, 5),
        muerto['pos_y'] + random.uniform(-5, 5),
        muerto['fe'] * 0.5,
        muerto['caos'],
        muerto['lealtad'] * 0.7,
        muerto['agresion'],
        muerto['curiosidad'],
        muerto['elemento']
    )

    await log_evento(conn, muerto['id'], 'MUERTE',
        f"{muerto['nombre']} murió. La Ley del Huevo lo devuelve al inicio.")
    await log_evento(conn, nuevo_id, 'NACIMIENTO',
        f"Renació de {muerto['nombre']}. Conserva {nuevos_genes:.6f}% de sangre divina.")

    if asesino:
        await log_evento(conn, asesino['id'], 'VICTORIA',
            f"{asesino['nombre']} derrotó a {muerto['nombre']}. Su poder crece.")

async def intentar_reproduccion(conn, padre: dict, madre: dict):
    """Dos digiseres tienen una cría — genética mixta"""
    # Solo si ambos son Adult o superior
    if padre['etapa'] < 2 or madre['etapa'] < 2:
        return
    # Solo si hay espacio en el bioma
    pop = await conn.fetchval(
        "SELECT COUNT(*) FROM digiseres WHERE bioma_id=$1 AND vivo=TRUE",
        padre['bioma_id']
    )
    if pop >= 40:
        return

    # Genética: 60% dominante + 40% recesivo + mutación
    dom = padre if padre['nivel'] >= madre['nivel'] else madre
    rec = madre if dom == padre else padre

    def mezcla(va, vb, mut=0.05):
        base = va * 0.6 + vb * 0.4
        return max(0.0, min(1.0, base + random.uniform(-mut, mut)))

    genes_hijo = (dom['genes_divinos'] * 0.6 + rec['genes_divinos'] * 0.4) * random.uniform(0.85, 1.05)

    nombre_cria = f"Cría de {dom['nombre'][:6]}"

    nuevo_id = await conn.fetchval("""
        INSERT INTO digiseres
          (nombre, bioma_id, nivel, etapa, genes_divinos, pos_x, pos_y,
           hp, hp_max, fuerza, inteligencia, velocidad,
           fe, caos, lealtad, agresion, curiosidad,
           elemento, api_species, status)
        VALUES ($1, $2, 1, 0, $3, $4, $5,
                20, 20,
                $6, $7, $8,
                $9, $10, $11, $12, $13,
                $14, 'Botamon', 'egg')
        RETURNING id
    """,
        nombre_cria, padre['bioma_id'], genes_hijo,
        (padre['pos_x'] + madre['pos_x']) / 2 + random.uniform(-3,3),
        (padre['pos_y'] + madre['pos_y']) / 2 + random.uniform(-3,3),
        int(mezcla(padre['fuerza'], madre['fuerza']) * 20 + 5),
        int(mezcla(padre['inteligencia'], madre['inteligencia']) * 20 + 5),
        int(mezcla(padre['velocidad'], madre['velocidad']) * 20 + 5),
        mezcla(padre['fe'], madre['fe']),
        mezcla(padre['caos'], madre['caos']),
        mezcla(padre['lealtad'], madre['lealtad']),
        mezcla(padre['agresion'], madre['agresion']),
        mezcla(padre['curiosidad'], madre['curiosidad']),
        padre['elemento']
    )

    # Registrar familia
    await conn.execute("""
        INSERT INTO familia (hijo_id, padre_id, madre_id, generacion)
        VALUES ($1, $2, $3, (
            SELECT COALESCE(MAX(f.generacion), 0) + 1
            FROM familia f WHERE f.padre_id=$2 OR f.madre_id=$3
        ))
    """, nuevo_id, padre['id'], madre['id'])

    await log_evento(conn, padre['id'], 'REPRODUCCION',
        f"{padre['nombre']} y {madre['nombre']} tuvieron una cría: {nombre_cria}.")
    await log_evento(conn, nuevo_id, 'NACIMIENTO',
        f"Nació de {padre['nombre']} y {madre['nombre']}. Genes divinos: {genes_hijo:.6f}%.")

    # Actualizar relación a amor
    await conn.execute("""
        INSERT INTO relaciones (ser_a, ser_b, tipo, intensidad, origen)
        VALUES ($1, $2, 'amor', 0.9, 'Tuvieron una cría')
        ON CONFLICT (ser_a, ser_b) DO UPDATE SET tipo='amor', intensidad=0.9
    """, padre['id'], madre['id'])

async def verificar_evolucion(conn, digi: dict):
    """Verificar si el digiser puede evolucionar"""
    etapa_actual = digi['etapa']
    nivel        = digi['nivel']

    # Requisitos por etapa
    req = {0: 10, 1: 25, 2: 50, 3: 80}  # nivel mínimo para evolucionar
    prob = {0: 0.8, 1: 0.5, 2: 0.25, 3: 0.05}  # probabilidad (Mega muy raro)

    if etapa_actual >= 4:
        return  # Ya es Mega

    req_nivel = req.get(etapa_actual, 999)
    if nivel < req_nivel:
        return

    if not roll(prob.get(etapa_actual, 0)):
        return

    # Mega solo si tiene genes divinos suficientes
    if etapa_actual == 3 and digi['genes_divinos'] < 0.5:
        return

    nueva_etapa = etapa_actual + 1
    etapa_nombres = ['Huevo','Child','Adult','Perfect','Mega']
    api_por_etapa = {
        1: ['Agumon','Gabumon','Patamon','Gomamon','Palmon'],
        2: ['Greymon','Garurumon','Leomon','Meramon','Togemon'],
        3: ['MetalGreymon','WereGarurumon','Zudomon','SkullGreymon','Lillymon'],
        4: ['WarGreymon','MetalGarurumon','Piedmon','Apocalymon','Rosemon'],
    }

    nuevo_api = random.choice(api_por_etapa.get(nueva_etapa, ['Agumon']))

    await conn.execute("""
        UPDATE digiseres SET etapa=$1, api_species=$2,
        hp_max=hp_max+$3, hp=hp_max+$3,
        fuerza=fuerza+$4, inteligencia=inteligencia+$4, velocidad=velocidad+$5
        WHERE id=$6
    """,
        nueva_etapa, nuevo_api,
        nueva_etapa * 20,   # +HP max
        nueva_etapa * 8,    # +stats ofensivos
        nueva_etapa * 5,    # +velocidad
        digi['id']
    )

    await log_evento(conn, digi['id'], 'EVOLUCION',
        f"{digi['nombre']} evolucionó a {etapa_nombres[nueva_etapa]}! Su poder creció enormemente.")

# ══════════════════════════════════════════════════════
# YGGMON — GUARDIÁN DEL EQUILIBRIO
# ══════════════════════════════════════════════════════

async def yggmon_equilibrio(conn):
    """Yggmon actúa solo cuando hay desequilibrio grave"""

    digis = await conn.fetch(
        "SELECT * FROM digiseres WHERE vivo=TRUE ORDER BY nivel DESC"
    )
    if not digis:
        return

    total = len(digis)

    # ── 1. Un ser demasiado poderoso sin contrapeso ───
    top = digis[0]
    if total > 3:
        segundo = digis[1]
        diferencia = top['nivel'] - segundo['nivel']

        if diferencia > 30:
            # Crear un contrapeso en el bioma opuesto
            biomas_opuestos = {
                'forest': 'void', 'void': 'forest',
                'sea': 'volcano', 'volcano': 'sea'
            }

            top_bioma = await conn.fetchval(
                "SELECT slug FROM biomas WHERE id=$1", top['bioma_id']
            )
            bioma_opuesto = biomas_opuestos.get(top_bioma, 'void')
            bioma_id = await conn.fetchval(
                "SELECT id FROM biomas WHERE slug=$1", bioma_opuesto
            )

            nombre = f"Sombra de {top['nombre'][:8]}"
            await conn.execute("""
                INSERT INTO digiseres
                  (nombre, bioma_id, nivel, etapa, genes_divinos, pos_x, pos_y,
                   hp, hp_max, fuerza, inteligencia, velocidad,
                   fe, caos, lealtad, agresion, curiosidad,
                   alineamiento, elemento, api_species, status)
                VALUES ($1, $2, $3, $4, 0.001,
                        $5, $6,
                        $7, $7, $8, $8, $8,
                        0.1, 0.9, 0.2, 0.9, 0.7,
                        'Chaotic Evil', 'Oscuro', 'Devimon', 'idle')
            """,
                nombre, bioma_id,
                max(top['nivel'] - 10, 20),
                min(top['etapa'], 3),
                random.uniform(52, 95) if bioma_opuesto in ('void','sea') else random.uniform(2, 48),
                random.uniform(52, 95) if bioma_opuesto in ('void','volcano') else random.uniform(2, 48),
                top['hp_max'],
                top['fuerza'] - 5
            )

            await log_yggmon(conn, 'EQUILIBRIO',
                f"Yggmon detectó que {top['nombre']} (Nv.{top['nivel']}) supera al resto por {diferencia} niveles. "
                f"Creó {nombre} como contrapeso en el {bioma_opuesto}.")

    # ── 2. Un bioma completamente vacío ──────────────
    biomas = await conn.fetch("SELECT id, slug, nombre FROM biomas")
    for bioma in biomas:
        pop = await conn.fetchval(
            "SELECT COUNT(*) FROM digiseres WHERE bioma_id=$1 AND vivo=TRUE AND etapa < 4",
            bioma['id']
        )
        if pop == 0:
            # Crear un ser básico
            await conn.execute("""
                INSERT INTO digiseres
                  (nombre, bioma_id, nivel, etapa, genes_divinos, pos_x, pos_y,
                   hp, hp_max, fuerza, inteligencia, velocidad,
                   fe, caos, lealtad, agresion, curiosidad,
                   elemento, api_species, status)
                VALUES ($1, $2, 5, 1, 0.001,
                        $3, $4,
                        40, 40, 20, 20, 20,
                        0.5, 0.5, 0.5, 0.3, 0.8,
                        'Dato', 'Agumon', 'idle')
            """,
                f"Nuevo ser del {bioma['slug']}",
                bioma['id'],
                random.uniform(5, 45),
                random.uniform(5, 45)
            )
            await log_yggmon(conn, 'CREACIÓN',
                f"El bioma {bioma['nombre']} quedó vacío. Yggmon sembró vida nueva.")

    # ── 3. Demasiados Chaotic Evil sin contrapeso Good
    evil_count = sum(1 for d in digis if 'Evil' in (d['alineamiento'] or ''))
    good_count = sum(1 for d in digis if 'Good' in (d['alineamiento'] or ''))

    if evil_count > good_count * 2 and good_count < 3:
        bioma_forest = await conn.fetchrow("SELECT id FROM biomas WHERE slug='forest'")
        if bioma_forest:
            await conn.execute("""
                INSERT INTO digiseres
                  (nombre, bioma_id, nivel, etapa, genes_divinos, pos_x, pos_y,
                   hp, hp_max, fuerza, inteligencia, velocidad,
                   fe, caos, lealtad, agresion, curiosidad,
                   alineamiento, elemento, api_species, status)
                VALUES ($1, $2, $3, 2, 15.0,
                        $4, $5,
                        80, 80, 50, 60, 55,
                        0.9, 0.1, 0.9, 0.3, 0.8,
                        'Lawful Good', 'Luz', 'Angemon', 'idle')
            """,
                'Guardián de Luz',
                bioma_forest['id'],
                random.randint(30, 50),
                random.uniform(10, 40),
                random.uniform(10, 40)
            )
            await log_yggmon(conn, 'EQUILIBRIO',
                f"La oscuridad superó a la luz ({evil_count} vs {good_count}). "
                f"Yggmon envió un Guardián de Luz al Bosque Binario.")

# ══════════════════════════════════════════════════════
# GESTOR DE ESPACIO EN BD — LA LEY DEL GRAN REINICIO
# ══════════════════════════════════════════════════════

async def gestionar_espacio_bd(conn):
    """
    Monitorea el uso de la BD.
    Si se acerca al límite, Yggmon actúa para purgar datos.
    Si está en peligro crítico, ejecuta el Gran Reinicio.
    """

    # Contar filas en tablas principales
    total_eventos    = await conn.fetchval("SELECT COUNT(*) FROM eventos")
    total_digiseres  = await conn.fetchval("SELECT COUNT(*) FROM digiseres")
    total_relaciones = await conn.fetchval("SELECT COUNT(*) FROM relaciones")

    log.info(f"BD Status — eventos:{total_eventos} digiseres:{total_digiseres} relaciones:{total_relaciones}")

    # ── Nivel 1: Limpieza preventiva (eventos muy viejos) ─
    if total_eventos > MAX_EVENTOS_TOTAL * 0.7:
        dias_a_guardar = 30  # Solo últimos 30 días
        borrados = await conn.fetchval("""
            DELETE FROM eventos
            WHERE dia_mundo < $1
            AND tipo NOT IN ('NACIMIENTO','MUERTE','EVOLUCION','YGGMON')
            RETURNING COUNT(*)
        """, world_day() - dias_a_guardar)

        await log_yggmon(conn, 'PURGA',
            f"Yggmon limpió {borrados or 0} eventos antiguos para mantener el orden del mundo.")
        log.info(f"Purga preventiva: {borrados} eventos eliminados")

    # ── Nivel 2: Eliminar digiseres débiles (Yggmon juzga) ─
    if total_digiseres > MAX_DIGISERES_TOTAL * DB_DANGER_THRESHOLD:
        # Eliminar los más débiles: nivel bajo, edad alta, sin tamer
        eliminados = await conn.fetch("""
            SELECT id, nombre, nivel FROM digiseres
            WHERE vivo=TRUE
            AND tamer_id IS NULL
            AND etapa < 4
            AND nivel < 15
            ORDER BY nivel ASC, edad DESC
            LIMIT 20
        """)

        for d in eliminados:
            await conn.execute(
                "UPDATE digiseres SET vivo=FALSE, status='dead' WHERE id=$1", d['id']
            )

        if eliminados:
            nombres = ', '.join([d['nombre'] for d in eliminados[:5]])
            await log_yggmon(conn, 'JUICIO',
                f"Yggmon juzgó que {len(eliminados)} seres débiles consumían demasiado espacio. "
                f"Fueron disueltos: {nombres}{'...' if len(eliminados)>5 else ''}.")

    # ── Nivel 3: GRAN REINICIO (situación crítica) ────────
    if total_eventos > MAX_EVENTOS_TOTAL * 0.95 or total_digiseres > MAX_DIGISERES_TOTAL:

        log.warning("¡GRAN REINICIO ACTIVADO!")

        # Guardar solo los mejores 50 digiseres + tamers + guardianes
        await conn.execute("""
            UPDATE digiseres SET vivo=FALSE, status='dead'
            WHERE id NOT IN (
                SELECT id FROM digiseres
                WHERE vivo=TRUE
                ORDER BY
                    CASE WHEN tamer_id IS NOT NULL THEN 1 ELSE 2 END,
                    nivel DESC
                LIMIT 50
            )
            AND etapa < 4
        """)

        # Borrar eventos excepto los más importantes
        await conn.execute("""
            DELETE FROM eventos
            WHERE tipo NOT IN ('NACIMIENTO','MUERTE','EVOLUCION','GRAN_REINICIO')
            AND dia_mundo < $1
        """, world_day() - 7)

        # Borrar relaciones de digiseres muertos
        await conn.execute("""
            DELETE FROM relaciones
            WHERE ser_a NOT IN (SELECT id FROM digiseres WHERE vivo=TRUE)
            OR ser_b NOT IN (SELECT id FROM digiseres WHERE vivo=TRUE)
        """)

        vivos = await conn.fetchval("SELECT COUNT(*) FROM digiseres WHERE vivo=TRUE")

        await log_yggmon(conn, 'GRAN_REINICIO',
            f"⚠ GRAN REINICIO — El mundo estaba al límite de su capacidad. "
            f"Yggmon purificó la existencia. Solo {vivos} seres sobrevivieron. "
            f"Una nueva era comienza desde las cenizas.")

        log.warning(f"Gran Reinicio completado. Sobrevivientes: {vivos}")

    # ── Limpiar relaciones huérfanas periódicamente ───────
    if random.random() < 0.1:  # 10% de los ticks
        await conn.execute("""
            DELETE FROM relaciones
            WHERE ser_a NOT IN (SELECT id FROM digiseres WHERE vivo=TRUE)
            OR ser_b NOT IN (SELECT id FROM digiseres WHERE vivo=TRUE)
        """)

# ══════════════════════════════════════════════════════
# TICK PRINCIPAL — corre cada 5 minutos
# ══════════════════════════════════════════════════════

async def world_tick():
    """El corazón del mundo — ejecuta todos los eventos"""
    log.info(f"[Día {world_day()}] Tick del mundo iniciado...")

    conn = await get_conn()
    try:
        # Cargar digiseres vivos con info de bioma
        digiseres = await conn.fetch("""
            SELECT d.*, b.slug as bioma_slug
            FROM digiseres d
            LEFT JOIN biomas b ON d.bioma_id = b.id
            WHERE d.vivo = TRUE
            ORDER BY RANDOM()
        """)

        if not digiseres:
            log.info("No hay digiseres vivos. El mundo espera.")
            await conn.close()
            return

        digis = [dict(d) for d in digiseres]

        # ── Gestión de espacio BD (siempre primero) ───
        await gestionar_espacio_bd(conn)

        # ── Envejecimiento y hambre para todos ────────
        for digi in digis:
            if digi['etapa'] == 0:  # Huevo
                # Los huevos solo eclosionan
                if digi['edad'] >= 3 and roll(0.4):
                    await conn.execute(
                        "UPDATE digiseres SET etapa=1, api_species='Agumon', status='idle', edad=0 WHERE id=$1",
                        digi['id']
                    )
                    await log_evento(conn, digi['id'], 'ECLOSION',
                        f"{digi['nombre']} eclosionó del huevo. ¡Una nueva vida comienza!")
                else:
                    await conn.execute(
                        "UPDATE digiseres SET edad=edad+1 WHERE id=$1", digi['id']
                    )
                continue

            if digi['status'] in ('dead',):
                continue

            # Hambre/descanso
            await evento_hambre_descanso(conn, digi)

            # Movimiento (solo si no está descansando)
            if digi['status'] != 'resting':
                await evento_movimiento(conn, digi)

            # Verificar evolución
            await verificar_evolucion(conn, digi)

        # ── Encuentros entre digiseres cercanos ───────
        # Recargar posiciones actualizadas
        digis_updated = [dict(d) for d in await conn.fetch("""
            SELECT d.*, b.slug as bioma_slug
            FROM digiseres d
            LEFT JOIN biomas b ON d.bioma_id = b.id
            WHERE d.vivo = TRUE AND d.etapa > 0
            ORDER BY RANDOM()
            LIMIT 30
        """)]

        encuentros = 0
        for i, da in enumerate(digis_updated):
            for db in digis_updated[i+1:]:
                if da['bioma_id'] != db['bioma_id']:
                    continue
                dist = distance(da['pos_x'], da['pos_y'], db['pos_x'], db['pos_y'])
                if dist < 12 and roll(0.4):
                    await evento_encuentro(conn, da, db)
                    encuentros += 1
                    if encuentros >= 3:
                        break
            if encuentros >= 3:
                break

        # ── Reproducción aleatoria ────────────────────
        adultos = [d for d in digis_updated if d['etapa'] >= 2 and d['status'] == 'idle']
        if len(adultos) >= 2 and roll(0.15):
            pareja = random.sample(adultos, 2)
            if pareja[0]['bioma_id'] == pareja[1]['bioma_id']:
                await intentar_reproduccion(conn, pareja[0], pareja[1])

        # ── Yggmon verifica equilibrio ────────────────
        if roll(0.20):  # 20% de los ticks
            await yggmon_equilibrio(conn)

        vivos = await conn.fetchval("SELECT COUNT(*) FROM digiseres WHERE vivo=TRUE")
        log.info(f"[Día {world_day()}] Tick completado. Digiseres vivos: {vivos}")

    except Exception as e:
        log.error(f"Error en world_tick: {e}", exc_info=True)
    finally:
        await conn.close()

# ══════════════════════════════════════════════════════
# ARRANQUE DEL SCHEDULER
# ══════════════════════════════════════════════════════

def start_engine():
    scheduler = AsyncIOScheduler()
    scheduler.add_job(world_tick, 'interval', minutes=5, id='world_tick')
    scheduler.start()
    log.info("Motor del mundo iniciado — tick cada 5 minutos")
    return scheduler
