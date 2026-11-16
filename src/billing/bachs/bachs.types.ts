export interface BachsCreateCustomerParams {
  email: string;
  name?: string | null;
  metadata?: Record<string, string>;
}

export interface BachsCustomer {
  customerId: string;
}

export interface BachsCreateCheckoutParams {
  customerId: string;
  /** Decimal NGN string, e.g. "22500.00". */
  amount: string;
  /** Unique per Bachs account (max 128). */
  reference: string;
  metadata: Record<string, string>;
  successUrl: string;
  cancelUrl: string;
  expiresInMinutes?: number;
  savePaymentMethod?: boolean;
}

export interface BachsCheckout {
  checkoutId: string;
  checkoutUrl: string;
  expiresAt: Date;
}

/** Webhook envelope as documented at docs.bachs.io/guides/webhooks/overview. */
export interface BachsWebhookEvent {
  id: string;
  type: string;
  created_at?: string;
  organization_id?: string;
  data: Record<string, any>;
}

export interface BachsChargeSavedCardParams {
  customerId: string;
  paymentMethodId: string;
  /** Decimal NGN string. */
  amount: string;
  reference: string;
  /** Must change per attempt: a failed charge is final for its key. */
  idempotencyKey: string;
  description?: string;
}

export interface BachsCharge {
  chargeId: string;
  status: string;
}
