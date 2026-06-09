-- ══════════════════════════════════════════
-- HARUMONSTERSWORLD — Actualización v2
-- Nuevas tablas: objetos, inventario, MP,
-- fusiones, reset mundo, logs auto-borrado
-- Pegar en Neon.tech SQL Editor
-- ══════════════════════════════════════════

-- ── MP (Maná/Energía) en digiseres ───────
ALTER TABLE digiseres ADD COLUMN IF NOT EXISTS mp INT DEFAULT 50;
ALTER TABLE digiseres ADD COLUMN IF NOT EXISTS mp_max INT DEFAULT 50;
ALTER TABLE digiseres ADD COLUMN IF NOT EXISTS cansancio FLOAT DEFAULT 0.0;
ALTER TABLE digiseres ADD COLUMN IF NOT EXISTS experiencia INT DEFAULT 0;
ALTER TABLE digiseres ADD COLUMN IF NOT EXISTS es_guardian BOOLEAN DEFAULT FALSE;
ALTER TABLE digiseres ADD COLUMN IF NOT EXISTS color_borde VARCHAR(20) DEFAULT NULL;

-- Marcar guardianes existentes
UPDATE digiseres SET es_guardian=TRUE, color_borde='#FFD700'
WHERE nombre IN ('Sylvorn','Tidalux','Pyrathos','Nulliax');

-- ── OBJETOS (catálogo global) ─────────────
CREATE TABLE IF NOT EXISTS objetos (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre      VARCHAR(100) NOT NULL,
  tipo        VARCHAR(30) CHECK (tipo IN ('consumible','equipo','raro','divino')),
  slot        VARCHAR(20),
  descripcion TEXT,
  efecto_hp   INT DEFAULT 0,
  efecto_mp   INT DEFAULT 0,
  efecto_str  INT DEFAULT 0,
  efecto_int  INT DEFAULT 0,
  efecto_spd  INT DEFAULT 0,
  rareza      INT DEFAULT 1 CHECK (rareza BETWEEN 1 AND 5),
  emoji       VARCHAR(10) DEFAULT '📦'
);

INSERT INTO objetos (nombre,tipo,slot,descripcion,efecto_hp,efecto_mp,rareza,emoji) VALUES
  ('Fruta Digi',     'consumible',NULL,'Restaura 30 HP',30,0,1,'🍎'),
  ('Elixir Dato',    'consumible',NULL,'Restaura 50 MP',0,50,2,'💧'),
  ('Hierba Sagrada', 'consumible',NULL,'Restaura 80 HP y 40 MP',80,40,3,'🌿'),
  ('Cristal Divino', 'consumible',NULL,'Restaura todo el HP y MP',999,999,5,'💎')
ON CONFLICT DO NOTHING;

INSERT INTO objetos (nombre,tipo,slot,descripcion,efecto_str,efecto_int,efecto_spd,rareza,emoji) VALUES
  ('Garra Metálica', 'equipo','mano','Aumenta fuerza +15',15,0,0,2,'⚔️'),
  ('Capa de Datos',  'equipo','cuerpo','Aumenta inteligencia +12',0,12,0,2,'🧥'),
  ('Botas del Viento','equipo','pies','Aumenta velocidad +20',0,0,20,3,'👟'),
  ('Corona de Yggmon','equipo','cabeza','Aumenta todo +10',10,10,10,5,'👑')
ON CONFLICT DO NOTHING;

-- ── INVENTARIO ────────────────────────────
CREATE TABLE IF NOT EXISTS inventario (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  digi_id     UUID REFERENCES digiseres(id) ON DELETE CASCADE,
  objeto_id   UUID REFERENCES objetos(id),
  cantidad    INT DEFAULT 1,
  equipado    BOOLEAN DEFAULT FALSE,
  slot        VARCHAR(20),
  found_day   INT DEFAULT 1,
  UNIQUE(digi_id, objeto_id, slot)
);

CREATE INDEX IF NOT EXISTS idx_inventario_digi ON inventario(digi_id);

-- ── FUSIONES mejoradas ────────────────────
CREATE TABLE IF NOT EXISTS fusiones_activas (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ser_a         UUID REFERENCES digiseres(id),
  ser_b         UUID REFERENCES digiseres(id),
  resultado_id  UUID REFERENCES digiseres(id),
  tipo          VARCHAR(20) CHECK (tipo IN ('temporal','permanente')),
  dias_restantes INT,
  iniciada_dia  INT DEFAULT 1,
  activa        BOOLEAN DEFAULT TRUE
);

-- ── CONFIGURACIÓN MUNDO ───────────────────
CREATE TABLE IF NOT EXISTS mundo_config (
  key   VARCHAR(100) PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT INTO mundo_config (key, value) VALUES
  ('epoch_date',    '2026-06-09'),
  ('world_version', '2'),
  ('max_logs',      '100'),
  ('engine_active', 'true')
ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value;

-- ── TRIGGER: auto-borrar logs > 100 por ser ──
CREATE OR REPLACE FUNCTION auto_borrar_eventos()
RETURNS TRIGGER AS $$
DECLARE
  max_logs INT;
BEGIN
  SELECT value::INT INTO max_logs FROM mundo_config WHERE key='max_logs';
  IF max_logs IS NULL THEN max_logs := 100; END IF;

  DELETE FROM eventos
  WHERE ser_id = NEW.ser_id
  AND id NOT IN (
    SELECT id FROM eventos
    WHERE ser_id = NEW.ser_id
    ORDER BY created_at DESC
    LIMIT max_logs
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_auto_borrar_eventos ON eventos;
CREATE TRIGGER trg_auto_borrar_eventos
  AFTER INSERT ON eventos
  FOR EACH ROW EXECUTE FUNCTION auto_borrar_eventos();

-- ── TRIGGER: auto-borrar yggmon_log > 200 ────
CREATE OR REPLACE FUNCTION auto_borrar_yggmon_log()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM yggmon_log
  WHERE id NOT IN (
    SELECT id FROM yggmon_log
    ORDER BY created_at DESC
    LIMIT 200
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_auto_borrar_yggmon ON yggmon_log;
CREATE TRIGGER trg_auto_borrar_yggmon
  AFTER INSERT ON yggmon_log
  FOR EACH ROW EXECUTE FUNCTION auto_borrar_yggmon_log();

-- ── FUNCIÓN: reiniciar mundo ──────────────
CREATE OR REPLACE FUNCTION reiniciar_mundo()
RETURNS TEXT AS $$
DECLARE
  nueva_fecha TEXT;
BEGIN
  nueva_fecha := TO_CHAR(NOW(), 'YYYY-MM-DD');

  -- Actualizar epoch al día de hoy
  UPDATE mundo_config SET value=nueva_fecha WHERE key='epoch_date';

  -- Borrar todos los digiseres no-guardianes
  DELETE FROM eventos WHERE ser_id IN (
    SELECT id FROM digiseres WHERE es_guardian=FALSE
  );
  DELETE FROM relaciones WHERE ser_a IN (
    SELECT id FROM digiseres WHERE es_guardian=FALSE
  ) OR ser_b IN (
    SELECT id FROM digiseres WHERE es_guardian=FALSE
  );
  DELETE FROM familia WHERE hijo_id IN (
    SELECT id FROM digiseres WHERE es_guardian=FALSE
  );
  DELETE FROM inventario WHERE digi_id IN (
    SELECT id FROM digiseres WHERE es_guardian=FALSE
  );
  DELETE FROM digiseres WHERE es_guardian=FALSE AND tamer_id IS NULL;

  -- Resetear digiseres de usuarios (vuelven a huevo)
  UPDATE digiseres SET
    nivel=1, etapa=0, edad=0, hp=20, hp_max=20, mp=50, mp_max=50,
    fuerza=10, inteligencia=10, velocidad=10, cansancio=0,
    status='egg', alineamiento='Sin definir', experiencia=0
  WHERE tamer_id IS NOT NULL;

  -- Restaurar guardianes a máximo poder
  UPDATE digiseres SET
    hp=hp_max, mp=mp_max, status='idle', cansancio=0
  WHERE es_guardian=TRUE;

  -- Log del reinicio
  INSERT INTO yggmon_log (tipo, descripcion, dia_mundo)
  VALUES ('GRAN_REINICIO',
    'Yggmon reinició el mundo. Una nueva era comienza. Los guardianes permanecen.', 1);

  RETURN 'Mundo reiniciado al Día 1. Guardianes restaurados. Fecha: ' || nueva_fecha;
END;
$$ LANGUAGE plpgsql;

-- ── VERIFICACIÓN ─────────────────────────
SELECT 'v2 aplicada correctamente' AS status;
SELECT COUNT(*) as objetos_creados FROM objetos;
SELECT key, value FROM mundo_config;
