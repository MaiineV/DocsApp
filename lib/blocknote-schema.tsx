import { BlockNoteSchema, defaultInlineContentSpecs } from '@blocknote/core'
import { createReactInlineContentSpec } from '@blocknote/react'
import { DocRefChip } from '@/components/doc-ref-chip'

// Schema superset = schema por defecto + el inline content `docref` (referencia a
// otro documento). Es ADITIVO: los docs viejos (schema default) cargan sin migrar
// porque todos sus tipos siguen existiendo. Se usa en el editor vivo
// (useCreateBlockNote) Y en el seed headless (BlockNoteEditor.create) → mismo
// schema = structs Yjs deterministas y consistentes entre clientes.
//
// docref: propSchema { docId, label(snapshot del título) }, content:'none' (chip
// atómico). El render solo se invoca en el editor con vista (no en el seed).
const DocRefSpec = createReactInlineContentSpec(
  {
    type: 'docref',
    propSchema: { docId: { default: '' }, label: { default: '' } },
    content: 'none',
  },
  {
    render: (props) => (
      <DocRefChip docId={props.inlineContent.props.docId} label={props.inlineContent.props.label} />
    ),
  },
)

export const schema = BlockNoteSchema.create({
  inlineContentSpecs: {
    ...defaultInlineContentSpecs,
    docref: DocRefSpec,
  },
})

export type DocsSchema = typeof schema
