// Interpolación simple: reemplaza {clave} por vars[clave]. Pura → server y client.
//   fmt('Hola {name}', { name: 'Agus' }) -> 'Hola Agus'
export function fmt(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) =>
    k in vars ? String(vars[k]) : `{${k}}`,
  )
}
