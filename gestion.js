/* =====================================================================
   DEAM SRL · Informe de Gestión (Estado de Resultados)
   Estructura extraída de la solapa "Estado Resultado (Stock) 2.0".
   El usuario carga los importes por cuenta; los totales y las filas por
   fórmula se calculan automáticamente, respetando las fórmulas del Excel.
   ===================================================================== */

/* ---- Estructura: categorías colapsables (mostrar sólo el total) ---- */
const G_CATEGORIAS = [
  {key:"ventas",label:"Total Ventas",cuentas:[{c:"4101101005",n:"Facturacion Mercado Local",g:"Ventas Nacionales"},{c:"4101101001",n:"Facturacion Mercado Externo",g:"Exportación"},{c:"4101101010",n:"Facturacion Kibbo Implementacion",g:"KIBBO"},{c:"4101101015",n:"Facturacion Kibbo Abono.",g:"KIBBO"}]},
  {key:"cmv",label:"CMV",cuentas:[{c:"5110103125",n:"Compra de mercadería para exportación"},{c:"5107101001",n:"Costo De Venta Materias Primas"},{c:"5107901001",n:"Costo De Venta Materias Primas"},{c:"5107101015",n:"Costo De Venta Otras Ventas"},{c:"5107901015",n:"Costo De Venta Otras Ventas"},{c:"5107101010",n:"Costo De Venta Semiterminados"},{c:"5107901005",n:"Costo De Venta Semiterminados"},{c:"5107101005",n:"Costo De Venta Terminados"},{c:"5107901010",n:"Costo De Venta Terminados"},{c:"5107101020",n:"Costo merc facturada no remitida"},{c:"5110102060",n:"Repuestos y accesorios p/equipos"},{c:"5110103060",n:"VDO Compra de mercadería para exportación"}]},
  {key:"cmv_ind",label:"Total Costo Mercadería Vendida Indirectos",cuentas:[{c:"5110102100",n:"Fletes Importación"},{c:"5110102105",n:"Gastos importación"},{c:"5104903040",n:"Honorarios Aduaneros"},{c:"5110103170",n:"Desarrollo de producto"}]},
  {key:"ingenieria",label:"Total Gastos de Ingeniería",cuentas:[{c:"5104903025",n:"Honorarios Ingenieria"},{c:"5110102015",n:"Insumos De Laboratorio"}]},
  {key:"comercializacion",label:"Total Gastos de Comercialización",cuentas:[{c:"5104903001",n:"Comisiones"},{c:"5104903020",n:"Honorarios Comercialización"},{c:"5110103045",n:"Fletes de Exportación"},{c:"5110102040",n:"Fletes por Comercialización"},{c:"5110103040",n:"Gastos de Exportación"},{c:"5110103165",n:"Gastos marcas y patentes"},{c:"5110102055",n:"Gastos por Licitaciones"},{c:"5110102135",n:"Leasing"},{c:"5110103185",n:"Pèrdida por Deterioro Equipos en Leasing"},{c:"5110101040",n:"Seguros de Cargas"},{c:"5110102213",n:"Servicio almacenaja(VENCIDO)"},{c:"5110102130",n:"Servicio almacenaje"},{c:"5113101055",n:"Pérdida por Deudores Incobrables"},{c:"5110102070",n:"VDO Gastos importación"}]},
  {key:"otros_ingresos",label:"Total Otros Ingresos",cuentas:[{c:"4101102001",n:"Alta De Inventarios S/Ref"},{c:"4101102005",n:"Intereses ganados"},{c:"4101102010",n:"Gastos cobrados"},{c:"4101102015",n:"Ingresos varios"},{c:"4101102045",n:"Intereses ganados por préstamos"},{c:"4101102020",n:"Asesoramiento técnico"},{c:"4101102025",n:"Ingreso locación de inmuebles"},{c:"4101102030",n:"Reintegro Expo"},{c:"4101102035",n:"Intereses ganados por inversiones"},{c:"4101102040",n:"Beneficio Pyme Ley 27264"},{c:"4104101001",n:"Vta Activos Fijos"},{c:"4104101005",n:"Resultado venta rodados"},{c:"4104101010",n:"Beneficio Pyme Ley 27264"},{c:"4104102001",n:"Productos En Proceso"},{c:"4104102005",n:"Dif. Valoración X Tc"},{c:"4104102045",n:"Reintegro de ART"},{c:"4104101015",n:"Resultado venta Activos financieros"},{c:"4104103001",n:"Reguladora Trabajo en Curso"}]},
  {key:"rxt",label:"Total Resultado por Tenencia",cuentas:[{c:"5113101045",n:"Compensacion Venta Inmovilizado"},{c:"5113101001",n:"Dif. Precio De Compra Rdo por tenencia"},{c:"5113101010",n:"Dif. Precio Prd. Propia"},{c:"5113101025",n:"Dif. Precio X Ajuste Manual"},{c:"5113101030",n:"Dif. Precio X Calculo Costo"},{c:"5113101020",n:"Dif. Precio X Tc"},{c:"5113101015",n:"Dif. Recuento Inventario"},{c:"5110103010",n:"Perd.Deterioro BC"},{c:"5110103015",n:"Perdida Por Deterioro Bs.De Cambio"},{c:"5110103020",n:"Resultado De Tenencia Bs De Cambio"},{c:"5110103003",n:"Contrap. Liquid. IEC / Obj.CO"},{c:"5110103012",n:"Perd. Operaciones AF"},{c:"5110103160",n:"Perdida Por Robo Bs.De Cambio"},{c:"5113101040",n:"Scrap (Vng)"},{c:"5113101035",n:"Gtos X Traslados (Aum)"}]},
  {key:"sueldos",label:"Total Sueldos y Cs. Sociales",cuentas:[{c:"5104901001",n:"Sueldos Y Jornales"},{c:"5104901005",n:"Cargas Sociales"},{c:"5104901015",n:"FAECYS"},{c:"5104901020",n:"INACAP"}]},
  {key:"gastos_personal",label:"Total Gastos Personal",cuentas:[{c:"5104902001",n:"Cursos De Capacitacion"},{c:"5110102050",n:"Gastos por Congresos"},{c:"5104902015",n:"Otros Gastos En Personal"},{c:"5104902010",n:"Seguros Personal"}]},
  {key:"honorarios",label:"Total Honorarios",cuentas:[{c:"5104903005",n:"Contratos profesionales"},{c:"5104903010",n:"Honorarios"},{c:"5104903015",n:"Honorarios Administración"}]},
  {key:"impuestos",label:"Total Impuestos",cuentas:[{c:"5110103130",n:"Bonificación/Adicional impositivo IIBB"},{c:"5104901025",n:"Fofise"},{c:"5104901030",n:"Fondo de financiamiento de Obras de Infraestructur"},{c:"5110103155",n:"Imp a las ganancias"},{c:"5110103150",n:"Imp bienes personales y participación societar"},{c:"5110103085",n:"Imp sobre Débitos Créditos bancarios"},{c:"5110101135",n:"Impuesto automotor inmob y pcial"},{c:"5110101075",n:"Impuesto inmobiliario Municipal y Pcial"},{c:"5110103180",n:"Impuesto Pais"},{c:"5110103050",n:"Impuesto sobre los IIBB"},{c:"5110103081",n:"Multas"},{c:"5110102125",n:"Otros impuestos"},{c:"5110101055",n:"Sellados Aforos Certi. Y Timbrados"},{c:"5110101120",n:"Sellados Aforos Certi. Y Timbrados(NO IMPONIBLE)"},{c:"5110103055",n:"Tasa de Comercio e Industría"},{c:"5110103095",n:"VDO Bonificación/Adicional impositivo IIBB"},{c:"5110103120",n:"VDO Imp a las ganancias"},{c:"5110103115",n:"VDO Imp bienes personales y participación societar"},{c:"5110101115",n:"VDO Impuesto automotor inmob y pcial"},{c:"5110102090",n:"VDO Otros impuestos"},{c:"5110101100",n:"VDO Sellados Aforos Certi.Y Timbrados(NO IMPONIBLE"}]},
  {key:"gastos_bancarios",label:"Total Gastos Bancarios",cuentas:[{c:"5110103065",n:"Comisiones y gastos bancarios"},{c:"5110103140",n:"Comisiones y gastos bancarios(NO IMPONIBLE)"},{c:"5110103070",n:"Comisiones y gastos tarjeta de crédito"},{c:"5110103105",n:"VDO Comisiones y gastos bancarios(NO IMPONIBLE)"}]},
  {key:"intereses",label:"Total Intereses Pagados",cuentas:[{c:"5110103080",n:"Intereses fiscales"},{c:"5110103075",n:"Intereses bancarios"},{c:"5110103145",n:"Intereses bancarios(NO IMPONIBLE)"},{c:"5110103035",n:"Intereses Comerciales"},{c:"5110103175",n:"Intereses por venta de cheque"},{c:"5110103110",n:"VDO Intereses bancarios(NO IMPONIBLE)"}]},
  {key:"gastos_oficina",label:"Total Gastos Oficina",cuentas:[{c:"5110101065",n:"Alquiler"},{c:"5110102005",n:"Articulos De Librería"},{c:"5110101035",n:"Gastos De Correo"},{c:"5110102020",n:"Gastos Diversos"},{c:"5110102010",n:"Limpieza y Cafetería"},{c:"5110102095",n:"Limpieza y Cafetería(NO IMPONIBLE)"},{c:"5110102001",n:"Materiales Diversos"},{c:"5110102025",n:"Otros Gastos"},{c:"5110101025",n:"Suscripcion Y Afiliaciones"}]},
  {key:"servicios",label:"Total Servicios",cuentas:[{c:"5110101060",n:"Agua"},{c:"5110101001",n:"Energia Electrica"},{c:"5110101090",n:"Energia Electrica(NO IMPONIBLE)"},{c:"5110101080",n:"Gas"},{c:"5110101095",n:"Gas(NO IMPONIBLE)"},{c:"5110101050",n:"Gastos Expensas"},{c:"5110102030",n:"Otros Servicios"},{c:"5110101015",n:"Seguridad"},{c:"5110101020",n:"Servicio De Internet"},{c:"5110101085",n:"Servicio De Internet(NO IMPONIBLE)"},{c:"5110101045",n:"Servicios De Limpieza 3Ros"},{c:"5110101070",n:"Telefonía Celular"},{c:"5110101010",n:"Telefono"}]},
  {key:"sistemas",label:"Total Sistemas",cuentas:[{c:"5104903030",n:"Honorarios Sistemas"},{c:"5110101125",n:"IT Sistemas"},{c:"5110101130",n:"IT Sistemas(NO IMPONIBLE)"},{c:"5110101105",n:"VDO IT Sistemas"},{c:"5110101110",n:"VDO IT Sistemas(NO IMPONIBLE)"}]},
  {key:"viajes",label:"Total Viajes y Viáticos",cuentas:[{c:"5110101005",n:"Combustible y Energía"},{c:"5110102120",n:"Movilidad y Cadetería"},{c:"5110102035",n:"Movilidad y Cadetería(NO IMPONIBLE)"},{c:"5110102065",n:"VDO Fletes Importación"},{c:"5110102085",n:"VDO Movilidad y Cadetería"},{c:"5110103100",n:"VDO Viajes y viaticos comercialización(NO IMPONIBL"},{c:"5110103090",n:"Viajes y viaticos"},{c:"5110103135",n:"Viajes y viaticos (NO IMPONIBLE)"}]},
  {key:"marketing",label:"Total Gastos Marketing",cuentas:[{c:"5110102045",n:"Gastos de Marketing"},{c:"5104903035",n:"Honorarios Marketing"},{c:"5110101030",n:"Avisos Y Publicaciones"}]},
  {key:"bienes_uso",label:"Total Gastos Bienes de Uso",cuentas:[{c:"5110102110",n:"Gastos rodados"},{c:"5110102115",n:"Gastos rodados(NO IMPONIBLE)"},{c:"5110103025",n:"Mantenimiento y Rep. Bienes de Uso"},{c:"5110103030",n:"Mantenimiento y Rep. Inmuebles"},{c:"5110103005",n:"Perdida Por Deterioro Bs.De Uso"},{c:"5110102075",n:"VDO Gastos rodados"},{c:"5110102080",n:"VDO Gastos rodados(NO IMPONIBLE)"}]},
  {key:"amortizaciones",label:"Total Amortizaciones",cuentas:[{c:"5110103001",n:"Amortizacion"},{c:"5110103002",n:"Amortización Eq. Médicos en Leasing"},{c:"5104901010",n:"Amortizaciones (Af)"}]},
  {key:"inflacion",label:"Total Inflación",cuentas:[{c:"5113101050",n:"RECPAM"}]},
  {key:"otros_gastos_op",label:"Total Otros Gastos Operativos",cuentas:[{c:"5104903045",n:"Otros Gastos Operativos"},{c:"5113101065",n:"Resultado por conciliación cta cte Deudores"},{c:"5113101070",n:"Dif. Precio X Tc Ej. Anteriores"},{c:"5113101060",n:"Ajuste partidas acreedoras"}]}
];

/* ---- Créditos / pagos a cuenta de Impuesto a las Ganancias (filas individuales) ---- */
const G_TAX = [{c:"1116101010",n:"Percepción Ganancias Aduana"},{c:"1116101015",n:"Anticipos Imp a las Ganancias"},{c:"1116101020",n:"Imp s/cred-deb(cred) Imp a las Gcias pago a cta"},{c:"1116101075",n:"Percepción Ganancias"},{c:"1116104040",n:"Retención Imp a las Ganancias"}];

/* ---- Orden de presentación. Tipos:
   cat      = categoría colapsable (click abre modal de carga)
   formula  = fila calculada (no editable)
   calc     = Impuesto a las Ganancias (-30% sobre Utilidad Neta si >0)
   taxblock = bloque de créditos de ganancias (filas individuales, editables)
   space    = separador
---- */
const G_LAYOUT = [
  {t:"cat",key:"ventas"},
  {t:"cat",key:"cmv"},
  {t:"cat",key:"cmv_ind"},
  {t:"cat",key:"ingenieria"},
  {t:"cat",key:"comercializacion"},
  {t:"space"},
  {t:"formula",key:"utilidad_bruta",label:"UTILIDAD BRUTA",tone:"ub"},
  {t:"space"},
  {t:"cat",key:"otros_ingresos"},
  {t:"cat",key:"rxt"},
  {t:"cat",key:"sueldos"},
  {t:"cat",key:"gastos_personal"},
  {t:"cat",key:"honorarios"},
  {t:"cat",key:"impuestos"},
  {t:"cat",key:"gastos_bancarios"},
  {t:"cat",key:"intereses"},
  {t:"cat",key:"gastos_oficina"},
  {t:"cat",key:"servicios"},
  {t:"cat",key:"sistemas"},
  {t:"cat",key:"viajes"},
  {t:"cat",key:"marketing"},
  {t:"cat",key:"bienes_uso"},
  {t:"cat",key:"amortizaciones"},
  {t:"cat",key:"inflacion"},
  {t:"cat",key:"otros_gastos_op"},
  {t:"space"},
  {t:"formula",key:"utilidad_neta",label:"Total Utilidad Neta",tone:"un"},
  {t:"space"},
  {t:"calc",key:"impuesto_ganancias",label:"Impuesto a las Ganancias"},
  {t:"taxblock"},
  {t:"formula",key:"total_impuesto_ganancias",label:"Total Impuesto a las Ganancias",tone:"sub"},
  {t:"space"},
  {t:"formula",key:"resultado_despues",label:"Resultado Después de Impuestos",tone:"res"},
];

/* claves de las categorías que se suman para Utilidad Neta (después de Utilidad Bruta) */
const G_GRUPO_B = ["otros_ingresos","rxt","sueldos","gastos_personal","honorarios","impuestos","gastos_bancarios","intereses","gastos_oficina","servicios","sistemas","viajes","marketing","bienes_uso","amortizaciones","inflacion","otros_gastos_op"];
const G_GRUPO_UB = ["ventas","cmv","cmv_ind","ingenieria","comercializacion"];

/* Categorías que el sistema trata como EGRESOS: se les invierte el signo al
   sumar en Utilidad Bruta / Utilidad Neta. El usuario carga los montos en
   positivo (la magnitud del gasto) y el sistema asigna los signos.
   Las categorías que NO están aquí (ventas, otros_ingresos, rxt, inflacion)
   se suman tal cual: las dos primeras como ingresos, las dos últimas como
   resultados del período (RxT y RECPAM pueden dar ganancia o pérdida). */
const G_EGRESOS = new Set([
  "cmv","cmv_ind","ingenieria","comercializacion",
  "sueldos","gastos_personal","honorarios","impuestos",
  "gastos_bancarios","intereses","gastos_oficina","servicios",
  "sistemas","viajes","marketing","bienes_uso","amortizaciones",
  "otros_gastos_op"
]);

/* =====================================================================
   ESTADO / DATOS
   ===================================================================== */
let gPeriodos = [];     // [{id, fecha, etiqueta, valores:{cuenta:monto}}]
let gSel = null;        // id de período o 'acumulado'
let gVista = 'periodo'; // 'periodo' o 'comparativa' — modo de vista del informe
let gCatActual = null;  // categoría abierta en el modal ('tax' para créditos)

const G_CAT_BY_KEY = {}; G_CATEGORIAS.forEach(c=>G_CAT_BY_KEY[c.key]=c);

async function loadGestion(){
  if(!db){ gPeriodos=[]; renderGestion(); return; }
  try{
    const r = await db.from('gestion_periodos').select('*');
    if(r.error) throw r.error;
    gPeriodos = (r.data||[]).map(p=>({id:p.id, fecha:p.fecha, etiqueta:p.etiqueta||fechaLarga(p.fecha), valores:p.valores||{}}))
                 .sort((a,b)=>a.fecha.localeCompare(b.fecha));
    if(!gSel || (gSel!=='acumulado' && !gPeriodos.find(p=>p.id===gSel)))
      gSel = gPeriodos.length ? gPeriodos[gPeriodos.length-1].id : null;
    fillGPeriodos(); renderGestion();
  }catch(e){ console.warn('gestion load', e); gPeriodos=[]; renderGestion(); }
}

function fillGPeriodos(){
  const sel=document.getElementById('g-periodo'); if(!sel) return;
  let html = gPeriodos.map(p=>`<option value="${p.id}">${p.etiqueta}</option>`).join('');
  if(gPeriodos.length) html += `<option value="acumulado">— Acumulado (todos) —</option>`;
  sel.innerHTML = html || '<option value="">— sin períodos —</option>';
  if(gSel) sel.value=gSel;
}

/* ---- alcance de datos (período puntual o acumulado) ---- */
function gScope(){
  if(gSel==='acumulado'){
    const v={};
    gPeriodos.forEach(p=>{ for(const k in p.valores){ v[k]=(v[k]||0)+(+p.valores[k]||0); } });
    return {valores:v, editable:false};
  }
  const p=gPeriodos.find(x=>x.id===gSel);
  return {valores: p?p.valores:{}, editable: !!p, periodo:p};
}
const gv=(val,cuenta)=> +val[cuenta]||0;

/* Formateo de porcentajes estilo es-AR (coma decimal, 1 decimal).
   Usado por las celdas % de las vistas Por Período y Comparativa.
   Nota: app.js ya define una `fmtPct` propia con otra firma (toma una
   fracción y devuelve "X%"); por eso acá uso únicamente `_nfPct.format()`
   inline en las celdas, sin declarar una función con nombre colisionable. */
const _nfPct = new Intl.NumberFormat('es-AR', {style:'percent', minimumFractionDigits:1, maximumFractionDigits:1});

/* ---- Parser robusto de números: acepta "5763438,8", "5763438.8", "1.234.567,89", etc.
   Necesario porque <input> en es-AR puede devolver el valor con coma decimal,
   y `+"5763438,8"` da NaN (perdiendo silenciosamente el valor en la suma). */
function parseNum(s){
  if(s==null) return 0;
  let t = String(s).trim();
  if(t==='') return 0;
  // Permitir signo negativo intermedio o paréntesis estilo contable: "(123,45)" → -123,45
  let neg = false;
  if(t.startsWith('(') && t.endsWith(')')){ neg=true; t=t.slice(1,-1).trim(); }
  // Remover espacios internos
  t = t.replace(/\s+/g,'');
  const hasDot   = t.includes('.');
  const hasComma = t.includes(',');
  if(hasDot && hasComma){
    // Si están los dos, el ÚLTIMO que aparece es el separador decimal
    if(t.lastIndexOf(',') > t.lastIndexOf('.')){
      // Formato AR: puntos = miles, coma = decimal
      t = t.replace(/\./g,'').replace(',','.');
    } else {
      // Formato EN: comas = miles, punto = decimal
      t = t.replace(/,/g,'');
    }
  } else if(hasComma){
    const count = (t.match(/,/g)||[]).length;
    if(count > 1) t = t.replace(/,/g,'');      // múltiples comas → miles
    else t = t.replace(',','.');                // una sola coma → decimal
  } else if(hasDot){
    const count = (t.match(/\./g)||[]).length;
    if(count > 1) t = t.replace(/\./g,'');      // múltiples puntos → miles (AR)
    // un solo punto: se deja como decimal (formato canónico JS)
  }
  const n = parseFloat(t);
  if(!isFinite(n)) return 0;
  return neg ? -n : n;
}

/* Formato para mostrar el valor numérico dentro de un <input type="text">.
   Devuelve string vacío para 0/null/undefined (placeholder muestra "0"). */
function fmtInputNum(v){
  if(v==null || v==='' || v===0) return '';
  // Mostrar con coma decimal estilo AR (sin separador de miles para no confundir el parseo al re-leer)
  return String(v).replace('.', ',');
}

/* ---- totales y fórmulas ---- */
function catTotal(key,val){ const c=G_CAT_BY_KEY[key]; return c.cuentas.reduce((a,x)=>a+gv(val,x.c),0); }
/* Total con signo aplicado: egresos van con signo invertido (se restan al totalizar). */
function catSigned(key,val){ const t=catTotal(key,val); return G_EGRESOS.has(key) ? -t : t; }
function taxCredTotal(val){ return G_TAX.reduce((a,x)=>a+gv(val,x.c),0); }
function gComputar(val){
  const ub = G_GRUPO_UB.reduce((a,k)=>a+catSigned(k,val),0);
  const un = ub + G_GRUPO_B.reduce((a,k)=>a+catSigned(k,val),0);
  const impuesto = un>0 ? un*-0.30 : 0;
  // "Total Impuesto a las Ganancias" = subtotal de créditos / pagos a cuenta (G_TAX). 
  // La línea "Impuesto a las Ganancias" se muestra arriba como cálculo independiente.
  const totImp = taxCredTotal(val);
  // Resultado Después = Utilidad Neta + impuesto calculado + créditos.
  const res = un + impuesto + totImp;
  return {utilidad_bruta:ub, utilidad_neta:un, impuesto_ganancias:impuesto, total_impuesto_ganancias:totImp, resultado_despues:res};
}

/* =====================================================================
   RENDER (dispatcher según modo de vista)
   ===================================================================== */
function renderGestion(){
  // Aplicar visibilidad del segmented toggle según estado
  const toggle = document.getElementById('g-vista-toggle');
  if(toggle) toggle.querySelectorAll('.seg').forEach(b=>{
    b.classList.toggle('active', b.dataset.vista===gVista);
  });
  const periodoField = document.getElementById('g-periodo-field');
  if(periodoField) periodoField.style.display = gVista==='comparativa' ? 'none' : '';

  if(gVista==='comparativa') renderGestionComparativa();
  else renderGestionPorPeriodo();
}

/* ---- modo "Por período" (vista tradicional, dos columnas) ---- */
function renderGestionPorPeriodo(){
  // Restaurar estructura de tabla de 3 columnas (puede haber sido reescrita por la vista comparativa)
  const tabla = document.getElementById('g-table');
  if(tabla && !document.getElementById('g-tbody')){
    tabla.className = 'g-table';
    tabla.innerHTML = '<thead><tr><th>Concepto</th><th>Importe (ARS)</th><th>%</th></tr></thead><tbody id="g-tbody"></tbody>';
  }
  // Limpiar clase de escala de impresión por si veníamos de comparativa
  const wrap = document.getElementById('g-table-wrap');
  if(wrap) wrap.className = '';
  if(wrap) wrap.style.overflowX = 'auto';

  const tb=document.getElementById('g-tbody'); if(!tb) return;
  const sub=document.getElementById('g-sub');
  if(!gPeriodos.length){
    tb.innerHTML='<tr><td colspan="3" style="text-align:center;color:var(--ink-faint);padding:40px">Sin períodos. Usá <b>+ Período</b> para crear el primero y cargar los datos.</td></tr>';
    if(sub) sub.textContent='Estado de Resultados';
    return;
  }
  const {valores,editable} = gScope();
  const f = gComputar(valores);
  if(sub) sub.textContent = (gSel==='acumulado'?'Acumulado del ejercicio':(gScope().periodo?gScope().periodo.etiqueta:''))+' · importes en ARS';
  const meta=document.getElementById('g-print-meta'); if(meta) meta.textContent = gSel==='acumulado'?'Acumulado del ejercicio':(gScope().periodo?gScope().periodo.etiqueta:'');

  // Total Ventas del mes/acumulado: base para los porcentajes (= 100%).
  const ventasBase = catSigned('ventas', valores);
  const money=v=>{ const neg=v<0; return `<span class="mono ${neg?'neg':''}">${fmtARS(v)}</span>`; };
  const pctCell=v=>{ const r = (ventasBase && isFinite(ventasBase) && ventasBase!==0) ? v/ventasBase : NaN;
                     const txt = isFinite(r) ? _nfPct.format(r) : '—';
                     return `<td class="mono g-pct ${r<0?'neg':''}">${txt}</td>`; };
  let html='';
  for(const it of G_LAYOUT){
    if(it.t==='space'){ html+='<tr class="g-space"><td colspan="3"></td></tr>'; continue; }
    if(it.t==='cat'){
      const c=G_CAT_BY_KEY[it.key], val=catSigned(it.key,valores);
      html+=`<tr class="g-cat" onclick="openGCatModal('${it.key}')" title="Cargar / editar">
        <td><span class="g-chev">▸</span>${c.label}</td><td>${money(val)}</td>${pctCell(val)}</tr>`;
    } else if(it.t==='formula'){
      html+=`<tr class="g-formula g-${it.tone}"><td>${it.label}</td><td>${money(f[it.key])}</td>${pctCell(f[it.key])}</tr>`;
    } else if(it.t==='calc'){
      html+=`<tr class="g-row-ind"><td>${it.label} <span class="g-tag">−30% s/ Utilidad Neta</span></td><td>${money(f.impuesto_ganancias)}</td>${pctCell(f.impuesto_ganancias)}</tr>`;
    } else if(it.t==='taxblock'){
      html+=G_TAX.map(a=>`<tr class="g-row-ind g-click" onclick="openGCatModal('tax')" title="Cargar / editar">
        <td style="padding-left:30px">${a.n}</td><td>${money(gv(valores,a.c))}</td>${pctCell(gv(valores,a.c))}</tr>`).join('');
    }
  }
  tb.innerHTML=html;
  document.getElementById('g-periodo').disabled=false;
}

/* ---- modo "Comparativa mensual" (períodos como columnas + Acumulado + Promedio) ---- */
function renderGestionComparativa(){
  const tabla = document.getElementById('g-table'); if(!tabla) return;
  const sub = document.getElementById('g-sub');
  const meta = document.getElementById('g-print-meta');

  if(!gPeriodos.length){
    tabla.className = 'g-table';
    tabla.innerHTML = '<thead><tr><th>Concepto</th></tr></thead><tbody><tr><td style="text-align:center;color:var(--ink-faint);padding:40px">Sin períodos. Usá <b>+ Período</b> para crear el primero y cargar los datos.</td></tr></tbody>';
    if(sub) sub.textContent='Comparativa mensual';
    if(meta) meta.textContent='Comparativa mensual';
    return;
  }

  // Períodos ordenados cronológicamente (por fecha de cierre)
  const periodos = gPeriodos.slice().sort((a,b)=>(a.cierre||'').localeCompare(b.cierre||''));
  const N = periodos.length;

  // Pre-calcular: valores acumulados (suma cuenta-por-cuenta a lo largo de todos los períodos)
  const valAcum = {};
  periodos.forEach(p=>{ for(const k in p.valores) valAcum[k]=(valAcum[k]||0)+(+p.valores[k]||0); });
  // Pre-calcular fórmulas para cada período + acumulado
  const fPorPeriodo = periodos.map(p=>gComputar(p.valores));
  const fAcum = gComputar(valAcum);

  // Bases para los porcentajes:
  // - % Acum: ponderado por el tamaño de cada mes → row.acumulado / Ventas.acumulado
  // - % Prom: NO ponderado → promedio simple de (row[mes] / Ventas[mes]) sobre cada mes
  //           (cada mes pesa igual sin importar su volumen de ventas)
  const ventasAc = catSigned('ventas', valAcum);
  const ventasPorPeriodo = periodos.map(p => catSigned('ventas', p.valores));

  // Promedio simple de los % mensuales. Excluye meses con Ventas=0 (división inválida).
  function avgPctMensual(numPorPeriodo){
    let sum=0, count=0;
    for(let i=0; i<N; i++){
      const v = ventasPorPeriodo[i];
      if(v && isFinite(v) && v!==0){
        const r = numPorPeriodo[i]/v;
        if(isFinite(r)){ sum+=r; count++; }
      }
    }
    return count>0 ? sum/count : NaN;
  }

  if(sub) sub.textContent = `Comparativa mensual · ${N} período${N===1?'':'s'} · importes en ARS`;
  if(meta) meta.textContent = `Comparativa mensual · ${N} período${N===1?'':'s'}`;

  // Construir <thead>: Concepto + cada período + Acumulado + Promedio + % Acumulado + % Promedio
  const headPeriodos = periodos.map(p=>`<th>${etiquetaCorta(p)}</th>`).join('');
  const thead = `<thead><tr>
    <th>Concepto</th>
    ${headPeriodos}
    <th class="g-c-edge">Acumulado</th>
    <th class="g-c-edge">Promedio</th>
    <th class="g-c-pct g-c-pct-first" title="Acumulado de la fila ÷ Acumulado de Ventas (ponderado por tamaño de mes)">% Acum</th>
    <th class="g-c-pct" title="Promedio simple de los % mensuales (cada mes pesa igual)">% Prom</th>
  </tr></thead>`;

  // Helper para una celda numérica
  const cell = (v, edge)=>{
    const neg = v<0;
    return `<td class="mono ${neg?'neg':''}${edge?' g-c-edge':''}">${fmtARS(v)}</td>`;
  };
  // Helper para una celda de porcentaje con razón ya calculada (ratio puede ser NaN)
  const cellRatio = (ratio, first)=>{
    const ok = isFinite(ratio);
    const txt = ok ? _nfPct.format(ratio) : '—';
    const neg = ok && ratio<0;
    return `<td class="mono g-c-pct${first?' g-c-pct-first':''} ${neg?'neg':''}">${txt}</td>`;
  };
  // Helper para % a partir de num/base (usado para % Acum)
  const cellPctAc = (num, first)=>{
    if(!ventasAc || !isFinite(ventasAc) || ventasAc===0) return cellRatio(NaN, first);
    return cellRatio(num/ventasAc, first);
  };

  // Construir <tbody> reutilizando el layout
  let rows='';
  for(const it of G_LAYOUT){
    if(it.t==='space'){
      rows += `<tr class="g-c-space"><td colspan="${N+5}"></td></tr>`;
      continue;
    }
    if(it.t==='cat'){
      const label = G_CAT_BY_KEY[it.key].label;
      const valPorP = periodos.map(p=>catSigned(it.key, p.valores));
      const valAc = catSigned(it.key, valAcum);
      const valPr = N>0 ? valAc/N : 0;
      const pctProm = avgPctMensual(valPorP);
      rows += `<tr class="g-c-cat"><td>${label}</td>${valPorP.map(v=>cell(v)).join('')}${cell(valAc,true)}${cell(valPr,true)}${cellPctAc(valAc, true)}${cellRatio(pctProm)}</tr>`;
    } else if(it.t==='formula'){
      const valPorP = fPorPeriodo.map(f=>f[it.key]);
      const valAc = fAcum[it.key];
      const valPr = N>0 ? valAc/N : 0;
      const pctProm = avgPctMensual(valPorP);
      rows += `<tr class="g-c-formula g-c-${it.tone}"><td>${it.label}</td>${valPorP.map(v=>cell(v)).join('')}${cell(valAc,true)}${cell(valPr,true)}${cellPctAc(valAc, true)}${cellRatio(pctProm)}</tr>`;
    } else if(it.t==='calc'){
      const valPorP = fPorPeriodo.map(f=>f.impuesto_ganancias);
      const valAc = fAcum.impuesto_ganancias;
      const valPr = N>0 ? valAc/N : 0;
      const pctProm = avgPctMensual(valPorP);
      rows += `<tr class="g-c-calc"><td>${it.label} <span class="g-tag">−30% s/ Utilidad Neta</span></td>${valPorP.map(v=>cell(v)).join('')}${cell(valAc,true)}${cell(valPr,true)}${cellPctAc(valAc, true)}${cellRatio(pctProm)}</tr>`;
    } else if(it.t==='taxblock'){
      // Una fila por cada cuenta del bloque de créditos de impuesto
      for(const a of G_TAX){
        const valPorP = periodos.map(p=>gv(p.valores,a.c));
        const valAc = gv(valAcum,a.c);
        const valPr = N>0 ? valAc/N : 0;
        const pctProm = avgPctMensual(valPorP);
        rows += `<tr class="g-c-tax"><td>${a.n}</td>${valPorP.map(v=>cell(v)).join('')}${cell(valAc,true)}${cell(valPr,true)}${cellPctAc(valAc, true)}${cellRatio(pctProm)}</tr>`;
      }
    }
  }

  tabla.className = 'g-table g-comp';
  tabla.innerHTML = thead + `<tbody>${rows}</tbody>`;

  // Auto-escala para impresión basada en el ancho real del contenido.
  // Ancho disponible en A4 landscape con márgenes 7mm ≈ 1069px @ 96dpi.
  // Tabla: 240px (Concepto) + ~92px por cada columna de datos × (N + 4 columnas extra: Acum, Prom, %Acum, %Prom)
  // Para cada escala, ancho_max_que_entra = 1069 / escala. La condición chequea
  // que el contenido SUPERA ese máximo para forzar la escala siguiente más chica.
  const wrap = document.getElementById('g-table-wrap');
  if(wrap){
    wrap.style.overflowX = 'auto';
    wrap.className = '';
    const ancho = 240 + (N+4)*92;
    if(ancho > 2138)      wrap.classList.add('g-scale-45');   // > 2138 → 0.45 (cubre hasta 2375)
    else if(ancho > 1944) wrap.classList.add('g-scale-50');   // 1944-2138 → 0.50 (max 2138)
    else if(ancho > 1781) wrap.classList.add('g-scale-55');   // 1781-1944 → 0.55 (max 1944)
    else if(ancho > 1644) wrap.classList.add('g-scale-60');   // 1644-1781 → 0.60 (max 1781)
    else if(ancho > 1527) wrap.classList.add('g-scale-65');   // 1527-1644 → 0.65 (max 1644)
    else if(ancho > 1425) wrap.classList.add('g-scale-70');   // 1425-1527 → 0.70 (max 1527)
    else if(ancho > 1336) wrap.classList.add('g-scale-75');   // 1336-1425 → 0.75 (max 1425)
    else if(ancho > 1257) wrap.classList.add('g-scale-80');   // 1257-1336 → 0.80 (max 1336)
    else if(ancho > 1188) wrap.classList.add('g-scale-85');   // 1188-1257 → 0.85 (max 1257)
    else if(ancho > 1162) wrap.classList.add('g-scale-90');   // 1162-1188 → 0.90 (max 1188)
    else if(ancho > 1125) wrap.classList.add('g-scale-92');   // 1125-1162 → 0.92 (max 1162)
    else if(ancho > 1069) wrap.classList.add('g-scale-95');   // 1069-1125 → 0.95 (max 1125)
    // ancho ≤ 1069: entra al 100% sin escalar
  }
}

/* Etiqueta corta para encabezado de columna en vista comparativa.
   Si el período tiene etiqueta tipo "Abril 2026", devuelve "abr 26". */
function etiquetaCorta(p){
  if(p.cierre){
    const d = new Date(p.cierre+'T00:00');
    if(!isNaN(d)){
      const mes = d.toLocaleDateString('es-AR',{month:'short'}).replace('.','');
      const yy = String(d.getFullYear()).slice(-2);
      return `${mes} ${yy}`;
    }
  }
  return p.etiqueta || '—';
}

/* Toggle de modo (botones "Por período" / "Comparativa mensual") */
function setGVista(v){
  if(v!=='periodo' && v!=='comparativa') return;
  if(gVista===v) return;
  gVista = v;
  renderGestion();
}

/* =====================================================================
   MODAL DE CARGA POR CATEGORÍA (o créditos de ganancias)
   ===================================================================== */
function openGCatModal(key){
  const {valores,editable,periodo} = gScope();
  if(!editable){ alert('Seleccioná un período (no «Acumulado») para cargar o editar valores.'); return; }
  gCatActual=key;
  const esTax = key==='tax';
  const cuentas = esTax ? G_TAX : G_CAT_BY_KEY[key].cuentas;
  const titulo = esTax ? 'Créditos y pagos a cuenta de Ganancias' : G_CAT_BY_KEY[key].label;
  document.getElementById('g-cat-title').textContent = titulo;
  document.getElementById('g-cat-sub').textContent = (periodo?periodo.etiqueta:'')+' · importes en ARS · ingresá los montos en positivo (el sistema asigna los signos)';
  let html='', lastG=null;
  cuentas.forEach((a,i)=>{
    if(a.g && a.g!==lastG){ html+=`<div class="cm-group">${a.g}</div>`; lastG=a.g; }
    const raw = valores[a.c]!=null ? valores[a.c] : '';
    const val = fmtInputNum(raw);
    html+=`<div class="g-line"><label title="${a.c}">${a.n}</label><input type="text" inputmode="decimal" autocomplete="off" id="g-in-${i}" data-c="${a.c}" value="${val}" oninput="gCatCalc()" placeholder="0"></div>`;
  });
  document.getElementById('g-cat-body').innerHTML=html;
  gCatCalc();
  document.getElementById('g-cat-modal').classList.add('show');
}
function closeGCatModal(){ document.getElementById('g-cat-modal').classList.remove('show'); }
function gCatCalc(){
  let tot=0;
  document.querySelectorAll('#g-cat-body input').forEach(inp=>tot+=parseNum(inp.value));
  document.getElementById('g-cat-total').innerHTML = `Total: <b class="mono ${tot<0?'neg':''}">${fmtARS(tot)}</b>`;
}
async function saveGCat(){
  const p=gScope().periodo; if(!p){ alert('No hay período seleccionado.'); return; }
  if(!db){ alert('Conectá Supabase para guardar.'); return; }
  const valores={...p.valores};
  document.querySelectorAll('#g-cat-body input').forEach(inp=>{
    const c=inp.dataset.c, v=inp.value;
    const num = parseNum(v);
    if(v.trim()==='' || num===0) delete valores[c]; else valores[c]=num;
  });
  const r=await db.from('gestion_periodos').update({valores}).eq('id',p.id);
  if(r.error){ alert('No se pudo guardar: '+r.error.message); return; }
  p.valores=valores; closeGCatModal(); renderGestion();
}

/* =====================================================================
   NUEVO PERÍODO
   ===================================================================== */
function openGNewPeriod(){
  document.getElementById('gp-fecha').value=new Date().toISOString().slice(0,10);
  document.getElementById('gp-etiqueta').value='';
  document.getElementById('g-period-modal').classList.add('show');
}
function closeGPeriod(){ document.getElementById('g-period-modal').classList.remove('show'); }
async function saveGPeriod(){
  const fecha=document.getElementById('gp-fecha').value;
  let etiqueta=document.getElementById('gp-etiqueta').value.trim();
  if(!fecha){ alert('Indicá la fecha del período.'); return; }
  if(!etiqueta) etiqueta=fechaLarga(fecha);
  if(!db){ alert('Conectá Supabase para guardar.'); return; }
  const r=await db.from('gestion_periodos').insert({fecha,etiqueta,valores:{}}).select('id').single();
  if(r.error){ alert('No se pudo crear: '+r.error.message); return; }
  gSel=r.data.id; closeGPeriod(); await loadGestion();
}

/* =====================================================================
   EXPORT / NAV
   ===================================================================== */
function exportGestion(){
  if(typeof XLSX==='undefined'){ alert('No se pudo cargar la librería de Excel.'); return; }
  const {valores}=gScope(); const f=gComputar(valores);
  const aoa=[["DEAM SRL — Informe de Gestión"],[gSel==='acumulado'?'Acumulado':(gScope().periodo?gScope().periodo.etiqueta:'')],[],["Concepto","Importe ARS"]];
  for(const it of G_LAYOUT){
    if(it.t==='space'){ aoa.push([]); }
    else if(it.t==='cat'){ aoa.push([G_CAT_BY_KEY[it.key].label, catSigned(it.key,valores)]); }
    else if(it.t==='formula'){ aoa.push([it.label, f[it.key]]); }
    else if(it.t==='calc'){ aoa.push([it.label, f.impuesto_ganancias]); }
    else if(it.t==='taxblock'){ G_TAX.forEach(a=>aoa.push(["   "+a.n, gv(valores,a.c)])); }
  }
  const ws=XLSX.utils.aoa_to_sheet(aoa); ws['!cols']=[{wch:42},{wch:20}];
  const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,"Informe de Gestión");
  XLSX.writeFile(wb,"Informe_de_Gestion.xlsx");
}

window.openGCatModal=openGCatModal; window.closeGCatModal=closeGCatModal; window.gCatCalc=gCatCalc; window.saveGCat=saveGCat;
window.openGNewPeriod=openGNewPeriod; window.closeGPeriod=closeGPeriod; window.saveGPeriod=saveGPeriod; window.exportGestion=exportGestion;
window.setGVista=setGVista;

document.addEventListener('DOMContentLoaded',()=>{
  const sel=document.getElementById('g-periodo');
  if(sel) sel.addEventListener('change',()=>{ gSel=sel.value; renderGestion(); });
  const cm=document.getElementById('g-cat-modal'); if(cm) cm.addEventListener('click',e=>{ if(e.target.id==='g-cat-modal')closeGCatModal(); });
  const pm=document.getElementById('g-period-modal'); if(pm) pm.addEventListener('click',e=>{ if(e.target.id==='g-period-modal')closeGPeriod(); });
});

/* init: cargar tras un tick para asegurar que app.js definió db */
setTimeout(loadGestion, 50);
