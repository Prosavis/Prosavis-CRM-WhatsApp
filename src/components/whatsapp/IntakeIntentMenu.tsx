import React, { useState } from 'react'
import { Chip, Menu, MenuItem } from '@mui/material'
import { useQueryClient } from '@tanstack/react-query'
import {
  invalidateDirectoryMeta,
  patchIntakeLabel,
  saveIntakeIntent,
} from '@/services/intakeIntentService'
import {
  asIntakeIntentChoice,
  type IntakeIntentChoice,
} from '@/utils/intakeIntentControl'

const CHOICES: Array<{ id: 'hogar' | 'empresas' | 'empleo' | 'quitar'; label: string }> = [
  { id: 'hogar', label: 'Hogar' },
  { id: 'empresas', label: 'Empresas' },
  { id: 'empleo', label: 'Empleo' },
  { id: 'quitar', label: 'Quitar' },
]

interface IntakeIntentMenuProps {
  stableKey: string
  label?: string | null
  onError: (message: string) => void
}

export const IntakeIntentMenu: React.FC<IntakeIntentMenuProps> = ({
  stableKey,
  label,
  onError,
}) => {
  const queryClient = useQueryClient()
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const [saving, setSaving] = useState(false)
  const current = asIntakeIntentChoice(label)
  const chipLabel = current ? `intención: ${current}` : 'intención'

  const choose = async (choice: IntakeIntentChoice) => {
    setAnchor(null)
    if (choice === current) return
    setSaving(true)
    patchIntakeLabel(queryClient, stableKey, choice)
    try {
      await saveIntakeIntent({ stableKey, next: choice, previous: current })
      invalidateDirectoryMeta(queryClient)
    } catch (error) {
      patchIntakeLabel(queryClient, stableKey, current)
      onError(error instanceof Error ? error.message : 'No se pudo cambiar la intención')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Chip
        label={chipLabel}
        size="small"
        disabled={saving}
        onClick={(event) => setAnchor(event.currentTarget)}
        aria-label="Cambiar intención"
        sx={{ height: 18, fontSize: '0.65rem' }}
      />
      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
        {CHOICES.map((choice) => {
          const next: IntakeIntentChoice = choice.id === 'quitar' ? null : choice.id
          return (
            <MenuItem
              key={choice.id}
              selected={next === current}
              onClick={() => void choose(next)}
            >
              {choice.label}
            </MenuItem>
          )
        })}
      </Menu>
    </>
  )
}
