const CONFIG = {
  CRM_ID: '13rx2q2yuPgalTf2JpLR0j60Ot4euuKPLQI39yBpy9LA',
  MATRIX_ID: '12X0aCE0qvVUis7OHeB1r1T_7tv7YVuFeFNVW9myPICo',
  EMAIL_FROM_NAME: 'Paulo Roberto | Psicanálise',
  EMAIL_REPLY_TO: 'pauloroberto.psicanalise@gmail.com',
  WHATSAPP: '5541999314077',
  VERSION: '2.3.1-dev',
  ENABLE_INTERPRETIVE_RESULT: false
};

function doGet() {
  return json_({ ok: true, service: 'A Estrada', version: CONFIG.VERSION });
}

function doPost(e) {
  try {
    const payload = parsePayload_(e);
    validatePayload_(payload);

    const lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      const result = registerJourney_(payload);
      sendResultEmail_(result);
      return json_({ ok: true, lead_id: result.leadId, result_status: result.resultStatus });
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    console.error(err);
    return json_({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

function parsePayload_(e) {
  if (e && e.parameter && e.parameter.payload) return JSON.parse(e.parameter.payload);
  if (e && e.postData && e.postData.contents) return JSON.parse(e.postData.contents);
  throw new Error('Payload ausente.');
}

function validatePayload_(p) {
  if (!p || !p.answers || !p.answers.contato) throw new Error('Dados incompletos.');
  const c = p.answers.contato;
  if (!c.consent) throw new Error('Consentimento obrigatório.');
  if (!c.nome || String(c.nome).trim().length < 3) throw new Error('Nome inválido.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(c.email || ''))) throw new Error('E-mail inválido.');
  const digits = String(c.whatsapp || '').replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 13) throw new Error('WhatsApp inválido.');
}

function registerJourney_(p) {
  const now = new Date();
  const leadId = makeLeadId_(now);
  const a = p.answers || {};
  const c = a.contato || {};
  const t = p.tracking || {};
  const stops = Array.isArray(a.paradas) ? a.paradas.slice(0, 3) : [];

  const analysis = buildInterpretiveResult_(a);
  const resultStatus = analysis.enabled ? 'Gerado' : 'Aguardando validação';

  const crm = SpreadsheetApp.openById(CONFIG.CRM_ID);
  const leads = crm.getSheetByName('LEADS');
  const estrada = crm.getSheetByName('A_ESTRADA');
  const interacoes = crm.getSheetByName('INTERACOES');
  const follow = crm.getSheetByName('FOLLOW_UP');

  leads.appendRow([
    leadId, now, clean_(c.nome), clean_(c.email), clean_(c.whatsapp), '', '',
    'A Estrada', clean_(t.utm_campaign), clean_(t.utm_source), clean_(t.utm_medium),
    'Sim', resultStatus, 'Novo lead', 'Não', 'Não', 20, 'Paulo Roberto'
  ]);

  estrada.appendRow([
    leadId, safeDate_(p.started_at), now,
    clean_(a.inicio),
    joinParts_([a.terreno, choice_(a.trajeto)]),
    joinParts_([a.laterais, a.presencas]),
    clean_(a.companhia),
    clean_(a.ritmo),
    clean_(a.reacao),
    clean_(stops[0]), clean_(stops[1]), clean_(stops[2]),
    clean_(a.futuro),
    note_(a.trajeto),
    analysis.tags.join(', '),
    analysis.profile,
    resultStatus,
    '',
    clean_(a.terreno), choice_(a.trajeto), clean_(a.laterais), clean_(a.presencas),
    clean_(a.ritmo), clean_(a.reacao), clean_(a.futuro),
    clean_(t.utm_campaign), clean_(t.utm_content), clean_(t.utm_term),
    clean_(t.landing_url), c.consent ? 'Sim' : 'Não',
    JSON.stringify(p), clean_(p.version || CONFIG.VERSION)
  ]);

  interacoes.appendRow([
    Utilities.getUuid(), leadId, now, 'estrada_completed', 'site',
    'A Estrada', 'Automático', resultStatus, 'Sistema', ''
  ]);

  const next = new Date(now.getTime() + 48 * 60 * 60 * 1000);
  follow.appendRow([
    leadId, now, 'Verificar interação após devolutiva', next, 0, 'Sim',
    'Não', 'Aguardando', '', 0, 'E-mail', 'FOLLOWUP-48H', ''
  ]);

  return {
    leadId, now, contact: c, answers: a, tracking: t,
    analysis, resultStatus
  };
}

function buildInterpretiveResult_(answers) {
  const base = { enabled: false, profile: '', tags: [], blocks: [] };
  if (!CONFIG.ENABLE_INTERPRETIVE_RESULT) return base;

  const matrix = SpreadsheetApp.openById(CONFIG.MATRIX_ID);
  const sheet = matrix.getSheetByName('MATRIZ_RESPOSTAS');
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return base;

  const approved = {};
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const code = String(row[0] || '').trim();
    const status = String(row[17] || '').trim().toLowerCase();
    if (code && status === 'aprovado') {
      approved[code] = {
        tag: row[3] || '',
        reading: row[14] || '',
        question: row[15] || '',
        continuation: row[16] || ''
      };
    }
  }

  const codeMap = {
    inicio: {'clara-aberta':'Q1-A','estreita':'Q1-B','subida':'Q1-C','varios-caminhos':'Q1-D'},
    terreno: {'pavimentado':'Q2-A','terra-limpa':'Q2-B','pedras':'Q2-C','derrapante':'Q2-D','sujo':'Q2-E','esburacado':'Q2-F'},
    trajeto: {'reto':'Q3-A','curvas':'Q3-B','neblina':'Q3-C','descida-ingreme':'Q3-D'},
    laterais: {'arvores':'Q4-A','montanhas':'Q4-B','abismo':'Q4-C','pantano':'Q4-D','cidade':'Q4-E','deserto':'Q4-F'},
    presencas: {'animais-selvagens':'Q5-A','passaros':'Q5-B','nenhuma':'Q5-C','pessoas':'Q5-D'},
    companhia: {'sozinho':'Q6-A','com-alguem':'Q6-B','com-varias-pessoas':'Q6-C','nao-sei':'Q6-D'},
    ritmo: {'devagar':'Q7-A','correndo':'Q7-B','cuidado':'Q7-C','travado':'Q7-D'},
    reacao: {'paro-observo':'Q8-A','tento-atravessar':'Q8-B','procuro-outro':'Q8-C','espero-ajuda':'Q8-D'}
  };

  const blocks = [];
  Object.keys(codeMap).forEach(key => {
    const rawValue = key === 'trajeto' ? choice_(answers[key]) : answers[key];
    const code = codeMap[key][rawValue];
    if (code && approved[code]) blocks.push(approved[code]);
  });

  const stopMap = {'posto':'Q9-A','restaurante':'Q9-B','hotel':'Q9-C','mirante':'Q9-D','posto-medico':'Q9-E','capela':'Q9-F'};
  (answers.paradas || []).forEach(v => {
    const code = stopMap[v];
    if (code && approved[code]) blocks.push(approved[code]);
  });

  return {
    enabled: blocks.length > 0,
    profile: '',
    tags: [...new Set(blocks.map(b => b.tag).filter(Boolean))],
    blocks: blocks.slice(0, 4)
  };
}

function sendResultEmail_(r) {
  const firstName = String(r.contact.nome || '').trim().split(/\s+/)[0] || 'Olá';
  const subject = 'A Estrada — sua experiência foi registrada';

  let body = '<p>Olá, ' + escapeHtml_(firstName) + '.</p>' +
    '<p>Seu percurso em <strong>A Estrada</strong> foi registrado.</p>';

  if (r.analysis.enabled) {
    body += '<p>Abaixo estão alguns pontos de reflexão construídos apenas com elementos previamente validados por Paulo Roberto. Eles não constituem diagnóstico.</p>';
    r.analysis.blocks.forEach(b => {
      body += '<div style="margin:18px 0;padding:16px;border-left:3px solid #b59a62;background:#faf7f0">' +
        '<p><strong>' + escapeHtml_(b.reading) + '</strong></p>' +
        '<p>' + escapeHtml_(b.question) + '</p>' +
        '<p>' + escapeHtml_(b.continuation) + '</p></div>';
    });
  } else {
    body += '<p>Nesta fase de homologação, a leitura interpretativa automática permanece desativada até a validação final da matriz por Paulo Roberto. Seus dados e respostas foram registrados para a devolutiva.</p>';
  }

  const wa = 'https://wa.me/' + CONFIG.WHATSAPP + '?text=' +
    encodeURIComponent('Olá, Dr. Paulo. Fiz A Estrada e gostaria de agendar uma conversa inicial gratuita de 15 minutos para conhecer melhor seu trabalho.');

  body += '<p>Se fizer sentido, você pode agendar uma conversa inicial gratuita de 15 minutos para conhecer mais sobre o trabalho de Paulo Roberto e entender como poderá ser uma experiência de acompanhamento — sem pressão para iniciar atendimento.</p>' +
    '<p><a href="' + wa + '">Agendar conversa inicial gratuita de 15 min</a></p>' +
    '<p style="font-size:12px;color:#667780">A Estrada é uma experiência guiada de autopercepção. Não é teste psicológico e não produz diagnóstico.</p>';

  GmailApp.sendEmail(r.contact.email, subject, stripHtml_(body), {
    htmlBody: body,
    name: CONFIG.EMAIL_FROM_NAME,
    replyTo: CONFIG.EMAIL_REPLY_TO
  });

  const crm = SpreadsheetApp.openById(CONFIG.CRM_ID);
  crm.getSheetByName('INTERACOES').appendRow([
    Utilities.getUuid(), r.leadId, new Date(), 'result_sent', 'email',
    'A Estrada', 'Automático', 'Enviado', 'Sistema', ''
  ]);
}

function makeLeadId_(d) {
  return 'EST-' + Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyyMMdd-HHmmss') + '-' +
    Utilities.getUuid().slice(0, 6).toUpperCase();
}

function safeDate_(v) {
  const d = v ? new Date(v) : new Date();
  return isNaN(d.getTime()) ? new Date() : d;
}

function clean_(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v).trim();
}

function choice_(v) {
  if (v && typeof v === 'object' && !Array.isArray(v)) return clean_(v.choice);
  return clean_(v);
}

function note_(v) {
  if (v && typeof v === 'object' && !Array.isArray(v)) return clean_(v.note);
  return '';
}

function joinParts_(arr) {
  return arr.map(clean_).filter(Boolean).join(' | ');
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function escapeHtml_(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function stripHtml_(s) {
  return String(s || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}
