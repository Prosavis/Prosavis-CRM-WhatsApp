import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Box, Stack, Typography } from '@mui/material';
import { inboxQueryKeys } from '@/hooks/inboxQueryKeys';
import { getWhatsAppDeliveryCost } from '@/services/whatsappService';
import type { WhatsAppDeliveryCostLine } from '@/types/whatsappDeliveryCost';

const copFormatter = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const countFormatter = new Intl.NumberFormat('es-CO');

function formatCop(value: number): string {
  return copFormatter.format(value);
}

function lineTitle(label: string): string {
  if (label === '312') return '312 Bot';
  if (label === '311') return '311 Comercial';
  return label;
}

function pricedOnLine(line: WhatsAppDeliveryCostLine): number {
  return (
    line.serviceDelivered
    + line.utilityDelivered
    + line.authenticationDelivered
    + line.marketingDelivered
    + line.freeEntryPoint
    + line.otherDelivered
  );
}

const DeliveryLine: React.FC<{
  line: WhatsAppDeliveryCostLine;
  quota: number;
}> = ({ line, quota }) => {
  const priced = pricedOnLine(line);
  return (
    <Box>
      <Typography variant="subtitle2">
        {lineTitle(line.label)} · {countFormatter.format(line.serviceDelivered)} / {countFormatter.format(quota)} service
      </Typography>
      <Typography variant="body2" color="text.secondary">
        Utility {countFormatter.format(line.utilityDelivered)}
        {' · '}
        Auth {countFormatter.format(line.authenticationDelivered)}
        {' · '}
        Marketing {countFormatter.format(line.marketingDelivered)}
        {' · '}
        Free Entry Point {countFormatter.format(line.freeEntryPoint)}
        {line.otherDelivered > 0
          ? ` · Otra categoría ${countFormatter.format(line.otherDelivered)}`
          : ''}
        {line.serviceAboveQuota > 0
          ? ` · ${countFormatter.format(line.serviceAboveQuota)} service por encima del cupo`
          : ''}
      </Typography>
      <Typography variant="body2">
        {line.estimateCop === null || priced === 0
          ? 'Sin estimado en esta línea'
          : `${formatCop(line.estimateCop)} estimado`}
      </Typography>
    </Box>
  );
};

const WhatsAppDeliveryCostCard: React.FC = () => {
  const query = useQuery({
    queryKey: inboxQueryKeys.deliveryCost(),
    queryFn: getWhatsAppDeliveryCost,
    staleTime: 60_000,
  });

  const data = query.data;

  return (
    <Box
      sx={{
        mb: 2,
        px: 1.75,
        py: 1.5,
        borderRadius: 2,
        border: '1px solid',
        borderColor: 'divider',
        bgcolor: 'background.paper',
      }}
    >
      <Typography variant="subtitle1">
        Cobro WhatsApp del mes{data?.month ? ` · ${data.month}` : ''}
      </Typography>
      <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
        Estimado por mensaje entregado. El cupo no frena el envío. La factura de Meta manda.
      </Typography>

      {query.isPending ? (
        <Typography variant="body2">Cargando el estimado…</Typography>
      ) : null}

      {query.isError ? (
        <Typography variant="body2" color="error">
          {query.error instanceof Error ? query.error.message : 'No se pudo leer el estimado.'}
        </Typography>
      ) : null}

      {data ? (
        <Stack spacing={1.25}>
          {data.lines.map((line) => (
            <DeliveryLine
              key={line.phoneNumberId}
              line={line}
              quota={data.freeServiceQuota}
            />
          ))}
          <Typography variant="body2">
            {data.estimateCop === null
              ? 'Este mes todavía no tiene pricing de Meta. No hay estimado.'
              : `${formatCop(data.estimateCop)} estimado`}
          </Typography>
          {data.unpricedDelivered > 0 ? (
            <Typography variant="body2" color="text.secondary">
              Hay {countFormatter.format(data.unpricedDelivered)} entregas sin pricing. El estimado no las incluye. El mes está incompleto.
            </Typography>
          ) : null}
          {data.incomplete && data.pricedDelivered === 0 && data.unpricedDelivered === 0 ? (
            <Typography variant="body2" color="text.secondary">
              El mes está incompleto.
            </Typography>
          ) : null}
        </Stack>
      ) : null}
    </Box>
  );
};

export default WhatsAppDeliveryCostCard;
