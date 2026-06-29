/* =====================================================================
   DEAM SRL · Informes Gerenciales
   Lógica de la aplicación. Lee y escribe en Supabase.
   ===================================================================== */

/* ---------- Cliente Supabase ---------- */
let db = null;
(function initDb(){
  const cfg = window.DEAM_CONFIG || {};
  if (cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY &&
      !cfg.SUPABASE_URL.includes('TU-PROYECTO') &&
      typeof supabase !== 'undefined') {
    db = supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
  }
})();

/* ---------- Constantes ---------- */
const INDICADORES = [
 {key:"liquidez", name:"Liquidez", formula:"Activo Cte. / Patrimonio Neto", calc:c=>c.totals.actCte/c.totals.pn,
  desc:"Mide cuánto del patrimonio está respaldado por activos de rápida conversión. Cuanto mayor, más holgura para afrontar el ciclo de importación sin descapitalizarse.",
  rango:"Bien ≥ 1,00 · Alerta 0,70–1,00 · Urgente < 0,70", status:v=>v>=1?"ok":v>=0.7?"warn":"bad"},
 {key:"apalanc", name:"Apalancamiento Financiero", formula:"Activo / Patrimonio Neto", calc:c=>c.totals.activo/c.totals.pn,
  desc:"Cuántos pesos de activo sostiene cada peso de capital propio. En una importadora es naturalmente alto por el financiamiento, pero por encima de 3x el riesgo se vuelve crítico.",
  rango:"Bien ≤ 2,00 · Alerta 2,00–3,00 · Urgente > 3,00", status:v=>v<=2?"ok":v<=3?"warn":"bad"},
 {key:"endeud", name:"Endeudamiento", formula:"Pasivo / Patrimonio Neto", calc:c=>c.totals.pasivo/c.totals.pn,
  desc:"Proporción de deuda frente al capital propio. Hasta 1x la deuda no supera al patrimonio; entre 1x y 2x exige seguimiento; sobre 2x compromete la solvencia ante saltos del tipo de cambio.",
  rango:"Bien ≤ 1,00 · Alerta 1,00–2,00 · Urgente > 2,00", status:v=>v<=1?"ok":v<=2?"warn":"bad"},
];
const STAT_TXT = {ok:"Bien", warn:"Alerta", bad:"Urgente"};

const TILES = [
 {view:"capital",name:"Capital de Trabajo",desc:"Estructura de activos, pasivos e indicadores de solvencia.",color:"#714B67",icon:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M8 4v16"/>'},
 {view:"equilibrio",name:"Punto de Equilibrio",desc:"Evolución del punto de equilibrio y margen de seguridad.",color:"#017E84",icon:'<path d="M3 3v18h18"/><path d="M7 14l4-4 3 3 5-6"/>'},
 {view:"gestion",name:"Informe de Gestión",desc:"Estado de Resultados: ventas, costos, utilidad y resultado.",color:"#3A6EA5",icon:'<path d="M4 4h16v16H4z"/><path d="M8 9h8M8 13h8M8 17h5"/>'},
 {view:"proyeccion",name:"Proyección",desc:"Escenarios futuros y tendencias.",color:"#2DA84F",icon:'<path d="M3 17l6-6 4 4 8-8"/><path d="M14 7h7v7"/>',soon:true},
 {view:"presupuesto",name:"Presupuesto",desc:"Planificación y control presupuestario.",color:"#C9772E",icon:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18"/>',soon:true},
 {view:"analisis",name:"Análisis",desc:"Exploración de datos y comparativas.",color:"#8E44AD",icon:'<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',soon:true},
 {view:"config",name:"Configuración",desc:"Umbrales, parámetros y ajustes del sistema.",color:"#6b6675",icon:'<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>'},
];

/* ---------- Formato AR ---------- */
const nf0=new Intl.NumberFormat('es-AR',{maximumFractionDigits:0});
const nf2=new Intl.NumberFormat('es-AR',{minimumFractionDigits:2,maximumFractionDigits:2});
const nf1=new Intl.NumberFormat('es-AR',{minimumFractionDigits:1,maximumFractionDigits:1});
const fmtUSD=v=>"US$ "+nf0.format(Math.round(v));
const fmtARS=v=>"$ "+nf0.format(Math.round(v));
const fmtX=v=>nf2.format(v);
const fmtPct=v=>nf1.format(v*100)+"%";
const fechaLarga=iso=>new Date(iso+'T00:00').toLocaleDateString('es-AR',{day:'2-digit',month:'short',year:'numeric'});
const fechaCorta=iso=>new Date(iso+'T00:00').toLocaleDateString('es-AR',{day:'2-digit',month:'short',year:'numeric'});

/* ---------- Estado ---------- */
let cierresFull=[];   // capital de trabajo, ordenado por fecha asc
let equilibrio=[];    // periodos de punto de equilibrio
let capTipo="mensual";
let beChart=null, editId=null;

/* =====================================================================
   CARGA DE DATOS
   ===================================================================== */
function banner(msg, kind){
  const el=document.getElementById('conn-banner');
  if(!msg){ el.style.display='none'; return; }
  el.style.display='block';
  el.className = kind==='error' ? 'conn-banner err' : 'conn-banner';
  el.innerHTML = msg;
}

function totalsFromLineas(lineas){
  const sum=(cat,f)=>lineas.filter(l=>l.categoria===cat).reduce((a,l)=>a+(+l[f]||0),0);
  const actCte=sum('activo_corriente','monto_usd');
  const stock =sum('stock','monto_usd');
  const pasivo=Math.abs(sum('pasivo','monto_usd'));
  const activo=actCte+stock;
  const pn=activo-pasivo;
  return {actCte,stock,activo,pasivo,pn};
}

function buildCierres(cierres, lineas){
  const byId={};
  cierres.forEach(c=>byId[c.id]={
    id:c.id, fecha:c.fecha, tipo:c.tipo, tc:+c.tipo_cambio,
    etiqueta:fechaLarga(c.fecha), lineas:[]
  });
  lineas.forEach(l=>{ if(byId[l.cierre_id]) byId[l.cierre_id].lineas.push(l); });
  const arr=Object.values(byId).sort((a,b)=>a.fecha.localeCompare(b.fecha));
  arr.forEach(c=>{
    c.lineas.sort((a,b)=>a.orden-b.orden);
    c.totals=totalsFromLineas(c.lineas);
  });
  // variación vs cierre MENSUAL anterior
  arr.forEach(c=>{
    const prev=[...arr].reverse().find(x=>x.tipo==='mensual' && x.fecha<c.fecha);
    c.varTotals = prev ? {
      actCte:(c.totals.actCte-prev.totals.actCte)/Math.abs(prev.totals.actCte),
      stock :(c.totals.stock -prev.totals.stock )/Math.abs(prev.totals.stock),
      activo:(c.totals.activo-prev.totals.activo)/Math.abs(prev.totals.activo),
      pasivo:(c.totals.pasivo-prev.totals.pasivo)/Math.abs(prev.totals.pasivo),
      pn    :(c.totals.pn    -prev.totals.pn    )/Math.abs(prev.totals.pn),
    } : null;
  });
  return arr;
}

async function loadData(){
  if(!db){
    banner('⚙️ <b>Falta configurar Supabase.</b> Completá tu URL y tu clave anónima en <code>config.js</code> y recargá. La pantalla de inicio funciona; los reportes muestran datos cuando hay conexión.','error');
    return;
  }
  try{
    const [c,l,e]=await Promise.all([
      db.from('cierres').select('*'),
      db.from('cierre_lineas').select('*'),
      db.from('equilibrio_periodos').select('*'),
    ]);
    if(c.error||l.error||e.error) throw (c.error||l.error||e.error);
    cierresFull=buildCierres(c.data||[], l.data||[]);
    equilibrio=(e.data||[]).map(r=>({
      id:r.id, fecha:r.fecha, tc:+r.tipo_cambio,
      v:+r.ventas_ars, cv:+r.costo_variable_ars, cf:+r.costo_fijo_ars
    }));
    banner('');
  }catch(err){
    banner('🔌 <b>No se pudo conectar con Supabase.</b> Verificá la URL, la clave y que el esquema esté creado. Detalle: '+(err.message||err),'error');
  }
}

/* =====================================================================
   HOME / NAVEGACIÓN
   ===================================================================== */
function renderTiles(){
  document.getElementById('tiles').innerHTML=TILES.map(t=>`
   <div class="tile ${t.soon?'soon':''}" onclick="enter('${t.view}')">
     ${t.soon?'<span class="tag">Próximo</span>':''}
     <div class="ic" style="background:${t.color}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor">${t.icon}</svg></div>
     <h3>${t.name}</h3><p>${t.desc}</p>
     <span class="go"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M13 6l6 6-6 6"/></svg></span>
   </div>`).join('');
}
function goHome(){ document.getElementById('shell').classList.remove('show'); document.getElementById('home').style.display='block'; window.scrollTo(0,0); }
function enter(view){ document.getElementById('home').style.display='none'; document.getElementById('shell').classList.add('show'); setView(view); window.scrollTo(0,0); }
function setView(view){
  document.querySelectorAll('.nav-item').forEach(x=>x.classList.toggle('active',x.dataset.view===view));
  document.querySelectorAll('.view').forEach(x=>x.classList.remove('active'));
  document.getElementById('view-'+view).classList.add('active');
  document.getElementById('sb').classList.remove('open');
  if(view==='equilibrio') setTimeout(()=>beChart&&beChart.resize(),60);
}
window.enter=enter; window.goHome=goHome;

/* =====================================================================
   CAPITAL DE TRABAJO
   ===================================================================== */
const fechaSel=document.getElementById('cap-fecha');
function capList(){ return capTipo==="todos"?cierresFull:cierresFull.filter(c=>c.tipo===capTipo); }
function fillFechas(){
  const list=capList();
  fechaSel.innerHTML=list.map(c=>`<option value="${c.fecha}">${c.etiqueta}${c.tipo==='parcial'?' · parcial':''}</option>`).join('')
    || '<option value="">— sin datos —</option>';
  if(list.length) fechaSel.value=list[list.length-1].fecha;
  renderCapital();
}
function curCierre(){ return cierresFull.find(x=>x.fecha===fechaSel.value); }

const GRUPOS=[
 {cat:'activo_corriente', titulo:'Activo Corriente', totalKey:'actCte', totalLabel:'TOTAL ACTIVO CTE.'},
 {cat:'stock',            titulo:'Stock (Bienes de Cambio)', totalKey:'stock', totalLabel:'TOTAL STOCK', sub:true},
];
function displayRows(c){
  const rows=[];
  // Activo corriente
  rows.push({g:'Activo Corriente'});
  c.lineas.filter(l=>l.categoria==='activo_corriente').forEach(l=>rows.push({n:l.rubro,ars:+l.monto_ars,usd:+l.monto_usd}));
  rows.push({t:'TOTAL ACTIVO CTE.', usd:c.totals.actCte, ars:sumArs(c,'activo_corriente'), v:c.varTotals?.actCte});
  // Stock
  rows.push({g:'Stock (Bienes de Cambio)'});
  c.lineas.filter(l=>l.categoria==='stock').forEach(l=>rows.push({n:l.rubro,ars:+l.monto_ars,usd:+l.monto_usd,sub:true}));
  rows.push({t:'TOTAL STOCK', usd:c.totals.stock, ars:sumArs(c,'stock'), v:c.varTotals?.stock});
  rows.push({t:'TOTAL ACTIVO', usd:c.totals.activo, ars:sumArs(c,'activo_corriente')+sumArs(c,'stock'), v:c.varTotals?.activo});
  // Pasivo
  rows.push({g:'Pasivo (Deudas a pagar)'});
  c.lineas.filter(l=>l.categoria==='pasivo').forEach(l=>rows.push({n:l.rubro,ars:+l.monto_ars,usd:+l.monto_usd,sub:true}));
  rows.push({t:'TOTAL PASIVO', usd:-c.totals.pasivo, ars:sumArs(c,'pasivo'), v:c.varTotals?.pasivo});
  rows.push({t:'PATRIMONIO NETO', usd:c.totals.pn, ars:c.totals.pn*c.tc, v:c.varTotals?.pn, pn:true});
  return rows;
}
function sumArs(c,cat){ return c.lineas.filter(l=>l.categoria===cat).reduce((a,l)=>a+(+l.monto_ars||0),0); }

document.querySelectorAll('#cap-tipo button').forEach(b=>b.addEventListener('click',()=>{
  document.querySelectorAll('#cap-tipo button').forEach(x=>x.classList.remove('on'));
  b.classList.add('on'); capTipo=b.dataset.tipo;
  document.getElementById('cap-sub').textContent=(capTipo==='mensual'?'Cierre mensual':capTipo==='parcial'?'Cierre parcial':'Todos los cierres')+' · valores en USD';
  fillFechas();
}));
fechaSel.addEventListener('change',renderCapital);

function renderCapital(){
  const c=curCierre();
  const tbody=document.querySelector('#cap-table tbody');
  if(!c){ tbody.innerHTML='<tr><td colspan="4" style="text-align:center;color:var(--ink-faint);padding:30px">Sin cierres cargados para este filtro.</td></tr>';
    document.getElementById('cap-tc').textContent='TC —'; document.getElementById('cap-pntag').textContent='PN —';
    document.getElementById('cap-indicators').innerHTML=''; return; }
  document.getElementById('tc-pill').textContent="$"+nf0.format(c.tc);
  document.getElementById('cap-tc').textContent="TC $"+nf0.format(c.tc);
  document.getElementById('cap-pntag').textContent="PN "+fmtUSD(c.totals.pn);
  document.getElementById('cap-print-meta').textContent=c.etiqueta+" · "+(c.tipo==='mensual'?'Cierre mensual':'Cierre parcial')+" · TC $"+nf0.format(c.tc);
  tbody.innerHTML=displayRows(c).map(r=>{
    if(r.g)return `<tr class="group"><td colspan="4">${r.g}</td></tr>`;
    const name=r.t||r.n, cls=r.t?'total':(r.sub?'subtle':'');
    const varCell=(r.v!=null && isFinite(r.v))?`<td><span class="var ${r.v>=0?'up':'down'}">${r.v>=0?'▲':'▼'} ${fmtPct(Math.abs(r.v))}</span></td>`:'<td></td>';
    return `<tr class="${cls}"><td>${name}</td><td class="mono ${r.ars<0?'neg':''}">${fmtARS(r.ars)}</td><td class="mono ${r.usd<0?'neg':''}">${fmtUSD(r.usd)}</td>${varCell}</tr>`;
  }).join('');
  document.getElementById('cap-indicators').innerHTML=INDICADORES.map(ind=>{
    const v=ind.calc(c),st=ind.status(v);
    return `<div class="ind"><div class="top"><div><div class="name">${ind.name}</div><div class="formula">${ind.formula}</div></div><span class="status s-${st}">${STAT_TXT[st]}</span></div><div class="big mono">${fmtX(v)}</div><div class="desc">${ind.desc}</div><div class="thresh">${ind.rango}</div><div class="ribbon r-${st}"></div></div>`;
  }).join('');
}

/* ---------- Carga / edición de cierres (ventana flotante) ---------- */
const RUBROS=[
 {cat:'activo_corriente',rubro:'Caja'},
 {cat:'activo_corriente',rubro:'Bancos'},
 {cat:'activo_corriente',rubro:'Bancos USD'},
 {cat:'activo_corriente',rubro:'FCI'},
 {cat:'activo_corriente',rubro:'Cheques'},
 {cat:'activo_corriente',rubro:'Deudas a cobrar'},
 {cat:'stock',rubro:'En depósito'},
 {cat:'stock',rubro:'En tránsito'},
 {cat:'pasivo',rubro:'Internacionales'},
 {cat:'pasivo',rubro:'Bancos'},
 {cat:'pasivo',rubro:'Bancos USD'},
];
const CAT_TITULO={activo_corriente:'Activo Corriente',stock:'Stock (Bienes de Cambio)',pasivo:'Pasivo — deudas (montos positivos)'};
let capEditId=null;

function openCapModal(id){
  capEditId=id||null;
  const c=capEditId?cierresFull.find(x=>x.id===capEditId):null;
  // construir inputs por rubro
  let html='',lastCat=null;
  RUBROS.forEach((r,i)=>{
    if(r.cat!==lastCat){ html+=`<div class="cm-group">${CAT_TITULO[r.cat]}</div>`; lastCat=r.cat; }
    html+=`<div class="cm-line"><label>${r.rubro}</label><input type="number" id="cm-r${i}" oninput="capModalCalc()" placeholder="0"><span class="cm-usd" id="cm-u${i}">US$ —</span></div>`;
  });
  document.getElementById('cm-rubros').innerHTML=html;
  document.getElementById('cap-modal-title').textContent=capEditId?'Editar cierre':'Cargar cierre';
  document.getElementById('cm-del').style.display=capEditId?'inline-flex':'none';
  document.getElementById('cm-fecha').value=c?c.fecha:new Date().toISOString().slice(0,10);
  document.getElementById('cm-tipo').value=c?c.tipo:'mensual';
  document.getElementById('cm-tc').value=c?c.tc:(cierresFull.length?cierresFull[cierresFull.length-1].tc:1430);
  RUBROS.forEach((r,i)=>{
    let val='';
    if(c){ const ln=c.lineas.find(l=>l.categoria===r.cat&&l.rubro===r.rubro); if(ln) val=Math.abs(+ln.monto_ars)||''; }
    document.getElementById('cm-r'+i).value=val;
  });
  capModalCalc();
  document.getElementById('cap-modal').classList.add('show');
}
function closeCapModal(){ document.getElementById('cap-modal').classList.remove('show'); }
function editCurrentCierre(){ const c=curCierre(); if(c) openCapModal(c.id); }

function capModalCalc(){
  const tc=+document.getElementById('cm-tc').value||0;
  const fecha=document.getElementById('cm-fecha').value||'9999-12-31';
  let actCte=0,stock=0,pasivo=0;
  RUBROS.forEach((r,i)=>{
    const ars=+document.getElementById('cm-r'+i).value||0, usd=tc?ars/tc:0;
    document.getElementById('cm-u'+i).textContent=tc?fmtUSD(r.cat==='pasivo'?-usd:usd):'US$ —';
    if(r.cat==='activo_corriente')actCte+=usd; else if(r.cat==='stock')stock+=usd; else pasivo+=usd;
  });
  const activo=actCte+stock, pn=activo-pasivo;
  const prev=[...cierresFull].reverse().find(x=>x.tipo==='mensual'&&x.id!==capEditId&&x.fecha<fecha);
  const vr=(cur,p)=> (prev&&p&&isFinite(p))?((cur-p)/Math.abs(p)):null;
  const totRows=[
    ['Activo Corriente',actCte, vr(actCte,prev?.totals.actCte)],
    ['Stock',stock, vr(stock,prev?.totals.stock)],
    ['Total Activo',activo, vr(activo,prev?.totals.activo), true],
    ['Total Pasivo',-pasivo, vr(pasivo,prev?.totals.pasivo), true],
    ['Patrimonio Neto',pn, vr(pn,prev?.totals.pn), true],
  ];
  const indDefs=[
    ['Liquidez', pn?actCte/pn:0, INDICADORES[0].status],
    ['Apalancamiento', pn?activo/pn:0, INDICADORES[1].status],
    ['Endeudamiento', pn?pasivo/pn:0, INDICADORES[2].status],
  ];
  const varCell=v=> v==null?'<span class="vr"></span>':`<span class="vr ${v>=0?'up':'down'}">${v>=0?'▲':'▼'} ${fmtPct(Math.abs(v))}</span>`;
  let html=totRows.map(r=>`<div class="cm-trow ${r[3]?'tot':''}"><span>${r[0]}</span><span class="v">${fmtUSD(r[1])}</span>${varCell(r[2])}</div>`).join('');
  html+='<div class="cm-inds">'+indDefs.map(d=>{const st=d[2](d[1]);return `<div class="cm-ind"><div class="l">${d[0]}</div><div class="n">${fmtX(d[1])}</div><div class="b s-${st}" style="background:none;padding:0">${STAT_TXT[st]}</div><div class="strip r-${st}"></div></div>`;}).join('')+'</div>';
  html+= prev?`<div style="font-size:11.5px;color:var(--ink-faint);margin-top:10px">Variación calculada contra el cierre mensual del ${prev.etiqueta}.</div>`
             :'<div style="font-size:11.5px;color:var(--ink-faint);margin-top:10px">No hay cierre mensual anterior para comparar.</div>';
  document.getElementById('cm-totals').innerHTML=html;
}

async function saveCapital(){
  const fecha=document.getElementById('cm-fecha').value, tipo=document.getElementById('cm-tipo').value, tc=+document.getElementById('cm-tc').value||0;
  if(!fecha||!tc){ alert('Completá fecha y tipo de cambio.'); return; }
  if(!db){ alert('Conectá Supabase (config.js) para guardar.'); return; }
  const lineas=RUBROS.map((r,i)=>{
    const ars=+document.getElementById('cm-r'+i).value||0;
    const signed=r.cat==='pasivo'?-Math.abs(ars):ars;
    return {categoria:r.cat, rubro:r.rubro, orden:i, monto_ars:signed, monto_usd: tc?signed/tc:0};
  });
  let targetId=capEditId;
  if(!targetId){
    const existing=cierresFull.find(x=>x.fecha===fecha);
    if(existing){ if(!confirm('Ya existe un cierre con esa fecha. ¿Reemplazarlo?')) return; targetId=existing.id; }
  }
  try{
    if(targetId){
      let r=await db.from('cierres').update({fecha,tipo,tipo_cambio:tc}).eq('id',targetId); if(r.error)throw r.error;
      r=await db.from('cierre_lineas').delete().eq('cierre_id',targetId); if(r.error)throw r.error;
      r=await db.from('cierre_lineas').insert(lineas.map(l=>({...l,cierre_id:targetId}))); if(r.error)throw r.error;
    }else{
      const c=await db.from('cierres').insert({fecha,tipo,tipo_cambio:tc}).select('id').single(); if(c.error)throw c.error;
      const r=await db.from('cierre_lineas').insert(lineas.map(l=>({...l,cierre_id:c.data.id}))); if(r.error)throw r.error;
    }
  }catch(e){ alert('No se pudo guardar: '+(e.message||e)); return; }
  closeCapModal();
  await loadData();
  // mostrar el cierre recién guardado
  capTipo=tipo;
  document.querySelectorAll('#cap-tipo button').forEach(x=>x.classList.toggle('on',x.dataset.tipo===capTipo));
  document.getElementById('cap-sub').textContent=(capTipo==='mensual'?'Cierre mensual':'Cierre parcial')+' · valores en USD';
  fillFechas();
  if([...fechaSel.options].some(o=>o.value===fecha)){ fechaSel.value=fecha; renderCapital(); }
}
async function deleteCapital(){
  if(!capEditId)return;
  if(!confirm('¿Eliminar este cierre y todas sus líneas?'))return;
  const res=await db.from('cierres').delete().eq('id',capEditId);
  if(res.error){ alert('No se pudo eliminar: '+res.error.message); return; }
  closeCapModal(); await loadData(); fillFechas();
}
window.openCapModal=openCapModal; window.closeCapModal=closeCapModal; window.editCurrentCierre=editCurrentCierre;
window.capModalCalc=capModalCalc; window.saveCapital=saveCapital; window.deleteCapital=deleteCapital;
document.getElementById('cap-modal').addEventListener('click',e=>{ if(e.target.id==='cap-modal')closeCapModal(); });

/* =====================================================================
   CONFIGURACIÓN
   ===================================================================== */
function renderConfig(){
  document.getElementById('cfg-grid').innerHTML=INDICADORES.map(ind=>{
    const p=ind.rango.split('·').map(s=>s.trim());
    return `<div class="cfg-card"><h4>${ind.name}</h4><div class="formula">${ind.formula}</div>
      <div class="cfg-row"><span class="chip" style="background:var(--ok)"></span> En valores saludables <span class="rng">${p[0].replace('Bien ','')}</span></div>
      <div class="cfg-row"><span class="chip" style="background:var(--warn)"></span> Requiere seguimiento <span class="rng">${p[1].replace('Alerta ','')}</span></div>
      <div class="cfg-row"><span class="chip" style="background:var(--bad)"></span> Acción inmediata <span class="rng">${p[2].replace('Urgente ','')}</span></div></div>`;
  }).join('');
}

/* =====================================================================
   PUNTO DE EQUILIBRIO
   ===================================================================== */
function beCalc(r){
  const mc=r.v>0?(r.v-r.cv)/r.v:0, peArs=mc>0?r.cf/mc:0;
  return {mc,peArs,peUsd:r.tc>0?peArs/r.tc:0,ms:r.v>0?(r.v-peArs)/r.v:0,
    vUsd:r.tc>0?r.v/r.tc:0,cvUsd:r.tc>0?r.cv/r.tc:0,cfUsd:r.tc>0?r.cf/r.tc:0};
}
function renderBeTable(){
  const sorted=[...equilibrio].sort((a,b)=>a.fecha.localeCompare(b.fecha));
  const tbody=document.getElementById('be-body');
  if(!sorted.length){ tbody.innerHTML='<tr><td colspan="9" style="text-align:center;color:var(--ink-faint);padding:30px">Sin períodos. Usá <b>Cargar</b> para agregar el primero.</td></tr>'; renderBeChart(); return; }
  tbody.innerHTML=sorted.map(r=>{
    const k=beCalc(r), msCls=k.ms>=0.25?'s-ok':k.ms>=0?'s-warn':'s-bad';
    return `<tr><td>${fechaCorta(r.fecha)}</td><td class="mono">$ ${nf0.format(r.tc)}</td><td class="mono">${fmtUSD(k.vUsd)}</td>
      <td class="mono">${fmtUSD(k.cvUsd)}</td><td class="mono">${fmtUSD(k.cfUsd)}</td>
      <td class="mono">${fmtPct(k.mc)}</td><td class="mono">${fmtUSD(k.peUsd)}</td>
      <td><span class="status ${msCls}" style="padding:2px 8px">${fmtPct(k.ms)}</span></td>
      <td class="no-print" style="white-space:nowrap">
        <button class="row-act" onclick="openModal('${r.id}')" title="Editar"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg></button>
        <button class="row-act del" onclick="delBe('${r.id}')" title="Eliminar"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/></svg></button>
      </td></tr>`;
  }).join('');
  renderBeChart();
}
function renderBeChart(){
  if(typeof Chart==='undefined')return;
  const sorted=[...equilibrio].sort((a,b)=>a.fecha.localeCompare(b.fecha));
  const labels=sorted.map(r=>new Date(r.fecha+'T00:00').toLocaleDateString('es-AR',{month:'short',year:'2-digit'}));
  const ctx=document.getElementById('beChart'); if(!ctx)return;
  if(beChart)beChart.destroy();
  beChart=new Chart(ctx,{type:'line',data:{labels,datasets:[
    {label:'Ventas (USD)',data:sorted.map(r=>Math.round(beCalc(r).vUsd)),borderColor:'#017E84',backgroundColor:'rgba(1,126,132,.08)',fill:true,tension:.3,borderWidth:2.5,pointRadius:3,pointBackgroundColor:'#017E84'},
    {label:'Punto de Equilibrio (USD)',data:sorted.map(r=>Math.round(beCalc(r).peUsd)),borderColor:'#714B67',backgroundColor:'rgba(113,75,103,.06)',fill:true,tension:.3,borderWidth:2.5,pointRadius:3,pointBackgroundColor:'#714B67'}]},
    options:{responsive:true,maintainAspectRatio:false,animation:{duration:400},interaction:{mode:'index',intersect:false},
      plugins:{legend:{position:'top',align:'end',labels:{usePointStyle:true,boxWidth:8,font:{family:'Lato',weight:'700',size:12}}},
        tooltip:{callbacks:{label:c=>c.dataset.label+': '+fmtUSD(c.parsed.y)}}},
      scales:{y:{ticks:{callback:v=>'US$ '+nf0.format(v),font:{family:'Roboto Mono',size:11}},grid:{color:'#f0edf2'}},
        x:{ticks:{font:{family:'Lato',size:11}},grid:{display:false}}}}});
}

/* ---------- Modal ---------- */
function openModal(id){
  editId=id||null;
  const r=editId?equilibrio.find(x=>x.id===editId):{fecha:new Date().toISOString().slice(0,10),tc:cierresFull.length?cierresFull[cierresFull.length-1].tc:1430,v:'',cv:'',cf:''};
  document.getElementById('modal-title').textContent=editId?'Editar período':'Cargar período';
  document.getElementById('m-fecha').value=r.fecha;
  document.getElementById('m-tc').value=r.tc;
  document.getElementById('m-v').value=r.v;
  document.getElementById('m-cv').value=r.cv;
  document.getElementById('m-cf').value=r.cf;
  modalPreview();
  document.getElementById('modal').classList.add('show');
}
function closeModal(){ document.getElementById('modal').classList.remove('show'); }
function modalPreview(){
  const tc=+document.getElementById('m-tc').value||0, v=+document.getElementById('m-v').value||0,
    cv=+document.getElementById('m-cv').value||0, cf=+document.getElementById('m-cf').value||0;
  document.getElementById('h-v').textContent=tc&&v?'= '+fmtUSD(v/tc):'';
  document.getElementById('h-cv').textContent=tc&&cv?'= '+fmtUSD(cv/tc):'';
  document.getElementById('h-cf').textContent=tc&&cf?'= '+fmtUSD(cf/tc):'';
  const k=beCalc({tc,v,cv,cf});
  document.getElementById('m-prev').innerHTML=v>0?
    `<div><span>% M. Contrib.</span><b>${fmtPct(k.mc)}</b></div>
     <div><span>Pto. Equilibrio</span><b>${fmtUSD(k.peUsd)}</b></div>
     <div><span>M. Seguridad</span><b>${fmtPct(k.ms)}</b></div>
     <div><span>Ventas USD</span><b>${fmtUSD(k.vUsd)}</b></div>`
    :'<div style="grid-column:1/3;color:var(--ink-soft)">Ingresá los valores para ver el cálculo.</div>';
}
async function saveModal(){
  const fecha=document.getElementById('m-fecha').value, tc=+document.getElementById('m-tc').value||0,
    v=+document.getElementById('m-v').value||0, cv=+document.getElementById('m-cv').value||0, cf=+document.getElementById('m-cf').value||0;
  if(!fecha||!tc){ alert('Completá fecha y tipo de cambio.'); return; }
  if(!db){ alert('Conectá Supabase (config.js) para guardar.'); return; }
  const payload={fecha,tipo_cambio:tc,ventas_ars:v,costo_variable_ars:cv,costo_fijo_ars:cf};
  let res;
  if(editId) res=await db.from('equilibrio_periodos').update(payload).eq('id',editId);
  else       res=await db.from('equilibrio_periodos').upsert(payload,{onConflict:'fecha'});
  if(res.error){ alert('No se pudo guardar: '+res.error.message); return; }
  closeModal();
  await loadData(); renderBeTable();
}
async function delBe(id){
  if(!confirm('¿Eliminar este período?'))return;
  if(!db){ alert('Conectá Supabase para eliminar.'); return; }
  const res=await db.from('equilibrio_periodos').delete().eq('id',id);
  if(res.error){ alert('No se pudo eliminar: '+res.error.message); return; }
  await loadData(); renderBeTable();
}
window.openModal=openModal; window.closeModal=closeModal; window.modalPreview=modalPreview;
window.saveModal=saveModal; window.delBe=delBe;
document.getElementById('modal').addEventListener('click',e=>{ if(e.target.id==='modal')closeModal(); });

/* =====================================================================
   EXPORT / IMPRESIÓN
   ===================================================================== */
/* Imprimir / PDF. El gráfico de Punto de Equilibrio se renderiza en un <canvas>
   con Chart.js: cuando el navegador aplica @media print (que achica la altura
   del .chart-wrap), el canvas no se redibuja a tiempo y el chart queda
   recortado (eje Y muestra sólo el rango alto). Solución: antes de imprimir,
   forzamos al chart a redibujarse en las dimensiones de impresión, lo
   capturamos como PNG y lo insertamos como <img>. Después de imprimir,
   restauramos el canvas. */
function printReport(){
  prepareChartsForPrint();
  // Permitir que el browser pinte el <img> antes de abrir el diálogo
  setTimeout(()=>window.print(), 30);
}
function prepareChartsForPrint(){
  if(typeof beChart==='undefined' || !beChart) return;
  const canvas = beChart.canvas;
  const wrap = canvas && canvas.parentElement;
  if(!wrap) return;
  // Dimensiones de impresión: deben coincidir con @media print en styles.css
  const PRINT_HEIGHT = '170px', PRINT_PADDING = '6px';
  const origH = wrap.style.height, origP = wrap.style.padding;
  wrap.style.height = PRINT_HEIGHT;
  wrap.style.padding = PRINT_PADDING;
  beChart.resize();
  const dataUrl = beChart.toBase64Image('image/png', 1.0);
  // Restaurar dimensiones de pantalla
  wrap.style.height = origH;
  wrap.style.padding = origP;
  beChart.resize();
  // Insertar <img> (se muestra sólo en print vía CSS)
  let img = document.getElementById('beChart-print-img');
  if(!img){
    img = document.createElement('img');
    img.id = 'beChart-print-img';
    img.className = 'chart-print-img';
    img.alt = 'Evolución del Punto de Equilibrio';
    wrap.appendChild(img);
  }
  img.src = dataUrl;
}
function restoreChartsAfterPrint(){
  const img = document.getElementById('beChart-print-img');
  if(img) img.remove();
}
window.addEventListener('beforeprint', prepareChartsForPrint);
window.addEventListener('afterprint', restoreChartsAfterPrint);
function ensureXLSX(){ if(typeof XLSX==='undefined'){ alert('No se pudo cargar la librería de Excel. Verificá tu conexión e intentá de nuevo.'); return false; } return true; }
function exportCapital(){
  if(!ensureXLSX())return; const c=curCierre(); if(!c){ alert('No hay cierre seleccionado.'); return; }
  const aoa=[["DEAM SRL — Capital de Trabajo"],["Cierre",c.etiqueta,"Tipo",c.tipo,"TC",c.tc],[],["Rubro","Saldo ARS","Saldo USD","Var. mes ant."]];
  displayRows(c).forEach(r=>{ if(r.g){aoa.push([r.g]);} else {aoa.push([r.t||r.n,r.ars,r.usd,(r.v!=null&&isFinite(r.v))?+r.v.toFixed(4):""]);} });
  aoa.push([],["Indicadores"],["Indicador","Fórmula","Valor","Estado"]);
  INDICADORES.forEach(ind=>{const v=ind.calc(c);aoa.push([ind.name,ind.formula,+v.toFixed(4),STAT_TXT[ind.status(v)]]);});
  const ws=XLSX.utils.aoa_to_sheet(aoa); ws['!cols']=[{wch:26},{wch:18},{wch:16},{wch:14}];
  const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,"Capital de Trabajo");
  XLSX.writeFile(wb,`Capital_de_Trabajo_${c.fecha}.xlsx`);
}
function exportEquilibrio(){
  if(!ensureXLSX())return;
  const aoa=[["DEAM SRL — Punto de Equilibrio (USD)"],[],["Fecha","T. Cambio","Ventas USD","Costo Var. USD","Costo Fijo USD","% M. Contrib.","Pto. Equilibrio USD","M. Seguridad"]];
  [...equilibrio].sort((a,b)=>a.fecha.localeCompare(b.fecha)).forEach(r=>{const k=beCalc(r);
    aoa.push([r.fecha,r.tc,Math.round(k.vUsd),Math.round(k.cvUsd),Math.round(k.cfUsd),+k.mc.toFixed(4),Math.round(k.peUsd),+k.ms.toFixed(4)]);});
  const ws=XLSX.utils.aoa_to_sheet(aoa); ws['!cols']=[{wch:12},{wch:10},{wch:14},{wch:14},{wch:14},{wch:13},{wch:16},{wch:13}];
  const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,"Punto de Equilibrio");
  XLSX.writeFile(wb,"Punto_de_Equilibrio.xlsx");
}
window.printReport=printReport; window.exportCapital=exportCapital; window.exportEquilibrio=exportEquilibrio;

/* navegación del sidebar */
document.querySelectorAll('.nav-item').forEach(it=>it.addEventListener('click',()=>setView(it.dataset.view)));

/* =====================================================================
   INIT
   ===================================================================== */
(async function init(){
  renderTiles(); renderConfig();
  await loadData();
  fillFechas(); renderBeTable();
})();
