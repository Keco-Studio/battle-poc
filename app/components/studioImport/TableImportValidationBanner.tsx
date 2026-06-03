'use client'

import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import type { StudioTableValidation } from '@/src/lib/studio/validateStudioTableImport'
import styles from '../skills/SkillSourcePanel.module.css'

type Props = {
  validation: StudioTableValidation | null
  loading?: boolean
}

export function TableImportValidationBanner({ validation, loading }: Props) {
  if (loading) {
    return <p className={styles.metaLine}>正在校验表结构…</p>
  }
  if (!validation) return null

  return (
    <div
      className={`mb-2 rounded-lg border px-3 py-2 text-[11px] leading-relaxed ${
        validation.ok
          ? 'border-emerald-200 bg-emerald-50/80 text-emerald-900'
          : 'border-rose-200 bg-rose-50/80 text-rose-900'
      }`}
    >
      <div className="mb-1 flex items-center gap-1.5 font-bold">
        {validation.ok ? (
          <>
            <CheckCircle2 size={14} className="shrink-0 text-emerald-600" />
            表结构校验通过
          </>
        ) : (
          <>
            <AlertTriangle size={14} className="shrink-0 text-rose-600" />
            表结构校验未通过
          </>
        )}
      </div>
      {validation.matchedFields.length > 0 && (
        <p className="mb-1 text-emerald-800/90">
          已识别列：{validation.matchedFields.join('、')}
        </p>
      )}
      {validation.errors.map((e) => (
        <p key={e} className="text-rose-800">
          {e}
        </p>
      ))}
      {validation.warnings.map((w) => (
        <p key={w} className="mt-1 text-amber-800">
          {w}
        </p>
      ))}
    </div>
  )
}
