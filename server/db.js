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
      protocol TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  migrateUsersForClinicRole();
  ensureColumn('slots', 'clinic_id', 'INTEGER REFERENCES clinics(id)');
  ensureColumn('users', 'clinic_id', 'INTEGER REFERENCES clinics(id)');
}

export async function seedDatabase() {
  seedAdmin();
  seedClinics();
  seedSlots();
  migrateSlotClinics();
  await seedProtectorsFromDownloads();
}

function ensureColumn(table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!columns.some((item) => item.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
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
  const adminCpf = normalizeCpf(process.env.ADMIN_CPF || '00000000000');
  const password = process.env.ADMIN_PASSWORD || 'admin123';
  const hash = bcrypt.hashSync(password, 10);
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

function seedSlots() {
  const existing = db.prepare('SELECT COUNT(*) AS total FROM slots').get().total;
  if (existing > 0) return;

  const insert = db.prepare(`
    INSERT OR IGNORE INTO slots (date, time, species, sex, total_quantity, occupied_quantity, clinic_id, clinic)
    VALUES (?, ?, ?, ?, ?, 0, ?, ?)
  `);
  const castramovelId = getClinicIdByName('Castramovel');
  const takVetId = getClinicIdByName('Clinica TAK VET');

  const base = nextDateForWeekday(new Date(), 3);
  for (let week = 0; week < 3; week += 1) {
    const wednesday = addDays(base, week * 7);
    const thursday = addDays(wednesday, 1);
    const friday = addDays(wednesday, 2);

    [
      ['09:00', 5, 'gato', 'femea'],
      ['10:00', 5, 'gato', 'femea'],
      ['11:00', 5, 'gato', 'femea'],
      ['13:00', 5, 'gato', 'femea'],
      ['14:00', 7, 'gato', 'macho'],
      ['15:00', 7, 'gato', 'macho']
    ].forEach(([time, quantity, species, sex]) => {
      insert.run(toDateString(wednesday), time, species, sex, quantity, castramovelId, 'Castramovel');
    });

    [thursday, friday].forEach((date) => {
      [
        ['09:00', 5, 'cao', 'femea'],
        ['10:00', 5, 'cao', 'femea'],
        ['11:00', 5, 'cao', 'macho'],
        ['13:00', 5, 'cao', 'femea'],
        ['14:00', 2, 'cao', 'femea'],
        ['14:00', 2, 'cao', 'macho'],
        ['15:00', 3, 'cao', 'macho']
      ].forEach(([time, quantity, species, sex]) => {
        insert.run(toDateString(date), time, species, sex, quantity, castramovelId, 'Castramovel');
      });
    });
  }

  const takBase = nextDateForWeekday(addDays(new Date(), 7), 2);
  const takPatterns = [
    { offset: 0, species: 'cao', sex: 'femea', quantities: [2, 2, 2, 2, 2, 2, 2, 2] },
    { offset: 1, species: 'cao', sex: 'macho', quantities: [2, 2, 2, 2, 2, 2, 2, 2] },
    { offset: 2, species: 'gato', sex: 'femea', quantities: [3, 2, 3, 2, 3, 2, 3, 2] },
    { offset: 9, species: 'gato', sex: 'macho', quantities: [3, 2, 3, 2, 3, 2, 3, 2] }
  ];
  const times = ['09:00', '10:00', '11:00', '13:00', '14:00', '15:00', '16:00', '17:00'];
  takPatterns.forEach((pattern) => {
    const date = toDateString(addDays(takBase, pattern.offset));
    times.forEach((time, index) => {
      insert.run(date, time, pattern.species, pattern.sex, pattern.quantities[index], takVetId, 'Clinica TAK VET');
    });
  });
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
  const random = Math.random().toString(36).slice(2, 7).toUpperCase();
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

function addDays(date, amount) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function nextDateForWeekday(date, weekday) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  const diff = (weekday - next.getDay() + 7) % 7 || 7;
  return addDays(next, diff);
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
