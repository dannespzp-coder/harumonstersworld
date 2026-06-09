-- ══════════════════════════════════════════
-- HARUMONSTERSWORLD — Actualización de schema
-- Nuevas tablas: objetos, inventario, MP, fusiones
-- Pegar en Neon.tech SQL Editor y ejecutar
-- ══════════════════════════════════════════

-- ── MP y cansancio en digiseres ──────────────────────
ALTER TABLE digiseres ADD COLUMN IF NOT EXISTS mp          INT DEFAULT 20;
ALTER TABLE digiseres ADD COLUMN IF NOT EXISTS mp_max      INT DEFAULT 20;
ALTER TABLE digiseres ADD COLUMN IF NOT EXISTS cansancio   FLOAT DEFAULT 0.0; -- 0=descansado 1=agotado
ALTER TABLE digiseres ADD COLUMN IF NOT EXISTS es_guardian BOOLEAN DEFAULT FALSE;
ALTER TABLE digiseres ADD COLUMN IF NOT EXISTS xp          INT DEFAULT 0;
ALTER TABLE digiseres ADD COLUMN IF NOT EXISTS xp_next     INT DEFAULT 100;

-- Marcar guardianes existentes
UPDATE digiseres SET es_guardian = TRUE
WHERE nombre IN ('Sylvorn','Tidalux','Pyrathos','Nulliax');

-- ── OBJETOS (catálogo global) ─────────────────────────
CREATE TABLE IF NOT EXISTS objetos (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre      VARCHAR(100) NOT NULL,
  tipo        VARCHAR(30) NOT NULL
              CHECK (tipo IN ('consumible','equipo','raro','divino')),
  slot        VARCHAR(30)  -- 'cabeza','cuerpo','accesorio','arma' (NULL si consumible)
              CHECK (slot IN ('cabeza','cuerpo','accesorio','arma') OR slot IS NULL),
  descripcion TEXT,
  emoji       VARCHAR(10) DEFAULT '📦',
  -- Bonificaciones al equipar/usar
  bonus_hp    INT DEFAULT 0,
  bonus_mp    INT DEFAULT 0,
  bonus_str   INT DEFAULT 0,
  bonus_int   INT DEFAULT 0,
  bonus_spd   INT DEFAULT 0,
  bonus_def   INT DEFAULT 0,
  -- Consumible: efecto al usar
  heal_hp     INT DEFAULT 0,
  heal_mp     INT DEFAULT 0,
  rareza      INT DEFAULT 1  -- 1=común 2=raro 3=épico 4=legendario 5=divino
);

INSERT INTO objetos (nombre, tipo, slot, descripcion, emoji, bonus_hp, bonus_str, heal_hp, rareza) VALUES
  ('Fragmento de Datos',  'consumible', NULL,     'Restaura HP básico.',                       '💊', 0,  0, 25,  1),
  ('Núcleo de Energía',   'consumible', NULL,     'Restaura MP.',                              '🔵', 0,  0, 0,   1),
  ('Cristal de Fuerza',   'consumible', NULL,     'Aumenta temporalmente la fuerza.',          '💎', 0,  0, 0,   2),
  ('Armadura de Bits',    'equipo',    'cuerpo',  'Protección digital básica.',                '🛡️', 20, 5, 0,   1),
  ('Casco de Datos',      'equipo',    'cabeza',  'Aumenta inteligencia.',                     '⛑️', 10, 0, 0,   1),
  ('Garra de Código',     'equipo',    'arma',    'Aumenta fuerza de ataque.',                 '⚔️', 0,  15,0,   2),
  ('Amuleto del Bosque',  'equipo',    'accesorio','Afinidad con la naturaleza.',              '🍃', 15, 8, 0,   2),
  ('Escama del Mar',      'equipo',    'accesorio','Resistencia a daño acuático.',             '🐚', 20, 0, 0,   2),
  ('Fragmento de Yggmon', 'divino',    'accesorio','Un trozo del código original del dios.',  '⊕',  50,20, 0,   5),
  ('Cristal Oscuro',      'raro',      'accesorio','Aumenta el caos interno.',                '🌑', 5,  10, 0,   3),
  ('Fruta del Bosque',    'consumible', NULL,     'Cura completamente el HP.',                 '🍎', 0,  0, 999, 3),
  ('Esencia Volcánica',   'consumible', NULL,     'Infunde poder de fuego temporalmente.',     '🌋', 0,  0, 0,   2),
  ('Lágrima del Vacío',   'raro',      'accesorio','Parte de la esencia de Nulliax.',         '👁️', 0,  15, 0,  4),
  ('Gota de Tidalux',     'raro',      'accesorio','Bendición del guardián del mar.',         '🌊', 30, 5, 15,  4),
  ('Semilla de Sylvorn',  'raro',      'accesorio','Bendición del guardián del bosque.',      '🌳', 25, 8, 20,  4),
  ('Llama de Pyrathos',   'raro',      'accesorio','Bendición del guardián del volcán.',      '🔥', 10,25, 5,   4);

-- ── INVENTARIO de cada digiser ────────────────────────
CREATE TABLE IF NOT EXISTS inventario (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  digi_id     UUID REFERENCES digiseres(id) ON DELETE CASCADE,
  objeto_id   UUID REFERENCES objetos(id),
  cantidad    INT DEFAULT 1,
  equipado    BOOLEAN DEFAULT FALSE,
  slot_equipado VARCHAR(30),
  obtenido_dia  INT DEFAULT 1,
  created_at  TIMESTAMP DEFAULT NOW(),
  UNIQUE(digi_id, objeto_id, equipado)
);

-- ── FUSIONES ACTIVAS ──────────────────────────────────
CREATE TABLE IF NOT EXISTS fusiones_activas (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ser_a_id        UUID REFERENCES digiseres(id),
  ser_b_id        UUID REFERENCES digiseres(id),
  resultado_id    UUID REFERENCES digiseres(id),
  tipo            VARCHAR(20) CHECK (tipo IN ('temporal','permanente')),
  ticks_restantes INT,        -- NULL = permanente
  created_at      TIMESTAMP DEFAULT NOW()
);

-- ── INTERACCIONES digimón → usuario ───────────────────
CREATE TABLE IF NOT EXISTS interacciones (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  digi_id     UUID REFERENCES digiseres(id) ON DELETE CASCADE,
  usuario_id  UUID REFERENCES usuarios(id) ON DELETE CASCADE,
  tipo        VARCHAR(30) NOT NULL
              CHECK (tipo IN ('ayuda','ataque','intercambio','propuesta','amenaza','regalo')),
  descripcion TEXT,
  estado      VARCHAR(20) DEFAULT 'pendiente'
              CHECK (estado IN ('pendiente','aceptado','rechazado','expirado')),
  objeto_ofrecido UUID REFERENCES objetos(id),
  dia_mundo   INT,
  created_at  TIMESTAMP DEFAULT NOW()
);

-- ── CONFIGURACIÓN DEL MUNDO ───────────────────────────
CREATE TABLE IF NOT EXISTS mundo_config (
  clave   VARCHAR(50) PRIMARY KEY,
  valor   TEXT NOT NULL
);

INSERT INTO mundo_config (clave, valor) VALUES
  ('epoch_date',     '2026-06-09'),
  ('world_version',  '1'),
  ('last_reset',     '2026-06-09'),
  ('max_logs',       '100'),
  ('tick_minutes',   '5')
ON CONFLICT (clave) DO NOTHING;

-- ── ÍNDICES nuevos ────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_inventario_digi   ON inventario(digi_id);
CREATE INDEX IF NOT EXISTS idx_interacciones_user ON interacciones(usuario_id);
CREATE INDEX IF NOT EXISTS idx_interacciones_digi ON interacciones(digi_id);

-- ── VERIFICACIÓN ─────────────────────────────────────
SELECT 'Schema actualizado correctamente' AS status;
SELECT COUNT(*) AS objetos_creados FROM objetos;
