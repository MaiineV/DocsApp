# DocsApp API (`/api/v1`)

API REST para operar tus documentos desde un proyecto local: leer, crear, editar y
borrar docs en cualquiera de tus equipos, autenticándote **con tu cuenta**. La
autorización es la misma que en la web (RLS + roles por equipo: `owner` > `admin` >
`editor` > `viewer`), así que la API nunca te deja hacer algo que no podrías hacer
desde la UI.

> **Fuente de verdad y markdown.** El cuerpo de cada doc vive como un CRDT de Yjs
> (lo que habilita el tiempo real). Markdown es un **formato de la API**, no el
> almacenamiento: al leer se deriva de los bloques (lossy para @menciones), al
> escribir se parsea a bloques y se mergea en el CRDT. El tiempo real queda intacto:
> una edición por API **se ve en vivo** en editores abiertos.

Base URL (prod): `https://docs-app-orcin.vercel.app/api/v1` · (local): `http://localhost:3000/api/v1`

---

## Autenticación

Todas las rutas requieren el header:

```
Authorization: Bearer <token>
```

Hay **dos formas** de obtener ese `<token>`. Para scripts/integraciones headless usá
un **Personal Access Token** (recomendado): es estable, revocable y no depende del
método de login. También se sigue aceptando un **JWT de Supabase** (login clásico).

### Personal Access Tokens (PAT) — recomendado

Un PAT es una clave `dapp_…` que creás desde la web en **`/profile/tokens`**. Se
muestra **una sola vez** al crearla (guardala): en la base solo queda su hash.

```
Authorization: Bearer dapp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

- **Scopes:** `read` (solo `GET`) o `read_write` (todo). Un token `read` que intente
  escribir → `403`.
- **Vencimiento:** opcional (30 días / 90 días / sin vencimiento).
- **Revocar:** desde `/profile/tokens`; deja de funcionar al instante.
- **Cuentas de Google:** funcionan sin fricción — el PAT no depende del login, así que
  no necesitás password ni flujo interactivo.
- La autorización sigue siendo la misma RLS por equipo: el PAT actúa **como vos**.

### JWT Bearer (login clásico)

El `access_token` es un JWT de Supabase que se obtiene logueándote con tu cuenta:

```js
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
const { data, error } = await supabase.auth.signInWithPassword({
  email: 'vos@ejemplo.com',
  password: '••••••',
})
const token = data.session.access_token        // ← usar como Bearer
// El refresh es automático mientras uses el mismo `supabase` (data.session.refresh_token).
```

- El token vence (~1 h) y se renueva solo con el cliente de Supabase. Para un script,
  guardá el `refresh_token` y dejá que `supabase-js` lo refresque. (Para headless, un
  PAT es más simple.)

Errores de auth → `401` con `{ "error": { "code": "unauthorized", "message": "..." } }`.

---

## Formato del cuerpo (`markdown` | `json`)

- **`markdown`** (default): cómodo y legible. Lossy para tipos propios de BlockNote
  (@menciones se vuelven texto).
- **`json`**: bloques de BlockNote crudos. Lossless (ida y vuelta exacto).

Lectura: `GET ...?format=markdown|json`. Escritura: campo `format` en el body (si se
omite, se infiere: `content` string → markdown, `content` array → json).

---

## Endpoints

### `GET /teams`
Equipos del usuario + rol.
```json
{ "teams": [ { "id": "uuid", "name": "Rollgeon", "role": "owner" } ] }
```

### `GET /teams/{teamId}/documents`
Docs del equipo (plano; usá `parent_id` para reconstruir el árbol y `position`
—ascendente— para ordenar hermanos). `icon` es el emoji del doc (o `null`).
```json
{ "documents": [ { "id": "uuid", "title": "Specs", "icon": "📄", "parent_id": null,
  "position": 1024, "updated_at": "..." } ] }
```

### `POST /teams/{teamId}/documents`
Crea un doc. Requiere rol `editor+` en el equipo.
```jsonc
// body
{
  "title": "Notas de la API",        // opcional
  "icon": "📄",                       // opcional (emoji, máx. 16 chars)
  "parent_id": null,                  // opcional (debe ser del mismo team)
  "content": "# Hola\n\ntexto...",   // opcional (siembra el cuerpo)
  "format": "markdown"                // opcional
}
```
→ `201` `{ "document": { "id", "title", "icon", "team_id", "parent_id", "position", "updated_at" } }`

### `GET /documents/{id}?format=markdown`
Lee un doc + cuerpo.
```json
{ "document": { "id": "...", "title": "...", "icon": null, "team_id": "...", "parent_id": null,
  "position": 1024, "updated_at": "...", "format": "markdown", "content": "# Hola\n\ntexto..." } }
```
(`format=json` → `content` es un array de bloques.)

### `PATCH /documents/{id}`
Edita título, ícono y/o cuerpo. Requiere `editor+`. El cuerpo se **reemplaza** y se
emite en vivo por Realtime a los editores abiertos. `"icon": null` quita el emoji.
```jsonc
{ "title": "Nuevo título", "icon": "🚀", "content": "# Reemplazado\n\n...", "format": "markdown" }
```
→ `200` `{ "ok": true, "titleUpdated": true, "iconUpdated": true, "bodyUpdated": true, "broadcast": true, "version": 5 }`

### `DELETE /documents/{id}`
Manda el doc **a la papelera** (soft-delete) junto con sus subpáginas (cascada). Es **recuperable** desde
la web (`/docs/trash`). Requiere `editor+`. → `204` sin body.

---

## Errores

Shape uniforme: `{ "error": { "code": "...", "message": "..." } }`.

| Status | code | Cuándo |
|---|---|---|
| 400 | `bad_request` | body/markdown inválido |
| 401 | `unauthorized` | falta el Bearer o token inválido/vencido/revocado |
| 403 | `forbidden` | sin permiso (`viewer` editando, o token `read` escribiendo) |
| 404 | `not_found` | doc inexistente o sin acceso |
| 409 | `conflict` | conflicto de versión al guardar (reintentá) |
| 429 | `too_many_requests` | superaste el rate limit (ver `Retry-After`) |

---

## Rate limiting

Toda la API está limitada a **120 requests por minuto por usuario** (todos tus PATs
y tu JWT comparten el mismo presupuesto). **Cada** respuesta incluye:

```
X-RateLimit-Limit: 120
X-RateLimit-Remaining: 117
X-RateLimit-Reset: 1719763200        # epoch (segundos) del reinicio de la ventana
```

Al excederlo → `429` con `Retry-After: <segundos>` (además de los `X-RateLimit-*`).
Esperá ese tiempo y reintentá.

---

## Ejemplo de cliente local

Ver `scripts/api-smoke.mjs` — hace login, lista equipos, crea un doc, lo lee en
markdown, lo edita y lo borra. Corrió como smoke test E2E de la API.

```bash
DOCSAPP_EMAIL=vos@ejemplo.com DOCSAPP_PASSWORD=••• \
  node scripts/api-smoke.mjs            # contra http://localhost:3000 por defecto
```

---

## Setup (self-host)

Además de `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`, la
autenticación por **PAT** requiere el secreto JWT de Supabase en el server (para
mintear el token efímero que preserva la RLS). Agregá a `.env.local` y a Vercel:

```
SUPABASE_JWT_SECRET=<Dashboard → Settings → API → JWT Secret>
```

Es **server-only** (nunca `NEXT_PUBLIC`). Sin él, el JWT Bearer clásico sigue
funcionando, pero los PAT devuelven `500`.

## Roadmap

- Paginación cursor-based, webhooks y OpenAPI formal en `design/api/`.
- Scopes por equipo (hoy el scope es read / read-write global).
