import React, { useEffect, useState } from 'react'
import { Box, Button, Stack, Typography } from '@mui/material'
import { supabase } from '@/config/supabase'

function phoneKey(value?: string | null): string {
  const digits = String(value ?? '').replace(/\D/g, '')
  if (digits.length === 10) return `57${digits}`
  return digits
}

interface FieldRow {
  path: string
  valor: string
}

function fieldsOf(value: unknown, path = ''): FieldRow[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => fieldsOf(item, `${path}[${index}]`))
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    if ('valor' in record) {
      return [{ path: path || 'ficha', valor: String(record.valor ?? '') }]
    }
    return Object.entries(record).flatMap(([key, child]) =>
      fieldsOf(child, path ? `${path}.${key}` : key),
    )
  }
  if (!path || value == null || value === '') return []
  return [{ path, valor: String(value) }]
}

interface TrialExtra {
  tipo_contacto?: string | null
  motivo_propuesto?: string | null
  resultado?: string | null
  propuesta_cajon?: { vigente?: string; entry?: string; source?: string } | null
}

interface SofiaTrialCardProps {
  phone?: string | null
}

export const SofiaTrialCard: React.FC<SofiaTrialCardProps> = ({ phone }) => {
  const key = phoneKey(phone)
  const [fields, setFields] = useState<FieldRow[]>([])
  const [marks, setMarks] = useState<Record<string, 'correcto' | 'error'>>({})
  const [missing, setMissing] = useState(false)

  useEffect(() => {
    if (!key) return
    let cancel = false
    void (async () => {
      const card = await supabase
        .from('whatsapp_client_cards')
        .select('ficha, tipo_contacto, motivo_propuesto, resultado, propuesta_cajon')
        .eq('phone', key)
        .eq('modo', 'prueba')
        .maybeSingle()
      const reviews = await supabase
        .from('whatsapp_client_card_reviews')
        .select('field_path, verdict')
        .eq('phone', key)
      if (cancel) return
      setMissing(!card.data)
      const extra = (card.data ?? {}) as TrialExtra
      const proposal = extra.propuesta_cajon ?? {}
      const head: FieldRow[] = [
        extra.tipo_contacto ? { path: 'tipo_contacto', valor: extra.tipo_contacto } : null,
        extra.motivo_propuesto ? { path: 'motivo_propuesto', valor: extra.motivo_propuesto } : null,
        extra.resultado ? { path: 'resultado', valor: extra.resultado } : null,
        proposal.vigente ? { path: 'propuesta_cajon.vigente', valor: proposal.vigente } : null,
        proposal.entry ? { path: 'propuesta_cajon.entry', valor: proposal.entry } : null,
        proposal.source ? { path: 'propuesta_cajon.source', valor: proposal.source } : null,
      ].filter((row): row is FieldRow => row != null)
      setFields([...head, ...fieldsOf(card.data?.ficha ?? {}).slice(0, 40)])
      const next: Record<string, 'correcto' | 'error'> = {}
      for (const row of reviews.data ?? []) {
        if (row.verdict === 'correcto' || row.verdict === 'error') next[row.field_path] = row.verdict
      }
      setMarks(next)
    })()
    return () => {
      cancel = true
    }
  }, [key])

  const mark = async (path: string, verdict: 'correcto' | 'error') => {
    const { data } = await supabase.auth.getUser()
    const reviewer = data.user?.id
    if (!reviewer) return
    setMarks((current) => ({ ...current, [path]: verdict }))
    await supabase.from('whatsapp_client_card_reviews').upsert({
      phone: key,
      field_path: path,
      verdict,
      reviewer,
      reviewed_at: new Date().toISOString(),
    })
  }

  if (!key) return null

  return (
    <Box sx={{ mb: 2 }}>
      <Typography variant="overline">Ficha (prueba)</Typography>
      {missing ? (
        <Typography variant="body2" color="text.secondary">
          Este teléfono todavía no tiene ficha de prueba.
        </Typography>
      ) : (
        <Stack spacing={0.75} sx={{ maxHeight: 360, overflow: 'auto' }}>
          {fields.map((field) => (
            <Stack key={field.path} direction="row" spacing={0.5} alignItems="center">
              <Typography variant="caption" sx={{ flex: 1, minWidth: 0 }} noWrap title={field.valor}>
                {field.path}: {field.valor}
              </Typography>
              <Button
                size="small"
                variant={marks[field.path] === 'correcto' ? 'contained' : 'text'}
                onClick={() => void mark(field.path, 'correcto')}
              >
                correcto
              </Button>
              <Button
                size="small"
                color="warning"
                variant={marks[field.path] === 'error' ? 'contained' : 'text'}
                onClick={() => void mark(field.path, 'error')}
              >
                error
              </Button>
            </Stack>
          ))}
        </Stack>
      )}
    </Box>
  )
}
