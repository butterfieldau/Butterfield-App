/**
 * Central wholesale delivery schedule config.
 * This is the ONE place to update cutoff times, lead time, and delivery days.
 * Both the date picker (dateUtils.ts) and profile/FAQ/checkout display import from here.
 */

/** Hour (AEST, 24h) at which orders cut off on the day before delivery */
export const WS_CUTOFF_HOUR = 18; // 6:00 PM AEST

/** Delivery windows offered — order matches on getDay() value */
export const WS_DELIVERY_SCHEDULE = [
  {
    deliveryDow: 1,
    deliveryLabel: 'Monday',
    cutoffDayOffset: -1,    // 1 calendar day before Monday = Sunday
    cutoffDayLabel: 'Sunday',
    cutoffLabel: 'Sun by 6pm AEST',
    cutoffFull: 'Sunday by 6:00pm AEST',
  },
  {
    deliveryDow: 4,
    deliveryLabel: 'Thursday',
    cutoffDayOffset: -1,    // 1 calendar day before Thursday = Wednesday
    cutoffDayLabel: 'Wednesday',
    cutoffLabel: 'Wed by 6pm AEST',
    cutoffFull: 'Wednesday by 6:00pm AEST',
  },
] as const;

/** Human-readable lead time shown in profile and FAQ */
export const WS_LEAD_TIME_LABEL = '1 business day';

/** Display label for the delivery window on date cards */
export const WS_DELIVERY_WINDOW_LABEL = '8am – 5pm';
