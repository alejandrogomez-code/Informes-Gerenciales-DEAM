/* =====================================================================
   DEAM SRL · Proyección — Flujo de Caja
   Réplica de la hoja "Presupuesto Mensual" del Presupuesto Financiero.
   Grilla de 12 meses (rodante desde el mes actual). El usuario carga las
   filas editables; los totales, subtotales y saldos encadenados se
   calculan solos con las fórmulas del Excel. Toggle ARS/USD, export e
   import Excel, e impresión PDF a una página (mismo patrón que el resto).

   Datos en Supabase:
     proyeccion_config   (escenario_id PK, dolar_inicial, aumento_dolar,
                          inflacion, iva, pct_costo, pct_pago_ext, pct_nac)
     proyeccion_valores  (escenario_id, concepto_key, mes_offset, monto_ars)
   Los meses NO se guardan como fechas: se derivan del mes actual con
   `mes_offset` 0..11, así la grilla "rueda" sola como en el Excel.
   ===================================================================== */

/* ---------- Constantes del modelo ---------- */
const PY_MESES = 12;                 // cantidad de meses proyectados
const PY_ESCENARIO = 'base';         // único escenario por ahora (extensible)

/* Parámetros por defecto (tomados del Excel · hoja Variables) */
const PY_DEFAULTS = {
  dolar_inicial: 1450,
  aumento_dolar: 0.015,   // Variables!B14
  inflacion:     0.015,   // Variables!B13 (reservado para usos futuros)
  iva:           0.14,    // Variables!B12
  pct_costo:     0.3706,  // Variables!B4  (Costo s/ venta con IVA)
  pct_pago_ext:  0.78,    // Variables!B7  (Pago Exterior s/ costo)
  pct_nac:       0.43,    // Variables!B6  (Nacionalización s/ costo)
};

/* Definición de parámetros editables (fila superior) */
const PY_PARAMS = [
  {key:'dolar_inicial', label:'Dólar inicial',        tipo:'money', hint:'ARS/USD del mes 1'},
  {key:'aumento_dolar', label:'Aumento dólar / mes',  tipo:'pct',   hint:'crece cada mes'},
  {key:'iva',           label:'IVA ventas',           tipo:'pct'},
  {key:'pct_costo',     label:'Costo s/ venta',       tipo:'pct'},
  {key:'pct_pago_ext',  label:'Pago exterior s/ costo',tipo:'pct'},
  {key:'pct_nac',       label:'Nacionaliz. s/ costo', tipo:'pct'},
];

/* ---------- Layout de filas ----------
   tipos:
     param    = fila de parámetros (se renderiza aparte, arriba)
     edit     = fila editable (carga manual por celda)
     calc     = fila calculada (fórmula, no editable)
     sub      = subtotal (Σ ingresos / Σ egresos)
     res      = resultado / saldo
     section  = encabezado de bloque
     collapse = encabezado colapsable (bloque de referencia)
------------------------------------------------------------------ */
const PY_LAYOUT = [
  {t:'section', l:'Parámetros'},
  {t:'edit', key:'ventas_usd',  l:'Proyección Ventas U$S',  fmt:'usd'},
  {t:'edit', key:'dolar',       l:'Proyección Dólar',       fmt:'tc', calcDefault:true},
  {t:'calc', key:'venta_pesos', l:'Venta en Pesos c/ IVA',  f:'= Ventas U$S × Dólar × (1+IVA)'},

  {t:'collapse', l:'Referencia de ventas y costos', id:'ref'},
  {t:'edit', key:'venta_neta_usd', grp:'ref', l:'Venta Neta Actual USD', fmt:'usd', f:'facturado real del mes'},
  {t:'edit', key:'venta_actual',   grp:'ref', l:'Venta Actual $ + IVA',  f:'facturado real del mes'},
  {t:'calc', key:'pendiente',      grp:'ref', l:'Pendiente de Venta $ + IVA', f:'= Venta proyectada − Venta actual'},
  {t:'calc', key:'costo_ventas',   grp:'ref', l:'Costo de ventas total', f:'= Venta en Pesos × % Costo'},
  {t:'calc', key:'comex_est',      grp:'ref', l:'Proveedores Comex (est.)', f:'= Costo ventas × % Pago exterior'},
  {t:'calc', key:'nac_est',        grp:'ref', l:'Nacionalización (est.)', f:'= Costo ventas × % Nacionalización'},

  {t:'section', l:'Ingresos'},
  {t:'edit', key:'i_fci',        l:'FCI'},
  {t:'edit', key:'i_bancos',     l:'Bancos / Bancos USD'},
  {t:'edit', key:'i_cheques',    l:'Cheques en Cartera'},
  {t:'edit', key:'i_cobranzas',  l:'Cobranzas Proyectadas'},
  {t:'edit', key:'i_cob_futura', l:'Cob. Venta Futura'},
  {t:'sub',  key:'total_ing',    l:'TOTAL INGRESOS', f:'= Σ ingresos'},

  {t:'section', l:'Egresos'},
  {t:'edit', key:'e_prov_pp',   l:'Proveedores / PP'},
  {t:'edit', key:'e_sueldos',   l:'Sueldos y Cargas Soc.'},
  {t:'edit', key:'e_comex',     l:'Proveedores Comex'},
  {t:'edit', key:'e_nac',       l:'Nacionalización'},
  {t:'edit', key:'e_chout',     l:'CH-OUT / Tarjetas'},
  {t:'edit', key:'i_prestamos', l:'Préstamos (varios)'},
  {t:'sub',  key:'total_egr',   l:'TOTAL EGRESOS', f:'= Σ egresos'},

  {t:'section', l:'Resultado'},
  {t:'res',  key:'diferencia',   l:'Diferencia del mes', f:'= Ingresos − Egresos'},
  {t:'calc', key:'saldo_inicial',l:'Saldo Inicial', f:'= Saldo acumulado del mes anterior'},
  {t:'res',  key:'saldo_acum',   l:'Saldo Acumulado', f:'= Saldo inicial + Diferencia', strong:true},
];

/* Claves que suman en cada subtotal.
   Nota: i_prestamos conserva su clave histórica (por los datos ya cargados),
   pero ahora suma en Egresos, no en Ingresos. */
const PY_ING_KEYS = ['i_fci','i_bancos','i_cheques','i_cobranzas','i_cob_futura'];
const PY_EGR_KEYS = ['e_prov_pp','e_sueldos','e_comex','e_nac','e_chout','i_prestamos'];

/* Todas las claves editables (para persistir / importar) */
const PY_EDIT_KEYS = PY_LAYOUT.filter(r=>r.t==='edit' && r.key!=='dolar').map(r=>r.key);

/* =====================================================================
   ESTADO
   ===================================================================== */
let pyCfg = {...PY_DEFAULTS};                    // parámetros
let pyVals = {};                                 // { concepto_key: [12 montos ARS] }
let pyMoneda = 'ars';                            // 'ars' | 'usd'
let pyMeses = [];                                // etiquetas ["jul 26", ...]

const PY_LAYOUT_BY_KEY = {}; PY_LAYOUT.forEach(r=>{ if(r.key) PY_LAYOUT_BY_KEY[r.key]=r; });

/* ---------- Etiquetas de meses (rodante desde el mes actual) ---------- */
const PY_MES_ABBR = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
function pyBuildMeses(){
  pyMeses = [];
  const now = new Date();
  let y = now.getFullYear(), m = now.getMonth();      // 0-based
  for(let i=0;i<PY_MESES;i++){
    pyMeses.push(`${PY_MES_ABBR[m]} ${String(y).slice(2)}`);
    m++; if(m>11){ m=0; y++; }
  }
}

/* ---------- Vector vacío ---------- */
const pyZeros = ()=>Array(PY_MESES).fill(0);
function pyGetRow(key){
  if(!pyVals[key]) pyVals[key] = pyZeros();
  return pyVals[key];
}

/* =====================================================================
   CARGA DE DATOS
   ===================================================================== */
async function loadProyeccion(){
  pyBuildMeses();
  if(!db){ pyCfg={...PY_DEFAULTS}; pyVals={}; renderProyeccion(); return; }
  try{
    const [cfg, val] = await Promise.all([
      db.from('proyeccion_config').select('*').eq('escenario_id', PY_ESCENARIO).maybeSingle(),
      db.from('proyeccion_valores').select('*').eq('escenario_id', PY_ESCENARIO),
    ]);
    if(cfg.error) throw cfg.error;
    if(val.error) throw val.error;

    pyCfg = cfg.data ? {
      dolar_inicial:+cfg.data.dolar_inicial, aumento_dolar:+cfg.data.aumento_dolar,
      inflacion:+cfg.data.inflacion, iva:+cfg.data.iva, pct_costo:+cfg.data.pct_costo,
      pct_pago_ext:+cfg.data.pct_pago_ext, pct_nac:+cfg.data.pct_nac,
    } : {...PY_DEFAULTS};
    pyUpdatedAt = cfg.data ? (cfg.data.updated_at||null) : null;

    pyVals = {};
    (val.data||[]).forEach(r=>{
      const k=r.concepto_key, o=+r.mes_offset;
      if(o<0 || o>=PY_MESES) return;
      if(!pyVals[k]) pyVals[k]=pyZeros();
      pyVals[k][o] = +r.monto_ars || 0;
    });
  }catch(e){
    console.warn('proyeccion load', e);
    pyCfg={...PY_DEFAULTS}; pyVals={};
  }
  renderProyeccion();
}

/* =====================================================================
   CÁLCULO (fórmulas del Excel)
   ===================================================================== */
/* Serie de dólar proyectado: mes 0 = dolar_inicial; cada mes crece
   (1 + aumento_dolar) respecto al anterior. Igual que Presupuesto Mensual!B4:R4. */
function pyDolarSerie(){
  const s=[]; let d=pyCfg.dolar_inicial;
  for(let i=0;i<PY_MESES;i++){ s.push(d); d = d + d*pyCfg.aumento_dolar; }
  return s;
}

/* Devuelve, para un mes m, todos los valores (editables + calculados) en ARS. */
function pyComputeMes(m, dolar){
  const g = k => (pyVals[k] ? (+pyVals[k][m]||0) : 0);

  const ventas_usd  = g('ventas_usd');
  const venta_pesos = ventas_usd * dolar * (1 + pyCfg.iva);           // fila 5
  const venta_actual= g('venta_actual');
  const pendiente   = venta_pesos - venta_actual;                    // fila 8
  const costo_ventas= venta_pesos * pyCfg.pct_costo;                 // fila 9
  const comex_est   = costo_ventas * pyCfg.pct_pago_ext;             // fila 10
  const nac_est     = costo_ventas * pyCfg.pct_nac;                  // fila 11

  const total_ing = PY_ING_KEYS.reduce((a,k)=>a+g(k),0);            // fila 26
  const total_egr = PY_EGR_KEYS.reduce((a,k)=>a+g(k),0);            // fila 40
  const diferencia= total_ing - total_egr;                          // fila 42

  return {
    ventas_usd, dolar,
    venta_pesos, venta_neta_usd:g('venta_neta_usd'), venta_actual,
    pendiente, costo_ventas, comex_est, nac_est,
    total_ing, total_egr, diferencia,
    // editables tal cual (para render)
    i_fci:g('i_fci'), i_bancos:g('i_bancos'), i_cheques:g('i_cheques'),
    i_cobranzas:g('i_cobranzas'), i_cob_futura:g('i_cob_futura'), i_prestamos:g('i_prestamos'),
    e_prov_pp:g('e_prov_pp'), e_sueldos:g('e_sueldos'), e_comex:g('e_comex'),
    e_nac:g('e_nac'), e_chout:g('e_chout'),
  };
}

/* Calcula toda la grilla. Devuelve array de objetos por mes (en ARS),
   con saldo_inicial / saldo_acum encadenados (mes 1 arranca en 0 como el Excel). */
function pyComputeAll(){
  const dolar = pyDolarSerie();
  const cols = [];
  let prevSaldo = null;   // null = primer mes sin saldo inicial
  for(let m=0;m<PY_MESES;m++){
    const c = pyComputeMes(m, dolar[m]);
    c.saldo_inicial = (prevSaldo===null) ? null : prevSaldo;      // fila 13
    c.saldo_acum = (prevSaldo===null ? 0 : prevSaldo) + c.diferencia; // fila 44 / 42
    prevSaldo = c.saldo_acum;
    cols.push(c);
  }
  return {cols, dolar};
}

/* =====================================================================
   RENDER
   ===================================================================== */
function pyFmt(v, fmtHint){
  if(v===null || v===undefined || v==='') return '—';
  if(typeof v!=='number' || !isFinite(v)) return '—';
  const neg = v<0;
  let out;
  if(pyMoneda==='usd'){
    // fmtHint 'usd' → ya está en USD (ventas_usd); el resto se convierte fuera
    out = 'US$ '+nf0.format(Math.round(v));
  }else{
    out = '$ '+nf0.format(Math.round(v));
  }
  return out;
}

/* Convierte un monto ARS a la moneda de vista para un mes dado */
function pyToView(vArs, dolarMes, isUsdNative){
  if(vArs===null || vArs===undefined) return null;
  if(pyMoneda==='usd'){
    if(isUsdNative) return vArs;            // ya está en USD (ventas_usd, venta_neta_usd)
    return dolarMes ? vArs / dolarMes : 0;  // ARS → USD con dólar del mes
  }
  if(isUsdNative) return vArs * dolarMes;   // fila USD mostrada en ARS = ×dólar
  return vArs;
}

function renderProyeccion(){
  const {cols, dolar} = pyComputeAll();

  /* --- subtítulo / TC pill --- */
  const sub=document.getElementById('py-sub');
  if(sub) sub.textContent = `Flujo de caja · ${PY_MESES} meses · valores en ${pyMoneda==='usd'?'USD':'ARS ($)'}`;
  pyRenderUpdated();

  /* --- toggle moneda --- */
  document.querySelectorAll('#py-moneda button').forEach(b=>b.classList.toggle('on', b.dataset.moneda===pyMoneda));

  /* --- parámetros --- */
  const pbox=document.getElementById('py-params');
  if(pbox){
    pbox.innerHTML = PY_PARAMS.map(p=>{
      let val;
      if(p.tipo==='pct') val = nf1.format(pyCfg[p.key]*100).replace('.',',');
      else val = nf0.format(pyCfg[p.key]);
      const suf = p.tipo==='pct' ? '%' : '';
      return `<div class="py-param">
        <label title="${p.hint||''}">${p.label}</label>
        <div class="py-param-in">
          <input type="text" inputmode="decimal" autocomplete="off"
            data-pkey="${p.key}" data-ptipo="${p.tipo}" value="${val}"
            onchange="pyParamChange(this)">
          ${suf?`<span>${suf}</span>`:''}
        </div>
      </div>`;
    }).join('');
  }

  /* --- header de meses --- */
  const thead=document.getElementById('py-thead');
  if(thead){
    thead.innerHTML = `<tr><th class="py-sticky">Concepto</th>${
      pyMeses.map(m=>`<th>${m}</th>`).join('')
    }</tr>`;
  }

  /* --- cuerpo --- */
  const tbody=document.getElementById('py-tbody');
  let html='';
  for(const row of PY_LAYOUT){
    if(row.t==='section'){
      html += `<tr class="py-section"><td class="py-sticky" colspan="${PY_MESES+1}">${row.l}</td></tr>`;
      continue;
    }
    if(row.t==='collapse'){
      const open = !pyCollapsed[row.id];
      html += `<tr class="py-collapse" onclick="pyToggle('${row.id}')"><td class="py-sticky" colspan="${PY_MESES+1}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;vertical-align:-2px;transform:rotate(${open?90:0}deg);transition:transform .12s">
          <path d="M9 6l6 6-6 6"/></svg>
        ${row.l} <span class="py-hint-inline">· ${open?'ocultar':'mostrar'}</span></td></tr>`;
      continue;
    }
    if(row.grp && pyCollapsed[row.grp]) continue;

    const isSub = row.t==='sub' || row.t==='res';
    const cls = ['py-row'];
    if(isSub) cls.push('py-sub');
    if(row.strong) cls.push('py-strong');
    if(row.grp) cls.push('py-grp');
    if(row.t==='edit') cls.push('py-edit');

    // label + hint de fórmula
    const fhint = row.f ? `<span class="py-frm">${row.f}</span>` : '';
    let cells='';
    for(let m=0;m<PY_MESES;m++){
      const c = cols[m];
      let vArs = c[row.key];
      const isUsdNative = (row.key==='ventas_usd' || row.key==='venta_neta_usd');
      const vView = pyToView(vArs, dolar[m], isUsdNative);
      const neg = (typeof vView==='number' && vView<0);
      const txt = pyFmt(vView, row.fmt);

      if(row.t==='edit'){
        cells += `<td class="py-cell ${neg?'neg':''}">
          <span class="py-inp" tabindex="0" role="button"
            onclick="pyEditCell('${row.key}',${m})"
            onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();pyEditCell('${row.key}',${m})}"
            data-k="${row.key}" data-m="${m}">${txt}</span></td>`;
      }else{
        cells += `<td class="py-cell ${neg?'neg':''} ${isSub?'py-cell-sub':''}">${txt}</td>`;
      }
    }
    html += `<tr class="${cls.join(' ')}"><td class="py-sticky py-label">${row.l}${fhint}</td>${cells}</tr>`;
  }
  tbody.innerHTML = html;
}

/* estado de bloques colapsables */
const pyCollapsed = {ref:true};
function pyToggle(id){ pyCollapsed[id]=!pyCollapsed[id]; renderProyeccion(); }

/* =====================================================================
   EDICIÓN
   ===================================================================== */
function pySetMoneda(m){ pyMoneda=m; renderProyeccion(); }

/* Cambio de un parámetro */
async function pyParamChange(input){
  const key=input.dataset.pkey, tipo=input.dataset.ptipo;
  let num=parseNum(input.value);
  if(tipo==='pct') num = num/100;
  if(!isFinite(num)) num = PY_DEFAULTS[key];
  pyCfg[key]=num;
  renderProyeccion();
  await pySaveCfg();
}

/* Edición de una celda editable: reemplaza el <span> por un <input> inline */
function pyEditCell(key, m){
  const span = document.querySelector(`.py-inp[data-k="${key}"][data-m="${m}"]`);
  if(!span || span.querySelector('input')) return;
  const arr = pyGetRow(key);
  const dolar = pyDolarSerie();
  const isUsdNative = (key==='ventas_usd' || key==='venta_neta_usd');
  /* Se guarda SIEMPRE en la unidad nativa (ARS, salvo filas USD-nativas).
     La edición respeta la moneda visible: en vista USD editás en USD y se
     reconvierte a ARS al guardar (excepto filas nativas USD). */
  const cur = arr[m] || 0;                       // valor almacenado (nativo)
  const editUsd = (pyMoneda==='usd' && !isUsdNative);
  const shownVal = editUsd ? (dolar[m] ? cur/dolar[m] : 0) : cur;
  const shown = shownVal ? nf0.format(Math.round(shownVal)) : '';
  const td = span.parentElement;
  td.classList.add('editing');
  span.innerHTML = `<input type="text" inputmode="decimal" autocomplete="off"
    value="${shown}" style="width:100%">`;
  const inp = span.querySelector('input');
  inp.focus(); inp.select();
  const commit = async (save)=>{
    if(save){
      let v = parseNum(inp.value);
      if(!isFinite(v)) v = 0;
      if(editUsd) v = v * (dolar[m]||1);          // USD ingresado → ARS almacenado
      arr[m] = v;
      await pySaveCell(key, m, arr[m]);
    }
    td.classList.remove('editing');
    renderProyeccion();
  };
  inp.addEventListener('blur', ()=>commit(true));
  inp.addEventListener('keydown', e=>{
    if(e.key==='Enter'){ e.preventDefault(); commit(true); }
    else if(e.key==='Escape'){ e.preventDefault(); commit(false); }
    else if(e.key==='Tab'){ /* deja que blur guarde y el foco avance */ }
  });
}

/* =====================================================================
   PERSISTENCIA
   ===================================================================== */
/* Marca de última actualización (fecha y hora del último guardado).
   Se guarda en proyeccion_config.updated_at del escenario activo. */
let pyUpdatedAt = null;

async function pyTouch(){
  pyUpdatedAt = new Date().toISOString();
  pyRenderUpdated();                       // refresco inmediato en pantalla
  if(!db) return;
  try{
    const r = await db.from('proyeccion_config')
      .upsert({escenario_id:PY_ESCENARIO, updated_at:pyUpdatedAt}, {onConflict:'escenario_id'});
    if(r.error) throw r.error;
  }catch(e){ console.warn('touch updated_at', e); }
}

/* Formato "12/07/2026 15:21" en horario local */
function pyFmtUpdated(iso){
  if(!iso) return null;
  const d = new Date(iso);
  if(isNaN(d)) return null;
  const p = n => String(n).padStart(2,'0');
  return `${p(d.getDate())}/${p(d.getMonth()+1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/* Pinta la marca en el margen del informe */
function pyRenderUpdated(){
  const el = document.getElementById('py-updated');
  if(!el) return;
  const txt = pyFmtUpdated(pyUpdatedAt);
  el.textContent = txt ? `Última actualización: ${txt}` : 'Sin actualizaciones registradas';
}

async function pySaveCfg(){
  if(!db) return;
  const row = {escenario_id:PY_ESCENARIO, ...pyCfg, updated_at:new Date().toISOString()};
  const r = await db.from('proyeccion_config').upsert(row, {onConflict:'escenario_id'});
  if(r.error) console.warn('save cfg', r.error);
  else { pyUpdatedAt = row.updated_at; pyRenderUpdated(); }
}

async function pySaveCell(key, m, monto){
  if(!db) return;
  const row = {escenario_id:PY_ESCENARIO, concepto_key:key, mes_offset:m, monto_ars:monto};
  const r = await db.from('proyeccion_valores')
    .upsert(row, {onConflict:'escenario_id,concepto_key,mes_offset'});
  if(r.error){ console.warn('save cell', r.error); alert('No se pudo guardar: '+r.error.message); return; }
  await pyTouch();
}

/* Guardado masivo (usado por el import) */
async function pySaveBulk(rows){
  if(!db){ alert('Conectá Supabase para guardar.'); return false; }
  const r = await db.from('proyeccion_valores')
    .upsert(rows, {onConflict:'escenario_id,concepto_key,mes_offset'});
  if(r.error){ alert('No se pudo importar: '+r.error.message); return false; }
  await pyTouch();
  return true;
}

/* =====================================================================
   EXPORT EXCEL
   ===================================================================== */
function exportProyeccion(){
  if(typeof XLSX==='undefined'){ alert('No se pudo cargar la librería de Excel.'); return; }
  const {cols, dolar} = pyComputeAll();
  const monLabel = pyMoneda==='usd' ? 'USD' : 'ARS';

  const aoa = [
    ['DEAM SRL — Proyección · Flujo de Caja'],
    [`Valores en ${monLabel}`, '', `Escenario: ${PY_ESCENARIO}`],
    [],
  ];
  // parámetros
  aoa.push(['Parámetros']);
  PY_PARAMS.forEach(p=>{
    const v = p.tipo==='pct' ? +(pyCfg[p.key]*100).toFixed(2)+'%' : pyCfg[p.key];
    aoa.push([p.label, v]);
  });
  aoa.push([]);
  // encabezado
  aoa.push(['Concepto', ...pyMeses]);
  // filas
  for(const row of PY_LAYOUT){
    if(row.t==='section'){ aoa.push([row.l]); continue; }
    if(row.t==='collapse'){ continue; }
    const isUsdNative = (row.key==='ventas_usd' || row.key==='venta_neta_usd');
    const line=[row.l];
    for(let m=0;m<PY_MESES;m++){
      const vView = pyToView(cols[m][row.key], dolar[m], isUsdNative);
      line.push(vView===null ? '' : Math.round(vView));
    }
    aoa.push(line);
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [{wch:28}, ...Array(PY_MESES).fill({wch:15})];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Proyección');
  XLSX.writeFile(wb, 'Proyeccion_Flujo_de_Caja.xlsx');
}

/* =====================================================================
   IMPORT EXCEL
   Lee un archivo con el mismo formato del export. Sólo toma las filas
   EDITABLES (las calculadas se recalculan solas). Los valores se cargan
   siempre como ARS: si la planilla está en USD, se reconvierten con el
   dólar proyectado de cada mes.
   ===================================================================== */
function pyTriggerImport(){ document.getElementById('py-file').click(); }

function pyOnFile(inputEl){
  const file = inputEl.files && inputEl.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = async e=>{
    try{
      const data = new Uint8Array(e.target.result);
      const wb = XLSX.read(data, {type:'array'});
      const ws = wb.Sheets[wb.SheetNames[0]];
      const aoa = XLSX.utils.sheet_to_json(ws, {header:1, raw:true, defval:null});
      await pyImportAoa(aoa);
    }catch(err){
      console.warn('import', err);
      alert('No se pudo leer el archivo. Verificá que sea un Excel exportado por este informe.');
    }finally{
      inputEl.value='';
    }
  };
  reader.readAsArrayBuffer(file);
}

/* Mapa etiqueta→key (normalizado) para reconocer filas del archivo */
const PY_LABEL_TO_KEY = {};
PY_LAYOUT.forEach(r=>{ if(r.t==='edit') PY_LABEL_TO_KEY[pyNorm(r.l)] = r.key; });
function pyNorm(s){
  return String(s||'').toLowerCase().trim()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')   // sin acentos
    .replace(/\s+/g,' ');
}

async function pyImportAoa(aoa){
  // detectar moneda del archivo y el dólar en uso
  let fileUsd = false;
  for(const r of aoa.slice(0,6)){
    const txt = (r||[]).map(x=>pyNorm(x)).join(' ');
    if(txt.includes('valores en usd')) fileUsd=true;
    if(txt.includes('valores en ars')) fileUsd=false;
  }
  const {dolar} = pyComputeAll();

  // filas editables reconocidas
  const rows=[];
  let count=0, matched=0;
  for(const r of aoa){
    if(!r || r.length<2) continue;
    const key = PY_LABEL_TO_KEY[pyNorm(r[0])];
    if(!key) continue;
    matched++;
    const isUsdNative = (key==='ventas_usd' || key==='venta_neta_usd');
    for(let m=0;m<PY_MESES;m++){
      const cell = r[m+1];
      if(cell===null || cell===undefined || cell==='') continue;
      let vArs = parseNum(cell);
      if(!isFinite(vArs)) continue;
      // reconvertir a ARS si hace falta
      if(fileUsd && !isUsdNative) vArs = vArs * (dolar[m]||1);
      else if(!fileUsd && isUsdNative) vArs = vArs / (dolar[m]||1);
      // (ambos nativos-USD se guardan en su unidad original: ventas_usd es USD)
      rows.push({escenario_id:PY_ESCENARIO, concepto_key:key, mes_offset:m,
                 monto_ars: Math.round(vArs*100)/100});
      count++;
    }
  }
  if(matched===0){
    alert('No se reconoció ninguna fila del informe en el archivo. Exportá primero desde este informe para ver el formato esperado.');
    return;
  }
  if(!confirm(`Se importarán ${count} valores en ${matched} filas editables. Los datos existentes de esas celdas se sobrescriben. ¿Continuar?`)) return;

  // aplicar en memoria
  rows.forEach(r=>{
    if(!pyVals[r.concepto_key]) pyVals[r.concepto_key]=pyZeros();
    pyVals[r.concepto_key][r.mes_offset]=r.monto_ars;
  });

  const ok = db ? await pySaveBulk(rows) : true;
  renderProyeccion();
  if(ok) alert('Importación completada.');
}

/* =====================================================================
   NAV / INIT
   ===================================================================== */
window.pySetMoneda=pySetMoneda; window.pyToggle=pyToggle; window.pyEditCell=pyEditCell;
window.pyParamChange=pyParamChange; window.exportProyeccion=exportProyeccion;
window.pyTriggerImport=pyTriggerImport; window.pyOnFile=pyOnFile;

/* Cargar cuando app.js ya definió `db` (mismo patrón que gestion.js) */
setTimeout(loadProyeccion, 60);
