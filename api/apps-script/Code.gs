const CONFIG = {
  CRM_ID: '13rx2q2yuPgalTf2JpLR0j60Ot4euuKPLQI39yBpy9LA',
  MATRIX_ID: '12X0aCE0qvVUis7OHeB1r1T_7tv7YVuFeFNVW9myPICo',
  EMAIL_FROM_NAME: 'Paulo Roberto | Psicanálise',
  EMAIL_REPLY_TO: 'pauloroberto.psicanalise@gmail.com',
  WHATSAPP: '5541999314077',
  RESULT_BASE_URL: 'https://psicanalise-sys.github.io/pauloroberto-psicanalista/experiencias/a-estrada/resultado.html',
  VERSION: '2.5-dev',
  ENABLE_INTERPRETIVE_RESULT: true,
  VALIDATION_MODE: true
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
  const base = {
    enabled:false, profile:'', profileReading:'', direction:'',
    tags:[], futureTags:[], blocks:[], stops:[], scores:{}, attention:false,
    validation:CONFIG.VALIDATION_MODE
  };
  if (!CONFIG.ENABLE_INTERPRETIVE_RESULT) return base;

  const matrix = SpreadsheetApp.openById(CONFIG.MATRIX_ID);
  const sheet = matrix.getSheetByName('MATRIZ_RESPOSTAS');
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return base;

  const rows = {};
  for (let i=1;i<values.length;i++) {
    const row=values[i];
    const code=String(row[0]||'').trim();
    const status=String(row[17]||'').trim().toLowerCase();
    const allowed=status==='aprovado' || (CONFIG.VALIDATION_MODE && status==='pendente');
    if (!code || !allowed) continue;
    rows[code]={
      code:code, tag:row[3]||'', signal:row[4]||'',
      dims:{
        clareza:Number(row[5]||0), seguranca:Number(row[6]||0),
        pressao:Number(row[7]||0), abertura:Number(row[8]||0),
        apoio:Number(row[9]||0), risco:Number(row[10]||0),
        energia:Number(row[11]||0), cuidado:Number(row[12]||0),
        futuro:Number(row[13]||0)
      },
      reading:row[14]||'', question:row[15]||'', continuation:row[16]||''
    };
  }

  const codeMap={
    inicio:{'clara-aberta':'Q1-A','estreita':'Q1-B','subida':'Q1-C','varios-caminhos':'Q1-D'},
    terreno:{'pavimentado':'Q2-A','terra-limpa':'Q2-B','pedras':'Q2-C','derrapante':'Q2-D','sujo':'Q2-E','esburacado':'Q2-F'},
    trajeto:{'reto':'Q3-A','curvas':'Q3-B','neblina':'Q3-C','descida-ingreme':'Q3-D'},
    laterais:{'arvores':'Q4-A','montanhas':'Q4-B','abismo':'Q4-C','pantano':'Q4-D','cidade':'Q4-E','deserto':'Q4-F'},
    presencas:{'animais-selvagens':'Q5-A','passaros':'Q5-B','nenhuma':'Q5-C','pessoas':'Q5-D'},
    companhia:{'sozinho':'Q6-A','com-alguem':'Q6-B','com-varias-pessoas':'Q6-C','nao-sei':'Q6-D'},
    ritmo:{'devagar':'Q7-A','correndo':'Q7-B','cuidado':'Q7-C','travado':'Q7-D'},
    reacao:{'paro-observo':'Q8-A','tento-atravessar':'Q8-B','procuro-outro':'Q8-C','espero-ajuda':'Q8-D'}
  };
  const selected=[];
  Object.keys(codeMap).forEach(key=>{
    const raw=key==='trajeto'?choice_(answers[key]):answers[key];
    const code=codeMap[key][raw];
    if(code && rows[code]) selected.push(rows[code]);
  });

  const stopMap={'posto':'Q9-A','restaurante':'Q9-B','hotel':'Q9-C','mirante':'Q9-D','posto-medico':'Q9-E','capela':'Q9-F'};
  const stopRows=[];
  (answers.paradas||[]).forEach(v=>{
    const code=stopMap[v];
    if(code && rows[code]) { selected.push(rows[code]); stopRows.push(rows[code]); }
  });
  if(!selected.length) return base;

  const totals={clareza:0,seguranca:0,pressao:0,abertura:0,apoio:0,risco:0,energia:0,cuidado:0,futuro:0};
  selected.forEach(item=>Object.keys(totals).forEach(k=>totals[k]+=Number(item.dims[k]||0)));
  const scores={};
  Object.keys(totals).forEach(k=>scores[k]=Math.round((totals[k]/selected.length)*100)/100);

  const futureText=String(answers.futuro||'').toLowerCase();
  const futureTags=[];
  const keywords=[
    ['paz','paz'],['leveza','leveza'],['descanso','descanso'],['recomeço','recomeço'],
    ['segurança','segurança'],['vínculo','vínculo'],['sentido','sentido'],['coragem','coragem'],
    ['reconciliação','reconciliação'],['direção','direção'],['clareza','direção'],['decisão','direção']
  ];
  keywords.forEach(x=>{if(futureText.indexOf(x[0])>=0 && futureTags.indexOf(x[1])<0) futureTags.push(x[1]);});

  let profile='Leitura equilibrada';
  let profileReading='Seu percurso reúne sinais diferentes e não concentra toda a experiência em um único eixo. Observe quais partes realmente representam o seu momento.';
  let direction='Nem toda estrada pede uma resposta imediata. Às vezes, perceber melhor o caminho já muda a forma de seguir.';

  // Regras de combinação da matriz, em ordem de prioridade.
  if(scores.pressao>=0.65 && scores.energia<=-0.55){
    profile='Sobrecarga e Travessia';
    profileReading='O percurso sugere esforço prolongado e necessidade de reorganizar a travessia.';
    direction='Nem sempre força significa continuar no mesmo ritmo.';
  } else if(scores.seguranca<=-0.55 && scores.risco>=0.65){
    profile='Instabilidade e Cautela';
    profileReading='O caminho é percebido com instabilidade e necessidade de proteção.';
    direction='Quando o chão parece instável, cuidado pode ser uma forma de preservação.';
  } else if(scores.apoio<=-0.45 && (answers.companhia==='sozinho' || answers.laterais==='deserto' || answers.reacao==='espero-ajuda')){
    profile='Solidão e Necessidade de Apoio';
    profileReading='O percurso sugere que apoio e presença podem estar fazendo falta.';
    direction='Há momentos em que o caminho pesa mais porque tentamos sustentá-lo sozinhos.';
  } else if(scores.clareza<=-0.45 && (answers.inicio==='varios-caminhos' || (answers.paradas||[]).indexOf('mirante')>=0 || choice_(answers.trajeto)==='neblina')){
    profile='Reorganização e Clareza';
    profileReading='O momento parece pedir compreensão e direção antes de velocidade.';
    direction='Talvez este seja um momento de ganhar clareza antes de exigir mais de si.';
  } else if(scores.futuro>=0.5 && (answers.laterais==='arvores' || answers.presencas==='passaros' || (answers.paradas||[]).indexOf('mirante')>=0 || (answers.paradas||[]).indexOf('capela')>=0)){
    profile='Sentido, Respiro e Redirecionamento';
    profileReading='A estrada aponta para busca de reconexão, perspectiva e sentido.';
    direction='Algumas buscas não são apenas por solução, mas por um modo mais inteiro de viver.';
  }

  const alerts=selected.filter(x=>String(x.signal).toLowerCase()==='alerta').length;
  const tags=[...new Set(selected.map(x=>x.tag).filter(Boolean).concat(futureTags))];

  return {
    enabled:true,
    profile:profile,
    profileReading:profileReading,
    direction:direction,
    tags:tags,
    futureTags:futureTags,
    blocks:selected.slice(0,6),
    stops:stopRows,
    scores:scores,
    attention:alerts>=2,
    validation:CONFIG.VALIDATION_MODE
  };
}

function sendResultEmail_(r) {
  const firstName = String(r.contact.nome || '').trim().split(/\s+/)[0] || 'Olá';
  const subject = 'A Estrada — sua devolutiva';

  let body = '<p>Olá, ' + escapeHtml_(firstName) + '.</p>' +
    '<p>Seu percurso em <strong>A Estrada</strong> foi registrado.</p>';

  if (r.analysis.enabled) {
    body += '<p><strong>Leitura predominante: ' + escapeHtml_(r.analysis.profile) + '</strong></p>' +
      '<p>' + escapeHtml_(r.analysis.profileReading || '') + '</p>' +
      '<p>Abaixo estão os principais pontos de reflexão construídos a partir do percurso que você criou.</p>';
    r.analysis.blocks.forEach(b => {
      body += '<div style="margin:18px 0;padding:16px;border-left:3px solid #b59a62;background:#faf7f0">' +
        '<p><strong>' + escapeHtml_(b.reading) + '</strong></p>' +
        '<p>' + escapeHtml_(b.question) + '</p>' +
        '<p>' + escapeHtml_(b.continuation) + '</p></div>';
    });
    if (r.analysis.stops && r.analysis.stops.length) {
      body += '<p><strong>O que suas paradas mostram</strong></p>';
      r.analysis.stops.forEach(b => {
        body += '<p><strong>' + escapeHtml_(b.reading) + '</strong><br>' + escapeHtml_(b.question) + '</p>';
      });
    }
    if (r.answers && r.answers.futuro) {
      body += '<p><strong>Seu amanhã</strong><br>' + escapeHtml_(r.answers.futuro) + '</p>';
    }
    if (r.analysis.attention) {
      body += '<p><strong>Ponto de atenção</strong><br>Alguns elementos do percurso sugerem maior tensão, risco percebido ou necessidade de cuidado. Isso não é diagnóstico; é um convite para observar com mais atenção o que vem pesando no caminho.</p>';
    }
    if (r.analysis.direction) {
      body += '<p><strong>Uma mensagem para continuar:</strong><br>' + escapeHtml_(r.analysis.direction) + '</p>';
    }
    if (r.analysis.tags && r.analysis.tags.length) {
      body += '<p><strong>Temas presentes no percurso:</strong> ' + escapeHtml_(r.analysis.tags.join(', ')) + '</p>';
    }
    if (CONFIG.VALIDATION_MODE) {
      body += '<p style="font-size:12px;color:#8a6d1d"><strong>Observação:</strong> esta versão está em período de validação.</p>';
    }
  } else {
    body += '<p>Nesta fase de homologação, a leitura interpretativa automática permanece desativada até a validação final da matriz por Paulo Roberto. Seus dados e respostas foram registrados para a devolutiva.</p>';
  }

  const resultUrl = CONFIG.RESULT_BASE_URL + '?lead=' + encodeURIComponent(r.leadId);

  const wa = 'https://wa.me/' + CONFIG.WHATSAPP + '?text=' +
    encodeURIComponent('Olá, Dr. Paulo. Fiz A Estrada e gostaria de agendar uma conversa inicial gratuita de 15 minutos para conhecer melhor seu trabalho.');

  body += '<p><strong><a href="' + resultUrl + '">Acessar a página da minha devolutiva</a></strong></p>' +
    '<p style="font-size:13px;color:#667780">Se esta mensagem não estiver na sua Caixa de entrada, procure também em Spam, Lixo eletrônico ou Promoções e, se possível, marque este remetente como confiável.</p>' +
    '<p>Se fizer sentido, você pode agendar uma conversa inicial gratuita de 15 minutos para conhecer mais sobre o trabalho de Paulo Roberto e entender como poderá ser uma experiência de acompanhamento — sem pressão para iniciar atendimento.</p>' +
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
