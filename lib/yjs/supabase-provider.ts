import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js'
import type { Doc as YDoc } from 'yjs'
import type { Awareness as YAwareness } from 'y-protocols/awareness'
import { Y, Awareness, awarenessProtocol } from '@/lib/yjs/yjs'
import { base64ToUpdate, updateToBase64 } from '@/lib/yjs/encoding'

// Provider Yjs casero sobre Supabase Realtime (sin servidor WebSocket propio).
//
// Transporte: un canal PRIVADO `doc:<id>` (Realtime Authorization gatea acceso
// por RLS sobre realtime.messages — ver migración yjs_persistence).
//   - Liveness: cada cliente emite sus updates por Broadcast y aplica los ajenos.
//   - Convergencia: Broadcast es at-most-once → un update perdido divergiría para
//     siempre. Por eso corremos un handshake de sync (state vector -> diff) en
//     CADA (re)subscribe y periódicamente (sweep) como anti-entropy: sana
//     cualquier update perdido y a los joiners tardíos.
//   - Cursores: awareness de y-protocols relayada por Broadcast; limpieza de
//     fantasmas vía Presence (join/leave).
//
// La persistencia (snapshot en Postgres) la maneja el componente editor, no el
// provider: acá solo vive el tiempo real.

const BATCH_MS = 150 // batch de updates locales antes de emitir (rate/tamaño)
const SWEEP_MS = 20_000 // anti-entropy: re-sync periódico

type ProviderOptions = {
  supabase: SupabaseClient
  docId: string
  doc: YDoc
  // editor+ puede emitir updates/awareness; viewer solo recibe (read-only real,
  // reforzado además por la policy de realtime.messages).
  canSend: boolean
  onStatusChange?: (status: string) => void
}

export class SupabaseYjsProvider {
  readonly awareness: YAwareness

  private readonly supabase: SupabaseClient
  private readonly docId: string
  private readonly doc: YDoc
  private readonly canSend: boolean
  private readonly onStatusChange?: (status: string) => void

  private channel: RealtimeChannel | null = null
  private status = 'INIT'
  private pending: Uint8Array[] = []
  private flushTimer: ReturnType<typeof setTimeout> | null = null
  private sweep: ReturnType<typeof setInterval> | null = null

  constructor(opts: ProviderOptions) {
    this.supabase = opts.supabase
    this.docId = opts.docId
    this.doc = opts.doc
    this.canSend = opts.canSend
    this.onStatusChange = opts.onStatusChange
    this.awareness = new Awareness(this.doc)
  }

  async connect(): Promise<void> {
    if (this.channel) return

    // El cliente de @supabase/ssr es singleton → su registro de canales persiste
    // entre montajes/navegaciones. Sacar cualquier canal viejo de este topic para
    // no recibir uno YA suscripto (al que no se le pueden re-agregar bindings, p.ej.
    // 'presence', y tiraría "cannot add presence callbacks after subscribe()").
    const realtimeTopic = `realtime:doc:${this.docId}`
    for (const c of this.supabase.getChannels()) {
      if (c.topic === realtimeTopic) await this.supabase.removeChannel(c)
    }
    if (this.channel) return // otra llamada conectó mientras await-eábamos

    // Realtime Authorization lee auth.uid() del JWT del usuario, no de la anon
    // key. Hay que setearlo en el cliente realtime ANTES de subscribe.
    const {
      data: { session },
    } = await this.supabase.auth.getSession()
    if (session) this.supabase.realtime.setAuth(session.access_token)

    this.doc.on('update', this.onLocalUpdate)
    this.awareness.on('update', this.onLocalAwareness)

    this.channel = this.supabase.channel(`doc:${this.docId}`, {
      config: {
        private: true,
        broadcast: { self: false },
        presence: { key: String(this.doc.clientID) },
      },
    })

    this.channel
      .on('broadcast', { event: 'update' }, (m) => this.applyRemote(m.payload?.update))
      .on('broadcast', { event: 'sync-request' }, (m) => this.onSyncRequest(m.payload?.sv))
      .on('broadcast', { event: 'sync-response' }, (m) => this.applyRemote(m.payload?.update))
      .on('broadcast', { event: 'awareness' }, (m) => this.onRemoteAwareness(m.payload?.update))
      .on('presence', { event: 'leave' }, ({ leftPresences }) =>
        this.onLeave(leftPresences as Array<{ clientID?: number }>),
      )
      .subscribe((status) => {
        this.status = status
        this.onStatusChange?.(status)
        if (status !== 'SUBSCRIBED' || !this.channel) return
        // Corre en cada (re)subscribe → cubre reconexiones tras un blip de red.
        this.channel.track({ clientID: this.doc.clientID })
        if (this.canSend) {
          this.sendSyncRequest()
          this.broadcastAwareness([this.doc.clientID])
        }
      })

    if (this.canSend) {
      this.sweep = setInterval(() => {
        if (this.status === 'SUBSCRIBED') this.sendSyncRequest()
      }, SWEEP_MS)
    }
  }

  // Llamar en TOKEN_REFRESHED para no quedar con un JWT vencido (cierra el socket).
  setAuthToken(token: string | null): void {
    if (token) this.supabase.realtime.setAuth(token)
  }

  // Teardown RECONECTABLE: corta el canal/timers y detacha handlers, pero NO
  // destruye awareness/doc (el editor sigue bindeado a ellos). Así connect()
  // puede volver a correr — necesario porque React 19 StrictMode monta/desmonta
  // dos veces en dev (mount → cleanup → mount). awareness/doc se liberan por GC
  // cuando el componente se desmonta de verdad y se sueltan las refs.
  disconnect(): void {
    if (this.flushTimer != null) clearTimeout(this.flushTimer)
    if (this.sweep != null) clearInterval(this.sweep)
    this.flushTimer = null
    this.sweep = null
    this.doc.off('update', this.onLocalUpdate)
    this.awareness.off('update', this.onLocalAwareness)
    // empuje best-effort de updates pendientes antes de soltar el canal
    if (this.channel && this.pending.length > 0 && this.status === 'SUBSCRIBED') {
      this.channel.send({
        type: 'broadcast',
        event: 'update',
        payload: { update: updateToBase64(Y.mergeUpdates(this.pending)) },
      })
    }
    this.pending = []
    if (this.channel) {
      // unsubscribe dispara presence-leave en los peers → limpian mi cursor.
      this.supabase.removeChannel(this.channel)
      this.channel = null
    }
    this.status = 'INIT'
  }

  // ---- updates del documento -------------------------------------------------

  private onLocalUpdate = (update: Uint8Array, origin: unknown) => {
    if (origin === this) return // vino de la red (applyRemote) → no rebroadcast
    if (!this.canSend) return // viewers no emiten
    this.pending.push(update)
    if (this.flushTimer == null) this.flushTimer = setTimeout(this.flush, BATCH_MS)
  }

  private flush = () => {
    this.flushTimer = null
    if (this.pending.length === 0 || !this.channel) return
    if (this.status !== 'SUBSCRIBED') {
      // todavía conectando: reintentar sin perder lo acumulado.
      this.flushTimer = setTimeout(this.flush, BATCH_MS)
      return
    }
    const merged = Y.mergeUpdates(this.pending)
    this.pending = []
    this.channel.send({
      type: 'broadcast',
      event: 'update',
      payload: { update: updateToBase64(merged) },
    })
  }

  private applyRemote(b64?: string) {
    if (!b64) return
    // origin = this → onLocalUpdate lo ignora (no se rebroadcast). Idempotente.
    Y.applyUpdate(this.doc, base64ToUpdate(b64), this)
  }

  // ---- handshake de sincronización (convergencia / anti-entropy) -------------

  private sendSyncRequest() {
    if (!this.canSend || !this.channel) return
    this.channel.send({
      type: 'broadcast',
      event: 'sync-request',
      payload: { sv: updateToBase64(Y.encodeStateVector(this.doc)) },
    })
  }

  private onSyncRequest(svB64?: string) {
    if (!this.canSend || !this.channel || !svB64) return
    // Respondo SOLO el diff que le falta al que pidió (no el doc entero) →
    // payload chico, lejos de los límites de Broadcast.
    const diff = Y.encodeStateAsUpdate(this.doc, base64ToUpdate(svB64))
    this.channel.send({
      type: 'broadcast',
      event: 'sync-response',
      payload: { update: updateToBase64(diff) },
    })
  }

  // ---- awareness (cursores) --------------------------------------------------

  private onLocalAwareness = (
    changes: { added: number[]; updated: number[]; removed: number[] },
    origin: unknown,
  ) => {
    if (origin === this) return
    if (!this.canSend) return
    this.broadcastAwareness([...changes.added, ...changes.updated, ...changes.removed])
  }

  private broadcastAwareness(ids: number[]) {
    if (!this.canSend || !this.channel || ids.length === 0) return
    const update = awarenessProtocol.encodeAwarenessUpdate(this.awareness, ids)
    this.channel.send({
      type: 'broadcast',
      event: 'awareness',
      payload: { update: updateToBase64(update) },
    })
  }

  private onRemoteAwareness(b64?: string) {
    if (!b64) return
    awarenessProtocol.applyAwarenessUpdate(this.awareness, base64ToUpdate(b64), this)
  }

  private onLeave(left: Array<{ clientID?: number }>) {
    const ids = left
      .map((p) => p.clientID)
      .filter((n): n is number => typeof n === 'number')
    if (ids.length) {
      awarenessProtocol.removeAwarenessStates(this.awareness, ids, 'presence-leave')
    }
  }
}
