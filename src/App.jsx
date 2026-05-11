import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Building2,
  Calendar,
  CalendarPlus,
  CheckCircle2,
  ClipboardCheck,
  Edit3,
  FileCheck,
  Home,
  LogIn,
  LogOut,
  PawPrint,
  Plus,
  Save,
  Shield,
  Trash2,
  UserPlus,
  UserRound,
  Users,
  XCircle
} from 'lucide-react';

const emptyUser = {
  name: '',
  cpf: '',
  address: '',
  neighborhood: '',
  phone: '',
  password: '',
  cityAdultConfirmed: false
};

const emptyAnimal = {
  name: '',
  species: 'gato',
  sex: 'femea',
  breed: '',
  approximateAge: ''
};

const emptyTerms = {
  requirementsAccepted: false,
  documentsAccepted: false
};

function getStoredAuth() {
  try {
    const token = localStorage.getItem('castracao_token');
    const user = JSON.parse(localStorage.getItem('castracao_user') || 'null');
    return token && user ? { token, user } : null;
  } catch (_error) {
    return null;
  }
}

async function request(path, options = {}, token) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`/api${path}`, {
    ...options,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || 'Não foi possível concluir a operação.');
  return data;
}

export default function App() {
  const [view, setView] = useState('home');
  const [auth, setAuth] = useState(getStoredAuth);
  const [availability, setAvailability] = useState([]);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    loadAvailability();
  }, []);

  useEffect(() => {
    if (!auth?.token) return;
    request('/me', {}, auth.token)
      .then((data) => setAuthState(auth.token, data.user))
      .catch(() => logout());
  }, []);

  async function loadAvailability() {
    try {
      const data = await request('/availability');
      setAvailability(data.availability || []);
    } catch (_error) {
      setAvailability([]);
    }
  }

  function setAuthState(token, user) {
    localStorage.setItem('castracao_token', token);
    localStorage.setItem('castracao_user', JSON.stringify(user));
    setAuth({ token, user });
  }

  function logout() {
    localStorage.removeItem('castracao_token');
    localStorage.removeItem('castracao_user');
    setAuth(null);
    setView('home');
  }

  const title = view === 'admin' ? 'Área Administrativa' : view === 'protetor' ? 'Área do Protetor' : 'Castração Animal';

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand-button" type="button" onClick={() => setView('home')} title="Início">
          <span className="brand-mark"><PawPrint size={24} /></span>
          <span>
            <strong>Castração Animal</strong>
            <small>Nova Iguaçu</small>
          </span>
        </button>
        <nav className="top-actions" aria-label="Navegação principal">
          <IconButton icon={Home} label="Início" onClick={() => setView('home')} />
          <IconButton icon={CalendarPlus} label="Inscrição" onClick={() => setView('inscricao')} primary />
          <IconButton icon={UserRound} label="Tutor" onClick={() => setView('usuario')} />
          <IconButton icon={Shield} label="Protetor" onClick={() => setView('protetor')} />
          <IconButton icon={ClipboardCheck} label="Clínica" onClick={() => setView('clinica')} />
          <IconButton icon={Building2} label="Admin" onClick={() => setView('admin')} />
          {auth ? <IconButton icon={LogOut} label="Sair" onClick={logout} /> : null}
        </nav>
      </header>

      {notice ? <div className="toast"><CheckCircle2 size={18} />{notice}</div> : null}

      <main>
        {view === 'home' ? (
          <HomeView availability={availability} auth={auth} setView={setView} />
        ) : null}

        {view === 'inscricao' ? (
          <Wizard
            auth={auth}
            setAuth={setAuthState}
            onDone={() => {
              setNotice('Inscrição registrada com agendamento automático.');
              loadAvailability();
              setTimeout(() => setNotice(''), 4000);
            }}
          />
        ) : null}

        {view === 'usuario' ? (
          auth?.user?.role === 'protetor' || auth?.user?.role === 'tutor' ? (
            <UserDashboard auth={auth} setView={setView} />
          ) : (
            <LoginView title="Área do Tutor" expectedRole="usuario" destinationView="usuario" setAuth={setAuthState} setView={setView} />
          )
        ) : null}

        {view === 'protetor' ? (
          auth?.user?.role === 'protetor' ? (
            <UserDashboard auth={auth} setView={setView} />
          ) : (
            <LoginView title={title} expectedRole="protetor" setAuth={setAuthState} setView={setView} />
          )
        ) : null}

        {view === 'clinica' ? (
          auth?.user?.role === 'clinica' ? (
            <ClinicPanel auth={auth} />
          ) : (
            <LoginView title="Área da Clínica" expectedRole="clinica" destinationView="clinica" setAuth={setAuthState} setView={setView} />
          )
        ) : null}

        {view === 'admin' ? (
          auth?.user?.role === 'admin' ? (
            <AdminPanel auth={auth} />
          ) : (
            <LoginView title={title} expectedRole="admin" setAuth={setAuthState} setView={setView} />
          )
        ) : null}
      </main>
    </div>
  );
}

function HomeView({ availability, auth, setView }) {
  const totals = availability.reduce(
    (acc, item) => {
      acc.total += Number(item.total || 0);
      acc.available += Number(item.available || 0);
      return acc;
    },
    { total: 0, available: 0 }
  );

  return (
    <section className="home-grid">
      <div className="hero-panel">
        <span className="eyebrow">Programa municipal</span>
        <h1>Inscrição para castração animal em Nova Iguaçu</h1>
        <p>
          Cadastre tutor, confirme os requisitos, informe o animal e receba automaticamente o primeiro dia e horário compatível com a vaga disponível.
        </p>
        <div className="hero-actions">
          <button className="button primary large" type="button" onClick={() => setView('inscricao')}>
            <CalendarPlus size={20} /> Fazer inscrição
          </button>
          <button className="button secondary large" type="button" onClick={() => setView('protetor')}>
            <Shield size={20} /> Área do Protetor
          </button>
          <button className="button secondary large" type="button" onClick={() => setView('clinica')}>
            <ClipboardCheck size={20} /> Área da Clínica
          </button>
          <button className="button ghost large" type="button" onClick={() => setView('admin')}>
            <Building2 size={20} /> Área Administrativa
          </button>
        </div>
      </div>

      <div className="status-panel">
        <div className="metric-row">
          <Metric icon={Calendar} label="Vagas futuras" value={totals.total} />
          <Metric icon={CheckCircle2} label="Disponíveis" value={totals.available} />
        </div>
        <div className="availability-list">
          {availability.length ? availability.map((item) => (
            <div className="availability-item" key={`${item.species}-${item.sex}`}>
              <span>{capitalize(item.label)}</span>
              <strong>{item.available}</strong>
            </div>
          )) : <p className="muted">Sem vagas futuras cadastradas no momento.</p>}
        </div>
        {auth ? (
          <button className="button secondary full" type="button" onClick={() => setView('usuario')}>
            <UserRound size={18} /> Ver meus agendamentos
          </button>
        ) : null}
      </div>
    </section>
  );
}

function Wizard({ auth, setAuth, onDone }) {
  const [step, setStep] = useState(1);
  const [role, setRole] = useState(auth?.user?.role === 'protetor' ? 'protetor' : 'tutor');
  const [user, setUser] = useState(() => auth?.user ? {
    name: auth.user.name || '',
    cpf: auth.user.cpf || '',
    address: auth.user.address || '',
    neighborhood: auth.user.neighborhood || '',
    phone: auth.user.phone || '',
    password: '',
    cityAdultConfirmed: true
  } : emptyUser);
  const [terms, setTerms] = useState(emptyTerms);
  const [animal, setAnimal] = useState(emptyAnimal);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const stepTitle = ['Dados do tutor', 'Termos e regras', 'Dados do animal', 'Agendamento automático'][step - 1];

  function updateUser(field, value) {
    setUser((current) => ({ ...current, [field]: value }));
  }

  function updateAnimal(field, value) {
    setAnimal((current) => ({ ...current, [field]: value }));
  }

  function canAdvance() {
    if (step === 1 && !auth) {
      return user.name && user.cpf && user.address && user.neighborhood && user.phone && user.password.length >= 6 && user.cityAdultConfirmed;
    }
    if (step === 1 && auth) return true;
    if (step === 2) return terms.requirementsAccepted && terms.documentsAccepted;
    if (step === 3) return animal.name && animal.species && animal.sex && animal.breed && animal.approximateAge;
    return true;
  }

  async function submit() {
    setLoading(true);
    setError('');
    try {
      const data = auth
        ? await request('/appointments/auto', { method: 'POST', body: { animal, terms } }, auth.token)
        : await request('/public/inscricao', { method: 'POST', body: { user, role, animal, terms } });
      if (data.token && data.user) setAuth(data.token, data.user);
      setResult(data.appointment);
      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="flow-layout">
      <div className="section-title">
        <span className="eyebrow">Etapa {step} de 4</span>
        <h2>{stepTitle}</h2>
      </div>

      <Stepper current={step} />

      {error ? <InlineAlert message={error} /> : null}

      {result ? (
        <ResultPanel appointment={result} />
      ) : (
        <div className="form-surface">
          {step === 1 ? (
            <div className="form-grid">
              {!auth ? (
                <>
                  <label className="field span-2">
                    <span>Perfil</span>
                    <select value={role} onChange={(event) => setRole(event.target.value)}>
                      <option value="tutor">Tutor</option>
                      <option value="protetor">Protetor cadastrado</option>
                    </select>
                    {role === 'protetor' ? <small>O CPF precisa constar na lista de protetores cadastrados pela administração.</small> : null}
                  </label>
                  <TextField label="Nome completo" value={user.name} onChange={(value) => updateUser('name', value)} required />
                  <TextField label="CPF" value={user.cpf} onChange={(value) => updateUser('cpf', value)} required />
                  <TextField label="Endereço" value={user.address} onChange={(value) => updateUser('address', value)} required />
                  <TextField label="Bairro" value={user.neighborhood} onChange={(value) => updateUser('neighborhood', value)} required />
                  <TextField label="Telefone" value={user.phone} onChange={(value) => updateUser('phone', value)} required />
                  <TextField label="Senha de acesso" value={user.password} onChange={(value) => updateUser('password', value)} type="password" required />
                </>
              ) : (
                <div className="signed-box span-2">
                  <UserRound size={24} />
                  <div>
                    <strong>{auth.user.name}</strong>
                    <span>{auth.user.role === 'protetor' ? 'Protetor animal' : 'Tutor'} cadastrado com CPF {maskCpf(auth.user.cpf)}</span>
                  </div>
                </div>
              )}
              <label className="check-row span-2">
                <input
                  type="checkbox"
                  checked={user.cityAdultConfirmed}
                  onChange={(event) => updateUser('cityAdultConfirmed', event.target.checked)}
                  disabled={Boolean(auth)}
                />
                <span>Resido em Nova Iguaçu e sou maior de 18 anos</span>
              </label>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="terms-list">
              {[
                'Tutor pode realizar 1 agendamento por mês; protetor cadastrado pode realizar até 4.',
                'Chegue no horário informado e permaneça na clínica durante todo o procedimento.',
                'Cães devem ir com coleira, guia e focinheira quando necessário; gatos devem ir um por caixa de transporte.',
                'Animal deve ter entre 6 meses e 7 anos.',
                'Peso mínimo: cães 3,5 kg e gatos 2 kg.',
                'Animais braquicefálicos não poderão ser castrados pelo programa.',
                'Fêmeas não podem estar no cio, gestantes ou amamentando.',
                'Jejum absoluto de água e comida por 6 a 8 horas antes do procedimento.',
                'Leve cópias de identidade, CPF e comprovante de residência de Nova Iguaçu.'
              ].map((item) => (
                <div className="rule-item" key={item}><FileCheck size={18} />{item}</div>
              ))}
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={terms.requirementsAccepted}
                  onChange={(event) => setTerms((current) => ({ ...current, requirementsAccepted: event.target.checked }))}
                />
                <span>Li e aceito os requisitos</span>
              </label>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={terms.documentsAccepted}
                  onChange={(event) => setTerms((current) => ({ ...current, documentsAccepted: event.target.checked }))}
                />
                <span>Levarei os documentos</span>
              </label>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="form-grid">
              <TextField label="Nome do animal" value={animal.name} onChange={(value) => updateAnimal('name', value)} required />
              <label className="field">
                <span>Espécie</span>
                <select value={animal.species} onChange={(event) => updateAnimal('species', event.target.value)}>
                  <option value="cao">Cão</option>
                  <option value="gato">Gato</option>
                </select>
              </label>
              <label className="field">
                <span>Sexo</span>
                <select value={animal.sex} onChange={(event) => updateAnimal('sex', event.target.value)}>
                  <option value="macho">Macho</option>
                  <option value="femea">Fêmea</option>
                </select>
              </label>
              <TextField label="Raça" value={animal.breed} onChange={(value) => updateAnimal('breed', value)} required />
              <TextField label="Idade aproximada" value={animal.approximateAge} onChange={(value) => updateAnimal('approximateAge', value)} required />
            </div>
          ) : null}

          {step === 4 ? (
            <div className="confirm-panel">
              <ClipboardCheck size={36} />
              <h3>O sistema escolherá a primeira vaga compatível</h3>
              <p>
                A distribuição respeita ordem de data e horário, clínica, espécie, sexo e limite mensal do perfil. O tutor não escolhe horário manualmente.
              </p>
              <div className="review-grid">
                <span>Perfil</span><strong>{auth?.user?.role === 'protetor' || role === 'protetor' ? 'Protetor animal' : 'Tutor'}</strong>
                <span>Animal</span><strong>{animal.name} · {animalLabel(animal.species, animal.sex)}</strong>
                <span>Raça e idade</span><strong>{animal.breed} · {animal.approximateAge}</strong>
              </div>
            </div>
          ) : null}

          <div className="form-actions">
            <button className="button ghost" type="button" onClick={() => setStep((value) => Math.max(1, value - 1))} disabled={step === 1 || loading}>
              Voltar
            </button>
            {step < 4 ? (
              <button className="button primary" type="button" onClick={() => setStep((value) => value + 1)} disabled={!canAdvance()}>
                Continuar
              </button>
            ) : (
              <button className="button primary" type="button" onClick={submit} disabled={loading || !canAdvance()}>
                <CalendarPlus size={18} /> {loading ? 'Agendando...' : 'Confirmar inscrição'}
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function LoginView({ title, expectedRole, destinationView, setAuth, setView }) {
  const [cpf, setCpf] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function login(event) {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const data = await request('/auth/login', { method: 'POST', body: { cpf, password } });
      if (expectedRole === 'usuario' && !['tutor', 'protetor'].includes(data.user.role)) {
        throw new Error('Use a área administrativa para este CPF.');
      }
      if (expectedRole && expectedRole !== 'usuario' && data.user.role !== expectedRole) {
        throw new Error(expectedRole === 'admin' ? 'Este CPF não possui acesso administrativo.' : 'Este CPF não está como protetor.');
      }
      setAuth(data.token, data.user);
      setView(destinationView || (expectedRole === 'admin' ? 'admin' : 'protetor'));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="auth-layout">
      <form className="auth-panel" onSubmit={login}>
        <div className="section-title compact">
          <span className="eyebrow">Login</span>
          <h2>{title}</h2>
        </div>
        {error ? <InlineAlert message={error} /> : null}
        <TextField label="CPF" value={cpf} onChange={setCpf} required />
        <TextField label="Senha" value={password} onChange={setPassword} type="password" required />
        <button className="button primary full" type="submit" disabled={loading}>
          <LogIn size={18} /> {loading ? 'Entrando...' : 'Entrar'}
        </button>
        {expectedRole === 'protetor' ? (
          <p className="muted">
            Primeiro acesso de protetor cadastrado: faça a inscrição escolhendo o perfil “Protetor cadastrado” e defina sua senha.
          </p>
        ) : expectedRole === 'clinica' ? (
          <p className="muted">Acesso restrito para clínicas cadastradas pela administração.</p>
        ) : (
          <p className="muted">Acesso inicial do administrador: CPF 00000000000 e senha admin123.</p>
        )}
      </form>
    </section>
  );
}

function UserDashboard({ auth, setView }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    load();
  }, []);

  async function load() {
    try {
      const response = await request('/me', {}, auth.token);
      setData(response);
    } catch (err) {
      setError(err.message);
    }
  }

  async function cancel(id) {
    if (!confirm('Cancelar este agendamento? A vaga será liberada.')) return;
    try {
      await request(`/appointments/${id}/cancel`, { method: 'POST', body: {} }, auth.token);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  if (error) return <InlineAlert message={error} />;
  if (!data) return <Loading label="Carregando área do usuário" />;

  return (
    <section className="dashboard-layout">
      <div className="section-title">
        <span className="eyebrow">{data.user.role === 'protetor' ? 'Protetor animal' : 'Tutor'}</span>
        <h2>Meus agendamentos</h2>
      </div>
      <div className="metric-row">
        <Metric icon={Calendar} label="Limite mensal" value={data.limit} />
        <Metric icon={CheckCircle2} label="Usados no mês" value={data.currentMonthUsed} />
      </div>
      <button className="button primary" type="button" onClick={() => setView('inscricao')}>
        <CalendarPlus size={18} /> Novo agendamento
      </button>
      <div className="appointment-list">
        {data.appointments.length ? data.appointments.map((appointment) => (
          <article className="appointment-item" key={appointment.id}>
            <div>
              <strong>{appointment.animal_name}</strong>
              <span>{appointment.animal_type_label} · {appointment.breed}</span>
            </div>
            <div>
              <strong>{formatDate(appointment.date)} às {appointment.time}</strong>
              <span>{appointment.clinic}</span>
              {appointment.clinic_address ? <span>{appointment.clinic_address}</span> : null}
            </div>
            <StatusBadge status={appointment.status} label={appointment.status_label} />
            {appointment.status === 'agendado' ? (
              <button className="icon-only danger" type="button" onClick={() => cancel(appointment.id)} title="Cancelar">
                <XCircle size={18} />
              </button>
            ) : null}
          </article>
        )) : <p className="muted">Nenhum agendamento encontrado.</p>}
      </div>
    </section>
  );
}

function ClinicPanel({ auth }) {
  const [appointments, setAppointments] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  async function loadAppointments() {
    setLoading(true);
    try {
      const data = await request('/admin/appointments', {}, auth.token);
      setAppointments(data.appointments || []);
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAppointments();
  }, []);

  return (
    <section className="admin-layout">
      <div className="section-title">
        <span className="eyebrow">Clínica</span>
        <h2>Agendamentos</h2>
      </div>
      {error ? <InlineAlert message={error} /> : null}
      {loading ? <Loading label="Carregando agendamentos" /> : (
        <AppointmentsTab appointments={appointments} reload={loadAppointments} auth={auth} />
      )}
    </section>
  );
}

function AdminPanel({ auth }) {
  const [tab, setTab] = useState('dashboard');
  const [summary, setSummary] = useState(null);
  const [slots, setSlots] = useState([]);
  const [clinics, setClinics] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [users, setUsers] = useState([]);
  const [protectors, setProtectors] = useState([]);
  const [error, setError] = useState('');

  async function loadAll() {
    try {
      const [summaryData, slotsData, clinicsData, appointmentsData, usersData, protectorsData] = await Promise.all([
        request('/admin/summary', {}, auth.token),
        request('/admin/slots', {}, auth.token),
        request('/admin/clinics', {}, auth.token),
        request('/admin/appointments', {}, auth.token),
        request('/admin/users', {}, auth.token),
        request('/admin/protectors', {}, auth.token)
      ]);
      setSummary(summaryData);
      setSlots(slotsData.slots || []);
      setClinics(clinicsData.clinics || []);
      setAppointments(appointmentsData.appointments || []);
      setUsers(usersData.users || []);
      setProtectors(protectorsData.protectors || []);
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  return (
    <section className="admin-layout">
      <div className="section-title">
        <span className="eyebrow">Administração</span>
        <h2>Painel de controle</h2>
      </div>
      {error ? <InlineAlert message={error} /> : null}
      <div className="tabs" role="tablist">
        {[
          ['dashboard', Home, 'Resumo'],
          ['clinics', Building2, 'Clínicas'],
          ['slots', Calendar, 'Vagas'],
          ['appointments', ClipboardCheck, 'Agendamentos'],
          ['users', Users, 'Usuários'],
          ['protectors', Shield, 'Protetores']
        ].map(([key, Icon, label]) => (
          <button className={tab === key ? 'active' : ''} type="button" key={key} onClick={() => setTab(key)}>
            <Icon size={17} /> {label}
          </button>
        ))}
      </div>

      {tab === 'dashboard' ? <AdminSummary summary={summary} /> : null}
      {tab === 'clinics' ? <ClinicsTab clinics={clinics} reload={loadAll} auth={auth} /> : null}
      {tab === 'slots' ? <SlotsTab slots={slots} clinics={clinics} reload={loadAll} auth={auth} /> : null}
      {tab === 'appointments' ? <AppointmentsTab appointments={appointments} reload={loadAll} auth={auth} /> : null}
      {tab === 'users' ? <UsersTab users={users} clinics={clinics} reload={loadAll} auth={auth} /> : null}
      {tab === 'protectors' ? <ProtectorsTab protectors={protectors} clinics={clinics} reload={loadAll} auth={auth} /> : null}
    </section>
  );
}

function AdminSummary({ summary }) {
  if (!summary) return <Loading label="Carregando resumo" />;
  return (
    <div className="summary-grid">
      <Metric icon={Calendar} label="Total de vagas" value={summary.slots.total} />
      <Metric icon={CheckCircle2} label="Vagas preenchidas" value={summary.slots.occupied} />
      <Metric icon={AlertCircle} label="Disponíveis" value={summary.slots.available} />
      <Metric icon={XCircle} label="Faltas" value={summary.appointments.nao_realizado || 0} />
      <Metric icon={Shield} label="Protetores" value={summary.users.protetor || 0} />
      <Metric icon={UserRound} label="Tutores" value={summary.users.tutor || 0} />
    </div>
  );
}

function ClinicsTab({ clinics, reload, auth }) {
  const blank = { name: '', address: '', neighborhood: '', phone: '', active: true };
  const [form, setForm] = useState(blank);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState('');

  function edit(clinic) {
    setEditing(clinic.id);
    setForm({
      name: clinic.name || '',
      address: clinic.address || '',
      neighborhood: clinic.neighborhood || '',
      phone: clinic.phone || '',
      active: Boolean(clinic.active)
    });
  }

  async function save(event) {
    event.preventDefault();
    try {
      await request(editing ? `/admin/clinics/${editing}` : '/admin/clinics', {
        method: editing ? 'PUT' : 'POST',
        body: form
      }, auth.token);
      setForm(blank);
      setEditing(null);
      setError('');
      reload();
    } catch (err) {
      setError(err.message);
    }
  }

  async function remove(id) {
    if (!confirm('Desativar esta clínica? Ela não poderá ter vagas ativas vinculadas.')) return;
    try {
      await request(`/admin/clinics/${id}`, { method: 'DELETE' }, auth.token);
      reload();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="admin-section">
      <form className="inline-form" onSubmit={save}>
        {error ? <InlineAlert message={error} /> : null}
        <TextField label="Nome da clínica" value={form.name} onChange={(value) => setForm({ ...form, name: value })} required />
        <label className="field span-2">
          <span>Endereço completo *</span>
          <input value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} required />
        </label>
        <TextField label="Bairro" value={form.neighborhood} onChange={(value) => setForm({ ...form, neighborhood: value })} />
        <TextField label="Telefone" value={form.phone} onChange={(value) => setForm({ ...form, phone: value })} />
        <label className="check-row compact-check">
          <input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} />
          <span>Ativa</span>
        </label>
        <button className="button primary" type="submit"><Save size={18} /> {editing ? 'Salvar' : 'Cadastrar clínica'}</button>
      </form>
      <DataTable
        columns={['Clínica', 'Endereço', 'Bairro', 'Telefone', 'Status', 'Ações']}
        rows={clinics.map((clinic) => [
          clinic.name,
          clinic.address,
          clinic.neighborhood || '-',
          clinic.phone || '-',
          clinic.active ? 'Ativa' : 'Inativa',
          <TableActions key={clinic.id} onEdit={() => edit(clinic)} onDelete={() => remove(clinic.id)} />
        ])}
      />
    </div>
  );
}

function SlotsTab({ slots, clinics, reload, auth }) {
  const blank = { date: '', time: '09:00', species: 'gato', sex: 'femea', total_quantity: 1, clinic_id: '' };
  const [form, setForm] = useState(blank);
  const [editing, setEditing] = useState(null);
  const [filters, setFilters] = useState({
    clinic_id: '',
    date: '',
    type: '',
    status: ''
  });
  const [error, setError] = useState('');

  const clinicOptions = useMemo(() => clinics.filter((clinic) => clinic.active), [clinics]);

  const filteredSlots = useMemo(() => {
    return slots.filter((slot) => {
      const type = `${slot.species}-${slot.sex}`;
      const status = slot.active ? 'ativa' : 'inativa';
      return (
        (!filters.clinic_id || String(slot.clinic_id) === filters.clinic_id) &&
        (!filters.date || slot.date === filters.date) &&
        (!filters.type || type === filters.type) &&
        (!filters.status || status === filters.status)
      );
    });
  }, [slots, filters]);

  function edit(slot) {
    setEditing(slot.id);
    setForm({
      date: slot.date,
      time: slot.time,
      species: slot.species,
      sex: slot.sex,
      total_quantity: slot.total_quantity,
      clinic_id: String(slot.clinic_id || ''),
      active: Boolean(slot.active)
    });
  }

  async function save(event) {
    event.preventDefault();
    setError('');
    try {
      await request(editing ? `/admin/slots/${editing}` : '/admin/slots', {
        method: editing ? 'PUT' : 'POST',
        body: form
      }, auth.token);
      setForm(blank);
      setEditing(null);
      reload();
    } catch (err) {
      setError(err.message);
    }
  }

  async function remove(id) {
    if (!confirm('Desativar esta vaga?')) return;
    try {
      await request(`/admin/slots/${id}`, { method: 'DELETE' }, auth.token);
      reload();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="admin-section">
      <form className="inline-form" onSubmit={save}>
        {error ? <InlineAlert message={error} /> : null}
        <TextField label="Data" type="date" value={form.date} onChange={(value) => setForm({ ...form, date: value })} required />
        <TextField label="Hora" type="time" value={form.time} onChange={(value) => setForm({ ...form, time: value })} required />
        <label className="field">
          <span>Espécie</span>
          <select value={form.species} onChange={(event) => setForm({ ...form, species: event.target.value })}>
            <option value="cao">Cão</option>
            <option value="gato">Gato</option>
          </select>
        </label>
        <label className="field">
          <span>Sexo</span>
          <select value={form.sex} onChange={(event) => setForm({ ...form, sex: event.target.value })}>
            <option value="macho">Macho</option>
            <option value="femea">Fêmea</option>
          </select>
        </label>
        <TextField label="Quantidade" type="number" value={form.total_quantity} onChange={(value) => setForm({ ...form, total_quantity: Number(value) })} required />
        <label className="field">
          <span>Clínica *</span>
          <select value={form.clinic_id} onChange={(event) => setForm({ ...form, clinic_id: event.target.value })} required>
            <option value="">Selecione</option>
            {clinicOptions.map((clinic) => (
              <option key={clinic.id} value={clinic.id}>{clinic.name}</option>
            ))}
          </select>
        </label>
        <button className="button primary" type="submit"><Save size={18} /> {editing ? 'Salvar' : 'Criar vaga'}</button>
      </form>
      <div className="filter-bar" aria-label="Filtros de vagas">
        <label className="field">
          <span>Clínica</span>
          <select value={filters.clinic_id} onChange={(event) => setFilters({ ...filters, clinic_id: event.target.value })}>
            <option value="">Todas</option>
            {clinics.map((clinic) => <option key={clinic.id} value={clinic.id}>{clinic.name}</option>)}
          </select>
        </label>
        <TextField label="Data" type="date" value={filters.date} onChange={(value) => setFilters({ ...filters, date: value })} />
        <label className="field">
          <span>Tipo</span>
          <select value={filters.type} onChange={(event) => setFilters({ ...filters, type: event.target.value })}>
            <option value="">Todos</option>
            <option value="gato-femea">Gata</option>
            <option value="gato-macho">Gato</option>
            <option value="cao-femea">Cadela</option>
            <option value="cao-macho">Cão</option>
          </select>
        </label>
        <label className="field">
          <span>Status</span>
          <select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}>
            <option value="">Todos</option>
            <option value="ativa">Ativa</option>
            <option value="inativa">Inativa</option>
          </select>
        </label>
        <button className="button ghost" type="button" onClick={() => setFilters({ clinic_id: '', date: '', type: '', status: '' })}>
          Limpar filtros
        </button>
        <span className="filter-count">{filteredSlots.length} de {slots.length} vagas</span>
      </div>
      <DataTable
        columns={['Data', 'Hora', 'Tipo', 'Clínica', 'Total', 'Ocupadas', 'Status', 'Ações']}
        rows={filteredSlots.map((slot) => [
          formatDate(slot.date),
          slot.time,
          capitalize(slot.label),
          slot.clinic,
          slot.total_quantity,
          slot.occupied_quantity,
          slot.active ? 'Ativa' : 'Inativa',
          <TableActions key={slot.id} onEdit={() => edit(slot)} onDelete={() => remove(slot.id)} />
        ])}
      />
    </div>
  );
}

function AppointmentsTab({ appointments, reload, auth }) {
  const [drafts, setDrafts] = useState({});
  const [error, setError] = useState('');
  const [savedMessage, setSavedMessage] = useState('');

  function draftFor(appointment) {
    return drafts[appointment.id] || { status: appointment.status, reason: appointment.reason || '' };
  }

  async function save(appointment) {
    const draft = draftFor(appointment);
    try {
      await request(`/admin/appointments/${appointment.id}/status`, {
        method: 'PATCH',
        body: draft
      }, auth.token);
      setDrafts((current) => {
        const next = { ...current };
        delete next[appointment.id];
        return next;
      });
      setSavedMessage(`Agendamento ${appointment.protocol} atualizado.`);
      setError('');
      reload();
      setTimeout(() => setSavedMessage(''), 3000);
    } catch (err) {
      setError(err.message);
      setSavedMessage('');
    }
  }

  return (
    <div className="admin-section">
      {error ? <InlineAlert message={error} /> : null}
      {savedMessage ? <div className="inline-success"><CheckCircle2 size={18} />{savedMessage}</div> : null}
      <DataTable
        columns={['Nome', 'Contato', 'Animal', 'Horário', 'Status', 'Motivo', 'Ação']}
        rows={appointments.map((appointment) => {
          const draft = draftFor(appointment);
          return [
            appointment.user_name,
            appointment.user_phone,
            `${appointment.animal_name} · ${appointment.animal_type_label}`,
            `${formatDate(appointment.date)} ${appointment.time} · ${appointment.clinic}${appointment.clinic_address ? ` · ${appointment.clinic_address}` : ''}`,
            <select
              key={`status-${appointment.id}`}
              value={draft.status}
              onChange={(event) => setDrafts({ ...drafts, [appointment.id]: { ...draft, status: event.target.value } })}
            >
              <option value="agendado">Agendado</option>
              <option value="realizado">Realizado</option>
              <option value="nao_realizado">Não realizado</option>
              <option value="cancelado">Cancelado</option>
            </select>,
            <input
              key={`reason-${appointment.id}`}
              className="table-input"
              value={draft.reason}
              onChange={(event) => setDrafts({ ...drafts, [appointment.id]: { ...draft, reason: event.target.value } })}
              placeholder="Motivo"
            />,
            <button key={`save-${appointment.id}`} className="button secondary table-save" type="button" onClick={() => save(appointment)} title="Salvar status">
              <Save size={18} /> Salvar
            </button>
          ];
        })}
      />
    </div>
  );
}

function UsersTab({ users, clinics, reload, auth }) {
  return <UserManager title="Usuários" users={users} clinics={clinics} reload={reload} auth={auth} defaultRole="tutor" />;
}

function ProtectorsTab({ protectors, clinics, reload, auth }) {
  const mapped = protectors.map((item) => ({ ...item, role: 'protetor' }));
  return <UserManager title="Protetores cadastrados" users={mapped} clinics={clinics} reload={reload} auth={auth} defaultRole="protetor" />;
}

function UserManager({ title, users, clinics, reload, auth, defaultRole }) {
  const blank = {
    name: '',
    cpf: '',
    phone: '',
    address: '',
    neighborhood: '',
    role: defaultRole,
    clinic_id: '',
    password: '',
    active: true
  };
  const [form, setForm] = useState(blank);
  const [editing, setEditing] = useState(null);
  const [filters, setFilters] = useState({
    search: '',
    role: '',
    clinic_id: '',
    status: ''
  });
  const [error, setError] = useState('');

  const filteredUsers = useMemo(() => {
    const search = normalizeSearch(filters.search);
    const searchDigits = onlyDigits(filters.search);
    return users.filter((user) => {
      const searchable = normalizeSearch(`${user.name || ''} ${user.cpf || ''} ${user.phone || ''}`);
      const searchableDigits = onlyDigits(`${user.cpf || ''} ${user.phone || ''}`);
      const status = user.active ? 'ativo' : 'inativo';
      return (
        (!search || searchable.includes(search) || (searchDigits && searchableDigits.includes(searchDigits))) &&
        (!filters.role || user.role === filters.role) &&
        (!filters.clinic_id || String(user.clinic_id || '') === filters.clinic_id) &&
        (!filters.status || status === filters.status)
      );
    });
  }, [users, filters]);

  function edit(user) {
    setEditing(user.id);
    setForm({
      name: user.name || '',
      cpf: user.cpf || '',
      phone: user.phone || '',
      address: user.address || '',
      neighborhood: user.neighborhood || '',
      role: user.role || defaultRole,
      clinic_id: user.clinic_id ? String(user.clinic_id) : '',
      password: '',
      active: Boolean(user.active)
    });
  }

  async function save(event) {
    event.preventDefault();
    try {
      await request(editing ? `/admin/users/${editing}` : '/admin/users', {
        method: editing ? 'PUT' : 'POST',
        body: form
      }, auth.token);
      setForm(blank);
      setEditing(null);
      setError('');
      reload();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="admin-section">
      <h3>{title}</h3>
      <form className="inline-form" onSubmit={save}>
        {error ? <InlineAlert message={error} /> : null}
        <TextField label="Nome" value={form.name} onChange={(value) => setForm({ ...form, name: value })} required />
        <TextField label="CPF" value={form.cpf} onChange={(value) => setForm({ ...form, cpf: value })} required />
        <TextField label="Telefone" value={form.phone} onChange={(value) => setForm({ ...form, phone: value })} />
        <TextField label="Endereço" value={form.address} onChange={(value) => setForm({ ...form, address: value })} />
        <TextField label="Bairro" value={form.neighborhood} onChange={(value) => setForm({ ...form, neighborhood: value })} />
        <label className="field">
          <span>Tipo</span>
          <select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })}>
            <option value="tutor">Tutor</option>
            <option value="protetor">Protetor</option>
            <option value="clinica">Clínica</option>
            <option value="admin">Admin</option>
          </select>
        </label>
        {form.role === 'clinica' ? (
          <label className="field">
            <span>Clínica vinculada *</span>
            <select value={form.clinic_id} onChange={(event) => setForm({ ...form, clinic_id: event.target.value })} required>
              <option value="">Selecione</option>
              {clinics.filter((clinic) => clinic.active).map((clinic) => (
                <option key={clinic.id} value={clinic.id}>{clinic.name}</option>
              ))}
            </select>
          </label>
        ) : null}
        <TextField label={form.role === 'clinica' && !editing ? 'Senha *' : 'Senha opcional'} value={form.password} onChange={(value) => setForm({ ...form, password: value })} type="password" required={form.role === 'clinica' && !editing} />
        <label className="check-row compact-check">
          <input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} />
          <span>Ativo</span>
        </label>
        <button className="button primary" type="submit"><UserPlus size={18} /> {editing ? 'Salvar' : 'Cadastrar'}</button>
      </form>
      <div className="filter-bar" aria-label="Filtros de usuários">
        <TextField label="Nome, CPF ou telefone" value={filters.search} onChange={(value) => setFilters({ ...filters, search: value })} />
        <label className="field">
          <span>Tipo</span>
          <select value={filters.role} onChange={(event) => setFilters({ ...filters, role: event.target.value })}>
            <option value="">Todos</option>
            <option value="tutor">Tutor</option>
            <option value="protetor">Protetor</option>
            <option value="clinica">Clínica</option>
            <option value="admin">Admin</option>
          </select>
        </label>
        <label className="field">
          <span>Clínica</span>
          <select value={filters.clinic_id} onChange={(event) => setFilters({ ...filters, clinic_id: event.target.value })}>
            <option value="">Todas</option>
            {clinics.map((clinic) => (
              <option key={clinic.id} value={clinic.id}>{clinic.name}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Status</span>
          <select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}>
            <option value="">Todos</option>
            <option value="ativo">Ativo</option>
            <option value="inativo">Inativo</option>
          </select>
        </label>
        <button className="button ghost" type="button" onClick={() => setFilters({ search: '', role: '', clinic_id: '', status: '' })}>
          Limpar filtros
        </button>
        <span className="filter-count">{filteredUsers.length} de {users.length} usuários</span>
      </div>
      <DataTable
        columns={['Nome', 'CPF', 'Telefone', 'Tipo', 'Clínica', 'Status', 'Ação']}
        rows={filteredUsers.map((user) => [
          user.name,
          maskCpf(user.cpf),
          user.phone || '-',
          user.role,
          user.clinic_name || '-',
          user.active ? 'Ativo' : 'Inativo',
          <button key={user.id} className="icon-only" type="button" onClick={() => edit(user)} title="Editar">
            <Edit3 size={18} />
          </button>
        ])}
      />
    </div>
  );
}

function Stepper({ current }) {
  return (
    <div className="stepper" aria-label="Progresso da inscrição">
      {[1, 2, 3, 4].map((item) => (
        <span key={item} className={item <= current ? 'active' : ''}>{item}</span>
      ))}
    </div>
  );
}

function ResultPanel({ appointment }) {
  return (
    <div className="result-panel">
      <CheckCircle2 size={42} />
      <h3>Agendamento confirmado</h3>
      <p>Protocolo {appointment.protocol}</p>
      <div className="result-grid">
        <span>Data</span><strong>{formatDate(appointment.date)}</strong>
        <span>Horário</span><strong>{appointment.time}</strong>
        <span>Clínica</span><strong>{appointment.clinic}</strong>
        <span>Endereço</span><strong>{appointment.clinic_address || 'Endereço a confirmar'}</strong>
        <span>Animal</span><strong>{appointment.animal_name} · {appointment.animal_type_label}</strong>
      </div>
      <p className="muted">Favor chegar no máximo 30 minutos antes do horário agendado.</p>
    </div>
  );
}

function TextField({ label, value, onChange, type = 'text', required = false }) {
  return (
    <label className="field">
      <span>{label}{required ? ' *' : ''}</span>
      <input type={type} value={value} onChange={(event) => onChange(event.target.value)} required={required} />
    </label>
  );
}

function Metric({ icon: Icon, label, value }) {
  return (
    <div className="metric">
      <Icon size={20} />
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function DataTable({ columns, rows }) {
  if (!rows.length) return <p className="muted">Nenhum registro encontrado.</p>;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TableActions({ onEdit, onDelete }) {
  return (
    <div className="table-actions">
      <button className="icon-only" type="button" onClick={onEdit} title="Editar"><Edit3 size={18} /></button>
      <button className="icon-only danger" type="button" onClick={onDelete} title="Desativar"><Trash2 size={18} /></button>
    </div>
  );
}

function IconButton({ icon: Icon, label, onClick, primary = false }) {
  return (
    <button className={`nav-button ${primary ? 'primary-nav' : ''}`} type="button" onClick={onClick} title={label}>
      <Icon size={18} />
      <span>{label}</span>
    </button>
  );
}

function StatusBadge({ status, label }) {
  return <span className={`status-badge ${status}`}>{label}</span>;
}

function InlineAlert({ message }) {
  return <div className="inline-alert"><AlertCircle size={18} />{message}</div>;
}

function Loading({ label }) {
  return <div className="loading">{label}...</div>;
}

function formatDate(value) {
  if (!value) return '-';
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year}`;
}

function maskCpf(value = '') {
  const digits = String(value).replace(/\D/g, '');
  if (digits.length !== 11) return value;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

function capitalize(value = '') {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function animalLabel(species, sex) {
  if (species === 'gato' && sex === 'femea') return 'gata';
  if (species === 'gato') return 'gato';
  if (sex === 'femea') return 'cadela';
  return 'cão';
}

function normalizeSearch(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .toLowerCase()
    .trim();
}

function onlyDigits(value = '') {
  return String(value).replace(/\D/g, '');
}
