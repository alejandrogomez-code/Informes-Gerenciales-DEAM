/* =====================================================================
   DEAM SRL · Estado global "mes en revisión"
   Fuente única del flag por mes calendario (anio, mes). Un mes marcado
   aquí aparece como "En revisión" en todos los informes que lo consultan
   (Gestión, Presupuesto, Punto de Equilibrio).

   Tabla: meses_revision (anio, mes, en_revision, nota)
   ===================================================================== */

/* Estado en memoria: Set de claves "anio-mes" en revisión */
const REV = { set:new Set(), loaded:false };

const revKey = (anio, mes) => `${anio}-${mes}`;

/* Carga inicial desde Supabase (idempotente; se puede llamar varias veces) */
async function loadRevision(){
  if(typeof db==='undefined' || !db){ REV.loaded=true; return; }
  try{
    const r = await db.from('meses_revision').select('*').eq('en_revision', true);
    if(r.error) throw r.error;
    REV.set = new Set((r.data||[]).map(x=>revKey(+x.anio, +x.mes)));
  }catch(e){ console.warn('revision load', e); }
  REV.loaded = true;
}

/* ¿El mes (anio, mes) está en revisión? */
function revIsUnderReview(anio, mes){ return REV.set.has(revKey(anio, mes)); }

/* Igual, pero a partir de una fecha YYYY-MM-DD */
function revIsFecha(fecha){
  if(!fecha) return false;
  const d = new Date(fecha+'T00:00:00');
  return revIsUnderReview(d.getFullYear(), d.getMonth()+1);
}

/* Alterna el estado de un mes y persiste. Devuelve el nuevo estado (bool). */
async function revToggle(anio, mes){
  const k = revKey(anio, mes);
  const nuevo = !REV.set.has(k);
  if(nuevo) REV.set.add(k); else REV.set.delete(k);
  if(typeof db!=='undefined' && db){
    try{
      const r = await db.from('meses_revision')
        .upsert({anio, mes, en_revision:nuevo}, {onConflict:'anio,mes'});
      if(r.error) throw r.error;
    }catch(e){
      // revertir en memoria si falló
      if(nuevo) REV.set.delete(k); else REV.set.add(k);
      alert('No se pudo cambiar el estado de revisión: '+(e.message||e));
      return !nuevo;
    }
  }
  // re-render de los informes que estén activos
  if(typeof renderGestion==='function' && typeof gPeriodos!=='undefined') { try{ renderGestion(); }catch(_){} }
  if(typeof renderPresupuesto==='function' && typeof PR!=='undefined' && PR.loaded) { try{ renderPresupuesto(); }catch(_){} }
  if(typeof renderBeTable==='function') { try{ renderBeTable(); }catch(_){} }
  return nuevo;
}

/* Etiqueta HTML reutilizable */
const REV_BADGE = '<span class="rev-badge">En revisión</span>';

window.loadRevision=loadRevision; window.revToggle=revToggle;
window.revIsUnderReview=revIsUnderReview; window.revIsFecha=revIsFecha;
window.REV_BADGE=REV_BADGE;

/* Cargar al inicio */
setTimeout(loadRevision, 40);
