# Reporte de seguridad — INCI Detective

**Fecha:** 2026-07-15 · **Alcance:** app en producción (Vercel), Cloudflare Worker
`inci-detective-api`, Supabase (RLS + RPC), bundle del cliente y dependencias.
**Método:** revisión de código + pruebas activas contra los endpoints en vivo
(sin escrituras destructivas). Autopentest sobre sistemas propios.

## Resumen

Se encontró **1 vulnerabilidad de severidad Alta** (ya corregida) y varias
observaciones de bajo riesgo. El resto de la superficie resistió bien: sin
secretos en el bundle, 0 vulnerabilidades en dependencias, sin XSS, RLS sólido.

| # | Severidad | Hallazgo | Estado |
|---|-----------|----------|--------|
| 1 | **Alta** | `/api/obf` sin autenticación: cualquiera escribe en Open Beauty Facts con las credenciales de la app | **Corregido** |
| 2 | Baja | `/api/log` acepta escrituras anónimas (spam de logs) | Mitigado (rate-limit) / aceptado |
| 3 | Baja | `confirm_product()` permite inflar `confirmations` de cualquier código | Aceptado (bajo impacto) |
| 4 | Informativo | CORS devuelve el primer origen permitido ante orígenes no listados | Correcto por diseño |

---

## 1. [ALTA] Proxy `/api/obf` sin autenticación — abuso de credenciales delegadas

**Descripción.** El endpoint `POST /api/obf` escribe productos en Open Beauty
Facts usando las credenciales de la cuenta `merlycbenitez`, guardadas como
secretos del Worker. El endpoint no exigía ninguna identidad: CORS solo protege
peticiones de navegador, pero un cliente como `curl` lo ignora por completo.

**Prueba de concepto (no destructiva).** Una petición anónima con cuerpo
malformado devolvía `400 bad_request` — es decir, llegaba al handler sin ningún
control de autenticación:

```
curl -X POST https://inci-detective-api.merbeni.workers.dev/api/obf \
  -H 'Content-Type: application/json' -d '{"code":"123"}'
→ {"error":"bad_request"}   (400, no 401)
```

**Impacto.** Un atacante podía:
- crear ilimitados códigos de barras nuevos en la base pública mundial con
  ingredientes/nombres arbitrarios, todos atribuidos a la cuenta del usuario
  (la guarda anti-pisado solo protege productos que YA tienen ingredientes);
- ensuciar/vandalizar un dataset público en nombre del usuario, arriesgando el
  baneo de la cuenta OBF.

El límite por IP (20/min) no alcanzaba: se elude rotando IPs.

**Corrección aplicada.**
- **Worker** ([worker/index.js](../worker/index.js)): `/api/obf` ahora exige un
  JWT de Supabase válido (`AUTH_REQUIRED`). Sin sesión → `401 auth_required`.
  Eleva la barrera de "cualquier curl" a "una cuenta registrada y revocable", y
  aplica una cuota por usuario en vez de por IP.
- **Cliente** ([openBeautyFacts.js](../src/capture/openBeautyFacts.js)):
  `contributeToObf` adjunta el `Authorization: Bearer <jwt>`.
- **UI** ([Analysis.jsx](../src/screens/Analysis.jsx)): la casilla de contribución
  solo se ofrece a usuarios con sesión, para no prometer una escritura que daría
  401. Esto alinea OBF con el catálogo comunitario, que ya exigía sesión.

**Verificación.** Tras el fix, la petición anónima devuelve `401`. Tests E2E:
uno confirma que con sesión el POST lleva el `Bearer`; otro (regresión de
seguridad) confirma que sin sesión la casilla no aparece.

---

## 2. [BAJA] `/api/log` acepta escrituras anónimas

`POST /api/log` (telemetría de errores del cliente) no exige auth. Un atacante
podría enviar entradas de log basura. **Mitigantes existentes:** rate-limit de
20/min por IP, campos recortados a 600 caracteres y serializados con
`JSON.stringify` (los saltos de línea se escapan, así que no hay inyección de
log ni forja de líneas separadas). Riesgo residual: ruido/costo marginal. Se
acepta; endurecerlo requeriría autenticación, lo que rompería el reporte de
errores de usuarios anónimos (su razón de ser).

## 3. [BAJA] `confirm_product()` permite inflar confirmaciones

Cualquier usuario autenticado puede llamar `confirm_product(barcode)` repetidas
veces sobre cualquier código, inflando el contador `confirmations`. No expone ni
altera datos ajenos: solo un número reputacional. Corregirlo de raíz exigiría
una tabla de votos por usuario. Se acepta por bajo impacto.

## 4. [INFO] Comportamiento de CORS

Ante un `Origin` no permitido, el Worker responde con el primer origen de la
lista blanca como `Access-Control-Allow-Origin`. Esto es correcto: impide que un
sitio de origen distinto lea las respuestas desde un navegador. No es una
vulnerabilidad.

---

## Comprobaciones que pasaron

- **Secretos:** el bundle de producción solo contiene la anon key *publishable*
  y la URL de Supabase (públicas por diseño). Sin `service_role`, sin clave de
  Gemini, sin credenciales de OBF.
- **Dependencias:** `npm audit --omit=dev` → 0 vulnerabilidades.
- **XSS:** el texto de la IA (`AiText`) y la vista compartida se renderizan con
  JSX (React escapa); las meta-tags OG del Worker (`share.js`) pasan por un
  escapador HTML. Sin `dangerouslySetInnerHTML` ni `innerHTML`.
- **RLS (Supabase):** cada usuario solo ve sus filas; los escaneos compartidos
  son de solo lectura pública; el catálogo comunitario solo lo reescribe su
  contribuidor original (SEC-10), con historial de versiones auditable.
- **`share_id`:** aleatorio de 48 bits vía `crypto.randomUUID` — no enumerable.
- **SSRF / inyección:** los destinos (OBF, Gemini) están hardcodeados; la
  entrada de `/api/obf` valida longitud, formato de código y allowlist de idioma;
  la clave de Gemini viaja en header, no en la URL.
