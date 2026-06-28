// Shared order-status transition logic used by both the staff route (orders.ts)
// and the director/manager route (director.ts). Keep this as the single source of truth.

export const OVERRIDE_STATUSES = new Set(['cancelled', 'refunded']);
export const TERMINAL_STATUSES = new Set(['completed', 'cancelled', 'refunded']);

/**
 * Returns the set of statuses that may follow `currentStatus` for the given
 * order type and schedule. Cancel/refund are always included unless the order
 * is already in a terminal state.
 */
export function getAllowedNextStatuses(
  currentStatus: string,
  orderType: string,
  scheduledFor: Date | null,
): Set<string> {
  const isQuickPickup = orderType === 'pickup' && !scheduledFor;
  const isStandardPickup = orderType === 'pickup' && !!scheduledFor;
  const isDelivery = orderType === 'delivery';

  const transitions: Record<string, string[]> = isQuickPickup
    ? {
        received:       ['being_prepared'],
        being_prepared: ['completed'],
      }
    : isStandardPickup
    ? {
        scheduled:        ['accepted'],
        accepted:         ['being_prepared'],
        being_prepared:   ['ready_for_pickup'],
        ready_for_pickup: ['completed'],
      }
    : isDelivery
    ? {
        scheduled:        ['accepted'],
        accepted:         ['being_prepared'],
        being_prepared:   ['out_for_delivery'],
        out_for_delivery: ['completed'],
      }
    : {};

  const allowed = new Set<string>(transitions[currentStatus] ?? []);
  // Cancel/refund always available unless already terminal
  if (!TERMINAL_STATUSES.has(currentStatus)) {
    allowed.add('cancelled');
    allowed.add('refunded');
  }
  return allowed;
}

/**
 * Returns a customer-facing push-notification message for the given status
 * transition, differentiated by order type. Returns null when no notification
 * should be sent (e.g. internal state changes with no customer-visible copy).
 */
export function getStatusMessage(
  status: string,
  orderType: string,
  scheduledFor: Date | null,
): string | null {
  const isQuickPickup = orderType === 'pickup' && !scheduledFor;
  const isDelivery = orderType === 'delivery';

  if (status === 'cancelled') return 'Your order has been cancelled.';
  if (status === 'refunded')  return 'Your order has been refunded.';

  if (isQuickPickup) {
    if (status === 'being_prepared') return "We're making your order now — won't be long! ☕";
    if (status === 'completed')      return 'Thanks for collecting! Hope you enjoy 🍪';
  } else if (isDelivery) {
    if (status === 'accepted')         return "Your delivery is confirmed — we'll start preparing it on the day.";
    if (status === 'being_prepared')   return 'Your order is being prepared.';
    if (status === 'out_for_delivery') return 'Your order is on its way! 🚚';
    if (status === 'completed')        return 'Your order has been delivered! Enjoy 🍪';
  } else {
    // Standard pickup
    if (status === 'accepted')         return "Your pickup slot is confirmed. We'll prepare it ahead of time.";
    if (status === 'being_prepared')   return 'Your order is being prepared.';
    if (status === 'ready_for_pickup') return 'Your order is ready at the counter! 🛍';
    if (status === 'completed')        return 'Thanks for visiting! 🍪';
  }
  return null;
}
