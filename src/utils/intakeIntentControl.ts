export const JOB_DIRECTORY_TAG = 'Job'

export type IntakeIntentChoice = 'hogar' | 'empresas' | 'empleo' | null

export function asIntakeIntentChoice(value: string | null | undefined): IntakeIntentChoice {
  if (value === 'hogar' || value === 'empresas' || value === 'empleo') return value
  return null
}

export function isJobTag(name: string): boolean {
  return name.trim().toLowerCase() === 'job'
}

export function directoryTagsForIntent(input: {
  tags: readonly string[]
  previous: IntakeIntentChoice
  next: IntakeIntentChoice
}): string[] {
  const tags = input.tags.map((tag) => tag.trim()).filter(Boolean)
  if (input.next === 'empleo') {
    if (tags.some(isJobTag)) return tags
    return [...tags, JOB_DIRECTORY_TAG]
  }
  if (input.previous === 'empleo') return tags.filter((tag) => !isJobTag(tag))
  return tags
}

export function jobTagRemoved(previous: readonly string[], next: readonly string[]): boolean {
  return previous.some(isJobTag) && !next.some(isJobTag)
}

export function sameTagList(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false
  return left.every((tag, index) => tag.trim().toLowerCase() === (right[index] ?? '').trim().toLowerCase())
}
