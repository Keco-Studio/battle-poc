import type { Metadata } from 'next'
import EmberNullGame from '../components/ember-null/EmberNullGame'

export const metadata: Metadata = {
  title: 'EMBER//NULL',
  description: 'A MiniMax-directed action breach.',
}

export default function EmberNullPage() {
  return <EmberNullGame />
}
