// @vitest-environment jsdom

import { readFileSync } from 'node:fs'
import React from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { describe, expect, it } from 'vitest'
import { LocalModeNotice } from '@/app/components/LocalModeNotice'

const remoteUiFiles = [
  'app/components/DockFeatureModal.tsx',
  'app/components/skills/SimulationSkillSyncPanel.tsx',
  'app/components/skills/SkillCatalogSourcesPanel.tsx',
  'app/components/jobs/PocJobConfigPanel.tsx',
  'app/components/gameConfig/PocGameConfigPanel.tsx',
]

describe('local-mode remote UI', () => {
  it('renders a stable local status', () => {
    const container = document.createElement('div')
    const root = createRoot(container)

    flushSync(() => root.render(React.createElement(LocalModeNotice)))

    expect(container.querySelector('[role="status"]')?.textContent).toContain(
      'Current mode: local',
    )
    root.unmount()
  })

  it.each(remoteUiFiles)('%s exposes disabled Supabase controls in local mode', (file) => {
    const source = readFileSync(file, 'utf8')
    expect(source).toContain('LOCAL_WEB_MODE')
    expect(source).toContain('data-remote-feature="supabase"')
    expect(source).toMatch(/disabled=\{LOCAL_WEB_MODE/)
  })
})
