export type PMSBillingCycle = 'MONTHLY' | 'ANNUAL';

export type PMSSubscriptionStatus =
  | 'PENDING_PAYMENT'
  | 'ACTIVE'
  | 'GRACE_PERIOD'
  | 'EXPIRED'
  | 'CANCELLED';

export type PMSPlanName = 'STARTER' | 'GROWTH' | 'PRO';

export interface PMSSubscription {
  id: string;
  landlord_id: string;
  plan_id: string;
  billing_cycle: PMSBillingCycle;
  status: PMSSubscriptionStatus;
  current_period_start: string;
  current_period_end: string;
  grace_period_end: string | null;
  auto_renew: boolean;
  created_at?: string;
  updated_at?: string;
}

/**
 * PMS access is derived from the live subscription contract.
 * The client does not recreate subscription state locally.
 */
export function hasPMSAccess(subscription?: PMSSubscription | null): boolean {
  if (!subscription) return false;

  if (
    subscription.status !== 'ACTIVE' &&
    subscription.status !== 'GRACE_PERIOD'
  ) {
    return false;
  }

  if (subscription.status === 'ACTIVE') {
    return new Date(subscription.current_period_end) > new Date();
  }

  if (!subscription.grace_period_end) return false;
  return new Date(subscription.grace_period_end) > new Date();
}

export function getPMSAccessReason(subscription?: PMSSubscription | null): string {
  if (!subscription) {
    return 'A PMS subscription is required to access property management.';
  }

  switch (subscription.status) {
    case 'PENDING_PAYMENT':
      return 'Your PMS subscription is awaiting payment confirmation.';
    case 'CANCELLED':
      return 'Your PMS subscription has been cancelled. Subscribe again to continue using property management.';
    case 'EXPIRED':
      return 'Your PMS subscription has expired. Renew your subscription to continue managing your properties.';
    case 'GRACE_PERIOD':
      if (subscription.grace_period_end && new Date(subscription.grace_period_end) > new Date()) {
        return 'Your subscription is in its grace period. Renew before the grace period ends to keep PMS access.';
      }
      return 'Your PMS grace period has ended. Renew your subscription to continue.';
    case 'ACTIVE':
      if (new Date(subscription.current_period_end) <= new Date()) {
        return 'Your PMS subscription period has ended. Renew your subscription to continue.';
      }
      return 'Your PMS subscription is active.';
    default:
      return 'A PMS subscription is required to access this feature.';
  }
}
