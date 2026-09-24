import { useEffect, useState } from 'react';
import { Clock3 } from 'lucide-react';

export function ReleaseCountdown({ request }) {
  const [countdown, setCountdown] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    let target = null;
    let pending = false;

    async function refresh() {
      if (pending || controller.signal.aborted) return;
      pending = true;
      try {
        const data = await request('/public/release-countdown', { signal: controller.signal, cache: 'no-store' });
        if (controller.signal.aborted) return;
        const remaining = Date.parse(data.releaseAt) - Date.parse(data.serverNow);
        target = data.enabled && remaining > 0
          ? { deadline: performance.now() + remaining, releaseAt: data.releaseAt }
          : null;
        tick();
      } catch {
        target = null;
        if (!controller.signal.aborted) setCountdown(null);
      } finally {
        pending = false;
      }
    }

    function tick() {
      if (!target) { setCountdown(null); return; }
      const seconds = Math.max(0, Math.ceil((target.deadline - performance.now()) / 1000));
      if (!seconds) {
        target = null;
        setCountdown(null);
        void refresh();
        return;
      }
      setCountdown({ seconds, releaseAt: target.releaseAt });
    }

    function onVisible() { if (!document.hidden) void refresh(); }
    void refresh();
    const poll = setInterval(refresh, 15_000);
    const clock = setInterval(tick, 1000);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      controller.abort();
      clearInterval(poll);
      clearInterval(clock);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [request]);

  if (!countdown) return null;
  const { seconds, releaseAt } = countdown;
  const units = [
    [Math.floor(seconds / 86400), 'dias'],
    [Math.floor(seconds / 3600) % 24, 'horas'],
    [Math.floor(seconds / 60) % 60, 'minutos'],
    [seconds % 60, 'segundos']
  ];
  const releaseDate = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short'
  }).format(new Date(releaseAt));

  return (
    <section className="release-countdown" aria-labelledby="release-countdown-title">
      <div className="release-countdown-title" id="release-countdown-title"><Clock3 size={18} aria-hidden="true" />Próximas vagas disponíveis em:</div>
      <div className="release-countdown-units" role="timer" aria-live="off" aria-label={units.map(([value, label]) => `${value} ${label}`).join(', ')}>
        {units.map(([value, label]) => <span className="release-countdown-unit" key={label}><strong>{String(value).padStart(2, '0')}</strong><small>{label}</small></span>)}
      </div>
      <p>Publicação prevista: <time dateTime={releaseAt}>{releaseDate}</time> (horário de Brasília).</p>
    </section>
  );
}

export function CountdownControl({ request, token }) {
  const [enabled, setEnabled] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setError('');
    request('/admin/slots/countdown', { signal: controller.signal, cache: 'no-store' }, token)
      .then(data => { if (!controller.signal.aborted) setEnabled(data.enabled); })
      .catch(err => { if (!controller.signal.aborted) setError(err.message); });
    return () => controller.abort();
  }, [request, token, reload]);

  async function toggle() {
    setSaving(true);
    setError('');
    try {
      const data = await request('/admin/slots/countdown', { method: 'PUT', body: { enabled: !enabled } }, token);
      setEnabled(data.enabled);
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  }

  return (
    <div className="countdown-control">
      <div>
        <strong>Cronômetro na página principal</strong>
        <p>Exibe a contagem para a publicação agendada mais próxima. A data da publicação define o cronômetro, independentemente dos horários e do saldo das vagas. Sem publicação futura, o aviso fica oculto.</p>
        <small role="status">{enabled === null ? 'Carregando configuração…' : enabled ? 'Ativado — atualização automática na página principal a cada 15 segundos.' : 'Desativado — o cronômetro fica oculto na página principal.'}</small>
      </div>
      <button className={`button ${enabled ? 'secondary' : 'primary'} small`} type="button" role="switch" aria-checked={enabled === true} aria-label="Exibir cronômetro na página principal" disabled={enabled === null || saving} onClick={toggle}>
        {saving ? 'Salvando…' : enabled ? 'Desativar cronômetro' : 'Ativar cronômetro'}
      </button>
      {error ? <p className="countdown-control-error" role="alert">{error} {enabled === null ? <button className="button ghost small" type="button" onClick={() => setReload(value => value + 1)}>Tentar novamente</button> : null}</p> : null}
    </div>
  );
}
