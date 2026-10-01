export interface WhatsAppDeliveryCostLine {
  phoneNumberId: string;
  label: string;
  serviceDelivered: number;
  serviceWithinQuota: number;
  serviceAboveQuota: number;
  utilityDelivered: number;
  authenticationDelivered: number;
  marketingDelivered: number;
  freeEntryPoint: number;
  otherDelivered: number;
  unpricedDelivered: number;
  estimateCop: number | null;
}

export interface WhatsAppDeliveryCostMonth {
  month: string;
  timezone: string;
  currency: string;
  estimateLabel: string;
  freeServiceQuota: number;
  marketingRateCop: number;
  utilityRateCop: number;
  incomplete: boolean;
  pricedDelivered: number;
  unpricedDelivered: number;
  estimateCop: number | null;
  lines: WhatsAppDeliveryCostLine[];
}
