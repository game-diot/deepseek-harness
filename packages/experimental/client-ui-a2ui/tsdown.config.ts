import { clientBundle } from '../../client/tsdown.client.ts'
import { PLATFORM_MODULES } from '../../client/web/src/platform.ts'

const base = clientBundle(import.meta.dirname, ['lib/types/index.js'])
const externals: ReadonlySet<string> = new Set(PLATFORM_MODULES.filter(specifier => specifier !== 'zod'))

export default (options: Parameters<typeof base>[0]) => base(options).map((config) => {
  if (config.name !== '@deepseek-ai/dsh-client-ui-a2ui/client') return config
  return {
    ...config,
    deps: {
      neverBundle: (specifier: string) => externals.has(specifier),
      alwaysBundle: (specifier: string) => !externals.has(specifier),
    },
  }
})
