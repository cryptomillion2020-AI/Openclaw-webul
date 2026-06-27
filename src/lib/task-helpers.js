/**
 * task-helpers.js — normalized task-status filter helpers
 * Wave 4d (2026-06-27): two distinct task concepts, two distinct sources.
 *
 * activeTasks (msg.active_tasks) = active-projects registry
 *   Status vocab: pending | in_progress | blocked | done
 *   Use for: team workload, currently-active execution
 *
 * tasks (msg.tasks) = bus/spawn-supervisor telemetry
 *   Status vocab: pending | active | complete
 *   Use for: operational bus backlog only — NOT team workload
 */

export function isOpenTask(status) {
  return status === 'pending'
      || status === 'in_progress'
      || status === 'active'
      || status === 'blocked';
}

export function isCurrentlyActiveTask(status) {
  return status === 'in_progress'
      || status === 'active'
      || status === 'blocked';
}

export function isCompleteTask(status) {
  return status === 'done'
      || status === 'complete'
      || status === 'closed';
}

export function isPendingBusMessage(status) {
  return status === 'pending'
      || status === 'active';
}
