# Castração Animal Nova Iguaçu

Sistema web para cadastro e agendamento automático de castração animal com perfis de tutor, protetor e administrador.

## Como rodar

```bash
npm install
npm run dev
```

Interface: `http://127.0.0.1:5173`

API: `http://127.0.0.1:4000`

## Acesso inicial

- Administrador: CPF `00000000000`
- Senha: `admin123`

Na primeira execução o sistema cria o banco SQLite em `data/castracao.sqlite`, importa as protetoras do arquivo `PROTETORAS CADASTRADAS.docx` quando ele existir em `Downloads` e cadastra vagas iniciais inspiradas nos cronogramas do Castramóvel e da Clínica TAK VET.

## Regras implementadas

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
