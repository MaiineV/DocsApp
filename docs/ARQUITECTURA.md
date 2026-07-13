# DocsApp — Arquitectura y Stack

> App web (PC + mobile) para documentar y trabajar en paralelo sobre documentos,
> con almacenamiento en la nube, equipos, management y colaboradores por equipo,
> y múltiples equipos por cuenta. Referencia: Loop, Coda, Notion.

**Última actualización:** 2026-07-13

---

## 0. Perfil del proyecto (define las decisiones)

| Dimensión | Decisión |
|---|---|
| Quién construye | Solo / full-stack JS |
| Prioridad actual | Validar rápido (MVP) |
| Offline / mobile | Importante (mobile-first) |

Conclusión: **Camino A optimizado** → máximo de servicios gestionados (cero servidores
propios), TypeScript de punta a punta, y arquitectura **local-first** desde el día 1 para
que el offline "salga gratis".

---

## 1. El núcleo difícil: colaboración en tiempo real

El 90% de la dificultad de un "Notion/Coda/Loop" está en la **edición colaborativa en
tiempo real** (varias personas en el mismo doc, sin pisarse, online y offline). El resto
(CRUD, login, equipos) es SaaS estándar.

| Enfoque | Qué es | Veredicto |
|---|---|---|
| **OT (Operational Transform)** | Servidor central que transforma operaciones (viejo Google Docs). | Potente pero muy complejo. Evitar sin equipo grande. |
| **CRDT** | Estructuras que convergen solas, sin árbitro central. Soportan offline naturalmente. | **El estándar moderno. Lo usamos.** |

- Librería CRDT de facto: **Yjs**.
- El offline lo da **Yjs + y-indexeddb**: el dispositivo escribe local (instantáneo, sin
  red) y el provider sincroniza al reconectar.
- La decisión real no es "qué CRDT" sino **quién hostea el servidor de sync**:
  - **Liveblocks** (managed) → presencia, comentarios, cursores, storage. Shippeás en días. Cobra por MAU → caro a escala.
  - **Y-Sweet / Hocuspocus** (self-host) → más barato a escala, más ops.
  - **Cloudflare Durable Objects + PartyKit** → DIY, una room por doc, muy escalable y barato, más código.

---

## 2. Stack definitivo (solo dev · MVP · offline-first)

```
Frontend     Next.js + TypeScript + Tailwind + shadcn/ui  →  PWA (instalable en mobile)
Editor       BlockNote (bloques estilo Notion, Yjs integrado)
Colab        Yjs  +  y-indexeddb (offline local)  +  Liveblocks (sync gestionado)
Backend      Supabase  →  Postgres + Auth + Storage + RLS (todo en uno)
Storage      Supabase Storage (o Cloudflare R2 si crece el egreso)
Hosting      Vercel (front)  +  Supabase Cloud  +  Liveblocks Cloud
```

### Frontend
- **Next.js (React) + TypeScript** → web responsive para PC y mobile con un solo código.
- **PWA** (Serwist / next-pwa) → instalable + offline.
- **Tailwind CSS + shadcn/ui** → UI rápida y consistente.
- **TanStack Query** (datos servidor) + **Zustand** (estado UI).

### Editor + colaboración (el corazón)
- **BlockNote** → editor por bloques estilo Notion (drag & drop, slash `/`), sobre
  ProseMirror/TipTap y **con Yjs integrado**. Ahorra ~2 meses.
  - Alternativas con más control: TipTap directo, o Lexical (Meta).
- **Yjs** (CRDT) + **y-indexeddb** (offline local).

### Backend / datos / auth
- **Supabase** como columna vertebral: **Postgres + Auth + Storage + Realtime + RLS**.
  - RLS = aislamiento multi-tenant a nivel base de datos.
  - Alternativa para gestión de equipos ya hecha: **Clerk Organizations**.
- **Object storage**: Supabase Storage o **Cloudflare R2** (S3-compatible, sin egreso).

### Infra / hosting
- **Vercel** → frontend Next.js (deploy automático, CDN global).
- **Supabase Cloud** → DB + auth + storage gestionados.
- **Liveblocks Cloud** → servidor de colaboración (MVP).
- **Cloudflare** delante (CDN, R2; Durable Objects más adelante si hace falta).

**Por qué esta combinación:** cero servidores propios, un solo lenguaje (TS),
offline real desde el día 1, BlockNote evita reinventar el editor, y RLS da
multi-tenant seguro.

---

## 3. Modelo de datos multi-tenant (equipos)

```
User (cuenta)
 └─ pertenece a muchos →  Team (workspace)
                            ├─ Membership (User ↔ Team, role: owner | admin | editor | viewer)
                            ├─ Document (pertenece al Team)
                            │    ├─ contenido Yjs (binario + snapshots)
                            │    └─ DocumentPermission (override por doc, opcional)
                            └─ Invitation (email + role pendiente)
```

### Roles
| Rol | Capacidades |
|---|---|
| `owner` | Dueño del equipo + billing. |
| `admin` | Management: invita, gestiona miembros y roles. |
| `editor` | Crea y edita documentos (colaborador). |
| `viewer` | Solo lectura. |

- **RLS en Postgres**: las queries solo devuelven filas de equipos donde el usuario es
  miembro. Seguridad a nivel DB, no solo de la app.
- **Contenido del documento** (Yjs): updates binarios + snapshots periódicos, en Postgres
  (`bytea`) o en R2/S3.

---

## 4. Caminos y palancas de costo

| | **Camino A — MVP rápido (ELEGIDO)** | **Camino B — Optimizado a escala** |
|---|---|---|
| Colab | Liveblocks (managed) | Hocuspocus / Y-Sweet self-host + R2 |
| Auth/equipos | Supabase Auth + RLS (o Clerk Orgs) | Supabase Auth + RLS propio |
| Tiempo a prod | Semanas | Meses |
| Costo inicial | Bajo (free tiers) | Bajo |
| Costo a 10k+ usuarios | Sube por MAU | Mucho más barato |
| Ops | Casi cero | Gestionás servidores |

**Palancas para más adelante (no ahora):**
- Liveblocks caro por MAU → migrar a **Y-Sweet** (mismo Yjs, self-host, persiste en S3/R2). Sin reescribir el editor.
- UIs de gestión de equipos ya hechas → **Clerk Organizations** en vez de construirlas a mano.

---

## 5. Mobile

- Arrancar como **PWA** (Next.js + Serwist/next-pwa): instalable, offline, un solo código.
  Cubre Android y PC perfecto, iOS bien.
- Si más adelante se necesitan app stores o APIs nativas → envolver la misma PWA con
  **Capacitor**. No se rehace nada.

---

## 6. Roadmap por fases

0. **Esqueleto** — Next.js + auth + modelo de equipos/roles + CRUD de documentos (sin colab).
1. **Editor** — BlockNote single-player + guardado en nube.
2. **Tiempo real** — Yjs + y-indexeddb + Liveblocks → multiusuario, cursores, presencia, offline.
3. **Equipos completos** — invitaciones, permisos por doc, papelera, búsqueda.
4. **Mobile/offline** — activar PWA.
5. **Escala** — migrar sync a self-host si el costo lo pide; comentarios ✅ (Fase 13), historial de
   versiones ✅ (Fase 14: captura por trigger con coalescing + restore no destructivo por delta CRDT),
   menciones ✅ (chips @doc).

### Primeros pasos concretos (Fase 0)
1. `create-next-app` con TypeScript + App Router + Tailwind.
2. Conectar Supabase: tablas `teams`, `memberships` (con `role`), `documents` + políticas RLS.
3. Auth con Supabase (email + Google OAuth).
4. CRUD de documentos por equipo (sin colab).
5. BlockNote en single-player guardando en Supabase.
6. Sumar Yjs + y-indexeddb + Liveblocks → multiusuario + offline.
7. Activar PWA.

---

## 7. Setup de Arcane (Claude Code)

Instalado el 2026-06-24 con `claude-code-arcane` (v3fb45e0). Skills/agents/hooks/rules
que asisten a Claude Code para este stack.

**Perfiles + addons:** `backend-nextjs + database + security + design`

**Skills sueltas clave (núcleo + fases 0–2):**
- `websocket-realtime-rooms` — rooms de colaboración en tiempo real (Yjs/Liveblocks). Núcleo.
- `rbac-abac` — roles y permisos (owner/admin/editor/viewer).
- `auth-strategy` · `oauth-setup` · `jwt-strategy` — auth (Supabase + Google OAuth).
- `file-uploads` — adjuntos/imágenes (Supabase Storage / R2).
- `state-management` — Zustand + TanStack Query.
- `nextjs-scaffold` · `nextjs-best-practices` · `database` · `run-migrations` · `database-indexing` — base del proyecto.
- `architecture-decision` — para seguir documentando decisiones.

Total: 77 skills, 9 rules, agents (quality/engineering/product). Estado: `npx claude-code-arcane status`.

**Para más adelante (agregar con `arcane add`):**
- Monetización: `stripe-integration-expert`, `subscription-billing`, `payments-architecture`.
- Export de docs: `pdf-generator`, `docx-generator`, `xlsx-generator`.
- IA tipo Notion AI: `rag-architect`, `llm-cost-optimizer` (ya están `ai-sdk-setup`, `pgvector-search`).

---

## 8. Pendientes / decisiones abiertas

- [x] Revisar `npx claude-code-arcane` y elegir packages/addons útiles (ver §7).
- [ ] Definir diseño fino de roles y permisos (override por documento).
- [x] Decidir Supabase Auth puro vs. Clerk Organizations para gestión de equipos.
      → **Supabase Auth puro** (sin Clerk): equipos/roles/membresías se manejan con tablas
        propias + RLS. Bootstrap del 1er team vía RPC `create_team_with_owner`.
- [x] Escribir el SQL completo del multi-tenant (tablas + políticas RLS).
      → **Escrito Y aplicado** en Supabase (Fase 0): migraciones `initial_schema`,
        `rls_and_authz`, `bootstrap_rpc`. RLS validado end-to-end (aislamiento entre equipos).
