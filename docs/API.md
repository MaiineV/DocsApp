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
Authorization: Bearer <access_token>
```

El `access_token` es un JWT de Supabase. Se obtiene logueándote con tu cuenta:

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
  guardá el `refresh_token` y dejá que `supabase-js` lo refresque.
- **Cuentas de Google:** el login de Google es interactivo (browser). Para usar la API
  headless, agregale una contraseña a la cuenta, o hacé el login una vez en el browser
  y pasale el `refresh_token` al script. _(Más adelante: Personal Access Tokens, que
  desacoplan la API del método de login — ver "Roadmap".)_

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
Docs del equipo (plano; usá `parent_id` para reconstruir el árbol).
```json
{ "documents": [ { "id": "uuid", "title": "Specs", "parent_id": null, "updated_at": "..." } ] }
```

### `POST /teams/{teamId}/documents`
Crea un doc. Requiere rol `editor+` en el equipo.
```jsonc
// body
{
  "title": "Notas de la API",        // opcional
  "parent_id": null,                  // opcional (debe ser del mismo team)
  "content": "# Hola\n\ntexto...",   // opcional (siembra el cuerpo)
  "format": "markdown"                // opcional
}
```
→ `201` `{ "document": { "id", "title", "team_id", "parent_id", "updated_at" } }`

### `GET /documents/{id}?format=markdown`
Lee un doc + cuerpo.
```json
{ "document": { "id": "...", "title": "...", "team_id": "...", "parent_id": null,
  "updated_at": "...", "format": "markdown", "content": "# Hola\n\ntexto..." } }
```
(`format=json` → `content` es un array de bloques.)

### `PATCH /documents/{id}`
Edita título y/o cuerpo. Requiere `editor+`. El cuerpo se **reemplaza** y se emite en
vivo por Realtime a los editores abiertos.
```jsonc
{ "title": "Nuevo título", "content": "# Reemplazado\n\n...", "format": "markdown" }
```
→ `200` `{ "ok": true, "titleUpdated": true, "bodyUpdated": true, "broadcast": true, "version": 5 }`

### `DELETE /documents/{id}`
Borra el doc (los hijos suben a raíz). Requiere `editor+`. → `204` sin body.

---

## Errores

Shape uniforme: `{ "error": { "code": "...", "message": "..." } }`.

| Status | code | Cuándo |
|---|---|---|
| 400 | `bad_request` | body/markdown inválido |
| 401 | `unauthorized` | falta el Bearer o token inválido/vencido |
| 403 | `forbidden` | sin permiso (p. ej. `viewer` intentando editar/borrar) |
| 404 | `not_found` | doc inexistente o sin acceso |
| 409 | `conflict` | conflicto de versión al guardar (reintentá) |

---

## Ejemplo de cliente local

Ver `scripts/api-smoke.mjs` — hace login, lista equipos, crea un doc, lo lee en
markdown, lo edita y lo borra. Corrió como smoke test E2E de la API.

```bash
DOCSAPP_EMAIL=vos@ejemplo.com DOCSAPP_PASSWORD=••• \
  node scripts/api-smoke.mjs            # contra http://localhost:3000 por defecto
```

---

## Roadmap

- **Personal Access Tokens (fase 2):** API keys estables/revocables desde `/profile`,
  que no dependen del método de login (sirven para cuentas de Google sin password).
- Rate limiting, paginación y webhooks.
