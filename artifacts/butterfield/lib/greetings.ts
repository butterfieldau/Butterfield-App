/**
 * Smart dynamic greeting system for Butterfield customers.
 *
 * Priority order:
 *  1. Birthday
 *  2. Reward ready
 *  3. Cookie baking window (fresh out / still warm)
 *  4. Islamic holiday (Eid al-Fitr, Eid al-Adha)
 *  5. Australian public holiday (from live API)
 *  6. Fixed/calendar holiday (Easter, Halloween, etc.)
 *  7. Ramadan period
 *  8. Inactive customer
 *  9. Loyalty cues
 * 10. Favourite category (derived from order history)
 * 11. Weather-aware message (if live weather available)
 * 12. Season
 * 13. Weekend
 * 14. Time of day
 *
 * Anti-repetition: messages are picked via a deterministic seed derived from
 * (day-of-year × 24 + hour), so the greeting rotates every hour and the same
 * line cannot appear twice in a row during a session.
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
  favouriteCategory?: string | null;
  isOpen?: boolean;
  opensAt?: string | null;
}

export interface Greeting {
  line1: string;
  line2: string;
}

// ── Session seed ──────────────────────────────────────────────────────────────
// Changes on every app launch so messages feel fresh each open, but stays
// constant within a session so the greeting doesn't jump around mid-use.
const SESSION_OFFSET = Math.floor(Math.random() * 9973); // prime keeps distribution even

// ── Helpers ───────────────────────────────────────────────────────────────────

function getSydneyNow(): Date {
  try {
    const str = new Date().toLocaleString('en-US', { timeZone: 'Australia/Sydney' });
    const d = new Date(str);
    if (!isNaN(d.getTime())) return d;
  } catch {}
  // Fallback: build a plain date string representing Sydney wall-clock time (AEST UTC+10).
  // We MUST NOT use new Date(Date.now() + 10h) directly because .getHours() applies
  // the device's local timezone offset a second time, double-counting on Sydney devices.
  const shifted = new Date(Date.now() + 10 * 60 * 60 * 1000);
  const Y  = shifted.getUTCFullYear();
  const M  = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const D  = String(shifted.getUTCDate()).padStart(2, '0');
  const h  = String(shifted.getUTCHours()).padStart(2, '0');
  const mi = String(shifted.getUTCMinutes()).padStart(2, '0');
  const s  = String(shifted.getUTCSeconds()).padStart(2, '0');
  // No timezone suffix → parsed as local time → getHours() returns correct Sydney hour
  return new Date(`${Y}-${M}-${D}T${h}:${mi}:${s}`);
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

/** Deterministic pick — rotates every hour, never the same twice in a row.
 *  Throws if arr is empty so callers that forget a length-guard get a clear error
 *  instead of silently returning undefined (which causes a Babel _slicedToArray crash
 *  on the next `const [a, b] = stablePick(...)` destructure). */
function stablePick<T>(arr: ReadonlyArray<T>, seed: number): T {
  if (!arr || arr.length === 0) {
    throw new Error(`stablePick: empty array (seed=${seed})`);
  }
  // Guard against NaN/Infinity (e.g. when getSydneyNow returns Invalid Date)
  const safeSeed = Number.isFinite(seed) ? seed : Date.now();
  const idx = ((Math.floor(safeSeed) % arr.length) + arr.length) % arr.length;
  return arr[idx];
}

/** Random pick — kept for low-stakes one-off selections. */
function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Cookie baking windows (Sydney time).
 * Bake starts: 7:00, 11:00, 17:00, 19:30
 * Ready after 20 min; warm display for 45 min after that.
 * Returns 'just_out' (first 20 min), 'warm' (next 25 min), or null.
 */
function getBakingWindow(hour: number, minute: number): 'just_out' | 'warm' | null {
  const t = hour * 60 + minute;
  // [readyAt, warmUntil] in minutes from midnight
  const windows: [number, number][] = [
    [7 * 60 + 20, 8 * 60 + 5],
    [11 * 60 + 20, 12 * 60 + 5],
    [17 * 60 + 20, 18 * 60 + 5],
    [19 * 60 + 50, 20 * 60 + 35],
  ];
  for (const [readyAt, warmUntil] of windows) {
    if (t >= readyAt && t < readyAt + 20) return 'just_out';
    if (t >= readyAt + 20 && t < warmUntil) return 'warm';
  }
  return null;
}

// ── Message banks ─────────────────────────────────────────────────────────────

const BAKING_MESSAGES: Record<'just_out' | 'warm', Array<[string, string]>> = {
  just_out: [
    ['Cookies just came out of the oven. 🍪', 'Fresh and hot — best time to come in.'],
    ['Fresh batch just landed. 🍪', 'Hot cookies and a great coffee. Perfect timing.'],
    ['Oven just opened. 🍪', 'Cookies are out. They won\'t last long.'],
    ['Hot cookies right now. 🍪', 'Fresh out of the oven — come get one while they\'re warm.'],
    ['Cookies are out! 🍪', 'Just baked. Hot and ready. Get in quick.'],
    ['Fresh bake just dropped. 🍪', 'Still steaming — come grab one.'],
    ['Oven-fresh cookies right now. 🍪', 'This is the moment. Come in.'],
    ['Just pulled from the oven. 🍪', 'Warm cookies and the best coffee in the area.'],
  ],
  warm: [
    ['Cookies are still warm from the oven. 🍪', 'Come grab one before they cool down.'],
    ['Warm cookies on the counter right now. 🍪', 'A coffee on the side makes it perfect.'],
    ['Fresh cookies, still warm. 🍪', 'Best time to pop in — they\'re at peak flavour.'],
    ['Cookies are fresh and warm. 🍪', 'Get one while the warmth lasts.'],
    ['Still warm from the oven. 🍪', 'Cookies + coffee right now = best decision of the day.'],
    ['Warm cookies waiting for you. 🍪', 'Fresh bake — pair with a great coffee.'],
    ['Cookies are warm and ready. 🍪', 'Come in now — this is the sweet spot.'],
    ['Fresh batch, still warm. 🍪', 'The window for warm cookies is open. Come in.'],
  ],
};

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

const WEATHER_MESSAGES: Record<string, (temp: number) => Array<[string, string]>> = {
  clear: (temp) => temp >= 30
    ? [
        [`${temp}° and clear in Sydney. ☀️`, 'Iced coffee and soft serve are calling.'],
        [`Hot one today. ${temp}°`, 'Frappe or iced coffee — your call.'],
        [`Scorching ${temp}° out there. ☀️`, 'Vanilla soft serve hits different on days like this.'],
        [`${temp}° in Sydney. ☀️`, 'Iced drinks and frappes are ready for you.'],
        [`Too hot. ${temp}°`, 'Soft serve and iced coffee. Come sort it out.'],
        [`${temp}° and sunny. ☀️`, 'This is soft serve weather. No debate.'],
        [`Seriously hot. ${temp}° ☀️`, 'Iced coffee or a frappe — both are cold and waiting.'],
      ]
    : temp >= 23
    ? [
        [`Beautiful ${temp}° in Sydney today. ☀️`, 'Perfect day for an iced coffee.'],
        [`Lovely ${temp}° and clear. ☀️`, 'Soft serve weather. Come get one.'],
        [`${temp}° and sunny in Sydney. ☀️`, 'Iced coffee or frappe? Both are waiting.'],
        [`Great day in Sydney. ${temp}° ☀️`, 'Cookies and iced drinks sorted.'],
        [`Warm ${temp}° day. ☀️`, 'Iced matcha or coffee — it\'s a good call either way.'],
        [`${temp}° and gorgeous outside. ☀️`, 'Come in for a cold drink and a fresh cookie.'],
      ]
    : temp >= 15
    ? [
        [`Mild ${temp}° in Sydney. ☀️`, 'Perfect weather for a coffee and a cookie.'],
        [`A pleasant ${temp}° today. ☀️`, 'Matcha or coffee — come grab something good.'],
        [`${temp}° and sunny. ☀️`, 'Warm coffee or iced — it\'s a good day either way.'],
        [`Nice ${temp}° in Sydney. ☀️`, 'Cookies are fresh. Coffee is on.'],
        [`${temp}° out there. ☀️`, 'Perfect excuse for a cookie and a flat white.'],
        [`Good weather today. ${temp}° ☀️`, 'Matcha, coffee, or something cold — we\'ve got it all.'],
      ]
    : [
        [`Cool ${temp}° in Sydney today. ☀️`, 'A warm cookie and a hot coffee fixes everything.'],
        [`Only ${temp}° — but sunny! ☀️`, 'Warm up with our coffee. It\'s the best around.'],
        [`Chilly ${temp}° out there. ☀️`, 'Hot coffee and fresh cookies are waiting.'],
        [`${temp}° in Sydney. ☀️`, 'Perfect cookie-and-coffee weather.'],
        [`Cold but clear. ${temp}° ☀️`, 'A hot flat white sorts this right out.'],
      ],
  cloudy: (temp) => [
    [`${temp}° and overcast in Sydney. ⛅`, 'A hot coffee and a cookie sounds right.'],
    [`Grey skies today. ${temp}°`, 'Warm cookies and great coffee are waiting.'],
    [`Cloudy ${temp}° day in Sydney. ⛅`, 'Matcha or coffee — we\'ve got both sorted.'],
    [`Overcast in Sydney. ${temp}° ⛅`, 'Perfect weather to grab a cookie and sit down.'],
    [`${temp}° and cloudy. ⛅`, 'Our coffee is the best in the area. Come find out.'],
    [`Grey day outside. ${temp}° ⛅`, 'Warm cookies and a great coffee. Easy fix.'],
    [`Overcast Sydney day. ${temp}° ⛅`, 'Hot matcha or a flat white — both are ready.'],
  ],
  rainy: (_temp) => [
    ['Rainy day in Sydney. 🌧️', 'Warm cookies and hot coffee are inside.'],
    ['Wet one out there. 🌧️', 'Our coffee is calling. Come dry off.'],
    ['Sydney rain hits different. 🌧️', 'A cookie and a hot coffee. Problem solved.'],
    ['Raining in Sydney. 🌧️', 'Perfect excuse to grab a warm cookie and a coffee.'],
    ['Rain outside. 🌧️', 'Matcha or coffee — both are warm and waiting.'],
    ['Pouring in Sydney. 🌧️', 'Get in, get dry, get a cookie. Easy.'],
    ['Rainy one today. 🌧️', 'Hot coffee and a fresh-baked cookie. Best combo for rain.'],
  ],
  showery: (_temp) => [
    ['Showers in Sydney today. 🌦️', 'Pop in between the rain — cookies are fresh.'],
    ['On-and-off showers. 🌦️', 'A hot coffee sorts that right out.'],
    ['Showers rolling through. 🌦️', 'Warm cookies and the best coffee around. Inside.'],
    ['Patchy rain in Sydney. 🌦️', 'Matcha or coffee? Either way, come in.'],
    ['Shower break?', 'Best time to duck in for a cookie and a coffee.'],
  ],
  stormy: (_temp) => [
    ['Storm rolling through Sydney. ⛈️', 'Stay dry. Hot cookies and coffee are waiting.'],
    ['Wild weather out there. ⛈️', 'Come in. Cookies are warm, coffee is on.'],
    ['Stormy in Sydney. ⛈️', 'Best place to be right now is here with a cookie.'],
    ['Big storm outside. ⛈️', 'Hot coffee and fresh cookies. We\'ve got you.'],
    ['Rough out there. ⛈️', 'Get inside. Coffee is on, cookies are warm.'],
  ],
  foggy: (_temp) => [
    ['Foggy Sydney morning. 🌫️', 'A coffee helps clear the head. Best in the area.'],
    ['Thick fog in Sydney today. 🌫️', 'Stay safe and grab a warm coffee on the way.'],
    ['Foggy out there. 🌫️', 'Matcha or coffee — come start the day properly.'],
    ['Sydney fog this morning. 🌫️', 'A hot coffee and a cookie. That\'s the move.'],
    ['Misty morning in Sydney. 🌫️', 'Warm up with a flat white and a fresh cookie.'],
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
    ['Peak summer.', 'Iced matcha, frappes, soft serve. All cold and waiting.'],
    ['Summer heat hitting hard.', 'Cold drinks and fresh cookies. Come sort it out.'],
    ['Scorching summer day.', 'Soft serve + cookies. This is the move.'],
    ['Hot one again.', 'Iced coffee and vanilla soft serve. Your call.'],
    ['Sydney summer doing its thing.', 'Stay cool — frappes and iced drinks are ready.'],
    ['Another warm one.', 'Cookies are baking. Iced drinks are cold. Come in.'],
  ],
  autumn: [
    ['Autumn weather.', 'Warm cookies and a great coffee. Perfect match.'],
    ['Cosy season is here.', 'Fresh cookies and the best coffee around.'],
    ['Autumn vibes.', 'Matcha or coffee — both are calling.'],
    ['Settling into autumn.', 'A cookie and a hot coffee sorts the day out.'],
    ['Autumn in Sydney.', 'Fresh cookies are baking. Coffee is on.'],
    ['Cool autumn day.', 'Matcha latte and a warm cookie. Come through.'],
    ['Autumn is the best cookie season.', 'Fresh bake, great coffee. Come find out.'],
    ['Golden hour in Sydney.', 'Warm cookie and a flat white. That\'s autumn sorted.'],
    ['Crisp autumn air.', 'Our coffee hits different when it\'s cool outside.'],
    ['Autumn coffee weather.', 'Flat white, matcha, or hot choc — all on.'],
    ['Perfect cookie weather.', 'Autumn was made for this. Fresh-baked and ready.'],
    ['Autumn calls for warm things.', 'Cookies, hot coffee, matcha. All here.'],
    ['Good day for a warm one.', 'Fresh cookies and the best coffee in the area.'],
    ['Cool breeze, warm cookies.', 'Come grab one while they\'re fresh.'],
    ['Autumn appetite?', 'Warm cookies and a great coffee is always the answer.'],
  ],
  winter: [
    ['Cold outside.', 'Warm cookies and hot coffee inside.'],
    ['Winter was made for our coffee.', 'Best in the area. Come find out.'],
    ['Winter cravings hit different.', 'Cookies and coffee. Come warm up.'],
    ['Cold hands.', 'Warm cookie. Hot coffee. Problem solved.'],
    ['Chilly Sydney day.', 'Matcha or coffee? Either way, come in.'],
    ['Winter calls for cookies.', 'Fresh out the oven. Coffee on the side.'],
    ['Coldest part of the year.', 'Warmest cookies in the area. Come in.'],
    ['Winter warmth.', 'Hot flat white and a fresh cookie. That\'s the move.'],
    ['Cold enough for a hot drink.', 'Our coffee is the best in Merrylands. Come find out.'],
    ['Layers on, coffee in hand.', 'Warm cookies and great coffee. We\'ve got you.'],
    ['Winter just hits different.', 'Hot matcha or a flat white — both are ready.'],
    ['Frosty morning.', 'Hot coffee, warm cookie. This is the fix.'],
    ['Rugging up today?', 'So are we. Warm cookies and hot coffee — come in.'],
    ['Cold enough to need both hands around a coffee.', 'We\'ve got you covered.'],
  ],
  spring: [
    ['Spring in Sydney.', 'Fresh cookies, iced coffee, matcha. Sorted.'],
    ['Fresh day, fresh coffee.', 'Our coffee is the best in the area.'],
    ['Spring mood.', 'Iced coffee or matcha — it\'s a vibe either way.'],
    ['Flowers are blooming.', 'Cookies are baking. Come say hi.'],
    ['Warming up in Sydney.', 'Soft serve season is almost here. Cookies are already ready.'],
    ['Spring day sorted.', 'Matcha, iced coffee, fresh cookies — all waiting.'],
    ['Beautiful spring day.', 'Grab a cookie and something to drink. You deserve it.'],
    ['Spring is here.', 'Warm enough for iced coffee, cool enough for a latte.'],
    ['Sydney spring.', 'Fresh cookies + a great coffee = best time of year.'],
    ['That spring feeling.', 'Come grab a matcha or an iced coffee. Cookies are fresh.'],
    ['Spring vibes.', 'Frappes, iced matcha, cookies. The season is here.'],
    ['Good spring day.', 'Iced or hot — it\'s a great coffee either way.'],
    ['Warming up out there.', 'Soft serve is almost back in full swing. Cookies always are.'],
  ],
};

const TIME_MESSAGES: Record<string, Array<[string, string]>> = {
  earlyMorning: [
    ['Early start?', 'Seven Miles Coffee, matcha, or cookies — all sorted.'],
    ['Up before the city.', 'Seven Miles Coffee is ready. Best in the area.'],
    ['Early bird?', 'Hot coffee and fresh cookies are waiting.'],
    ['Starting early?', 'A Seven Miles Coffee sorts the morning right out.'],
    ['First one in?', 'Iced matcha or a flat white — we\'ve got you covered.'],
    ['Early riser.', 'Seven Miles Coffee in Merrylands. Come start the day right.'],
    ['Up with the birds?', 'We\'re baking. Seven Miles Coffee is on. Come in.'],
    ['Early morning run?', 'Seven Miles Coffee and a fresh cookie. Perfect fuel.'],
  ],
  morning: [
    ['Good morning.', 'Seven Miles Coffee is ready. Best in the area.'],
    ['Good morning! ☀️', 'Fresh cookies and Seven Miles Coffee are waiting.'],
    ['Good morning.', 'Iced matcha or coffee? Either way, come grab one.'],
    ['Good morning! ☀️', 'Start the day properly — a Seven Miles Coffee and a warm cookie.'],
    ['Good morning.', 'Hot coffee and fresh cookies. We\'ve got you.'],
    ['Morning sorted.', 'Seven Miles Coffee and warm cookies are waiting.'],
    ['Good morning! ☀️', 'A flat white and a fresh cookie. That\'s the move.'],
    ['Good morning.', 'Seven Miles Coffee — the best in the area. Come find out why.'],
    ['Morning.', 'Cookies are baking. Seven Miles Coffee is always on. Come in.'],
    ['Good morning! ☀️', 'Iced matcha, flat white, or a frappe — whatever starts your day.'],
    ['Morning people know.', 'A great coffee and a fresh cookie changes everything.'],
    ['Rise and shine.', 'Fresh cookies and the best flat white around.'],
    ['Morning fuel.', 'Coffee, matcha, or an iced drink — all ready.'],
    ['Good morning.', 'Cookies just went in the oven. Coffee is always on.'],
    ['Start the day right.', 'A fresh cookie and our coffee. That\'s the move.'],
    ['Good morning! ☀️', 'Flat white or matcha? Either way, it\'s a great morning.'],
  ],
  afternoon: [
    ['Afternoon pick-me-up?', 'Iced coffee, frappe, or a Red Bull Fusion — sorted.'],
    ['Midday cravings are real.', 'Cookies, iced coffee, matcha — we\'ve got it all.'],
    ['Afternoon slump?', 'Frappe or iced coffee. That\'ll sort it.'],
    ['Need a boost?', 'Red Bull Fusion, V Fusion, or an iced coffee. Your call.'],
    ['3pm cravings hitting?', 'A cookie and an iced coffee. Problem solved.'],
    ['Afternoon sorted.', 'Matcha, iced coffee, or a frappe — all waiting.'],
    ['Energy low?', 'Red Bull or V Fusion? We\'ve got both. Plus cookies.'],
    ['Midday break?', 'Best cookies in the area. Seven Miles Coffee to match.'],
    ['Post-lunch cravings?', 'A fresh cookie and an iced coffee. That\'s the one.'],
    ['Afternoon treat?', 'Soft serve or a frappe — your afternoon, your call.'],
    ['Work slump?', 'A cookie and a great coffee. Best fix around.'],
    ['Halfway through the day.', 'Reward yourself — cookies and coffee are ready.'],
    ['Iced matcha hitting different this afternoon.', 'Come grab one with a cookie.'],
    ['Need something cold?', 'Iced drinks, frappes, milkshakes — all ready.'],
    ['Afternoon craving sorted.', 'Seven Miles Coffee, iced or hot. Always consistent.'],
  ],
  evening: [
    ['Cookies hit different in the evening.', 'Come get one.'],
    ['Evening cravings?', 'Fresh cookies and a milkshake. Still going.'],
    ['Still thinking about cookies?', 'So are we. Come through.'],
    ['Evening sorted.', 'Vanilla soft serve and a cookie. That\'s the move.'],
    ['Night mode.', 'Cookies are warm. Milkshakes are cold. Come in.'],
    ['Late craving?', 'Soft serve and cookies. We\'re still here.'],
    ['Evening treat?', 'Fresh cookies and a milkshake. We\'ve got you.'],
    ['End of day cravings.', 'Cookies and a milkshake. Proper wind-down.'],
    ['Evening cookie run?', 'We\'re still baking. Come grab one.'],
    ['Treat yourself tonight.', 'Fresh cookies and the best milkshakes around.'],
    ['Day done?', 'Celebrate with a cookie and a vanilla soft serve.'],
  ],
  night: [
    ['Late night cravings?', 'Cookies and soft serve. We feel that.'],
    ['Night owl?', 'A cookie and a milkshake helps. Trust us.'],
    ['Still up?', 'So are we. Cookies and soft serve are waiting.'],
    ['Late night cookie run?', 'That\'s what we\'re here for.'],
    ['Night craving sorted.', 'Soft serve, cookies, milkshakes — come through.'],
    ['Midnight munchies?', 'We\'ve got you. Fresh cookies still going.'],
  ],
};

const LOYALTY_MESSAGES = {
  reward_ready: [
    ['Your reward is ready.', 'A free cookie or coffee is waiting — come claim it.'],
    ['Free treat unlocked.', 'Cookie, soft serve, or coffee. Your pick.'],
    ['Your next one\'s on us.', 'Come in and claim it. Cookies are fresh.'],
    ['Reward ready to claim.', 'Something good is waiting for you.'],
    ['You\'ve earned it.', 'Your free reward is waiting — come grab it.'],
  ] as Array<[string, string]>,
  high_points: [
    ['Your rewards are building nicely.', 'Coffee run today?'],
    ['Getting close to your next reward.', 'A cookie or coffee could be on us soon.'],
    ['Points stacking up.', 'A free coffee or soft serve is getting closer.'],
    ['Almost at your next reward.', 'One more visit and something\'s on us.'],
    ['Rewards are close.', 'Keep going — a free treat is nearly within reach.'],
  ] as Array<[string, string]>,
  not_ordered_long: [
    ['We\'ve missed you.', 'Fresh cookies and great coffee are waiting.'],
    ['Been a minute.', 'Your coffee misses you. So do the cookies.'],
    ['Your usual spot is waiting.', 'Cookies, coffee, soft serve — all here.'],
    ['It\'s been a while.', 'Come back for a cookie and the best coffee around.'],
    ['Haven\'t seen you in a bit.', 'Fresh cookies and a great coffee are ready whenever you are.'],
    ['Been a while.', 'We kept the coffee warm and the cookies fresh.'],
  ] as Array<[string, string]>,
};

const CATEGORY_ALIASES: Record<string, string> = {
  'cold-drinks':    'cold-drinks',
  'cold drinks':    'cold-drinks',
  'iced coffee':    'cold-drinks',
  'iced drinks':    'cold-drinks',
  'iced-drinks':    'cold-drinks',
  'matcha':         'matcha',
  'milkshakes':     'milkshakes',
  'fusions':        'fusions',
  'tea':            'coffee',
  'drinks':         'coffee',
  'baked':          'cookies',
  'cookie':         'cookies',
  'dessert':        'desserts',
  'cakes':          'desserts',
  'sweets':         'desserts',
  'soft serve':     'soft-serve',
  'soft-serve':     'soft-serve',
  'bundle':         'bundles',
  'box':            'bundles',
};

const FAVOURITE_CATEGORY_MESSAGES: Record<string, Array<[string, string]>> = {
  cookies: [
    ['Your usual cookies are fresh.', 'Warm and ready — just how you like them.'],
    ['Cookie run?', 'Your favourites are fresh out the oven.'],
    ['Fresh cookies, just for you.', 'Your go-to order is ready whenever you are.'],
    ['Cookie lover.', 'Your favourites are baking right now.'],
    ['Cookie time.', 'Fresh batch is in. Come grab your usual.'],
    ['Your cookies are ready.', 'Fresh-baked and waiting — same as always.'],
  ],
  coffee: [
    ['Your usual Seven Miles Coffee is waiting.', 'Same order, same perfect cup.'],
    ['Coffee regular?', 'Your go-to is ready — Seven Miles, always consistent.'],
    ['Coffee run time.', 'Seven Miles Coffee. The best in the area. Come grab it.'],
    ['Your coffee is calling.', 'Seven Miles — same order, same great taste.'],
    ['Coffee time.', 'Best flat white in the area. Your usual is waiting.'],
    ['Regular coffee order?', 'Seven Miles Coffee sorted. Always the same great cup.'],
    ['Coffee person?', 'Seven Miles Coffee. Consistent every single time.'],
  ],
  desserts: [
    ['Sweet tooth, as always.', 'Your favourite desserts are ready.'],
    ['Dessert craving?', 'Your go-to order is waiting for you.'],
    ['Sweet things are ready.', 'Your usual favourites are on the menu.'],
    ['Dessert run?', 'Your favourites are fresh and ready.'],
    ['Something sweet?', 'Soft serve, cookies, desserts — your go-to is ready.'],
  ],
  'soft-serve': [
    ['Soft serve time?', 'Vanilla soft serve is ready and waiting.'],
    ['Your usual soft serve.', 'Smooth, cold, perfect — same as always.'],
    ['Soft serve calling?', 'Come grab one. Fresh and ready.'],
    ['Vanilla soft serve ready.', 'Your go-to is waiting. Come grab it.'],
  ],
  milkshakes: [
    ['Milkshake craving?', 'Your usual is cold and waiting.'],
    ['Milkshake time.', 'Your go-to order is ready whenever you are.'],
    ['Best milkshakes around.', 'Your usual is ready — come grab it.'],
    ['Milkshake run?', 'Cold, thick, and waiting. Come through.'],
  ],
  'cold-drinks': [
    ['Your iced drink is waiting.', 'Cold and ready — same great order.'],
    ['Iced coffee regular?', 'Your usual is cold and waiting.'],
    ['Cold drink craving?', 'Your go-to iced order is ready. Come grab it.'],
    ['Chilled and ready.', 'Your usual cold drink is waiting.'],
    ['Iced coffee time.', 'Your order is cold and ready whenever you are.'],
  ],
  matcha: [
    ['Iced matcha person?', 'Your usual is cold and ready.'],
    ['Matcha craving?', 'Your go-to is made and waiting.'],
    ['Iced matcha is ready.', 'Smooth and cold — your usual order.'],
    ['Matcha time.', 'Your usual is waiting — iced and ready.'],
  ],
  fusions: [
    ['Red Bull or V Fusion?', 'Your usual is cold and waiting.'],
    ['Fusion craving?', 'Red Bull or V Fusion — your go-to is ready.'],
    ['Energy sorted.', 'Your usual fusion drink is cold and waiting.'],
    ['Fusion time.', 'Red Bull or V Fusion — come grab your usual.'],
  ],
  bundles: [
    ['Bundle order?', 'Your favourite combo is ready.'],
    ['Sharing is caring.', 'Your go-to bundle is fresh and ready.'],
    ['Bundle up.', 'Your favourite order is on — same as always.'],
    ['Your bundle is ready.', 'Fresh cookies and everything you love.'],
  ],
};

const WEEKEND_MESSAGES: Array<[string, string]> = [
  ['Weekend mode is on.', 'Cookies are fresh. Seven Miles Coffee is always on.'],
  ['Saturday sorted.', 'Soft serve, iced coffee, cookies — all here.'],
  ['Sunday treat?', 'Vanilla soft serve or a frappe. Come get one.'],
  ['Weekend coffee run?', 'Make it Seven Miles. Best coffee in the area.'],
  ['Weekend cravings sorted.', 'Cookies, milkshakes, soft serve. We\'ve got it all.'],
  ['Slow Sunday?', 'A cookie and a Seven Miles Coffee fixes that.'],
  ['Saturday vibes.', 'Iced coffee, frappes, fresh cookies. Let\'s go.'],
  ['Weekend reward.', 'Treat yourself — fresh cookies and Seven Miles Coffee.'],
  ['Weekend, sorted.', 'Milkshakes, frappes, cookies. Come through.'],
  ['Saturday coffee run?', 'Seven Miles Coffee. Cookies too. Come in.'],
  ['Sunday session.', 'Cookies, soft serve, milkshakes — all ready.'],
  ['Enjoy the weekend.', 'Fresh cookies and a Seven Miles Coffee. You\'ve earned it.'],
  ['Weekend iced matcha?', 'Smooth, cold, perfect. Cookies on the side. Come in.'],
  ['Weekend sorted.', 'Red Bull Fusion, iced coffee, or soft serve — your call.'],
  ['Saturday treat?', 'Vanilla soft serve and a fresh cookie. That\'s the one.'],
];

// ── Main function ─────────────────────────────────────────────────────────────

export function buildGreeting(ctx: GreetingContext): Greeting {
  const {
    firstName, loyaltyPoints, hasClaimableReward, birthday, lastOrderDate,
    liveContext, favouriteCategory, isOpen, opensAt,
  } = ctx;

  const name      = firstName && firstName !== 'there' ? firstName : null;
  const now       = getSydneyNow();
  const hour      = now.getHours();
  const minute    = now.getMinutes();
  const month     = now.getMonth() + 1;
  const day       = now.getDate();
  const dow       = now.getDay();
  const season    = getAuSeason(month);
  const calHol    = getCalendarHoliday(month, day, dow);
  const isWeekend = dow === 0 || dow === 6;
  const daysSince = daysSinceLastOrder(lastOrderDate);

  // Seed: rotates hourly AND changes on every app launch (SESSION_OFFSET).
  // This means the greeting feels fresh each time the app is opened, while
  // staying stable for the duration of a single session.
  const dayOfYear = Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86_400_000);
  const seed      = dayOfYear * 24 + hour + SESSION_OFFSET;

  // Live context
  const weather        = liveContext?.weather        ?? null;
  const publicHoliday  = liveContext?.publicHoliday  ?? null;
  const islamicHoliday = liveContext?.islamicHoliday ?? null;
  const isRamadan      = liveContext?.isRamadan       ?? false;
  const hijriDay       = liveContext?.hijriDay         ?? 0;

  function withName(l1: string, l2: string): Greeting {
    if (!name || l1.includes(name)) return { line1: l1, line2: l2 };
    return { line1: `${name}, ${l1.charAt(0).toLowerCase()}${l1.slice(1)}`, line2: l2 };
  }
  const raw = (pair: [string, string]): Greeting => ({ line1: pair[0], line2: pair[1] });

  // ── Closed-hours gate ──────────────────────────────────────────────────────
  if (isOpen === false) {
    const timePeriod =
      hour < 5  ? 'night'     :
      hour < 12 ? 'morning'   :
      hour < 17 ? 'afternoon' : 'evening';

    const openLine = opensAt ? `We open at ${opensAt}.` : 'Check back when we\'re open.';
    const subLine  =
      timePeriod === 'morning'   ? 'Fresh cookies and great coffee will be ready soon.' :
      timePeriod === 'afternoon' ? 'Come back soon — cookies and coffee are worth it.'  :
      timePeriod === 'evening'   ? 'We\'re closing up — see you next time.'             :
                                   'Late night craving? We\'ll be back soon.';

    if (isBirthday(birthday) && name) {
      return { line1: `Happy birthday, ${name}! 🎉`, line2: 'Your birthday treat is waiting when we open.' };
    }
    return name
      ? { line1: openLine, line2: `${name}, ${subLine.charAt(0).toLowerCase()}${subLine.slice(1)}` }
      : { line1: openLine, line2: subLine };
  }

  // 1. Birthday
  if (isBirthday(birthday) && name) {
    return { line1: `Happy birthday, ${name}! 🎉`, line2: 'Your birthday treat is waiting.' };
  }

  // 2. Reward ready
  if (hasClaimableReward && name) {
    const [, l2] = stablePick(LOYALTY_MESSAGES.reward_ready, seed);
    return { line1: `${name}, your reward is ready.`, line2: l2 };
  }

  // 3. Cookie baking window — always shown when cookies are fresh/warm
  const bakingWindow = getBakingWindow(hour, minute);
  if (bakingWindow) {
    const bank = BAKING_MESSAGES[bakingWindow];
    const [l1, l2] = stablePick(bank, seed);
    return name ? withName(l1, l2) : raw([l1, l2]);
  }

  // 4. Islamic holiday
  if (islamicHoliday) {
    const msgs = ISLAMIC_MESSAGES[islamicHoliday];
    if (msgs) {
      const [l1, l2] = stablePick(msgs, seed);
      return name ? { line1: l1, line2: `${name}, ${l2.charAt(0).toLowerCase()}${l2.slice(1)}` } : { line1: l1, line2: l2 };
    }
    return { line1: `${islamicHoliday} Mubarak! 🌙`, line2: name ? `Wishing you a blessed day, ${name}.` : 'Wishing you a blessed day.' };
  }

  // 5. Australian public holiday
  if (publicHoliday) {
    return {
      line1: `Happy ${publicHoliday}! 🇦🇺`,
      line2: name ? `Enjoy the day off, ${name}.` : 'Enjoy the long weekend.',
    };
  }

  // 6. Fixed calendar holidays
  if (calHol) {
    const msgs = CALENDAR_HOLIDAY_MESSAGES[calHol];
    if (msgs) {
      const [l1, l2] = stablePick(msgs, seed);
      if (['mothers-day', 'fathers-day', 'christmas', 'new-year'].includes(calHol)) return raw([l1, l2]);
      return name ? withName(l1, l2) : raw([l1, l2]);
    }
  }

  // 7. Ramadan period
  if (isRamadan) {
    if (hijriDay === 1) {
      return {
        line1: 'Ramadan Mubarak! 🌙',
        line2: name ? `${name}, may this month be blessed.` : 'May this holy month bring you peace.',
      };
    }
    if ((seed % 100) < 55) {
      return raw(stablePick(RAMADAN_MESSAGES, seed));
    }
  }

  // 8. Inactive customer (>14 days since last order)
  if (daysSince !== null && daysSince > 14) {
    const [, l2] = stablePick(LOYALTY_MESSAGES.not_ordered_long, seed);
    return name ? { line1: `We've missed you, ${name}.`, line2: l2 } : raw(stablePick(LOYALTY_MESSAGES.not_ordered_long, seed));
  }

  // 9. Loyalty cues
  if (loyaltyPoints >= 200 && name) {
    const [l1, l2] = stablePick(LOYALTY_MESSAGES.high_points, seed);
    return { line1: `${name}, ${l1.charAt(0).toLowerCase()}${l1.slice(1)}`, line2: l2 };
  }

  // 10. Favourite category (60% of hours)
  if (favouriteCategory && (seed % 10) < 6) {
    const normCat = CATEGORY_ALIASES[favouriteCategory.toLowerCase()] ?? favouriteCategory.toLowerCase();
    const bank = FAVOURITE_CATEGORY_MESSAGES[normCat] ?? [];
    if (bank.length) {
      const [l1, l2] = stablePick(bank, seed);
      return name ? withName(l1, l2) : raw([l1, l2]);
    }
  }

  // 11. Live weather (65% of hours)
  if (weather && (seed % 20) < 13) {
    const bank = WEATHER_MESSAGES[weather.condition]?.(weather.temp) ?? [];
    if (bank.length) {
      const [l1, l2] = stablePick(bank, seed);
      return name ? withName(l1, l2) : raw([l1, l2]);
    }
  }

  // 12. Season (55% of hours)
  if ((seed % 20) < 11) {
    const msgs = SEASON_MESSAGES[season] ?? [];
    if (msgs.length) {
      const [l1, l2] = stablePick(msgs, seed);
      return name ? withName(l1, l2) : raw([l1, l2]);
    }
  }

  // 13. Weekend (50% of hours, weekends only)
  if (isWeekend && (seed % 2) === 0) {
    const [l1, l2] = stablePick(WEEKEND_MESSAGES, seed);
    return name ? withName(l1, l2) : raw([l1, l2]);
  }

  // 14. Time of day
  const isAfter630 = hour > 6 || (hour === 6 && minute >= 30);
  const timePeriod =
    hour < 5            ? 'night'        :
    hour < 6 || !isAfter630 ? 'earlyMorning' :
    hour < 12           ? 'morning'      :
    hour < 17           ? 'afternoon'    : 'evening';

  if (timePeriod === 'morning' && name && (seed % 100) < 45) {
    const sub = stablePick(TIME_MESSAGES.morning, seed)[1];
    return { line1: `Good morning, ${name}! ☀️`, line2: sub };
  }

  const [l1, l2] = stablePick(TIME_MESSAGES[timePeriod] ?? TIME_MESSAGES.morning, seed);
  return name ? withName(l1, l2) : raw([l1, l2]);
}
