// Sanea un parámetro `next` de redirección para evitar open-redirect.
// Solo se permite una ruta interna relativa: empieza con '/', y NO con '//'
// (protocol-relative → otro host) ni '/\' (algunos browsers lo tratan como '//').
// Cualquier otra cosa (URL absoluta, scheme, control chars) cae al fallback.
export function safeNext(value: string | null | undefined, fallback = '/docs'): string {
  if (!value || typeof value !== 'string') return fallback
  if (!value.startsWith('/')) return fallback
  if (value.startsWith('//') || value.startsWith('/\\')) return fallback
  // rechazar control chars y backslashes en cualquier posición
  if (/[\x00-\x1f\\]/.test(value)) return fallback
  return value
}
