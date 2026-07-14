/* ============================================================
 * CAPTAGOV v2 — Camada de persistência (IndexedDB via Dexie)
 * ------------------------------------------------------------
 * ANTES: um único registro `estado` continha um JSON gigante com
 * TODOS os convênios, emendas e anexos (dataURL) juntos. Qualquer
 * alteração (até digitar uma letra num campo) regravava o blob
 * inteiro no banco.
 *
 * AGORA: cada convênio e cada emenda é um registro independente
 * numa tabela própria. Salvar um convênio só regrava aquele
 * registro — não a base inteira. Os anexos continuam exatamente
 * como antes: dataURL embutido dentro do próprio registro do
 * convênio/emenda (nível local, sem upload pra nuvem/servidor).
 *
 * Dados antigos (formato v1/v2 em blob único, ou v1 em localStorage)
 * são migrados automaticamente na primeira abertura.
 * ============================================================ */

const DB_NAME = 'captagov_db_v3';
const BLOB_STORAGE_KEY = 'captagov_v2'; // chave usada no formato antigo (blob único)

export const db = new window.Dexie(DB_NAME);
db.version(1).stores({
  convenios: 'id',
  emendas: 'id',
  meta: 'chave', // protocoloSeq, convenioAtualId, etc. — pares chave/valor simples
});
db.version(2).stores({
  convenios: 'id',
  emendas: 'id',
  meta: 'chave',
  instituicoes: 'id',
});
db.version(3).stores({
  convenios: 'id',
  emendas: 'id',
  meta: 'chave',
  instituicoes: 'id',
  proponentes: 'id',
});

let _saveTimersConvenio = new Map(); // debounce por-registro, não mais global
let _saveTimerEmenda = new Map();
let _saveTimerMeta = null;

export function salvarConvenioDb(convenio) {
  if (!convenio || !convenio.id) return;
  const timers = _saveTimersConvenio;
  if (timers.has(convenio.id)) clearTimeout(timers.get(convenio.id));
  const t = setTimeout(() => {
    db.convenios.put(convenio).catch(e => console.error('Erro ao salvar convênio no IndexedDB:', e));
    timers.delete(convenio.id);
  }, 300);
  timers.set(convenio.id, t);
}

export async function removerConvenioDb(id) {
  await db.convenios.delete(id);
}

export function salvarEmendaDb(emenda) {
  if (!emenda || !emenda.id) return;
  const timers = _saveTimerEmenda;
  if (timers.has(emenda.id)) clearTimeout(timers.get(emenda.id));
  const t = setTimeout(() => {
    db.emendas.put(emenda).catch(e => console.error('Erro ao salvar emenda no IndexedDB:', e));
    timers.delete(emenda.id);
  }, 300);
  timers.set(emenda.id, t);
}

export async function removerEmendaDb(id) {
  await db.emendas.delete(id);
}

let _saveTimersInstituicao = new Map();

export function salvarInstituicaoDb(instituicao) {
  if (!instituicao || !instituicao.id) return;
  const timers = _saveTimersInstituicao;
  if (timers.has(instituicao.id)) clearTimeout(timers.get(instituicao.id));
  const t = setTimeout(() => {
    db.instituicoes.put(instituicao).catch(e => console.error('Erro ao salvar instituição no IndexedDB:', e));
    timers.delete(instituicao.id);
  }, 300);
  timers.set(instituicao.id, t);
}

export async function removerInstituicaoDb(id) {
  await db.instituicoes.delete(id);
}

let _saveTimersProponente = new Map();

export function salvarProponenteDb(proponente) {
  if (!proponente || !proponente.id) return;
  const timers = _saveTimersProponente;
  if (timers.has(proponente.id)) clearTimeout(timers.get(proponente.id));
  const t = setTimeout(() => {
    db.proponentes.put(proponente).catch(e => console.error('Erro ao salvar proponente no IndexedDB:', e));
    timers.delete(proponente.id);
  }, 300);
  timers.set(proponente.id, t);
}

export async function removerProponenteDb(id) {
  await db.proponentes.delete(id);
}

/** Usado só na importação de backup (substituir tudo) — limpa as tabelas antes de gravar o conteúdo novo. */
export async function limparConveniosEmendasDb() {
  await db.transaction('rw', db.convenios, db.emendas, db.instituicoes, db.proponentes, async () => {
    await db.convenios.clear();
    await db.emendas.clear();
    await db.instituicoes.clear();
    await db.proponentes.clear();
  });
}

export function salvarMetaDb(meta) {
  if (_saveTimerMeta) clearTimeout(_saveTimerMeta);
  _saveTimerMeta = setTimeout(() => {
    db.meta.put({ chave: 'geral', ...meta }).catch(e => console.error('Erro ao salvar metadados no IndexedDB:', e));
  }, 300);
}

/** Carrega tudo do banco pras estruturas em memória. Retorna { convenios, emendas, meta }. */
export async function carregarEstadoDb() {
  await migrarParaTabelas();
  const [convenios, emendas, instituicoes, proponentes, metaRow] = await Promise.all([
    db.convenios.toArray(),
    db.emendas.toArray(),
    db.instituicoes.toArray(),
    db.proponentes.toArray(),
    db.meta.get('geral'),
  ]);
  return {
    convenios,
    emendas,
    instituicoes,
    proponentes,
    convenioAtualId: metaRow?.convenioAtualId || null,
    protocoloSeq: metaRow?.protocoloSeq || 0,
  };
}

/** Migra o blob único antigo (IndexedDB captagov_db_v2 / localStorage) para as tabelas novas. Roda uma única vez. */
async function migrarParaTabelas() {
  const jaTemDados = (await db.meta.get('geral')) || (await db.convenios.count()) > 0;
  if (jaTemDados) return;

  let payload = null;

  // 1) Tenta ler o IndexedDB antigo (captagov_db_v2, tabela "estado")
  try {
    const dbAntigo = new window.Dexie('captagov_db_v2');
    dbAntigo.version(1).stores({ estado: 'id' });
    const registro = await dbAntigo.estado.get(BLOB_STORAGE_KEY);
    if (registro?.payload) payload = registro.payload;
    dbAntigo.close();
  } catch (e) {
    console.warn('Sem base antiga captagov_db_v2 para migrar (normal em instalação nova).', e);
  }

  // 2) Se não achou, tenta localStorage (formatos v1/v2 pré-IndexedDB)
  if (!payload) {
    try {
      const rawV2 = localStorage.getItem('captagov_v2');
      if (rawV2) payload = JSON.parse(rawV2);
    } catch (e) { /* ignora */ }
  }
  if (!payload) {
    try {
      const rawV1 = localStorage.getItem('captagov_v1');
      if (rawV1) {
        const v1 = JSON.parse(rawV1);
        payload = {
          convenios: (v1.convenios || []).map(c => ({
            ...c,
            documentos: {},
            documentosExtras: [],
            docsGeradosIA: [],
            financeiro: { extratos: [], rendimentos: [], autorizacoes: [], usos: [], contratadas: [], pagamentos: [] },
          })),
          convenioAtualId: v1.convenioAtualId || null,
          protocoloSeq: v1.protocoloSeq || 0,
          emendas: [],
        };
      }
    } catch (e) { /* ignora */ }
  }

  if (!payload) {
    // Instalação nova — não há nada pra migrar, só marca a tabela meta como inicializada.
    await db.meta.put({ chave: 'geral', convenioAtualId: null, protocoloSeq: 0 });
    return;
  }

  const convenios = payload.convenios || [];
  const emendas = payload.emendas || [];
  await db.transaction('rw', db.convenios, db.emendas, db.meta, async () => {
    if (convenios.length) await db.convenios.bulkPut(convenios);
    if (emendas.length) await db.emendas.bulkPut(emendas);
    await db.meta.put({
      chave: 'geral',
      convenioAtualId: payload.convenioAtualId || null,
      protocoloSeq: payload.protocoloSeq || 0,
    });
  });

  localStorage.removeItem('captagov_v1');
  localStorage.removeItem('captagov_v2');
}
