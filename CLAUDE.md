# Castração Animal Nova Iguaçu — CLAUDE.md

Sistema web de cadastro e agendamento automático de castração animal gratuita pelo município de Nova Iguaçu.

---

## Stack

| Camada | Tech |
|--------|------|
| Frontend | React 19 + Vite 6, CSS puro (`src/styles.css`) |
| Backend | Node.js (ESM), Express 5, `node:sqlite` (built-in) |
| BD | SQLite em `data/castracao.sqlite` |
| Auth | JWT (`jsonwebtoken`) + bcrypt |
| Upload | Multer (documentos físicos — endpoint ainda existe mas UI removida) |
| Icons | Lucide React |

---

## Rodar

```bash
npm run dev        # frontend :5173 + backend :4000 (concurrently)
npm run build      # build Vite → dist/
npm start          # só o servidor Express (serve dist/ estático)
```

Proxy Vite: `/api/*` → `http://127.0.0.1:4000`.

---

## Estrutura de arquivos

```
server/
  index.js      — Express: todas as rotas, lógica de negócio
  db.js         — Schema SQLite, seed, helpers de DB
src/
  App.jsx       — React SPA completa (único arquivo de componentes)
  styles.css    — CSS puro, variáveis em :root
  main.jsx      — ReactDOM.createRoot
data/
  castracao.sqlite   — BD (gerado automaticamente)
  uploads/           — Docs enviados (pasta por user_id)
dist/              — Build Vite (gerado por npm run build)
scripts/
  import-docs.js — Importa PROTETORAS CADASTRADAS.docx manualmente
```

---

## Banco de dados — tabelas

### `users`
| campo | tipo | notas |
|-------|------|-------|
| role | TEXT | `admin` / `tutor` / `protetor` / `clinica` |
| clinic_id | INT FK | vincula usuário `clinica` a uma clínica |
| pre_registered | INT | 1 = protetor importado do DOCX |
| doc_residencia / doc_cpf / doc_identidade | TEXT | filename no disco |

### `clinics` — nome, endereço, bairro, telefone, active

### `slots` — data, hora, species (cao/gato), sex (macho/femea), total_quantity, occupied_quantity, clinic_id, active

### `appointments` — user_id, animal_id, slot_id, status, protocol, requirements_accepted, documents_accepted
- status: `agendado` / `realizado` / `nao_realizado` / `cancelado`

### `animals` — user_id, name, species, sex, breed, approximate_age

### `settings` — chave/valor (ex: `protectors_imported_at`)

---

## Regras de negócio

### Limites de agendamento
- **Tutor**: 1 agendamento por mês (verificado pela função `getMonthlyUsage`)
- **Protetor**: máximo **4 agendamentos no total** (verificado por `getTotalUsage` — não por mês)
- Cancelamento libera a vaga (decremented em `slots.occupied_quantity`)

### Fluxo de agendamento (`createAutomaticAppointment`)
1. Insere animal no BD
2. Busca slots disponíveis filtrados por species + sex (+ clinic_id opcional)
3. Verifica limite: protetor = total ever, tutor = mês do slot
4. Reserva primeiro slot disponível dentro do limite
5. Gera protocolo único `NI-YYYYMMDD-XXXXX`
6. INSERT em `appointments`
7. Tudo dentro de `BEGIN IMMEDIATE` / `ROLLBACK` on error

### Seleção de clínica
- Tutor/protetor **escolhe a clínica** mas **não escolhe horário**
- Endpoint público: `GET /api/clinics/available?species=&sex=` → retorna clínicas com vagas para a combinação
- Horário é auto-atribuído (primeiro slot disponível na clínica escolhida)

### Perfis e acessos
| Role | Acesso |
|------|--------|
| `tutor` | Wizard de inscrição, dashboard pessoal, cancelar próprios agendamentos |
| `protetor` | Igual tutor, limite 4 total |
| `clinica` | Painel de agendamentos apenas da clínica vinculada (via `clinic_id`) |
| `admin` | Tudo: clínicas, vagas, agendamentos, usuários, protetores |

### Restrições de registro
- Protetor precisa de CPF pré-cadastrado (`pre_registered = 1`) para criar conta
- Admin cadastra protetores via painel ou importação do DOCX

---

## Wizard de inscrição — 5 etapas

| Etapa | Conteúdo |
|-------|----------|
| 1 — Dados do tutor | Nome, CPF, endereço, bairro, telefone, senha, checkbox cidade/adulto |
| 2 — Termos e regras | Lista completa de requisitos + aviso obrigatório de documentos físicos |
| 3 — Dados do animal | Espécie (gato/cão), sexo, nome, raça, idade aproximada |
| 4 — Escolher clínica | Busca `clinics/available` e lista botões de seleção; horário é automático |
| 5 — Confirmação | Revisão: perfil, animal, clínica → botão "Confirmar inscrição" |

**Documentos**: upload foi **removido**. UI exibe aviso laranja em ambos wizard (step 2) e dashboard: identidade + CPF + comprovante de residência devem ser levados **em original** ao posto.

---

## Rotas da API

### Públicas
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/health` | Health check |
| GET | `/api/availability` | Vagas totais agrupadas por species/sex |
| GET | `/api/clinics/available?species=&sex=` | Clínicas com vagas para a combinação |
| POST | `/api/auth/login` | Login (rate limit 15/min) |
| POST | `/api/auth/register` | Registro sem agendamento |
| POST | `/api/public/inscricao` | Registro + agendamento automático (rate limit 5/min) |

### Autenticadas (tutor/protetor)
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/me` | Dados do usuário + agendamentos + limite usado |
| POST | `/api/appointments/auto` | Novo agendamento (usuário já logado) |
| POST | `/api/appointments/:id/cancel` | Cancelar agendamento próprio |
| GET | `/api/documents/:userId/:type` | Download de documento (admin/clinica) |

### Admin
| Método | Rota | Descrição |
|--------|------|-----------|
| GET/POST | `/api/admin/clinics` | CRUD clínicas |
| PUT/DELETE | `/api/admin/clinics/:id` | Editar/desativar clínica |
| GET/POST | `/api/admin/slots` | CRUD vagas |
| PUT/DELETE | `/api/admin/slots/:id` | Editar/desativar vaga |
| GET | `/api/admin/appointments` | Todos agendamentos (clinica vê só os seus) |
| PATCH | `/api/admin/appointments/:id/status` | Mudar status do agendamento |
| GET/POST/PUT | `/api/admin/users` | CRUD usuários |
| GET | `/api/admin/protectors` | Lista protetores |
| GET | `/api/admin/summary` | Métricas do painel admin |

---

## Acesso inicial

- Admin CPF: `00000000000` / senha: `admin123`
- Env vars de produção: `JWT_SECRET`, `ADMIN_CPF`, `ADMIN_PASSWORD`, `PORT` (default 4000), `DB_PATH`, `LISTEN_HOST`, `SEED_DOCS_DIR`

---

## Seed automático (primeira execução)

1. Admin padrão
2. Clínicas: **Castramovel** + **Clínica TAK VET**
3. Vagas para as próximas 3 semanas (quarta/quinta/sexta)
4. Importa protetores de `~/Downloads/PROTETORAS CADASTRADAS.docx` (se existir)
5. Fallback: 1 protetora exemplo (`11122233344`)

---

## Painel Admin — abas

- **Resumo** — métricas (vagas, agendamentos por status, tutores, protetores)
- **Clínicas** — CRUD de clínicas; desativar bloqueia se houver vagas ativas
- **Vagas** — CRUD de slots; não altera species/sex se já tem agendamentos
- **Agendamentos** — lista geral; mudar status realizado/não_realizado/cancelado
- **Usuários** — CRUD completo; criar usuário `clinica` vincula ao clinic_id
- **Protetores** — lista de protetores com status de senha definida

---

## Termos exigidos (step 2 do wizard)

- 1 agendamento/mês por tutor; protetor até 4 no total
- Chegar no horário; responsável fica durante todo procedimento e transporta animal sonolento
- Cães: coleira + guia + focinheira. Gatos: 1 por caixa
- Banho no dia anterior; sem pulgas/carrapatos
- Idade: 6 meses a 7 anos
- Peso cães/cadelas: 3,5–25 kg (salvo autorização veterinária)
- Peso felinos: mínimo 2 kg
- Machos: ambos testículos na bolsa escrotal
- Braquicefálicos **proibidos**: Pug, Shih Tzu, Bulldog Fr/Ing, Lhasa Apso, Boxer, Pequinês, Boston Terrier, Cavalier KCS, Gato Persa, Chow-chow, American Bully
- Cadelas/gatas: sem cio, gestação ou amamentação
- Jejum absoluto: 6–8h antes
- Informar medicações ao veterinário
- Vacinados < 21 dias = impedido; animal inapto = procedimento negado
- Residência obrigatória em Nova Iguaçu
- Docs obrigatórios **em original** no posto: identidade + CPF + comprovante de residência (terceiros levam os próprios)

---

## Observações importantes

- `db.js` usa `node:sqlite` (nativo Node 22+) — sem dependência `better-sqlite3`
- Transações em `createAutomaticAppointment` usam `BEGIN IMMEDIATE` para evitar race condition
- Mudança de status cancela/restaura `occupied_quantity` atomicamente
- Slots têm coluna `clinic` (texto legado) e `clinic_id` (FK); ambos mantidos por compatibilidade
- `migrateSlotClinics()` sincroniza slots antigos sem `clinic_id`
- Upload de docs ainda tem endpoint (`POST /api/me/documents`) mas a UI foi removida; arquivos antigos ainda servidos via `GET /api/documents/:userId/:type`
