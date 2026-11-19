import { describe, expect, it } from 'vitest'
import { parseA2uiMetadata } from '../src/client/metadata.ts'

const valid = {
  protocol: 'a2ui/v1',
  messages: [{
    version: '1.0',
    createSurface: {
      surfaceId: 'card',
      catalogId: 'https://a2ui.org/specification/v1_0/catalogs/basic/catalog.json',
      components: [{ id: 'root', component: 'Text', text: 'Hello' }],
    },
  }],
}

describe('A2UI Client metadata envelope', () => {
  it('accepts a detached non-empty a2ui/v1 message envelope', () => {
    const parsed = parseA2uiMetadata(valid)

    expect(parsed).toEqual(valid)
    expect(parsed).not.toBe(valid)
    expect(parsed?.messages).not.toBe(valid.messages)
  })

  it('accepts finite JSON numbers in a message', () => {
    const metadata = { ...valid, messages: [{ ...valid.messages[0], extra: 1.5 }] }

    expect(parseA2uiMetadata(metadata)).toEqual(metadata)
  })

  it.each([
    undefined,
    null,
    {},
    { protocol: 'a2ui/v0', messages: valid.messages },
    { protocol: 'a2ui/v1', messages: [] },
    { protocol: 'a2ui/v1', messages: 'invalid' },
    { protocol: 'a2ui/v1', messages: [null] },
    { protocol: 'a2ui/v1', messages: [{ version: '1.0' }], extra: true },
  ])('rejects malformed or unsupported metadata: %j', (metadata) => {
    expect(parseA2uiMetadata(metadata)).toBeNull()
  })

  it.each([Number.NaN, Number.POSITIVE_INFINITY, -0])('rejects non-lossless JSON number %s', (value) => {
    expect(parseA2uiMetadata({ ...valid, messages: [{ ...valid.messages[0], extra: value }] })).toBeNull()
  })

  it.each([undefined, 1n, Symbol('invalid'), () => undefined])('rejects non-JSON nested value %s', (value) => {
    expect(parseA2uiMetadata({ ...valid, messages: [{ ...valid.messages[0], extra: value }] })).toBeNull()
  })

  it('rejects an array containing a non-JSON value', () => {
    expect(parseA2uiMetadata({ ...valid, messages: [{ ...valid.messages[0], extra: [undefined] }] })).toBeNull()
  })

  it('rejects records with exotic prototypes, symbol keys, or non-enumerable fields', () => {
    const exotic: Record<string, unknown> = {}
    Object.setPrototypeOf(exotic, { inherited: true })
    Object.assign(exotic, valid)
    expect(parseA2uiMetadata(exotic)).toBeNull()

    const symbol = { ...valid, [Symbol('invalid')]: true }
    expect(parseA2uiMetadata(symbol)).toBeNull()

    const hidden = { ...valid }
    Object.defineProperty(hidden, 'hidden', { value: true })
    expect(parseA2uiMetadata(hidden)).toBeNull()
  })

  it('accepts a null-prototype JSON record and detaches nested arrays', () => {
    const metadata: Record<string, unknown> = {}
    Object.setPrototypeOf(metadata, null)
    Object.assign(metadata, valid)
    const parsed = parseA2uiMetadata(metadata)

    expect(parsed).toEqual(valid)
  })

  it('preserves a nested __proto__ data key without changing the snapshot prototype', () => {
    const operation = JSON.parse('{"surfaceId":"card","__proto__":{"polluted":true}}') as Record<string, unknown>
    const metadata = { protocol: 'a2ui/v1', messages: [{ version: '1.0', createSurface: operation }] }

    const parsed = parseA2uiMetadata(metadata)
    const snapshot = parsed?.messages[0]?.createSurface

    expect(snapshot).not.toBeNull()
    expect(Object.getPrototypeOf(snapshot)).not.toEqual({ polluted: true })
    expect((snapshot as { polluted?: unknown }).polluted).toBeUndefined()
    expect(Object.hasOwn(snapshot as object, '__proto__')).toBe(true)
    expect((snapshot as Record<string, unknown>).__proto__).toEqual({ polluted: true })
  })

  it.each([null, [], 'invalid', 1, true])('rejects a non-object operation payload: %j', (payload) => {
    expect(parseA2uiMetadata({
      protocol: 'a2ui/v1', messages: [{ version: '1.0', createSurface: payload }],
    })).toBeNull()
  })

  it('rejects a message containing more than one operation', () => {
    expect(parseA2uiMetadata({
      protocol: 'a2ui/v1',
      messages: [{ version: '1.0', createSurface: {}, deleteSurface: {} }],
    })).toBeNull()
  })

  it('rejects a message without an operation', () => {
    expect(parseA2uiMetadata({
      protocol: 'a2ui/v1', messages: [{ version: '1.0' }],
    })).toBeNull()
  })

  it('rejects cyclic metadata without throwing', () => {
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic

    expect(() => parseA2uiMetadata(cyclic)).not.toThrow()
    expect(parseA2uiMetadata(cyclic)).toBeNull()
  })

  it('rejects deeply nested unsupported metadata without exhausting the call stack', () => {
    let deep: Record<string, unknown> = {}
    for (let depth = 0; depth < 20_000; depth++) deep = { child: deep }

    expect(() => parseA2uiMetadata(deep)).not.toThrow()
    expect(parseA2uiMetadata(deep)).toBeNull()
  })
})
