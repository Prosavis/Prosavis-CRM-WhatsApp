import React, { useState } from 'react'
import { Chip, Menu, MenuItem } from '@mui/material'
import { useQueryClient } from '@tanstack/react-query'
import {
  asLossReason,
  LOSS_REASON_CHOICES,
  patchLossReason,
  saveLossReason,
  type LossReason,
} from '@/services/lossReasonService'

interface LossReasonMenuProps {
  stableKey: string
  reason?: string | null
  onError: (message: string) => void
}

export const LossReasonMenu: React.FC<LossReasonMenuProps> = ({
  stableKey,
  reason,
  onError,
}) => {
  const queryClient = useQueryClient()
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const [saving, setSaving] = useState(false)
  const current = asLossReason(reason)
  const currentLabel = LOSS_REASON_CHOICES.find((choice) => choice.id === current)?.label
  const chipLabel = currentLabel ? `pérdida: ${currentLabel}` : 'motivo de pérdida'

  const choose = async (next: LossReason | null) => {
    setAnchor(null)
    if (next === current) return
    setSaving(true)
    patchLossReason(queryClient, stableKey, next)
    try {
      await saveLossReason({ stableKey, next })
    } catch (error) {
      patchLossReason(queryClient, stableKey, current)
      onError(error instanceof Error ? error.message : 'No se pudo guardar el motivo')
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
        aria-label="Motivo de pérdida"
        sx={{ height: 18, fontSize: '0.65rem' }}
      />
      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
        {LOSS_REASON_CHOICES.map((choice) => (
          <MenuItem
            key={choice.id}
            selected={choice.id === current}
            onClick={() => void choose(choice.id)}
          >
            {choice.label}
          </MenuItem>
        ))}
        <MenuItem selected={current == null} onClick={() => void choose(null)}>
          Quitar
        </MenuItem>
      </Menu>
    </>
  )
}
