/**
 * Smart dynamic greeting system for Butterfield customers.
 *
 * Priority order:
 *  1. Birthday
 *  2. Reward ready
 *  3. Islamic holiday (Eid, Laylat al-Qadr, Mawlid, etc.)
 *  4. Australian public holiday (from live API)
 *  5. Fixed/calendar holiday (Easter, Halloween, etc.)
 *  6. Ramadan period
 *  7. Inactive customer
 *  8. Loyalty cues
 *  9. Weather-aware message (if live weather available)
 * 10. Season
 * 11. Weekend
 * 12. Time of day
 */

import type { LiveContext } from './api';

export interface GreetingContext {
  firstName: string;
  loyaltyPoints: number;
  hasClaimableReward: boolean;
  birthday?: string | null;
  lastOrderDate?: string | null;
  loyaltyTier?: string;
  stampCount?: number;
  liveContext?: LiveContext | null;
}

export interface Greeting {
  line1: string;
  line2: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function getSydneyNow(): Date {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Australia/Sydney' }));
}

function getAuSeason(month: number): 'summer' | 'autumn' | 'winter' | 'spring' {
  if (month === 12 || month <= 2) return 'summer';
  if (month <= 5) return 'autumn';
  if (month <= 8) return 'winter';
  return 'spring';
}

function getCalendarHoliday(month: number, day: number, dayOfWeek: number): string | null {
  if (month === 1  && day === 1)  return 'new-year';
  if (month === 1  && day === 26) return 'australia-day';
  if (month === 2  && day === 14) return 'valentines';
  if (month === 4  && day === 25) return 'anzac-day';
  if (month === 10 && day === 31) return 'halloween';
  if (month === 12 && day === 25) return 'christmas';
  if (month === 12 && day === 26) return 'boxing-day';
  if (month === 12 && (day === 31 || day === 30)) return 'nye';
  if (month === 5 && dayOfWeek === 0 && day >= 8  && day <= 14) return 'mothers-day';
  if (month === 9 && dayOfWeek === 0 && day >= 1  && day <= 7)  return 'fathers-day';
  if ((month === 3 && day >= 20) || (month === 4 && day <= 20)) {
    if (dayOfWeek === 5 || dayOfWeek === 6 || dayOfWeek === 0 || dayOfWeek === 1) return 'easter';
  }
  return null;
}

function isBirthday(birthday: string | null | undefined): boolean {
  if (!birthday) return false;
  const now = getSydneyNow();
  const mm  = String(now.getMonth() + 1).padStart(2, '0');
  const dd  = String(now.getDate()).padStart(2, '0');
  const bdStr = birthday.length > 5 ? birthday.slice(5) : birthday;
  return bdStr === `${mm}-${dd}`;
}

function daysSinceLastOrder(lastOrderDate: string | null | undefined): number | null {
  if (!lastOrderDate) return null;
  return Math.floor((Date.now() - new Date(lastOrderDate).getTime()) / 86_400_000);
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ── Message banks ─────────────────────────────────────────────────────────────

const ISLAMIC_MESSAGES: Record<string, Array<[string, string]>> = {
  'Eid al-Fitr': [
    ['Eid Mubarak! 🎊', 'May your celebrations be filled with sweetness.'],
    ['Eid al-Fitr Mubarak! 🌙', 'A blessed end to a beautiful Ramadan.'],
    ['Eid Mubarak to you and your family! 🎉', 'Come celebrate with something sweet.'],
  ],
  'Eid al-Adha': [
    ['Eid al-Adha Mubarak! 🌙', 'Wishing you a blessed celebration.'],
    ['Eid Mubarak! 🎊', 'May this Eid bring joy and sweetness.'],
    ['Happy Eid al-Adha! 🌟', 'A blessed day for you and yours.'],
  ],
  'Laylat al-Qadr': [
    ['Laylat al-Qadr Mubarak. 🌙', 'May this blessed night bring peace and blessings.'],
    ['The holiest night of Ramadan. 🌙', 'May your prayers be answered.'],
  ],
  'Islamic New Year': [
    ['Islamic New Year Mubarak! 🌙', 'A blessed start to the new Hijri year.'],
    ['Happy Islamic New Year! 🌟', 'May the new year bring peace and blessings.'],
  ],
  'Mawlid al-Nabi': [
    ['Mawlid al-Nabi Mubarak! 🌟', 'Celebrating the Prophet\'s birthday ﷺ.'],
    ['Happy Mawlid! 🌙', 'A blessed day to remember.'],
  ],
  "Isra' wal Mi'raj": [
    ["Isra' wal Mi'raj Mubarak! 🌙", 'A blessed night to remember.'],
  ],
  "Laylat al-Bara'ah": [
    ["Laylat al-Bara'ah Mubarak! 🌙", 'May your prayers be accepted tonight.'],
  ],
};

const RAMADAN_MESSAGES: Array<[string, string]> = [
  ['Ramadan Mubarak! 🌙', 'Wishing you a blessed and peaceful Ramadan.'],
  ['Ramadan Kareem! 🌙', 'May this blessed month bring you peace.'],
  ['Blessed Ramadan. 🌙', 'We\'re here whenever you\'re ready to treat yourself.'],
  ['Ramadan Mubarak to all! 🌙', 'A beautiful month of reflection.'],
];

const CALENDAR_HOLIDAY_MESSAGES: Record<string, Array<[string, string]>> = {
  'new-year': [
    ['New year, same cravings.', 'Start it with Butterfield.'],
    ['Fresh year.', 'Fresh coffee. Warm cookies.'],
    ['Happy New Year! 🥂', 'Celebrate with something sweet.'],
  ],
  'australia-day': [
    ['Happy Australia Day! 🇦🇺', 'Grab a coffee and celebrate.'],
    ['Aussie day cravings?', 'Cookies and coffee sorted.'],
  ],
  'valentines': [
    ['Valentine\'s cravings?', 'Share a cookie. Or don\'t.'],
    ['Love is sweet.', 'So are our cookies. 💝'],
    ['Happy Valentine\'s Day ❤️', 'Treat yourself and someone you love.'],
  ],
  'anzac-day': [
    ['Lest we forget. 🌹', 'Come in and grab a warm coffee.'],
    ['Anzac Day.', 'A quiet coffee and something warm.'],
  ],
  'halloween': [
    ['Trick or treat? 🎃', 'We\'ve got the sweet stuff.'],
    ['Halloween cravings?', 'Come haunt our cookie counter.'],
  ],
  'christmas': [
    ['Christmas cravings? 🎄', 'We\'re baking something special.'],
    ['Festive mood is on.', 'Cookies make it better.'],
    ['Merry Christmas! 🎅', 'A warm cookie for the big day.'],
  ],
  'boxing-day': [
    ['Boxing Day sorted.', 'Leftovers or Butterfield?'],
    ['Day after Christmas?', 'We\'re still baking. Come in.'],
  ],
  'nye': [
    ['New Year\'s Eve! 🥂', 'Last cookie of the year — make it count.'],
    ['One more sleep.', 'One more cookie. You deserve it.'],
  ],
  'mothers-day': [
    ['Happy Mother\'s Day 💐', 'Mum deserves the good coffee today.'],
    ['For Mum, always the best.', 'Coffee and cookies sorted.'],
  ],
  'fathers-day': [
    ['Happy Father\'s Day 🙌', 'Dad deserves a warm cookie today.'],
    ['Treat Dad properly today.', 'Coffee and cookies sorted.'],
  ],
  'easter': [
    ['Easter treats? 🐣', 'We\'ve got you covered.'],
    ['Long weekend cravings are real.', 'Come through.'],
    ['Happy Easter! 🐰', 'Sweet things are waiting.'],
  ],
};

// Weather messages keyed by condition; factory receives actual temp
const WEATHER_MESSAGES: Record<string, (temp: number) => Array<[string, string]>> = {
  clear: (temp) => temp >= 30
    ? [
        [`${temp}° and clear in Sydney. ☀️`, 'Iced coffee is the move.'],
        [`Hot one today. ${temp}°`, 'Cool down with something cold.'],
        [`Scorching ${temp}° out there. ☀️`, 'Ice cold drinks are waiting.'],
      ]
    : temp >= 23
    ? [
        [`Beautiful ${temp}° in Sydney today. ☀️`, 'Perfect day for a coffee run.'],
        [`Lovely ${temp}° and clear. ☀️`, 'Make the most of it.'],
        [`${temp}° and sunny in Sydney. ☀️`, 'A great day for Butterfield.'],
      ]
    : temp >= 15
    ? [
        [`Mild ${temp}° in Sydney. ☀️`, 'Perfect weather for a warm coffee.'],
        [`A pleasant ${temp}° today. ☀️`, 'Come grab something good.'],
      ]
    : [
        [`Cool ${temp}° in Sydney today. ☀️`, 'A warm cookie fixes everything.'],
        [`Only ${temp}° — but sunny! ☀️`, 'Warm up with a coffee.'],
      ],
  cloudy: (temp) => [
    [`${temp}° and overcast in Sydney. ⛅`, 'A warm coffee sounds about right.'],
    [`Grey skies today. ${temp}°`, 'We\'ve got warm cookies waiting.'],
    [`Cloudy ${temp}° day in Sydney. ⛅`, 'A coffee helps with that.'],
  ],
  rainy: (_temp) => [
    ['Rainy day in Sydney. 🌧️', 'Come in, warm up, treat yourself.'],
    ['Wet one out there. 🌧️', 'A warm coffee is calling your name.'],
    ['Sydney rain hits different. 🌧️', 'We\'re warm and dry inside.'],
  ],
  showery: (_temp) => [
    ['Showers in Sydney today. 🌦️', 'Pop in between the rain.'],
    ['On-and-off showers. 🌦️', 'A warm coffee sorts that out.'],
  ],
  stormy: (_temp) => [
    ['Storm rolling through Sydney. ⛈️', 'Stay dry. Warm cookies waiting.'],
    ['Wild weather out there. ⛈️', 'We\'ve got you covered inside.'],
  ],
  foggy: (_temp) => [
    ['Foggy Sydney morning. 🌫️', 'A coffee helps clear the head.'],
    ['Thick fog in Sydney today. 🌫️', 'Stay safe and come grab a warm one.'],
  ],
};

const SEASON_MESSAGES: Record<string, Array<[string, string]>> = {
  summer: [
    ['Hot one today.', 'Cold drinks and soft serve waiting.'],
    ['Sydney summer is doing too much.', 'Come cool down with us.'],
    ['Summer cravings sorted.', 'Iced coffee, soft serve, cookies.'],
    ['Too hot to think?', 'Just order the iced coffee.'],
  ],
  autumn: [
    ['Autumn weather, warm cookies.', 'Perfect match.'],
    ['Cosy season is here.', 'You know what that means.'],
    ['A warm cookie just makes sense today.', 'Come grab one.'],
    ['Autumn vibes.', 'Warm coffee, warm cookies.'],
  ],
  winter: [
    ['Cold outside.', 'Warm cookies inside.'],
    ['This weather needs coffee.', 'And probably a cookie too.'],
    ['Winter cravings hit different.', 'Come warm up.'],
    ['Cold hands, warm cookie.', 'Problem solved.'],
    ['Winter was made for coffee runs.', 'Let\'s go.'],
  ],
  spring: [
    ['Spring day, sweet mood.', 'Treat yourself.'],
    ['Fresh day, fresh coffee.', 'Let\'s go.'],
    ['Spring feels better with Butterfield.', 'Come say hi.'],
    ['Flowers are blooming.', 'Cookies are baking.'],
  ],
};

const TIME_MESSAGES: Record<string, Array<[string, string]>> = {
  morning:   [
    ['Morning.', 'Your usual coffee is calling.'],
    ['Coffee first?', 'We\'ve got you covered.'],
    ['Early start?', 'Coffee, cookies, or both?'],
    ['Start the day properly.', 'A cookie fixes everything.'],
  ],
  afternoon: [
    ['Afternoon pick-me-up?', 'A warm cookie fixes a lot.'],
    ['Midday cravings are real.', 'We\'re ready when you are.'],
    ['Need a little treat?', 'Coffee and cookies are waiting.'],
    ['Afternoon slump?', 'We\'ve got the good stuff.'],
  ],
  evening:   [
    ['Warm cookies hit different at night.', 'Come get one.'],
    ['Night cravings?', 'We\'re still baking.'],
    ['Still thinking about cookies?', 'So are we.'],
    ['A coffee and a slow night.', 'Sounds about right.'],
  ],
  night:     [
    ['Late night cravings?', 'We feel that.'],
    ['Night owl?', 'A cookie and a warm drink helps.'],
    ['Still up?', 'So are we. Come through.'],
  ],
};

const LOYALTY_MESSAGES = {
  reward_ready:     [
    ['Your reward is ready.', 'Come claim it.'],
    ['Free treat unlocked.', 'You know what to do.'],
    ['Your next one\'s on us.', 'Come in and claim it.'],
  ] as Array<[string, string]>,
  high_points:      [
    ['Your rewards are building nicely.', 'Coffee run?'],
    ['You\'re getting closer to your next reward.', 'Keep going.'],
  ] as Array<[string, string]>,
  not_ordered_long: [
    ['We\'ve missed you.', 'Come grab something warm.'],
    ['Been a minute.', 'Your coffee misses you.'],
    ['Your usual spot is waiting.', 'Come back soon.'],
  ] as Array<[string, string]>,
};

const WEEKEND_MESSAGES: Array<[string, string]> = [
  ['Weekend mode is on.', 'Cookies are baking.'],
  ['Saturday cravings?', 'You know where to find us.'],
  ['Sunday treats taste better.', 'Come warm up with us.'],
  ['Weekend coffee run?', 'Make it Butterfield.'],
];

// ── Main function ─────────────────────────────────────────────────────────────

export function buildGreeting(ctx: GreetingContext): Greeting {
  const { firstName, loyaltyPoints, hasClaimableReward, birthday, lastOrderDate, loyaltyTier, liveContext } = ctx;

  const name      = firstName && firstName !== 'there' ? firstName : null;
  const now       = getSydneyNow();
  const hour      = now.getHours();
  const month     = now.getMonth() + 1;
  const day       = now.getDate();
  const dow       = now.getDay();
  const season    = getAuSeason(month);
  const calHol    = getCalendarHoliday(month, day, dow);
  const isWeekend = dow === 0 || dow === 6;
  const daysSince = daysSinceLastOrder(lastOrderDate);

  // Live context (falls back gracefully if API unavailable)
  const weather        = liveContext?.weather ?? null;
  const publicHoliday  = liveContext?.publicHoliday  ?? null;
  const islamicHoliday = liveContext?.islamicHoliday ?? null;
  const isRamadan      = liveContext?.isRamadan       ?? false;
  const hijriDay       = liveContext?.hijriDay         ?? 0;

  function withName(l1: string, l2: string): Greeting {
    if (!name || l1.includes(name)) return { line1: l1, line2: l2 };
    return { line1: `${name}, ${l1.charAt(0).toLowerCase()}${l1.slice(1)}`, line2: l2 };
  }
  const raw = (pair: [string, string]): Greeting => ({ line1: pair[0], line2: pair[1] });

  // 1. Birthday
  if (isBirthday(birthday) && name) {
    return { line1: `Happy birthday, ${name}! 🎉`, line2: 'Your birthday treat is waiting.' };
  }

  // 2. Reward ready
  if (hasClaimableReward && name) {
    return { line1: `${name}, your reward is ready.`, line2: pick(LOYALTY_MESSAGES.reward_ready)[1] };
  }

  // 3. Islamic holiday
  if (islamicHoliday) {
    const msgs = ISLAMIC_MESSAGES[islamicHoliday];
    if (msgs) {
      const [l1, l2] = pick(msgs);
      return name ? { line1: l1, line2: `${name}, ${l2.charAt(0).toLowerCase()}${l2.slice(1)}` } : { line1: l1, line2: l2 };
    }
    return { line1: `${islamicHoliday} Mubarak! 🌙`, line2: name ? `Wishing you a blessed day, ${name}.` : 'Wishing you a blessed day.' };
  }

  // 4. Australian public holiday (exact name from live API)
  if (publicHoliday) {
    return {
      line1: `Happy ${publicHoliday}! 🇦🇺`,
      line2: name ? `Enjoy the day off, ${name}.` : 'Enjoy the long weekend.',
    };
  }

  // 5. Fixed calendar holidays (fallback if not captured by live API)
  if (calHol) {
    const msgs = CALENDAR_HOLIDAY_MESSAGES[calHol];
    if (msgs) {
      const [l1, l2] = pick(msgs);
      if (['mothers-day', 'fathers-day', 'christmas', 'new-year'].includes(calHol)) return raw([l1, l2]);
      return name ? withName(l1, l2) : raw([l1, l2]);
    }
  }

  // 6. Ramadan period
  if (isRamadan) {
    if (hijriDay === 1) {
      return {
        line1: 'Ramadan Mubarak! 🌙',
        line2: name ? `${name}, may this month be blessed.` : 'May this holy month bring you peace.',
      };
    }
    if (Math.random() < 0.55) {
      return raw(pick(RAMADAN_MESSAGES));
    }
  }

  // 7. Inactive customer (>14 days since last order)
  if (daysSince !== null && daysSince > 14) {
    const [, l2] = pick(LOYALTY_MESSAGES.not_ordered_long);
    return name ? { line1: `We've missed you, ${name}.`, line2: l2 } : raw(pick(LOYALTY_MESSAGES.not_ordered_long));
  }

  // 8. Loyalty cues
  if (loyaltyPoints >= 200 && name) {
    const [l1, l2] = pick(LOYALTY_MESSAGES.high_points);
    return { line1: `${name}, ${l1.charAt(0).toLowerCase()}${l1.slice(1)}`, line2: l2 };
  }

  // 9. Live weather (65% chance if weather is available)
  if (weather && Math.random() < 0.65) {
    const bank = WEATHER_MESSAGES[weather.condition]?.(weather.temp) ?? [];
    if (bank.length) {
      const [l1, l2] = pick(bank);
      return name ? withName(l1, l2) : raw([l1, l2]);
    }
  }

  // 10. Season
  if (Math.random() < 0.55) {
    const msgs = SEASON_MESSAGES[season] ?? [];
    if (msgs.length) {
      const [l1, l2] = pick(msgs);
      return name ? withName(l1, l2) : raw([l1, l2]);
    }
  }

  // 11. Weekend
  if (isWeekend && Math.random() < 0.5) {
    const [l1, l2] = pick(WEEKEND_MESSAGES);
    return name ? withName(l1, l2) : raw([l1, l2]);
  }

  // 12. Time of day
  const timePeriod =
    hour < 5  ? 'night'     :
    hour < 12 ? 'morning'   :
    hour < 17 ? 'afternoon' : 'evening';

  if (timePeriod === 'morning' && Math.random() < 0.4 && name) {
    return { line1: `Good morning, ${name} ☀️`, line2: pick(TIME_MESSAGES.morning)[1] };
  }

  const [l1, l2] = pick(TIME_MESSAGES[timePeriod] ?? TIME_MESSAGES.morning);
  return name ? withName(l1, l2) : raw([l1, l2]);
}
