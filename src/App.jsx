import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  BarChart2,
  Building2,
  Calendar,
  CalendarPlus,
  CheckCircle2,
  ClipboardCheck,
  Download,
  Edit3,
  Eye,
  FileCheck,
  Home,
  KeyRound,
  LogIn,
  LogOut,
  MessageCircle,
  PawPrint,
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
  cep: '',
  address: '',
  addressNumber: '',
  addressNumberMissing: false,
  neighborhood: '',
  phone: '',
  email: '',
  password: '',
  cityAdultConfirmed: false
};

const emptyResponsible = {
  enabled: false,
  name: '',
  cpf: '',
  cep: '',
  address: '',
  addressNumber: '',
  addressNumberMissing: false,
  neighborhood: '',
  phone: '',
  email: '',
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

const APPOINTMENT_STATUS_OPTIONS = [
  ['agendado', 'Agendado'],
  ['realizado', 'Realizado'],
  ['nao_realizado', 'Não realizado'],
  ['cancelado', 'Cancelado']
];

const MONTH_FILTER_OPTIONS = [
  ['01', '1 - Janeiro'],
  ['02', '2 - Fevereiro'],
  ['03', '3 - Março'],
  ['04', '4 - Abril'],
  ['05', '5 - Maio'],
  ['06', '6 - Junho'],
  ['07', '7 - Julho'],
  ['08', '8 - Agosto'],
  ['09', '9 - Setembro'],
  ['10', '10 - Outubro'],
  ['11', '11 - Novembro'],
  ['12', '12 - Dezembro']
];

const CPF_DIGITS_LENGTH = 11;
const PASSWORD_MIN_LENGTH = 6;
const WEEKDAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

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
  let data = {};
  try {
    data = await response.json();
  } catch (_error) {
    throw new Error('Resposta inválida da API. Reinicie o servidor e tente novamente.');
  }
  if (!response.ok) throw new Error(data.message || 'Não foi possível concluir a operação.');
  return data;
}

export default function App() {
  const [view, setView] = useState('home');
  const [auth, setAuth] = useState(getStoredAuth);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!auth?.token) return;
    request('/me', {}, auth.token)
      .then((data) => setAuthState(auth.token, data.user))
      .catch(() => logout());
  }, []);

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

  const title = view === 'admin' ? 'Área Administrativa' : view === 'protetor' ? 'Área do Protetor Cadastrado' : 'Castração Animal';

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand-button" type="button" onClick={() => setView('home')} title="Início">
          <span className="brand-mark"><img src="/brasao.png" alt="Brasão Nova Iguaçu" className="brand-brasao" /></span>
          <span>
            <strong>Castração Animal</strong>
            <small>Nova Iguaçu</small>
          </span>
        </button>
        <nav className="top-actions" aria-label="Navegação principal">
          <IconButton icon={Home} label="Início" onClick={() => setView('home')} />
          <IconButton icon={CalendarPlus} label={auth ? 'Agendamento' : 'Cadastrar-se'} onClick={() => setView('inscricao')} primary />
          <IconButton icon={UserRound} label="Tutor" onClick={() => setView('usuario')} />
          <IconButton icon={Shield} label="Protetor Cadastrado" onClick={() => setView('protetor')} />
          <IconButton icon={ClipboardCheck} label="Clínica" onClick={() => setView('clinica')} />
          <IconButton icon={Building2} label="Admin" onClick={() => setView('admin')} />
          {auth ? <IconButton icon={LogOut} label="Sair" onClick={logout} /> : null}
        </nav>
      </header>

      {notice ? <div className="toast"><CheckCircle2 size={18} />{notice}</div> : null}

      <main>
        {view === 'home' ? (
          <HomeView auth={auth} setView={setView} />
        ) : null}

        {view === 'inscricao' ? (
          <Wizard
            auth={auth}
            onDone={({ token, user: signedUser, appointment } = {}) => {
              if (token && signedUser) setAuthState(token, signedUser);
              if (appointment) {
                setNotice(`Agendamento confirmado! Protocolo ${appointment.protocol}.`);
              } else {
                setNotice('Cadastro concluído! Você já está logado na área do tutor. Agora faça o agendamento da castração do seu animal.');
              }
              setView(appointment && auth?.user?.role === 'admin' ? 'admin' : 'usuario');
              setTimeout(() => setNotice(''), 6000);
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
          auth?.user?.role === 'clinica' || auth?.user?.role === 'admin' ? (
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
      <footer className="app-footer">
        <p>© 2026 Secretaria Municipal de Defesa e Proteção dos Animais. Horário de Funcionamento: De 09h às 17h. Todos os direitos reservados.</p>
        <p style={{fontSize:'12px',marginTop:'6px',opacity:0.7}}>Desenvolvido pela Subsecretaria de Tecnologia da Informação de Nova Iguaçu – SEMUG.</p>
      </footer>
    </div>
  );
}

function HomeView({ auth, setView }) {

  return (
    <div className="home-layout">
      <section className="ed-hero">
        <div className="ed-hero-content">
          <div className="ed-eyebrow">
            <span>Programa Municipal · Nova Iguaçu</span>
            <div className="ed-rule" />
          </div>
          <h1 className="ed-heading">
            Castração<br />
            <em>gratuita</em><br />
            para o seu<br />
            animal.
          </h1>
          <p className="ed-sub">
            Primeiro crie seu cadastro de tutor. Depois, na área logada, solicite o agendamento da castração do seu animal.
          </p>
          <div className="ed-eligibility">
            <Home size={18} />
            <span>A castração gratuita pelo sistema é destinada somente a moradores de Nova Iguaçu.</span>
          </div>
          <div className="ed-actions">
            <div className="ed-main-actions">
              <button className="button primary large" type="button" onClick={() => setView('inscricao')}>
                <CalendarPlus size={20} /> {auth ? 'Agendar castração' : 'Cadastrar-se'}
              </button>
              <button className="button secondary large" type="button" onClick={() => setView('usuario')}>
                <LogIn size={20} /> Faça login como tutor
              </button>
            </div>
            <a
              className="button whatsapp large ed-protector-cta"
              href="https://wa.me/552137663341"
              target="_blank"
              rel="noreferrer"
            >
              <MessageCircle size={20} /> Torne-se um Protetor Cadastrado
            </a>
            <div className="ed-secondary-actions">
              <button className="button text" type="button" onClick={() => setView('protetor')}>
                <Shield size={15} /> Protetor Cadastrado
              </button>
              <span className="ed-dot" />
              <button className="button text" type="button" onClick={() => setView('clinica')}>
                <ClipboardCheck size={15} /> Clínica
              </button>
              <span className="ed-dot" />
              <button className="button text" type="button" onClick={() => setView('admin')}>
                <Building2 size={15} /> Administrativo
              </button>
            </div>
          </div>
        </div>

        <div className="ed-avail">
          <img src="/pets.png" alt="Animais para castração" className="ed-avail-pets" />
          <img src="/semdepa.png" alt="Semdepa" className="ed-avail-semdepa" />
        </div>
      </section>

      <section className="ed-steps">
        <div className="ed-steps-label">Como funciona</div>
        <p className="ed-steps-note">
          Antes de se cadastrar, confirme que o tutor reside em Nova Iguaçu. O benefício gratuito é municipal e exclusivo para munícipes.
        </p>
        <div className="ed-steps-grid">
          <div className="ed-step">
            <div className="ed-step-top">
              <div className="ed-step-icon"><UserPlus size={28} /></div>
              <div className="ed-step-num">01</div>
            </div>
            <div className="ed-step-rule" />
            <strong>Cadastro do tutor</strong>
            <p>Preencha seus dados, confirme residência em Nova Iguaçu e aceite os termos do programa municipal.</p>
          </div>
          <div className="ed-step">
            <div className="ed-step-top">
              <div className="ed-step-icon"><Building2 size={28} /></div>
              <div className="ed-step-num">02</div>
            </div>
            <div className="ed-step-rule" />
            <strong>Área do tutor</strong>
            <p>Após concluir o cadastro, entre logado para informar o animal e escolher uma clínica com vaga disponível.</p>
          </div>
          <div className="ed-step">
            <div className="ed-step-top">
              <div className="ed-step-icon"><CalendarPlus size={28} /></div>
              <div className="ed-step-num">03</div>
            </div>
            <div className="ed-step-rule" />
            <strong>Confirmação automática</strong>
            <p>Depois de confirmar, o protocolo, a clínica, a data e o horário ficam salvos na área do tutor.</p>
          </div>
        </div>
      </section>
    </div>
  );
}

function Wizard({ auth, onDone }) {
  const isRegistrationFlow = !auth;
  const isAdminScheduling = auth?.user?.role === 'admin';
  const stepTitles = isRegistrationFlow
    ? ['Dados do cidadão', 'Termos e aceite']
    : ['Usuário logado', 'Termos e regras', 'Dados do animal', 'Escolher clínica', 'Escolher data', 'Confirmação'];
  const stepLabels = isRegistrationFlow
    ? ['Dados', 'Termos']
    : ['Tutor', 'Termos', 'Animal', 'Clínica', 'Data', 'Confirmar'];
  const stepDescriptions = isRegistrationFlow
    ? [
        'Crie seu acesso como tutor. O cadastro é exclusivo para moradores e munícipes de Nova Iguaçu.',
        'Leia as regras do programa e aceite os termos para concluir seu cadastro. O agendamento do animal será feito depois, na área do tutor.'
      ]
    : [
        'Seu cadastro já está ativo. Agora siga os próximos passos para solicitar a castração do animal.',
        'Revise os requisitos do programa antes de solicitar o agendamento.',
        'Informe os dados do animal que será avaliado para a castração.',
        'Escolha uma clínica com vaga disponível para o tipo de animal informado.',
        'Escolha um dos dias disponibilizados pela administração para a clínica selecionada.',
        'Confira os dados antes de confirmar o agendamento.'
      ];
  const totalSteps = stepTitles.length;
  const [step, setStep] = useState(1);
  const [user, setUser] = useState(() => auth?.user ? {
    name: auth.user.name || '',
    cpf: auth.user.cpf || '',
    cep: auth.user.cep || '',
    address: auth.user.address || '',
    addressNumber: auth.user.address_number || '',
    addressNumberMissing: auth.user.address_number === 'S/N',
    neighborhood: auth.user.neighborhood || '',
    phone: auth.user.phone || '',
    password: '',
    cityAdultConfirmed: true
  } : emptyUser);
  const [responsible, setResponsible] = useState(emptyResponsible);
  const [terms, setTerms] = useState(emptyTerms);
  const [animal, setAnimal] = useState(emptyAnimal);
  const [clinics, setClinics] = useState([]);
  const [selectedClinicId, setSelectedClinicId] = useState(null);
  const [availableDates, setAvailableDates] = useState([]);
  const [selectedDate, setSelectedDate] = useState('');
  const [clinicsLoading, setClinicsLoading] = useState(false);
  const [datesLoading, setDatesLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [cpfRegistrationError, setCpfRegistrationError] = useState('');
  const [cepLookup, setCepLookup] = useState({ loading: false, error: '', success: '' });
  const [responsibleCepLookup, setResponsibleCepLookup] = useState({ loading: false, error: '', success: '' });
  const [validationAttempted, setValidationAttempted] = useState(false);
  const [result, setResult] = useState(null);

  const stepTitle = stepTitles[step - 1];
  const stepDescription = stepDescriptions[step - 1];
  const cpfDigits = onlyDigits(user.cpf);
  const cepDigits = onlyDigits(user.cep);
  const responsibleCepDigits = onlyDigits(responsible.cep);
  const cpfError = getCpfValidationMessage(user.cpf) || cpfRegistrationError;
  const cepError = cepLookup.error || (validationAttempted && step === 1 && cepDigits.length !== 8 ? 'Informe um CEP válido com 8 dígitos.' : '');
  const responsibleCpfError = responsible.enabled ? getCpfValidationMessage(responsible.cpf) : '';
  const responsibleCepError = responsibleCepLookup.error || (validationAttempted && step === 1 && responsible.enabled && responsibleCepDigits.length !== 8 ? 'Informe um CEP válido com 8 dígitos para o responsável substituto.' : '');
  const showStepOneFieldErrors = validationAttempted && step === 1 && isRegistrationFlow;
  const showResponsibleFieldErrors = validationAttempted && step === 1 && !isRegistrationFlow && responsible.enabled;
  const selectedDateInfo = availableDates.find((item) => item.date === selectedDate);
  const selectedDateTime = selectedDateInfo?.first_time || '';

  useEffect(() => {
    if (!isRegistrationFlow) return;
    if (cepDigits.length !== 8) {
      setCepLookup({ loading: false, error: '', success: '' });
      return;
    }

    let cancelled = false;
    setCepLookup({ loading: true, error: '', success: '' });
    request(`/public/cep/${cepDigits}`)
      .then((data) => {
        if (cancelled) return;
        setUser((current) => {
          if (onlyDigits(current.cep) !== cepDigits) return current;
          return {
            ...current,
            address: data.address?.street || current.address,
            neighborhood: data.address?.neighborhood || current.neighborhood
          };
        });
        setCepLookup({ loading: false, error: '', success: 'Endereço encontrado em Nova Iguaçu.' });
      })
      .catch((err) => {
        if (!cancelled) setCepLookup({ loading: false, error: err.message, success: '' });
      });

    return () => {
      cancelled = true;
    };
  }, [cepDigits, isRegistrationFlow]);

  useEffect(() => {
    if (isRegistrationFlow || !responsible.enabled) {
      setResponsibleCepLookup({ loading: false, error: '', success: '' });
      return;
    }
    if (responsibleCepDigits.length !== 8) {
      setResponsibleCepLookup({ loading: false, error: '', success: '' });
      return;
    }

    let cancelled = false;
    setResponsibleCepLookup({ loading: true, error: '', success: '' });
    request(`/public/cep/${responsibleCepDigits}`)
      .then((data) => {
        if (cancelled) return;
        setResponsible((current) => {
          if (!current.enabled || onlyDigits(current.cep) !== responsibleCepDigits) return current;
          return {
            ...current,
            address: data.address?.street || current.address,
            neighborhood: data.address?.neighborhood || current.neighborhood
          };
        });
        setResponsibleCepLookup({ loading: false, error: '', success: 'Endereço encontrado em Nova Iguaçu.' });
      })
      .catch((err) => {
        if (!cancelled) setResponsibleCepLookup({ loading: false, error: err.message, success: '' });
      });

    return () => {
      cancelled = true;
    };
  }, [responsibleCepDigits, responsible.enabled, isRegistrationFlow]);

  function updateUser(field, value) {
    setError('');
    if (field === 'cpf') setCpfRegistrationError('');
    if (field === 'cep') setCepLookup({ loading: false, error: '', success: '' });
    setUser((current) => ({ ...current, [field]: value }));
  }

  function updateResponsible(field, value) {
    setError('');
    if (field === 'cep') setResponsibleCepLookup({ loading: false, error: '', success: '' });
    setResponsible((current) => {
      if (field === 'enabled' && !value) return { ...emptyResponsible };
      return { ...current, [field]: value };
    });
  }

  function updateAnimal(field, value) {
    setAnimal((current) => ({ ...current, [field]: value }));
    setSelectedClinicId(null);
    setAvailableDates([]);
    setSelectedDate('');
  }

  async function loadClinics() {
    setClinicsLoading(true);
    setClinics([]);
    setSelectedClinicId(null);
    setAvailableDates([]);
    setSelectedDate('');
    try {
      const data = await request(`/clinics/available?species=${animal.species}&sex=${animal.sex}`, {}, auth?.token);
      const list = data.clinics || [];
      const clinicsWithSlots = list.filter((clinic) => Number(clinic.available_slots || 0) > 0);
      setClinics(list);
      if (clinicsWithSlots.length === 1) setSelectedClinicId(clinicsWithSlots[0].id);
    } catch (_err) {
      setClinics([]);
    } finally {
      setClinicsLoading(false);
    }
  }

  function chooseClinic(clinicId) {
    setSelectedClinicId(clinicId);
    setAvailableDates([]);
    setSelectedDate('');
  }

  async function loadAvailableDates(clinicId = selectedClinicId) {
    if (!clinicId) return;
    setDatesLoading(true);
    setAvailableDates([]);
    setSelectedDate('');
    try {
      const data = await request(`/clinics/${clinicId}/available-dates?species=${animal.species}&sex=${animal.sex}`, {}, auth?.token);
      const dates = data.dates || [];
      setAvailableDates(dates);
      if (dates.length === 1) setSelectedDate(dates[0].date);
    } catch (err) {
      setAvailableDates([]);
      setError(err.message);
    } finally {
      setDatesLoading(false);
    }
  }

  function validateStep(targetStep = step) {
    if (targetStep === 1 && isRegistrationFlow) {
      if (!user.name || !user.cep || !user.address || (!user.addressNumber && !user.addressNumberMissing) || !user.neighborhood || !user.phone) return 'Preencha todos os campos obrigatórios da etapa do tutor.';
      if (cpfError) return cpfError;
      if (cepDigits.length !== 8) return 'Informe um CEP válido com 8 dígitos.';
      if (cepLookup.loading) return 'Aguarde a consulta do CEP para continuar.';
      if (cepLookup.error) return cepLookup.error;
      if (user.password.length < PASSWORD_MIN_LENGTH) return `A senha de acesso deve ter pelo menos ${PASSWORD_MIN_LENGTH} caracteres para ser criada.`;
      if (!user.cityAdultConfirmed) return 'Confirme que reside em Nova Iguaçu e é maior de 18 anos.';
    }
    if (!isRegistrationFlow && targetStep === 1 && responsible.enabled) {
      if (!responsible.name || !responsible.cep || !responsible.address || (!responsible.addressNumber && !responsible.addressNumberMissing) || !responsible.neighborhood || !responsible.phone) {
        return 'Preencha todos os campos obrigatórios do responsável substituto.';
      }
      if (responsibleCpfError) return responsibleCpfError;
      if (responsibleCepDigits.length !== 8) return 'Informe um CEP válido com 8 dígitos para o responsável substituto.';
      if (responsibleCepLookup.loading) return 'Aguarde a consulta do CEP do responsável substituto para continuar.';
      if (responsibleCepLookup.error) return responsibleCepLookup.error;
      if (responsible.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(responsible.email)) return 'E-mail do responsável substituto inválido.';
      if (!responsible.cityAdultConfirmed) return 'Confirme que o responsável substituto reside em Nova Iguaçu e é maior de 18 anos.';
    }
    if (targetStep === 2 && (!terms.requirementsAccepted || !terms.documentsAccepted)) return 'Aceite os termos e confirme os documentos para continuar.';
    if (!isRegistrationFlow && targetStep === 3 && !animal.name) return 'Informe o nome do animal.';
    if (!isRegistrationFlow && targetStep === 3 && !animal.breed) return 'Informe a raça do animal.';
    if (!isRegistrationFlow && targetStep === 3 && !animal.approximateAge) return 'Informe a idade aproximada do animal.';
    if (!isRegistrationFlow && targetStep === 4 && !selectedClinicId) return 'Selecione uma clínica disponível para continuar.';
    if (!isRegistrationFlow && targetStep === 5 && !selectedDate) return 'Selecione uma data disponível para continuar.';
    return '';
  }

  async function checkCpfRegistration() {
    const data = await request(`/public/cpf-status?cpf=${cpfDigits}`);
    if (data.registered) {
      return 'Já existe um usuário cadastrado com esse CPF. Faça login como tutor para acessar seus agendamentos ou continuar uma nova solicitação.';
    }
    return '';
  }

  async function nextStep() {
    setValidationAttempted(true);
    const message = validateStep(step);
    if (message) {
      setError(message);
      return;
    }
    if (step === 1 && isRegistrationFlow) {
      setLoading(true);
      try {
        const cpfMessage = await checkCpfRegistration();
        if (cpfMessage) {
          setCpfRegistrationError(cpfMessage);
          setError(cpfMessage);
          return;
        }
      } catch (err) {
        setError(err.message);
        return;
      } finally {
        setLoading(false);
      }
    }
    setError('');
    setValidationAttempted(false);
    if (!isRegistrationFlow && step === 3) {
      setStep(4);
      loadClinics();
    } else if (!isRegistrationFlow && step === 4) {
      setStep(5);
      loadAvailableDates(selectedClinicId);
    } else {
      setStep((value) => value + 1);
    }
  }

  async function submit() {
    const invalidStep = Array.from({ length: totalSteps }, (_item, index) => index + 1).find((candidate) => validateStep(candidate));
    if (invalidStep) {
      setValidationAttempted(true);
      setStep(invalidStep);
      setError(validateStep(invalidStep));
      return;
    }
    setLoading(true);
    setError('');
    try {
      if (isRegistrationFlow) {
        const data = await request('/auth/register', { method: 'POST', body: { user, role: 'tutor', terms } });
        onDone({ token: data.token, user: data.user });
        return;
      }
      const appointmentBody = { animal, terms, clinicId: selectedClinicId, date: selectedDate };
      if (responsible.enabled) appointmentBody.responsible = responsible;
      const data = await request('/appointments/auto', { method: 'POST', body: appointmentBody }, auth.token);
      const appointment = data.appointment;
      setResult(appointment);
      onDone({ appointment });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="wiz-shell">
      <div>
        <span className="wiz-eyebrow">Etapa {step} de {totalSteps}</span>
        <h2>{stepTitle}</h2>
        {stepDescription ? <p className="wiz-description">{stepDescription}</p> : null}
      </div>


      <Stepper current={step} total={totalSteps} labels={stepLabels} />

      {error ? <InlineAlert message={error} /> : null}

      {result ? (
        <ResultPanel appointment={result} />
      ) : (
        <>
          <div className="wiz-card">
            <div className="wiz-card-inner">
              {step === 1 ? (
                <div className="wiz-form-grid">
                  {!auth ? (
                    <>
                      <div className="wiz-step-note span-2">
                        <AlertCircle size={18} />
                        <span>Este cadastro é para o cidadão/tutor. Depois de concluir, você entrará automaticamente na área do tutor para solicitar a castração do animal.</span>
                      </div>
                      <TextField label="Nome completo" value={user.name} onChange={(value) => updateUser('name', value)} required />
                      <TextField
                        label="CPF"
                        value={user.cpf}
                        onChange={(value) => updateUser('cpf', onlyDigits(value).slice(0, CPF_DIGITS_LENGTH))}
                        inputMode="numeric"
                        maxLength={CPF_DIGITS_LENGTH}
                        hint={`Somente números, ${CPF_DIGITS_LENGTH} dígitos`}
                        error={showStepOneFieldErrors ? cpfError : ''}
                        required
                      />
                      <TextField
                        label="CEP"
                        value={user.cep}
                        onChange={(value) => updateUser('cep', onlyDigits(value).slice(0, 8))}
                        inputMode="numeric"
                        maxLength={8}
                        hint={cepLookup.loading ? 'Buscando endereço...' : cepLookup.success || 'Somente números, 8 dígitos'}
                        error={showStepOneFieldErrors || cepLookup.error ? cepError : ''}
                        required
                      />
                      <TextField label="Endereço" value={user.address} onChange={(value) => updateUser('address', value)} required />
                      <TextField label="Número da residência" value={user.addressNumber} onChange={(value) => updateUser('addressNumber', value)} required={!user.addressNumberMissing} disabled={user.addressNumberMissing} />
                      <label className="check-row compact-check number-missing-row">
                        <input
                          type="checkbox"
                          checked={user.addressNumberMissing}
                          onChange={(event) => {
                            updateUser('addressNumberMissing', event.target.checked);
                            if (event.target.checked) updateUser('addressNumber', '');
                          }}
                        />
                        <span>Sem número</span>
                      </label>
                      <TextField label="Bairro" value={user.neighborhood} onChange={(value) => updateUser('neighborhood', value)} required />
                      <TextField label="Telefone" value={user.phone} onChange={(value) => updateUser('phone', value)} required />
                      <TextField label="E-mail" value={user.email} onChange={(value) => updateUser('email', value)} type="email" hint="Use um e-mail de contato, se tiver" />
                      <TextField
                        label={`Senha de acesso (mínimo ${PASSWORD_MIN_LENGTH} caracteres)`}
                        value={user.password}
                        onChange={(value) => updateUser('password', value)}
                        type="password"
                        error={showStepOneFieldErrors && user.password.length < PASSWORD_MIN_LENGTH ? `Use pelo menos ${PASSWORD_MIN_LENGTH} caracteres.` : ''}
                        required
                      />
                    </>
                  ) : (
                    <>
                      <div className="signed-box span-2">
                        <UserRound size={24} />
                        <div>
                          <strong>{auth.user.name}</strong>
                          <span>{userRoleLabel(auth.user.role)} cadastrado com CPF {maskCpf(auth.user.cpf)}</span>
                        </div>
                      </div>
                      <div className="wiz-step-note span-2">
                        <CalendarPlus size={18} />
                        <span>Você já está logado. Continue para revisar as regras e informar o animal que será agendado.</span>
                      </div>
                      <label className="check-row span-2">
                        <input
                          type="checkbox"
                          checked={responsible.enabled}
                          onChange={(event) => updateResponsible('enabled', event.target.checked)}
                        />
                        <span>Outra pessoa será responsável por levar o animal ao atendimento</span>
                      </label>
                      {responsible.enabled ? (
                        <div className="substitute-form span-2">
                          <div className="substitute-form-title">
                            <Users size={18} />
                            <strong>Dados do responsável substituto</strong>
                          </div>
                          <div className="substitute-grid">
                            <TextField label="Nome completo" value={responsible.name} onChange={(value) => updateResponsible('name', value)} required />
                            <TextField
                              label="CPF"
                              value={responsible.cpf}
                              onChange={(value) => updateResponsible('cpf', onlyDigits(value).slice(0, CPF_DIGITS_LENGTH))}
                              inputMode="numeric"
                              maxLength={CPF_DIGITS_LENGTH}
                              hint={`Somente números, ${CPF_DIGITS_LENGTH} dígitos`}
                              error={showResponsibleFieldErrors ? responsibleCpfError : ''}
                              required
                            />
                            <TextField
                              label="CEP"
                              value={responsible.cep}
                              onChange={(value) => updateResponsible('cep', onlyDigits(value).slice(0, 8))}
                              inputMode="numeric"
                              maxLength={8}
                              hint={responsibleCepLookup.loading ? 'Buscando endereço...' : responsibleCepLookup.success || 'Somente números, 8 dígitos'}
                              error={showResponsibleFieldErrors || responsibleCepLookup.error ? responsibleCepError : ''}
                              required
                            />
                            <TextField label="Endereço" value={responsible.address} onChange={(value) => updateResponsible('address', value)} required />
                            <TextField label="Número da residência" value={responsible.addressNumber} onChange={(value) => updateResponsible('addressNumber', value)} required={!responsible.addressNumberMissing} disabled={responsible.addressNumberMissing} />
                            <label className="check-row compact-check number-missing-row">
                              <input
                                type="checkbox"
                                checked={responsible.addressNumberMissing}
                                onChange={(event) => {
                                  updateResponsible('addressNumberMissing', event.target.checked);
                                  if (event.target.checked) updateResponsible('addressNumber', '');
                                }}
                              />
                              <span>Sem número</span>
                            </label>
                            <TextField label="Bairro" value={responsible.neighborhood} onChange={(value) => updateResponsible('neighborhood', value)} required />
                            <TextField label="Telefone" value={responsible.phone} onChange={(value) => updateResponsible('phone', value)} required />
                            <TextField label="E-mail" value={responsible.email} onChange={(value) => updateResponsible('email', value)} type="email" hint="Use um e-mail de contato, se tiver" />
                            <label className="check-row span-2">
                              <input
                                type="checkbox"
                                checked={responsible.cityAdultConfirmed}
                                onChange={(event) => updateResponsible('cityAdultConfirmed', event.target.checked)}
                              />
                              <span>O responsável substituto reside em Nova Iguaçu e é maior de 18 anos</span>
                            </label>
                          </div>
                        </div>
                      ) : null}
                    </>
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
                <div className="wiz-terms">
                  <div className="wiz-step-note">
                    <AlertCircle size={18} />
                    <span>
                      {isRegistrationFlow
                        ? 'Ao aceitar os termos, seu cadastro de tutor será concluído. O pedido de castração será feito em seguida, dentro da área logada.'
                        : 'Estes termos serão vinculados ao agendamento. Leia com atenção antes de escolher o animal e a clínica.'}
                    </span>
                  </div>
                  {[
                    'Chegue no horário informado e permaneça na clínica durante todo o procedimento. O responsável deve estar preparado para transportar o animal sonolento após a cirurgia.',
                    'Cães: coleira, guia e focinheira (se necessário). Gatos: 1 por caixa de transporte.',
                    'Banho no dia anterior ao procedimento, sem pulgas ou carrapatos.',
                    'Idade mínima de 6 meses e máxima de 7 anos.',
                    'Cães e cadelas: peso mínimo 3,5 kg e máximo 25 kg (salvo análise clínica e autorização expressa do veterinário de plantão).',
                    'Felinos: peso mínimo de 2 kg.',
                    'Animais machos devem ter ambos os testículos na bolsa escrotal.',
                    'Animais braquicefálicos, como Pug, Shih Tzu, Bulldog Francês, Bulldog Inglês, Lhasa Apso, Boxer, Pequinês, Boston Terrier, Cavalier King Charles Spaniel, Gato Persa, Chow Chow, American Bully, entre outros, não poderão ser castrados pelo programa.',
                    'Cadelas e gatas não devem estar no cio, gestantes ou amamentando.',
                    'Jejum absoluto de água e comida por 6 a 8 horas antes do procedimento.',
                    'Informar ao veterinário se o animal usa qualquer medicação.',
                    'Animais vacinados há menos de 21 dias não poderão ser castrados. Caso o animal esteja inapto, o procedimento será negado.',
                    'É obrigatório residir no município de Nova Iguaçu.',
                    'Tutores devem levar cópias de identidade, CPF e comprovante de residência de Nova Iguaçu. Em caso de terceiros, o mesmo deverá levar identidade, CPF e comprovante de residência de Nova Iguaçu.'
                  ].map((item) => (
                    <div className="wiz-rule" key={item}><FileCheck size={16} />{item}</div>
                  ))}
                  <div className="wiz-doc-notice">
                    <AlertCircle size={18} />
                    <strong>Documentos obrigatórios no posto:</strong> leve cópias de identidade, CPF e comprovante de residência de Nova Iguaçu no dia da castração. Não há possibilidade de envio digital.
                  </div>
                  <div className="wiz-checks">
                    <label className="check-row">
                      <input
                        type="checkbox"
                        checked={terms.requirementsAccepted}
                        onChange={(event) => setTerms((current) => ({ ...current, requirementsAccepted: event.target.checked }))}
                      />
                      <span>Li e aceito os requisitos do programa municipal</span>
                    </label>
                    <label className="check-row">
                      <input
                        type="checkbox"
                        checked={terms.documentsAccepted}
                        onChange={(event) => setTerms((current) => ({ ...current, documentsAccepted: event.target.checked }))}
                      />
                      <span>Entendo que devo levar os documentos obrigatórios no dia da castração</span>
                    </label>
                  </div>
                </div>
              ) : null}

              {step === 3 ? (
                <div className="wiz-animal-grid">
                  <div className="wiz-step-note">
                    <PawPrint size={18} />
                    <span>Informe um animal por agendamento. Os dados de espécie e sexo determinam quais clínicas têm vaga disponível.</span>
                  </div>
                  <div className="wiz-pickers-row">
                    <div className="wiz-picker">
                      <span className="wiz-picker-label">Espécie</span>
                      <div className="wiz-picker-opts">
                        <button type="button" className={`wiz-picker-opt ${animal.species === 'gato' ? 'active' : ''}`}
                          onClick={() => updateAnimal('species', 'gato')}>
                          Gato
                        </button>
                        <button type="button" className={`wiz-picker-opt ${animal.species === 'cao' ? 'active' : ''}`}
                          onClick={() => updateAnimal('species', 'cao')}>
                          Cão
                        </button>
                      </div>
                    </div>
                    <div className="wiz-picker">
                      <span className="wiz-picker-label">Sexo</span>
                      <div className="wiz-picker-opts">
                        <button type="button" className={`wiz-picker-opt ${animal.sex === 'femea' ? 'active' : ''}`}
                          onClick={() => updateAnimal('sex', 'femea')}>
                          Fêmea
                        </button>
                        <button type="button" className={`wiz-picker-opt ${animal.sex === 'macho' ? 'active' : ''}`}
                          onClick={() => updateAnimal('sex', 'macho')}>
                          Macho
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="wiz-text-grid">
                    <TextField label="Nome do animal" value={animal.name} onChange={(value) => updateAnimal('name', value)} required />
                    <TextField label="Raça" value={animal.breed} onChange={(value) => updateAnimal('breed', value)} required />
                    <TextField label="Idade aproximada" value={animal.approximateAge} onChange={(value) => updateAnimal('approximateAge', value)} required />
                  </div>
                </div>
              ) : null}

              {step === 4 ? (
                <div className="wiz-clinic-step">
                  <p className="wiz-clinic-hint">
                    {isAdminScheduling
                      ? 'Escolha a clínica onde deseja agendar. Administradores visualizam vagas futuras já lançadas no sistema.'
                      : 'Escolha a clínica onde deseja ser atendido. Clínicas sem vaga aparecem na lista, mas ficam indisponíveis para seleção neste momento.'}
                  </p>
                  {clinicsLoading ? (
                    <Loading label="Buscando clínicas disponíveis…" />
                  ) : clinics.length === 0 ? (
                    <div className="wiz-no-clinics">
                      <AlertCircle size={20} />
                      <span>Nenhuma clínica ativa encontrada no sistema.</span>
                    </div>
                  ) : (
                    <div className="wiz-clinic-list">
                      {clinics.map((clinic) => {
                        const availableSlots = Number(clinic.available_slots || 0);
                        const hasSlots = availableSlots > 0;
                        return (
                          <button
                            key={clinic.id}
                            type="button"
                            className={`wiz-clinic-opt ${selectedClinicId === clinic.id ? 'active' : ''} ${hasSlots ? '' : 'unavailable'}`}
                            onClick={() => hasSlots && chooseClinic(clinic.id)}
                            disabled={!hasSlots}
                          >
                            <Building2 size={20} />
                            <div className="wiz-clinic-info">
                              <strong>{clinic.name}</strong>
                              <span>{clinic.address}</span>
                            </div>
                            <span className={`wiz-clinic-slots ${hasSlots ? '' : 'empty'}`}>
                              {hasSlots ? `${availableSlots} vaga${availableSlots !== 1 ? 's' : ''}` : 'Sem vagas disponíveis no momento'}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : null}

              {step === 5 ? (
                <div className="wiz-date-step">
                  <p className="wiz-clinic-hint">
                    {isAdminScheduling
                      ? 'Escolha a data de atendimento. Para administrador, aparecem datas futuras com vagas disponíveis mesmo fora da janela pública.'
                      : 'Escolha a data de atendimento. Só aparecem dias com vagas disponíveis para a clínica e o tipo de animal selecionados.'}
                  </p>
                  {datesLoading ? (
                    <Loading label="Buscando datas disponíveis" />
                  ) : availableDates.length === 0 ? (
                    <div className="wiz-no-clinics">
                      <AlertCircle size={20} />
                      <span>Nenhuma data disponível para a clínica selecionada neste momento.</span>
                    </div>
                  ) : (
                    <div className="wiz-date-list">
                      {availableDates.map((item) => {
                        const availableSlots = Number(item.available_slots || 0);
                        return (
                          <button
                            key={item.date}
                            type="button"
                            className={`wiz-date-opt ${selectedDate === item.date ? 'active' : ''}`}
                            onClick={() => setSelectedDate(item.date)}
                          >
                            <Calendar size={20} />
                            <span>{formatDate(item.date)}</span>
                            <strong>{availableSlots} vaga{availableSlots !== 1 ? 's' : ''}</strong>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : null}

              {step === 6 ? (
                <div className="wiz-confirm">
                  <div className="wiz-confirm-icon">
                    <ClipboardCheck size={30} />
                  </div>
                  <h3>Confirme o agendamento</h3>
                  <p>Depois de confirmar, o agendamento aparecerá na sua área do tutor com protocolo, clínica, data e horário. O sistema atribuirá o primeiro horário disponível no dia escolhido.</p>
                  <div className="wiz-review-grid">
                    <span>Perfil</span><strong>{userRoleLabel(auth?.user?.role)}</strong>
                    <span>Animal</span><strong>{animal.name} · {animalLabel(animal.species, animal.sex)}</strong>
                    <span>Raça e idade</span><strong>{animal.breed} · {animal.approximateAge}</strong>
                    <span>Clínica</span><strong>{clinics.find((c) => c.id === selectedClinicId)?.name || '—'}</strong>
                    <span>Data</span><strong>{formatDate(selectedDate)}</strong>
                    <span>Horário</span><strong>{selectedDateTime || 'Primeiro horário disponível'}</strong>
                    <span>Responsável no atendimento</span><strong>{responsible.enabled ? responsible.name : auth?.user?.name}</strong>
                    {responsible.enabled ? (
                      <>
                        <span>CPF do responsável</span><strong>{maskCpf(responsible.cpf)}</strong>
                        <span>Telefone do responsável</span><strong>{responsible.phone}</strong>
                      </>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          <div className="wiz-footer">
            <button className="button ghost" type="button" onClick={() => setStep((value) => Math.max(1, value - 1))} disabled={step === 1 || loading}>
              Voltar
            </button>
            {step < totalSteps ? (
              <button className="button primary" type="button" onClick={nextStep} disabled={loading}>
                {loading && step === 1 ? 'Verificando...' : 'Continuar'}
              </button>
            ) : (
              <button className="button primary" type="button" onClick={submit} disabled={loading}>
                {isRegistrationFlow ? <UserPlus size={18} /> : <CalendarPlus size={18} />}
                {loading ? (isRegistrationFlow ? 'Cadastrando...' : 'Agendando...') : (isRegistrationFlow ? 'Concluir cadastro' : 'Confirmar agendamento')}
              </button>
            )}
          </div>
        </>
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
        throw new Error(expectedRole === 'admin' ? 'Este CPF não possui acesso administrativo.' : 'Este CPF não está como Protetor Cadastrado.');
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
        <div className="auth-brand">
          <div className="brand-mark"><img src="/brasao.png" alt="Brasão Nova Iguaçu" className="brand-brasao" /></div>
        </div>
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
            Primeiro acesso de Protetor Cadastrado: solicite orientação pelo botão "Torne-se um Protetor Cadastrado" na página inicial ou pela administração do programa.
          </p>
        ) : expectedRole === 'clinica' ? (
          <p className="muted">Acesso restrito para clínicas cadastradas pela administração.</p>
        ) : (
          <p className="muted">Área restrita. Entre em contato com a administração para obter acesso.</p>
        )}
      </form>
    </section>
  );
}

const DOC_FIELDS = [
  { field: 'doc_residencia', label: 'Comprovante de residência' },
  { field: 'doc_cpf', label: 'CPF' },
  { field: 'doc_identidade', label: 'Documento de identidade' }
];

async function openDocument(userId, type, token) {
  try {
    const res = await fetch(`/api/documents/${userId}/${type}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.message || 'Documento não disponível.');
      return;
    }
    const blob = await res.blob();
    window.open(URL.createObjectURL(blob), '_blank');
  } catch (_err) {
    alert('Erro ao abrir documento.');
  }
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

  const firstName = data.user.name ? data.user.name.split(' ')[0] : '';
  const limitLabel = data.limit === null ? 'Ilimitado' : data.limit;

  return (
    <section className="dashboard-layout">
      <div className="section-title">
        <span className="eyebrow">{userRoleLabel(data.user.role)}</span>
        <h2>Olá, {firstName}</h2>
        <p>
          Seu cadastro está ativo. Para solicitar a castração, clique em agendar, informe os dados do animal e escolha uma clínica com vaga disponível.
        </p>
      </div>
      <div className="metric-row">
        <Metric icon={Calendar} label="Limite mensal" value={limitLabel} />
        <Metric icon={CheckCircle2} label="Usados no mês" value={data.currentMonthUsed} />
      </div>
      <div className="dashboard-guide">
        <div>
          <strong>1. Inicie o agendamento</strong>
          <span>Use o botão abaixo somente quando tiver os dados do animal em mãos.</span>
        </div>
        <div>
          <strong>2. Informe o animal</strong>
          <span>Espécie e sexo definem quais vagas aparecem para escolha.</span>
        </div>
        <div>
          <strong>3. Confirme a clínica</strong>
          <span>Após confirmar, o protocolo, data e horário ficarão salvos nesta área.</span>
        </div>
      </div>
      <div className="doc-required-notice">
        <AlertCircle size={18} />
        <span><strong>Documentos obrigatórios no posto:</strong> leve cópias de identidade, CPF e comprovante de residência de Nova Iguaçu no dia da castração.</span>
      </div>
      <button className="button primary" type="button" onClick={() => setView('inscricao')}>
        <CalendarPlus size={18} /> Agendar castração do animal
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
              {appointment.substitute_responsible ? <span>Responsável: {appointment.responsible_name}</span> : null}
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
      {data.user.role === 'protetor' ? <ChangePasswordForm auth={auth} /> : null}
    </section>
  );
}

function ChangePasswordForm({ auth }) {
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setSuccess('');
    if (form.newPassword !== form.confirmPassword) {
      setError('Nova senha e confirmação não coincidem.');
      return;
    }
    setLoading(true);
    try {
      await request('/me/password', { method: 'PUT', body: { currentPassword: form.currentPassword, newPassword: form.newPassword } }, auth.token);
      setSuccess('Senha alterada com sucesso.');
      setForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <details className="change-password-section">
      <summary>Alterar senha</summary>
      <form className="inline-form compact" onSubmit={handleSubmit}>
        {error ? <InlineAlert message={error} /> : null}
        {success ? <div className="inline-success"><CheckCircle2 size={18} />{success}</div> : null}
        <TextField label="Senha atual" value={form.currentPassword} onChange={(value) => setForm({ ...form, currentPassword: value })} type="password" required />
        <TextField label="Nova senha" value={form.newPassword} onChange={(value) => setForm({ ...form, newPassword: value })} type="password" required />
        <TextField label="Confirmar nova senha" value={form.confirmPassword} onChange={(value) => setForm({ ...form, confirmPassword: value })} type="password" required />
        <button className="button secondary" type="submit" disabled={loading}><KeyRound size={18} />{loading ? 'Salvando...' : 'Alterar senha'}</button>
      </form>
    </details>
  );
}

function ClinicPanel({ auth }) {
  const [appointments, setAppointments] = useState([]);
  const [clinics, setClinics] = useState([]);
  const [selectedClinicId, setSelectedClinicId] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('');
  const [tutorSearch, setTutorSearch] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const isAdmin = auth.user.role === 'admin';
  const filteredAppointments = useMemo(
    () => {
      const search = normalizeSearch(tutorSearch);
      return appointments.filter((appointment) => (
        (!selectedStatus || appointment.status === selectedStatus) &&
        (!selectedMonth || getDateMonth(appointment.date) === selectedMonth) &&
        (!search || normalizeSearch(appointment.user_name || '').includes(search))
      ));
    },
    [appointments, selectedStatus, selectedMonth, tutorSearch]
  );

  async function loadAppointments(showLoading = true) {
    if (showLoading) setLoading(true);
    try {
      const query = isAdmin && selectedClinicId ? `?clinicId=${selectedClinicId}` : '';
      const data = await request(`/admin/appointments${query}`, {}, auth.token);
      setAppointments(data.appointments || []);
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      if (showLoading) setLoading(false);
    }
  }

  async function loadClinics() {
    if (!isAdmin) return;
    try {
      const data = await request('/admin/clinics', {}, auth.token);
      setClinics(data.clinics || []);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    loadClinics();
  }, []);

  useEffect(() => {
    loadAppointments();
  }, [selectedClinicId]);

  return (
    <section className="admin-layout">
      <div className="section-title">
        <span className="eyebrow">{isAdmin ? 'Admin · Clínica' : 'Clínica'}</span>
        <h2>Agendamentos</h2>
        {isAdmin ? <p>Escolha uma clínica, status, mês e tutor para visualizar os agendamentos, ou mantenha os filtros em branco.</p> : null}
      </div>
      {error ? <InlineAlert message={error} /> : null}
      {isAdmin ? (
        <div className="clinic-selector-bar">
          <label className="field">
            <span>Clínica</span>
            <select value={selectedClinicId} onChange={(event) => setSelectedClinicId(event.target.value)}>
              <option value="">Todas as clínicas</option>
              {clinics.map((clinic) => (
                <option key={clinic.id} value={clinic.id}>{clinic.name}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Status</span>
            <select value={selectedStatus} onChange={(event) => setSelectedStatus(event.target.value)}>
              <option value="">Todos os status</option>
              {APPOINTMENT_STATUS_OPTIONS.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Mês</span>
            <select value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)}>
              <option value="">Todos os meses</option>
              {MONTH_FILTER_OPTIONS.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          <TextField label="Tutor" value={tutorSearch} onChange={setTutorSearch} />
          <button className="button ghost" type="button" onClick={() => { setSelectedClinicId(''); setSelectedStatus(''); setSelectedMonth(''); setTutorSearch(''); }}>
            Limpar filtros
          </button>
          <span className="filter-count">
            {filteredAppointments.length === appointments.length
              ? `${appointments.length} agendamento${appointments.length !== 1 ? 's' : ''}`
              : `${filteredAppointments.length} de ${appointments.length} agendamentos`}
          </span>
        </div>
      ) : null}
      {loading ? <Loading label="Carregando agendamentos" /> : (
        <AppointmentsTab appointments={filteredAppointments} reload={() => loadAppointments(false)} auth={auth} />
      )}
      {!isAdmin ? <ChangePasswordForm auth={auth} /> : null}
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
  const [reports, setReports] = useState(null);
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
      const reportsData = await request('/admin/reports', {}, auth.token).catch(() => null);
      setReports(reportsData);
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
          ['protectors', Shield, 'Protetores Cadastrados'],
          ['reports', BarChart2, 'Relatórios']
        ].map(([key, Icon, label]) => (
          <button className={tab === key ? 'active' : ''} type="button" key={key} onClick={() => setTab(key)}>
            <Icon size={17} /> {label}
          </button>
        ))}
      </div>

      {tab === 'dashboard' ? <AdminSummary summary={summary} reports={reports} /> : null}
      {tab === 'clinics' ? <ClinicsTab clinics={clinics} reload={loadAll} auth={auth} /> : null}
      {tab === 'slots' ? <SlotsTab slots={slots} clinics={clinics} reload={loadAll} auth={auth} /> : null}
      {tab === 'appointments' ? <AppointmentsTab appointments={appointments} reload={loadAll} auth={auth} /> : null}
      {tab === 'users' ? <UsersTab users={users} clinics={clinics} reload={loadAll} auth={auth} /> : null}
      {tab === 'protectors' ? <ProtectorsTab protectors={protectors} clinics={clinics} reload={loadAll} auth={auth} /> : null}
      {tab === 'reports' ? <ReportsTab reports={reports} /> : null}
    </section>
  );
}

function printReport(reports) {
  const { totals, perDay, perClinic, castrationsByClinic, castrationsByType, castrationsDetail = [] } = reports;
  const date = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

  const tableStyle = 'width:100%;border-collapse:collapse;font-size:13px;margin-bottom:24px;';
  const thStyle = 'background:#e8f7f0;padding:8px 12px;text-align:left;border-bottom:2px solid #c4ddd6;font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#567069;';
  const thNumStyle = thStyle + 'text-align:right;';
  const tdStyle = 'padding:7px 12px;border-bottom:1px solid #e0ede8;';
  const tdNumStyle = tdStyle + 'text-align:right;font-weight:600;font-variant-numeric:tabular-nums;';

  function table(headers, rows) {
    const ths = headers.map(([label, num]) => `<th style="${num ? thNumStyle : thStyle}">${label}</th>`).join('');
    const trs = rows.map((cells) =>
      '<tr>' + cells.map((c, i) => `<td style="${headers[i][1] ? tdNumStyle : tdStyle}">${c ?? ''}</td>`).join('') + '</tr>'
    ).join('');
    return `<table style="${tableStyle}"><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table>`;
  }

  const maxDay = Math.max(...perDay.map((r) => r.total), 1);
  const barCell = (val, max, color = '#0c9278') => {
    const pct = Math.round((val / max) * 100);
    return `<div style="height:8px;border-radius:4px;background:#e0ede8;overflow:hidden;"><div style="height:100%;width:${pct}%;background:${color};border-radius:4px;"></div></div>`;
  };

  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
  <title>Relatório de Castrações — ${date}</title>
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; color: #1a2e26; margin: 0; padding: 32px 40px; }
    h1 { font-size: 22px; margin: 0 0 4px; }
    .sub { color: #567069; font-size: 13px; margin-bottom: 32px; }
    h2 { font-size: 14px; margin: 0 0 10px; text-transform: uppercase; letter-spacing: .05em; color: #0c9278; border-bottom: 2px solid #c4ddd6; padding-bottom: 6px; }
    .metrics { display: flex; gap: 16px; margin-bottom: 28px; flex-wrap: wrap; }
    .metric { flex: 1; min-width: 100px; border: 1px solid #c4ddd6; border-radius: 10px; padding: 14px 16px; text-align: center; }
    .metric strong { display: block; font-size: 28px; line-height: 1; margin-bottom: 4px; }
    .metric span { font-size: 11px; color: #567069; text-transform: uppercase; letter-spacing: .04em; }
    .agendado strong { color: #0c9278; } .realizado strong { color: #18825c; }
    .nao_realizado strong { color: #c05a21; } .cancelado strong { color: #b42318; }
    section { margin-bottom: 32px; page-break-inside: avoid; }
    @media print { body { padding: 16px 20px; } }
  </style></head><body>
  <h1>Relatório de Castrações — Nova Iguaçu</h1>
  <p class="sub">Gerado em ${date} · Programa Municipal de Castração Animal</p>

  <section>
    <h2>Resumo geral</h2>
    <div class="metrics">
      <div class="metric agendado"><strong>${totals.agendado || 0}</strong><span>Agendados</span></div>
      <div class="metric realizado"><strong>${totals.realizado || 0}</strong><span>Realizados</span></div>
      <div class="metric nao_realizado"><strong>${totals.nao_realizado || 0}</strong><span>Não realizados</span></div>
      <div class="metric cancelado"><strong>${totals.cancelado || 0}</strong><span>Cancelados</span></div>
    </div>
  </section>

  <section>
    <h2>Vagas por clínica</h2>
    ${table([['Clínica'], ['Total', true], ['Ocupadas', true], ['Disponíveis', true], ['Utilização %', true]],
      perClinic.map((r) => [r.clinic, r.total, r.occupied, r.available,
        r.total > 0 ? Math.round((r.occupied / r.total) * 100) + '%' : '0%']))}
  </section>

  <section>
    <h2>Castrações realizadas por clínica</h2>
    ${castrationsByClinic.length === 0
      ? '<p style="color:#567069;font-size:13px;">Nenhuma castração registrada como realizada.</p>'
      : table([['Clínica'], ['Realizadas', true]], castrationsByClinic.map((r) => [r.clinic, r.done]))}
  </section>

  <section>
    <h2>Castrações realizadas por tipo</h2>
    ${castrationsByType.length === 0
      ? '<p style="color:#567069;font-size:13px;">Nenhuma castração registrada como realizada.</p>'
      : table([['Tipo'], ['Realizadas', true]], castrationsByType.map((r) => [r.label, r.done]))}
  </section>

  <section>
    <h2>Agendamentos por dia (últimos 90 dias)</h2>
    ${perDay.length === 0
      ? '<p style="color:#567069;font-size:13px;">Nenhum agendamento.</p>'
      : table([['Data'], ['Agendamentos', true], ['Gráfico']],
          perDay.map((r) => [
            new Date(r.day + 'T12:00:00').toLocaleDateString('pt-BR'),
            r.total,
            barCell(r.total, maxDay)
          ]))}
  </section>

  <section style="page-break-before:always;">
    <h2>Detalhe das castrações realizadas</h2>
    ${castrationsDetail.length === 0
      ? '<p style="color:#567069;font-size:13px;">Nenhuma castração registrada como realizada.</p>'
      : table(
          [['Protocolo'], ['Tutor'], ['Animal'], ['Raça'], ['Clínica'], ['Data'], ['Microchip']],
          castrationsDetail.map((r) => [
            r.protocol,
            r.tutor_name,
            `${r.animal_name} · ${r.animal_type_label}`,
            r.breed || '—',
            r.clinic,
            new Date(r.date + 'T12:00:00').toLocaleDateString('pt-BR'),
            r.microchip ? `${r.microchip.slice(0, 15)} ${r.microchip.slice(15)}` : '—'
          ])
        )}
  </section>
  </body></html>`;

  const win = window.open('', '_blank', 'width=900,height=700');
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => { win.print(); }, 400);
}

function ReportsTab({ reports }) {
  if (!reports?.totals) return <Loading label="Carregando relatórios" />;

  const { totals, perDay, perClinic, castrationsByClinic, castrationsByType, castrationsDetail = [] } = reports;

  function exportCsv(rows, headers, filename) {
    const lines = [headers.join(','), ...rows.map((r) => headers.map((h) => `"${formatCsvValue(r[h], h)}"`).join(','))];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  const maxDay = Math.max(...perDay.map((r) => r.total), 1);

  return (
    <div className="reports-layout">

      <div className="report-section-header">
        <h3 className="report-section-title"><BarChart2 size={18} /> Relatórios</h3>
        <button className="button primary small" type="button" onClick={() => printReport(reports)}>
          <Download size={15} /> Exportar PDF
        </button>
      </div>

      {/* Totais gerais */}
      <div className="report-section">
        <h3 className="report-section-title"><BarChart2 size={18} /> Resumo geral</h3>
        <div className="report-metrics">
          <div className="report-metric agendado">
            <strong>{totals.agendado || 0}</strong>
            <span>Agendados</span>
          </div>
          <div className="report-metric realizado">
            <strong>{totals.realizado || 0}</strong>
            <span>Realizados</span>
          </div>
          <div className="report-metric nao_realizado">
            <strong>{totals.nao_realizado || 0}</strong>
            <span>Não realizados</span>
          </div>
          <div className="report-metric cancelado">
            <strong>{totals.cancelado || 0}</strong>
            <span>Cancelados</span>
          </div>
        </div>
      </div>

      {/* Agendamentos por dia */}
      <div className="report-section">
        <div className="report-section-header">
          <h3 className="report-section-title"><Calendar size={18} /> Agendamentos por dia</h3>
          <button className="button secondary small" type="button"
            onClick={() => exportCsv(perDay, ['day', 'total'], 'agendamentos-por-dia.csv')}>
            <Download size={15} /> Exportar CSV
          </button>
        </div>
        {perDay.length === 0 ? <p className="muted">Nenhum dado.</p> : (
          <div className="report-table-wrap">
            <table className="report-table">
              <colgroup><col /><col style={{width:'80px'}} /><col style={{width:'45%'}} /></colgroup>
              <thead><tr><th>Data</th><th className="report-num">Qtd.</th><th>Gráfico</th></tr></thead>
              <tbody>
                {perDay.map((row) => (
                  <tr key={row.day}>
                    <td>{formatDate(row.day)}</td>
                    <td className="report-num">{row.total}</td>
                    <td><div className="report-bar"><div className="report-bar-fill" style={{width: `${Math.round((row.total / maxDay) * 100)}%`}} /></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Vagas por clínica */}
      <div className="report-section">
        <div className="report-section-header">
          <h3 className="report-section-title"><Building2 size={18} /> Vagas por clínica</h3>
          <button className="button secondary small" type="button"
            onClick={() => exportCsv(perClinic, ['clinic', 'total', 'occupied', 'available'], 'vagas-por-clinica.csv')}>
            <Download size={15} /> Exportar CSV
          </button>
        </div>
        {perClinic.length === 0 ? <p className="muted">Nenhum dado.</p> : (
          <div className="report-table-wrap">
            <table className="report-table">
              <colgroup><col /><col style={{width:'72px'}} /><col style={{width:'88px'}} /><col style={{width:'100px'}} /><col style={{width:'160px'}} /></colgroup>
              <thead><tr><th>Clínica</th><th className="report-num">Total</th><th className="report-num">Ocupadas</th><th className="report-num">Disponíveis</th><th>Utilização</th></tr></thead>
              <tbody>
                {perClinic.map((row) => {
                  const pct = row.total > 0 ? Math.round((row.occupied / row.total) * 100) : 0;
                  return (
                    <tr key={row.clinic}>
                      <td>{row.clinic}</td>
                      <td className="report-num">{row.total}</td>
                      <td className="report-num">{row.occupied}</td>
                      <td className="report-num">{row.available}</td>
                      <td className="report-col-util">
                        <div className="report-bar"><div className="report-bar-fill utilization" style={{width: `${pct}%`}} /></div>
                        <span className="report-pct">{pct}%</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Castrações realizadas por clínica */}
      <div className="report-section">
        <div className="report-section-header">
          <h3 className="report-section-title"><CheckCircle2 size={18} /> Castrações realizadas por clínica</h3>
          <button className="button secondary small" type="button"
            onClick={() => exportCsv(castrationsByClinic, ['clinic', 'done'], 'castracoes-por-clinica.csv')}>
            <Download size={15} /> Exportar CSV
          </button>
        </div>
        {castrationsByClinic.length === 0 ? <p className="muted">Nenhuma castração registrada como realizada.</p> : (
          <div className="report-table-wrap">
            <table className="report-table">
              <thead><tr><th>Clínica</th><th>Realizadas</th></tr></thead>
              <tbody>
                {castrationsByClinic.map((row) => (
                  <tr key={row.clinic}>
                    <td>{row.clinic}</td>
                    <td className="report-num">{row.done}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Castrações por espécie/sexo */}
      <div className="report-section">
        <div className="report-section-header">
          <h3 className="report-section-title"><CheckCircle2 size={18} /> Castrações realizadas por tipo</h3>
          <button className="button secondary small" type="button"
            onClick={() => exportCsv(castrationsByType, ['label', 'done'], 'castracoes-por-tipo.csv')}>
            <Download size={15} /> Exportar CSV
          </button>
        </div>
        {castrationsByType.length === 0 ? <p className="muted">Nenhuma castração registrada como realizada.</p> : (
          <div className="report-table-wrap">
            <table className="report-table">
              <thead><tr><th>Tipo</th><th>Realizadas</th></tr></thead>
              <tbody>
                {castrationsByType.map((row) => (
                  <tr key={row.label}>
                    <td>{capitalize(row.label)}</td>
                    <td className="report-num">{row.done}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detalhe das castrações com microchip */}
      <div className="report-section">
        <div className="report-section-header">
          <h3 className="report-section-title"><KeyRound size={18} /> Detalhe das castrações — Microchip</h3>
          <button className="button secondary small" type="button"
            onClick={() => exportCsv(
              castrationsDetail.map((r) => ({ ...r, microchip_fmt: r.microchip ? `${r.microchip.slice(0,15)} ${r.microchip.slice(15)}` : '' })),
              ['protocol', 'tutor_name', 'animal_name', 'animal_type_label', 'breed', 'clinic', 'date', 'microchip_fmt'],
              'castracoes-microchip.csv'
            )}>
            <Download size={15} /> Exportar CSV
          </button>
        </div>
        {castrationsDetail.length === 0 ? <p className="muted">Nenhuma castração registrada como realizada.</p> : (
          <div className="report-table-wrap">
            <table className="report-table">
              <thead>
                <tr>
                  <th>Protocolo</th>
                  <th>Tutor</th>
                  <th>Animal</th>
                  <th>Raça</th>
                  <th>Clínica</th>
                  <th>Data</th>
                  <th>Microchip</th>
                </tr>
              </thead>
              <tbody>
                {castrationsDetail.map((row) => (
                  <tr key={row.protocol}>
                    <td style={{fontFamily:'monospace', fontSize:'0.82rem'}}>{row.protocol}</td>
                    <td>{row.tutor_name}</td>
                    <td>{row.animal_name} · {row.animal_type_label}</td>
                    <td>{row.breed || '—'}</td>
                    <td>{row.clinic}</td>
                    <td>{formatDate(row.date)}</td>
                    <td style={{fontFamily:'monospace', letterSpacing:'0.05em'}}>
                      {row.microchip ? `${row.microchip.slice(0, 15)} ${row.microchip.slice(15)}` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
}

function AdminSummary({ summary, reports }) {
  if (!summary) return <Loading label="Carregando resumo" />;

  function exportCsv(rows, headers, filename) {
    const lines = [headers.join(','), ...rows.map((r) => headers.map((h) => `"${formatCsvValue(r[h], h)}"`).join(','))];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="summary-dashboard">
      <div className="summary-grid">
        <Metric icon={Calendar} label="Total de vagas" value={summary.slots.total} />
        <Metric icon={CheckCircle2} label="Vagas preenchidas" value={summary.slots.occupied} />
        <Metric icon={AlertCircle} label="Disponíveis" value={summary.slots.available} />
        <Metric icon={XCircle} label="Não realizados" value={summary.appointments.nao_realizado || 0} />
        <Metric icon={Shield} label="Protetores Cadastrados" value={summary.users.protetor || 0} />
        <Metric icon={UserRound} label="Tutores" value={summary.users.tutor || 0} />
      </div>

      {reports?.totals ? (
        <div className="reports-layout" style={{marginTop: '24px'}}>

          <div className="report-section-header" style={{marginBottom: '4px'}}>
            <span />
            <button className="button primary small" type="button" onClick={() => printReport(reports)}>
              <Download size={15} /> Exportar PDF
            </button>
          </div>

          <div className="report-section">
            <h3 className="report-section-title"><BarChart2 size={18} /> Agendamentos por status</h3>
            <div className="report-metrics">
              <div className="report-metric agendado">
                <strong>{reports.totals.agendado || 0}</strong><span>Agendados</span>
              </div>
              <div className="report-metric realizado">
                <strong>{reports.totals.realizado || 0}</strong><span>Realizados</span>
              </div>
              <div className="report-metric nao_realizado">
                <strong>{reports.totals.nao_realizado || 0}</strong><span>Não realizados</span>
              </div>
              <div className="report-metric cancelado">
                <strong>{reports.totals.cancelado || 0}</strong><span>Cancelados</span>
              </div>
            </div>
          </div>

          <div className="report-section">
            <div className="report-section-header">
              <h3 className="report-section-title"><Building2 size={18} /> Vagas por clínica</h3>
              <button className="button secondary small" type="button"
                onClick={() => exportCsv(reports.perClinic, ['clinic','total','occupied','available'], 'vagas-por-clinica.csv')}>
                <Download size={15} /> CSV
              </button>
            </div>
            {reports.perClinic.length === 0 ? <p className="muted">Nenhum dado.</p> : (
              <div className="report-table-wrap">
                <table className="report-table">
                  <colgroup><col /><col style={{width:'72px'}} /><col style={{width:'88px'}} /><col style={{width:'100px'}} /><col style={{width:'160px'}} /></colgroup>
                  <thead><tr><th>Clínica</th><th className="report-num">Total</th><th className="report-num">Ocupadas</th><th className="report-num">Disponíveis</th><th>Utilização</th></tr></thead>
                  <tbody>
                    {reports.perClinic.map((row) => {
                      const pct = row.total > 0 ? Math.round((row.occupied / row.total) * 100) : 0;
                      return (
                        <tr key={row.clinic}>
                          <td>{row.clinic}</td>
                          <td className="report-num">{row.total}</td>
                          <td className="report-num">{row.occupied}</td>
                          <td className="report-num">{row.available}</td>
                          <td className="report-col-util">
                            <div className="report-bar"><div className="report-bar-fill utilization" style={{width:`${pct}%`}} /></div>
                            <span className="report-pct">{pct}%</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="report-section">
            <div className="report-section-header">
              <h3 className="report-section-title"><CheckCircle2 size={18} /> Castrações realizadas por clínica</h3>
              <button className="button secondary small" type="button"
                onClick={() => exportCsv(reports.castrationsByClinic, ['clinic','done'], 'castracoes-por-clinica.csv')}>
                <Download size={15} /> CSV
              </button>
            </div>
            {reports.castrationsByClinic.length === 0 ? <p className="muted">Nenhuma castração registrada.</p> : (
              <div className="report-table-wrap">
                <table className="report-table">
                  <thead><tr><th>Clínica</th><th>Realizadas</th></tr></thead>
                  <tbody>
                    {reports.castrationsByClinic.map((row) => (
                      <tr key={row.clinic}><td>{row.clinic}</td><td className="report-num">{row.done}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="report-section">
            <div className="report-section-header">
              <h3 className="report-section-title"><Calendar size={18} /> Agendamentos por dia (últimos 90 dias)</h3>
              <button className="button secondary small" type="button"
                onClick={() => exportCsv(reports.perDay, ['day','total'], 'agendamentos-por-dia.csv')}>
                <Download size={15} /> CSV
              </button>
            </div>
            {reports.perDay.length === 0 ? <p className="muted">Nenhum agendamento.</p> : (() => {
              const maxDay = Math.max(...reports.perDay.map((r) => r.total), 1);
              return (
                <div className="report-table-wrap">
                  <table className="report-table">
                    <colgroup><col /><col style={{width:'80px'}} /><col style={{width:'45%'}} /></colgroup>
                    <thead><tr><th>Data</th><th className="report-num">Qtd.</th><th>Gráfico</th></tr></thead>
                    <tbody>
                      {reports.perDay.map((row) => (
                        <tr key={row.day}>
                          <td>{formatDate(row.day)}</td>
                          <td className="report-num">{row.total}</td>
                          <td><div className="report-bar"><div className="report-bar-fill" style={{width:`${Math.round((row.total/maxDay)*100)}%`}} /></div></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })()}
          </div>

        </div>
      ) : null}
    </div>
  );
}

function ClinicsTab({ clinics, reload, auth }) {
  const blank = { name: '', address: '', neighborhood: '', phone: '', active: true };
  const [form, setForm] = useState(blank);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState('');
  const [selectedIds, setSelectedIds] = useState(new Set());

  const allSelected = clinics.length > 0 && clinics.every((c) => selectedIds.has(c.id));

  function toggleSelected(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(clinics.map((c) => c.id)));
    }
  }

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

  async function removeHard(id) {
    if (!confirm('Excluir esta clínica DEFINITIVAMENTE?\n\nTodas as vagas sem agendamentos ativos também serão excluídas. Esta ação não pode ser desfeita.')) return;
    try {
      await request(`/admin/clinics/${id}?permanent=true`, { method: 'DELETE' }, auth.token);
      reload();
    } catch (err) {
      setError(err.message);
    }
  }

  async function removeBulk() {
    if (!selectedIds.size) return;
    if (!confirm(`Excluir ${selectedIds.size} clínica(s) DEFINITIVAMENTE?\n\nVagas sem agendamentos ativos também serão excluídas. Clínicas com agendamentos ativos serão ignoradas. Esta ação não pode ser desfeita.`)) return;
    setError('');
    const results = await Promise.allSettled(
      [...selectedIds].map((id) => request(`/admin/clinics/${id}?permanent=true`, { method: 'DELETE' }, auth.token))
    );
    const failed = results.filter((r) => r.status === 'rejected');
    if (failed.length) setError(`${failed.length} clínica(s) não puderam ser excluídas (possuem agendamentos ativos).`);
    setSelectedIds(new Set());
    reload();
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
      <div className="slots-toolbar">
        <button className="button ghost" type="button" onClick={toggleSelectAll}>
          {allSelected ? 'Desmarcar Todas' : 'Selecionar Todas'}
        </button>
        <button className="button danger" type="button" onClick={removeBulk} disabled={!selectedIds.size}>
          <Trash2 size={18} />
          Excluir Selecionadas{selectedIds.size > 0 ? ` (${selectedIds.size})` : ''}
        </button>
        {selectedIds.size > 0 && (
          <span className="filter-count">{selectedIds.size} selecionada{selectedIds.size !== 1 ? 's' : ''}</span>
        )}
      </div>
      <DataTable
        columns={['', 'Clínica', 'Endereço', 'Bairro', 'Telefone', 'Status', 'Ações']}
        rows={clinics.map((clinic) => [
          <input key={`chk-${clinic.id}`} type="checkbox" checked={selectedIds.has(clinic.id)} onChange={() => toggleSelected(clinic.id)} />,
          clinic.name,
          clinic.address,
          clinic.neighborhood || '-',
          clinic.phone || '-',
          clinic.active ? 'Ativa' : 'Inativa',
          <TableActions key={clinic.id} onEdit={() => edit(clinic)} onDelete={() => remove(clinic.id)} onHardDelete={() => removeHard(clinic.id)} />
        ])}
      />
    </div>
  );
}

const SLOTS_PAGE_SIZE = 20;

function SlotsTab({ slots, clinics, reload, auth }) {
  const blank = { date: '', time: '09:00', species: 'gato', sex: 'femea', total_quantity: 1, clinic_id: '' };
  const [form, setForm] = useState(blank);
  const [editing, setEditing] = useState(null);
  const [filters, setFilters] = useState({ clinic_id: '', date: '', month: '', type: '', status: '' });
  const [error, setError] = useState('');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [renewRows, setRenewRows] = useState(null);
  const [renewError, setRenewError] = useState('');
  const [releaseNowEnabled, setReleaseNowEnabled] = useState(false);
  const [releaseNowLoading, setReleaseNowLoading] = useState(false);
  const [page, setPage] = useState(1);

  const clinicOptions = useMemo(() => clinics.filter((clinic) => clinic.active), [clinics]);
  const selectedSlots = useMemo(() => slots.filter((slot) => selectedIds.has(slot.id)), [slots, selectedIds]);

  const filteredSlots = useMemo(() => {
    const filterDate = toIsoDate(filters.date);
    return slots.filter((slot) => {
      const type = `${slot.species}-${slot.sex}`;
      const status = slot.active ? 'ativa' : 'inativa';
      return (
        (!filters.clinic_id || String(slot.clinic_id) === filters.clinic_id) &&
        (!filterDate || toIsoDate(slot.date) === filterDate) &&
        (!filters.month || getDateMonth(slot.date) === filters.month) &&
        (!filters.type || type === filters.type) &&
        (!filters.status || status === filters.status)
      );
    });
  }, [slots, filters]);

  const slotsTotalPages = Math.max(1, Math.ceil(filteredSlots.length / SLOTS_PAGE_SIZE));
  const safeSlotsPage = Math.min(page, slotsTotalPages);
  const pagedSlots = filteredSlots.slice((safeSlotsPage - 1) * SLOTS_PAGE_SIZE, safeSlotsPage * SLOTS_PAGE_SIZE);

  useEffect(() => { setPage(1); }, [filters]);

  useEffect(() => {
    let cancelled = false;
    request('/admin/slots/release-now', {}, auth.token)
      .then((data) => {
        if (!cancelled) setReleaseNowEnabled(Boolean(data.enabled));
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [auth.token]);

  const speciesSummary = useMemo(() => {
    const map = {};
    filteredSlots.forEach((s) => {
      const key = `${s.species}-${s.sex}`;
      if (!map[key]) map[key] = { label: s.label || `${s.species} ${s.sex}`, total: 0, occupied: 0 };
      map[key].total += Number(s.total_quantity || 0);
      map[key].occupied += Number(s.occupied_quantity || 0);
    });
    return Object.values(map);
  }, [filteredSlots]);

  const allSelected = filteredSlots.length > 0 && filteredSlots.every((s) => selectedIds.has(s.id));

  function toggleSelected(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (allSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        filteredSlots.forEach((s) => next.delete(s.id));
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        filteredSlots.forEach((s) => next.add(s.id));
        return next;
      });
    }
  }

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

  async function removeHard(id) {
    if (!confirm('Excluir esta vaga DEFINITIVAMENTE?\n\nEsta ação não pode ser desfeita.')) return;
    try {
      await request(`/admin/slots/${id}?permanent=true`, { method: 'DELETE' }, auth.token);
      reload();
    } catch (err) {
      setError(err.message);
    }
  }

  function startRenew() {
    if (!selectedIds.size) return;
    if (!selectedSlots.length) {
      setError('Selecione ao menos uma vaga válida.');
      return;
    }
    setError('');
    setRenewError('');
    setRenewRows(selectedSlots.map((slot) => ({
      source_id: slot.id,
      source_date: slot.date,
      source_time: slot.time,
      source_label: slot.label,
      source_clinic: slot.clinic,
      date: addMonthToDate(slot.date),
      time: slot.time,
      species: slot.species,
      sex: slot.sex,
      clinic_id: String(slot.clinic_id || ''),
      total_quantity: slot.total_quantity
    })));
  }

  function updateRenewRow(index, patch) {
    setRenewRows((current) => current.map((row, rowIndex) => (
      rowIndex === index ? { ...row, ...patch } : row
    )));
  }

  function updateRenewType(index, value) {
    const [species, sex] = value.split('-');
    updateRenewRow(index, { species, sex });
  }

  async function submitRenew(event) {
    event.preventDefault();
    if (!renewRows?.length) return;
    setRenewError('');
    try {
      await request('/admin/slots/renew', {
        method: 'POST',
        body: {
          renewals: renewRows.map((row) => ({
            id: row.source_id,
            date: row.date,
            time: row.time,
            species: row.species,
            sex: row.sex,
            clinic_id: row.clinic_id,
            total_quantity: Number(row.total_quantity)
          }))
        }
      }, auth.token);
      setSelectedIds(new Set());
      setRenewRows(null);
      reload();
    } catch (err) {
      setRenewError(err.message);
    }
  }

  async function removeBulk() {
    if (!selectedIds.size) return;
    if (!confirm(`Excluir ${selectedIds.size} vaga(s) DEFINITIVAMENTE?\n\nVagas com agendamentos ativos serão ignoradas. Esta ação não pode ser desfeita.`)) return;
    setError('');
    const results = await Promise.allSettled(
      [...selectedIds].map((id) => request(`/admin/slots/${id}?permanent=true`, { method: 'DELETE' }, auth.token))
    );
    const failed = results.filter((r) => r.status === 'rejected');
    if (failed.length) setError(`${failed.length} vaga(s) não puderam ser excluídas (possuem agendamentos ativos).`);
    setSelectedIds(new Set());
    reload();
  }

  async function toggleReleaseNow() {
    setReleaseNowLoading(true);
    setError('');
    try {
      const data = await request('/admin/slots/release-now', {
        method: 'POST',
        body: { enabled: !releaseNowEnabled }
      }, auth.token);
      setReleaseNowEnabled(Boolean(data.enabled));
    } catch (err) {
      setError(err.message);
    } finally {
      setReleaseNowLoading(false);
    }
  }

  if (renewRows) {
    return (
      <div className="admin-section renewal-screen">
        <div className="section-title renewal-title">
          <span className="eyebrow">Renovação de vagas</span>
          <h3>Definir novas vagas</h3>
          <p>{renewRows.length} vaga{renewRows.length !== 1 ? 's' : ''} selecionada{renewRows.length !== 1 ? 's' : ''} para renovação.</p>
        </div>
        <form className="renewal-form" onSubmit={submitRenew}>
          {renewError ? <InlineAlert message={renewError} /> : null}
          <DataTable
            className="renewal-table"
            columns={['Vaga original', 'Nova data', 'Novo horário', 'Tipo', 'Clínica', 'Total de vagas']}
            rows={renewRows.map((row, index) => [
              <div key={`source-${row.source_id}`} className="renewal-source">
                <strong>{formatDate(row.source_date)} {row.source_time}</strong>
                <span>{capitalize(row.source_label)} · {row.source_clinic}</span>
              </div>,
              <DateInput
                key={`date-${row.source_id}`}
                className="table-input"
                value={row.date}
                onChange={(value) => updateRenewRow(index, { date: value })}
                required
              />,
              <TimeInput
                key={`time-${row.source_id}`}
                className="table-input compact-table-input"
                value={row.time}
                onChange={(value) => updateRenewRow(index, { time: value })}
                required
              />,
              <select
                key={`type-${row.source_id}`}
                value={`${row.species}-${row.sex}`}
                onChange={(event) => updateRenewType(index, event.target.value)}
                required
              >
                <option value="gato-femea">Gata</option>
                <option value="gato-macho">Gato</option>
                <option value="cao-femea">Cadela</option>
                <option value="cao-macho">Cão</option>
              </select>,
              <select
                key={`clinic-${row.source_id}`}
                value={row.clinic_id}
                onChange={(event) => updateRenewRow(index, { clinic_id: event.target.value })}
                required
              >
                <option value="">Selecione</option>
                {clinicOptions.map((clinic) => (
                  <option key={clinic.id} value={clinic.id}>{clinic.name}</option>
                ))}
              </select>,
              <input
                key={`total-${row.source_id}`}
                className="table-input compact-table-input"
                type="number"
                min="1"
                value={row.total_quantity}
                onChange={(event) => updateRenewRow(index, { total_quantity: Number(event.target.value) })}
                required
              />
            ])}
          />
          <div className="form-actions renewal-actions">
            <button className="button ghost" type="button" onClick={() => { setRenewRows(null); setRenewError(''); }}>
              <XCircle size={18} />
              Cancelar
            </button>
            <button className="button primary" type="submit">
              <CalendarPlus size={18} />
              Criar vagas renovadas
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="admin-section">
      <form className="inline-form" onSubmit={save}>
        {error ? <InlineAlert message={error} /> : null}
        <DateField label="Data" value={form.date} onChange={(value) => setForm({ ...form, date: value })} required />
        <TimeField label="Hora" value={form.time} onChange={(value) => setForm({ ...form, time: value })} required />
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
      <div className="filter-bar slots-filter-bar" aria-label="Filtros de vagas">
        <label className="field">
          <span>Clínica</span>
          <select value={filters.clinic_id} onChange={(event) => setFilters({ ...filters, clinic_id: event.target.value })}>
            <option value="">Todas</option>
            {clinics.map((clinic) => <option key={clinic.id} value={clinic.id}>{clinic.name}</option>)}
          </select>
        </label>
        <DateField label="Data" value={filters.date} onChange={(value) => setFilters({ ...filters, date: value })} />
        <label className="field">
          <span>Mês</span>
          <select value={filters.month} onChange={(event) => setFilters({ ...filters, month: event.target.value })}>
            <option value="">Todos</option>
            {MONTH_FILTER_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
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
        <button className="button ghost filter-clear-button" type="button" onClick={() => setFilters({ clinic_id: '', date: '', month: '', type: '', status: '' })}>
          Limpar filtros
        </button>
        <span className="filter-count">
          {filteredSlots.reduce((acc, s) => acc + Number(s.total_quantity || 0), 0)} vagas
          ({filteredSlots.length} de {slots.length} linhas)
        </span>
      </div>
      {speciesSummary.length > 0 && (
        <div className="slots-species-summary">
          {speciesSummary.map((item) => (
            <div key={item.label} className="slots-species-chip">
              <span className="slots-species-label">{capitalize(item.label)}</span>
              <span className="slots-species-available">{item.total - item.occupied} disp.</span>
              <span className="slots-species-total">/ {item.total} total</span>
            </div>
          ))}
        </div>
      )}
      <div className="slots-toolbar">
        <button
          className={`button release-now-button ${releaseNowEnabled ? 'active' : 'primary'}`}
          type="button"
          onClick={toggleReleaseNow}
          disabled={releaseNowLoading}
        >
          {releaseNowEnabled ? <CheckCircle2 size={18} /> : <CalendarPlus size={18} />}
          {releaseNowLoading
            ? 'Atualizando...'
            : releaseNowEnabled
              ? 'Ocultar Vagas do Público'
              : 'Disponibilizar Vagas Agora'}
        </button>
        <span className={`release-now-badge ${releaseNowEnabled ? 'active' : 'inactive'}`}>
          {releaseNowEnabled ? 'Vagas visíveis ao público' : 'Vagas ocultas do público'}
        </span>
        <button className="button ghost" type="button" onClick={toggleSelectAll}>
          {allSelected ? 'Desmarcar Todas' : 'Selecionar Todas'}
        </button>
        <button className="button primary" type="button" onClick={startRenew} disabled={!selectedIds.size}>
          <CalendarPlus size={18} />
          Renovar Vagas{selectedIds.size > 0 ? ` (${selectedIds.size})` : ''}
        </button>
        <button className="button danger" type="button" onClick={removeBulk} disabled={!selectedIds.size}>
          <Trash2 size={18} />
          Excluir Selecionadas{selectedIds.size > 0 ? ` (${selectedIds.size})` : ''}
        </button>
        {selectedIds.size > 0 && (
          <span className="filter-count">{selectedIds.size} selecionada{selectedIds.size !== 1 ? 's' : ''}</span>
        )}
      </div>
      <DataTable
        columns={['', 'Data', 'Hora', 'Tipo', 'Clínica', 'Total', 'Ocupadas', 'Status', 'Ações']}
        rows={pagedSlots.map((slot) => [
          <input key={`chk-${slot.id}`} type="checkbox" checked={selectedIds.has(slot.id)} onChange={() => toggleSelected(slot.id)} />,
          formatDate(slot.date),
          slot.time,
          capitalize(slot.label),
          slot.clinic,
          slot.total_quantity,
          slot.occupied_quantity,
          slot.active ? 'Ativa' : 'Inativa',
          <TableActions key={slot.id} onEdit={() => edit(slot)} onDelete={() => remove(slot.id)} onHardDelete={() => removeHard(slot.id)} />
        ])}
      />
      {slotsTotalPages > 1 && (
        <div className="pagination">
          <button className="button ghost small" disabled={safeSlotsPage === 1} onClick={() => setPage(safeSlotsPage - 1)}>‹ Anterior</button>
          <span className="pagination-info">
            Página {safeSlotsPage} de {slotsTotalPages}
            <span className="pagination-range">
              ({(safeSlotsPage - 1) * SLOTS_PAGE_SIZE + 1}–{Math.min(safeSlotsPage * SLOTS_PAGE_SIZE, filteredSlots.length)} de {filteredSlots.length} linhas)
            </span>
          </span>
          <button className="button ghost small" disabled={safeSlotsPage === slotsTotalPages} onClick={() => setPage(safeSlotsPage + 1)}>Próxima ›</button>
        </div>
      )}
    </div>
  );
}

function AppointmentResponsibleInfo({ appointment }) {
  if (!appointment.substitute_responsible) {
    return (
      <div className="responsible-cell">
        <strong>Tutor principal</strong>
        <span>{appointment.user_name}</span>
        <span>CPF: {maskCpf(appointment.user_cpf || '')}</span>
        <span>{appointment.user_phone || '-'}</span>
      </div>
    );
  }

  const address = [
    appointment.responsible_address,
    appointment.responsible_address_number,
    appointment.responsible_neighborhood
  ].filter(Boolean).join(', ');

  return (
    <div className="responsible-cell substitute">
      <strong>{appointment.responsible_name || '-'}</strong>
      <span>Responsável substituto</span>
      <span>CPF: {maskCpf(appointment.responsible_cpf || '')}</span>
      <span>CEP: {maskCep(appointment.responsible_cep || '')}</span>
      <span>{address || '-'}</span>
      <span>{appointment.responsible_phone || '-'}</span>
      {appointment.responsible_email ? <span>{appointment.responsible_email}</span> : null}
      <span>{appointment.responsible_city_confirmed && appointment.responsible_adult_confirmed ? 'Residência e maioridade confirmadas' : 'Confirmação pendente'}</span>
    </div>
  );
}

function AppointmentsTab({ appointments, reload, auth }) {
  const [drafts, setDrafts] = useState({});
  const [rowErrors, setRowErrors] = useState({});
  const [rowMessages, setRowMessages] = useState({});

  function draftFor(appointment) {
    return drafts[appointment.id] || { status: appointment.status, reason: appointment.reason || '', microchip: appointment.microchip || '' };
  }

  function formatMicrochip(value) {
    const digits = value.replace(/\D/g, '').slice(0, 16);
    return digits.length > 15 ? `${digits.slice(0, 15)} ${digits.slice(15)}` : digits;
  }

  async function save(appointment) {
    const draft = draftFor(appointment);
    if (draft.status === 'realizado') {
      const digits = (draft.microchip || '').replace(/\s/g, '');
      if (!/^\d{16}$/.test(digits)) {
        setRowErrors(prev => ({ ...prev, [appointment.id]: 'Informe o microchip: 15 dígitos + 1 dígito verificador (16 dígitos no total).' }));
        return;
      }
    }
    setRowErrors(prev => { const n = { ...prev }; delete n[appointment.id]; return n; });
    try {
      await request(`/admin/appointments/${appointment.id}/status`, {
        method: 'PATCH',
        body: { ...draft, microchip: (draft.microchip || '').replace(/\s/g, '') }
      }, auth.token);
      setDrafts((current) => {
        const next = { ...current };
        delete next[appointment.id];
        return next;
      });
      setRowMessages(prev => ({ ...prev, [appointment.id]: `Agendamento ${appointment.protocol} atualizado.` }));
      reload();
      setTimeout(() => setRowMessages(prev => { const n = { ...prev }; delete n[appointment.id]; return n; }), 3000);
    } catch (err) {
      setRowErrors(prev => ({ ...prev, [appointment.id]: err.message }));
    }
  }

  return (
    <div className="admin-section">
      <DataTable
        className="appointments-table"
        columns={['Tutor', 'Contato', 'Responsável no atendimento', 'Animal', 'Horário', 'Documentos', 'Status', 'Microchip', 'Motivo', 'Ação']}
        rows={appointments.map((appointment) => {
          const draft = draftFor(appointment);
          return [
            appointment.user_name,
            appointment.user_phone,
            <AppointmentResponsibleInfo key={`responsible-${appointment.id}`} appointment={appointment} />,
            `${appointment.animal_name} · ${appointment.animal_type_label}`,
            `${formatDate(appointment.date)} ${appointment.time} · ${appointment.clinic}${appointment.clinic_address ? ` · ${appointment.clinic_address}` : ''}`,
            <div key={`docs-${appointment.id}`} className="doc-chips">
              {DOC_FIELDS.map(({ field, label }) => {
                const uploaded = Boolean(appointment[field]);
                return (
                  <button
                    key={field}
                    type="button"
                    title={uploaded ? `Ver ${label}` : `${label}: não enviado`}
                    className={`doc-chip ${uploaded ? 'ok' : 'missing'}`}
                    disabled={!uploaded}
                    onClick={() => uploaded && openDocument(appointment.user_id, field, auth.token)}
                  >
                    {uploaded ? <Eye size={13} /> : null}
                    {field === 'doc_residencia' ? 'Res.' : field === 'doc_cpf' ? 'CPF' : 'ID'}
                  </button>
                );
              })}
            </div>,
            <select
              key={`status-${appointment.id}`}
              value={draft.status}
              onChange={(event) => setDrafts({ ...drafts, [appointment.id]: { ...draft, status: event.target.value } })}
            >
              {APPOINTMENT_STATUS_OPTIONS.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>,
            draft.status === 'realizado'
              ? <input
                  key={`microchip-${appointment.id}`}
                  className="table-input microchip-input"
                  value={draft.microchip || ''}
                  onChange={(event) => setDrafts({ ...drafts, [appointment.id]: { ...draft, microchip: formatMicrochip(event.target.value) } })}
                  placeholder="000000000000000 0"
                  maxLength={17}
                  inputMode="numeric"
                  title="15 dígitos + 1 dígito verificador"
                />
              : <span key={`microchip-${appointment.id}`} className="table-microchip-display">{appointment.microchip ? `${appointment.microchip.slice(0, 15)} ${appointment.microchip.slice(15)}` : '—'}</span>,
            <input
              key={`reason-${appointment.id}`}
              className="table-input"
              value={draft.reason}
              onChange={(event) => setDrafts({ ...drafts, [appointment.id]: { ...draft, reason: event.target.value } })}
              placeholder="Motivo"
            />,
            <div key={`action-${appointment.id}`} className="table-action-cell">
              <button className="button secondary table-save" type="button" onClick={() => save(appointment)} title="Salvar status">
                <Save size={18} />
                <span>Salvar</span>
              </button>
              {rowErrors[appointment.id] ? <span className="row-save-error">{rowErrors[appointment.id]}</span> : null}
              {rowMessages[appointment.id] ? <span className="row-save-success">{rowMessages[appointment.id]}</span> : null}
            </div>
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
  return <UserManager title="Protetores Cadastrados" users={mapped} clinics={clinics} reload={reload} auth={auth} defaultRole="protetor" />;
}

const PAGE_SIZE = 20;

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
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');
  const [importResult, setImportResult] = useState(null);
  const [importing, setImporting] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());

  function toggleSelected(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (allSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        filteredUsers.forEach((u) => next.delete(u.id));
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        filteredUsers.forEach((u) => next.add(u.id));
        return next;
      });
    }
  }

  async function removeBulk() {
    if (!selectedIds.size) return;
    if (!confirm(`Excluir ${selectedIds.size} usuário(s) DEFINITIVAMENTE?\n\nUsuários com agendamentos ativos serão ignorados. Esta ação não pode ser desfeita.`)) return;
    setError('');
    const results = await Promise.allSettled(
      [...selectedIds].map((id) => request(`/admin/users/${id}?permanent=true`, { method: 'DELETE' }, auth.token))
    );
    const failed = results.filter((r) => r.status === 'rejected');
    if (failed.length) setError(`${failed.length} usuário(s) não puderam ser excluídos (possuem agendamentos ativos).`);
    setSelectedIds(new Set());
    reload();
  }

  async function importCsv(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setImporting(true);
    setImportResult(null);
    setError('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await fetch('/api/admin/users/import', {
        method: 'POST',
        headers: { Authorization: `Bearer ${auth.token}` },
        body: formData
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Erro ao importar.');
      setImportResult(data);
      reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setImporting(false);
    }
  }

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

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pagedUsers = filteredUsers.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  useEffect(() => { setPage(1); }, [filters]);

  const allSelected = filteredUsers.length > 0 && filteredUsers.every((u) => selectedIds.has(u.id));

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

  async function remove(id) {
    if (!confirm('Desativar este usuário?')) return;
    try {
      await request(`/admin/users/${id}`, { method: 'DELETE' }, auth.token);
      reload();
    } catch (err) {
      setError(err.message);
    }
  }

  async function removeHard(id) {
    if (!confirm('Excluir este usuário DEFINITIVAMENTE?\n\nTodos os animais e agendamentos cancelados vinculados também serão excluídos. Esta ação não pode ser desfeita.')) return;
    try {
      await request(`/admin/users/${id}?permanent=true`, { method: 'DELETE' }, auth.token);
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
            <option value="protetor">Protetor Cadastrado</option>
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
      <div className="import-bar">
        <label className={`button ghost${importing ? ' disabled' : ''}`} style={{ cursor: importing ? 'wait' : 'pointer' }}>
          <Download size={18} />
          {importing ? 'Importando…' : 'Importar planilha Excel / CSV'}
          <input type="file" accept=".xlsx,.csv,.txt" style={{ display: 'none' }} onChange={importCsv} disabled={importing} />
        </label>
        <span className="muted" style={{ fontSize: '0.8rem' }}>
          Aceita .xlsx (Excel) e .csv · Colunas: PROTETOR(A), ENDEREÇO, CONTATO, CPF, SENHA, EMAIL
        </span>
        {importResult && (
          <div className="import-result">
            <strong>{importResult.imported} importado(s)</strong>
            {importResult.skipped > 0 && <span> · {importResult.skipped} ignorado(s)</span>}
            {importResult.errors?.length > 0 && (
              <details>
                <summary>{importResult.errors.length} aviso(s)</summary>
                <ul>{importResult.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
              </details>
            )}
          </div>
        )}
        {error ? <InlineAlert message={error} /> : null}
      </div>
      <div className="filter-bar" aria-label="Filtros de usuários">
        <TextField label="Nome, CPF ou telefone" value={filters.search} onChange={(value) => setFilters({ ...filters, search: value })} />
        <label className="field">
          <span>Tipo</span>
          <select value={filters.role} onChange={(event) => setFilters({ ...filters, role: event.target.value })}>
            <option value="">Todos</option>
            <option value="tutor">Tutor</option>
            <option value="protetor">Protetor Cadastrado</option>
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
        <span className="filter-count">
          {filteredUsers.length === users.length
            ? `${users.length} usuário${users.length !== 1 ? 's' : ''}`
            : `${filteredUsers.length} de ${users.length} usuários`}
        </span>
      </div>
      <div className="slots-toolbar">
        <button className="button ghost" type="button" onClick={toggleSelectAll}>
          {allSelected ? 'Desmarcar Todos' : 'Selecionar Todos'}
        </button>
        <button className="button danger" type="button" onClick={removeBulk} disabled={!selectedIds.size}>
          <Trash2 size={18} />
          Excluir Selecionados{selectedIds.size > 0 ? ` (${selectedIds.size})` : ''}
        </button>
        {selectedIds.size > 0 && (
          <span className="filter-count">{selectedIds.size} selecionado{selectedIds.size !== 1 ? 's' : ''}</span>
        )}
      </div>
      <DataTable
        columns={['', 'Nome', 'CPF', 'Telefone', 'Tipo', 'Clínica', 'Status', 'Ações']}
        rows={pagedUsers.map((user) => [
          <input key={`chk-${user.id}`} type="checkbox" checked={selectedIds.has(user.id)} onChange={() => toggleSelected(user.id)} />,
          user.name,
          maskCpf(user.cpf),
          user.phone || '-',
          user.role,
          user.clinic_name || '-',
          user.active ? 'Ativo' : 'Inativo',
          <TableActions key={user.id} onEdit={() => edit(user)} onDelete={() => remove(user.id)} onHardDelete={() => removeHard(user.id)} />
        ])}
      />
      {totalPages > 1 && (
        <div className="pagination">
          <button className="button ghost small" disabled={safePage === 1} onClick={() => setPage(safePage - 1)}>‹ Anterior</button>
          <span className="pagination-info">
            Página {safePage} de {totalPages}
            <span className="pagination-range">
              ({(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filteredUsers.length)} de {filteredUsers.length})
            </span>
          </span>
          <button className="button ghost small" disabled={safePage === totalPages} onClick={() => setPage(safePage + 1)}>Próxima ›</button>
        </div>
      )}
    </div>
  );
}

function Stepper({ current, total = 4, labels = [] }) {
  const fallbackLabels = ['Tutor', 'Termos', 'Animal', 'Clínica', 'Confirmar'];
  const steps = Array.from({ length: total }, (_, i) => i + 1);
  const items = [];
  steps.forEach((num, idx) => {
    const isDone = num < current;
    const isActive = num === current;
    items.push(
      <div key={`node-${num}`} className={`wiz-step-node ${isDone ? 'done' : isActive ? 'active' : ''}`}>
        <div className="wiz-node-circle">
          {isDone ? <CheckCircle2 size={14} strokeWidth={2.5} /> : num}
        </div>
        <span className="wiz-node-label">{labels[idx] || fallbackLabels[idx] || num}</span>
      </div>
    );
    if (idx < steps.length - 1) {
      items.push(<div key={`conn-${num}`} className={`wiz-connector ${isDone ? 'done' : ''}`} />);
    }
  });
  return (
    <div className="wiz-progress" aria-label="Progresso da inscrição">
      {items}
    </div>
  );
}

function ResultPanel({ appointment }) {
  return (
    <div className="wiz-result">
      <div className="wiz-result-icon">
        <CheckCircle2 size={36} strokeWidth={2.5} />
      </div>
      <h3>Agendamento confirmado!</h3>
      <p className="wiz-result-protocol">
        <FileCheck size={16} /> Protocolo {appointment.protocol}
      </p>
      <div className="wiz-result-grid">
        <span>Data</span><strong>{formatDate(appointment.date)}</strong>
        <span>Horário</span><strong>{appointment.time}</strong>
        <span>Clínica</span><strong>{appointment.clinic}</strong>
        <span>Endereço</span><strong>{appointment.clinic_address || 'A confirmar'}</strong>
        <span>Animal</span><strong>{appointment.animal_name} · {appointment.animal_type_label}</strong>
        <span>Responsável</span><strong>{appointment.substitute_responsible ? appointment.responsible_name : appointment.user_name}</strong>
        {appointment.substitute_responsible ? (
          <>
            <span>CPF</span><strong>{maskCpf(appointment.responsible_cpf || '')}</strong>
            <span>Telefone</span><strong>{appointment.responsible_phone || '-'}</strong>
          </>
        ) : null}
      </div>
      <p className="wiz-result-note">Chegue no máximo 30 minutos antes do horário agendado.</p>
    </div>
  );
}

function TextField({ label, value, onChange, type = 'text', required = false, hint, error = '', inputMode, maxLength, disabled = false }) {
  return (
    <label className="field">
      <span>{label}{required ? ' *' : ''}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        inputMode={inputMode}
        maxLength={maxLength}
        aria-invalid={Boolean(error)}
        disabled={disabled}
      />
      {error ? <small className="field-error">{error}</small> : null}
      {!error && hint ? <small className="field-hint">{hint}</small> : null}
    </label>
  );
}

function DateField({ label, value, onChange, required = false, hint = 'Formato: DD/MM/AAAA', error = '', disabled = false }) {
  return (
    <label className="field">
      <span>{label}{required ? ' *' : ''}</span>
      <DateInput
        value={value}
        onChange={onChange}
        required={required}
        disabled={disabled}
        ariaInvalid={Boolean(error)}
      />
      {error ? <small className="field-error">{error}</small> : null}
      {!error && hint ? <small className="field-hint">{hint}</small> : null}
    </label>
  );
}

function DateInput({ value, onChange, required = false, disabled = false, className = '', ariaInvalid = false }) {
  const [display, setDisplay] = useState(() => formatDateForInput(value));
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => getCalendarMonth(value));
  const wrapperRef = useRef(null);

  useEffect(() => {
    setDisplay(formatDateForInput(value));
  }, [value]);

  useEffect(() => {
    const iso = toIsoDate(value);
    if (iso && !calendarOpen) setCalendarMonth(getCalendarMonth(iso));
  }, [value, calendarOpen]);

  useEffect(() => {
    if (!calendarOpen) return undefined;

    function handlePointerDown(event) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setCalendarOpen(false);
      }
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') setCalendarOpen(false);
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [calendarOpen]);

  function handleChange(event) {
    const nextDisplay = formatDateTyping(event.target.value);
    setDisplay(nextDisplay);

    if (!nextDisplay) {
      onChange('');
      return;
    }

    const iso = toIsoDate(nextDisplay);
    if (iso) setCalendarMonth(getCalendarMonth(iso));
    onChange(iso || nextDisplay);
  }

  function toggleCalendar() {
    if (disabled) return;
    setCalendarMonth(getCalendarMonth(display || value));
    setCalendarOpen((current) => !current);
  }

  function moveMonth(amount) {
    setCalendarMonth((current) => shiftCalendarMonth(current, amount));
  }

  function selectDate(day) {
    const iso = buildIsoDate(
      String(day).padStart(2, '0'),
      String(calendarMonth.month).padStart(2, '0'),
      String(calendarMonth.year)
    );
    if (!iso) return;
    setDisplay(formatDate(iso));
    onChange(iso);
    setCalendarOpen(false);
  }

  const hasInvalidCompleteDate = display.length === 10 && !toIsoDate(display);
  const selectedIso = toIsoDate(display) || toIsoDate(value);
  const todayIso = getTodayIsoDate();
  const calendarCells = buildCalendarCells(calendarMonth.year, calendarMonth.month);
  const inputClassName = `date-input-field ${className}`.trim();

  return (
    <div className="date-input-wrap" ref={wrapperRef}>
      <input
        className={inputClassName}
        type="text"
        value={display}
        onChange={handleChange}
        required={required}
        disabled={disabled}
        inputMode="numeric"
        maxLength={10}
        placeholder="dd/mm/aaaa"
        pattern="\d{2}/\d{2}/\d{4}"
        aria-invalid={ariaInvalid || hasInvalidCompleteDate}
        title="Use o formato DD/MM/AAAA"
      />
      <button
        className="date-calendar-trigger"
        type="button"
        onClick={toggleCalendar}
        disabled={disabled}
        aria-label="Abrir calendário"
        title="Abrir calendário"
      >
        <Calendar size={18} />
      </button>
      {calendarOpen ? (
        <div className="date-calendar-popover" role="dialog" aria-label="Selecionar data">
          <div className="date-calendar-header">
            <button type="button" onClick={() => moveMonth(-1)} aria-label="Mês anterior">‹</button>
            <strong>{formatCalendarMonth(calendarMonth)}</strong>
            <button type="button" onClick={() => moveMonth(1)} aria-label="Próximo mês">›</button>
          </div>
          <div className="date-calendar-grid date-calendar-weekdays">
            {WEEKDAY_LABELS.map((day) => <span key={day}>{day}</span>)}
          </div>
          <div className="date-calendar-grid date-calendar-days">
            {calendarCells.map((day, index) => {
              const iso = day ? buildIsoDate(String(day).padStart(2, '0'), String(calendarMonth.month).padStart(2, '0'), String(calendarMonth.year)) : '';
              return day ? (
                <button
                  key={iso}
                  type="button"
                  className={`${iso === selectedIso ? 'selected' : ''} ${iso === todayIso ? 'today' : ''}`.trim()}
                  onClick={() => selectDate(day)}
                >
                  {day}
                </button>
              ) : (
                <span key={`empty-${index}`} />
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function TimeField({ label, value, onChange, required = false, hint = 'Formato: 24h, HH:MM', error = '', disabled = false }) {
  return (
    <label className="field">
      <span>{label}{required ? ' *' : ''}</span>
      <TimeInput
        value={value}
        onChange={onChange}
        required={required}
        disabled={disabled}
        ariaInvalid={Boolean(error)}
      />
      {error ? <small className="field-error">{error}</small> : null}
      {!error && hint ? <small className="field-hint">{hint}</small> : null}
    </label>
  );
}

function TimeInput({ value, onChange, required = false, disabled = false, className = '', ariaInvalid = false }) {
  const [display, setDisplay] = useState(() => formatTimeForInput(value));

  useEffect(() => {
    setDisplay(formatTimeForInput(value));
  }, [value]);

  function handleChange(event) {
    const nextDisplay = formatTimeTyping(event.target.value);
    setDisplay(nextDisplay);

    if (!nextDisplay) {
      onChange('');
      return;
    }

    const time = toTime24(nextDisplay);
    onChange(time || nextDisplay);
  }

  const hasInvalidCompleteTime = display.length === 5 && !toTime24(display);

  return (
    <input
      className={className}
      type="text"
      value={display}
      onChange={handleChange}
      required={required}
      disabled={disabled}
      inputMode="numeric"
      maxLength={5}
      placeholder="hh:mm"
      pattern="([01]\d|2[0-3]):[0-5]\d"
      aria-invalid={ariaInvalid || hasInvalidCompleteTime}
      title="Use o formato 24h, HH:MM"
    />
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

function DataTable({ columns, rows, className = '' }) {
  if (!rows.length) return <p className="muted">Nenhum registro encontrado.</p>;
  return (
    <div className={`table-wrap ${className}`.trim()}>
      <table>
        <thead>
          <tr>{columns.map((column, i) => <th key={i}>{column}</th>)}</tr>
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

function TableActions({ onEdit, onDelete, onHardDelete }) {
  return (
    <div className="table-actions">
      <button className="icon-only" type="button" onClick={onEdit} title="Editar"><Edit3 size={18} /></button>
      <button className="icon-only danger" type="button" onClick={onDelete} title="Desativar"><Trash2 size={18} /></button>
      {onHardDelete && (
        <button className="icon-only danger" type="button" onClick={onHardDelete} title="Excluir definitivamente"><XCircle size={18} /></button>
      )}
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

function getTodayIsoDate() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
}

function getCalendarMonth(value = '') {
  const iso = toIsoDate(value) || getTodayIsoDate();
  const [year, month] = iso.split('-').map(Number);
  return { year, month };
}

function shiftCalendarMonth(current, amount) {
  const date = new Date(current.year, current.month - 1 + amount, 1);
  return { year: date.getFullYear(), month: date.getMonth() + 1 };
}

function buildCalendarCells(year, month) {
  const firstDay = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const cells = [
    ...Array.from({ length: firstDay }, () => null),
    ...Array.from({ length: daysInMonth }, (_item, index) => index + 1)
  ];
  while (cells.length < 42) cells.push(null);
  return cells;
}

function formatCalendarMonth({ year, month }) {
  const label = new Date(year, month - 1, 1).toLocaleDateString('pt-BR', {
    month: 'long',
    year: 'numeric'
  });
  return capitalize(label);
}

function formatDate(value) {
  if (!value) return '-';
  const iso = toIsoDate(value);
  if (!iso) return value;
  const [year, month, day] = iso.split('-');
  return `${day}/${month}/${year}`;
}

function formatDateForInput(value) {
  const iso = toIsoDate(value);
  if (iso) return formatDate(iso);
  return value && value !== '-' ? String(value) : '';
}

function formatTimeForInput(value) {
  const time = toTime24(value);
  return time || (value ? String(value) : '');
}

function formatTimeTyping(value = '') {
  const digits = onlyDigits(value).slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

function toTime24(value = '') {
  const raw = String(value || '').trim();
  const match = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (match) {
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
      return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    }
    return '';
  }

  const digits = onlyDigits(raw);
  if (digits.length === 4) return toTime24(`${digits.slice(0, 2)}:${digits.slice(2)}`);
  return '';
}

function formatDateTyping(value = '') {
  const digits = onlyDigits(value).slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

function toIsoDate(value = '') {
  const raw = String(value || '').trim();
  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) return buildIsoDate(isoMatch[3], isoMatch[2], isoMatch[1]) === raw ? raw : '';

  const brMatch = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (brMatch) return buildIsoDate(brMatch[1], brMatch[2], brMatch[3]);

  const digits = onlyDigits(raw);
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

function getDateMonth(value) {
  return toIsoDate(value).slice(5, 7);
}

function formatCsvValue(value, header = '') {
  if (value == null) return '';
  if (['date', 'day'].includes(header) || String(header).toLowerCase().includes('data')) {
    return formatDate(value);
  }
  return String(value).replace(/"/g, '""');
}

function addMonthToDate(value) {
  const iso = toIsoDate(value);
  if (!iso) return '';
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(year, month, day);
  const nextYear = date.getFullYear();
  const nextMonth = String(date.getMonth() + 1).padStart(2, '0');
  const nextDay = String(date.getDate()).padStart(2, '0');
  return `${nextYear}-${nextMonth}-${nextDay}`;
}

function maskCpf(value = '') {
  const digits = String(value).replace(/\D/g, '');
  if (digits.length !== 11) return value;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

function maskCep(value = '') {
  const digits = onlyDigits(value);
  if (digits.length !== 8) return value || '-';
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
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

function userRoleLabel(role) {
  if (role === 'admin') return 'Administrador';
  if (role === 'protetor') return 'Protetor Cadastrado';
  return 'Tutor';
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

function getCpfValidationMessage(value = '') {
  const digits = onlyDigits(value);
  if (digits.length !== CPF_DIGITS_LENGTH) return `Informe ${CPF_DIGITS_LENGTH} dígitos numéricos.`;
  if (!isValidCpf(digits)) return 'CPF inválido. Verifique os dígitos informados.';
  return '';
}

function isValidCpf(value = '') {
  const digits = onlyDigits(value);
  if (digits.length !== CPF_DIGITS_LENGTH || /^(\d)\1+$/.test(digits)) return false;

  let sum = 0;
  for (let i = 0; i < 9; i += 1) sum += Number(digits[i]) * (10 - i);
  let firstCheckDigit = 11 - (sum % 11);
  if (firstCheckDigit >= 10) firstCheckDigit = 0;

  sum = 0;
  for (let i = 0; i < 10; i += 1) sum += Number(digits[i]) * (11 - i);
  let secondCheckDigit = 11 - (sum % 11);
  if (secondCheckDigit >= 10) secondCheckDigit = 0;

  return Number(digits[9]) === firstCheckDigit && Number(digits[10]) === secondCheckDigit;
}
