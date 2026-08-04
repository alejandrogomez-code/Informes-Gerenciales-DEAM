/* =====================================================================
   DEAM SRL · Marca de última actualización (compartida)
   ===================================================================== */

let SEC_UPDATED = {};

const SEC_UPD_EL = {
  capital:     'cap-updated',
  equilibrio:  'be-updated',
  gestion:     'g-updated',
  presupuesto: 'pr-updated',
  analisis:    'an-updated',
};

function fmtUpdated(iso){
  if(!iso) return null;
  const d = new Date(iso);
  if(isNaN(d)) return null;
  const p = n => String(n).padStart(2,'0');
  return `${p(d.getDate())}/${p(d.getMonth()+1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function renderUpdated(seccion){
  const el = document.getElementById(SEC_UPD_EL[seccion]);
  if(!el) return;
  const txt = fmtUpdated(SEC_UPDATED[seccion]);
  el.textContent = txt ? `Última actualización: ${txt}` : 'Sin actualizaciones registradas';
}

async function touchSeccion(seccion){
  const iso = new Date().toISOString();
  SEC_UPDATED[seccion] = iso;
  renderUpdated(seccion);
  if(typeof db === 'undefined' || !db) return;
  try{
    const r = await db.from('seccion_updates')
      .upsert({seccion, updated_at:iso}, {onConflict:'seccion'});
    if(r.error) throw r.error;
  }catch(e){ console.warn('touch seccion_updates', seccion, e); }
}

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
