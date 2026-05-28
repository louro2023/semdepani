# Castracao Animal Nova Iguacu - CLAUDE.md

Sistema web de cadastro de tutores e agendamento automatico de castracao animal gratuita para moradores/municipes de Nova Iguacu.

Este arquivo documenta o estado atual do projeto, regras de negocio, rotas principais e cuidados de deploy.

---

## Stack

| Camada | Tech |
|--------|------|
| Frontend | React 19 + Vite 6, CSS puro em `src/styles.css` |
| Backend | Node.js ESM, Express 5, `node:sqlite` |
| Banco | SQLite em `data/castracao.sqlite` com WAL mode |
| Auth | JWT + bcrypt |
| E-mail | nodemailer, opcional via SMTP |
| Upload | Multer ainda existe no backend, mas a UI de documentos foi removida |
| Icones | Lucide React |
| CEP | BrasilAPI via backend: `https://brasilapi.com.br/api/cep/v1/{cep}` |

---

## Rodar Localmente

```bash
npm install
npm run dev
```

Frontend: `http://localhost:5173`

API: `http://localhost:4000`

Build:

```bash
npm run build
```

Servidor de producao:

```bash
npm start
```

---

## Estrutura

```text
server/
  index.js       Express, rotas e regras de negocio
  db.js          Schema SQLite, seeds e helpers
src/
  App.jsx        SPA React, componentes e fluxos
  styles.css     CSS da aplicacao
  main.jsx       Bootstrap React
data/
  castracao.sqlite  Banco local/producao, nao versionar
  uploads/          Arquivos antigos de documentos, nao versionar
dist/               Build Vite, gerado localmente/producao
```

`data/`, `dist/`, `node_modules/`, `.env` e `.env.local` ficam no `.gitignore`.

---

## Banco de Dados

### Tabela `users`

Campos relevantes:

| Campo | Uso |
|-------|-----|
| `role` | `admin`, `tutor`, `protetor`, `clinica` |
| `clinic_id` | Vincula usuario de clinica a uma clinica |
| `pre_registered` | Marca Protetor Cadastrado pre-cadastrado pela administracao |
| `cep` | CEP do tutor, validado pela BrasilAPI |
| `address` | Endereco/logradouro |
| `address_number` | Numero da residencia ou `S/N` |
| `neighborhood` | Bairro |
| `email` | Opcional |
| `doc_residencia`, `doc_cpf`, `doc_identidade` | Legado de upload de documentos |

### Outras tabelas

- `clinics`: clinicas cadastradas, endereco, bairro, telefone, active.
- `slots`: vagas por data, hora, especie, sexo, clinica e quantidade.
- `animals`: animais do usuario.
- `appointments`: agendamentos, status, protocolo, aceite dos termos e `microchip TEXT` (preenchido ao confirmar como realizado).
- `settings`: chaves internas de seed/importacao.

---

## Regras de Negocio Atuais

### Cadastro publico

- O botao `Cadastrar-se` abre apenas o cadastro do cidadao/tutor.
- O cadastro publico tem 2 etapas:
  1. Dados do cidadao.
  2. Termos e aceite.
- Ao aceitar os termos, o usuario e criado como `tutor`, fica logado automaticamente e vai para a area do tutor.
- O agendamento do animal e feito depois, dentro da area logada.

### Campos do cadastro

Campos obrigatorios do tutor:

- Nome completo.
- CPF valido.
- CEP.
- Endereco.
- Numero da residencia ou opcao `Sem numero`.
- Bairro.
- Telefone.
- Senha com pelo menos 6 caracteres.
- Confirmacao de residencia em Nova Iguacu e maioridade.

O campo `E-mail` e opcional.

Quando o usuario informa 8 digitos no CEP:

- O frontend chama `/api/public/cep/:cep`.
- O backend consulta a BrasilAPI.
- O sistema preenche endereco e bairro quando encontrados.
- O backend bloqueia CEP que nao seja do municipio de Nova Iguacu/RJ.
- A validacao no backend tambem acontece no `POST /api/auth/register`.

### Sem numero

- A opcao `Sem numero` desabilita o campo de numero.
- O backend salva `address_number = 'S/N'`.

### Agendamento

Podem criar agendamentos quando logados:

- `tutor`
- `protetor`
- `admin`

Nao podem criar agendamentos:

- `clinica`

Limites:

- Tutor: 1 agendamento por mes.
- Protetor Cadastrado: ate 4 agendamentos por mes.
- Admin: ilimitado.

O limite mensal e calculado pelo mes do slot escolhido, usando `getMonthlyUsage`.

### Clinicas no agendamento

Endpoint: `GET /api/clinics/available?species=&sex=`

Comportamento atual:

- Retorna todas as clinicas ativas.
- Clinicas com vaga aparecem selecionaveis.
- Clinicas sem vaga aparecem na lista, mas desabilitadas.
- O texto exibido e `Sem vagas disponiveis no momento`.
- O usuario escolhe a clinica, mas nao escolhe horario.
- O sistema reserva automaticamente o primeiro horario compativel disponivel.

### Area de clinica

- Usuario `clinica`: ve somente agendamentos da clinica vinculada em `clinic_id`.
- Usuario `admin`: tambem pode acessar o ambiente de Clinica.
- Para admin, a tela exibe um seletor de clinica.
- Admin pode ver todas as clinicas ou filtrar uma clinica especifica.
- O filtro usa `/api/admin/appointments?clinicId=ID`.

### Troca de senha (protetor e clinica)

- Endpoint `PUT /api/me/password` — restrito a roles `protetor` e `clinica`.
- Exige senha atual (validada com bcrypt) e nova senha com minimo de 6 caracteres.
- Disponivel como formulario colapsavel ("Alterar senha") no painel do protetor e no painel da clinica.
- Admin nao ve esse formulario — usa o painel admin para alterar senhas de qualquer usuario.

### Microchip obrigatorio ao confirmar castracao

- Ao mudar status para `realizado`, o campo `microchip` e obrigatorio.
- Formato: 16 digitos — 15 digitos do numero principal + 1 digito verificador.
- O backend valida formato e unicidade antes do UPDATE (indice unico `idx_appointments_microchip`).
- Duplicata retorna erro 409 com mensagem identificando o agendamento conflitante.
- O microchip e exibido na tabela de agendamentos da clinica/admin.
- O microchip aparece no relatorio de castracoes (PDF e CSV) na secao "Detalhe das castracoes realizadas".

### Protetor Cadastrado

- O termo visivel padrao e `Protetor Cadastrado`.
- O botao `Torne-se um Protetor Cadastrado` abre WhatsApp em `https://wa.me/552137663341`.
- Protetor precisa estar pre-cadastrado pela administracao para ter acesso como protetor.

---

## Rotas Principais

### Publicas

| Metodo | Rota | Descricao |
|--------|------|-----------|
| GET | `/api/health` | Health check |
| GET | `/api/availability` | Vagas agrupadas |
| GET | `/api/clinics/available?species=&sex=` | Todas as clinicas ativas com contador de vagas |
| GET | `/api/public/cpf-status?cpf=` | Verifica CPF ja cadastrado |
| GET | `/api/public/cep/:cep` | Consulta CEP e valida Nova Iguacu via BrasilAPI |
| POST | `/api/auth/login` | Login |
| POST | `/api/auth/register` | Cadastro do tutor, exige aceite dos termos |

### Autenticadas

| Metodo | Rota | Descricao |
|--------|------|-----------|
| GET | `/api/me` | Usuario logado, limite mensal e agendamentos |
| PUT | `/api/me/password` | Troca de senha propria (protetor e clinica apenas) |
| POST | `/api/appointments/auto` | Novo agendamento para tutor/protetor/admin |
| POST | `/api/appointments/:id/cancel` | Cancelar agendamento proprio ou admin |

### Admin/Clinica

| Metodo | Rota | Descricao |
|--------|------|-----------|
| GET | `/api/admin/appointments` | Admin ve todos; clinica ve apenas a vinculada |
| GET | `/api/admin/appointments?clinicId=ID` | Admin filtra por clinica |
| PATCH | `/api/admin/appointments/:id/status` | Atualiza status; status `realizado` exige campo `microchip` (16 digitos) |
| GET/POST | `/api/admin/clinics` | Listar/criar clinicas |
| PUT/DELETE | `/api/admin/clinics/:id` | Editar/desativar/excluir clinica |
| GET/POST | `/api/admin/slots` | Listar/criar vagas |
| PUT/DELETE | `/api/admin/slots/:id` | Editar/desativar/excluir vaga |
| POST | `/api/admin/slots/renew` | Renovar vagas selecionadas |
| GET/POST/PUT | `/api/admin/users` | CRUD usuarios |
| POST | `/api/admin/users/import` | Importar Excel/CSV de protetores |
| GET | `/api/admin/protectors` | Listar protetores |
| GET | `/api/admin/summary` | Metricas |
| GET | `/api/admin/reports` | Relatorios |

---

## Frontend

### Home

- CTA principal: `Cadastrar-se`.
- Se usuario estiver logado, CTA muda para `Agendar castracao`.
- Avisos reforcam que o servico gratuito e somente para moradores/municipes de Nova Iguacu.
- Botao de WhatsApp para `Torne-se um Protetor Cadastrado`.

### Fluxo deslogado

`Cadastrar-se` mostra apenas cadastro do tutor e termos.

Depois do cadastro:

- Salva token/user no localStorage.
- Redireciona para area do tutor.
- Usuario agenda o animal dentro da area logada.

### Fluxo logado

Ao clicar em agendar:

1. Confirma usuario logado.
2. Aceita termos.
3. Informa animal.
4. Escolhe clinica.
5. Confirma agendamento.

### Dashboard do tutor/protetor/admin

- Mostra limite mensal.
- Mostra usados no mes.
- Admin aparece com limite `Ilimitado`.
- Botao `Agendar castracao do animal`.
- Protetor e clinica: formulario colapsavel "Alterar senha" disponivel no dashboard.

---

## Termos Atuais no Wizard

Texto de limite:

```text
Tutor pode realizar 1 agendamento por mes; Protetor Cadastrado pode realizar ate 4 agendamentos por mes; Administrador pode realizar agendamentos sem limite.
```

Demais regras mantidas:

- Chegar no horario informado.
- Permanecer na clinica durante o procedimento.
- Caes: coleira, guia e focinheira quando necessario.
- Gatos: 1 por caixa de transporte.
- Banho no dia anterior, sem pulgas ou carrapatos.
- Idade minima de 6 meses e maxima de 7 anos.
- Caes/cadelas: peso minimo 3,5 kg e maximo 25 kg, salvo avaliacao/autorizacao.
- Felinos: peso minimo de 2 kg.
- Machos devem ter ambos os testiculos na bolsa escrotal.
- Braquicefalicos nao podem ser castrados pelo programa.
- Cadelas/gatas nao devem estar no cio, gestantes ou amamentando.
- Jejum absoluto de agua e comida por 6 a 8 horas.
- Informar medicamentos ao veterinario.
- Vacinados ha menos de 21 dias nao podem ser castrados.
- Residencia obrigatoria em Nova Iguacu.
- Levar **copias** de identidade, CPF e comprovante de residencia de Nova Iguacu no dia.

---

## Deploy em Producao

### Importante: nao subir o banco para o Git

Nao versionar nem enviar:

- `data/castracao.sqlite`
- `data/castracao.sqlite-wal`
- `data/castracao.sqlite-shm`
- `data/uploads/`
- `.env`

O diretorio `data/` ja esta no `.gitignore`. Nunca usar `git add -f data/`.

O banco de producao deve permanecer no servidor de producao. O deploy deve subir apenas codigo.

### Passos normais

```bash
git pull
npm install
npm run build
pm2 restart all
```

Se o deploy usar `DB_PATH`, confirme que a variavel aponta para o banco correto antes de reiniciar.

### Migracao do banco em producao

As mudancas recentes adicionaram colunas via `ensureColumn` em `server/db.js`:

Em `users`:
- `cep TEXT`
- `address_number TEXT`

Em `appointments`:
- `microchip TEXT` — indice unico `idx_appointments_microchip` criado automaticamente

O arquivo `server/db.js` chama `ensureColumn` e `CREATE UNIQUE INDEX IF NOT EXISTS` na inicializacao, entao o restart da aplicacao cria tudo automaticamente.

Mesmo assim, em producao faca backup antes:

```bash
cp data/castracao.sqlite data/castracao.sqlite.bak-$(date +%F-%H%M)
```

Verifique se as colunas existem:

```bash
sqlite3 data/castracao.sqlite "PRAGMA table_info(users);"
```

Se usar `DB_PATH`:

```bash
sqlite3 "$DB_PATH" "PRAGMA table_info(users);"
```

Se por algum motivo a migracao automatica nao executar, rode uma migracao segura via Node na raiz do projeto:

```bash
node --input-type=module -e "import { db } from './server/db.js'; const cols = db.prepare('PRAGMA table_info(users)').all().map(c => c.name); if (!cols.includes('cep')) db.exec('ALTER TABLE users ADD COLUMN cep TEXT'); if (!cols.includes('address_number')) db.exec('ALTER TABLE users ADD COLUMN address_number TEXT'); console.log('users ok:', db.prepare('PRAGMA table_info(users)').all().map(c => c.name).filter(c => ['cep','address_number'].includes(c)).join(','));"
```

Depois reinicie:

```bash
pm2 restart all
```

### BrasilAPI em producao

O servidor precisa conseguir acessar:

```text
https://brasilapi.com.br/api/cep/v1/{cep}
```

Se o servidor de producao nao tiver saida HTTPS, o cadastro por CEP vai falhar com mensagem de consulta indisponivel.

---

## Variaveis de Ambiente

Obrigatorias/recomendadas em producao:

- `JWT_SECRET`
- `ADMIN_CPF`
- `ADMIN_PASSWORD`
- `PORT`
- `DB_PATH`
- `LISTEN_HOST`

E-mail opcional:

- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_FROM`

Sem `SMTP_HOST`, envio de e-mail fica desativado.

---

## Acesso Inicial

Ambiente local/dev:

- CPF admin: `00000000000`
- Senha admin: `admin123`

Em producao, configurar `ADMIN_CPF` e `ADMIN_PASSWORD`.

---

## Observacoes Tecnicas

- Usa `node:sqlite`, disponivel em Node 22+.
- `createAutomaticAppointment` usa `BEGIN IMMEDIATE` para reduzir corrida na reserva de vaga.
- Cancelamento decrementa `slots.occupied_quantity`.
- Reativacao de cancelado incrementa novamente a vaga, respeitando capacidade salvo override de admin.
- `slots.clinic` e texto legado; `slots.clinic_id` e a FK atual.
- `migrateSlotClinics()` preenche `clinic_id` para slots antigos quando possivel.
- Upload de documentos ainda existe no backend por compatibilidade, mas a UI orienta levar documentos fisicos.
