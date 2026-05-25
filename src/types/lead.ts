export type LeadSequenceType =
  | 'SEGUIMIENTO'
  | 'REBOOKING'
  | 'SEGUIMIENTO_PAGO_RECHAZADO'
  | 'NINGUNA';

export type LeadStatus =
  | 'PENDIENTE'
  | 'NO_AGENDO'
  | 'AGENDADO'
  | 'COMPLETADO'
  | 'OPT_OUT'
  | 'PAGO_RECHAZADO';

export type LeadSource =
  | 'META_ADS'
  | 'REFERIDO'
  | 'ORGANICO'
  | 'BROADCAST'
  | 'WHATSAPP_INBOUND'
  | 'PANEL'
  | 'APP_USER';

export type LeadChannel = 'WHATSAPP' | 'IN_APP';

export interface Lead {
  id: string;
  phone?: string;
  email?: string;
  name?: string;
  address?: string;
  notes?: string;
  userId?: string;
  channels?: LeadChannel[];
  status: LeadStatus;
  source: LeadSource;

  fecha_primer_contacto?: Date | number;
  fecha_ultimo_mensaje_enviado?: Date | number;
  mensajes_enviados: number;

  secuencia_activa: LeadSequenceType;
  secuencia_paso: number;

  opt_out: boolean;

  last_response_text?: string;
  last_response_at?: Date | number;

  appointmentId?: string;

  createdAt: Date | number;
  updatedAt: Date | number;
}
