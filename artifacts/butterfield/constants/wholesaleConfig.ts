/**
 * Central wholesale delivery schedule config.
 * Fallback defaults used before the API responds.
 * Live schedule is director-editable via Director → More → Wholesale → Delivery Settings.
 */

/** Hour (AEST, 24h) at which orders cut off on the cutoff day */
export const WS_CUTOFF_HOUR = 17; // 5:00 PM AEST

/** How many hours before cutoff the push notification reminder fires */
export const WS_CUTOFF_REMINDER_HOURS_BEFORE = 3;

/** Delivery windows offered — order matches on getDay() value */
export const WS_DELIVERY_SCHEDULE = [
  {
    deliveryDow: 1,
    deliveryLabel: 'Monday',
    cutoffDow: 6,           // Saturday
    cutoffDayOffset: -2,    // 2 calendar days before Monday = Saturday
    cutoffDayLabel: 'Saturday',
    cutoffLabel: 'Sat by 5pm AEST',
    cutoffFull: 'Saturday by 5:00pm AEST',
    windowOpen: '8:00am',
    windowClose: '5:00pm',
  },
  {
    deliveryDow: 4,
    deliveryLabel: 'Thursday',
    cutoffDow: 3,           // Wednesday
    cutoffDayOffset: -1,    // 1 calendar day before Thursday = Wednesday
    cutoffDayLabel: 'Wednesday',
    cutoffLabel: 'Wed by 5pm AEST',
    cutoffFull: 'Wednesday by 5:00pm AEST',
    windowOpen: '8:00am',
    windowClose: '5:00pm',
  },
] as const;

/** Human-readable lead time shown in profile and FAQ */
export const WS_LEAD_TIME_LABEL = '1 business day';

/** Display label for the delivery window on date cards */
export const WS_DELIVERY_WINDOW_LABEL = '8am – 5pm';
