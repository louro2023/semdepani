import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import bcrypt from 'bcryptjs';
import mammoth from 'mammoth';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const dataDir = path.join(rootDir, 'data');
const dbPath = process.env.DB_PATH || path.join(dataDir, 'castracao.sqlite');

fs.mkdirSync(dataDir, { recursive: true });

export const db = new DatabaseSync(dbPath);

db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA synchronous = NORMAL');
db.exec('PRAGMA busy_timeout = 5000');

export function normalizeCpf(cpf = '') {
  return String(cpf).replace(/\D/g, '');
}

export function normalizePhone(phone = '') {
  return String(phone).replace(/\s+/g, ' ').trim();
}

export function normalizeText(value = '') {
  return String(value).replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

export function initSchema() {
  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      cpf TEXT NOT NULL UNIQUE,
      password_hash TEXT,
      phone TEXT,
      cep TEXT,
      address TEXT,
      address_number TEXT,
      neighborhood TEXT,
      role TEXT NOT NULL CHECK (role IN ('admin', 'tutor', 'protetor', 'clinica')),
      clinic_id INTEGER REFERENCES clinics(id),
      city_confirmed INTEGER NOT NULL DEFAULT 0,
      adult_confirmed INTEGER NOT NULL DEFAULT 0,
      pre_registered INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS animals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      species TEXT NOT NULL CHECK (species IN ('cao', 'gato')),
      sex TEXT NOT NULL CHECK (sex IN ('macho', 'femea')),
      breed TEXT NOT NULL,
      approximate_age TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS clinics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      address TEXT NOT NULL,
      neighborhood TEXT,
      phone TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS slots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      time TEXT NOT NULL,
      species TEXT NOT NULL CHECK (species IN ('cao', 'gato')),
      sex TEXT NOT NULL CHECK (sex IN ('macho', 'femea')),
      total_quantity INTEGER NOT NULL CHECK (total_quantity > 0),
      occupied_quantity INTEGER NOT NULL DEFAULT 0 CHECK (occupied_quantity >= 0),
      clinic_id INTEGER REFERENCES clinics(id),
      clinic TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(date, time, species, sex, clinic)
    );

    CREATE TABLE IF NOT EXISTS appointments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      animal_id INTEGER NOT NULL REFERENCES animals(id) ON DELETE CASCADE,
      slot_id INTEGER NOT NULL REFERENCES slots(id) ON DELETE RESTRICT,
      status TEXT NOT NULL CHECK (status IN ('agendado', 'realizado', 'nao_realizado', 'cancelado')) DEFAULT 'agendado',
      reason TEXT,
      requirements_accepted INTEGER NOT NULL DEFAULT 0,
      documents_accepted INTEGER NOT NULL DEFAULT 0,
      substitute_responsible INTEGER NOT NULL DEFAULT 0,
      responsible_name TEXT,
      responsible_cpf TEXT,
      responsible_cep TEXT,
      responsible_address TEXT,
      responsible_address_number TEXT,
      responsible_neighborhood TEXT,
      responsible_phone TEXT,
      responsible_email TEXT,
      responsible_city_confirmed INTEGER NOT NULL DEFAULT 0,
      responsible_adult_confirmed INTEGER NOT NULL DEFAULT 0,
      protocol TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS slot_release_months (
      month TEXT PRIMARY KEY,
      release_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS slot_audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slot_id INTEGER,
      action TEXT NOT NULL CHECK (action IN (
        'created', 'renewed', 'updated', 'deactivated', 'deleted',
        'month_published', 'month_scheduled', 'month_hidden'
      )),
      actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      actor_name TEXT NOT NULL,
      actor_cpf TEXT,
      slot_date TEXT,
      slot_time TEXT,
      species TEXT,
      sex TEXT,
      total_quantity INTEGER,
      occupied_quantity INTEGER,
      clinic_id INTEGER,
      clinic_name TEXT,
      slot_active INTEGER,
      release_month TEXT,
      release_at TEXT,
      details TEXT,
      event_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE INDEX IF NOT EXISTS idx_slot_audit_logs_event_at
      ON slot_audit_logs(event_at DESC, id DESC);
    CREATE INDEX IF NOT EXISTS idx_slot_audit_logs_slot_id
      ON slot_audit_logs(slot_id);
  `);

  migrateUsersForClinicRole();
  ensureColumn('slots', 'clinic_id', 'INTEGER REFERENCES clinics(id)');
  ensureColumn('users', 'clinic_id', 'INTEGER REFERENCES clinics(id)');
  ensureColumn('users', 'cep', 'TEXT');
  ensureColumn('users', 'address_number', 'TEXT');
  ensureColumn('users', 'doc_residencia', 'TEXT');
  ensureColumn('users', 'doc_cpf', 'TEXT');
  ensureColumn('users', 'doc_identidade', 'TEXT');
  ensureColumn('users', 'email', 'TEXT');
  ensureColumn('appointments', 'microchip', 'TEXT');
  ensureColumn('appointments', 'substitute_responsible', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn('appointments', 'responsible_name', 'TEXT');
  ensureColumn('appointments', 'responsible_cpf', 'TEXT');
  ensureColumn('appointments', 'responsible_cep', 'TEXT');
  ensureColumn('appointments', 'responsible_address', 'TEXT');
  ensureColumn('appointments', 'responsible_address_number', 'TEXT');
  ensureColumn('appointments', 'responsible_neighborhood', 'TEXT');
  ensureColumn('appointments', 'responsible_phone', 'TEXT');
  ensureColumn('appointments', 'responsible_email', 'TEXT');
  ensureColumn('appointments', 'responsible_city_confirmed', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn('appointments', 'responsible_adult_confirmed', 'INTEGER NOT NULL DEFAULT 0');
  removeLegacySlotAuditLogs();
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_appointments_microchip ON appointments(microchip) WHERE microchip IS NOT NULL`);
  migrateGlobalSlotReleaseToMonths();
}

export async function seedDatabase() {
  seedAdmin();
  seedClinics();
  migrateSlotClinics();
  await seedProtectorsFromDownloads();
}

function ensureColumn(table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!columns.some((item) => item.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

function removeLegacySlotAuditLogs() {
  db.prepare(`
    DELETE FROM slot_audit_logs
    WHERE action = 'created'
      AND actor_name = 'Não registrado (anterior aos logs)'
      AND details = 'Registro inicial criado automaticamente ao ativar a auditoria.'
  `).run();
}

function migrateGlobalSlotReleaseToMonths() {
  const migrationKey = 'monthly_slots_release_migrated';
  if (db.prepare('SELECT 1 FROM settings WHERE key = ?').get(migrationKey)) return;

  db.exec('BEGIN IMMEDIATE');
  try {
    const globalReleaseEnabled = db.prepare("SELECT value FROM settings WHERE key = 'public_slots_release_now'").get()?.value === '1';
    if (globalReleaseEnabled) {
      db.prepare(`
        INSERT OR IGNORE INTO slot_release_months (month, release_at)
        SELECT DISTINCT substr(date, 1, 7), datetime('now', 'localtime')
        FROM slots
        WHERE date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
      `).run();
    }
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run(migrationKey, '1');
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function migrateUsersForClinicRole() {
  const table = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'").get();
  if (!table?.sql || table.sql.includes("'clinica'")) return;

  db.exec(`
    PRAGMA foreign_keys = OFF;
    BEGIN IMMEDIATE;

    CREATE TABLE users_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      cpf TEXT NOT NULL UNIQUE,
      password_hash TEXT,
      phone TEXT,
      address TEXT,
      neighborhood TEXT,
      role TEXT NOT NULL CHECK (role IN ('admin', 'tutor', 'protetor', 'clinica')),
      clinic_id INTEGER REFERENCES clinics(id),
      city_confirmed INTEGER NOT NULL DEFAULT 0,
      adult_confirmed INTEGER NOT NULL DEFAULT 0,
      pre_registered INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    INSERT INTO users_new
      (id, name, cpf, password_hash, phone, address, neighborhood, role, clinic_id, city_confirmed, adult_confirmed, pre_registered, active, created_at, updated_at)
    SELECT
      id, name, cpf, password_hash, phone, address, neighborhood, role, NULL, city_confirmed, adult_confirmed, pre_registered, active, created_at, updated_at
    FROM users;

    DROP TABLE users;
    ALTER TABLE users_new RENAME TO users;

    COMMIT;
    PRAGMA foreign_keys = ON;
  `);
}

function seedAdmin() {
  if (!process.env.ADMIN_CPF || !process.env.ADMIN_PASSWORD) {
    throw new Error('[SEGURANÇA] ADMIN_CPF e ADMIN_PASSWORD são obrigatórios. Adicione ao .env: ADMIN_CPF=00000000000 ADMIN_PASSWORD=admin123');
  }
  const adminCpf = normalizeCpf(process.env.ADMIN_CPF);
  const password = process.env.ADMIN_PASSWORD;
  const hash = bcrypt.hashSync(password, 12);
  db.prepare(`
    INSERT INTO users (name, cpf, password_hash, phone, address, neighborhood, role, city_confirmed, adult_confirmed, active)
    VALUES ('Administrador', ?, ?, '(21) 0000-0000', 'Prefeitura de Nova Iguacu', 'Centro', 'admin', 1, 1, 1)
    ON CONFLICT(cpf) DO UPDATE SET role = 'admin', active = 1
  `).run(adminCpf, hash);
}

function seedClinics() {
  const insert = db.prepare(`
    INSERT INTO clinics (name, address, neighborhood, phone, active)
    VALUES (?, ?, ?, ?, 1)
    ON CONFLICT(name) DO NOTHING
  `);
  insert.run('Castramovel', 'Unidade movel - endereco definido pela administracao', 'Nova Iguacu', '',);
  insert.run('Clinica TAK VET', 'Endereco da Clinica TAK VET a cadastrar', 'Nova Iguacu', '',);
}

function migrateSlotClinics() {
  const slots = db.prepare("SELECT DISTINCT clinic FROM slots WHERE clinic_id IS NULL AND clinic IS NOT NULL AND clinic != ''").all();
  const insert = db.prepare(`
    INSERT INTO clinics (name, address, neighborhood, phone, active)
    VALUES (?, ?, 'Nova Iguacu', '', 1)
    ON CONFLICT(name) DO NOTHING
  `);
  const update = db.prepare('UPDATE slots SET clinic_id = ? WHERE clinic = ? AND clinic_id IS NULL');
  slots.forEach((slot) => {
    insert.run(slot.clinic, `Endereco de ${slot.clinic} a cadastrar`);
    update.run(getClinicIdByName(slot.clinic), slot.clinic);
  });
}

function getClinicIdByName(name) {
  return db.prepare('SELECT id FROM clinics WHERE name = ?').get(name)?.id || null;
}

async function seedProtectorsFromDownloads() {
  const alreadyImported = db.prepare("SELECT value FROM settings WHERE key = 'protectors_imported_at'").get();
  if (alreadyImported) return;

  const docsDir = process.env.SEED_DOCS_DIR || path.join(os.homedir(), 'Downloads');
  const filePath = path.join(docsDir, 'PROTETORAS CADASTRADAS.docx');
  if (!fs.existsSync(filePath)) {
    seedFallbackProtectors();
    return;
  }

  try {
    const result = await mammoth.extractRawText({ path: filePath });
    const imported = importProtectorsFromText(result.value);
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('protectors_imported_at', CURRENT_TIMESTAMP)").run();
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('protectors_imported_count', ?)").run(String(imported));
  } catch (error) {
    console.warn('Nao foi possivel importar protetoras do DOCX:', error.message);
    seedFallbackProtectors();
  }
}

function seedFallbackProtectors() {
  const fallback = [
    ['Protetora Exemplo', '11122233344', '(21) 99999-0000', 'Nova Iguacu', 'Centro']
  ];
  const stmt = db.prepare(`
    INSERT INTO users (name, cpf, phone, address, neighborhood, role, city_confirmed, adult_confirmed, pre_registered, active)
    VALUES (?, ?, ?, ?, ?, 'protetor', 1, 1, 1, 1)
    ON CONFLICT(cpf) DO UPDATE SET role = 'protetor', pre_registered = 1, active = 1
  `);
  fallback.forEach((item) => stmt.run(...item));
}

function importProtectorsFromText(rawText) {
  const lines = rawText
    .split(/\r?\n/)
    .map(normalizeText)
    .filter(Boolean)
    .filter((line) => !['NOME', 'ENDERECO', 'ENDEREÇO', 'CONTATO', 'CPF', 'PROTETORAS CADASTRADAS'].includes(line.toUpperCase()));

  const insert = db.prepare(`
    INSERT INTO users (name, cpf, phone, address, neighborhood, role, city_confirmed, adult_confirmed, pre_registered, active)
    VALUES (?, ?, ?, ?, ?, 'protetor', 1, 1, 1, 1)
    ON CONFLICT(cpf) DO UPDATE SET
      name = excluded.name,
      phone = excluded.phone,
      address = excluded.address,
      neighborhood = excluded.neighborhood,
      role = 'protetor',
      pre_registered = 1,
      active = 1,
      updated_at = CURRENT_TIMESTAMP
  `);

  let imported = 0;
  for (let index = 0; index < lines.length - 3;) {
    const name = lines[index++];
    const address = lines[index++] || '';
    const phone = lines[index++] || '';
    let cpfCandidate = lines[index++] || '';
    let cpf = normalizeCpf(cpfCandidate);

    while (cpf.length !== 11 && index < lines.length) {
      cpfCandidate += lines[index++];
      cpf = normalizeCpf(cpfCandidate);
    }

    if (!name || cpf.length !== 11 || /semana|feira|vagas/i.test(name)) continue;
    insert.run(name, cpf, phone, address, inferNeighborhood(address));
    imported += 1;
  }

  return imported;
}

export function createProtocol() {
  const now = new Date();
  const ymd = toDateString(now).replace(/-/g, '');
  const random = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `NI-${ymd}-${random}`;
}

export function publicUser(user) {
  if (!user) return null;
  const { password_hash, ...safeUser } = user;
  return safeUser;
}

export function getUserByCpf(cpf) {
  return db.prepare('SELECT * FROM users WHERE cpf = ?').get(normalizeCpf(cpf));
}

export function getUserById(id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

export function monthRange(dateString) {
  const [year, month] = dateString.slice(0, 7).split('-').map(Number);
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const next = new Date(year, month, 1);
  const end = toDateString(next);
  return { start, end };
}

export function toDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function inferNeighborhood(address = '') {
  const known = [
    'Centro',
    'Bairro da Luz',
    'Santa Rita',
    'Campo Alegre',
    'Cabucu',
    'Jardim Alvorada',
    'Vila de Cava',
    'Ipiranga',
    'Grama',
    'Austin',
    'Posse',
    'Tingua',
    'Comendador Soares'
  ];
  const normalized = normalizeText(address).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const found = known.find((item) => normalized.includes(item.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()));
  return found || '';
}
