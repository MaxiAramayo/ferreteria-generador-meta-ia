import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  resolveReadinessStatus,
  type DependencyReport,
} from './process-health.ts'

function report(
  dependency: DependencyReport['dependency'],
  status: DependencyReport['status'],
): DependencyReport {
  return { dependency, latencyMs: 1, status }
}

test('readiness es ready sólo con todas las dependencias disponibles', () => {
  assert.equal(
    resolveReadinessStatus([report('postgres', 'up'), report('redis', 'up')]),
    'ready',
  )
})

test('una dependencia caída deja el proceso not_ready', () => {
  assert.equal(
    resolveReadinessStatus([report('postgres', 'up'), report('redis', 'down')]),
    'not_ready',
  )
  assert.equal(
    resolveReadinessStatus([report('postgres', 'down'), report('redis', 'up')]),
    'not_ready',
  )
})

test('un proceso sin dependencias declaradas queda ready', () => {
  assert.equal(resolveReadinessStatus([]), 'ready')
})
