/**
 * Tipos para el módulo de Calendario (Panel Admin)
 * Sincronizado con AppointmentEntity de Prosavis-App
 * IMPORTANTE: Solo lectura, no modifica datos de la app
 */

export type AppointmentStatus =
  | 'PENDING'
  | 'PENDING_RESCHEDULE'
  | 'CONFIRMED'
  | 'EN_ROUTE'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELED'
  | 'REJECTED';

export type AppointmentPaymentMethod = 'WOMPI' | 'QR' | 'CASH';

export interface AppointmentLocation {
  address: string;
  latitude?: number;
  longitude?: number;
}

export interface StatusChange {
  status: AppointmentStatus;
  changedAt: Date | string;
  changedBy: string;
  reason?: string;
}

export type CancellationWindow = 'gt24h' | 'lte24h';

export type CancellationStage =
  | 'reschedule_offered'
  | 'reschedule_accepted'
  | 'refund_requested'
  | 'refund_processing'
  | 'refund_completed'
  | 'refund_failed'
  | 'discount_50_granted'
  | 'completed';

export type CancellationUserChoice = 'reschedule' | 'refund' | 'discount_next';

export interface CancellationFlow {
  stage: CancellationStage;
  window: CancellationWindow;
  userChoice?: CancellationUserChoice;
  refundEligible: boolean;
  canceledAt?: Date | string;
  canceledBy?: string;
  refundRequestedAt?: Date | string;
  refundCompletedAt?: Date | string;
  refundWompiTransactionId?: string;
  refundFailReason?: string;
  discount50GrantedAt?: Date | string;
  adminNotes?: string;
}

export interface Appointment {
  id: string;
  serviceId: string;
  serviceTitle: string;
  servicePhotoUrl?: string;
  providerId: string;
  providerName: string;
  providerPhotoUrl?: string;
  clientId: string;
  clientName: string;
  clientPhone?: string;
  status: AppointmentStatus;
  scheduledDate: Date | string;
  duration: number;
  location?: AppointmentLocation;
  notes?: string;
  price: number;
  /** Venta adicional con productos (+30.000 COP al total en CRM). */
  contractedWithProducts?: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
  previousScheduledDate?: Date | string;
  rescheduledBy?: string;
  rescheduledAt?: Date | string;
  rescheduledReason?: string;
  statusHistory?: StatusChange[];
  lastNotifiedAt?: Date | string;
  paymentId?: string;
  wompiReference?: string;
  wompiTransactionId?: string;
  paymentMethod?: AppointmentPaymentMethod;
  cancellationFlow?: CancellationFlow;
}

export interface AppointmentMetrics {
  totalAppointments: number;
  pendingAppointments: number;
  confirmedAppointments: number;
  completedAppointments: number;
  canceledAppointments: number;
  rejectedAppointments: number;
  
  appointmentsToday: number;
  appointmentsThisWeek: number;
  appointmentsThisMonth: number;
  
  averageLeadTime: number;
  confirmationRate: number;
  completionRate: number;
  cancellationRate: number;
  rescheduleRate: number;
  
  topProviders: Array<{
    providerId: string;
    providerName: string;
    appointmentCount: number;
  }>;
}

export interface AppointmentFilters {
  status?: AppointmentStatus;
  providerId?: string;
  clientId?: string;
  dateFrom?: string;
  dateTo?: string;
  wasRescheduled?: boolean;
  minDuration?: number;
  maxDuration?: number;
}

export interface AppointmentQueryParams extends AppointmentFilters {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface AppointmentListResponse {
  appointments: Appointment[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

