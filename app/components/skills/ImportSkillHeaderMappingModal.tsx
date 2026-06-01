'use client'

import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import type { PocSkillColumnMappingKey } from '@/src/lib/skills/pocSkillFieldMapping'
import {
  type ImportAmbiguity,
  skillFieldLabel,
} from '@/src/lib/skills/importPocSkillFromTable'

import styles from './SkillSourcePanel.module.css'

type Props = {
  open: boolean
  ambiguities: ImportAmbiguity[]
  onCancel: () => void
  onConfirm: (resolutions: Record<string, PocSkillColumnMappingKey>) => void
}

export function ImportSkillHeaderMappingModal({
  open,
  ambiguities,
  onCancel,
  onConfirm,
}: Props) {
  const [choices, setChoices] = useState<Record<string, PocSkillColumnMappingKey>>({})

  useEffect(() => {
    if (!open) return
    const initial: Record<string, PocSkillColumnMappingKey> = {}
    for (const a of ambiguities) {
      if (a.kind === 'header') {
        initial[a.columnKey] = a.candidates[0]!
      } else {
        initial[a.columns[0]!.columnKey] = a.skillKey
      }
    }
    setChoices(initial)
  }, [open, ambiguities])

  if (!open || ambiguities.length === 0) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        className={`${styles.panel} max-h-[80vh] w-full max-w-md overflow-y-auto rounded-xl bg-white p-4 shadow-xl`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="mapping-modal-title"
      >
        <div className="mb-3 flex items-start justify-between gap-2">
          <div>
            <h3 id="mapping-modal-title" className={styles.sectionTitle} style={{ fontSize: 14 }}>
              Resolve column mapping
            </h3>
            <p className={styles.sectionHint} style={{ marginBottom: 0 }}>
              Some table headers match more than one skill field. Choose how each column maps.
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close"
            className="rounded-full p-1 text-slate-400 hover:bg-slate-100"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4">
          {ambiguities.map((a) => {
            if (a.kind === 'header') {
              return (
                <div key={`header-${a.columnKey}`}>
                  <div className="text-[12px] font-semibold text-slate-800">
                    Column &quot;{a.columnLabel}&quot;
                  </div>
                  <div className="mt-2 space-y-1">
                    {a.candidates.map((c) => (
                      <label
                        key={c}
                        className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-50"
                      >
                        <input
                          type="radio"
                          name={`header-${a.columnKey}`}
                          checked={choices[a.columnKey] === c}
                          onChange={() =>
                            setChoices((prev) => ({ ...prev, [a.columnKey]: c }))
                          }
                        />
                        <span className="text-[12px] text-slate-700">
                          {skillFieldLabel(c)} ({c})
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              )
            }
            return (
              <div key={`collision-${a.skillKey}`}>
                <div className="text-[12px] font-semibold text-slate-800">
                  Multiple columns → {skillFieldLabel(a.skillKey)}
                </div>
                <div className="mt-2 space-y-1">
                  {a.columns.map((c) => (
                    <label
                      key={c.columnKey}
                      className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-50"
                    >
                      <input
                        type="radio"
                        name={`collision-${a.skillKey}`}
                        checked={
                          choices[c.columnKey] === a.skillKey ||
                          (a.columns.find((col) => choices[col.columnKey] === a.skillKey)
                            ?.columnKey ?? a.columns[0]!.columnKey) === c.columnKey
                        }
                        onChange={() => {
                          setChoices((prev) => {
                            const next = { ...prev }
                            for (const col of a.columns) delete next[col.columnKey]
                            next[c.columnKey] = a.skillKey
                            return next
                          })
                        }}
                      />
                      <span className="text-[12px] text-slate-700">
                        Use column &quot;{c.columnLabel}&quot;
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )
          })}
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-[12px] font-semibold text-slate-600 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm(choices)}
            className="rounded-lg bg-violet-600 px-3 py-1.5 text-[12px] font-bold text-white hover:bg-violet-500"
          >
            Import
          </button>
        </div>
      </div>
    </div>
  )
}
