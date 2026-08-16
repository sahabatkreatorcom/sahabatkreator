/**
 * Shared types for payment and billing modules
 */

// ─── Plan Types ────────────────────────────────────────────────────────────────

export type GatedFeature =
  | "socialAccounts"
  | "teamMembers"
  | "scheduledPostsPerMonth"
  | "aiGenerationsPerMonth"
  | "competitorTracking"
  | "analyticsExport"
  | "customBranding"
  | "prioritySupport";

export interface PlanLimits {
  socialAccounts: number;
  teamMembers: number;
  scheduledPostsPerMonth: number;
  aiGenerationsPerMonth: number;
  competitorTracking: number;
  analyticsExport: boolean;
  customBranding: boolean;
  prioritySupport: boolean;
}

export interface GateResult {
  allowed: boolean;
  reason?: string;
  limit?: number;
  current?: number;
}

export interface OrganizationBillingInfo {
  tier: string;
  subscriptionStatus?: string;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd?: Date;
  trialDays: number;
}

// ─── Payment Types ─────────────────────────────────────────────────────────────

export interface SumoPodConfig {
  apiKey: string;
  webhookSecret?: string;
  webhookToken?: string;
  baseUrl: string;
}

export interface PaymentRequest {
  organizationId: string;
  amount: number; // Dalam rupiah (IDR)
  currency?: string;
  description?: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  metadata?: Record<string, unknown>;
}

export interface PaymentResponse {
  success: boolean;
  paymentId?: string;
  checkoutUrl?: string;
  error?: string;
}

export interface SubscriptionRequest {
  organizationId: string;
  planId: string;
  amount: number;
  interval?: string;
  trialDays?: number;
  couponCode?: string;
}

export interface SubscriptionResponse {
  success: boolean;
  subscriptionId?: string;
  status?: string;
  error?: string;
}
