export interface InvoiceEmailData {
  invoiceNumber: string;
  clientName: string;
  totalCents: number;
  balanceCents: number;
  dueDateStr: string | null;
  viewUrl: string;
  notes: string | null;
  /** When true, email is a paid receipt (PDF is the primary artifact). */
  isPaid?: boolean;
  paidAtStr?: string | null;
}

export interface InvoiceFollowupEmailData {
  clientName: string;
  invoiceNumber: string;
  totalCents: number;
  balanceCents: number;
  daysOverdue: number;
  viewUrl: string;
}

export interface EstimateEmailData {
  estimateRef: string;
  clientName: string;
  totalCents: number;
  depositCents: number;
  balanceCents: number;
  expiresStr: string | null;
  notes: string | null;
  approveUrl: string;
  declineUrl: string;
  viewUrl: string;
}

export interface EstimateFollowupEmailData {
  clientName: string;
  estimateNumber: string;
  totalCents: number;
  daysSinceSent: number;
  viewUrl: string;
}

export interface VisitReminderEmailData {
  clientName: string;
  jobTitle: string;
  scheduledStart: string;
  propertyAddress: string | null;
  techName: string | null;
}

export interface OnMyWayEmailData {
  clientName: string;
  jobTitle: string;
  when: string;
  propertyAddress: string | null;
  techName: string | null;
}

export interface BookingConfirmedEmailData {
  clientName: string;
  jobTitle: string;
  scheduledStart: string;
  scheduledEnd: string;
  propertyAddress: string | null;
  techName: string | null;
}

export interface IntakeInviteEmailData {
  leadName: string;
  intakeUrl: string;
  expiresHours?: number;
}

export interface ReviewRequestEmailData {
  clientName: string;
  jobTitle: string;
  techName: string | null;
}

export interface ClientReactivationEmailData {
  clientName: string;
  monthsSinceLastService: number;
}

export interface SeasonalReminderEmailData {
  clientName: string;
  season: "spring" | "fall";
}

export interface RecurringInspectionEmailData {
  clientName: string;
  planName: string;
  propertyAddress: string | null;
}