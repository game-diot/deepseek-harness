/**
 * Cross-check every component this Host admits against the renderer SDK.
 *
 * The Host schema and the renderer disagree silently: a field value the Host
 * accepts but the SDK rejects turns into an unrenderable card in the UI, so each
 * admitted shape is validated by the SDK here.
 */

import { MessageProcessor, type ProcessableMessagePayload } from '@a2ui/web_core/v1_0'
import { basicCatalog } from '@a2ui/web_core/catalogs/basic/v1'
import { describe, expect, it } from 'vitest'
import { parseA2uiEnvelope } from '../src/schema.ts'

const CATALOG_ID = 'https://a2ui.org/specification/v1_0/catalogs/basic/catalog.json'

const components = [
  { id: 'root', component: 'Card', child: 'body' },
  {
    id: 'body', component: 'Column', children: [
      'row', 'list', 'text', 'textCaption', 'button', 'divider', 'imageHeader', 'imageAvatar',
      'icon', 'field', 'fieldLong', 'box', 'picker', 'slider', 'when', 'video', 'audio',
    ],
  },
  { id: 'row', component: 'Row', children: ['rowText'] },
  { id: 'rowText', component: 'Text', text: 'row' },
  { id: 'list', component: 'List', direction: 'horizontal', children: ['listText'] },
  { id: 'listText', component: 'Text', text: 'list' },
  { id: 'text', component: 'Text', text: '**bold**' },
  { id: 'textCaption', component: 'Text', text: 'caption', variant: 'caption' },
  { id: 'button', component: 'Button', child: 'buttonLabel', action: { event: { name: 'go' } } },
  { id: 'buttonLabel', component: 'Text', text: 'go' },
  { id: 'divider', component: 'Divider' },
  { id: 'imageHeader', component: 'Image', url: 'https://example.com/a.png', variant: 'header' },
  { id: 'imageAvatar', component: 'Image', url: 'https://example.com/b.png', variant: 'avatar', fit: 'cover' },
  { id: 'icon', component: 'Icon', name: 'star' },
  { id: 'field', component: 'TextField', label: 'name', value: '' },
  { id: 'fieldLong', component: 'TextField', label: 'notes', value: '', variant: 'longText' },
  { id: 'box', component: 'CheckBox', label: 'agree', value: false },
  {
    id: 'picker', component: 'ChoicePicker', label: 'pick',
    options: [{ label: 'a', value: 'a' }], value: [], variant: 'mutuallyExclusive',
  },
  { id: 'slider', component: 'Slider', label: 'level', min: 0, max: 10, value: 5, steps: 10 },
  { id: 'when', component: 'DateTimeInput', label: 'when', value: '', enableDate: true },
  { id: 'video', component: 'Video', url: 'https://example.com/v.mp4' },
  { id: 'audio', component: 'AudioPlayer', url: 'https://example.com/a.mp3' },
]

describe('catalog parity with the renderer SDK', () => {
  it('accepts every admitted component through the SDK parser', () => {
    const envelope = parseA2uiEnvelope([{
      version: '1.0',
      createSurface: { surfaceId: 'parity', catalogId: CATALOG_ID, components },
    }])
    const processor = new MessageProcessor([basicCatalog], (_action: unknown) => { /* no actions here */ }, {})
    expect(() => {
      processor.processMessages(envelope.envelope.messages as ProcessableMessagePayload)
    }).not.toThrow()
  })

  it('accepts each admitted Image variant through the SDK parser', () => {
    const variants = ['icon', 'avatar', 'smallFeature', 'mediumFeature', 'largeFeature', 'header']
    const processor = new MessageProcessor([basicCatalog], (_action: unknown) => { /* no actions here */ }, {})
    for (const variant of variants) {
      const envelope = parseA2uiEnvelope([{
        version: '1.0',
        createSurface: {
          surfaceId: `image-${variant}`,
          catalogId: CATALOG_ID,
          components: [{ id: 'root', component: 'Image', url: 'https://example.com/x.png', variant }],
        },
      }])
      expect(() => {
        processor.processMessages(envelope.envelope.messages as ProcessableMessagePayload)
      }).not.toThrow()
    }
  })
})
