// Punto de entrada único de Yjs / y-protocols para toda la app.
//
// Yjs ROMPE si se cargan dos instancias distintas (los `instanceof` fallan y
// salta "Yjs was already imported"). `npm dedupe` + `overrides` en package.json
// garantizan una sola copia física; centralizar los imports acá hace explícito
// ese contrato: el resto de la app importa Yjs desde este módulo, nunca de 'yjs'
// directo (salvo `import type`, que no genera runtime).
export * as Y from 'yjs'
export { Awareness } from 'y-protocols/awareness'
export * as awarenessProtocol from 'y-protocols/awareness'

// Nombre del XmlFragment que usa BlockNote para el cuerpo del documento. Debe
// ser el MISMO al sembrar (blocksToYXmlFragment) y al crear el editor
// (collaboration.fragment), o el editor abre vacío / con contenido duplicado.
export const BLOCKNOTE_FRAGMENT = 'document-store'
