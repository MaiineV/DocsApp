// Endpoint REST de Broadcast de Supabase Realtime (sin WebSocket persistente).
const BROADCAST_PATH = '/realtime/v1/api/broadcast'

// Publica un update Yjs en el canal `doc:<id>` para que los editores ABIERTOS lo
// apliquen en vivo. Usa el MISMO evento/payload que emite el provider del cliente
// (`lib/yjs/supabase-provider.ts`): event `update`, payload `{ update: <base64> }`.
//
// `private: true` → Supabase evalúa la RLS de `realtime.messages` con el JWT del
// usuario (debe ser editor+), la misma policy "doc realtime broadcast send" que
// gatea a los clientes del browser. Best-effort: si falla, la edición ya quedó
// persistida (CAS+merge) y se verá al reabrir/reconectar.
export async function broadcastDocUpdate(
  jwt: string,
  docId: string,
  updateB64: string,
): Promise<{ ok: boolean; status: number }> {
  try {
    const res = await fetch(process.env.NEXT_PUBLIC_SUPABASE_URL! + BROADCAST_PATH, {
      method: 'POST',
      headers: {
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        Authorization: `Bearer ${jwt}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: [
          {
            topic: `doc:${docId}`,
            event: 'update',
            payload: { update: updateB64 },
            private: true,
          },
        ],
      }),
    })
    return { ok: res.ok, status: res.status }
  } catch {
    return { ok: false, status: 0 }
  }
}
