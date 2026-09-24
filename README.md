# Castração Animal Nova Iguaçu

Sistema web para cadastro e agendamento automático de castração animal com perfis de tutor, protetor e administrador.

## Como rodar

```bash
npm install
npm run dev
```

Interface: `http://127.0.0.1:5173`

API: `http://127.0.0.1:4000`

## Cronômetro de publicação de vagas

Em **Admin → Vagas → Publicação das vagas por mês**, o controle **Cronômetro na página principal** permite ativar ou desativar o aviso. A preferência é salva no banco e começa ativada. Desativar o aviso não altera a publicação das vagas.

O contador aparece abaixo dos acessos de protetor, clínica e administrativo na página inicial. Usa a publicação futura mais próxima de um mês com vagas cadastradas (pela data de publicação, não pela data de edição). Segue a publicação agendada independentemente do saldo, da situação da clínica ou do horário de atendimento. A regra de antecedência de 8 horas continua sendo aplicada somente ao agendamento, sem ocultar o contador. Sem publicação futura, o aviso fica oculto.

A contagem usa o relógio do servidor, mostra dias, horas, minutos e segundos e exibe a data no horário de Brasília. Alterações administrativas são consultadas a cada 15 segundos nas páginas abertas; ao zerar, o contador consulta a próxima publicação. Falhas na consulta ocultam o aviso até a recuperação.

Verificação da seleção e da configuração: `node --test server/release-countdown.test.js`.

## Acesso inicial

- Administrador: CPF `00000000000`
- Senha: `admin123`

Na primeira execução o sistema cria o banco SQLite em `data/castracao.sqlite`. Clínicas, protetores e vagas são cadastrados exclusivamente pelo administrador; o servidor não cria nem reativa registros de exemplo durante a inicialização.

## Regras implementadas

- Novos cadastros públicos exigem data de nascimento válida e pelo menos 18 anos completos, com validação no formulário e no servidor pelo calendário de Brasília. A data é salva em `users.birth_date` no formato `AAAA-MM-DD`.
- A atualização adiciona uma coluna opcional ao banco existente. Usuários já cadastrados permanecem com a data vazia, sem alteração das demais informações e sem exigência retroativa no login ou agendamento. A ativação de um pré-cadastro pelo formulário público também solicita a data.
- Testes de idade e preservação dos cadastros: `node --test shared/birth-date.test.js server/birth-date-migration.test.js`.
- Tutor: 1 agendamento por mês.
- Protetor: até 4 agendamentos por mês.
- O usuário escolhe a clínica e a data do atendimento.
- O usuário não escolhe horário.
- O backend seleciona automaticamente o primeiro horário disponível na clínica ativa e data escolhidas, compatível com espécie e sexo do animal.
- Datas lotadas não aparecem para novos agendamentos.
- Vagas controlam data, hora, quantidade, clínica, espécie e sexo.
- Cancelamento libera a vaga.
- Administrador pode criar vagas, usuários/protetores e marcar agendamentos como realizado, não realizado ou cancelado.
- Administrador cadastra clínicas com endereço completo, e as vagas passam a selecionar uma clínica já cadastrada.
- Tutor visualiza a clínica e o endereço no agendamento confirmado.
- Usuário do tipo clínica acessa somente a área de agendamentos da clínica vinculada e pode definir status e motivo.
