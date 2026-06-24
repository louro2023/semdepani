# Castracao Animal Nova Iguacu - CLAUDE.md

Sistema web de cadastro de tutores e agendamento automatico de castracao animal gratuita para moradores/municipes de Nova Iguacu.

Este arquivo documenta o estado atual do projeto, regras de negocio, rotas principais, cuidados de deploy e orientacoes para futuras alteracoes.

Ultima atualizacao: 2026-06-24.

---

## Stack

| Camada | Tech |
|--------|------|
| Frontend | React 19 + Vite 6, CSS puro em `src/styles.css` |
| Backend | Node.js ESM, Express 5, `node:sqlite` |
| Banco | SQLite em `data/castracao.sqlite` com WAL mode |
| Auth | JWT + bcrypt |
| E-mail | nodemailer, opcional via SMTP |
| Upload | Multer ainda existe no backend para documentos legados |
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

## Alteracoes Recentes Desta Versao

- Area de Clinica: adicionados filtros por status, mes e nome do tutor.
- Area de Clinica para admin: continua permitindo ver todas as clinicas ou filtrar por uma clinica especifica.
- Area de Vagas/Agendamento admin: o botao `Renovar Vagas` agora abre uma tela de renovacao das vagas selecionadas.
- Renovacao de vagas: cada vaga selecionada permite editar nova data, novo horario, tipo, clinica e total de vagas antes de salvar.
- Datas: padrao visual `DD/MM/AAAA` no frontend e exports CSV/PDF; o banco continua armazenando `YYYY-MM-DD`.
- Horarios: campos de horario usam padrao 24 horas `HH:MM`, evitando exibicao AM/PM.
- Disponibilidade publica: tutor e protetor so visualizam/selecionam vagas com pelo menos 8 horas de antecedencia.
- Disponibilidade para admin: admin logado pode agendar vagas futuras ja lancadas no sistema, mesmo fora da janela publica de 5 dias e sem a trava de 8 horas.
- Disponibilidade por mes: uma vaga so fica visivel ao publico a partir de 5 dias antes do inicio do mes da propria vaga.
- API: rotas `/api` desconhecidas retornam JSON de erro antes do fallback da SPA, evitando resposta HTML em chamadas do frontend.
- Auditoria: removidos import/funcao sem uso (`Plus` no frontend e `bookingTargetMonth` no banco).

---

## Banco de Dados

### Orientacao Sobre as Ultimas Mudancas

As mudancas recentes de filtros, renovacao de vagas, datas em `DD/MM/AAAA`, horarios em 24h, regra de 8 horas e janela de 5 dias nao exigiram nova tabela, nova coluna nem migracao manual.

O banco continua usando:

- Datas armazenadas como texto ISO `YYYY-MM-DD`.
- Horarios armazenados como texto `HH:MM`.
- Quantidade de vagas em `slots.total_quantity` e ocupacao em `slots.occupied_quantity`.
- Status do agendamento em `appointments.status`.

Ao fazer deploy desta versao, basta subir o codigo e reiniciar a aplicacao. O restart continua executando `initSchema()` e as migracoes automaticas ja existentes em `server/db.js`.

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

### Tabela `slots`

Representa as vagas cadastradas pela administracao.

| Campo | Uso |
|-------|-----|
| `date` | Data da vaga em `YYYY-MM-DD` |
| `time` | Horario da vaga em `HH:MM` |
| `species` | `cao` ou `gato` |
| `sex` | `macho` ou `femea` |
| `total_quantity` | Total de vagas daquele lote |
| `occupied_quantity` | Quantidade ja ocupada |
| `clinic_id` | Clinica vinculada |
| `clinic` | Texto legado com nome da clinica |
| `active` | Se a vaga esta ativa |

### Tabela `appointments`

Campos importantes:

| Campo | Uso |
|-------|-----|
| `status` | `agendado`, `realizado`, `nao_realizado`, `cancelado` |
| `microchip` | Obrigatorio ao confirmar como `realizado` |
| `substitute_responsible` | Marca responsavel substituto |
| `responsible_*` | Dados do responsavel substituto |

Outras tabelas:

- `clinics`: clinicas cadastradas, endereco, bairro, telefone, active.
- `animals`: animais do usuario.
- `settings`: chaves internas de seed/importacao.

### Migracoes Automaticas Existentes

`server/db.js` usa `ensureColumn()` na inicializacao para manter compatibilidade com bancos antigos.

Colunas automaticas em `users`:

- `clinic_id INTEGER REFERENCES clinics(id)`
- `cep TEXT`
- `address_number TEXT`
- `doc_residencia TEXT`
- `doc_cpf TEXT`
- `doc_identidade TEXT`
- `email TEXT`

Colunas automaticas em `appointments`:

- `microchip TEXT`
- `substitute_responsible INTEGER NOT NULL DEFAULT 0`
- `responsible_name TEXT`
- `responsible_cpf TEXT`
- `responsible_cep TEXT`
- `responsible_address TEXT`
- `responsible_address_number TEXT`
- `responsible_neighborhood TEXT`
- `responsible_phone TEXT`
- `responsible_email TEXT`
- `responsible_city_confirmed INTEGER NOT NULL DEFAULT 0`
- `responsible_adult_confirmed INTEGER NOT NULL DEFAULT 0`

Indice automatico:

- `idx_appointments_microchip`, unico para `appointments.microchip` quando nao nulo.

Coluna automatica em `slots`:

- `clinic_id INTEGER REFERENCES clinics(id)`

Tambem existe `migrateSlotClinics()`, que tenta preencher `slots.clinic_id` em vagas antigas usando o texto legado `slots.clinic`.

---

## Regras de Negocio Atuais

### Cadastro Publico

- O botao `Cadastrar-se` abre apenas o cadastro do cidadao/tutor.
- O cadastro publico tem 2 etapas:
  1. Dados do cidadao.
  2. Termos e aceite.
- Ao aceitar os termos, o usuario e criado como `tutor`, fica logado automaticamente e vai para a area do tutor.
- O agendamento do animal e feito depois, dentro da area logada.

### Campos do Cadastro

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

### Sem Numero

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

O limite mensal e calculado pelo mes do slot escolhido, usando `getMonthlyUsage()`.

### Regra de Disponibilidade das Vagas

Tutor e protetor so podem visualizar e selecionar vagas que cumpram todas as regras abaixo:

- Vaga ativa.
- Clinica ativa.
- Vaga com capacidade disponivel.
- Data da vaga maior ou igual a data atual local.
- Data/hora da vaga pelo menos 8 horas depois do momento atual local.
- Vaga liberada pela janela mensal: a data atual precisa ser igual ou posterior a 5 dias antes do primeiro dia do mes da vaga.

Exemplo:

- Vaga em `28/05/2026 11:00`.
- Ela so aparece se o momento atual for ate no maximo `28/05/2026 03:00` ou antes, respeitando o intervalo minimo de 8 horas.
- Se faltar menos de 8 horas, a vaga fica oculta e tambem nao pode ser reservada pela API.

Para administrador logado:

- Pode visualizar e selecionar vagas futuras ja cadastradas no sistema, inclusive vagas para meses futuros, como 60 dias adiante.
- Nao segue a janela publica de 5 dias antes do inicio do mes.
- Nao segue a trava publica de 8 horas de antecedencia.
- Continua exigindo vaga ativa, clinica ativa, data de hoje ou futura e capacidade disponivel.

Essa regra por perfil e aplicada nos endpoints:

- `GET /api/clinics/available?species=&sex=`
- `GET /api/clinics/:clinicId/available-dates?species=&sex=`
- `GET /api/availability`
- `POST /api/appointments/auto`

A revalidacao dentro de `POST /api/appointments/auto` e obrigatoria, porque impede reserva de vaga que ficou indisponivel entre a exibicao no frontend e a confirmacao.

Importante: a tela admin de vagas lista vagas administrativas e nao deve ocultar vagas futuras pela regra publica. Admin precisa conseguir criar, editar, renovar, excluir e tambem agendar vagas antes de elas ficarem visiveis ao publico.

### Clinicas no Agendamento

Endpoint: `GET /api/clinics/available?species=&sex=`

Endpoint: `GET /api/clinics/:clinicId/available-dates?species=&sex=`

Comportamento atual:

- Retorna todas as clinicas ativas.
- Clinicas com vaga aparecem selecionaveis.
- Clinicas sem vaga aparecem na lista, mas desabilitadas.
- O texto exibido e `Sem vagas disponiveis no momento`.
- Depois de escolher a clinica, o usuario escolhe uma data disponivel para a unidade.
- Para tutor/protetor, datas lotadas, fora da janela mensal ou com menos de 8 horas de antecedencia nao aparecem.
- Para admin logado, datas futuras com vaga disponivel aparecem mesmo fora da janela mensal e sem a trava de 8 horas.
- O usuario escolhe a clinica e a data, mas nao escolhe horario.
- O backend reserva automaticamente o primeiro horario compativel disponivel na data escolhida.

### Area de Clinica

- Usuario `clinica`: ve somente agendamentos da clinica vinculada em `clinic_id`.
- Usuario `admin`: tambem pode acessar o ambiente de Clinica.
- Para admin, a tela exibe seletor de clinica.
- Admin pode ver todas as clinicas ou filtrar uma clinica especifica.
- O filtro de clinica usa `/api/admin/appointments?clinicId=ID`.
- Alem da clinica, a tela permite filtrar os agendamentos por:
  - Status: todos, agendado, realizado, nao realizado, cancelado.
  - Mes da data do agendamento.
  - Nome do tutor.
- Status, mes e tutor sao filtros aplicados no frontend sobre a lista carregada.
- O botao de limpar filtros volta a exibicao para todos os resultados permitidos pelo perfil.

### Area Admin - Vagas

A aba `Vagas` permite:

- Criar vaga.
- Editar vaga.
- Desativar vaga.
- Excluir definitivamente quando permitido.
- Selecionar varias vagas.
- Filtrar por clinica, data, tipo e status.
- Paginar a lista.

Datas nos formularios aparecem como `DD/MM/AAAA`.

Horarios nos formularios aparecem como `HH:MM` em formato 24 horas.

### Renovar Vagas Selecionadas

Na aba `Vagas`, ao selecionar uma ou mais vagas e clicar em `Renovar Vagas`, o sistema abre uma nova tela de renovacao.

Nessa tela, para cada vaga selecionada, o admin define:

- Nova data.
- Novo horario.
- Tipo da vaga, combinando especie e sexo.
- Clinica.
- Total de vagas.

Ao salvar, o frontend envia `renewals` para:

```text
POST /api/admin/slots/renew
```

O backend cria novas vagas em `slots` com `occupied_quantity = 0`, mantendo as vagas originais intactas.

Compatibilidade: o backend ainda aceita o formato antigo com apenas `ids`. Nesse caso, ele clona a vaga para `date + 1 month`, mantendo horario, tipo, clinica e quantidade original.

### Renovacao Automatica Mensal

Endpoint:

```text
POST /api/admin/slots/auto-renew
```

Helper:

```text
autoRenewSlots()
```

Comportamento:

- So executa a partir do dia 25 do mes.
- Clona vagas ativas do mes atual para o mes seguinte.
- Mantem data equivalente, horario, tipo, clinica e total.
- Cria vagas com `occupied_quantity = 0`.
- E idempotente: nao duplica vaga que ja existe com os mesmos dados.
- Tambem e chamado no bootstrap do servidor uma vez por dia.

### Troca de Senha (Protetor e Clinica)

- Endpoint `PUT /api/me/password`, restrito a roles `protetor` e `clinica`.
- Exige senha atual validada com bcrypt e nova senha com minimo de 6 caracteres.
- Disponivel como formulario colapsavel no painel do protetor e no painel da clinica.
- Admin nao ve esse formulario; usa o painel admin para alterar senhas de qualquer usuario.

### Microchip Obrigatorio ao Confirmar Castracao

- Ao mudar status para `realizado`, o campo `microchip` e obrigatorio.
- Formato: 16 digitos, sendo 15 digitos do numero principal + 1 digito verificador.
- O backend valida formato e unicidade antes do `UPDATE`.
- Duplicata retorna erro 409 com mensagem identificando o agendamento conflitante.
- O microchip e exibido na tabela de agendamentos da clinica/admin.
- O microchip aparece no relatorio de castracoes PDF e CSV.

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
| GET | `/api/availability` | Vagas agrupadas; aplica regra publica ou excecao de admin quando houver token de admin |
| GET | `/api/clinics/available?species=&sex=` | Todas as clinicas ativas com contador de vagas disponiveis para o perfil |
| GET | `/api/clinics/:clinicId/available-dates?species=&sex=` | Datas disponiveis por clinica ativa, tipo de animal e perfil |
| GET | `/api/public/cpf-status?cpf=` | Verifica CPF ja cadastrado |
| GET | `/api/public/cep/:cep` | Consulta CEP e valida Nova Iguacu via BrasilAPI |
| POST | `/api/auth/login` | Login |
| POST | `/api/auth/register` | Cadastro do tutor, exige aceite dos termos |

### Autenticadas

| Metodo | Rota | Descricao |
|--------|------|-----------|
| GET | `/api/me` | Usuario logado, limite mensal e agendamentos |
| PUT | `/api/me/password` | Troca de senha propria, apenas protetor e clinica |
| POST | `/api/appointments/auto` | Novo agendamento para tutor/protetor/admin |
| POST | `/api/appointments/:id/cancel` | Cancelar agendamento proprio ou admin |

### Admin/Clinica

| Metodo | Rota | Descricao |
|--------|------|-----------|
| GET | `/api/admin/appointments` | Admin ve todos; clinica ve apenas a vinculada |
| GET | `/api/admin/appointments?clinicId=ID` | Admin filtra por clinica |
| PATCH | `/api/admin/appointments/:id/status` | Atualiza status; status `realizado` exige `microchip` |
| GET/POST | `/api/admin/clinics` | Listar/criar clinicas |
| PUT/DELETE | `/api/admin/clinics/:id` | Editar/desativar/excluir clinica |
| GET/POST | `/api/admin/slots` | Listar/criar vagas |
| PUT/DELETE | `/api/admin/slots/:id` | Editar/desativar/excluir vaga |
| POST | `/api/admin/slots/renew` | Renovar vagas selecionadas com novos dados |
| POST | `/api/admin/slots/auto-renew` | Renovacao automatica mensal |
| GET/POST/PUT | `/api/admin/users` | CRUD usuarios |
| POST | `/api/admin/users/import` | Importar Excel/CSV de protetores |
| GET | `/api/admin/protectors` | Listar protetores |
| GET | `/api/admin/summary` | Metricas |
| GET | `/api/admin/reports` | Relatorios |

### Fallback da API

Qualquer rota iniciada com `/api` que nao exista retorna JSON:

```json
{ "message": "Rota de API nao encontrada: ..." }
```

Esse fallback deve ficar antes do `express.static(distDir)` para evitar que o frontend receba HTML quando espera JSON.

---

## Frontend

### Home

- CTA principal: `Cadastrar-se`.
- Se usuario estiver logado, CTA muda para `Agendar castracao`.
- Avisos reforcam que o servico gratuito e somente para moradores/municipes de Nova Iguacu.
- Botao de WhatsApp para `Torne-se um Protetor Cadastrado`.

### Fluxo Deslogado

`Cadastrar-se` mostra apenas cadastro do tutor e termos.

Depois do cadastro:

- Salva token/user no `localStorage`.
- Redireciona para area do tutor.
- Usuario agenda o animal dentro da area logada.

### Fluxo Logado

Ao clicar em agendar:

1. Confirma usuario logado.
2. Aceita termos.
3. Informa animal.
4. Escolhe clinica.
5. Escolhe data disponivel.
6. Confirma agendamento.

Na etapa de data, o frontend busca datas por clinica e tipo de animal via `/api/clinics/:clinicId/available-dates`.

### Datas e Horarios

- Exibir datas como `DD/MM/AAAA`.
- Aceitar digitacao de datas em `DD/MM/AAAA`.
- Converter para ISO `YYYY-MM-DD` antes de enviar ao backend.
- O backend tambem aceita `DD/MM/AAAA` em `normalizeDateInput()`.
- Exibir horarios como `HH:MM`, formato 24 horas.
- Evitar inputs nativos que exibam AM/PM no navegador.

### Dashboard do Tutor/Protetor/Admin

- Mostra limite mensal.
- Mostra usados no mes.
- Admin aparece com limite `Ilimitado`.
- Botao `Agendar castracao do animal`.
- Protetor e clinica: formulario colapsavel de alteracao de senha.

### Requisicoes da API

O helper `request()` em `src/App.jsx` espera JSON nas respostas de API.

Se a resposta nao for JSON, exibe:

```text
Resposta invalida da API. Reinicie o servidor e tente novamente.
```

Isso normalmente indica servidor errado, servidor parado, proxy mal configurado ou fallback da SPA respondendo uma chamada `/api`.

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
- Levar copias de identidade, CPF e comprovante de residencia de Nova Iguacu no dia.

---

## Deploy em Producao

### Importante: Nao Subir o Banco para o Git

Nao versionar nem enviar:

- `data/castracao.sqlite`
- `data/castracao.sqlite-wal`
- `data/castracao.sqlite-shm`
- `data/uploads/`
- `.env`

O diretorio `data/` ja esta no `.gitignore`. Nunca usar `git add -f data/`.

O banco de producao deve permanecer no servidor de producao. O deploy deve subir apenas codigo.

### Passos Normais

```bash
git pull
npm install
npm run build
pm2 restart all
```

Se o deploy usar `DB_PATH`, confirme que a variavel aponta para o banco correto antes de reiniciar.

### Backup Antes de Deploy com Mudanca de Banco

Mesmo que a versao atual nao exija migracao nova, mantenha o procedimento de backup quando houver alteracao de schema:

```bash
cp data/castracao.sqlite data/castracao.sqlite.bak-$(date +%F-%H%M)
```

Se usar `DB_PATH`:

```bash
cp "$DB_PATH" "$DB_PATH.bak-$(date +%F-%H%M)"
```

### Verificar Colunas

```bash
sqlite3 data/castracao.sqlite "PRAGMA table_info(users);"
sqlite3 data/castracao.sqlite "PRAGMA table_info(appointments);"
sqlite3 data/castracao.sqlite "PRAGMA table_info(slots);"
```

Se usar `DB_PATH`:

```bash
sqlite3 "$DB_PATH" "PRAGMA table_info(users);"
sqlite3 "$DB_PATH" "PRAGMA table_info(appointments);"
sqlite3 "$DB_PATH" "PRAGMA table_info(slots);"
```

### Migracao Manual Somente em Emergencia

Preferir sempre deixar `initSchema()` rodar no restart. Se a migracao automatica nao executar, usar scripts Node pontuais e idempotentes, verificando antes se a coluna ja existe.

Exemplo para validar colunas principais:

```bash
node --input-type=module -e "import { db } from './server/db.js'; for (const table of ['users','appointments','slots']) console.log(table, db.prepare('PRAGMA table_info(' + table + ')').all().map(c => c.name).join(','));"
```

Depois reinicie:

```bash
pm2 restart all
```

### BrasilAPI em Producao

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
- `createAutomaticAppointment()` usa `BEGIN IMMEDIATE` para reduzir corrida na reserva de vaga.
- Cancelamento decrementa `slots.occupied_quantity`.
- Reativacao de cancelado incrementa novamente a vaga, respeitando capacidade salvo override de admin.
- `slots.clinic` e texto legado; `slots.clinic_id` e a FK atual.
- `migrateSlotClinics()` preenche `clinic_id` para slots antigos quando possivel.
- `bookingTargetMonth()` foi removida porque a regra antiga de mes alvo foi substituida pela janela de visibilidade de 5 dias antes do inicio do mes da vaga.
- Upload de documentos ainda existe no backend por compatibilidade, mas o fluxo principal orienta levar documentos fisicos.
- Ao alterar regras de disponibilidade, atualizar sempre os quatro pontos: `/api/clinics/available`, `/api/clinics/:clinicId/available-dates`, `/api/availability` e `createAutomaticAppointment()`.
- Ao alterar formato de data/hora, manter conversao entre frontend (`DD/MM/AAAA`, `HH:MM`) e banco (`YYYY-MM-DD`, `HH:MM`).
