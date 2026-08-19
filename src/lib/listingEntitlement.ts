import { supabase } from '@/lib/supabase';

export type ListingRole = 'landlord' | 'real_estate';

export interface ListingEntitlement {
  can_start_listing: boolean;
  can_create: boolean;
  free_limit: number;
  free_listings_used: number;
  free_listings_remaining: number;
  subscription_id: string | null;
  subscription_plan: string | null;
  subscription_status: string | null;
  subscription_limit: number | null;
  subscription_listings_used: number;
  subscription_listings_remaining: number | null;
  individual_paid_listings: number;
  individual_listing_price_kes: number;
  requires_subscription: boolean;
  requires_individual_payment: boolean;
  upgrade_available: boolean;
  upgrade_target: string | null;
}

const DEFAULT_INDIVIDUAL_PRICE_KES = 1000;

const toNumber = (value: unknown, fallback = 0): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toNullableNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const toBoolean = (value: unknown): boolean => value === true;

const toNullableString = (value: unknown): string | null => {
  return value === null || value === undefined ? null : String(value);
};

export async function getListingEntitlement(
  role: ListingRole,
  userId: string,
): Promise<ListingEntitlement> {
  if (!userId) {
    throw new Error('A signed-in user is required to check listing entitlement.');
  }

  const functionName =
    role === 'landlord'
      ? 'get_landlord_listing_entitlement'
      : 'get_real_estate_listing_entitlement';

  const rpcArgs =
    role === 'landlord'
      ? { p_landlord_id: userId }
      : { p_real_estate_id: userId };

  const { data, error } = await supabase.rpc(functionName, rpcArgs);

  if (error) {
    throw new Error(error.message || 'Unable to load listing entitlement.');
  }

  const raw = Array.isArray(data) ? data[0] : data;

  if (!raw) {
    throw new Error('The listing entitlement service returned no data.');
  }

  const individualPrice = toNumber(
    raw.individual_listing_price_kes,
    DEFAULT_INDIVIDUAL_PRICE_KES,
  );

  if (individualPrice !== DEFAULT_INDIVIDUAL_PRICE_KES) {
    throw new Error('The server returned an invalid individual listing price.');
  }

  return {
    can_start_listing: toBoolean(raw.can_start_listing ?? true),
    can_create: toBoolean(raw.can_create),
    free_limit: toNumber(raw.free_limit),
    free_listings_used: toNumber(raw.free_listings_used),
    free_listings_remaining: toNumber(raw.free_listings_remaining),
    subscription_id: toNullableString(raw.subscription_id),
    subscription_plan: toNullableString(raw.subscription_plan),
    subscription_status: toNullableString(raw.subscription_status),
    subscription_limit: toNullableNumber(raw.subscription_limit),
    subscription_listings_used: toNumber(raw.subscription_listings_used),
    subscription_listings_remaining: toNullableNumber(
      raw.subscription_listings_remaining,
    ),
    individual_paid_listings: toNumber(raw.individual_paid_listings),
    individual_listing_price_kes: individualPrice,
    requires_subscription: toBoolean(raw.requires_subscription),
    requires_individual_payment: toBoolean(raw.requires_individual_payment),
    upgrade_available: toBoolean(raw.upgrade_available),
    upgrade_target: toNullableString(raw.upgrade_target),
  };
}

export function hasListingEntitlement(entitlement: ListingEntitlement): boolean {
  return entitlement.can_create && !entitlement.requires_individual_payment;
}
