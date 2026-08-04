/* =====================================================================
   DEAM SRL · Marca de última actualización (compartida)
   ---------------------------------------------------------------------
   Replica el comportamiento que ya tenía Proyección, pero para todas las
   secciones. Guarda un timestamp por sección en la tabla
   `seccion_updates(seccion text primary key, updated_at timestamptz)` de
   Supabase, de modo que la marca sea la misma para todos los usuarios.

   Uso:
     await touchSeccion('capital');     // al guardar/editar/borrar datos
     renderUpdated('capital');          // al pintar la vista
     await loadUpdates();               // una vez, en el arranque
   ===================================================================== */

/* Cache en memoria: { seccion: isoString } */
let SEC_UPDATED = {};

/* IDs de los <div> donde se pinta la marca en cada sección */
const SEC_UPD_EL = {
  capital:     'cap-updated',
  equilibrio:  'be-updated',
  gestion:     'g-updated',
  presupuesto: 'pr-updated',
  analisis:    'an-updated',
};

/* Formato "12/07/2026 15:21" en horario local */
function fmtUpdated(iso){
  if(!iso) return null;
  const d = new Date(iso);
  if(isNaN(d)) return null;
  const p = n => String(n).padStart(2,'0');
  return `${p(d.getDate())}/${p(d.getMonth()+1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/* Pinta la marca de una sección en su <div> correspondiente */
function renderUpdated(seccion){
  const el = document.getElementById(SEC_UPD_EL[seccion]);
  if(!el) return;
  const txt = fmtUpdated(SEC_UPDATED[seccion]);
  el.textContent = txt ? `Última actualización: ${txt}` : 'Sin actualizaciones registradas';
}

/* Registra "ahora" como última actualización de la sección y lo persiste */
async function touchSeccion(seccion){
  const iso = new Date().toISOString();
  SEC_UPDATED[seccion] = iso;
  renderUpdated(seccion);                 // refresco inmediato en pantalla
  if(typeof db === 'undefined' || !db) return;
  try{
    const r = await db.from('seccion_updates')
      .upsert({seccion, updated_at:iso}, {onConflict:'seccion'});
    if(r.error) throw r.error;
  }catch(e){ console.warn('touch seccion_updates', seccion, e); }
}

/* Carga todas las marcas desde Supabase (una vez, al iniciar) */
async function loadUpdates(){
  if(typeof db === 'undefined' || !db) return;
  try{
    const r = await db.from('seccion_updates').select('*');
    if(r.error) throw r.error;
    SEC_UPDATED = {};
    (r.data||[]).forEach(row => { SEC_UPDATED[row.seccion] = row.updated_at; });
  }catch(e){ console.warn('load seccion_updates', e); }
}

window.touchSeccion = touchSeccion;
window.renderUpdated = renderUpdated;
window.loadUpdates   = loadUpdates;
