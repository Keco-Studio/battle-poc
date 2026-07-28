import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('Supabase automation is disabled', () => {
  it('cannot run the migration job', () => {
    const workflow = readFileSync('.github/workflows/supabase-migrations.yml', 'utf8')
    expect(workflow).toMatch(/migrate-database:\s*\n\s*#.*\n\s*if:\s*\$\{\{ false \}\}/)
  })

  it('does not publish a usable shared Supabase URL in setup', () => {
    const env = readFileSync('.env.example', 'utf8')
    expect(env).not.toMatch(/^NEXT_PUBLIC_SUPABASE_URL=/m)
    expect(env).toContain('Legacy Supabase integration is disabled')
    expect(env).not.toContain('.supabase.co')
  })
})
