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
    ['New year, same cravings.', 'Start it right — fresh cookies and great coffee.'],
    ['Fresh year.', 'Fresh coffee. Warm cookies. That\'s the move.'],
    ['Happy New Year! 🥂', 'Celebrate with a cookie and the best coffee around.'],
    ['New year.', 'Same spot. Same great cookies and coffee.'],
  ],
  'australia-day': [
    ['Happy Australia Day! 🇦🇺', 'Grab a great coffee and a fresh cookie. Celebrate properly.'],
    ['Aussie day cravings?', 'Cookies, coffee, soft serve — all sorted.'],
    ['Australia Day. 🇦🇺', 'Our coffee is something else. Come celebrate with one.'],
    ['Happy Australia Day! 🇦🇺', 'Cookies and iced coffee. That\'s a proper Aussie day sorted.'],
  ],
  'valentines': [
    ['Valentine\'s cravings?', 'Share a cookie. Or don\'t.'],
    ['Love is sweet.', 'So are our cookies. And our soft serve. 💝'],
    ['Happy Valentine\'s Day ❤️', 'Treat yourself — a cookie and a great coffee.'],
    ['Valentine\'s sorted. ❤️', 'Fresh cookies, vanilla soft serve, great coffee.'],
  ],
  'anzac-day': [
    ['Lest we forget. 🌹', 'Come in and grab a warm coffee.'],
    ['Anzac Day.', 'A quiet coffee and a fresh cookie.'],
    ['Lest we forget. 🌹', 'Our coffee is here whenever you\'re ready.'],
    ['Anzac Day. 🌹', 'A warm cookie and a hot coffee. A quiet moment.'],
  ],
  'halloween': [
    ['Trick or treat? 🎃', 'We\'ve got the cookies. Come haunt us.'],
    ['Halloween cravings? 🎃', 'Come haunt our cookie counter.'],
    ['Spooky szn. 🎃', 'Fresh cookies and great coffee. Inside.'],
    ['Halloween. 🎃', 'Vanilla soft serve? In October? Yes. Come get one.'],
  ],
  'christmas': [
    ['Christmas cravings? 🎄', 'Fresh cookies are baking. Coffee is on.'],
    ['Festive mood is on. 🎄', 'Cookies and great coffee make it better.'],
    ['Merry Christmas! 🎅', 'A warm cookie and the best coffee. Our gift to you.'],
    ['Christmas Day. 🎅', 'Cookies are fresh. Coffee is on. Come say hi.'],
  ],
  'boxing-day': [
    ['Boxing Day sorted.', 'Leftovers or fresh cookies? Easy choice.'],
    ['Day after Christmas?', 'We\'re still baking cookies. Coffee is on. Come in.'],
    ['Boxing Day.', 'Fresh cookies, great coffee, vanilla soft serve. We\'re here.'],
  ],
  'nye': [
    ['New Year\'s Eve! 🥂', 'Last cookie of the year — make it count.'],
    ['One more night.', 'One more cookie. One more great coffee. You deserve it.'],
    ['NYE sorted. 🥂', 'Cookies, soft serve, milkshakes — last run of the year.'],
  ],
  'mothers-day': [
    ['Happy Mother\'s Day 💐', 'Mum deserves a seriously good coffee today.'],
    ['For Mum, always the best.', 'Our coffee and fresh cookies. Sorted.'],
    ['Happy Mother\'s Day 💐', 'Treat Mum to a vanilla soft serve and a great coffee.'],
    ['Mother\'s Day sorted. 💐', 'Coffee, cookies, soft serve — Mum picks first.'],
  ],
  'fathers-day': [
    ['Happy Father\'s Day 🙌', 'Dad deserves a fresh cookie and a seriously good coffee.'],
    ['Treat Dad properly today.', 'Coffee, cookies, soft serve — all here.'],
    ['Happy Father\'s Day 🙌', 'A great coffee and a warm cookie. Sort Dad out.'],
    ['Father\'s Day sorted. 🙌', 'Cookies and our coffee — the two things Dad actually wants.'],
  ],
  'easter': [
    ['Easter treats? 🐣', 'Fresh cookies and great coffee — we\'ve got you.'],
    ['Long weekend cravings are real.', 'Cookies, soft serve, milkshakes. Come through.'],
    ['Happy Easter! 🐰', 'Vanilla soft serve and fresh cookies are waiting.'],
    ['Easter long weekend. 🐣', 'Soft serve, frappes, iced coffee, cookies. Sorted.'],
  ],
};

// Weather messages keyed by condition; factory receives actual temp
const WEATHER_MESSAGES: Record<string, (temp: number) => Array<[string, string]>> = {
  clear: (temp) => temp >= 30
    ? [
        [`${temp}° and clear in Sydney. ☀️`, 'Iced coffee and soft serve are calling.'],
        [`Hot one today. ${temp}°`, 'Frappe or iced coffee — your call.'],
        [`Scorching ${temp}° out there. ☀️`, 'Vanilla soft serve hits different on days like this.'],
        [`${temp}° in Sydney. ☀️`, 'Iced drinks and frappes are ready for you.'],
        [`Too hot. ${temp}°`, 'Soft serve and iced coffee. Come sort it out.'],
      ]
    : temp >= 23
    ? [
        [`Beautiful ${temp}° in Sydney today. ☀️`, 'Perfect day for an iced coffee.'],
        [`Lovely ${temp}° and clear. ☀️`, 'Soft serve weather. Come get one.'],
        [`${temp}° and sunny in Sydney. ☀️`, 'Iced coffee or frappe? Both are waiting.'],
        [`Great day in Sydney. ${temp}° ☀️`, 'Cookies and iced drinks sorted.'],
      ]
    : temp >= 15
    ? [
        [`Mild ${temp}° in Sydney. ☀️`, 'Perfect weather for a coffee and a cookie.'],
        [`A pleasant ${temp}° today. ☀️`, 'Matcha or coffee — come grab something good.'],
        [`${temp}° and sunny. ☀️`, 'Warm coffee or iced — it\'s a good day either way.'],
        [`Nice ${temp}° in Sydney. ☀️`, 'Cookies are fresh. Coffee is on.'],
      ]
    : [
        [`Cool ${temp}° in Sydney today. ☀️`, 'A warm cookie and a hot coffee fixes everything.'],
        [`Only ${temp}° — but sunny! ☀️`, 'Warm up with our coffee. It\'s the best around.'],
        [`Chilly ${temp}° out there. ☀️`, 'Hot coffee and fresh cookies are waiting.'],
        [`${temp}° in Sydney. ☀️`, 'Perfect cookie-and-coffee weather.'],
      ],
  cloudy: (temp) => [
    [`${temp}° and overcast in Sydney. ⛅`, 'A hot coffee and a cookie sounds right.'],
    [`Grey skies today. ${temp}°`, 'Warm cookies and great coffee are waiting.'],
    [`Cloudy ${temp}° day in Sydney. ⛅`, 'Matcha or coffee — we\'ve got both sorted.'],
    [`Overcast in Sydney. ${temp}° ⛅`, 'Perfect weather to grab a cookie and sit down.'],
    [`${temp}° and cloudy. ⛅`, 'Our coffee is the best in the area. Come find out.'],
  ],
  rainy: (_temp) => [
    ['Rainy day in Sydney. 🌧️', 'Warm cookies and hot coffee are inside.'],
    ['Wet one out there. 🌧️', 'Our coffee is calling. Come dry off.'],
    ['Sydney rain hits different. 🌧️', 'A cookie and a hot coffee. Problem solved.'],
    ['Raining in Sydney. 🌧️', 'Perfect excuse to grab a warm cookie and a coffee.'],
    ['Rain outside. 🌧️', 'Matcha or coffee — both are warm and waiting.'],
  ],
  showery: (_temp) => [
    ['Showers in Sydney today. 🌦️', 'Pop in between the rain — cookies are fresh.'],
    ['On-and-off showers. 🌦️', 'A hot coffee sorts that right out.'],
    ['Showers rolling through. 🌦️', 'Warm cookies and the best coffee around. Inside.'],
    ['Patchy rain in Sydney. 🌦️', 'Matcha or coffee? Either way, come in.'],
  ],
  stormy: (_temp) => [
    ['Storm rolling through Sydney. ⛈️', 'Stay dry. Hot cookies and coffee are waiting.'],
    ['Wild weather out there. ⛈️', 'Come in. Cookies are warm, coffee is on.'],
    ['Stormy in Sydney. ⛈️', 'Best place to be right now is here with a cookie.'],
    ['Big storm outside. ⛈️', 'Hot coffee and fresh cookies. We\'ve got you.'],
  ],
  foggy: (_temp) => [
    ['Foggy Sydney morning. 🌫️', 'A coffee helps clear the head. Best in the area.'],
    ['Thick fog in Sydney today. 🌫️', 'Stay safe and grab a warm coffee on the way.'],
    ['Foggy out there. 🌫️', 'Matcha or coffee — come start the day properly.'],
    ['Sydney fog this morning. 🌫️', 'A hot coffee and a cookie. That\'s the move.'],
  ],
};

const SEASON_MESSAGES: Record<string, Array<[string, string]>> = {
  summer: [
    ['Sydney summer is doing too much.', 'Soft serve and iced coffee are waiting.'],
    ['Summer sorted.', 'Iced coffee, frappes, vanilla soft serve — all here.'],
    ['Too hot to think?', 'Iced coffee or a frappe. Come sort it out.'],
    ['Summer cravings?', 'Soft serve, iced drinks, cookies. We\'ve got all of it.'],
    ['Hot Sydney day.', 'Our vanilla soft serve is famous for a reason.'],
    ['Summer is on.', 'Milkshakes, frappes, iced coffee. Pick your weapon.'],
  ],
  autumn: [
    ['Autumn weather.', 'Warm cookies and a great coffee. Perfect match.'],
    ['Cosy season is here.', 'Fresh cookies and the best coffee around.'],
    ['Autumn vibes.', 'Matcha or coffee — both are calling.'],
    ['Settling into autumn.', 'A cookie and a hot coffee sorts the day out.'],
    ['Autumn in Sydney.', 'Fresh cookies are baking. Coffee is on.'],
    ['Cool autumn day.', 'Matcha latte and a warm cookie. Come through.'],
  ],
  winter: [
    ['Cold outside.', 'Warm cookies and hot coffee inside.'],
    ['Winter was made for our coffee.', 'Best in the area. Come find out.'],
    ['Winter cravings hit different.', 'Cookies and coffee. Come warm up.'],
    ['Cold hands.', 'Warm cookie. Hot coffee. Problem solved.'],
    ['Chilly Sydney day.', 'Matcha or coffee? Either way, come in.'],
    ['Winter calls for cookies.', 'Fresh out the oven. Coffee on the side.'],
  ],
  spring: [
    ['Spring in Sydney.', 'Fresh cookies, iced coffee, matcha. Sorted.'],
    ['Fresh day, fresh coffee.', 'Our coffee is the best in the area.'],
    ['Spring mood.', 'Iced coffee or matcha — it\'s a vibe either way.'],
    ['Flowers are blooming.', 'Cookies are baking. Come say hi.'],
    ['Warming up in Sydney.', 'Soft serve season is almost here. Cookies are already ready.'],
    ['Spring day sorted.', 'Matcha, iced coffee, fresh cookies — all waiting.'],
  ],
};

const TIME_MESSAGES: Record<string, Array<[string, string]>> = {
  morning: [
    ['Morning.', 'Your coffee is ready. Best in the area.'],
    ['Coffee first?', 'Hot coffee and fresh cookies. We\'ve got you.'],
    ['Early start?', 'Coffee, matcha, or cookies — all sorted.'],
    ['Start the day properly.', 'A fresh cookie and a great coffee. That\'s us.'],
    ['Good morning.', 'Matcha or coffee? Either way, come grab one.'],
    ['Morning sorted.', 'Hot coffee and warm cookies are waiting.'],
  ],
  afternoon: [
    ['Afternoon pick-me-up?', 'Iced coffee, frappe, or a Red Bull Fusion — sorted.'],
    ['Midday cravings are real.', 'Cookies, iced coffee, matcha — we\'ve got it all.'],
    ['Afternoon slump?', 'Frappe or iced coffee. That\'ll sort it.'],
    ['Need a boost?', 'Red Bull Fusion, V Fusion, or an iced coffee. Your call.'],
    ['3pm cravings hitting?', 'A cookie and an iced coffee. Problem solved.'],
    ['Afternoon sorted.', 'Matcha, iced coffee, or a frappe — all waiting.'],
    ['Energy low?', 'Red Bull or V Fusion? We\'ve got both. Plus cookies.'],
  ],
  evening: [
    ['Cookies hit different in the evening.', 'Come get one.'],
    ['Evening cravings?', 'Fresh cookies and a milkshake. Still going.'],
    ['Still thinking about cookies?', 'So are we. Come through.'],
    ['Evening sorted.', 'Vanilla soft serve and a cookie. That\'s the move.'],
    ['Night mode.', 'Cookies are warm. Milkshakes are cold. Come in.'],
    ['Late craving?', 'Soft serve and cookies. We\'re still here.'],
  ],
  night: [
    ['Late night cravings?', 'Cookies and soft serve. We feel that.'],
    ['Night owl?', 'A cookie and a milkshake helps. Trust us.'],
    ['Still up?', 'So are we. Cookies and soft serve are waiting.'],
    ['Late night cookie run?', 'That\'s what we\'re here for.'],
  ],
};

const LOYALTY_MESSAGES = {
  reward_ready: [
    ['Your reward is ready.', 'A free cookie or coffee is waiting — come claim it.'],
    ['Free treat unlocked.', 'Cookie, soft serve, or coffee. Your pick.'],
    ['Your next one\'s on us.', 'Come in and claim it. Cookies are fresh.'],
    ['Reward ready to claim.', 'Something good is waiting for you.'],
  ] as Array<[string, string]>,
  high_points: [
    ['Your rewards are building nicely.', 'Coffee run today?'],
    ['Getting close to your next reward.', 'A cookie or coffee could be on us soon.'],
    ['Points stacking up.', 'A free coffee or soft serve is getting closer.'],
  ] as Array<[string, string]>,
  not_ordered_long: [
    ['We\'ve missed you.', 'Fresh cookies and great coffee are waiting.'],
    ['Been a minute.', 'Your coffee misses you. So do the cookies.'],
    ['Your usual spot is waiting.', 'Cookies, coffee, soft serve — all here.'],
    ['It\'s been a while.', 'Come back for a cookie and the best coffee around.'],
  ] as Array<[string, string]>,
};

const WEEKEND_MESSAGES: Array<[string, string]> = [
  ['Weekend mode is on.', 'Cookies are fresh. Coffee is the best around.'],
  ['Saturday sorted.', 'Soft serve, iced coffee, cookies — all here.'],
  ['Sunday treat?', 'Vanilla soft serve or a frappe. Come get one.'],
  ['Weekend coffee run?', 'Make it Butterfield. Best coffee in the area.'],
  ['Weekend cravings sorted.', 'Cookies, milkshakes, soft serve. We\'ve got it all.'],
  ['Slow Sunday?', 'A cookie and a great coffee fixes that.'],
  ['Saturday vibes.', 'Iced coffee, frappes, fresh cookies. Let\'s go.'],
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
