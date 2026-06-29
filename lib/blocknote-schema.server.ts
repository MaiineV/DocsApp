import {
  BlockNoteSchema,
  defaultInlineContentSpecs,
  createInlineContentSpec,
} from '@blocknote/core'

// Schema server-safe: el MISMO superset que el del editor (`lib/blocknote-schema.tsx`)
// pero SIN React. El schema React arrastra `createContext` y rompe el build del
// server (Route Handlers) al recolectar page data. Acá el inline content `docref`
// se define con `createInlineContentSpec` de @blocknote/core: mismos type/propSchema/
// content que la versión React, así que los structs Yjs son COMPATIBLES entre el
// editor del browser y el server (la serialización depende del node spec, no del
// render).
//
// El `render` solo se usa al exportar a HTML/markdown (lossy): un @mención (docref)
// se vuelve su label como texto. Usa el `document` global (jsdom, vía dom-shim) que
// ya está montado cuando se ejecuta una conversión.
const DocRefSpec = createInlineContentSpec(
  {
    type: 'docref',
    propSchema: { docId: { default: '' }, label: { default: '' } },
    content: 'none',
  },
  {
    render: (inlineContent) => {
      const span = document.createElement('span')
      span.textContent = inlineContent.props.label || 'doc'
      return { dom: span }
    },
  },
)

export const serverSchema = BlockNoteSchema.create({
  inlineContentSpecs: {
    ...defaultInlineContentSpecs,
    docref: DocRefSpec,
  },
})
