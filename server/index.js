import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import express from 'express';
import helmet from 'helmet';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import {
  createProtocol,
  db,
  getUserByCpf,
  getUserById,
  initSchema,
  monthRange,
  normalizeCpf,
  normalizePhone,
  normalizeText,
  publicUser,
  seedDatabase
} from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const uploadsDir = path.join(rootDir, 'data', 'uploads');
fs.mkdirSync(uploadsDir, { recursive: true });
const isDev = process.env.NODE_ENV !== 'production';
const JWT_SECRET = process.env.JWT_SECRET || (isDev ? 'dev-secret-nova-iguacu-castracao' : null);
if (!JWT_SECRET) throw new Error('JWT_SECRET env var obrigatório em produção.');
const PORT = Number(process.env.PORT || 4000);
const ROLE_LIMITS = {
  admin: 99,
  tutor: 1,
  protetor: 4,
  clinica: 0
};

const docUpload = multer({
  storage: multer.diskStorage({
    destination(req, _file, cb) {
      const dir = path.join(uploadsDir, String(req.user.id));
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename(_req, file, cb) {
      cb(null, `${file.fieldname}${path.extname(file.originalname).toLowerCase()}`);
    }
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    const allowed = ['.pdf', '.jpg', '.jpeg', '.png', '.webp'];
    if (allowed.includes(path.extname(file.originalname).toLowerCase())) cb(null, true);
    else cb(new Error('Tipo não permitido. Use PDF, JPG ou PNG.'));
  }
});

const app = express();
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'same-origin' },
  contentSecurityPolicy: false
}));
app.use(express.json({ limit: '2mb' }));

const authLimiter = rateLimit({ windowMs: 60_000, max: 15, standardHeaders: true, legacyHeaders: false });
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/public/inscricao', rateLimit({ windowMs: 60_000, max: 5, standardHeaders: true, legacyHeaders: false }));

await bootstrap();

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, name: 'Castração Animal Nova Iguaçu' });
});

app.get('/api/clinics/available', (req, res) => {
  const { species, sex } = req.query;
  if (!species || !sex) return res.status(400).json({ message: 'species e sex são obrigatórios.' });
  const clinics = db.prepare(`
    SELECT c.id, c.name, c.address, c.neighborhood,
      SUM(s.total_quantity - s.occupied_quantity) AS available_slots
    FROM clinics c
    JOIN slots s ON s.clinic_id = c.id
    WHERE c.active = 1
      AND s.active = 1
      AND s.date >= date('now', 'localtime')
      AND strftime('%Y-%m', s.date) = strftime('%Y-%m', 'now', 'localtime')
      AND s.species = ?
      AND s.sex = ?
      AND s.occupied_quantity < s.total_quantity
    GROUP BY c.id
    ORDER BY c.name
  `).all(species, sex);
  res.json({ clinics });
});

app.get('/api/availability', (_req, res) => {
  const rows = db.prepare(`
    SELECT species, sex, SUM(total_quantity) AS total, SUM(occupied_quantity) AS occupied
    FROM slots
    WHERE active = 1 AND date >= date('now', 'localtime')
    GROUP BY species, sex
    ORDER BY species, sex
  `).all();
  res.json({
    availability: rows.map((row) => ({
      ...row,
      available: Number(row.total || 0) - Number(row.occupied || 0),
      label: animalTypeLabel(row.species, row.sex)
    }))
  });
});

app.post('/api/auth/login', (req, res) => {
  const { cpf, password } = req.body;
  const user = getUserByCpf(cpf);
  if (!user || !user.active || !user.password_hash || !bcrypt.compareSync(String(password || ''), user.password_hash)) {
    return res.status(401).json({ message: 'CPF ou senha inválidos.' });
  }
  res.json({ token: signToken(user), user: publicUser(user) });
});

app.post('/api/auth/register', (req, res) => {
  try {
    const { user, role = 'tutor' } = req.body;
    const saved = registerOrActivateUser(user, role, { allowExistingPassword: false });
    res.status(201).json({ token: signToken(saved), user: publicUser(saved) });
  } catch (error) {
    sendError(res, error);
  }
});

app.post('/api/public/inscricao', (req, res) => {
  try {
    const { user, animal, terms, role = 'tutor', clinicId = null } = req.body;
    validateTerms(terms);
    const savedUser = registerOrActivateUser(user, role, { allowExistingPassword: true });
    const appointment = createAutomaticAppointment(savedUser, animal, terms, clinicId);
    res.status(201).json({
      token: signToken(savedUser),
      user: publicUser(savedUser),
      appointment
    });
  } catch (error) {
    sendError(res, error);
  }
});

app.get('/api/me', requireAuth, (req, res) => {
  const user = getUserById(req.user.id);
  res.json({
    user: publicUser(user),
    limit: ROLE_LIMITS[user.role] || 1,
    currentMonthUsed: get30DayUsage(user.id),
    appointments: listAppointments({ userId: user.id })
  });
});

app.post('/api/me/documents', requireAuth, (req, res, next) => {
  if (!['tutor', 'protetor'].includes(req.user.role)) {
    return res.status(403).json({ message: 'Apenas tutores e protetores podem enviar documentos.' });
  }
  docUpload.fields([
    { name: 'doc_residencia', maxCount: 1 },
    { name: 'doc_cpf', maxCount: 1 },
    { name: 'doc_identidade', maxCount: 1 }
  ])(req, res, (err) => {
    if (err) return res.status(400).json({ message: err.message || 'Erro ao processar arquivo.' });
    next();
  });
}, (req, res) => {
  try {
    const files = req.files || {};
    const updates = [];
    const values = [];
    ['doc_residencia', 'doc_cpf', 'doc_identidade'].forEach((field) => {
      if (files[field]?.[0]) {
        updates.push(`${field} = ?`);
        values.push(files[field][0].filename);
      }
    });
    if (!updates.length) return res.status(400).json({ message: 'Nenhum arquivo enviado.' });
    values.push(req.user.id);
    db.prepare(`UPDATE users SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(...values);
    res.json({ user: publicUser(getUserById(req.user.id)) });
  } catch (error) {
    sendError(res, error);
  }
});

app.get('/api/documents/:userId/:type', requireAppointmentManager, (req, res) => {
  try {
    const allowed = ['doc_residencia', 'doc_cpf', 'doc_identidade'];
    if (!allowed.includes(req.params.type)) throw httpError(400, 'Tipo de documento inválido.');
    const user = getUserById(req.params.userId);
    if (!user) throw httpError(404, 'Usuário não encontrado.');
    const filename = user[req.params.type];
    if (!filename) throw httpError(404, 'Documento não enviado pelo tutor.');
    const filePath = path.join(uploadsDir, String(user.id), filename);
    if (!fs.existsSync(filePath)) throw httpError(404, 'Arquivo não encontrado no servidor.');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    res.sendFile(filePath);
  } catch (error) {
    sendError(res, error);
  }
});

app.post('/api/appointments/auto', requireAuth, (req, res) => {
  try {
    const user = getUserById(req.user.id);
    validateTerms(req.body.terms);
    const appointment = createAutomaticAppointment(user, req.body.animal, req.body.terms, req.body.clinicId || null);
    res.status(201).json({ appointment });
  } catch (error) {
    sendError(res, error);
  }
});

app.post('/api/appointments/:id/cancel', requireAuth, (req, res) => {
  try {
    const appointment = db.prepare('SELECT * FROM appointments WHERE id = ?').get(req.params.id);
    if (!appointment) throw httpError(404, 'Agendamento não encontrado.');
    if (req.user.role !== 'admin' && appointment.user_id !== req.user.id) throw httpError(403, 'Acesso negado.');
    if (appointment.status !== 'agendado') throw httpError(400, 'Somente agendamentos em aberto podem ser cancelados.');
    changeAppointmentStatus(appointment.id, 'cancelado', req.body.reason || 'Cancelado pelo usuário.');
    res.json({ appointment: getAppointmentDetails(appointment.id) });
  } catch (error) {
    sendError(res, error);
  }
});

app.get('/api/admin/summary', requireAdmin, (_req, res) => {
  const capacity = db.prepare(`
    SELECT
      COALESCE(SUM(total_quantity), 0) AS total,
      COALESCE(SUM(occupied_quantity), 0) AS occupied
    FROM slots
    WHERE active = 1 AND date >= date('now', 'localtime')
  `).get();
  const appointments = db.prepare(`
    SELECT status, COUNT(*) AS total
    FROM appointments
    GROUP BY status
  `).all();
  const users = db.prepare(`
    SELECT role, COUNT(*) AS total
    FROM users
    WHERE active = 1
    GROUP BY role
  `).all();
  res.json({
    slots: {
      total: Number(capacity.total),
      occupied: Number(capacity.occupied),
      available: Number(capacity.total) - Number(capacity.occupied)
    },
    appointments: asCountMap(appointments),
    users: asCountMap(users, 'role')
  });
});

app.get('/api/admin/reports', requireAdmin, (_req, res) => {
  const totalsRaw = db.prepare(`
    SELECT status, COUNT(*) AS total FROM appointments GROUP BY status
  `).all();
  const totals = Object.fromEntries(totalsRaw.map((r) => [r.status, r.total]));

  const perDay = db.prepare(`
    SELECT date(a.created_at, 'localtime') AS day, COUNT(*) AS total
    FROM appointments a
    WHERE a.status != 'cancelado'
    GROUP BY day
    ORDER BY day DESC
    LIMIT 90
  `).all();

  const perClinic = db.prepare(`
    SELECT COALESCE(c.name, s.clinic) AS clinic,
      SUM(s.total_quantity) AS total,
      SUM(s.occupied_quantity) AS occupied,
      SUM(s.total_quantity - s.occupied_quantity) AS available
    FROM slots s
    LEFT JOIN clinics c ON c.id = s.clinic_id
    WHERE s.active = 1
    GROUP BY COALESCE(c.name, s.clinic)
    ORDER BY clinic
  `).all();

  const castrationsByClinic = db.prepare(`
    SELECT COALESCE(c.name, s.clinic) AS clinic, COUNT(*) AS done
    FROM appointments a
    JOIN slots s ON s.id = a.slot_id
    LEFT JOIN clinics c ON c.id = s.clinic_id
    WHERE a.status = 'realizado'
    GROUP BY COALESCE(c.name, s.clinic)
    ORDER BY done DESC
  `).all();

  const castrationsByTypeRaw = db.prepare(`
    SELECT an.species, an.sex, COUNT(*) AS done
    FROM appointments a
    JOIN animals an ON an.id = a.animal_id
    WHERE a.status = 'realizado'
    GROUP BY an.species, an.sex
    ORDER BY done DESC
  `).all();

  const castrationsByType = castrationsByTypeRaw.map((r) => ({
    ...r,
    label: animalTypeLabel(r.species, r.sex)
  }));

  res.json({ totals, perDay, perClinic, castrationsByClinic, castrationsByType });
});

app.get('/api/admin/clinics', requireAdmin, (_req, res) => {
  const clinics = db.prepare(`
    SELECT id, name, address, neighborhood, phone, active, created_at
    FROM clinics
    ORDER BY active DESC, name ASC
  `).all();
  res.json({ clinics });
});

app.post('/api/admin/clinics', requireAdmin, (req, res) => {
  try {
    const clinic = parseClinic(req.body);
    const result = db.prepare(`
      INSERT INTO clinics (name, address, neighborhood, phone, active)
      VALUES (?, ?, ?, ?, 1)
    `).run(clinic.name, clinic.address, clinic.neighborhood, clinic.phone);
    res.status(201).json({ clinic: getClinic(result.lastInsertRowid) });
  } catch (error) {
    sendError(res, error);
  }
});

app.put('/api/admin/clinics/:id', requireAdmin, (req, res) => {
  try {
    const current = getClinic(req.params.id);
    if (!current) throw httpError(404, 'Clínica não encontrada.');
    const clinic = parseClinic(req.body);
    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare(`
        UPDATE clinics
        SET name = ?, address = ?, neighborhood = ?, phone = ?, active = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(clinic.name, clinic.address, clinic.neighborhood, clinic.phone, req.body.active ? 1 : 0, req.params.id);
      db.prepare('UPDATE slots SET clinic = ? WHERE clinic_id = ?').run(clinic.name, req.params.id);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
    res.json({ clinic: getClinic(req.params.id) });
  } catch (error) {
    sendError(res, error);
  }
});

app.delete('/api/admin/clinics/:id', requireAdmin, (req, res) => {
  try {
    const current = getClinic(req.params.id);
    if (!current) throw httpError(404, 'Clínica não encontrada.');
    if (req.query.permanent === 'true') {
      const hasAppointments = db.prepare(`
        SELECT COUNT(*) AS total FROM appointments a
        JOIN slots s ON s.id = a.slot_id
        WHERE s.clinic_id = ? AND a.status NOT IN ('cancelado')
      `).get(req.params.id).total;
      if (hasAppointments > 0) throw httpError(400, 'Não é possível excluir clínica com agendamentos ativos vinculados.');
      db.exec('BEGIN IMMEDIATE');
      try {
        db.prepare(`
          DELETE FROM appointments WHERE status = 'cancelado'
            AND slot_id IN (SELECT id FROM slots WHERE clinic_id = ?)
        `).run(req.params.id);
        db.prepare('DELETE FROM slots WHERE clinic_id = ?').run(req.params.id);
        db.prepare('DELETE FROM clinics WHERE id = ?').run(req.params.id);
        db.exec('COMMIT');
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
      return res.json({ deleted: true });
    }
    const hasSlots = db.prepare('SELECT COUNT(*) AS total FROM slots WHERE clinic_id = ? AND active = 1').get(req.params.id).total;
    if (hasSlots > 0) throw httpError(400, 'Não é possível desativar clínica com vagas ativas.');
    db.prepare('UPDATE clinics SET active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(req.params.id);
    res.json({ clinic: getClinic(req.params.id) });
  } catch (error) {
    sendError(res, error);
  }
});

app.get('/api/admin/slots', requireAdmin, (_req, res) => {
  const slots = db.prepare(`
    SELECT s.*,
      COALESCE(c.name, s.clinic) AS clinic,
      c.address AS clinic_address,
      c.neighborhood AS clinic_neighborhood,
      c.phone AS clinic_phone,
      (s.total_quantity - s.occupied_quantity) AS available_quantity
    FROM slots s
    LEFT JOIN clinics c ON c.id = s.clinic_id
    ORDER BY s.date ASC, s.time ASC, clinic ASC
  `).all();
  res.json({ slots: slots.map((slot) => ({ ...slot, label: animalTypeLabel(slot.species, slot.sex) })) });
});

app.post('/api/admin/slots/renew', requireAdmin, (req, res) => {
  try {
    const ids = req.body.ids;
    if (!Array.isArray(ids) || ids.length === 0) throw httpError(400, 'Selecione ao menos uma vaga.');
    const created = [];
    db.exec('BEGIN IMMEDIATE');
    try {
      for (const id of ids) {
        const slot = getSlot(id);
        if (!slot) throw httpError(404, `Vaga ${id} não encontrada.`);
        const newDate = db.prepare("SELECT date(?, '+1 month') AS d").get(slot.date).d;
        const result = db.prepare(`
          INSERT INTO slots (date, time, species, sex, total_quantity, occupied_quantity, clinic_id, clinic, active)
          VALUES (?, ?, ?, ?, ?, 0, ?, ?, 1)
        `).run(newDate, slot.time, slot.species, slot.sex, slot.total_quantity, slot.clinic_id, slot.clinic);
        created.push(getSlot(result.lastInsertRowid));
      }
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
    res.status(201).json({ slots: created, count: created.length });
  } catch (error) {
    sendError(res, error);
  }
});

app.post('/api/admin/slots', requireAdmin, (req, res) => {
  try {
    const slot = parseSlot(req.body);
    const result = db.prepare(`
      INSERT INTO slots (date, time, species, sex, total_quantity, occupied_quantity, clinic_id, clinic, active)
      VALUES (?, ?, ?, ?, ?, 0, ?, ?, 1)
    `).run(slot.date, slot.time, slot.species, slot.sex, slot.total_quantity, slot.clinic_id, slot.clinic);
    res.status(201).json({ slot: getSlot(result.lastInsertRowid) });
  } catch (error) {
    sendError(res, error);
  }
});

app.put('/api/admin/slots/:id', requireAdmin, (req, res) => {
  try {
    const current = getSlot(req.params.id);
    if (!current) throw httpError(404, 'Vaga não encontrada.');
    const slot = parseSlot(req.body);
    if (current.occupied_quantity > 0 && (current.species !== slot.species || current.sex !== slot.sex)) {
      throw httpError(400, 'Não altere espécie ou sexo de uma vaga que já possui agendamentos.');
    }
    if (slot.total_quantity < current.occupied_quantity) {
      throw httpError(400, 'A quantidade total não pode ser menor que as vagas já ocupadas.');
    }
    db.prepare(`
      UPDATE slots
      SET date = ?, time = ?, species = ?, sex = ?, total_quantity = ?, clinic_id = ?, clinic = ?, active = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(slot.date, slot.time, slot.species, slot.sex, slot.total_quantity, slot.clinic_id, slot.clinic, req.body.active ? 1 : 0, req.params.id);
    res.json({ slot: getSlot(req.params.id) });
  } catch (error) {
    sendError(res, error);
  }
});

app.delete('/api/admin/slots/:id', requireAdmin, (req, res) => {
  try {
    const current = getSlot(req.params.id);
    if (!current) throw httpError(404, 'Vaga não encontrada.');
    if (req.query.permanent === 'true') {
      const activeAppointments = db.prepare(
        `SELECT COUNT(*) AS total FROM appointments WHERE slot_id = ? AND status NOT IN ('cancelado')`
      ).get(req.params.id).total;
      if (activeAppointments > 0) throw httpError(400, 'Não é possível excluir vaga com agendamentos ativos.');
      db.exec('BEGIN IMMEDIATE');
      try {
        db.prepare(`DELETE FROM appointments WHERE slot_id = ? AND status = 'cancelado'`).run(req.params.id);
        db.prepare('DELETE FROM slots WHERE id = ?').run(req.params.id);
        db.exec('COMMIT');
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
      return res.json({ deleted: true });
    }
    db.prepare('UPDATE slots SET active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(req.params.id);
    res.json({ slot: getSlot(req.params.id) });
  } catch (error) {
    sendError(res, error);
  }
});

app.get('/api/admin/appointments', requireAppointmentManager, (req, res) => {
  const clinicId = req.user.role === 'clinica' ? req.user.clinic_id : null;
  if (req.user.role === 'clinica' && !clinicId) return res.status(403).json({ message: 'Usuário de clínica sem clínica vinculada.' });
  res.json({ appointments: listAppointments({ clinicId }) });
});

app.patch('/api/admin/appointments/:id/status', requireAppointmentManager, (req, res) => {
  try {
    assertCanManageAppointment(req.user, req.params.id);
    const { status, reason } = req.body;
    changeAppointmentStatus(req.params.id, status, reason, { allowCapacityOverride: req.user.role === 'admin' });
    res.json({ appointment: getAppointmentDetails(req.params.id) });
  } catch (error) {
    sendError(res, error);
  }
});

app.get('/api/admin/users', requireAdmin, (_req, res) => {
  const users = db.prepare(`
    SELECT u.id, u.name, u.cpf, u.phone, u.address, u.neighborhood, u.role, u.clinic_id, c.name AS clinic_name,
      u.city_confirmed, u.adult_confirmed, u.pre_registered, u.active, u.created_at
    FROM users u
    LEFT JOIN clinics c ON c.id = u.clinic_id
    ORDER BY u.role, u.name
  `).all();
  res.json({ users });
});

app.post('/api/admin/users', requireAdmin, (req, res) => {
  try {
    const user = upsertAdminUser(req.body);
    res.status(201).json({ user: publicUser(user) });
  } catch (error) {
    sendError(res, error);
  }
});

app.put('/api/admin/users/:id', requireAdmin, (req, res) => {
  try {
    const user = upsertAdminUser({ ...req.body, id: Number(req.params.id) });
    res.json({ user: publicUser(user) });
  } catch (error) {
    sendError(res, error);
  }
});

app.delete('/api/admin/users/:id', requireAdmin, (req, res) => {
  try {
    const id = Number(req.params.id);
    if (id === req.user.id) throw httpError(400, 'Não é possível excluir o próprio usuário.');
    const current = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    if (!current) throw httpError(404, 'Usuário não encontrado.');
    if (req.query.permanent === 'true') {
      const activeAppointments = db.prepare(
        `SELECT COUNT(*) AS total FROM appointments WHERE user_id = ? AND status NOT IN ('cancelado')`
      ).get(id).total;
      if (activeAppointments > 0) throw httpError(400, 'Não é possível excluir usuário com agendamentos ativos. Cancele os agendamentos primeiro.');
      db.prepare('DELETE FROM users WHERE id = ?').run(id);
      return res.json({ deleted: true });
    }
    db.prepare('UPDATE users SET active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(id);
    res.json({ deactivated: true });
  } catch (error) {
    sendError(res, error);
  }
});

app.get('/api/admin/protectors', requireAdmin, (_req, res) => {
  const protectors = db.prepare(`
    SELECT id, name, cpf, phone, address, neighborhood, pre_registered, active, created_at,
      CASE WHEN password_hash IS NULL THEN 0 ELSE 1 END AS has_password
    FROM users
    WHERE role = 'protetor'
    ORDER BY name
  `).all();
  res.json({ protectors });
});

const distDir = path.join(rootDir, 'dist');
app.use(express.static(distDir));
app.get(/.*/, (_req, res) => {
  res.sendFile(path.join(distDir, 'index.html'), (error) => {
    if (error) {
      res.status(200).send('API ativa. Rode `npm run dev` para abrir a interface React em desenvolvimento.');
    }
  });
});

const LISTEN_HOST = process.env.LISTEN_HOST || '0.0.0.0';
app.listen(PORT, LISTEN_HOST, () => {
  console.log(`API em http://${LISTEN_HOST}:${PORT}`);
});

async function bootstrap() {
  initSchema();
  await seedDatabase();
}

function registerOrActivateUser(input = {}, role, options = {}) {
  const selectedRole = role === 'protetor' ? 'protetor' : 'tutor';
  const data = parseUser(input, selectedRole);
  const existing = getUserByCpf(data.cpf);

  if (selectedRole === 'protetor' && (!existing || existing.role !== 'protetor' || !existing.pre_registered)) {
    throw httpError(403, 'CPF de protetor não está pré-cadastrado. Solicite cadastro na área administrativa.');
  }

  if (existing?.password_hash && !options.allowExistingPassword) {
    throw httpError(409, 'CPF já cadastrado. Use o login para acessar.');
  }

  if (existing?.password_hash && options.allowExistingPassword) {
    const ok = bcrypt.compareSync(String(input.password || ''), existing.password_hash);
    if (!ok) throw httpError(401, 'Este CPF já possui senha. Entre com a senha correta ou use a área de login.');
  }

  const hash = input.password ? bcrypt.hashSync(String(input.password), 12) : existing?.password_hash;
  if (!hash) throw httpError(400, 'Informe uma senha para acompanhar seus agendamentos.');

  if (existing) {
    db.prepare(`
      UPDATE users
      SET name = ?, phone = ?, address = ?, neighborhood = ?, password_hash = ?, city_confirmed = 1, adult_confirmed = 1,
        active = 1, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(data.name, data.phone, data.address, data.neighborhood, hash, existing.id);
    return getUserById(existing.id);
  }

  const result = db.prepare(`
    INSERT INTO users (name, cpf, password_hash, phone, address, neighborhood, role, city_confirmed, adult_confirmed, active)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1, 1)
  `).run(data.name, data.cpf, hash, data.phone, data.address, data.neighborhood, selectedRole);
  return getUserById(result.lastInsertRowid);
}

function parseUser(input = {}, role) {
  const data = {
    name: normalizeText(input.name),
    cpf: normalizeCpf(input.cpf),
    phone: normalizePhone(input.phone),
    address: normalizeText(input.address),
    neighborhood: normalizeText(input.neighborhood)
  };
  if (!data.name) throw httpError(400, 'Informe o nome completo.');
  if (data.cpf.length !== 11) throw httpError(400, 'Informe um CPF com 11 dígitos.');
  if (!data.address) throw httpError(400, 'Informe o endereço.');
  if (!data.neighborhood && role !== 'protetor') throw httpError(400, 'Informe o bairro.');
  if (!data.phone) throw httpError(400, 'Informe o telefone.');
  if (!input.cityAdultConfirmed) throw httpError(400, 'Confirme que reside em Nova Iguaçu e é maior de 18 anos.');
  if (!input.password || String(input.password).length < 6) throw httpError(400, 'A senha deve ter pelo menos 6 caracteres.');
  return data;
}

function validateTerms(terms = {}) {
  if (!terms.requirementsAccepted) throw httpError(400, 'Aceite os requisitos do programa.');
  if (!terms.documentsAccepted) throw httpError(400, 'Confirme que levará os documentos solicitados.');
}

function parseAnimal(input = {}) {
  const animal = {
    name: normalizeText(input.name),
    species: input.species,
    sex: input.sex,
    breed: normalizeText(input.breed),
    approximate_age: normalizeText(input.approximateAge || input.approximate_age)
  };
  if (!animal.name) throw httpError(400, 'Informe o nome do animal.');
  if (!['cao', 'gato'].includes(animal.species)) throw httpError(400, 'Selecione cão ou gato.');
  if (!['macho', 'femea'].includes(animal.sex)) throw httpError(400, 'Selecione macho ou fêmea.');
  if (!animal.breed) throw httpError(400, 'Informe a raça.');
  if (!animal.approximate_age) throw httpError(400, 'Informe a idade aproximada.');
  return animal;
}

function parseSlot(input = {}) {
  const clinicId = Number(input.clinic_id || input.clinicId);
  const clinic = Number.isInteger(clinicId) ? getClinic(clinicId) : null;
  const slot = {
    date: normalizeText(input.date),
    time: normalizeText(input.time),
    species: input.species,
    sex: input.sex,
    total_quantity: Number(input.total_quantity || input.totalQuantity),
    clinic_id: clinicId,
    clinic: clinic?.name || ''
  };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(slot.date)) throw httpError(400, 'Informe uma data válida.');
  if (!/^\d{2}:\d{2}$/.test(slot.time)) throw httpError(400, 'Informe um horário válido.');
  if (!['cao', 'gato'].includes(slot.species)) throw httpError(400, 'Selecione a espécie da vaga.');
  if (!['macho', 'femea'].includes(slot.sex)) throw httpError(400, 'Selecione o sexo da vaga.');
  if (!Number.isInteger(slot.total_quantity) || slot.total_quantity <= 0) throw httpError(400, 'A quantidade deve ser maior que zero.');
  if (!clinic) throw httpError(400, 'Selecione uma clínica cadastrada.');
  if (!clinic.active) throw httpError(400, 'Selecione uma clínica ativa.');
  return slot;
}

function parseClinic(input = {}) {
  const clinic = {
    name: normalizeText(input.name),
    address: normalizeText(input.address),
    neighborhood: normalizeText(input.neighborhood),
    phone: normalizePhone(input.phone)
  };
  if (!clinic.name) throw httpError(400, 'Informe o nome da clínica.');
  if (!clinic.address) throw httpError(400, 'Informe o endereço completo da clínica.');
  return clinic;
}

function createAutomaticAppointment(user, animalInput, terms, clinicId) {
  if (!['tutor', 'protetor'].includes(user.role)) {
    throw httpError(403, 'Somente tutores e protetores podem solicitar agendamento.');
  }
  const animal = parseAnimal(animalInput);
  const limit = ROLE_LIMITS[user.role] || 1;
  let appointmentId;

  db.exec('BEGIN IMMEDIATE');
  try {
    const animalResult = db.prepare(`
      INSERT INTO animals (user_id, name, species, sex, breed, approximate_age)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(user.id, animal.name, animal.species, animal.sex, animal.breed, animal.approximate_age);

    const slots = clinicId
      ? db.prepare(`
          SELECT * FROM slots
          WHERE active = 1 AND date >= date('now', 'localtime')
            AND strftime('%Y-%m', date) = strftime('%Y-%m', 'now', 'localtime')
            AND species = ? AND sex = ?
            AND occupied_quantity < total_quantity
            AND clinic_id = ?
          ORDER BY date ASC, time ASC, id ASC
        `).all(animal.species, animal.sex, clinicId)
      : db.prepare(`
          SELECT * FROM slots
          WHERE active = 1 AND date >= date('now', 'localtime')
            AND strftime('%Y-%m', date) = strftime('%Y-%m', 'now', 'localtime')
            AND species = ? AND sex = ?
            AND occupied_quantity < total_quantity
          ORDER BY date ASC, time ASC, id ASC
        `).all(animal.species, animal.sex);

    if (!slots.length) {
      throw httpError(409, clinicId
        ? `Não há vagas disponíveis para ${animalTypeLabel(animal.species, animal.sex)} na clínica selecionada.`
        : `Não há vagas disponíveis para ${animalTypeLabel(animal.species, animal.sex)}.`
      );
    }

    const currentUsage = get30DayUsage(user.id);
    if (currentUsage >= limit) {
      throw httpError(409, `Limite de ${limit} agendamento(s) a cada 30 dias atingido.`);
    }

    const selectedSlot = slots[0];

    const update = db.prepare(`
      UPDATE slots
      SET occupied_quantity = occupied_quantity + 1, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND occupied_quantity < total_quantity
    `).run(selectedSlot.id);
    if (update.changes !== 1) throw httpError(409, 'A vaga acabou de ser preenchida. Tente novamente.');

    const protocol = createProtocol();
    const appointmentResult = db.prepare(`
      INSERT INTO appointments
        (user_id, animal_id, slot_id, status, requirements_accepted, documents_accepted, protocol)
      VALUES (?, ?, ?, 'agendado', ?, ?, ?)
    `).run(
      user.id,
      animalResult.lastInsertRowid,
      selectedSlot.id,
      terms.requirementsAccepted ? 1 : 0,
      terms.documentsAccepted ? 1 : 0,
      protocol
    );
    appointmentId = appointmentResult.lastInsertRowid;
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  return getAppointmentDetails(appointmentId);
}

function getMonthlyUsage(userId, dateString) {
  const { start, end } = monthRange(dateString);
  return db.prepare(`
    SELECT COUNT(*) AS total
    FROM appointments a
    JOIN slots s ON s.id = a.slot_id
    WHERE a.user_id = ?
      AND a.status != 'cancelado'
      AND s.date >= ?
      AND s.date < ?
  `).get(userId, start, end).total;
}

function get30DayUsage(userId) {
  return db.prepare(`
    SELECT COUNT(*) AS total
    FROM appointments
    WHERE user_id = ?
      AND status != 'cancelado'
      AND created_at >= datetime('now', '-30 days', 'localtime')
  `).get(userId).total;
}

function listAppointments({ userId, clinicId, appointmentId } = {}) {
  const params = [];
  const conditions = [];
  if (appointmentId) {
    conditions.push('a.id = ?');
    params.push(appointmentId);
  }
  if (userId) {
    conditions.push('a.user_id = ?');
    params.push(userId);
  }
  if (clinicId) {
    conditions.push('s.clinic_id = ?');
    params.push(clinicId);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  return db.prepare(`
    SELECT
      a.id,
      a.status,
      a.reason,
      a.protocol,
      a.created_at,
      u.id AS user_id,
      u.name AS user_name,
      u.cpf AS user_cpf,
      u.phone AS user_phone,
      u.role AS user_role,
      u.doc_residencia,
      u.doc_cpf,
      u.doc_identidade,
      an.name AS animal_name,
      an.species,
      an.sex,
      an.breed,
      an.approximate_age,
      s.id AS slot_id,
      s.date,
      s.time,
      COALESCE(c.name, s.clinic) AS clinic,
      c.address AS clinic_address,
      c.neighborhood AS clinic_neighborhood,
      c.phone AS clinic_phone
    FROM appointments a
    JOIN users u ON u.id = a.user_id
    JOIN animals an ON an.id = a.animal_id
    JOIN slots s ON s.id = a.slot_id
    LEFT JOIN clinics c ON c.id = s.clinic_id
    ${where}
    ORDER BY s.date ASC, s.time ASC, a.id DESC
  `).all(...params).map(formatAppointment);
}

function getAppointmentDetails(id) {
  const [appointment] = listAppointments({ appointmentId: id });
  if (!appointment) throw httpError(404, 'Agendamento não encontrado.');
  return appointment;
}

function assertCanManageAppointment(user, appointmentId) {
  const appointment = db.prepare(`
    SELECT a.id, s.clinic_id
    FROM appointments a
    JOIN slots s ON s.id = a.slot_id
    WHERE a.id = ?
  `).get(appointmentId);
  if (!appointment) throw httpError(404, 'Agendamento não encontrado.');
  if (user.role === 'admin') return;
  if (user.role === 'clinica' && user.clinic_id && Number(user.clinic_id) === Number(appointment.clinic_id)) return;
  throw httpError(403, 'Acesso permitido apenas aos agendamentos da clínica vinculada.');
}

function changeAppointmentStatus(id, status, reason = '', options = {}) {
  if (!['agendado', 'realizado', 'nao_realizado', 'cancelado'].includes(status)) {
    throw httpError(400, 'Status inválido.');
  }
  if (status === 'nao_realizado' && !normalizeText(reason)) {
    throw httpError(400, 'Informe o motivo da não realização.');
  }
  const appointment = db.prepare('SELECT * FROM appointments WHERE id = ?').get(id);
  if (!appointment) throw httpError(404, 'Agendamento não encontrado.');
  if (appointment.status === status) {
    db.prepare('UPDATE appointments SET reason = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(normalizeText(reason), id);
    return;
  }

  db.exec('BEGIN IMMEDIATE');
  try {
    if (appointment.status !== 'cancelado' && status === 'cancelado') {
      db.prepare(`
        UPDATE slots
        SET occupied_quantity = MAX(occupied_quantity - 1, 0), updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(appointment.slot_id);
    }
    if (appointment.status === 'cancelado' && status !== 'cancelado') {
      const slot = db.prepare('SELECT * FROM slots WHERE id = ?').get(appointment.slot_id);
      if (!slot) throw httpError(404, 'Vaga original não encontrada.');
      if (!options.allowCapacityOverride && slot.occupied_quantity >= slot.total_quantity) {
        throw httpError(409, 'A vaga original não possui disponibilidade.');
      }
      db.prepare(`
        UPDATE slots
        SET occupied_quantity = occupied_quantity + 1, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(appointment.slot_id);
    }
    db.prepare(`
      UPDATE appointments
      SET status = ?, reason = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(status, normalizeText(reason), id);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function upsertAdminUser(input = {}) {
  const id = input.id ? Number(input.id) : null;
  const role = ['admin', 'tutor', 'protetor', 'clinica'].includes(input.role) ? input.role : 'tutor';
  const clinicId = Number(input.clinic_id || input.clinicId);
  const clinic = role === 'clinica' && Number.isInteger(clinicId) ? getClinic(clinicId) : null;
  const data = {
    name: normalizeText(input.name),
    cpf: normalizeCpf(input.cpf),
    phone: normalizePhone(input.phone),
    address: normalizeText(input.address),
    neighborhood: normalizeText(input.neighborhood),
    clinic_id: role === 'clinica' ? clinicId : null,
    active: input.active === false || input.active === 0 ? 0 : 1,
    pre_registered: role === 'protetor' ? 1 : input.pre_registered ? 1 : 0
  };
  if (!data.name) throw httpError(400, 'Informe o nome.');
  if (data.cpf.length !== 11) throw httpError(400, 'CPF deve ter 11 dígitos.');
  if (role === 'clinica' && !clinic) throw httpError(400, 'Selecione uma clínica cadastrada para este usuário.');
  const passwordHash = input.password ? bcrypt.hashSync(String(input.password), 12) : null;
  if (!id && role === 'clinica' && !passwordHash) throw httpError(400, 'Informe uma senha para o usuário da clínica.');

  if (id) {
    const current = getUserById(id);
    if (!current) throw httpError(404, 'Usuário não encontrado.');
    db.prepare(`
      UPDATE users
      SET name = ?, cpf = ?, phone = ?, address = ?, neighborhood = ?, role = ?, clinic_id = ?, pre_registered = ?,
        active = ?, password_hash = COALESCE(?, password_hash), updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(data.name, data.cpf, data.phone, data.address, data.neighborhood, role, data.clinic_id, data.pre_registered, data.active, passwordHash, id);
    return getUserById(id);
  }

  const result = db.prepare(`
    INSERT INTO users
      (name, cpf, password_hash, phone, address, neighborhood, role, clinic_id, city_confirmed, adult_confirmed, pre_registered, active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?)
  `).run(data.name, data.cpf, passwordHash, data.phone, data.address, data.neighborhood, role, data.clinic_id, data.pre_registered, data.active);
  return getUserById(result.lastInsertRowid);
}

function getSlot(id) {
  const slot = db.prepare(`
    SELECT s.*,
      COALESCE(c.name, s.clinic) AS clinic,
      c.address AS clinic_address,
      c.neighborhood AS clinic_neighborhood,
      c.phone AS clinic_phone,
      (s.total_quantity - s.occupied_quantity) AS available_quantity
    FROM slots s
    LEFT JOIN clinics c ON c.id = s.clinic_id
    WHERE s.id = ?
  `).get(id);
  return slot ? { ...slot, label: animalTypeLabel(slot.species, slot.sex) } : null;
}

function getClinic(id) {
  return db.prepare(`
    SELECT id, name, address, neighborhood, phone, active, created_at
    FROM clinics
    WHERE id = ?
  `).get(id);
}

function requireAuth(req, res, next) {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ message: 'Login necessário.' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = getUserById(payload.id);
    if (!user || !user.active) return res.status(401).json({ message: 'Usuário inativo ou inexistente.' });
    req.user = user;
    next();
  } catch (_error) {
    res.status(401).json({ message: 'Sessão inválida.' });
  }
}

function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'admin') return res.status(403).json({ message: 'Acesso administrativo necessário.' });
    next();
  });
}

function requireAppointmentManager(req, res, next) {
  requireAuth(req, res, () => {
    if (!['admin', 'clinica'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Acesso permitido apenas para administração ou clínica.' });
    }
    next();
  });
}

function signToken(user) {
  return jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '8h' });
}

function formatAppointment(row) {
  return {
    ...row,
    animal_type_label: animalTypeLabel(row.species, row.sex),
    status_label: statusLabel(row.status)
  };
}

function animalTypeLabel(species, sex) {
  if (species === 'gato' && sex === 'femea') return 'gata';
  if (species === 'gato' && sex === 'macho') return 'gato';
  if (species === 'cao' && sex === 'femea') return 'cadela';
  return 'cão';
}

function statusLabel(status) {
  const labels = {
    agendado: 'Agendado',
    realizado: 'Realizado',
    nao_realizado: 'Não realizado',
    cancelado: 'Cancelado'
  };
  return labels[status] || status;
}

function asCountMap(rows, key = 'status') {
  return rows.reduce((acc, row) => {
    acc[row[key]] = Number(row.total);
    return acc;
  }, {});
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function sendError(res, error) {
  const status = error.status || (String(error.message).includes('UNIQUE') ? 409 : 500);
  const message = status === 500 ? 'Erro interno no servidor.' : error.message;
  if (status === 500) console.error(error);
  res.status(status).json({ message });
}
