import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import ExcelJS from 'exceljs';
import express from 'express';
import helmet from 'helmet';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import nodemailer from 'nodemailer';
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

const smtpTransporter = process.env.SMTP_HOST
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    })
  : null;
if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET env var obrigatório. Em dev, adicione ao .env: JWT_SECRET=dev-secret-local');
const JWT_SECRET = process.env.JWT_SECRET;
const PORT = Number(process.env.PORT || 4000);
const ROLE_LIMITS = {
  tutor: 1,
  protetor: 4,
  clinica: 0
};
const RESPONSIBLE_UPDATE_MIN_HOURS = 5;

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

const csvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.csv', '.txt', '.xlsx'].includes(ext)) cb(null, true);
    else cb(new Error('Envie um arquivo Excel (.xlsx) ou CSV.'));
  }
});

const app = express();
app.set('trust proxy', 1);

if (process.env.INTERNAL_TOKEN) {
  app.use((req, res, next) => {
    if (req.headers['x-internal-token'] !== process.env.INTERNAL_TOKEN) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    next();
  });
}

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'same-origin' },
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'", "data:", "https://fonts.gstatic.com"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
    }
  }
}));
app.use(express.json({ limit: '2mb' }));

const authLimiter = rateLimit({ windowMs: 60_000, max: 15, standardHeaders: true, legacyHeaders: false });
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/public/cpf-status', rateLimit({ windowMs: 60_000, max: 60, standardHeaders: true, legacyHeaders: false }));
app.use('/api/public/inscricao', rateLimit({ windowMs: 60_000, max: 5, standardHeaders: true, legacyHeaders: false }));
app.use('/api/me/password', rateLimit({ windowMs: 60_000, max: 5, standardHeaders: true, legacyHeaders: false }));

await bootstrap();

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, name: 'Castração Animal Nova Iguaçu' });
});

app.get('/api/clinics/available', optionalAuth, (req, res) => {
  const { species, sex } = req.query;
  if (!species || !sex) return res.status(400).json({ message: 'species e sex são obrigatórios.' });
  const dateGuard = slotAvailabilityDateGuard(req.user, 's');
  const clinics = db.prepare(`
    SELECT c.id, c.name, c.address, c.neighborhood,
      COALESCE(SUM(s.total_quantity - s.occupied_quantity), 0) AS available_slots
    FROM clinics c
    LEFT JOIN slots s ON s.clinic_id = c.id
      AND s.active = 1
      ${dateGuard}
      AND s.species = ?
      AND s.sex = ?
      AND s.occupied_quantity < s.total_quantity
    WHERE c.active = 1
    GROUP BY c.id
    ORDER BY CASE WHEN available_slots > 0 THEN 0 ELSE 1 END, c.name
  `).all(species, sex);
  res.json({ clinics });
});

app.get('/api/clinics/:clinicId/available-dates', optionalAuth, (req, res) => {
  try {
    const { species, sex } = req.query;
    const clinicId = Number(req.params.clinicId);
    if (!Number.isInteger(clinicId) || clinicId <= 0) throw httpError(400, 'Clinica invalida.');
    if (!['cao', 'gato'].includes(species)) throw httpError(400, 'Selecione a especie.');
    if (!['macho', 'femea'].includes(sex)) throw httpError(400, 'Selecione o sexo.');

    const dateGuard = slotAvailabilityDateGuard(req.user, 's');

    const dates = db.prepare(`
      SELECT
        s.date,
        MIN(s.time) AS first_time,
        SUM(s.total_quantity - s.occupied_quantity) AS available_slots
      FROM slots s
      JOIN clinics c ON c.id = s.clinic_id
      WHERE c.id = ?
        AND c.active = 1
        AND s.active = 1
        ${dateGuard}
        AND s.species = ?
        AND s.sex = ?
        AND s.occupied_quantity < s.total_quantity
      GROUP BY s.date
      HAVING available_slots > 0
      ORDER BY s.date ASC
    `).all(clinicId, species, sex).map((row) => ({
      ...row,
      available_slots: Number(row.available_slots || 0)
    }));

    res.json({ dates });
  } catch (error) {
    sendError(res, error);
  }
});

app.get('/api/availability', optionalAuth, (req, res) => {
  const dateGuard = slotAvailabilityDateGuard(req.user);
  const rows = db.prepare(`
    SELECT species, sex, SUM(total_quantity) AS total, SUM(occupied_quantity) AS occupied
    FROM slots
    WHERE active = 1
      ${dateGuard}
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

app.get('/api/public/cpf-status', (req, res) => {
  try {
    const cpf = normalizeCpf(req.query.cpf);
    if (!isValidCpf(cpf)) throw httpError(400, 'CPF inválido. Verifique os dígitos informados.');
    const existing = getUserByCpf(cpf);
    res.json({ registered: Boolean(existing?.password_hash) });
  } catch (error) {
    sendError(res, error);
  }
});

app.get('/api/public/cep/:cep', async (req, res) => {
  try {
    const address = await lookupNovaIguacuCep(req.params.cep);
    res.json({ address });
  } catch (error) {
    sendError(res, error);
  }
});

app.post('/api/auth/login', (req, res) => {
  const { cpf, password } = req.body;
  const user = getUserByCpf(cpf);
  if (!user || !user.active || !user.password_hash || !bcrypt.compareSync(String(password || ''), user.password_hash)) {
    return res.status(401).json({ message: 'CPF ou senha inválidos.' });
  }
  res.json({ token: signToken(user), user: publicUser(user) });
});

app.post('/api/auth/register', async (req, res) => {
  try {
    const { user, role = 'tutor', terms } = req.body;
    validateTerms(terms);
    await lookupNovaIguacuCep(user?.cep || user?.zipCode);
    const saved = registerOrActivateUser(user, role, { allowExistingPassword: false });
    res.status(201).json({ token: signToken(saved), user: publicUser(saved) });
  } catch (error) {
    sendError(res, error);
  }
});

app.post('/api/public/inscricao', async (req, res) => {
  try {
    const { user, animal, terms, role = 'tutor', clinicId = null, date = '' } = req.body;
    validateTerms(terms);
    await lookupNovaIguacuCep(user?.cep || user?.zipCode);
    const savedUser = registerOrActivateUser(user, role, { allowExistingPassword: true });
    const appointment = await createAutomaticAppointment(savedUser, animal, terms, {
      clinicId,
      date,
      responsible: req.body.responsible || req.body.substituteResponsible || null
    });
    res.status(201).json({
      token: signToken(savedUser),
      user: publicUser(savedUser),
      appointment
    });
    const emailAddr = db.prepare('SELECT email FROM users WHERE id = ?').get(savedUser.id)?.email;
    sendConfirmationEmail(emailAddr, savedUser.name, appointment);
  } catch (error) {
    sendError(res, error);
  }
});

app.get('/api/me', requireAuth, (req, res) => {
  const user = getUserById(req.user.id);
  res.json({
    user: publicUser(user),
    limit: getAppointmentLimit(user.role),
    currentMonthUsed: getCurrentMonthUsage(user.id),
    appointments: listAppointments({ userId: user.id }).map(addResponsibleEditInfo),
    notifications: listUnreadNotifications(user.id)
  });
});

app.post('/api/me/notifications/:id/read', requireAuth, (req, res) => {
  try {
    const notificationId = Number(req.params.id);
    if (!Number.isInteger(notificationId) || notificationId <= 0) {
      throw httpError(400, 'Notificação inválida.');
    }
    const result = db.prepare(`
      UPDATE user_notifications
      SET read_at = datetime('now', 'localtime')
      WHERE id = ? AND user_id = ? AND read_at IS NULL
    `).run(notificationId, req.user.id);
    if (result.changes !== 1) throw httpError(404, 'Notificação não encontrada.');
    res.json({ success: true });
  } catch (error) {
    sendError(res, error);
  }
});

app.put('/api/me/password', requireAuth, (req, res) => {
  try {
    const user = getUserById(req.user.id);
    if (!['protetor', 'clinica'].includes(user.role)) {
      throw httpError(403, 'Operação não permitida para este perfil.');
    }
    const { currentPassword, newPassword } = req.body;
    if (!bcrypt.compareSync(String(currentPassword || ''), user.password_hash || '')) {
      throw httpError(400, 'Senha atual incorreta.');
    }
    if (!newPassword || String(newPassword).length < 6) {
      throw httpError(400, 'Nova senha deve ter pelo menos 6 caracteres.');
    }
    const hash = bcrypt.hashSync(String(newPassword), 12);
    db.prepare('UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(hash, user.id);
    res.json({ success: true });
  } catch (error) {
    sendError(res, error);
  }
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
    for (const field of ['doc_residencia', 'doc_cpf', 'doc_identidade']) {
      const uploaded = files[field]?.[0];
      if (uploaded && !checkFileMagicBytes(uploaded.path)) {
        try { fs.unlinkSync(uploaded.path); } catch (_e) { /* ignore */ }
        return res.status(400).json({ message: `Arquivo ${field} inválido. Envie um PDF, JPG ou PNG real.` });
      }
    }
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

app.post('/api/appointments/auto', requireAuth, async (req, res) => {
  try {
    const user = getUserById(req.user.id);
    validateTerms(req.body.terms);
    const appointment = await createAutomaticAppointment(user, req.body.animal, req.body.terms, {
      clinicId: req.body.clinicId || null,
      date: req.body.date || req.body.appointmentDate || '',
      responsible: req.body.responsible || req.body.substituteResponsible || null
    });
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

app.patch('/api/appointments/:id/responsible', requireAuth, async (req, res) => {
  try {
    const appointment = db.prepare(`
      SELECT a.*, s.date, s.time
      FROM appointments a
      JOIN slots s ON s.id = a.slot_id
      WHERE a.id = ?
    `).get(req.params.id);
    if (!appointment) throw httpError(404, 'Agendamento nÃ£o encontrado.');
    if (!['tutor', 'protetor', 'admin'].includes(req.user.role)) throw httpError(403, 'OperaÃ§Ã£o nÃ£o permitida para este perfil.');
    if (req.user.role !== 'admin' && appointment.user_id !== req.user.id) throw httpError(403, 'Acesso negado.');
    if (appointment.status !== 'agendado') throw httpError(400, 'Somente agendamentos em aberto permitem alterar o responsavel.');
    if (!canUpdateAppointmentResponsible(appointment, RESPONSIBLE_UPDATE_MIN_HOURS)) {
      throw httpError(400, `O responsavel pelo atendimento so pode ser alterado com pelo menos ${RESPONSIBLE_UPDATE_MIN_HOURS} horas de antecedencia.`);
    }

    const responsible = await parseSubstituteResponsible(req.body.responsible || req.body.substituteResponsible || req.body);
    db.prepare(`
      UPDATE appointments
      SET substitute_responsible = ?,
          responsible_name = ?,
          responsible_cpf = ?,
          responsible_cep = ?,
          responsible_address = ?,
          responsible_address_number = ?,
          responsible_neighborhood = ?,
          responsible_phone = ?,
          responsible_email = ?,
          responsible_city_confirmed = ?,
          responsible_adult_confirmed = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      responsible.substitute_responsible,
      responsible.name,
      responsible.cpf,
      responsible.cep,
      responsible.address,
      responsible.address_number,
      responsible.neighborhood,
      responsible.phone,
      responsible.email,
      responsible.city_confirmed,
      responsible.adult_confirmed,
      appointment.id
    );
    res.json({ appointment: addResponsibleEditInfo(getAppointmentDetails(appointment.id)) });
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

  const castrationsDetail = db.prepare(`
    SELECT
      u.name AS tutor_name,
      u.cpf AS tutor_cpf,
      an.name AS animal_name,
      an.species,
      an.sex,
      an.breed,
      s.clinic_id,
      COALESCE(c.name, s.clinic) AS clinic,
      s.date,
      s.time,
      a.protocol,
      a.microchip
    FROM appointments a
    JOIN users u ON u.id = a.user_id
    JOIN animals an ON an.id = a.animal_id
    JOIN slots s ON s.id = a.slot_id
    LEFT JOIN clinics c ON c.id = s.clinic_id
    WHERE a.status = 'realizado'
    ORDER BY s.date ASC, s.time ASC
  `).all().map((r) => ({ ...r, animal_type_label: animalTypeLabel(r.species, r.sex) }));

  const appointmentDetails = db.prepare(`
    SELECT
      a.id,
      a.status,
      a.reason,
      a.protocol,
      a.microchip,
      a.created_at,
      a.substitute_responsible,
      a.responsible_name,
      a.responsible_cpf,
      a.responsible_cep,
      a.responsible_address,
      a.responsible_address_number,
      a.responsible_neighborhood,
      a.responsible_phone,
      a.responsible_email,
      u.name AS tutor_name,
      u.cpf AS tutor_cpf,
      u.phone AS tutor_phone,
      u.cep AS tutor_cep,
      u.address AS tutor_address,
      u.address_number AS tutor_address_number,
      u.neighborhood AS tutor_neighborhood,
      u.email AS tutor_email,
      an.name AS animal_name,
      an.species,
      an.sex,
      an.breed,
      an.approximate_age,
      s.clinic_id,
      COALESCE(c.name, s.clinic) AS clinic,
      s.date,
      s.time
    FROM appointments a
    JOIN users u ON u.id = a.user_id
    JOIN animals an ON an.id = a.animal_id
    JOIN slots s ON s.id = a.slot_id
    LEFT JOIN clinics c ON c.id = s.clinic_id
    ORDER BY s.date ASC, s.time ASC, a.id ASC
  `).all().map((r) => ({
    ...r,
    substitute_responsible: Boolean(r.substitute_responsible),
    animal_type_label: animalTypeLabel(r.species, r.sex),
    status_label: statusLabel(r.status)
  }));

  res.json({ totals, perDay, perClinic, castrationsByClinic, castrationsByType, castrationsDetail, appointmentDetails });
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

app.get('/api/admin/slots/release-now', requireAdmin, (_req, res) => {
  res.json({ enabled: publicSlotsReleaseNowEnabled() });
});

app.post('/api/admin/slots/release-now', requireAdmin, (req, res) => {
  const enabled = req.body.enabled === true || req.body.enabled === 1 || req.body.enabled === '1' || req.body.enabled === 'true';
  setPublicSlotsReleaseNowEnabled(enabled);
  res.json({ enabled });
});

app.get('/api/admin/slots/releases', requireAdmin, (_req, res) => {
  res.json({ releases: listSlotMonthReleases() });
});

app.put('/api/admin/slots/releases/:month', requireAdmin, (req, res) => {
  try {
    const month = normalizeReleaseMonth(req.params.month);
    const action = String(req.body.action || '').trim().toLowerCase();
    const slotCount = db.prepare('SELECT COUNT(*) AS total FROM slots WHERE substr(date, 1, 7) = ?').get(month).total;
    if (!slotCount) throw httpError(404, 'Não existem vagas cadastradas para este mês.');

    let releaseAt = null;
    db.exec('BEGIN IMMEDIATE');
    try {
      if (action === 'hidden') {
        db.prepare('DELETE FROM slot_release_months WHERE month = ?').run(month);
      } else {
        if (action === 'now') {
          releaseAt = db.prepare("SELECT datetime('now', 'localtime') AS value").get().value;
        } else if (action === 'scheduled') {
          releaseAt = normalizeReleaseDateTime(req.body.releaseAt);
          const isFuture = db.prepare("SELECT datetime(?) > datetime('now', 'localtime') AS valid").get(releaseAt).valid;
          if (!isFuture) throw httpError(400, 'Escolha uma data e horário futuros para a publicação.');
        } else {
          throw httpError(400, 'Ação de publicação inválida.');
        }

        db.prepare(`
          INSERT INTO slot_release_months (month, release_at)
          VALUES (?, ?)
          ON CONFLICT(month) DO UPDATE SET
            release_at = excluded.release_at,
            updated_at = CURRENT_TIMESTAMP
        `).run(month, releaseAt);
      }

      auditSlotAction(
        action === 'now' ? 'month_published' : action === 'scheduled' ? 'month_scheduled' : 'month_hidden',
        req.user,
        null,
        {
          releaseMonth: month,
          releaseAt,
          details: `${slotCount} registro(s) de vagas no mês no momento da ação.`
        }
      );
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }

    res.json({ release: getSlotMonthRelease(month) });
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

app.get('/api/admin/slot-logs', requireAdmin, (_req, res) => {
  const logs = db.prepare(`
    SELECT *
    FROM slot_audit_logs
    ORDER BY datetime(event_at) DESC, id DESC
  `).all();
  res.json({ logs });
});

app.post('/api/admin/slots/renew', requireAdmin, (req, res) => {
  try {
    const renewals = Array.isArray(req.body.renewals) ? req.body.renewals : null;
    const ids = req.body.ids;
    if (renewals && renewals.length === 0) throw httpError(400, 'Selecione ao menos uma vaga.');
    if (!renewals && (!Array.isArray(ids) || ids.length === 0)) throw httpError(400, 'Selecione ao menos uma vaga.');
    const created = [];
    db.exec('BEGIN IMMEDIATE');
    try {
      if (renewals) {
        for (const renewal of renewals) {
          const sourceId = Number(renewal.id || renewal.source_id || renewal.slot_id);
          if (!Number.isInteger(sourceId) || sourceId <= 0) throw httpError(400, 'Seleção de vagas inválida.');
          if (!getSlot(sourceId)) throw httpError(404, `Vaga ${sourceId} não encontrada.`);
          const slot = parseSlot(renewal);
          assertSlotDateIsCurrentOrFuture(slot.date);
          const result = db.prepare(`
            INSERT INTO slots (
              date, time, species, sex, total_quantity, occupied_quantity, clinic_id, clinic, active,
              created_by_user_id, creation_source, renewed_from_slot_id
            )
            VALUES (?, ?, ?, ?, ?, 0, ?, ?, 1, ?, 'renewed', ?)
          `).run(
            slot.date, slot.time, slot.species, slot.sex, slot.total_quantity, slot.clinic_id, slot.clinic,
            req.user.id, sourceId
          );
          const createdSlot = getSlot(result.lastInsertRowid);
          created.push(createdSlot);
        }
      } else {
        for (const id of ids) {
          const slot = getSlot(id);
          if (!slot) throw httpError(404, `Vaga ${id} não encontrada.`);
          const newDate = db.prepare("SELECT date(?, '+1 month') AS d").get(slot.date).d;
          assertSlotDateIsCurrentOrFuture(newDate);
          const result = db.prepare(`
            INSERT INTO slots (
              date, time, species, sex, total_quantity, occupied_quantity, clinic_id, clinic, active,
              created_by_user_id, creation_source, renewed_from_slot_id
            )
            VALUES (?, ?, ?, ?, ?, 0, ?, ?, 1, ?, 'renewed', ?)
          `).run(
            newDate, slot.time, slot.species, slot.sex, slot.total_quantity, slot.clinic_id, slot.clinic,
            req.user.id, slot.id
          );
          const createdSlot = getSlot(result.lastInsertRowid);
          created.push(createdSlot);
        }
      }
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      if (String(err.message).includes('UNIQUE')) {
        throw httpError(409, 'Já existe uma vaga com a mesma data, horário, espécie, sexo e clínica.');
      }
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
    assertSlotDateIsCurrentOrFuture(slot.date);
    db.exec('BEGIN IMMEDIATE');
    try {
      const result = db.prepare(`
        INSERT INTO slots (
          date, time, species, sex, total_quantity, occupied_quantity, clinic_id, clinic, active,
          created_by_user_id, creation_source
        )
        VALUES (?, ?, ?, ?, ?, 0, ?, ?, 1, ?, 'manual')
      `).run(
        slot.date, slot.time, slot.species, slot.sex, slot.total_quantity, slot.clinic_id, slot.clinic,
        req.user.id
      );
      const createdSlot = getSlot(result.lastInsertRowid);
      db.exec('COMMIT');
      res.status(201).json({ slot: createdSlot });
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
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
    db.exec('BEGIN IMMEDIATE');
    try {
      const active = req.body.active ? 1 : 0;
      db.prepare(`
        UPDATE slots
        SET date = ?, time = ?, species = ?, sex = ?, total_quantity = ?, clinic_id = ?, clinic = ?, active = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(slot.date, slot.time, slot.species, slot.sex, slot.total_quantity, slot.clinic_id, slot.clinic, active, req.params.id);
      const updatedSlot = getSlot(req.params.id);
      const action = current.active && !active ? 'deactivated' : 'updated';
      auditSlotAction(action, req.user, updatedSlot, {
        details: action === 'updated' ? `Dados anteriores: ${slotAuditSummary(current)}` : null
      });
      db.exec('COMMIT');
      res.json({ slot: updatedSlot });
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
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
        auditSlotAction('deleted', req.user, current);
        db.prepare('DELETE FROM slots WHERE id = ?').run(req.params.id);
        db.exec('COMMIT');
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
      return res.json({ deleted: true });
    }
    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare('UPDATE slots SET active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(req.params.id);
      const deactivatedSlot = getSlot(req.params.id);
      auditSlotAction('deactivated', req.user, deactivatedSlot);
      db.exec('COMMIT');
      res.json({ slot: deactivatedSlot });
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  } catch (error) {
    sendError(res, error);
  }
});

app.get('/api/admin/appointments', requireAppointmentManager, (req, res) => {
  const requestedClinicId = Number(req.query.clinicId || req.query.clinic_id);
  const clinicId = req.user.role === 'clinica'
    ? req.user.clinic_id
    : Number.isInteger(requestedClinicId) && requestedClinicId > 0
      ? requestedClinicId
      : null;
  if (req.user.role === 'clinica' && !clinicId) return res.status(403).json({ message: 'Usuário de clínica sem clínica vinculada.' });
  res.json({ appointments: listAppointments({ clinicId }) });
});

app.patch('/api/admin/appointments/:id/status', requireAppointmentManager, (req, res) => {
  try {
    assertCanManageAppointment(req.user, req.params.id);
    const { status, reason, microchip } = req.body;
    changeAppointmentStatus(req.params.id, status, reason, { allowCapacityOverride: req.user.role === 'admin', microchip });
    res.json({ appointment: getAppointmentDetails(req.params.id) });
  } catch (error) {
    sendError(res, error);
  }
});

app.put('/api/admin/appointments/:id/reschedule', requireAdmin, (req, res) => {
  try {
    const appointment = rescheduleAppointment(req.params.id, req.body?.slotId);
    res.json({ appointment });
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

app.post('/api/admin/users/import', requireAdmin, (req, res, next) => {
  csvUpload.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ message: err.message });
    next();
  });
}, async (req, res) => {
  try {
    if (!req.file) throw httpError(400, 'Nenhum arquivo enviado.');
    const ext = path.extname(req.file.originalname).toLowerCase();
    if (ext === '.xlsx') {
      const magic = req.file.buffer.slice(0, 4);
      if (!(magic[0] === 0x50 && magic[1] === 0x4B && magic[2] === 0x03 && magic[3] === 0x04)) {
        throw httpError(400, 'Arquivo XLSX inválido. Envie um arquivo Excel real (.xlsx).');
      }
    }
    const rows = ext === '.xlsx'
      ? await parseExcelBuffer(req.file.buffer)
      : parseCsvBuffer(req.file.buffer);
    if (!rows.length) throw httpError(400, 'Planilha vazia ou sem linhas válidas após o cabeçalho.');

    const insert = db.prepare(`
      INSERT INTO users (name, cpf, password_hash, phone, address, neighborhood, email, role,
        city_confirmed, adult_confirmed, pre_registered, active)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'protetor', 1, 1, 1, 1)
      ON CONFLICT(cpf) DO NOTHING
    `);

    let imported = 0;
    const errors = [];

    db.exec('BEGIN IMMEDIATE');
    try {
      for (const [index, row] of rows.entries()) {
        const cpf = normalizeCpf(row.cpf);
        if (!isValidCpf(cpf)) {
          errors.push(`Linha ${index + 2}: CPF "${row.cpf}" inválido — ignorado.`);
          continue;
        }
        if (!row.name) {
          errors.push(`Linha ${index + 2}: nome ausente — ignorado.`);
          continue;
        }
        const password = row.password || crypto.randomBytes(4).toString('hex');
        const hash = bcrypt.hashSync(password, 12);
        const result = insert.run(
          normalizeText(row.name), cpf, hash,
          normalizePhone(row.phone || ''), normalizeText(row.address || ''),
          normalizeText(row.neighborhood || ''), normalizeText(row.email || '')
        );
        if (result.changes > 0) imported += 1;
        else errors.push(`Linha ${index + 2}: CPF ${cpf} já cadastrado — ignorado.`);
      }
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }

    res.json({ imported, skipped: rows.length - imported, errors });
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

app.use('/api', (req, res) => {
  res.status(404).json({ message: `Rota de API não encontrada: ${req.method} ${req.originalUrl}` });
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

const LISTEN_HOST = process.env.LISTEN_HOST || '127.0.0.1';
app.listen(PORT, LISTEN_HOST, () => {
  console.log(`API em http://${LISTEN_HOST}:${PORT}`);
});

async function bootstrap() {
  initSchema();
  await seedDatabase();
}

function formatDateBR(dateStr) {
  const iso = normalizeDateInput(dateStr);
  if (!iso) return dateStr || '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function speciesLabel(species, sex) {
  const s = species === 'cao' ? 'Cão' : 'Gato';
  const g = sex === 'femea' ? 'fêmea' : 'macho';
  return `${s} ${g}`;
}

async function sendConfirmationEmail(toEmail, userName, appointment) {
  if (!smtpTransporter || !toEmail) return;
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  const subject = `✅ Inscrição confirmada — Protocolo ${appointment.protocol}`;
  const html = `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#111133">
      <div style="background:#131953;padding:24px 32px;border-radius:12px 12px 0 0">
        <p style="margin:0;color:#fff;font-size:13px;letter-spacing:0.08em;text-transform:uppercase;opacity:0.6">Programa Municipal · Nova Iguaçu</p>
        <h1 style="margin:8px 0 0;color:#fff;font-size:22px">Castração Animal Gratuita</h1>
      </div>
      <div style="background:#fff;border:1px solid #e0e0ee;border-top:none;padding:32px;border-radius:0 0 12px 12px">
        <p style="margin:0 0 24px">Olá, <strong>${userName}</strong>! Sua inscrição foi confirmada com sucesso.</p>
        <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
          <tr style="background:#f5f6fc">
            <td style="padding:10px 14px;font-size:12px;color:#5a5e8a;text-transform:uppercase;letter-spacing:0.06em">Protocolo</td>
            <td style="padding:10px 14px;font-weight:700;font-size:16px;letter-spacing:0.04em">${appointment.protocol}</td>
          </tr>
          <tr>
            <td style="padding:10px 14px;font-size:12px;color:#5a5e8a;text-transform:uppercase;letter-spacing:0.06em">Animal</td>
            <td style="padding:10px 14px">${appointment.animal_name} · ${speciesLabel(appointment.species, appointment.sex)}</td>
          </tr>
          <tr style="background:#f5f6fc">
            <td style="padding:10px 14px;font-size:12px;color:#5a5e8a;text-transform:uppercase;letter-spacing:0.06em">Data</td>
            <td style="padding:10px 14px">${formatDateBR(appointment.date)} às ${appointment.time}</td>
          </tr>
          <tr>
            <td style="padding:10px 14px;font-size:12px;color:#5a5e8a;text-transform:uppercase;letter-spacing:0.06em">Clínica</td>
            <td style="padding:10px 14px">${appointment.clinic}${appointment.clinic_address ? ` — ${appointment.clinic_address}` : ''}</td>
          </tr>
        </table>
        <div style="background:#fff8f0;border:1px solid #f0d0b0;border-radius:8px;padding:16px 20px;font-size:14px;color:#7a4010;margin-bottom:24px">
          <strong>Lembre-se:</strong> leve <em>cópias de identidade, CPF e comprovante de residência</em> no dia da castração. Seu animal deve estar em jejum de 6 a 8 horas antes do procedimento.
        </div>
        <p style="margin:0;font-size:13px;color:#5a5e8a">Em caso de dúvidas, entre em contato com a Secretaria Municipal de Defesa e Proteção dos Animais.</p>
      </div>
    </div>
  `;
  try {
    const info = await smtpTransporter.sendMail({ from, to: toEmail, subject, html });
    console.log('[email] Enviado OK — messageId:', info.messageId, '| accepted:', info.accepted, '| rejected:', info.rejected);
  } catch (err) {
    console.error('[email] Falha ao enviar confirmação:', err.message);
  }
}

function registerOrActivateUser(input = {}, role, options = {}) {
  const selectedRole = role === 'protetor' ? 'protetor' : 'tutor';
  const data = parseUser(input, selectedRole);
  const existing = getUserByCpf(data.cpf);

  if (selectedRole === 'protetor' && (!existing || existing.role !== 'protetor' || !existing.pre_registered)) {
    throw httpError(403, 'CPF de protetor não está pré-cadastrado. Solicite cadastro na área administrativa.');
  }

  if (existing?.password_hash) {
    throw httpError(409, 'Já existe um usuário cadastrado com esse CPF. Faça login como tutor para acessar seus agendamentos ou continuar uma nova solicitação.');
  }

  const hash = input.password ? bcrypt.hashSync(String(input.password), 12) : existing?.password_hash;
  if (!hash) throw httpError(400, 'Informe uma senha para acompanhar seus agendamentos.');

  if (existing) {
    db.prepare(`
      UPDATE users
      SET name = ?, phone = ?, cep = ?, address = ?, address_number = ?, neighborhood = ?, email = ?, password_hash = ?, city_confirmed = 1, adult_confirmed = 1,
        active = 1, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(data.name, data.phone, data.cep, data.address, data.address_number, data.neighborhood, data.email || existing.email || '', hash, existing.id);
    return getUserById(existing.id);
  }

  const result = db.prepare(`
    INSERT INTO users (name, cpf, password_hash, phone, cep, address, address_number, neighborhood, email, role, city_confirmed, adult_confirmed, active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, 1)
  `).run(data.name, data.cpf, hash, data.phone, data.cep, data.address, data.address_number, data.neighborhood, data.email || '', selectedRole);
  return getUserById(result.lastInsertRowid);
}

function parseUser(input = {}, role) {
  const addressNumberMissing = input.addressNumberMissing === true || input.address_number_missing === true || input.noAddressNumber === true;
  const data = {
    name: normalizeText(input.name),
    cpf: normalizeCpf(input.cpf),
    phone: normalizePhone(input.phone),
    cep: normalizeCpf(input.cep || input.zipCode),
    address: normalizeText(input.address),
    address_number: addressNumberMissing ? 'S/N' : normalizeText(input.addressNumber || input.address_number),
    neighborhood: normalizeText(input.neighborhood),
    email: normalizeText(input.email || '')
  };
  if (!data.name) throw httpError(400, 'Informe o nome completo.');
  if (!isValidCpf(data.cpf)) throw httpError(400, 'CPF inválido. Verifique os dígitos informados.');
  if (data.cep.length !== 8) throw httpError(400, 'Informe um CEP válido com 8 dígitos.');
  if (!data.address) throw httpError(400, 'Informe o endereço completo.');
  if (!data.address_number) throw httpError(400, 'Informe o número da residência ou marque a opção sem número.');
  if (!data.neighborhood && role !== 'protetor') throw httpError(400, 'Informe o bairro.');
  if (!data.phone) throw httpError(400, 'Informe o telefone.');
  if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) throw httpError(400, 'E-mail inválido.');
  if (!input.cityAdultConfirmed) throw httpError(400, 'Confirme que reside em Nova Iguaçu e é maior de 18 anos.');
  if (!input.password || String(input.password).length < 6) throw httpError(400, 'A senha de acesso deve ter pelo menos 6 caracteres para ser criada.');
  return data;
}

async function lookupNovaIguacuCep(value = '') {
  const cep = normalizeCpf(value);
  if (cep.length !== 8) throw httpError(400, 'Informe um CEP válido com 8 dígitos.');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);
  let response;
  try {
    response = await fetch(`https://brasilapi.com.br/api/cep/v1/${cep}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' }
    });
  } catch (_error) {
    throw httpError(502, 'Não foi possível consultar o CEP no momento. Tente novamente.');
  } finally {
    clearTimeout(timeout);
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw httpError(response.status === 404 ? 404 : 502, data.message || 'CEP não encontrado.');
  }

  const city = normalizeText(data.city);
  const state = normalizeText(data.state).toUpperCase();
  if (state !== 'RJ' || normalizeForComparison(city) !== 'nova iguacu') {
    throw httpError(400, 'Informe um CEP do município de Nova Iguaçu.');
  }

  return {
    cep,
    state,
    city,
    neighborhood: normalizeText(data.neighborhood),
    street: normalizeText(data.street),
    service: normalizeText(data.service)
  };
}

function normalizeForComparison(value = '') {
  return normalizeText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function normalizeDateInput(value = '') {
  const raw = normalizeText(value);
  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) return buildIsoDate(isoMatch[3], isoMatch[2], isoMatch[1]) === raw ? raw : '';

  const brMatch = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (brMatch) return buildIsoDate(brMatch[1], brMatch[2], brMatch[3]);

  const digits = raw.replace(/\D/g, '');
  if (digits.length === 8) return buildIsoDate(digits.slice(0, 2), digits.slice(2, 4), digits.slice(4));
  return '';
}

function buildIsoDate(day, month, year) {
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d) || y < 1900 || m < 1 || m > 12 || d < 1 || d > 31) return '';
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return '';
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
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
    date: normalizeDateInput(input.date),
    time: normalizeText(input.time),
    species: input.species,
    sex: input.sex,
    total_quantity: Number(input.total_quantity || input.totalQuantity),
    clinic_id: clinicId,
    clinic: clinic?.name || ''
  };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(slot.date)) throw httpError(400, 'Informe uma data válida.');
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(slot.time)) throw httpError(400, 'Informe um horário válido no formato 24 horas HH:MM.');
  if (!['cao', 'gato'].includes(slot.species)) throw httpError(400, 'Selecione a espécie da vaga.');
  if (!['macho', 'femea'].includes(slot.sex)) throw httpError(400, 'Selecione o sexo da vaga.');
  if (!Number.isInteger(slot.total_quantity) || slot.total_quantity <= 0) throw httpError(400, 'A quantidade deve ser maior que zero.');
  if (!clinic) throw httpError(400, 'Selecione uma clínica cadastrada.');
  if (!clinic.active) throw httpError(400, 'Selecione uma clínica ativa.');
  return slot;
}

function assertSlotDateIsCurrentOrFuture(date) {
  const valid = db.prepare("SELECT date(?) >= date('now', 'localtime') AS valid").get(date).valid;
  if (!valid) throw httpError(400, 'A data da vaga não pode estar no passado.');
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

async function parseSubstituteResponsible(input = {}) {
  input = input || {};
  const enabled = input.enabled === true
    || input.substituteResponsible === true
    || input.substitute_responsible === true
    || input.useSubstitute === true;
  if (!enabled) {
    return {
      substitute_responsible: 0,
      name: null,
      cpf: null,
      cep: null,
      address: null,
      address_number: null,
      neighborhood: null,
      phone: null,
      email: null,
      city_confirmed: 0,
      adult_confirmed: 0
    };
  }

  const addressNumberMissing = input.addressNumberMissing === true
    || input.address_number_missing === true
    || input.noAddressNumber === true;
  const data = {
    substitute_responsible: 1,
    name: normalizeText(input.name || input.responsibleName),
    cpf: normalizeCpf(input.cpf || input.responsibleCpf),
    cep: normalizeCpf(input.cep || input.zipCode || input.responsibleCep),
    address: normalizeText(input.address || input.responsibleAddress),
    address_number: addressNumberMissing ? 'S/N' : normalizeText(input.addressNumber || input.address_number || input.responsibleAddressNumber),
    neighborhood: normalizeText(input.neighborhood || input.responsibleNeighborhood),
    phone: normalizePhone(input.phone || input.responsiblePhone),
    email: normalizeText(input.email || input.responsibleEmail || ''),
    city_confirmed: 1,
    adult_confirmed: 1
  };

  if (!data.name) throw httpError(400, 'Informe o nome completo do responsavel substituto.');
  if (!isValidCpf(data.cpf)) throw httpError(400, 'CPF do responsavel substituto invalido. Verifique os digitos informados.');
  if (data.cep.length !== 8) throw httpError(400, 'Informe um CEP valido com 8 digitos para o responsavel substituto.');
  if (!data.address) throw httpError(400, 'Informe o endereco completo do responsavel substituto.');
  if (!data.address_number) throw httpError(400, 'Informe o numero da residencia do responsavel substituto ou marque a opcao sem numero.');
  if (!data.neighborhood) throw httpError(400, 'Informe o bairro do responsavel substituto.');
  if (!data.phone) throw httpError(400, 'Informe o telefone do responsavel substituto.');
  if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) throw httpError(400, 'E-mail do responsavel substituto invalido.');
  if (!input.cityAdultConfirmed && !input.responsibleCityAdultConfirmed) {
    throw httpError(400, 'Confirme que o responsavel substituto reside em Nova Iguacu e e maior de 18 anos.');
  }

  await lookupNovaIguacuCep(data.cep);
  return data;
}

async function createAutomaticAppointment(user, animalInput, terms, options = {}) {
  if (!['tutor', 'protetor', 'admin'].includes(user.role)) {
    throw httpError(403, 'Somente tutores, protetores cadastrados e administradores podem solicitar agendamento.');
  }
  const animal = parseAnimal(animalInput);
  const responsible = await parseSubstituteResponsible(options.responsible);
  const clinicId = Number(options.clinicId);
  const requestedDate = normalizeDateInput(options.date);
  if (!Number.isInteger(clinicId) || clinicId <= 0) throw httpError(400, 'Selecione uma clinica disponivel para continuar.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(requestedDate)) throw httpError(400, 'Selecione uma data disponivel para continuar.');

  const limit = getAppointmentLimit(user.role);
  const slotDateGuard = slotAvailabilityDateGuard(user, 's');
  const updateDateGuard = slotAvailabilityDateGuard(user);
  let appointmentId;

  db.exec('BEGIN IMMEDIATE');
  try {
    const animalResult = db.prepare(`
      INSERT INTO animals (user_id, name, species, sex, breed, approximate_age)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(user.id, animal.name, animal.species, animal.sex, animal.breed, animal.approximate_age);

    const slots = db.prepare(`
      SELECT s.* FROM slots s
      JOIN clinics c ON c.id = s.clinic_id
      WHERE c.active = 1
        AND s.active = 1
        AND s.date = ?
        ${slotDateGuard}
        AND s.species = ? AND s.sex = ?
        AND s.occupied_quantity < s.total_quantity
        AND s.clinic_id = ?
      ORDER BY s.time ASC, s.id ASC
    `).all(requestedDate, animal.species, animal.sex, clinicId);

    if (!slots.length) {
      throw httpError(409, `Nao ha vagas disponiveis para ${animalTypeLabel(animal.species, animal.sex)} na data e clinica selecionadas.`);
    }

    const selectedSlot = slots[0];
    const currentUsage = getMonthlyUsageByCpf(user.cpf, selectedSlot.date);
    if (limit !== null && currentUsage >= limit) {
      throw httpError(409, `Limite de ${limit} agendamento(s) por mes para este CPF atingido.`);
    }

    const update = db.prepare(`
      UPDATE slots
      SET occupied_quantity = occupied_quantity + 1, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
        AND active = 1
        ${updateDateGuard}
        AND occupied_quantity < total_quantity
        AND EXISTS (
          SELECT 1 FROM clinics c
          WHERE c.id = slots.clinic_id
            AND c.active = 1
        )
    `).run(selectedSlot.id);
    if (update.changes !== 1) throw httpError(409, 'A vaga acabou de ser preenchida. Tente novamente.');

    const protocol = createProtocol();
    const appointmentResult = db.prepare(`
      INSERT INTO appointments
        (
          user_id, animal_id, slot_id, status, requirements_accepted, documents_accepted,
          substitute_responsible, responsible_name, responsible_cpf, responsible_cep,
          responsible_address, responsible_address_number, responsible_neighborhood,
          responsible_phone, responsible_email, responsible_city_confirmed,
          responsible_adult_confirmed, protocol
        )
      VALUES (?, ?, ?, 'agendado', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      user.id,
      animalResult.lastInsertRowid,
      selectedSlot.id,
      terms.requirementsAccepted ? 1 : 0,
      terms.documentsAccepted ? 1 : 0,
      responsible.substitute_responsible,
      responsible.name,
      responsible.cpf,
      responsible.cep,
      responsible.address,
      responsible.address_number,
      responsible.neighborhood,
      responsible.phone,
      responsible.email,
      responsible.city_confirmed,
      responsible.adult_confirmed,
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

function getMonthlyUsageByCpf(cpf, dateString) {
  const { start, end } = monthRange(dateString);
  return db.prepare(`
    SELECT COUNT(*) AS total
    FROM appointments a
    JOIN users u ON u.id = a.user_id
    JOIN slots s ON s.id = a.slot_id
    WHERE u.cpf = ?
      AND a.status != 'cancelado'
      AND s.date >= ?
      AND s.date < ?
  `).get(normalizeCpf(cpf), start, end).total;
}

function getCurrentMonthUsage(userId) {
  const today = db.prepare("SELECT date('now', 'localtime') AS today").get().today;
  return getMonthlyUsage(userId, today);
}

function getAppointmentLimit(role) {
  if (role === 'admin') return null;
  return ROLE_LIMITS[role] ?? 1;
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
      a.microchip,
      a.protocol,
      a.created_at,
      a.substitute_responsible,
      a.responsible_name,
      a.responsible_cpf,
      a.responsible_cep,
      a.responsible_address,
      a.responsible_address_number,
      a.responsible_neighborhood,
      a.responsible_phone,
      a.responsible_email,
      a.responsible_city_confirmed,
      a.responsible_adult_confirmed,
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
      s.clinic_id,
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

function listUnreadNotifications(userId) {
  return db.prepare(`
    SELECT
      id, type, appointment_id, title, message,
      old_date, old_time, old_clinic,
      new_date, new_time, new_clinic,
      created_at
    FROM user_notifications
    WHERE user_id = ? AND read_at IS NULL
    ORDER BY created_at DESC, id DESC
  `).all(userId);
}

function rescheduleAppointment(appointmentIdValue, targetSlotIdValue) {
  const appointmentId = Number(appointmentIdValue);
  const targetSlotId = Number(targetSlotIdValue);
  if (!Number.isInteger(appointmentId) || appointmentId <= 0) {
    throw httpError(400, 'Agendamento inválido.');
  }
  if (!Number.isInteger(targetSlotId) || targetSlotId <= 0) {
    throw httpError(400, 'Selecione a nova clínica, data e horário.');
  }

  db.exec('BEGIN IMMEDIATE');
  try {
    const appointment = db.prepare(`
      SELECT
        a.id, a.user_id, a.slot_id, a.status, a.protocol,
        an.species, an.sex,
        old_slot.date AS old_date,
        old_slot.time AS old_time,
        COALESCE(old_clinic.name, old_slot.clinic) AS old_clinic
      FROM appointments a
      JOIN animals an ON an.id = a.animal_id
      JOIN slots old_slot ON old_slot.id = a.slot_id
      LEFT JOIN clinics old_clinic ON old_clinic.id = old_slot.clinic_id
      WHERE a.id = ?
    `).get(appointmentId);
    if (!appointment) throw httpError(404, 'Agendamento não encontrado.');
    if (appointment.status !== 'agendado') {
      throw httpError(409, 'Somente agendamentos com status Agendado podem ser remarcados.');
    }
    if (appointment.slot_id === targetSlotId) {
      throw httpError(400, 'Selecione uma vaga diferente da atual.');
    }

    const target = db.prepare(`
      SELECT
        s.id, s.date, s.time, s.species, s.sex,
        s.total_quantity, s.occupied_quantity, s.active,
        c.id AS clinic_id, c.name AS clinic, c.active AS clinic_active
      FROM slots s
      JOIN clinics c ON c.id = s.clinic_id
      WHERE s.id = ?
    `).get(targetSlotId);
    if (!target) throw httpError(404, 'Nova vaga não encontrada.');
    if (!target.active || !target.clinic_active) {
      throw httpError(409, 'A nova vaga ou clínica está inativa.');
    }
    if (target.species !== appointment.species || target.sex !== appointment.sex) {
      throw httpError(409, 'A nova vaga não é compatível com a espécie e o sexo do animal.');
    }
    const future = db.prepare(`
      SELECT datetime(? || ' ' || ?) > datetime('now', 'localtime') AS valid
    `).get(target.date, target.time);
    if (!future?.valid) throw httpError(409, 'Selecione uma data e horário futuros.');

    const occupied = db.prepare(`
      UPDATE slots
      SET occupied_quantity = occupied_quantity + 1, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND active = 1 AND occupied_quantity < total_quantity
    `).run(target.id);
    if (occupied.changes !== 1) throw httpError(409, 'A nova vaga não possui mais disponibilidade.');

    const released = db.prepare(`
      UPDATE slots
      SET occupied_quantity = occupied_quantity - 1, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND occupied_quantity > 0
    `).run(appointment.slot_id);
    if (released.changes !== 1) {
      throw httpError(409, 'A ocupação da vaga atual está inconsistente. Nenhuma alteração foi realizada.');
    }

    db.prepare(`
      UPDATE appointments
      SET slot_id = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(target.id, appointment.id);

    db.prepare(`
      INSERT INTO user_notifications (
        user_id, type, appointment_id, title, message,
        old_date, old_time, old_clinic,
        new_date, new_time, new_clinic
      ) VALUES (?, 'appointment_rescheduled', ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      appointment.user_id,
      appointment.id,
      'Seu agendamento foi alterado',
      `O agendamento ${appointment.protocol} foi remarcado pela administração.`,
      appointment.old_date,
      appointment.old_time,
      appointment.old_clinic,
      target.date,
      target.time,
      target.clinic
    );

    db.exec('COMMIT');
    return getAppointmentDetails(appointment.id);
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function canUpdateAppointmentResponsible(appointment, minHours = RESPONSIBLE_UPDATE_MIN_HOURS) {
  if (!appointment || appointment.status !== 'agendado') return false;
  const result = db.prepare(`
    SELECT datetime(? || ' ' || ?) >= datetime('now', 'localtime', ?) AS allowed
  `).get(appointment.date, appointment.time, `+${minHours} hours`);
  return Boolean(result?.allowed);
}

function addResponsibleEditInfo(appointment) {
  return {
    ...appointment,
    can_update_responsible: canUpdateAppointmentResponsible(appointment, RESPONSIBLE_UPDATE_MIN_HOURS),
    responsible_update_min_hours: RESPONSIBLE_UPDATE_MIN_HOURS
  };
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
  const microchipRaw = String(options.microchip || '').replace(/\s/g, '');
  if (status === 'realizado') {
    if (!microchipRaw) throw httpError(400, 'Informe o número do microchip para confirmar a castração como realizada.');
    if (!/^\d{16}$/.test(microchipRaw)) throw httpError(400, 'Microchip deve conter exatamente 15 dígitos + 1 dígito verificador (16 dígitos no total).');
    const existing = db.prepare('SELECT id FROM appointments WHERE microchip = ? AND id != ?').get(microchipRaw, id);
    if (existing) throw httpError(409, `Microchip ${microchipRaw.slice(0, 15)} ${microchipRaw.slice(15)} já registrado no agendamento #${existing.id}.`);
  }
  const appointment = db.prepare('SELECT * FROM appointments WHERE id = ?').get(id);
  if (!appointment) throw httpError(404, 'Agendamento não encontrado.');
  if (appointment.status === status) {
    if (status === 'realizado') {
      db.prepare('UPDATE appointments SET reason = ?, microchip = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(normalizeText(reason), microchipRaw, id);
    } else {
      db.prepare('UPDATE appointments SET reason = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(normalizeText(reason), id);
    }
    return;
  }
  const microchipValue = status === 'realizado' ? microchipRaw : null;

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
      SET status = ?, reason = ?, microchip = COALESCE(?, microchip), updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(status, normalizeText(reason), microchipValue, id);
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
  if (!isValidCpf(data.cpf)) throw httpError(400, 'CPF inválido. Verifique os dígitos informados.');
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

function auditSlotAction(action, actor, slot, options = {}) {
  db.prepare(`
    INSERT INTO slot_audit_logs (
      slot_id, action, actor_user_id, actor_name, actor_cpf,
      slot_date, slot_time, species, sex, total_quantity, occupied_quantity,
      clinic_id, clinic_name, slot_active, release_month, release_at, details
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    slot?.id ?? null,
    action,
    actor?.id ?? null,
    actor?.name || 'Sistema automático',
    actor?.cpf || null,
    slot?.date || null,
    slot?.time || null,
    slot?.species || null,
    slot?.sex || null,
    slot?.total_quantity ?? null,
    slot?.occupied_quantity ?? null,
    slot?.clinic_id ?? null,
    slot?.clinic || null,
    slot?.active ?? null,
    options.releaseMonth || null,
    options.releaseAt || null,
    options.details || null
  );
}

function slotAuditSummary(slot) {
  return [
    `${slot.date} ${slot.time}`,
    animalTypeLabel(slot.species, slot.sex),
    slot.clinic,
    `${slot.total_quantity} vaga(s)`,
    slot.active ? 'ativa' : 'inativa'
  ].join(' · ');
}

function getClinic(id) {
  return db.prepare(`
    SELECT id, name, address, neighborhood, phone, active, created_at
    FROM clinics
    WHERE id = ?
  `).get(id);
}

function optionalAuth(req, _res, next) {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) {
    next();
    return;
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = getUserById(payload.id);
    if (user?.active) req.user = user;
  } catch (_error) {
    // Public availability endpoints still work without an authenticated profile.
  }
  next();
}

function publicSlotsReleaseNowEnabled() {
  return Boolean(db.prepare(`
    SELECT 1
    FROM slot_release_months
    WHERE datetime(release_at) <= datetime('now', 'localtime')
    LIMIT 1
  `).get());
}

function setPublicSlotsReleaseNowEnabled(enabled) {
  if (!enabled) {
    db.prepare('DELETE FROM slot_release_months').run();
    return;
  }
  db.prepare(`
    INSERT INTO slot_release_months (month, release_at)
    SELECT DISTINCT substr(date, 1, 7), datetime('now', 'localtime')
    FROM slots
    WHERE 1 = 1
    ON CONFLICT(month) DO UPDATE SET
      release_at = excluded.release_at,
      updated_at = CURRENT_TIMESTAMP
  `).run();
}

function listSlotMonthReleases() {
  return db.prepare(`
    SELECT
      months.month,
      COUNT(s.id) AS slot_rows,
      COALESCE(SUM(s.total_quantity), 0) AS total_quantity,
      COALESCE(SUM(s.occupied_quantity), 0) AS occupied_quantity,
      r.release_at
    FROM (
      SELECT DISTINCT substr(date, 1, 7) AS month
      FROM slots
      WHERE date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
    ) months
    LEFT JOIN slots s ON substr(s.date, 1, 7) = months.month
    LEFT JOIN slot_release_months r ON r.month = months.month
    GROUP BY months.month, r.release_at
    ORDER BY months.month ASC
  `).all().map(formatSlotMonthRelease);
}

function getSlotMonthRelease(month) {
  const release = listSlotMonthReleases().find((item) => item.month === month);
  if (!release) throw httpError(404, 'Não existem vagas cadastradas para este mês.');
  return release;
}

function formatSlotMonthRelease(row) {
  let status = 'hidden';
  if (row.release_at) {
    const published = db.prepare("SELECT datetime(?) <= datetime('now', 'localtime') AS value").get(row.release_at).value;
    status = published ? 'public' : 'scheduled';
  }
  return {
    ...row,
    slot_rows: Number(row.slot_rows || 0),
    total_quantity: Number(row.total_quantity || 0),
    occupied_quantity: Number(row.occupied_quantity || 0),
    status
  };
}

function normalizeReleaseMonth(value = '') {
  const month = String(value).trim();
  const match = month.match(/^(\d{4})-(\d{2})$/);
  if (!match || Number(match[2]) < 1 || Number(match[2]) > 12) {
    throw httpError(400, 'Mês de publicação inválido.');
  }
  return month;
}

function normalizeReleaseDateTime(value = '') {
  const raw = String(value).trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) throw httpError(400, 'Informe a data e o horário da publicação.');
  const [, year, month, day, hour, minute, second = '00'] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
  if (
    date.getFullYear() !== Number(year) || date.getMonth() !== Number(month) - 1 || date.getDate() !== Number(day) ||
    date.getHours() !== Number(hour) || date.getMinutes() !== Number(minute) || Number(second) > 59
  ) {
    throw httpError(400, 'Data ou horário de publicação inválido.');
  }
  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}

function slotAvailabilityDateGuard(user, alias = '') {
  const prefix = alias ? `${alias}.` : '';
  const dateField = `${prefix}date`;
  const timeField = `${prefix}time`;
  if (user?.role === 'admin') {
    return `AND ${dateField} >= date('now', 'localtime')`;
  }
  return `
      AND ${dateField} >= date('now', 'localtime')
      AND datetime(${dateField} || ' ' || ${timeField}) >= datetime('now', 'localtime', '+8 hours')
      AND EXISTS (
        SELECT 1
        FROM slot_release_months release_month
        WHERE release_month.month = substr(${dateField}, 1, 7)
          AND datetime(release_month.release_at) <= datetime('now', 'localtime')
      )
    `;
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
    substitute_responsible: Boolean(row.substitute_responsible),
    responsible_city_confirmed: Boolean(row.responsible_city_confirmed),
    responsible_adult_confirmed: Boolean(row.responsible_adult_confirmed),
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

async function parseExcelBuffer(buffer) {
  const FIELD_MAP = {
    name: ['PROTETOR(A)', 'PROTETOR', 'NOME', 'NAME'],
    address: ['ENDEREÇO', 'ENDERECO', 'ADDRESS'],
    phone: ['CONTATO', 'TELEFONE', 'PHONE', 'CEL'],
    cpf: ['CPF'],
    password: ['SENHA', 'PASSWORD', 'PASS'],
    email: ['EMAIL', 'E-MAIL', 'MAIL']
  };

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];

  const headerRow = sheet.getRow(1);
  const colIndex = {};
  headerRow.eachCell((cell, colNumber) => {
    const header = String(cell.value || '').toUpperCase().trim();
    for (const [field, variants] of Object.entries(FIELD_MAP)) {
      if (variants.includes(header)) colIndex[field] = colNumber;
    }
  });

  const rows = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const entry = {};
    for (const [field, colNumber] of Object.entries(colIndex)) {
      const cell = row.getCell(colNumber);
      entry[field] = String(cell.value ?? '').trim();
    }
    if (entry.cpf || entry.name) rows.push(entry);
  });
  return rows;
}

function parseCsvBuffer(buffer) {
  const text = buffer.toString('utf8').replace(/^﻿/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];

  const delimiters = [';', ',', '\t'];
  const delimiter = delimiters.find((d) => lines[0].includes(d)) || ',';

  function splitRow(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (const ch of line) {
      if (ch === '"') { inQuotes = !inQuotes; }
      else if (ch === delimiter && !inQuotes) { result.push(current.trim()); current = ''; }
      else current += ch;
    }
    result.push(current.trim());
    return result;
  }

  const FIELD_MAP = {
    name: ['PROTETOR(A)', 'PROTETOR', 'NOME', 'NAME'],
    address: ['ENDEREÇO', 'ENDERECO', 'ADDRESS'],
    phone: ['CONTATO', 'TELEFONE', 'PHONE', 'CEL'],
    cpf: ['CPF'],
    password: ['SENHA', 'PASSWORD', 'PASS'],
    email: ['EMAIL', 'E-MAIL', 'MAIL']
  };

  const rawHeaders = splitRow(lines[0]).map((h) => h.toUpperCase().replace(/['"]/g, '').trim());
  const colIndex = {};
  for (const [field, variants] of Object.entries(FIELD_MAP)) {
    const idx = rawHeaders.findIndex((h) => variants.includes(h));
    if (idx !== -1) colIndex[field] = idx;
  }

  return lines.slice(1).map((line) => {
    const cells = splitRow(line);
    const row = {};
    for (const [field, idx] of Object.entries(colIndex)) {
      row[field] = (cells[idx] || '').replace(/^"|"$/g, '').trim();
    }
    return row;
  }).filter((row) => row.cpf || row.name);
}

function isValidCpf(cpf) {
  const c = String(cpf).replace(/\D/g, '');
  if (c.length !== 11 || /^(\d)\1+$/.test(c)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(c[i]) * (10 - i);
  let d1 = 11 - (sum % 11);
  if (d1 >= 10) d1 = 0;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += Number(c[i]) * (11 - i);
  let d2 = 11 - (sum % 11);
  if (d2 >= 10) d2 = 0;
  return Number(c[9]) === d1 && Number(c[10]) === d2;
}

function checkFileMagicBytes(filePath) {
  const buf = Buffer.alloc(12);
  const fd = fs.openSync(filePath, 'r');
  fs.readSync(fd, buf, 0, 12, 0);
  fs.closeSync(fd);
  // JPEG: FF D8 FF
  if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return true;
  // PNG: 89 50 4E 47
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) return true;
  // PDF: %PDF
  if (buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) return true;
  // WebP: RIFF....WEBP
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
      buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) return true;
  return false;
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
