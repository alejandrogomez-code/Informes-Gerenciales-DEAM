# DEAM SRL — Informes Gerenciales

Dashboard de informes gerenciales estilo Odoo. Esta primera versión incluye dos reportes:

- **Capital de Trabajo** — estructura de activos, pasivos e indicadores (Liquidez, Apalancamiento, Endeudamiento) con semáforo Bien / Alerta / Urgente.
- **Punto de Equilibrio** — evolución del punto de equilibrio en USD y carga de períodos con cálculo automático del margen de contribución, punto de equilibrio y margen de seguridad.

Ambos son exportables a Excel e imprimibles a PDF en una sola página.

Stack: HTML/CSS/JS estático + **Supabase** (Postgres) + **Vercel**. Sin paso de build.

---

## 1. Supabase

1. Creá un proyecto en [supabase.com](https://supabase.com).
2. Abrí **SQL Editor → New query**, pegá el contenido de `supabase/schema.sql` y ejecutá (Run).
3. Repetí con `supabase/seed.sql` para cargar los datos iniciales del Excel (cierres de abril y mayo, cierre parcial del 21‑may y seis períodos de equilibrio de ejemplo).
4. En **Project Settings → API**, copiá:
   - **Project URL** (algo como `https://abcdxyz.supabase.co`)
   - **anon public key**

> La `anon key` es pública por diseño y es segura de exponer mientras haya Row Level Security activo. El esquema deja, por defecto, acceso completo al rol anónimo para que la app funcione sin login mientras se itera. Para producción, usá las políticas "autenticadas" comentadas al final de `schema.sql` junto con Supabase Auth.

## 2. Configurar la app

Editá `config.js` y reemplazá los placeholders con tus valores:

```js
window.DEAM_CONFIG = {
  SUPABASE_URL: "https://abcdxyz.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOi..."
};
```

## 3. GitHub

```bash
git init
git add .
git commit -m "DEAM Informes — Capital de Trabajo y Punto de Equilibrio"
git branch -M main
git remote add origin https://github.com/TU-USUARIO/deam-informes.git
git push -u origin main
```

## 4. Vercel

1. En [vercel.com](https://vercel.com) → **Add New → Project** → importá el repo.
2. Framework Preset: **Other**. Build Command: vacío. Output Directory: vacío (raíz).
3. **Deploy**.

No hacen falta variables de entorno: al ser un sitio estático sin build, la configuración vive en `config.js` (committeado). Para no exponer la URL/clave en el repo público, podés mantenerlo privado.

---

## Probar localmente

```bash
npx serve .
# o
python3 -m http.server 5500
```

Abrí `http://localhost:5500`.

---

## Estructura

```
deam-informes/
├── index.html              Marcado de la app
├── styles.css              Estilos (tema Odoo)
├── app.js                  Lógica + conexión Supabase
├── config.js               URL + anon key (completar)
├── config.example.js       Plantilla de configuración
├── vercel.json             Headers / clean URLs
├── package.json
└── supabase/
    ├── schema.sql          Tablas + RLS
    └── seed.sql            Datos iniciales
```

## Modelo de datos

- **`cierres`** — un registro por cierre de capital de trabajo (`mensual` o `parcial`) con su tipo de cambio.
- **`cierre_lineas`** — rubros de cada cierre (`activo_corriente`, `stock`, `pasivo`) con monto en ARS y USD. Totales, conversiones, variaciones e indicadores se calculan en la app.
- **`equilibrio_periodos`** — un registro por período del punto de equilibrio. Ventas y costos se cargan en ARS; el tipo de cambio convierte todo a USD.

La variación "mes anterior" se calcula automáticamente comparando cada cierre con el último cierre **mensual** previo. Cargá meses anteriores para que aparezcan las variaciones de los primeros cierres.

## Próximas etapas

- Carga/edición de cierres de Capital de Trabajo desde la interfaz (hoy se cargan por SQL).
- Umbrales de indicadores configurables y guardados en base.
- Reportes: Informe de Gestión, Proyección, Presupuesto, Análisis.
- Autenticación con Supabase Auth.
