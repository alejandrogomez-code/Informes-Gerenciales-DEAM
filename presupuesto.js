/* =====================================================================
   DEAM SRL · Presupuesto (Seguimiento Presupuestario)
   Reescritura a vanilla JS de la app React de Presupuesto, integrada al
   patrón de Informes Gerenciales. Alcance: Grilla mensual, Comparación
   vs referencia y Gráficos. (Sin login por roles, sin Configuración,
   sin Análisis con IA — se dejaron fuera a pedido.)

   Ejercicio fiscal: abril → marzo. order_index 1..12 (1=Abril, 12=Marzo).

   Tablas Supabase (mismas que la app original):
     fiscal_years   (id, name, start_year, is_reference, ...)
     months         (id, fiscal_year_id, month_number, month_name,
                     calendar_year, order_index, usd_rate)
     categories     (id, name, type, order_index)   type: ingreso|egreso|impuesto|resultado
     subcategories  (id, category_id, name, active)
     monthly_values (fiscal_year_id, month_id, category_id, subcategory_id, amount)
     reference_values (fiscal_year_id, category_id, accumulated, average, pct_sales)
   ===================================================================== */

/* ---------- Categorías calculadas (fórmulas del Estado de Resultados) ---------- */
const PR_SUB3_PARTS = ["Sueldo y Cargas Sociales","Gastos de Personal","Honorarios","Impuestos",
  "Gastos Bancarios","Intereses pagados","Gastos de oficina","Servicios","Sistemas",
  "Viajes y Viáticos","Marketing","Gastos de Bienes de Uso","Amortizaciones","Inflación","Otros gastos operativos"];
const PR_TAX_PARTS = ["Impuestos a las ganancias","Percepción Ganancia aduana","Anticipo Impuesto a las ganancias",
  "Imp. créditos y débitos","Percepción Ganancias","Retención Impuestos a las ganancias"];
const PR_FORMULAS = {
  "Subtotal 1": M => M("Costo de Mercadería Vendida")+M("Costo de Mercadería Vendida Indirecta")+M("Gastos de Ingeniería")+M("Gastos de comercialización"),
  "Utilidad Bruta": M => M("Total de Ventas")-M("Subtotal 1"),
  "Subtotal 2": M => M("Total de otros ingresos")+M("Total Resultado por Tenencia"),
  "Subtotal 3": M => PR_SUB3_PARTS.reduce((t,n)=>t+M(n),0),
  "Total de Utilidad Neta": M => M("Utilidad Bruta")+M("Subtotal 2")-M("Subtotal 3"),
  "Total de Impuestos a las ganancias": M => PR_TAX_PARTS.reduce((t,n)=>t+M(n),0),
  "Resultado después del impuesto": M => M("Total de Utilidad Neta")+M("Total de Impuestos a las ganancias"),
};
const prIsCalc = name => Object.prototype.hasOwnProperty.call(PR_FORMULAS, name);
const PR_HILITE = {
  "Total de Ventas":"hi-key","Subtotal 1":"hi-sub","Utilidad Bruta":"hi-key",
  "Subtotal 2":"hi-sub","Subtotal 3":"hi-sub","Total de Utilidad Neta":"hi-key",
  "Total de Impuestos a las ganancias":"hi-sub","Resultado después del impuesto":"hi-key",
};
const PR_TYPE_COLOR = { ingreso:"#017E84", egreso:"#9a6b00", impuesto:"#7c3aed", resultado:"#4A2C40" };

/* ---------------------------------------------------------------------
   PUENTE Informe de Gestión → Presupuesto (ejercicio actual)
   Cada período de Gestión (gestion_periodos) tiene una fecha (mes del
   informe) y valores por cuenta contable. Acá se agrupan esas cuentas en
   las categorías del Presupuesto y se vuelca cada período al mes que le
   corresponde del ejercicio actual (2026/2027), sobrescribiendo siempre.
   Impuestos quedan fuera. Amortizaciones e Inflación se mapean a las
   categorías nuevas homónimas.
   El mapeo es por CLAVE de categoría de Gestión (G_CATEGORIAS[].key) →
   NOMBRE de categoría de Presupuesto. Las cuentas de cada categoría de
   Gestión están en G_CAT_BY_KEY (definido en gestion.js).
--------------------------------------------------------------------- */
const PR_GESTION_MAP = {
  ventas:           "Total de Ventas",
  cmv:              "Costo de Mercadería Vendida",
  cmv_ind:          "Costo de Mercadería Vendida Indirecta",
  ingenieria:       "Gastos de Ingeniería",
  comercializacion: "Gastos de comercialización",
  otros_ingresos:   "Total de otros ingresos",
  rxt:              "Total Resultado por Tenencia",
  sueldos:          "Sueldo y Cargas Sociales",
  gastos_personal:  "Gastos de Personal",
  honorarios:       "Honorarios",
  impuestos:        "Impuestos",
  gastos_bancarios: "Gastos Bancarios",
  intereses:        "Intereses pagados",
  gastos_oficina:   "Gastos de oficina",
  servicios:        "Servicios",
  sistemas:         "Sistemas",
  viajes:           "Viajes y Viáticos",
  marketing:        "Marketing",
  bienes_uso:       "Gastos de Bienes de Uso",
  amortizaciones:   "Amortizaciones",
  inflacion:        "Inflación",
  otros_gastos_op:  "Otros gastos operativos",
  // 'tax'/impuestos a las ganancias: fuera del volcado (a pedido).
};

/* Suma las cuentas de una categoría de Gestión a partir de su objeto de
   valores {cuenta:monto}. Reutiliza G_CAT_BY_KEY de gestion.js. */
function prGestionCatTotal(gkey, valores){
  const cat = (typeof G_CAT_BY_KEY!=='undefined') ? G_CAT_BY_KEY[gkey] : null;
  if(!cat) return 0;
  return cat.cuentas.reduce((a,x)=> a + (+valores[x.c]||0), 0);
}

/* Evaluar un valor por nombre resolviendo fórmulas recursivamente. */
function prEval(name, getLeaf, memo){
  if(memo && name in memo) return memo[name];
  const f = PR_FORMULAS[name];
  const v = f ? f(n=>prEval(n, getLeaf, memo)) : (getLeaf(name)||0);
  if(memo) memo[name]=v;
  return v;
}

/* Series de resultado para gráficos */
const PR_METRICS3 = [
  { name:"Utilidad Bruta",                 label:"Utilidad Bruta",       color:"#1f6feb" },
  { name:"Total de Utilidad Neta",         label:"Utilidad Neta",        color:"#017E84" },
  { name:"Resultado después del impuesto", label:"Resultado desp. imp.", color:"#7c3aed" },
];

/* Regresión lineal simple sobre [{x,y}] → {m,b} */
function prLinreg(pts){
  const n=pts.length; if(n<2) return null;
  let sx=0,sy=0,sxy=0,sxx=0;
  pts.forEach(p=>{ sx+=p.x; sy+=p.y; sxy+=p.x*p.y; sxx+=p.x*p.x; });
  const d=n*sxx-sx*sx; if(d===0) return null;
  const m=(n*sxy-sx*sy)/d; return { m, b:(sy-m*sx)/n };
}

/* =====================================================================
   ESTADO
   ===================================================================== */
const PR = {
  loaded:false,
  fiscalYears:[], months:[], categories:[], subcategories:[],
  values:[], referenceValues:[],
  currentFyId:null, refFyId:null,
  order:1,                    // mes seleccionado (order_index) para comparación
  currentFyGrid:null,         // ejercicio elegido en la grilla
  view:'grid',                // grid | compare | graphs
  currency:'ars',             // ars | usd
  // comparación
  metricActual:'acum',        // mes|acum|prom|pctMes|pctAcum
  metricRef:'acum',           // acum|prom|pct
  rowFilter:'all',            // all|key|ingreso|egreso|impuesto
  // grilla
  gridDirty:{},               // { "mId::cId::sId": rawString }
  tcDirty:{},                 // { "mId": rawString } — TC de cierre pendiente de persistir
  // gráficos
  gMode:'all', gPick:PR_METRICS3[0].name, gAcum:false,
};

/* ---------- Índices auxiliares ---------- */
function prByName(){ const m={}; PR.categories.forEach(c=>m[c.name]=c); return m; }
function prMonthsOf(fyId){ return PR.months.filter(m=>m.fiscal_year_id===fyId).sort((a,b)=>a.order_index-b.order_index); }
function prMonthId(fyId, ord){ const m=PR.months.find(x=>x.fiscal_year_id===fyId && x.order_index===ord); return m?m.id:null; }

/* Suma cargada por mes+categoría (todas las subcategorías + directo) */
let _prSumMC = {};
function prRebuildSum(){
  _prSumMC = {};
  for(const v of PR.values){
    const k = v.month_id+'|'+v.category_id;
    _prSumMC[k] = (_prSumMC[k]||0) + Number(v.amount||0);
  }
}
function prCatMonth(fyId, catId, ord){
  const mid = prMonthId(fyId, ord); if(!mid) return 0;
  return _prSumMC[mid+'|'+catId] || 0;
}
function prCatAccum(fyId, catId, ord){ let t=0; for(let o=1;o<=ord;o++) t+=prCatMonth(fyId,catId,o); return t; }

/* Valores con fórmulas */
function prValMonth(fyId, name, ord){
  const bn=prByName();
  return prEval(name, n=>{ const c=bn[n]; return c?prCatMonth(fyId,c.id,ord):0; }, {});
}
function prValAccum(fyId, name, ord){
  const bn=prByName();
  return prEval(name, n=>{ const c=bn[n]; return c?prCatAccum(fyId,c.id,ord):0; }, {});
}

/* ---------- Dólar por mes (usd_rate) ---------- */
function prMonthRate(fyId, ord){
  const m=PR.months.find(x=>x.fiscal_year_id===fyId && x.order_index===ord);
  return (m && m.usd_rate) ? Number(m.usd_rate) : null;
}
function prAvgRate(fyId){
  const rs=PR.months.filter(m=>m.fiscal_year_id===fyId && m.usd_rate).map(m=>Number(m.usd_rate));
  return rs.length ? rs.reduce((a,b)=>a+b,0)/rs.length : null;
}
function prInvRate(fyId, ord){
  const r = prMonthRate(fyId,ord) || prAvgRate(fyId);
  return (r && r>0) ? 1/r : null;
}
const prIsUsd = ()=> PR.currency==='usd';

/* Valor mensual/acumulado en la moneda elegida */
function prCMonth(fyId,name,ord){
  const p=prValMonth(fyId,name,ord);
  if(!prIsUsd()) return p;
  const k=prInvRate(fyId,ord); return k!=null?p*k:0;
}
function prCAccum(fyId,name,ord){
  if(!prIsUsd()) return prValAccum(fyId,name,ord);
  let t=0; for(let o=1;o<=ord;o++){ const k=prInvRate(fyId,o); if(k!=null) t+=prValMonth(fyId,name,o)*k; } return t;
}

/* ---------- Referencia fija por categoría ---------- */
function prRefMap(){
  const m={};
  for(const r of PR.referenceValues){ if(r.fiscal_year_id===PR.refFyId) m[r.category_id]=r; }
  return m;
}
function prRefAcumVal(name){
  const bn=prByName(), rm=prRefMap();
  return prEval(name, n=>{ const id=bn[n]?bn[n].id:null; const r=id?rm[id]:null; return r?Number(r.accumulated||0):0; }, {});
}
function prRefPromVal(name){
  /* Promedio de referencia = acumulado ÷ 12 (coherente con la vista
     Referencia 25/26, donde sólo se carga el acumulado). */
  return prRefAcumVal(name)/12;
}
function prRefPct(name){
  const ventas=prRefAcumVal("Total de Ventas");
  if(prIsCalc(name)) return ventas!==0 ? (prRefAcumVal(name)/ventas)*100 : null;
  const bn=prByName(), rm=prRefMap();
  const id=bn[name]?bn[name].id:null; const r=id?rm[id]:null;
  if(r && r.pct_sales!=null) return Number(r.pct_sales);
  return ventas!==0 ? (prRefAcumVal(name)/ventas)*100 : null;
}
/* TC único del ejercicio de referencia: se guarda en el usd_rate del
   último mes (order_index 12 = marzo). Representa el cierre de ejercicio
   (ej. 31/03/2026) con el que se convierte todo el acumulado a USD. */
function prRefRate(){
  const fy=prRefFy(); if(!fy) return null;
  const m=PR.months.find(x=>x.fiscal_year_id===fy.id && x.order_index===12);
  return (m && m.usd_rate) ? Number(m.usd_rate) : null;
}
function prCRefAcum(name){ const v=prRefAcumVal(name); if(!prIsUsd()) return v; const a=prRefRate(); return a?v/a:0; }
function prCRefProm(name){ const v=prRefPromVal(name); if(!prIsUsd()) return v; const a=prRefRate(); return a?v/a:0; }

/* ---------- Formato ---------- */
const prMoney = (n,usd)=> (n==null||isNaN(n)||!isFinite(n)) ? '—' : (usd?fmtUSD(n):fmtARS(n));
const prPct = n => (n==null||isNaN(n)||!isFinite(n)) ? '—' : nf1.format(n).replace('.',',')+'%';
function prCompact(v,usd){ const a=Math.abs(v),s=usd?'US$':'$';
  if(a>=1e9) return s+nf1.format(v/1e9)+'MM';
  if(a>=1e6) return s+nf1.format(v/1e6)+'M';
  if(a>=1e3) return s+nf0.format(v/1e3)+'k';
  return s+nf0.format(v); }

/* =====================================================================
   CARGA
   ===================================================================== */
async function loadPresupuesto(){
  if(!db){ PR.loaded=true; renderPresupuesto(); return; }
  try{
    const [fy,mo,cat,sub,val,ref] = await Promise.all([
      db.from('fiscal_years').select('*').order('start_year'),
      db.from('months').select('*'),
      db.from('categories').select('*').order('order_index'),
      db.from('subcategories').select('*').eq('active',true).order('created_at'),
      db.from('monthly_values').select('*'),
      db.from('reference_values').select('*'),
    ]);
    for(const r of [fy,mo,cat,sub,val,ref]) if(r.error) throw r.error;
    PR.fiscalYears=fy.data||[]; PR.months=mo.data||[]; PR.categories=cat.data||[];
    PR.subcategories=sub.data||[]; PR.values=val.data||[]; PR.referenceValues=ref.data||[];

    const cur = PR.fiscalYears.find(f=>!f.is_reference);
    const rf  = PR.fiscalYears.find(f=>f.is_reference);
    PR.currentFyId = PR.currentFyId || (cur?cur.id:null);
    PR.refFyId     = PR.refFyId     || (rf?rf.id:null);
    PR.currentFyGrid = PR.currentFyGrid || PR.currentFyId;

    // mes por defecto: último con datos, si no 1 (Abril)
    const mc = prMonthsOf(PR.currentFyId);
    const withData = mc.filter(m=>PR.values.some(v=>v.month_id===m.id)).sort((a,b)=>b.order_index-a.order_index);
    PR.order = withData.length ? withData[0].order_index : 1;

    prRebuildSum();
  }catch(e){
    console.warn('presupuesto load', e);
  }
  PR.loaded=true;
  renderPresupuesto();
}

/* =====================================================================
   RENDER PRINCIPAL (router interno de sub-vistas)
   ===================================================================== */
function renderPresupuesto(){
  renderUpdated('presupuesto');
  const sub=document.getElementById('pr-sub');
  const fyName = PR.fiscalYears.find(f=>f.id===PR.currentFyId); 
  if(sub) sub.textContent = 'Seguimiento presupuestario · Ejercicio abril–marzo';

  // tabs
  document.querySelectorAll('#pr-tabs button').forEach(b=>b.classList.toggle('on', b.dataset.tab===PR.view));
  // toggle de moneda del panel superior
  const ca=document.getElementById('pr-cur-ars'), cu=document.getElementById('pr-cur-usd');
  if(ca&&cu){ ca.classList.toggle('on',PR.currency==='ars'); cu.classList.toggle('on',PR.currency==='usd'); }

  const host=document.getElementById('pr-host');
  if(!PR.loaded){ host.innerHTML='<div class="placeholder"><h2>Cargando…</h2></div>'; return; }
  if(!db || PR.categories.length===0){
    host.innerHTML='<div class="placeholder"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 3v18h18"/><path d="M7 14l3-3 3 3 5-6"/></svg><h2>Sin datos de presupuesto</h2><p>Ejecutá <b>presupuesto_schema.sql</b> en Supabase para crear las tablas, categorías y el ejercicio, y luego cargá valores.</p></div>';
    return;
  }

  if(PR.view==='grid')      prRenderGrid(host);
  else if(PR.view==='ref')  prRenderReference(host);
  else if(PR.view==='compare') prRenderCompare(host);
  else if(PR.view==='graphs')  prRenderGraphs(host);
}

function prSetView(v){ PR.view=v; renderPresupuesto(); }
function prSetCurrency(c){ PR.currency=c; renderPresupuesto(); }

/* =====================================================================
   VISTA 1 · GRILLA MENSUAL
   ===================================================================== */
function prRenderGrid(host){
  const fyId = PR.currentFyGrid || PR.currentFyId;
  const mc = prMonthsOf(fyId);
  const bn = prByName();
  const catSubs = cId => PR.subcategories.filter(s=>s.category_id===cId);

  // celda cargada (con dirty override)
  const cellRaw = (mId,cId,sId)=>{
    const k=`${mId}::${cId}::${sId||''}`;
    if(k in PR.gridDirty) return PR.gridDirty[k];
    const v=PR.values.find(x=>x.month_id===mId && x.category_id===cId && (x.subcategory_id||null)===(sId||null));
    return v && v.amount!=null ? String(v.amount) : '';
  };
  const catTotalLive = (cId,mId)=>{
    let t=0;
    catSubs(cId).forEach(s=>{ const v=parseNum(cellRaw(mId,cId,s.id)); if(v) t+=v; });
    const d=parseNum(cellRaw(mId,cId,'')); if(d) t+=d;
    return t;
  };
  const valTotalLive = (name,mId)=> prEval(name, n=>{ const c=bn[n]; return c?catTotalLive(c.id,mId):0; }, {});
  const accumName = name => mc.reduce((t,m)=>t+valTotalLive(name,m.id),0);
  const subAccum = (cId,sId)=> mc.reduce((t,m)=>{const v=parseNum(cellRaw(m.id,cId,sId)); return t+(v||0);},0);
  const ventasAccum = accumName("Total de Ventas");
  const dirtyCount = Object.keys(PR.gridDirty).length;

  /* --- Para el PDF: detectar meses con datos y ocultar los vacíos sobrantes ---
     Un mes "tiene datos" si alguna categoría cargada, subcategoría o su TC
     tienen valor. En impresión mostramos los meses con datos + los 2 siguientes,
     y ocultamos el resto (columnas todas en cero) para que no se haga tan ancho.
     En pantalla se ven todos: esto solo afecta al PDF. */
  const monthHasData = m => {
    // TC del mes
    const tc = (m.id in PR.tcDirty) ? PR.tcDirty[m.id] : (m.usd_rate!=null?String(m.usd_rate):'');
    if(parseNum(tc)) return true;
    // alguna categoría (directa) o subcategoría con valor
    for(const cat of PR.categories){
      if(prIsCalc(cat.name)) continue;
      const subs = catSubs(cat.id);
      if(subs.length){
        if(subs.some(s=>parseNum(cellRaw(m.id,cat.id,s.id)))) return true;
      }else{
        if(parseNum(cellRaw(m.id,cat.id,''))) return true;
      }
    }
    return false;
  };
  let lastDataIdx = -1;
  mc.forEach((m,i)=>{ if(monthHasData(m)) lastDataIdx = i; });
  // índice hasta el que mostramos en print: último con datos + 2 meses
  const printCutIdx = lastDataIdx < 0 ? mc.length-1 : Math.min(mc.length-1, lastDataIdx + 2);
  // clase para marcar columnas de meses a ocultar en impresión
  const mHideClass = i => (i > printCutIdx ? ' pr-mcol-hide' : '');

  const fyOptions = PR.fiscalYears.map(f=>`<option value="${f.id}" ${f.id===fyId?'selected':''}>${f.name}${f.is_reference?' (ref.)':''}</option>`).join('');
  const isCur = !(PR.fiscalYears.find(f=>f.id===fyId)||{}).is_reference;
  const syncBtn = isCur ? `<button class="btn gray" onclick="prSyncNow()" title="Traer los valores del Informe de Gestión para este ejercicio"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M4 4v6h6M20 20v-6h-6"/><path d="M20 8a8 8 0 0 0-14-3M4 16a8 8 0 0 0 14 3"/></svg>Sincronizar desde Gestión</button>` : '';

  let rows='';
  for(const cat of PR.categories){
    const subs=catSubs(cat.id), hasSubs=subs.length>0, calc=prIsCalc(cat.name);
    const acum=accumName(cat.name);
    const mLoaded = calc
      ? mc.filter(m=>PR.categories.some(c=>catTotalLive(c.id,m.id)!==0)).length
      : mc.filter(m=> hasSubs ? subs.some(s=>cellRaw(m.id,cat.id,s.id)!=='') : cellRaw(m.id,cat.id,'')!=='').length;
    const hi=PR_HILITE[cat.name]||'';
    const bar=`<span class="pr-typebar" style="background:${PR_TYPE_COLOR[cat.type]||'#999'}"></span>`;
    const badge = calc?'<span class="pr-badge">calc</span>':'';
    const addBtn = (!calc)?`<button class="pr-mini" title="Agregar subcategoría" onclick="prAddSub('${cat.id}','${(cat.name||'').replace(/'/g,"\\'")}')">+ sub</button>`:'';

    const usd = prIsUsd();
    const tcOf = mId => { const m=PR.months.find(x=>x.id===mId); return (m&&m.usd_rate)?Number(m.usd_rate):null; };
    const conv = (v,mId)=>{ if(!usd) return v; const tc=tcOf(mId); return tc?v/tc:null; };

    let cells='';
    for(let mi=0; mi<mc.length; mi++){
      const m = mc[mi];
      const hc = mHideClass(mi);
      if(calc || hasSubs){
        const base = calc?valTotalLive(cat.name,m.id):catTotalLive(cat.id,m.id);
        const shown = conv(base,m.id);
        cells += `<td class="pr-num${hc}"><span class="pr-cattot">${shown==null?'—':prMoney(shown,usd)}</span></td>`;
      }else if(usd){
        // en dólares: mostrar convertido, no editable (la carga es en pesos)
        const base=parseNum(cellRaw(m.id,cat.id,''));
        const shown=conv(base,m.id);
        cells += `<td class="pr-num${hc}"><span class="pr-cattot">${(base&&shown!=null)?prMoney(shown,true):(base?'—':'')}</span></td>`;
      }else{
        const raw=cellRaw(m.id,cat.id,'');
        cells += `<td class="pr-num${hc}"><input class="pr-cell" inputmode="decimal" autocomplete="off" placeholder="$ 0"
          value="${raw?nf0.format(parseNum(raw)):''}"
          onfocus="prCellFocus(this)" onblur="prCellBlur(this)"
          data-m="${m.id}" data-c="${cat.id}" data-s=""></td>`;
      }
    }
    // acumulado / promedio en la moneda elegida (USD = suma de cada mes a su TC)
    const acumShown = usd ? mc.reduce((t,m)=>{const c=conv(calc?valTotalLive(cat.name,m.id):catTotalLive(cat.id,m.id),m.id); return t+(c||0);},0) : acum;
    const promShown = mLoaded>0 ? acumShown/mLoaded : 0;
    rows += `<tr class="pr-catrow ${hi}"><td class="left pr-sticky"><div class="pr-catcell">${bar}<span class="pr-catname ${hi==='hi-key'?'strong':''}">${cat.name}</span>${badge}${addBtn}</div></td>${cells}
      <td class="pr-num pr-sum">${prMoney(acumShown,usd)}</td>
      <td class="pr-num pr-sum">${prMoney(promShown,usd)}</td>
      <td class="pr-num pr-sum pct">${prPct(ventasAccum!==0?(acum/ventasAccum)*100:null)}</td></tr>`;

    if(!calc){
      for(const s of subs){
        let scells='';
        for(let mi=0; mi<mc.length; mi++){
          const m = mc[mi];
          const hc = mHideClass(mi);
          if(usd){
            const base=parseNum(cellRaw(m.id,cat.id,s.id));
            const shown=conv(base,m.id);
            scells += `<td class="pr-num${hc}"><span class="pr-cattot">${(base&&shown!=null)?prMoney(shown,true):(base?'—':'')}</span></td>`;
          }else{
            const raw=cellRaw(m.id,cat.id,s.id);
            scells += `<td class="pr-num${hc}"><input class="pr-cell" inputmode="decimal" autocomplete="off" placeholder="$ 0"
              value="${raw?nf0.format(parseNum(raw)):''}"
              onfocus="prCellFocus(this)" onblur="prCellBlur(this)"
              data-m="${m.id}" data-c="${cat.id}" data-s="${s.id}"></td>`;
          }
        }
        const subAcumShown = usd ? mc.reduce((t,m)=>{const c=conv(parseNum(cellRaw(m.id,cat.id,s.id)),m.id); return t+(c||0);},0) : subAccum(cat.id,s.id);
        rows += `<tr class="pr-subrow"><td class="left pr-sticky"><span class="pr-subname">↳ ${s.name}</span></td>${scells}
          <td class="pr-num pr-sum">${prMoney(subAcumShown,usd)}</td><td class="pr-num pr-sum"></td><td class="pr-num pr-sum"></td></tr>`;
      }
    }
  }

  // Fila de tipo de cambio (cierre) por mes — persiste en months.usd_rate
  const tcCells = mc.map((m,i)=>{
    const rate = (m.id in PR.tcDirty) ? PR.tcDirty[m.id] : (m.usd_rate!=null?String(m.usd_rate):'');
    return `<td class="pr-num${mHideClass(i)}"><input class="pr-cell pr-tc" inputmode="decimal" autocomplete="off" placeholder="TC"
      value="${rate?nf0.format(parseNum(rate)):''}"
      onfocus="prTcFocus(this)" onblur="prTcBlur(this)" data-m="${m.id}"></td>`;
  }).join('');
  const tcRow = `<tr class="pr-tcrow"><td class="left pr-sticky"><span class="pr-tclabel">Tipo de cambio (cierre)</span></td>${tcCells}<td class="pr-num pr-sum"></td><td class="pr-num pr-sum"></td><td class="pr-num pr-sum"></td></tr>`;

  // Fila de estado (marcar mes en revisión)
  const revCells = mc.map((m,i)=>{
    const rev=(typeof revIsUnderReview==='function')&&revIsUnderReview(m.calendar_year,m.month_number);
    return `<td class="pr-num ${rev?'rev-col':''}${mHideClass(i)}"><button class="pr-revbtn ${rev?'on':''}" title="${rev?'En revisión — clic para cerrar':'Marcar en revisión'}" onclick="revToggle(${m.calendar_year},${m.month_number})"><span class="dot"></span></button></td>`;
  }).join('');
  const revRow = `<tr class="pr-revrow no-print"><td class="left pr-sticky"><span class="pr-tclabel" style="color:#8a5a00">Estado (revisión)</span></td>${revCells}<td class="pr-num pr-sum"></td><td class="pr-num pr-sum"></td><td class="pr-num pr-sum"></td></tr>`;

  host.innerHTML = `
    <div class="controls no-print">
      <div class="field"><label>Ejercicio a cargar</label>
        <select onchange="prSetGridFy(this.value)">${fyOptions}</select></div>
      <div class="cp-spacer"></div>
      ${syncBtn}
      <button class="btn gray sm" onclick="printReport()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M6 9V2h12v7M6 18H4v-6h16v6h-2M8 14h8v8H8z"/></svg>PDF</button>
      <button class="btn ${dirtyCount?'':'gray'}" onclick="prSaveGrid()" ${dirtyCount?'':'disabled'}>
        ${dirtyCount?`Guardar cambios (${dirtyCount})`:'Sin cambios'}</button>
    </div>
    ${isCur?'<div class="note no-print"><span>🔗</span><div>Los valores de este ejercicio se toman del <b>Informe de Gestión</b> del mismo período (se sobrescriben al guardar Gestión o al sincronizar). Impuestos a las ganancias quedan fuera y se cargan a mano.</div></div>':''}
    <div class="note no-print"><span>💵</span><div>Cargá el <b>tipo de cambio de cierre</b> de cada mes en la primera fila. Es lo que permite ver el informe en dólares (cada mes se convierte a su propia cotización). Se guarda solo, al salir de la celda.</div></div>
    <div class="print-head"><span class="logo">D</span><b>DEAM SRL — Presupuesto · Carga mensual</b><span>${(PR.fiscalYears.find(f=>f.id===fyId)||{}).name||''} · ${prIsUsd()?'USD':'ARS'}</span></div>
    <div class="panel">
      <div class="panel-head"><h3>Carga mensual</h3><div class="cp-spacer"></div>
        <span style="font-size:11.5px;color:var(--ink-faint)">a la derecha: acumulado, promedio y % s/ventas</span></div>
      <div class="pr-scroll">
        <table class="pr-table">
          <colgroup><col>${mc.map((m,i)=>{ const rev=(typeof revIsUnderReview==='function')&&revIsUnderReview(m.calendar_year,m.month_number); return `<col class="${rev?'rev-col':''}${mHideClass(i)}">`; }).join('')}<col><col><col></colgroup>
          <thead><tr><th class="left pr-sticky">Categoría / Subcategoría</th>
            ${mc.map((m,i)=>{ const rev=(typeof revIsUnderReview==='function')&&revIsUnderReview(m.calendar_year,m.month_number); return `<th class="${rev?'rev-col':''}${mHideClass(i)}">${m.month_name.slice(0,3)} ${String(m.calendar_year).slice(2)}${rev?'<br><span class="rev-badge">Rev.</span>':''}</th>`; }).join('')}
            <th class="pr-sum">Acum.</th><th class="pr-sum">Prom.</th><th class="pr-sum">% s/v</th></tr></thead>
          <tbody>${tcRow}${revRow}${rows}</tbody>
        </table>
      </div>
    </div>`;
}

/* Edición de celdas: al enfocar muestra número crudo; al salir, guarda dirty */
function prCellFocus(inp){
  const raw = prGridRaw(inp);
  inp.value = raw ? String(parseNum(raw)) : '';
  inp.select();
}
function prGridRaw(inp){
  const k=`${inp.dataset.m}::${inp.dataset.c}::${inp.dataset.s}`;
  if(k in PR.gridDirty) return PR.gridDirty[k];
  const v=PR.values.find(x=>x.month_id===inp.dataset.m && x.category_id===inp.dataset.c && (x.subcategory_id||null)===(inp.dataset.s||null));
  return v && v.amount!=null ? String(v.amount) : '';
}
function prCellBlur(inp){
  const k=`${inp.dataset.m}::${inp.dataset.c}::${inp.dataset.s}`;
  const val = inp.value.trim();
  const num = parseNum(val);
  // marcar dirty sólo si cambió
  const prevRaw = (()=>{ const v=PR.values.find(x=>x.month_id===inp.dataset.m && x.category_id===inp.dataset.c && (x.subcategory_id||null)===(inp.dataset.s||null)); return v&&v.amount!=null?Number(v.amount):null; })();
  const newNum = (val==='' || isNaN(num)) ? null : num;
  if(newNum !== prevRaw){
    PR.gridDirty[k] = (newNum===null) ? '' : String(newNum);
  }else{
    delete PR.gridDirty[k];
  }
  renderPresupuesto();  // recalcula totales en vivo y el contador de cambios
}

function prSetGridFy(id){ PR.currentFyGrid=id; PR.gridDirty={}; PR.tcDirty={}; renderPresupuesto(); }

/* --- Tipo de cambio de cierre por mes (persiste en months.usd_rate) --- */
function prTcFocus(inp){
  const mId=inp.dataset.m;
  const m=PR.months.find(x=>x.id===mId);
  const cur=(mId in PR.tcDirty)?PR.tcDirty[mId]:(m&&m.usd_rate!=null?String(m.usd_rate):'');
  inp.value = cur?String(parseNum(cur)):''; inp.select();
}
async function prTcBlur(inp){
  const mId=inp.dataset.m;
  const m=PR.months.find(x=>x.id===mId); if(!m) return;
  const val=inp.value.trim(); const num=parseNum(val);
  const newVal=(val===''||isNaN(num)||num<=0)?null:num;
  const prev=(m.usd_rate!=null)?Number(m.usd_rate):null;
  if(newVal===prev){ renderPresupuesto(); return; }
  if(!db){ alert('Conectá Supabase para guardar el tipo de cambio.'); renderPresupuesto(); return; }
  try{
    const r=await db.from('months').update({usd_rate:newVal}).eq('id',mId);
    if(r.error) throw r.error;
    m.usd_rate=newVal;            // reflejar en memoria sin recargar todo
    delete PR.tcDirty[mId];
  }catch(e){ alert('No se pudo guardar el tipo de cambio: '+(e.message||e)); return; }
  await touchSeccion('presupuesto');
  renderPresupuesto();
}

async function prSaveGrid(){
  if(!db){ alert('Conectá Supabase para guardar.'); return; }
  const fyId = PR.currentFyGrid || PR.currentFyId;
  const upsSub=[], upsDir=[], dels=[];
  for(const k of Object.keys(PR.gridDirty)){
    const [mId,cId,sId]=k.split('::');
    const raw=PR.gridDirty[k];
    if(raw==='' || isNaN(parseNum(raw))) dels.push({mId,cId,sId});
    else {
      const row={ fiscal_year_id:fyId, month_id:mId, category_id:cId, subcategory_id:sId||null, amount:parseNum(raw) };
      if(sId) upsSub.push(row); else upsDir.push(row);   // separar por tipo
    }
  }
  try{
    // Con subcategoría: el upsert por onConflict funciona (no hay NULL).
    if(upsSub.length){
      const r=await db.from('monthly_values').upsert(upsSub,{onConflict:'month_id,category_id,subcategory_id'});
      if(r.error) throw r.error;
    }
    // Importe directo (subcategory_id NULL): delete + insert, porque el upsert
    // con NULL no reconoce la fila existente y choca contra uq_monthly_direct.
    for(const row of upsDir){
      const del=await db.from('monthly_values').delete()
        .eq('month_id',row.month_id).eq('category_id',row.category_id).is('subcategory_id',null);
      if(del.error) throw del.error;
    }
    if(upsDir.length){
      const r=await db.from('monthly_values').insert(upsDir);
      if(r.error) throw r.error;
    }
    for(const d of dels){
      let q=db.from('monthly_values').delete().eq('month_id',d.mId).eq('category_id',d.cId);
      q = d.sId ? q.eq('subcategory_id',d.sId) : q.is('subcategory_id',null);
      const r=await q; if(r.error) throw r.error;
    }
  }catch(e){
    alert('No se pudo guardar: '+(e.message||e)); return;
  }
  await touchSeccion('presupuesto');
  PR.gridDirty={};
  await loadPresupuesto();
  alert('Carga guardada.');
}

async function prAddSub(catId, catName){
  if(!db){ alert('Conectá Supabase para agregar subcategorías.'); return; }
  const name=prompt(`Nueva subcategoría para "${catName}":`);
  if(!name || !name.trim()) return;
  const r=await db.from('subcategories').insert({category_id:catId, name:name.trim()}).select().single();
  if(r.error){ alert('No se pudo crear la subcategoría: '+r.error.message); return; }
  await touchSeccion('presupuesto');
  await loadPresupuesto();
}

/* =====================================================================
   VISTA 2 · COMPARACIÓN vs REFERENCIA
   ===================================================================== */
const PR_METRIC_LABEL = { mes:'Mes actual', acum:'Acumulado', prom:'Promedio', pctMes:'% s/ventas (mes)', pctAcum:'% s/ventas (acum)', pct:'% s/ventas' };
const prUnitOf = m => (m==='pctMes'||m==='pctAcum'||m==='pct') ? 'pct' : 'money';

function prCompareRows(){
  const usd=prIsUsd();
  const ventasMes = prValMonth(PR.currentFyId,"Total de Ventas",PR.order);
  const ventasAcum= prValAccum(PR.currentFyId,"Total de Ventas",PR.order);
  return PR.categories.map(cat=>{
    const name=cat.name;
    const mes=prCMonth(PR.currentFyId,name,PR.order);
    const acum=prCAccum(PR.currentFyId,name,PR.order);
    const prom=PR.order>0?acum/PR.order:0;
    const mesP=prValMonth(PR.currentFyId,name,PR.order);
    const acumP=prValAccum(PR.currentFyId,name,PR.order);
    const pctMes=ventasMes!==0?(mesP/ventasMes)*100:null;
    const pctAcum=ventasAcum!==0?(acumP/ventasAcum)*100:null;
    const rAcum=prCRefAcum(name), rProm=prCRefProm(name), rPct=prRefPct(name);

    const actualVal = PR.metricActual==='mes'?mes : PR.metricActual==='acum'?acum :
                      PR.metricActual==='prom'?prom : PR.metricActual==='pctMes'?pctMes : pctAcum;
    const refVal = PR.metricRef==='acum'?rAcum : PR.metricRef==='prom'?rProm : rPct;
    const comparable = prUnitOf(PR.metricActual)===prUnitOf(PR.metricRef);
    let difVal=null, difPct=null;
    if(comparable && actualVal!=null && refVal!=null){
      difVal=actualVal-refVal;
      if(prUnitOf(PR.metricActual)==='money') difPct = refVal!==0 ? (difVal/Math.abs(refVal))*100 : null;
    }
    return { cat, actualVal, refVal, difVal, difPct, comparable,
             actualIsPct:prUnitOf(PR.metricActual)==='pct', refIsPct:prUnitOf(PR.metricRef)==='pct' };
  });
}

function prRenderCompare(host){
  const usd=prIsUsd();
  const mc=prMonthsOf(PR.currentFyId);
  const curMonth=PR.months.find(m=>m.fiscal_year_id===PR.currentFyId && m.order_index===PR.order);
  const fyName=(PR.fiscalYears.find(f=>f.id===PR.currentFyId)||{}).name||'';
  const refName=(PR.fiscalYears.find(f=>f.id===PR.refFyId)||{}).name||'';
  const rows=prCompareRows().filter(r=>{
    if(PR.rowFilter==='all') return true;
    if(PR.rowFilter==='key') return !!PR_HILITE[r.cat.name];
    return r.cat.type===PR.rowFilter;
  });

  // KPIs
  const kpi = n => prCompareRows().find(r=>r.cat.name===n)||{};
  const kV=kpi("Total de Ventas"), kB=kpi("Utilidad Bruta"), kN=kpi("Total de Utilidad Neta"), kR=kpi("Resultado después del impuesto");
  const kpiCard=(lbl,r,strong)=>{
    const v=r.actualVal, ref=r.refVal, dif=r.difVal, dp=r.difPct;
    const up = dif!=null && dif>=0;
    return `<div class="pr-kpi ${strong?'strong':''}">
      <div class="pr-kpi-lbl">${lbl}</div>
      <div class="pr-kpi-val">${r.actualIsPct?prPct(v):prMoney(v,usd)}</div>
      <div class="pr-kpi-ref">ref: ${r.refIsPct?prPct(ref):prMoney(ref,usd)}
        ${dif!=null?`<span class="pr-delta ${up?'up':'down'}">${up?'▲':'▼'} ${dp!=null?prPct(Math.abs(dp)):prMoney(Math.abs(dif),usd)}</span>`:''}</div></div>`;
  };

  const monthOpts = mc.map(m=>`<option value="${m.order_index}" ${m.order_index===PR.order?'selected':''}>${m.month_name} ${m.calendar_year}</option>`).join('');
  const selMetricActual = ['mes','acum','prom','pctMes','pctAcum'].map(k=>`<option value="${k}" ${PR.metricActual===k?'selected':''}>${PR_METRIC_LABEL[k]}</option>`).join('');
  const selMetricRef = ['acum','prom','pct'].map(k=>`<option value="${k}" ${PR.metricRef===k?'selected':''}>${PR_METRIC_LABEL[k]}</option>`).join('');
  const filterBtns = [['all','Todas'],['key','Clave'],['ingreso','Ingresos'],['egreso','Egresos'],['impuesto','Impuestos']]
    .map(([k,l])=>`<button class="${PR.rowFilter===k?'on':''}" onclick="prSetFilter('${k}')">${l}</button>`).join('');

  let trs='';
  for(const r of rows){
    const hi=PR_HILITE[r.cat.name]||'';
    const bar=`<span class="pr-typebar" style="background:${PR_TYPE_COLOR[r.cat.type]||'#999'}"></span>`;
    const aTxt = r.actualIsPct?prPct(r.actualVal):prMoney(r.actualVal,usd);
    const rTxt = r.refIsPct?prPct(r.refVal):prMoney(r.refVal,usd);
    let difTxt='—', difCls='';
    if(r.comparable && r.difVal!=null){
      const good = (r.cat.type==='ingreso'||r.cat.type==='resultado') ? r.difVal>=0 : r.difVal<=0;
      difCls = good?'up':'down';
      difTxt = (r.actualIsPct?prPct(r.difVal):prMoney(r.difVal,usd)) + (r.difPct!=null?` (${prPct(r.difPct)})`:'');
    }
    trs += `<tr class="${hi}"><td class="left"><div class="pr-catcell">${bar}<span class="pr-catname ${hi==='hi-key'?'strong':''}">${r.cat.name}</span>${prIsCalc(r.cat.name)?'<span class="pr-badge">calc</span>':''}</div></td>
      <td class="pr-num">${aTxt}</td><td class="pr-num">${rTxt}</td><td class="pr-num ${difCls}">${difTxt}</td></tr>`;
  }

  host.innerHTML=`
    <div class="print-head"><span class="logo">D</span><b>DEAM SRL — Presupuesto · Comparación</b><span>${fyName} · ${curMonth?curMonth.month_name+' '+curMonth.calendar_year:''} · ${usd?'USD':'ARS'}</span></div>
    <div class="controls no-print">
      <div class="field"><label>Mes (hasta)</label><select onchange="prSetOrder(this.value)">${monthOpts}</select></div>
      <div class="field"><label>Métrica actual</label><select onchange="prSetMetric('actual',this.value)">${selMetricActual}</select></div>
      <div class="field"><label>Referencia ${refName}</label><select onchange="prSetMetric('ref',this.value)">${selMetricRef}</select></div>
      <div class="cp-spacer"></div>
      <button class="btn gray" onclick="prExportCompare()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 3v12M7 10l5 5 5-5M5 21h14"/></svg>Excel</button>
      <button class="btn gray" onclick="printReport()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M6 9V2h12v7M6 18H4v-6h16v6h-2M8 14h8v8H8z"/></svg>PDF</button>
    </div>
    <div class="pr-kpis">${kpiCard('Ventas',kV)}${kpiCard('Utilidad Bruta',kB)}${kpiCard('Utilidad Neta',kN)}${kpiCard('Resultado d/imp.',kR,true)}</div>
    <div class="pr-filters no-print">${filterBtns}</div>
    <div class="panel">
      <div class="panel-head"><h3>Comparación por categoría</h3><div class="cp-spacer"></div>
        <span style="font-size:11.5px;color:var(--ink-faint)">actual (${PR_METRIC_LABEL[PR.metricActual]}) vs ${refName} (${PR_METRIC_LABEL[PR.metricRef]})</span></div>
      <table class="pr-table">
        <thead><tr><th class="left">Categoría</th><th>Actual</th><th>Referencia</th><th>Diferencia</th></tr></thead>
        <tbody>${trs}</tbody>
      </table>
    </div>`;
}

function prSetOrder(o){ PR.order=+o; renderPresupuesto(); }
function prSetMetric(which,val){ if(which==='actual')PR.metricActual=val; else PR.metricRef=val; renderPresupuesto(); }
function prSetFilter(f){ PR.rowFilter=f; renderPresupuesto(); }

function prExportCompare(){
  if(typeof XLSX==='undefined'){ alert('No se pudo cargar la librería de Excel.'); return; }
  const usd=prIsUsd();
  const fyName=(PR.fiscalYears.find(f=>f.id===PR.currentFyId)||{}).name||'';
  const curMonth=PR.months.find(m=>m.fiscal_year_id===PR.currentFyId && m.order_index===PR.order);
  const rows=prCompareRows().filter(r=>{
    if(PR.rowFilter==='all') return true;
    if(PR.rowFilter==='key') return !!PR_HILITE[r.cat.name];
    return r.cat.type===PR.rowFilter;
  });
  const aoa=[['DEAM SRL — Presupuesto · Comparación'],
    [`Ejercicio ${fyName}`, curMonth?`${curMonth.month_name} ${curMonth.calendar_year}`:'', usd?'USD':'ARS'],[],
    ['Categoría', PR_METRIC_LABEL[PR.metricActual], 'Ref · '+PR_METRIC_LABEL[PR.metricRef], 'Diferencia', 'Diferencia %']];
  rows.forEach(r=>aoa.push([
    r.cat.name,
    r.actualVal!=null?+r.actualVal.toFixed(2):'',
    r.refVal!=null?+r.refVal.toFixed(2):'',
    (r.comparable&&r.difVal!=null)?+r.difVal.toFixed(2):'',
    r.difPct!=null?+r.difPct.toFixed(2):'',
  ]));
  const ws=XLSX.utils.aoa_to_sheet(aoa); ws['!cols']=[{wch:34},{wch:18},{wch:18},{wch:16},{wch:13}];
  const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,'Comparacion');
  XLSX.writeFile(wb, `DEAM_Presupuesto_${fyName.replace('/','-')}_${curMonth?curMonth.month_name:''}.xlsx`);
}

/* =====================================================================
   VISTA 3 · GRÁFICOS
   ===================================================================== */
let prChart=null;
function prTimeline(){
  const out=[];
  const ref=PR.fiscalYears.find(f=>f.id===PR.refFyId);
  const cur=PR.fiscalYears.find(f=>f.id===PR.currentFyId);
  const fys=[]; if(ref)fys.push(ref); if(cur && (!ref||cur.id!==ref.id))fys.push(cur);
  fys.forEach(fy=>{
    prMonthsOf(fy.id).forEach(m=>out.push({fy,m,label:`${m.month_name.slice(0,3)} ${String(m.calendar_year).slice(2)}`}));
  });
  return out;
}
function prSeriesMonth(fy,name,ord){
  let p;
  if(fy.id===PR.refFyId){ const bn=prByName(); const id=bn[name]?bn[name].id:null; p=id?prCatMonth(fy.id,id,ord):0; }
  else p=prValMonth(fy.id,name,ord);
  if(!prIsUsd()) return p;
  const k=prInvRate(fy.id,ord); return k!=null?p*k:null;
}
function prHasData(fy,ord){
  const mid=prMonthId(fy.id,ord); if(!mid) return false;
  if(fy.id===PR.refFyId){ const bn=prByName(); return PR_METRICS3.some(mt=>{const id=bn[mt.name]?bn[mt.name].id:null; return id && PR.values.some(v=>v.month_id===mid && v.category_id===id);}); }
  return PR.values.some(v=>v.month_id===mid);
}

function prRenderGraphs(host){
  const usd=prIsUsd();
  const tl=prTimeline();
  const labels=tl.map(t=>t.label);
  const seriesData=(name)=>{ let run=0; return tl.map(t=>{ const has=prHasData(t.fy,t.m.order_index); const v=prSeriesMonth(t.fy,name,t.m.order_index); if(PR.gAcum){ run+=has?v:0; return has?run:null; } return has?v:null; }); };

  const modeBtns = [['all','Las tres'],['single','Una sola']].map(([k,l])=>`<button class="${PR.gMode===k?'on':''}" onclick="prSetGMode('${k}')">${l}</button>`).join('');
  const acumBtns = [['0','Mensual'],['1','Acumulado']].map(([k,l])=>`<button class="${(PR.gAcum?'1':'0')===k?'on':''}" onclick="prSetGAcum(${k})">${l}</button>`).join('');
  const curBtns  = [['ars','Pesos'],['usd','Dólares']].map(([k,l])=>`<button class="${PR.currency===k?'on':''}" onclick="prSetCurrency('${k}')">${l}</button>`).join('');
  const pickSel = PR.gMode==='single'?`<div class="field"><label>Serie</label><select onchange="prSetGPick(this.value)">${PR_METRICS3.map(m=>`<option value="${m.name}" ${PR.gPick===m.name?'selected':''}>${m.label}</option>`).join('')}</select></div>`:'';

  host.innerHTML=`
    <div class="controls no-print">
      <div class="seg" id="pr-gmode">${modeBtns}</div>
      ${pickSel}
      <div class="seg">${acumBtns}</div>
      <div class="seg">${curBtns}</div>
    </div>
    <div class="panel" style="padding:16px">
      <div style="height:420px;position:relative"><canvas id="pr-chart"></canvas></div>
    </div>
    <p style="font-size:12px;color:var(--ink-soft);margin-top:10px">La referencia usa los valores mensuales cargados; el ejercicio actual se calcula desde los datos del mes. La tendencia (línea punteada) es una regresión lineal extendida.</p>`;

  // datasets
  let datasets;
  const mk = m => ({ label:m.label, data:seriesData(m.name), borderColor:m.color, backgroundColor:m.color+'22', tension:0.4, pointRadius:2, pointHoverRadius:5, borderWidth:2.5, fill:false });
  if(PR.gMode==='all'){ datasets=PR_METRICS3.map(mk); }
  else{
    const m=PR_METRICS3.find(x=>x.name===PR.gPick); const base=mk(m);
    const pts=base.data.map((y,x)=>y==null?null:{x,y}).filter(Boolean);
    const lr=prLinreg(pts);
    datasets=[base];
    if(lr) datasets.push({ label:'Tendencia / proyección', data:labels.map((_,x)=>+(lr.m*x+lr.b).toFixed(2)), borderColor:m.color, borderDash:[6,5], borderWidth:1.6, pointRadius:0, tension:0, fill:false });
  }

  if(prChart){ prChart.destroy(); prChart=null; }
  const ctx=document.getElementById('pr-chart');
  if(ctx && window.Chart){
    prChart=new Chart(ctx,{ type:'line', data:{labels,datasets},
      options:{ responsive:true, maintainAspectRatio:false, spanGaps:true,
        interaction:{mode:'index',intersect:false},
        plugins:{ legend:{labels:{usePointStyle:true,boxWidth:8,font:{family:'Lato',size:12}}},
          tooltip:{callbacks:{label:c=>`${c.dataset.label}: ${c.parsed.y==null?'—':prMoney(c.parsed.y,usd)}`}}},
        scales:{ x:{grid:{display:false},ticks:{font:{family:'Lato',size:11},maxRotation:0,autoSkip:true,maxTicksLimit:14}},
          y:{grid:{color:'#eef2f7'},ticks:{font:{family:'Lato',size:11},callback:v=>prCompact(v,usd)}}}}});
  }
}
function prSetGMode(m){ PR.gMode=m; renderPresupuesto(); }
function prSetGAcum(a){ PR.gAcum=!!a; renderPresupuesto(); }
function prSetGPick(p){ PR.gPick=p; renderPresupuesto(); }

/* =====================================================================
   VISTA · REFERENCIA 2025/2026 (solo acumulado)
   Se carga únicamente la columna de acumulado por categoría. El promedio
   se calcula como acumulado ÷ 12 y el % s/ventas como acumulado ÷ ventas
   acumuladas. No se muestra mes a mes. Plantilla Excel + import.
   ===================================================================== */
function prRefFy(){ return PR.fiscalYears.find(f=>f.is_reference); }

function prRenderReference(host){
  const fy = prRefFy();
  if(!fy){ host.innerHTML='<div class="placeholder"><h2>Sin ejercicio de referencia</h2><p>Creá un ejercicio con <b>is_reference = true</b> (por defecto, 2025/2026).</p></div>'; return; }
  const bn = prByName();
  const rm = prRefMap();
  const acumOf = name => prEval(name, n=>{ const id=bn[n]?bn[n].id:null; const r=id?rm[id]:null; return r?Number(r.accumulated||0):0; }, {});
  const ventasAcum = acumOf("Total de Ventas");
  const usd = prIsUsd();
  const tc = prRefRate();                 // TC único (usd_rate del mes 12 de la referencia)
  const toUsd = v => (tc && tc>0) ? v/tc : null;

  let rows='';
  for(const cat of PR.categories){
    const calc = prIsCalc(cat.name);
    const hi = PR_HILITE[cat.name]||'';
    const bar=`<span class="pr-typebar" style="background:${PR_TYPE_COLOR[cat.type]||'#999'}"></span>`;
    const acum = acumOf(cat.name);
    const prom = acum/12;
    const pc   = ventasAcum!==0 ? (acum/ventasAcum)*100 : null;
    const acumCell = calc
      ? `<span class="pr-cattot">${prMoney(acum,false)}</span>`
      : `<input class="pr-cell" inputmode="decimal" autocomplete="off" placeholder="$ 0"
           value="${(rm[cat.id]&&rm[cat.id].accumulated!=null)?nf0.format(Number(rm[cat.id].accumulated)):''}"
           onfocus="prRefFocus(this)" onblur="prRefBlur(this)" data-c="${cat.id}">`;
    const usdCol = usd ? `<td class="pr-num pr-sum">${tc?prMoney(toUsd(acum),true):'—'}</td>` : '';
    rows += `<tr class="${hi}"><td class="left pr-sticky"><div class="pr-catcell">${bar}<span class="pr-catname ${hi==='hi-key'?'strong':''}">${cat.name}</span>${calc?'<span class="pr-badge">calc</span>':''}</div></td>
      <td class="pr-num">${acumCell}</td>${usdCol}
      <td class="pr-num pr-sum">${prMoney(prom,false)}</td>
      <td class="pr-num pr-sum pct">${prPct(pc)}</td></tr>`;
  }

  const usdHead = usd ? '<th class="pr-sum">Acum. USD</th>' : '';
  const tcVal = tc?nf0.format(tc):'';
  host.innerHTML = `
    <div class="controls no-print">
      <div class="field"><label>Ejercicio de referencia</label>
        <select disabled><option>${fy.name}</option></select></div>
      <div class="field"><label>Tipo de cambio (31/03/2026)</label>
        <input class="pr-refcambio" inputmode="decimal" autocomplete="off" placeholder="$ 0"
          value="${tcVal}" onfocus="prRefRateFocus(this)" onblur="prRefRateBlur(this)"></div>
      <div class="cp-spacer"></div>
      <button class="btn gray" onclick="prRefTemplate()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 3v12M7 10l5 5 5-5M5 21h14"/></svg>Plantilla</button>
      <button class="btn gray" onclick="prRefTriggerImport()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 15V3M7 8l5-5 5 5M5 21h14"/></svg>Importar</button>
      <input type="file" id="pr-ref-file" accept=".xlsx,.xls" style="display:none" onchange="prRefOnFile(this)">
    </div>
    <div class="note no-print"><span>📌</span><div><b>Referencia ${fy.name}.</b> Cargá el <b>acumulado</b> del ejercicio por categoría. El promedio se calcula como acumulado ÷ 12 y el % sobre ventas como acumulado ÷ ventas acumuladas. El <b>tipo de cambio de cierre</b> convierte todo el acumulado a dólares para comparar.</div></div>
    <div class="panel">
      <div class="panel-head"><h3>Acumulado por categoría · ${fy.name}</h3></div>
      <table class="pr-table">
        <thead><tr><th class="left pr-sticky">Categoría</th><th>Acumulado total</th>${usdHead}<th class="pr-sum">Promedio (÷12)</th><th class="pr-sum">% s/ventas</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

/* Edición del TC único de referencia (persiste en months.usd_rate del mes 12) */
function prRefRateFocus(inp){ const tc=prRefRate(); inp.value = tc?String(tc):''; inp.select(); }
async function prRefRateBlur(inp){
  const fy=prRefFy(); if(!fy) return;
  const m=PR.months.find(x=>x.fiscal_year_id===fy.id && x.order_index===12);
  if(!m){ alert('No se encontró el mes de cierre (marzo) del ejercicio de referencia.'); return; }
  const val=inp.value.trim(); const num=parseNum(val);
  const newVal=(val===''||isNaN(num)||num<=0)?null:num;
  const prev=(m.usd_rate!=null)?Number(m.usd_rate):null;
  if(newVal===prev){ renderPresupuesto(); return; }
  if(!db){ alert('Conectá Supabase para guardar el tipo de cambio.'); renderPresupuesto(); return; }
  try{
    const r=await db.from('months').update({usd_rate:newVal}).eq('id',m.id);
    if(r.error) throw r.error;
    m.usd_rate=newVal;
  }catch(e){ alert('No se pudo guardar el tipo de cambio: '+(e.message||e)); return; }
  await touchSeccion('presupuesto');
  renderPresupuesto();
}

function prRefFocus(inp){
  const c=inp.dataset.c; const rm=prRefMap();
  const cur=(rm[c]&&rm[c].accumulated!=null)?Number(rm[c].accumulated):'';
  inp.value = cur!==''?String(cur):''; inp.select();
}
async function prRefBlur(inp){
  const fy=prRefFy(); if(!fy) return;
  const c=inp.dataset.c; const num=parseNum(inp.value);
  const newVal = (inp.value.trim()===''||isNaN(num)) ? null : num;
  let ref = PR.referenceValues.find(r=>r.fiscal_year_id===fy.id && r.category_id===c);
  const prev = ref&&ref.accumulated!=null?Number(ref.accumulated):null;
  if(newVal===prev){ renderPresupuesto(); return; }
  if(!db){ alert('Conectá Supabase para guardar.'); renderPresupuesto(); return; }
  try{
    const r=await db.from('reference_values').upsert(
      {fiscal_year_id:fy.id, category_id:c, accumulated:newVal},
      {onConflict:'fiscal_year_id,category_id'});
    if(r.error) throw r.error;
  }catch(e){ alert('No se pudo guardar: '+(e.message||e)); return; }
  await touchSeccion('presupuesto');
  await loadPresupuesto();
}

function prRefTemplate(){
  if(typeof XLSX==='undefined'){ alert('No se pudo cargar la librería de Excel.'); return; }
  const fy=prRefFy(); const rm=prRefMap();
  const aoa=[['DEAM SRL — Presupuesto · Plantilla de Referencia'],[fy?fy.name:''],[],['Categoría','Acumulado total']];
  PR.categories.forEach(c=>{ if(!prIsCalc(c.name)){ const cur=rm[c.id]&&rm[c.id].accumulated!=null?Number(rm[c.id].accumulated):''; aoa.push([c.name, cur]); } });
  const ws=XLSX.utils.aoa_to_sheet(aoa); ws['!cols']=[{wch:38},{wch:20}];
  const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,'Referencia');
  XLSX.writeFile(wb, `DEAM_Presupuesto_Referencia_${fy?fy.name.replace('/','-'):''}.xlsx`);
}

function prRefTriggerImport(){ document.getElementById('pr-ref-file').click(); }
function prRefOnFile(inputEl){
  const file=inputEl.files&&inputEl.files[0]; if(!file) return;
  const reader=new FileReader();
  reader.onload=async e=>{
    try{
      const wb=XLSX.read(new Uint8Array(e.target.result),{type:'array'});
      const ws=wb.Sheets[wb.SheetNames[0]];
      const aoa=XLSX.utils.sheet_to_json(ws,{header:1,raw:true,defval:null});
      await prRefImport(aoa);
    }catch(err){ console.warn('ref import',err); alert('No se pudo leer el archivo. Usá la plantilla exportada por este informe.'); }
    finally{ inputEl.value=''; }
  };
  reader.readAsArrayBuffer(file);
}
async function prRefImport(aoa){
  const fy=prRefFy(); if(!fy){ alert('Sin ejercicio de referencia.'); return; }
  const norm=s=>String(s||'').toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ');
  const byNorm={}; PR.categories.forEach(c=>{ if(!prIsCalc(c.name)) byNorm[norm(c.name)]=c; });
  const rows=[]; let matched=0;
  for(const r of aoa){
    if(!r||r.length<2) continue;
    const cat=byNorm[norm(r[0])]; if(!cat) continue;
    matched++;
    const cell=r[1];
    if(cell===null||cell===undefined||cell===''){ rows.push({fiscal_year_id:fy.id,category_id:cat.id,accumulated:null}); continue; }
    const v=parseNum(cell); if(!isFinite(v)) continue;
    rows.push({fiscal_year_id:fy.id,category_id:cat.id,accumulated:v});
  }
  if(matched===0){ alert('No se reconoció ninguna categoría en el archivo. Descargá la plantilla para ver el formato.'); return; }
  if(!confirm(`Se importarán ${rows.length} categorías de referencia (${fy.name}). Se sobrescribe el acumulado existente. ¿Continuar?`)) return;
  if(!db){ alert('Conectá Supabase para guardar.'); return; }
  try{
    const r=await db.from('reference_values').upsert(rows,{onConflict:'fiscal_year_id,category_id'});
    if(r.error) throw r.error;
  }catch(e){ alert('No se pudo importar: '+(e.message||e)); return; }
  await touchSeccion('presupuesto');
  await loadPresupuesto();
  alert('Referencia importada.');
}

/* =====================================================================
   SINCRONIZACIÓN Gestión → Presupuesto (ejercicio actual)
   ===================================================================== */
/* Lee los períodos de Gestión (gestion_periodos) y sobrescribe, en el
   ejercicio actual, el valor de cada categoría mapeada, en el mes que
   corresponde a la fecha del período. Devuelve la cantidad de celdas
   escritas. Si onlyLocal=true, no toca la base (para el auto-refresh de
   render); normalmente persiste con upsert. */
async function prSyncFromGestion(opts){
  opts = opts || {};
  if(!db){ return 0; }
  // ejercicio actual = el no-referencia
  const curFy = PR.fiscalYears.find(f=>!f.is_reference);
  if(!curFy){ return 0; }

  // traer períodos de Gestión
  let periodos=[];
  try{
    const r = await db.from('gestion_periodos').select('*');
    if(r.error) throw r.error;
    periodos = r.data||[];
  }catch(e){ console.warn('sync: no se pudo leer gestion_periodos', e); return 0; }
  if(!periodos.length) return 0;

  const bn = prByName();
  const monthsCur = prMonthsOf(curFy.id);
  // índice mes por (mes calendario + año) → month row
  const monthByYM = {};
  monthsCur.forEach(m=>{ monthByYM[`${m.calendar_year}-${m.month_number}`]=m; });

  const rows=[];
  for(const p of periodos){
    if(!p.fecha) continue;
    const d = new Date(p.fecha+'T00:00:00');
    const ym = `${d.getFullYear()}-${d.getMonth()+1}`;
    const month = monthByYM[ym];
    if(!month) continue;                    // ese mes no cae en el ejercicio actual
    const valores = p.valores||{};
    for(const gkey of Object.keys(PR_GESTION_MAP)){
      const catName = PR_GESTION_MAP[gkey];
      const cat = bn[catName];
      if(!cat) continue;                     // categoría no existe en Presupuesto
      const monto = prGestionCatTotal(gkey, valores);
      rows.push({ fiscal_year_id:curFy.id, month_id:month.id, category_id:cat.id,
                  subcategory_id:null, amount: monto });
    }
  }
  if(!rows.length) return 0;

  // Sobrescribe siempre el importe directo (subcategory_id NULL). El upsert
  // con onConflict NO funciona cuando subcategory_id es NULL (en SQL NULL≠NULL,
  // así que Postgres no reconoce la fila existente y choca contra el índice
  // parcial uq_monthly_direct). Por eso: borro primero las filas directas de
  // esas categorías/meses y luego inserto.
  try{
    // agrupar por month_id para borrar en lote las categorías afectadas
    const byMonth = {};
    for(const r of rows){ (byMonth[r.month_id] = byMonth[r.month_id] || []).push(r.category_id); }
    for(const mId of Object.keys(byMonth)){
      const catIds = byMonth[mId];
      const del = await db.from('monthly_values').delete()
        .eq('month_id', mId)
        .is('subcategory_id', null)
        .in('category_id', catIds);
      if(del.error) throw del.error;
    }
    const ins = await db.from('monthly_values').insert(rows);
    if(ins.error) throw ins.error;
  }catch(e){ console.warn('sync', e); if(!opts.silent) alert('No se pudo sincronizar desde Gestión: '+(e.message||e)); return 0; }
  return rows.length;
}

/* Botón manual desde la grilla del ejercicio actual */
async function prSyncNow(){
  const n = await prSyncFromGestion({});
  await loadPresupuesto();
  alert(n>0 ? `Sincronizado desde Gestión: ${n} valores actualizados en el ejercicio actual.` : 'No se encontraron períodos de Gestión que caigan en el ejercicio actual.');
}


window.prSetView=prSetView; window.prSetCurrency=prSetCurrency;
window.prCellFocus=prCellFocus; window.prCellBlur=prCellBlur;
window.prSetGridFy=prSetGridFy; window.prSaveGrid=prSaveGrid; window.prAddSub=prAddSub;
window.prTcFocus=prTcFocus; window.prTcBlur=prTcBlur;
window.prSetOrder=prSetOrder; window.prSetMetric=prSetMetric; window.prSetFilter=prSetFilter;
window.prExportCompare=prExportCompare;
window.prSetGMode=prSetGMode; window.prSetGAcum=prSetGAcum; window.prSetGPick=prSetGPick;
window.prRefFocus=prRefFocus; window.prRefBlur=prRefBlur;
window.prRefTemplate=prRefTemplate; window.prRefTriggerImport=prRefTriggerImport; window.prRefOnFile=prRefOnFile;
window.prRefRateFocus=prRefRateFocus; window.prRefRateBlur=prRefRateBlur;
window.prSyncNow=prSyncNow; window.prSyncFromGestion=prSyncFromGestion;

setTimeout(loadPresupuesto, 70);
