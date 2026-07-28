import { NextResponse } from 'next/server'
import { LOCAL_MODE_ERROR } from './localWebMode'

export function localModeUnavailable(feature: string, status = 503) {
  return NextResponse.json({ ok: false, error: LOCAL_MODE_ERROR, feature }, { status })
}
