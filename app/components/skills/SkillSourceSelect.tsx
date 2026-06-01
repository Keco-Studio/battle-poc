'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import styles from './SkillSourcePanel.module.css'

export type SkillSourceSelectOption = {
  value: string
  label: string
}

type Props = {
  value: string
  onChange: (value: string) => void
  options: SkillSourceSelectOption[]
  placeholder?: string
  disabled?: boolean
  loading?: boolean
  'aria-label'?: string
}

export function SkillSourceSelect({
  value,
  onChange,
  options,
  placeholder = 'Select…',
  disabled = false,
  loading = false,
  'aria-label': ariaLabel,
}: Props) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const listId = useId()

  const selected = options.find((o) => o.value === value)
  const showLoading = loading && !selected?.label && options.length === 0
  const displayLabel = showLoading ? 'Loading…' : selected?.label

  useEffect(() => {
    if (!open) return
    const onDocClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className={styles.selectWrap} ref={wrapRef}>
      <button
        type="button"
        className={styles.selectTrigger}
        disabled={disabled || showLoading}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((v) => !v)}
      >
        <span className={displayLabel ? undefined : styles.selectPlaceholder}>
          {displayLabel ?? placeholder}
        </span>
        <ChevronDown size={14} className={styles.selectChevron} aria-hidden />
      </button>

      {open && !disabled && !showLoading && (
        <div id={listId} className={styles.selectMenu} role="listbox">
          {options.length === 0 ? (
            <div className={styles.metaLine} style={{ padding: '8px 10px' }}>
              No options
            </div>
          ) : (
            options.map((opt) => (
              <button
                key={opt.value}
                type="button"
                role="option"
                aria-selected={opt.value === value}
                className={`${styles.selectOption}${opt.value === value ? ` ${styles.selectOptionActive}` : ''}`}
                onClick={() => {
                  onChange(opt.value)
                  setOpen(false)
                }}
              >
                {opt.label}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
