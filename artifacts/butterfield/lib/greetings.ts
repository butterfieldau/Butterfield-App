/**
 * Smart dynamic greeting system for Butterfield customers.
 * Priority: birthday > reward ready > holiday > season+weather > loyalty > time-of-day > default
 */

export interface GreetingContext {
  firstName: string;
  loyaltyPoints: number;
  hasClaimableReward: boolean;
  birthday?: string | null;
  lastOrderDate?: string | null;
  loyaltyTier?: string;
  stampCount?: number;
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

function getHoliday(month: number, day: number, dayOfWeek: number): string | null {
  if (month === 1 && day === 1)  return 'new-year';
  if (month === 1 && day === 26) return 'australia-day';
  if (month === 2 && day === 14) return 'valentines';
  if (month === 4 && day === 25) return 'anzac-day';
  if (month === 10 && day === 31) return 'halloween';
  if (month === 12 && day === 25) return 'christmas';
  if (month === 12 && day === 26) return 'boxing-day';
  if (month === 12 && (day === 31 || day === 30)) return 'nye';
  // Mother's Day: 2nd Sunday of May (approx day 8–14)
  if (month === 5 && dayOfWeek === 0 && day >= 8 && day <= 14) return 'mothers-day';
  // Father's Day: 1st Sunday of September (approx day 1–7)
  if (month === 9 && dayOfWeek === 0 && day >= 1 && day <= 7) return 'fathers-day';
  // Easter approximate (Good Friday / Easter weekend) - late March to April 20
  if ((month === 3 && day >= 20) || (month === 4 && day <= 20)) {
    if (dayOfWeek === 5 || dayOfWeek === 6 || dayOfWeek === 0 || dayOfWeek === 1) return 'easter';
  }
  return null;
}

function isBirthday(birthday: string | null | undefined): boolean {
  if (!birthday) return false;
  const now = getSydneyNow();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const today = `${mm}-${dd}`;
  const bdStr = birthday.length > 5 ? birthday.slice(5) : birthday;
  return bdStr === today;
}

function daysSinceLastOrder(lastOrderDate: string | null | undefined): number | null {
  if (!lastOrderDate) return null;
  const diff = Date.now() - new Date(lastOrderDate).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ── Message banks ─────────────────────────────────────────────────────────────

const HOLIDAY_MESSAGES: Record<string, Array<[string, string]>> = {
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
  morning: [
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
  evening: [
    ['Warm cookies hit different at night.', 'Come get one.'],
    ['Night cravings?', 'We\'re still baking.'],
    ['Still thinking about cookies?', 'So are we.'],
    ['A coffee and a slow night.', 'Sounds about right.'],
  ],
  night: [
    ['Late night cravings?', 'We feel that.'],
    ['Night owl?', 'A cookie and a warm drink helps.'],
    ['Still up?', 'So are we. Come through.'],
  ],
};

const LOYALTY_MESSAGES: Record<string, Array<[string, string]>> = {
  reward_ready: [
    ['Your reward is ready.', 'Come claim it.'],
    ['Free treat unlocked.', 'You know what to do.'],
    ['Your next one\'s on us.', 'Come in and claim it.'],
  ],
  high_points: [
    ['Your rewards are building nicely.', 'Coffee run?'],
    ['You\'re getting closer to your next reward.', 'Keep going.'],
  ],
  low_points: [
    ['Every visit earns you points.', 'Come build them up.'],
  ],
  not_ordered_long: [
    ['We\'ve missed you.', 'Come grab something warm.'],
    ['Been a minute.', 'Your coffee misses you.'],
    ['Your usual spot is waiting.', 'Come back soon.'],
  ],
  coffee_lover: [
    ['Coffee again today?', 'We like your style.'],
    ['Your usual coffee run starts here.', 'Let\'s go.'],
  ],
  cookie_lover: [
    ['Still thinking about that cookie?', 'We don\'t blame you.'],
    ['Warm cookies are back on your mind.', 'Come sort it.'],
  ],
};

const WEEKEND_MESSAGES: Array<[string, string]> = [
  ['Weekend mode is on.', 'Cookies are baking.'],
  ['Saturday cravings?', 'You know where to find us.'],
  ['Sunday treats taste better.', 'Come warm up with us.'],
  ['Weekend coffee run?', 'Make it Butterfield.'],
];

const DEFAULT_MESSAGES: Array<[string, string]> = [
  ['Good to see you.', 'Ready for coffee today?'],
  ['Welcome back.', 'What\'ll it be today?'],
  ['Cookies are warm.', 'Coffee is on.'],
  ['Good things are waiting.', 'Come see for yourself.'],
  ['Butterfield is ready.', 'Are you?'],
];

// ── Main function ─────────────────────────────────────────────────────────────

export function buildGreeting(ctx: GreetingContext): Greeting {
  const {
    firstName,
    loyaltyPoints,
    hasClaimableReward,
    birthday,
    lastOrderDate,
    loyaltyTier,
  } = ctx;

  const name = firstName && firstName !== 'there' ? firstName : null;
  const now = getSydneyNow();
  const hour = now.getHours();
  const month = now.getMonth() + 1;
  const day = now.getDate();
  const dow = now.getDay(); // 0=Sun
  const season = getAuSeason(month);
  const holiday = getHoliday(month, day, dow);
  const isWeekend = dow === 0 || dow === 6;
  const daysSince = daysSinceLastOrder(lastOrderDate);

  function withName(line1: string, line2: string): Greeting {
    if (!name) return { line1, line2 };
    // Only prefix the name if line1 doesn't already reference them
    if (line1.includes(name)) return { line1, line2 };
    return { line1: `${name}, ${line1.charAt(0).toLowerCase()}${line1.slice(1)}`, line2 };
  }

  function raw(pair: [string, string]): Greeting {
    return { line1: pair[0], line2: pair[1] };
  }

  // 1. Birthday
  if (isBirthday(birthday) && name) {
    return { line1: `Happy birthday, ${name}! 🎉`, line2: 'Your birthday treat is waiting.' };
  }

  // 2. Reward ready
  if (hasClaimableReward && name) {
    const [l1, l2] = pick(LOYALTY_MESSAGES.reward_ready);
    return { line1: `${name}, your reward is ready.`, line2: l2 };
  }

  // 3. Holiday
  if (holiday) {
    const msgs = HOLIDAY_MESSAGES[holiday];
    if (msgs) {
      const [l1, l2] = pick(msgs);
      if (holiday === 'mothers-day' || holiday === 'fathers-day' || holiday === 'christmas' || holiday === 'new-year') {
        return { line1: l1, line2: l2 };
      }
      return name ? withName(l1, l2) : raw([l1, l2]);
    }
  }

  // 4. Inactive customer (hasn't ordered in >14 days)
  if (daysSince !== null && daysSince > 14) {
    const [l1, l2] = pick(LOYALTY_MESSAGES.not_ordered_long);
    return name ? { line1: `We've missed you, ${name}.`, line2: l2 } : raw([l1, l2]);
  }

  // 5. Loyalty / reward cues
  if (loyaltyPoints >= 200 && name) {
    const [l1, l2] = pick(LOYALTY_MESSAGES.high_points);
    return { line1: `${name}, ${l1.charAt(0).toLowerCase()}${l1.slice(1)}`, line2: l2 };
  }

  // 6. Season (with time flavour)
  if (Math.random() < 0.55) {
    const seasonMsgs = SEASON_MESSAGES[season] ?? [];
    const [l1, l2] = pick(seasonMsgs);
    return name ? withName(l1, l2) : raw([l1, l2]);
  }

  // 7. Weekend
  if (isWeekend && Math.random() < 0.5) {
    const [l1, l2] = pick(WEEKEND_MESSAGES);
    return name ? withName(l1, l2) : raw([l1, l2]);
  }

  // 8. Time of day
  const timePeriod =
    hour < 5  ? 'night'     :
    hour < 12 ? 'morning'   :
    hour < 17 ? 'afternoon' : 'evening';

  const timeMsgs = TIME_MESSAGES[timePeriod] ?? TIME_MESSAGES.morning;
  const timeGreeting = timePeriod === 'morning' ? `Good morning${name ? `, ${name}` : ''} ☀️` : null;

  if (timePeriod === 'morning' && Math.random() < 0.4 && name) {
    return { line1: `Good morning, ${name} ☀️`, line2: pick(timeMsgs)[1] };
  }

  const [l1, l2] = pick(timeMsgs);
  return name ? withName(l1, l2) : raw([l1, l2]);
}
