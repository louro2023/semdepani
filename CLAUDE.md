# Castracao Animal Nova Iguacu - CLAUDE.md

Sistema web de cadastro de tutores e agendamento automatico de castracao animal gratuita para moradores/municipes de Nova Iguacu.

Este arquivo documenta o estado atual do projeto, regras de negocio, rotas principais, cuidados de deploy e orientacoes para futuras alteracoes.

Ultima atualizacao: 2026-06-26.

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
- Disponibilidade mensal: admin controla cada mes separadamente como oculto, visivel agora ou com publicacao agendada para data e horario futuros.
- Disponibilidade para admin: admin logado pode agendar vagas futuras ja lancadas no sistema, mesmo fora da janela publica de 5 dias e sem a trava de 8 horas.
- Meses sem publicacao configurada permanecem ocultos do publico.
- API: rotas `/api` desconhecidas retornam JSON de erro antes do fallback da SPA, evitando resposta HTML em chamadas do frontend.
- Auditoria: removidos import/funcao sem uso (`Plus` no frontend e `bookingTargetMonth` no banco).

---

## Banco de Dados

### Orientacao Sobre as Ultimas Mudancas

A publicacao mensal adiciona a tabela `slot_release_months`. Ela e criada automaticamente por `initSchema()` e nao exige migracao manual.

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
- `slot_release_months`: mes (`YYYY-MM`) e data/hora em que suas vagas se tornam publicas.
- `slot_audit_logs`: historico imutavel de criacao, renovacao, edicao, desativacao, exclusao e publicacao de vagas, com administrador e fotografia dos dados no momento da acao. Registra somente acoes ocorridas depois da implantacao da auditoria; vagas antigas nao sao importadas retroativamente.

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

O limite mensal e calculado pelo mes do slot escolhido. Na reserva, a contagem usa o CPF do usuario para aplicar o limite do perfil ao mesmo CPF.

### Regra de Disponibilidade das Vagas

Tutor e protetor so podem visualizar e selecionar vagas de meses publicados pela administracao.

Para um mes publicado, continuam obrigatorias as regras abaixo:

- Vaga ativa.
- Clinica ativa.
- Vaga com capacidade disponivel.
- Data da vaga maior ou igual a data atual local.
- Data/hora da vaga pelo menos 8 horas depois do momento atual local.
- Limite mensal por CPF.

Meses ocultos ou com publicacao agendada para o futuro nao retornam vagas nas rotas publicas.

Exemplo:

- Vaga em `28/05/2026 11:00`.
- Com maio de 2026 publicado, ela so aparece se o momento atual for ate no maximo `28/05/2026 03:00` ou antes, respeitando o intervalo minimo de 8 horas.
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
- Para tutor/protetor, datas so aparecem quando o respectivo mes esta publicado, e ainda respeitam lotacao e 8 horas de antecedencia.
- Para admin logado, datas futuras com vaga disponivel aparecem mesmo sem disponibilizacao publica e sem a trava de 8 horas.
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
- Filtrar por clinica, data, mes, tipo e status.
- Paginar a lista.
- Visualizar claramente o estado de cada mes: `Visivel ao publico`, `Publicacao agendada` ou `Oculto do publico`.
- O painel de publicacao oculta meses vencidos e exibe o mes vigente e todos os meses futuros que possuam vagas cadastradas.
- Publicar agora, ocultar ou agendar a publicacao de cada mes para uma data e horario futuros.
- O agendamento da publicacao usa data em `DD/MM/AAAA`, com calendario e mascara de digitacao, e horario em formato 24 horas `HH:MM`.

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

### Relatorios Administrativos

- A aba Admin > Relatorios possui o botao `Exportar PDF` com o resumo ja existente.
- Ao lado dele existe `Baixar relatorio completo`, que abre uma versao de impressao para salvar em PDF ou imprimir.
- O relatorio completo pode ser gerado para todas as clinicas ou para uma clinica especifica.
- O relatorio completo pode ser filtrado por status, inclusive para gerar somente atendimentos realizados.
- O relatorio completo permite definir periodo por data inicial e data final, no formato `DD/MM/AAAA`.
- O relatorio completo usa `appointmentDetails` de `/api/admin/reports`.
- Ele inclui status, data, horario, clinica, tutor, CPF, telefone, endereco completo do tutor, responsavel que levou o animal, telefone/endereco desse responsavel quando houver substituto, animal, tipo, raca, idade e microchip.
- O layout do relatorio completo e configurado para A4 paisagem e inclui graficos por status, por clinica/data e por tipo de castracao realizada.

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
| GET | `/api/admin/slots/releases` | Listar estado de publicacao de todos os meses com vagas |
| PUT | `/api/admin/slots/releases/:month` | Publicar agora, ocultar ou agendar a publicacao de um mes |
| GET | `/api/admin/slot-logs` | Listar o historico administrativo de vagas e publicacoes |
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
- Exibe aviso de que o responsavel substituto pode ser cadastrado, alterado ou removido ate 5 horas antes do horario agendado.
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

- Comparecer a clinica a partir do horario agendado.
- O atendimento sera realizado por ordem de chegada entre os animais agendados para o mesmo horario.
- O responsavel deve permanecer na clinica durante todo o procedimento e estar preparado para transportar o animal, que podera estar sonolento apos a cirurgia.
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
sqlite3 data/castracao.sqlite "PRAGMA table_info(settings);"
```

Se usar `DB_PATH`:

```bash
sqlite3 "$DB_PATH" "PRAGMA table_info(users);"
sqlite3 "$DB_PATH" "PRAGMA table_info(appointments);"
sqlite3 "$DB_PATH" "PRAGMA table_info(slots);"
sqlite3 "$DB_PATH" "PRAGMA table_info(settings);"
sqlite3 "$DB_PATH" "PRAGMA table_info(slot_release_months);"
```

### Checklist de Vagas em Producao

Para o publico enxergar vagas, confirme estes pontos no banco de producao:

- O servidor foi reiniciado depois do deploy, para executar `initSchema()`.
- A tabela `slot_release_months` existe.
- O mes da vaga possui um registro com `release_at` menor ou igual ao horario atual local.
- As vagas estao com `active = 1`.
- As clinicas das vagas estao com `active = 1`.
- As vagas possuem `clinic_id` preenchido e apontando para uma clinica existente.
- `occupied_quantity < total_quantity`.
- A data/hora da vaga ainda respeita a regra de 8 horas.

Consultar a publicacao mensal:

```bash
sqlite3 data/castracao.sqlite "SELECT month, release_at, datetime(release_at) <= datetime('now', 'localtime') AS public FROM slot_release_months ORDER BY month;"
```

Se usar `DB_PATH`:

```bash
sqlite3 "$DB_PATH" "SELECT month, release_at, datetime(release_at) <= datetime('now', 'localtime') AS public FROM slot_release_months ORDER BY month;"
```

Estados:

- Registro com `release_at` no passado: mes visivel ao publico.
- Registro com `release_at` no futuro: publicacao agendada.
- Ausencia do mes na tabela: mes oculto.

Publicar janeiro de 2027 direto no banco, somente em emergencia:

```bash
sqlite3 data/castracao.sqlite "INSERT OR REPLACE INTO slot_release_months (month, release_at, updated_at) VALUES ('2027-01', datetime('now', 'localtime'), CURRENT_TIMESTAMP);"
```

Ocultar janeiro de 2027 direto no banco:

```bash
sqlite3 data/castracao.sqlite "DELETE FROM slot_release_months WHERE month = '2027-01';"
```

Se usar `DB_PATH`, troque `data/castracao.sqlite` por `"$DB_PATH"`.

Listar vagas de meses publicados que deveriam aparecer ao publico:

```bash
sqlite3 data/castracao.sqlite "SELECT s.id, s.date, s.time, s.species, s.sex, s.total_quantity, s.occupied_quantity, c.name AS clinic FROM slots s JOIN clinics c ON c.id = s.clinic_id JOIN slot_release_months r ON r.month = substr(s.date, 1, 7) WHERE datetime(r.release_at) <= datetime('now', 'localtime') AND s.active = 1 AND c.active = 1 AND s.occupied_quantity < s.total_quantity AND s.date >= date('now', 'localtime') AND datetime(s.date || ' ' || s.time) >= datetime('now', 'localtime', '+8 hours') ORDER BY s.date, s.time LIMIT 50;"
```

Verificar vagas antigas sem `clinic_id`, que nao aparecem nas consultas publicas:

```bash
sqlite3 data/castracao.sqlite "SELECT id, date, time, clinic, clinic_id FROM slots WHERE clinic_id IS NULL OR clinic_id = '';"
```

O `migrateSlotClinics()` tenta preencher `clinic_id` automaticamente pelo nome em `slots.clinic`. Se ainda houver vagas sem `clinic_id`, primeiro confira se a clinica existe:

```bash
sqlite3 data/castracao.sqlite "SELECT id, name, active FROM clinics ORDER BY name;"
```

Depois corrija manualmente apenas as vagas conferidas. Exemplo:

```bash
sqlite3 data/castracao.sqlite "UPDATE slots SET clinic_id = (SELECT id FROM clinics WHERE clinics.name = slots.clinic) WHERE clinic_id IS NULL AND clinic IS NOT NULL AND EXISTS (SELECT 1 FROM clinics WHERE clinics.name = slots.clinic);"
```

Depois de qualquer ajuste manual em producao, reinicie a aplicacao:

```bash
pm2 restart all
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
- A exibicao publica e controlada por mes em `slot_release_months`; ausencia de registro significa mes oculto.
- Upload de documentos ainda existe no backend por compatibilidade, mas o fluxo principal orienta levar documentos fisicos.
- Ao alterar regras de disponibilidade, atualizar sempre os quatro pontos: `/api/clinics/available`, `/api/clinics/:clinicId/available-dates`, `/api/availability` e `createAutomaticAppointment()`.
- Ao alterar formato de data/hora, manter conversao entre frontend (`DD/MM/AAAA`, `HH:MM`) e banco (`YYYY-MM-DD`, `HH:MM`).
