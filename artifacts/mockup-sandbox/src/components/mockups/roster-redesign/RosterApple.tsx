import { useState } from 'react';

const NAVY  = '#1A2B4A';
const BLUE  = '#40C0F2';
const GREEN = '#22C55E';
const PURPLE = '#7C3AED';
const PINK  = '#EC4899';
const AMBER = '#F59E0B';
const CYAN  = '#06B6D4';
const ORANGE = '#F97316';
const MUTED = '#6B7280';
const BG    = '#F2F4F8';
const CARD  = '#FFFFFF';
const BORDER = '#E5E9F0';
const TEXT  = '#0A1628';

const STAFF_COLORS = [BLUE, PURPLE, PINK, AMBER, CYAN, GREEN, ORANGE, '#8B5CF6'];

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const STAFF = [
  { id: '1', name: 'Priya Sharma',    pos: 'Barista',       color: BLUE },
  { id: '2', name: 'Jake Morrison',   pos: 'Floor Staff',   color: PURPLE },
  { id: '3', name: 'Chloe Nguyen',    pos: 'Supervisor',    color: PINK },
  { id: '4', name: 'Liam Tran',       pos: 'Barista',       color: AMBER },
  { id: '5', name: 'Sara O\'Brien',   pos: 'Floor Staff',   color: CYAN },
  { id: '6', name: 'Marcus Lee',      pos: 'Baker',         color: ORANGE },
];

type Shift = { userId: string; start: string; end: string; confirmed: boolean; live?: boolean };

const ROSTER: Record<number, Shift[]> = {
  0: [ // Mon
    { userId: '1', start: '7:00', end: '15:00', confirmed: true },
    { userId: '3', start: '9:00', end: '17:00', confirmed: true },
    { userId: '6', start: '5:00', end: '12:00', confirmed: false },
  ],
  1: [ // Tue — "today"
    { userId: '1', start: '7:00', end: '15:00', confirmed: true, live: true },
    { userId: '2', start: '8:00', end: '16:00', confirmed: true },
    { userId: '4', start: '12:00', end: '20:00', confirmed: false },
    { userId: '5', start: '10:00', end: '18:00', confirmed: true, live: true },
  ],
  2: [ // Wed
    { userId: '2', start: '7:00', end: '15:00', confirmed: true },
    { userId: '3', start: '9:00', end: '17:00', confirmed: false },
    { userId: '6', start: '5:00', end: '12:00', confirmed: true },
  ],
  3: [ // Thu
    { userId: '1', start: '8:00', end: '16:00', confirmed: false },
    { userId: '4', start: '12:00', end: '20:00', confirmed: true },
    { userId: '5', start: '9:00', end: '17:00', confirmed: false },
  ],
  4: [ // Fri
    { userId: '1', start: '7:00', end: '15:00', confirmed: true },
    { userId: '2', start: '8:00', end: '16:00', confirmed: true },
    { userId: '3', start: '9:00', end: '17:00', confirmed: true },
    { userId: '6', start: '5:00', end: '13:00', confirmed: false },
  ],
  5: [ // Sat
    { userId: '3', start: '8:00', end: '14:00', confirmed: false },
    { userId: '5', start: '8:00', end: '14:00', confirmed: false },
  ],
  6: [], // Sun
};

function fmt12(time: string) {
  const [hStr, mStr] = time.split(':');
  const h = parseInt(hStr!, 10);
  const m = parseInt(mStr!, 10);
  const suffix = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${h12}${suffix}` : `${h12}:${mStr}${suffix}`;
}

function shiftHours(start: string, end: string) {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const mins = (eh! * 60 + em!) - (sh! * 60 + sm!);
  return (mins / 60).toFixed(1).replace('.0', '') + 'h';
}

function initials(name: string) {
  return name.split(' ').map(n => n[0]).slice(0, 2).join('');
}

export function RosterApple() {
  const [selectedDay, setSelectedDay] = useState(1); // Tuesday = "today"
  const [weekOffset, setWeekOffset] = useState(0);

  const todayIdx = 1;
  const shifts = ROSTER[selectedDay] ?? [];
  const liveCount = ROSTER[1]?.filter(s => s.live).length ?? 0;

  const weekDates = DAYS.map((_, i) => {
    const base = 14; // Mon 14 July
    return base + i;
  });

  const totalShifts = Object.values(ROSTER).flat().length;
  const totalHours = Object.values(ROSTER).flat().reduce((acc, s) => {
    const [sh, sm] = s.start.split(':').map(Number);
    const [eh, em] = s.end.split(':').map(Number);
    return acc + ((eh! * 60 + em!) - (sh! * 60 + sm!)) / 60;
  }, 0);

  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", system-ui, sans-serif' }}
      className="min-h-screen bg-[#F2F4F8]">

      {/* Header */}
      <div className="px-4 pt-5 pb-3" style={{ backgroundColor: NAVY }}>
        <div className="flex items-center justify-between mb-1">
          <span className="text-[11px] font-semibold tracking-widest uppercase text-white/50">Roster</span>
          <button className="w-7 h-7 rounded-full flex items-center justify-center"
            style={{ backgroundColor: 'rgba(255,255,255,0.12)' }}>
            <span style={{ color: 'white', fontSize: 16 }}>＋</span>
          </button>
        </div>

        {/* Week nav */}
        <div className="flex items-center gap-2 mb-4">
          <button
            onClick={() => setWeekOffset(o => o - 1)}
            className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{ backgroundColor: 'rgba(255,255,255,0.1)' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <div className="flex-1 text-center">
            <div className="text-[15px] font-bold text-white">
              14–20 July 2025
            </div>
            <div className="text-[11px] mt-0.5" style={{ color: weekOffset === 0 ? BLUE : 'rgba(255,255,255,0.45)' }}>
              {weekOffset === 0 ? 'Current week' : weekOffset > 0 ? `${weekOffset}w ahead` : `${Math.abs(weekOffset)}w ago`}
            </div>
          </div>
          <button
            onClick={() => setWeekOffset(o => o + 1)}
            className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{ backgroundColor: 'rgba(255,255,255,0.1)' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </div>

        {/* Day strip */}
        <div className="grid grid-cols-7 gap-1">
          {DAYS.map((day, i) => {
            const isToday = i === todayIdx;
            const isSelected = i === selectedDay;
            const hasShifts = (ROSTER[i]?.length ?? 0) > 0;
            return (
              <button
                key={i}
                onClick={() => setSelectedDay(i)}
                className="flex flex-col items-center py-2 rounded-2xl transition-all"
                style={{
                  backgroundColor: isSelected
                    ? isToday ? BLUE : 'rgba(255,255,255,0.18)'
                    : isToday ? 'rgba(64,192,242,0.15)' : 'transparent',
                }}>
                <span className="text-[10px] font-semibold mb-1"
                  style={{ color: isSelected ? 'white' : isToday ? BLUE : 'rgba(255,255,255,0.5)' }}>
                  {day}
                </span>
                <span className="text-[17px] font-bold leading-none"
                  style={{ color: isSelected || isToday ? 'white' : 'rgba(255,255,255,0.75)' }}>
                  {weekDates[i]}
                </span>
                <div className="mt-1.5 w-1 h-1 rounded-full"
                  style={{ backgroundColor: hasShifts ? (isSelected ? 'white' : isToday ? BLUE : 'rgba(255,255,255,0.4)') : 'transparent' }} />
              </button>
            );
          })}
        </div>
      </div>

      {/* Live banner */}
      {liveCount > 0 && selectedDay === todayIdx && (
        <div className="mx-4 mt-3 flex items-center gap-2 px-3 py-2.5 rounded-xl"
          style={{ backgroundColor: `${GREEN}18`, border: `1px solid ${GREEN}35` }}>
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
              style={{ backgroundColor: GREEN }} />
            <span className="relative inline-flex rounded-full h-2 w-2"
              style={{ backgroundColor: GREEN }} />
          </span>
          <span className="text-[13px] font-semibold" style={{ color: GREEN }}>
            {liveCount} staff clocked in
          </span>
          <span className="ml-auto text-[12px]" style={{ color: MUTED }}>
            Priya · Sara
          </span>
        </div>
      )}

      {/* Day label + shift count */}
      <div className="px-4 pt-4 pb-2 flex items-baseline justify-between">
        <div>
          <span className="text-[20px] font-bold" style={{ color: TEXT }}>
            {DAYS[selectedDay]}, {weekDates[selectedDay]} July
          </span>
          {selectedDay === todayIdx && (
            <span className="ml-2 text-[12px] font-semibold px-2 py-0.5 rounded-full"
              style={{ backgroundColor: `${BLUE}18`, color: BLUE }}>
              Today
            </span>
          )}
        </div>
        <span className="text-[13px]" style={{ color: MUTED }}>
          {shifts.length} {shifts.length === 1 ? 'shift' : 'shifts'}
        </span>
      </div>

      {/* Shift cards */}
      <div className="px-4 flex flex-col gap-2.5 pb-4">
        {shifts.length === 0 ? (
          <div className="py-12 flex flex-col items-center gap-2 rounded-2xl"
            style={{ backgroundColor: CARD, border: `1px solid ${BORDER}` }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={BORDER} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            <span className="text-[15px] font-semibold" style={{ color: TEXT }}>No shifts rostered</span>
            <span className="text-[13px]" style={{ color: MUTED }}>Day off for all staff</span>
          </div>
        ) : (
          shifts.map((shift, i) => {
            const staff = STAFF.find(s => s.id === shift.userId);
            if (!staff) return null;
            return (
              <div key={i} className="flex items-center gap-3 px-4 py-3.5 rounded-2xl"
                style={{ backgroundColor: CARD, border: `1px solid ${BORDER}`, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>

                {/* Avatar */}
                <div className="relative flex-shrink-0">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center"
                    style={{ backgroundColor: staff.color }}>
                    <span className="text-[12px] font-bold text-white">{initials(staff.name)}</span>
                  </div>
                  {shift.live && (
                    <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white"
                      style={{ backgroundColor: GREEN }} />
                  )}
                </div>

                {/* Name + position */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="text-[15px] font-semibold truncate" style={{ color: TEXT }}>
                      {staff.name}
                    </span>
                    {shift.live && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                        style={{ backgroundColor: `${GREEN}18`, color: GREEN }}>
                        LIVE
                      </span>
                    )}
                  </div>
                  <span className="text-[12px]" style={{ color: MUTED }}>{staff.pos}</span>
                </div>

                {/* Time + hours + status */}
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  <span className="text-[14px] font-bold" style={{ color: TEXT }}>
                    {fmt12(shift.start)} – {fmt12(shift.end)}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px]" style={{ color: MUTED }}>
                      {shiftHours(shift.start, shift.end)}
                    </span>
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                      style={{
                        backgroundColor: shift.confirmed ? `${GREEN}18` : `${BLUE}18`,
                        color: shift.confirmed ? GREEN : BLUE,
                      }}>
                      {shift.confirmed ? 'Confirmed' : 'Rostered'}
                    </span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Week summary */}
      <div className="mx-4 mb-6 rounded-2xl overflow-hidden"
        style={{ backgroundColor: CARD, border: `1px solid ${BORDER}`, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
        <div className="flex items-center justify-between px-4 py-3.5"
          style={{ borderBottom: `1px solid ${BORDER}` }}>
          <span className="text-[13px] font-bold" style={{ color: TEXT }}>Week Summary</span>
          <span className="text-[12px]" style={{ color: MUTED }}>14–20 July</span>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 divide-x" style={{ borderBottom: `1px solid ${BORDER}` }}>
          {[
            { label: 'Shifts', value: String(totalShifts) },
            { label: 'Hours', value: `${totalHours.toFixed(0)}h` },
            { label: 'Staff', value: String(STAFF.length) },
          ].map(({ label, value }) => (
            <div key={label} className="flex flex-col items-center py-3 gap-0.5">
              <span className="text-[18px] font-bold" style={{ color: TEXT }}>{value}</span>
              <span className="text-[11px]" style={{ color: MUTED }}>{label}</span>
            </div>
          ))}
        </div>

        {/* Per-staff rows */}
        {STAFF.map((staff, i) => {
          const staffShifts = Object.values(ROSTER).flat().filter(s => s.userId === staff.id);
          if (staffShifts.length === 0) return null;
          const hours = staffShifts.reduce((acc, s) => {
            const [sh, sm] = s.start.split(':').map(Number);
            const [eh, em] = s.end.split(':').map(Number);
            return acc + ((eh! * 60 + em!) - (sh! * 60 + sm!)) / 60;
          }, 0);
          return (
            <div key={staff.id}
              className="flex items-center gap-3 px-4 py-2.5"
              style={{ borderTop: i === 0 ? 'none' : `1px solid ${BORDER}` }}>
              <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: staff.color }}>
                <span className="text-[8px] font-bold text-white">{initials(staff.name)}</span>
              </div>
              <span className="flex-1 text-[13px] font-medium truncate" style={{ color: TEXT }}>
                {staff.name}
              </span>
              <span className="text-[12px]" style={{ color: MUTED }}>
                {staffShifts.length} shift{staffShifts.length !== 1 ? 's' : ''}
              </span>
              <span className="text-[13px] font-bold w-10 text-right" style={{ color: NAVY }}>
                {hours.toFixed(0)}h
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
