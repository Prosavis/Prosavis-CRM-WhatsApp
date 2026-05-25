import type { Appointment } from '@/types/appointment';

/** CRM WhatsApp independiente: citas externas no sincronizadas aún. */
export class AppointmentService {
  static async getRecentByPhone(_phone: string, _limit = 5): Promise<Appointment[]> {
    void _phone;
    void _limit;
    return [];
  }

  static async getAppointments(_opts?: {
    clientId?: string;
    providerId?: string;
    limit?: number;
  }): Promise<{ appointments: Appointment[] }> {
    void _opts;
    return { appointments: [] };
  }
}