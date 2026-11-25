import { readdirSync, statSync } from 'node:fs'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { zstdDecompressSync } from 'node:zlib'
import { MessageProcessor } from '@a2ui/web_core/v1_0'
import { basicCatalog } from '@a2ui/web_core/catalogs/basic/v1'

const root = process.env.HOME + '/.dsh/sessions'
const dirs: { path: string; mtime: number }[] = []
for (const workspace of readdirSync(root)) {
  const wsPath = join(root, workspace)
  if (!statSync(wsPath).isDirectory()) continue
  for (const session of readdirSync(wsPath)) {
    const p = join(wsPath, session)
    if (!statSync(p).isDirectory()) continue
    const file = join(p, 'session.v4.jsonl.zstd')
    try { dirs.push({ path: file, mtime: statSync(file).mtimeMs }) } catch {}
  }
}
dirs.sort((a, b) => b.mtime - a.mtime)

let checked = 0
const failures: { session: string; error: string; ops: string[] }[] = []
for (const { path } of dirs.slice(0, 12)) {
  let text = ''
  try { text = zstdDecompressSync(readFileSync(path)).toString('utf8') } catch { continue }
  for (const line of text.split('\n')) {
    if (!line.includes('a2ui/v1')) continue
    let ev: any
    try { ev = JSON.parse(line) } catch { continue }
    const meta = ev?.data?.meta
    if (meta?.protocol !== 'a2ui/v1' || !Array.isArray(meta.messages)) continue
    checked += 1
    const processor = new MessageProcessor([basicCatalog], () => true, {})
    try {
      processor.processMessages(meta.messages)
    } catch (error) {
      failures.push({
        session: path.split('/').slice(-2, -1)[0],
        error: String((error as Error).message).slice(0, 300),
        ops: meta.messages.map((m: any) => Object.keys(m).find(k => k !== 'version') ?? '?'),
      })
    }
  }
}
console.log('envelopes checked:', checked, 'failures:', failures.length)
for (const f of failures.slice(0, 6)) console.log('-', f.session, f.ops, '::', f.error)
