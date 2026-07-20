/* =====================================================================
   DEAM SRL · Informes Gerenciales — Endpoint de Análisis
   Función serverless (Vercel). Recibe el contexto con los datos de los
   informes y devuelve el reporte generado por Claude.

   La API key vive en la variable de entorno ANTHROPIC_API_KEY del proyecto
   en Vercel (Settings → Environment Variables). NUNCA se expone al browser.
   ===================================================================== */

const SYSTEM_PROMPT = `Sos analista financiero senior especializado en empresas importadoras argentinas. Analizás DEAM SRL: importadora y distribuidora de equipamiento médico (marca LEEX, origen China), regulada por ANMAT, con sede en Córdoba.

MODELO DE NEGOCIO — contexto imprescindible para leer bien los números:
- Ciclo de importación largo: entre el pago al exterior y el cobro final pasan meses. El capital queda inmovilizado en stock (en depósito y en tránsito).
- La empresa anticipa cobranza descontando cheques de clientes. Por eso la cartera de cheques es el activo corriente dominante y NO debe leerse como cobranza lenta: es cuasi-caja.
- Estructura naturalmente apalancada: el financiamiento (proveedores del exterior y bancos) sostiene el ciclo. Un apalancamiento de 3x a 4x es normal en este modelo, no una señal de alarma por sí sola.
- Exposición cambiaria: el pasivo está mayormente en dólares y los ingresos en pesos. Un salto del tipo de cambio golpea el patrimonio.

ENTREGÁ un reporte con esta estructura exacta, usando estos títulos:

## 1. Situación actual
Cinco o seis líneas. Foto del momento: qué muestran la liquidez, el endeudamiento y el resultado del período. Sin tecnicismos innecesarios.

## 2. Señales de corto plazo (próximos 3 meses)
- Riesgos de caja concretos: meses con saldo proyectado negativo o ajustado, vencimientos concentrados.
- Desvíos relevantes contra el presupuesto y contra el ejercicio de referencia.
- Qué mirar de cerca este mes.

## 3. Señales de mediano plazo (3 a 12 meses)
- Tendencia del margen y del resultado.
- Evolución de la estructura de financiamiento.
- Sensibilidad al tipo de cambio: qué pasa si el dólar se mueve más rápido de lo proyectado.

## 4. Recomendaciones accionables
Máximo cinco, ordenadas por urgencia. Cada una indica: qué hacer, por qué, y con qué indicador se verifica si funcionó. Concretas, no genéricas.

REGLAS:
- Citá siempre las cifras en las que basás cada afirmación.
- Distinguí lo que los datos muestran de lo que inferís.
- Si un mes está marcado "en revisión", advertí que es provisorio.
- Si faltan datos para una conclusión, decilo en vez de suponer.
- Nada de consejos de manual: todo referido a estos números concretos.
- Español rioplatense, tono profesional y directo. Sin relleno ni introducciones.
- Formato markdown con los títulos indicados.`;

export default async function handler(req, res){
  if(req.method !== 'POST'){
    return res.status(405).json({error:'Método no permitido'});
  }
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if(!apiKey){
    return res.status(500).json({error:'Falta configurar ANTHROPIC_API_KEY en las variables de entorno de Vercel.'});
  }

  try{
    const { contexto } = req.body || {};
    if(!contexto || typeof contexto !== 'string'){
      return res.status(400).json({error:'No se recibieron datos para analizar.'});
    }

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method:'POST',
      headers:{
        'content-type':'application/json',
        'x-api-key':apiKey,
        'anthropic-version':'2023-06-01',
      },
      body: JSON.stringify({
        model:'claude-sonnet-4-6',
        max_tokens:4000,
        system: SYSTEM_PROMPT,
        messages:[{ role:'user', content:`Analizá los siguientes datos de DEAM SRL:\n\n${contexto}` }],
      }),
    });

    if(!r.ok){
      const t = await r.text();
      console.error('anthropic error', r.status, t);
      return res.status(502).json({error:`La API respondió ${r.status}. Revisá la clave y el saldo de la cuenta.`});
    }

    const data = await r.json();
    const texto = (data.content||[])
      .filter(b=>b.type==='text')
      .map(b=>b.text)
      .join('\n');

    return res.status(200).json({ reporte: texto, generado: new Date().toISOString() });
  }catch(e){
    console.error('analizar', e);
    return res.status(500).json({error:'Error al generar el análisis: '+(e.message||e)});
  }
}
