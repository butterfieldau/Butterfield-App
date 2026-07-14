import { useState } from 'react';

const NAVY  = '#1A2B4A';
const BLUE  = '#007AFF';
const SKY   = '#40C0F2';
const GREEN = '#34C759';
const PURPLE = '#8B5CF6';
const PINK  = '#EC4899';
const AMBER = '#F59E0B';
const CYAN  = '#06B6D4';
const ORANGE = '#F97316';
const MUTED = '#8E8E93';
const BG    = '#F2F2F7';
const CARD  = '#FFFFFF';
const BORDER = '#E5E7EB';
const TEXT  = '#1C1C1E';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const STAFF = [
  { id: '1', name: 'Sarah M.',   pos: 'Barista',     color: BLUE },
  { id: '2', name: 'James C.',   pos: 'Supervisor',  color: PURPLE },
  { id: '3', name: 'Emily R.',   pos: 'Barista',     color: PINK },
  { id: '4', name: 'Tom W.',     pos: 'Kitchen',     color: AMBER },
  { id: '5', name: 'Priya S.',   pos: 'Cashier',     color: CYAN },
  { id: '6', name: 'Marcus L.',  pos: 'Baker',       color: ORANGE },
];

type Shift = { userId: string; start: string; end: string; confirmed: boolean; live?: boolean };

const ROSTER: Record<number, Shift[]> = {
  0: [
    { userId: '1', start: '7:00', end: '15:00', confirmed: true },
    { userId: '3', start: '9:00', end: '17:00', confirmed: true },
    { userId: '6', start: '5:00', end: '12:00', confirmed: false },
  ],
  1: [
    { userId: '1', start: '7:00',  end: '15:00', confirmed: true,  live: true },
    { userId: '2', start: '8:00',  end: '16:00', confirmed: true },
    { userId: '4', start: '12:00', end: '20:00', confirmed: false },
    { userId: '5', start: '10:00', end: '18:00', confirmed: true,  live: true },
  ],
  2: [
    { userId: '2', start: '7:00',  end: '15:00', confirmed: true },
    { userId: '3', start: '9:00',  end: '17:00', confirmed: false },
    { userId: '6', start: '5:00',  end: '12:00', confirmed: true },
  ],
  3: [
    { userId: '1', start: '8:00',  end: '16:00', confirmed: false },
    { userId: '4', start: '12:00', end: '20:00', confirmed: true },
    { userId: '5', start: '9:00',  end: '17:00', confirmed: false },
  ],
  4: [
    { userId: '1', start: '7:00',  end: '15:00', confirmed: true },
    { userId: '2', start: '8:00',  end: '16:00', confirmed: true },
    { userId: '3', start: '9:00',  end: '17:00', confirmed: true },
    { userId: '6', start: '5:00',  end: '13:00', confirmed: false },
  ],
  5: [
    { userId: '3', start: '8:00', end: '14:00', confirmed: false },
    { userId: '5', start: '8:00', end: '14:00', confirmed: false },
  ],
  6: [],
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
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function initials(name: string) {
  return name.split(' ').map(n => n[0]).join('');
}

const ChevronLeft = ({ color = TEXT }: { color?: string }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="15 18 9 12 15 6" />
  </svg>
);
const ChevronRight = ({ color = TEXT }: { color?: string }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

export function RosterApple() {
  const [selectedDay, setSelectedDay] = useState(1); // Tue = today
  const [weekOffset, setWeekOffset] = useState(0);

  const todayIdx = 1;
  const shifts = ROSTER[selectedDay] ?? [];
  const liveShifts = ROSTER[todayIdx]?.filter(s => s.live) ?? [];

  const weekDates = DAYS.map((_, i) => 14 + i);

  const totalShifts = Object.values(ROSTER).flat().length;
  const totalHours = Object.values(ROSTER).flat().reduce((acc, s) => {
    const [sh, sm] = s.start.split(':').map(Number);
    const [eh, em] = s.end.split(':').map(Number);
    return acc + ((eh! * 60 + em!) - (sh! * 60 + sm!)) / 60;
  }, 0);

  const weekLabel = weekOffset === 0
    ? '14 – 20 Jul 2026'
    : weekOffset > 0 ? `21 – 27 Jul 2026` : `7 – 13 Jul 2026`;
  const weekSub = weekOffset === 0 ? 'Current week' : weekOffset > 0 ? `${weekOffset}w ahead` : `${Math.abs(weekOffset)}w ago`;

  return (
    <div style={{ fontFamily: '-apple-system,BlinkMacSystemFont,"SF Pro Text",system-ui,sans-serif', background: BG, minHeight: '100vh', width: 390, margin: '0 auto', display: 'flex', flexDirection: 'column' }}>

      {/* ── Timesheets header (unchanged from existing design) */}
      <div style={{ background: NAVY, paddingTop: 56, paddingBottom: 16, paddingLeft: 16, paddingRight: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 16, background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24"><path stroke="#fff" strokeWidth="2.5" strokeLinecap="round" d="M15 18l-6-6 6-6"/></svg>
            </div>
            <span style={{ fontSize: 20, fontWeight: 700, color: '#fff', letterSpacing: -0.3 }}>Timesheets</span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 8, padding: '6px 12px', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Export</button>
            <button style={{ background: SKY, border: 'none', borderRadius: 8, padding: '6px 12px', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>+ Shift</button>
          </div>
        </div>
      </div>

      {/* ── Tab bar (Roster active) */}
      <div style={{ background: CARD, borderBottom: `1px solid ${BORDER}`, padding: '10px 16px', display: 'flex', gap: 8 }}>
        {[
          { label: 'Roster', icon: <svg width="15" height="15" fill="none" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" stroke="#fff" strokeWidth="2"/><path stroke="#fff" strokeWidth="2" strokeLinecap="round" d="M16 2v4M8 2v4M3 10h18"/></svg> },
          { label: 'Timesheets', icon: <svg width="15" height="15" fill="none" viewBox="0 0 24 24"><path stroke={MUTED} strokeWidth="2" strokeLinecap="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/></svg> },
          { label: 'Pay Run', icon: <svg width="15" height="15" fill="none" viewBox="0 0 24 24"><path stroke={MUTED} strokeWidth="2" strokeLinecap="round" d="M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg> },
        ].map(({ label, icon }, i) => {
          const active = i === 0;
          return (
            <button key={label} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '8px 0', borderRadius: 12, border: `1px solid ${active ? TEXT : BORDER}`, background: active ? TEXT : CARD, cursor: 'pointer' }}>
              {icon}
              <span style={{ fontSize: 11, fontWeight: 600, color: active ? '#fff' : MUTED }}>{label}</span>
            </button>
          );
        })}
      </div>

      {/* ── Week navigator */}
      <div style={{ background: CARD, borderBottom: `1px solid ${BORDER}`, padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button onClick={() => setWeekOffset(o => o - 1)} style={{ width: 32, height: 32, borderRadius: 8, border: `1px solid ${BORDER}`, background: BG, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <ChevronLeft />
        </button>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: TEXT }}>{weekLabel}</div>
          <div style={{ fontSize: 11, color: weekOffset === 0 ? BLUE : MUTED, marginTop: 1 }}>{weekSub}</div>
        </div>
        <button onClick={() => setWeekOffset(o => o + 1)} style={{ width: 32, height: 32, borderRadius: 8, border: `1px solid ${BORDER}`, background: BG, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <ChevronRight />
        </button>
      </div>

      {/* ── Day strip (NEW — replaces old legend + grid header) */}
      <div style={{ background: CARD, borderBottom: `1px solid ${BORDER}`, padding: '10px 12px', display: 'flex', gap: 4 }}>
        {DAYS.map((day, i) => {
          const isToday = i === todayIdx;
          const isSelected = i === selectedDay;
          const hasShifts = (ROSTER[i]?.length ?? 0) > 0;
          return (
            <button
              key={i}
              onClick={() => setSelectedDay(i)}
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                padding: '6px 0 7px',
                borderRadius: 10,
                border: 'none',
                cursor: 'pointer',
                background: isSelected
                  ? TEXT
                  : isToday ? `${BLUE}12` : 'transparent',
                transition: 'background 0.15s',
              }}>
              <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: 0.2, color: isSelected ? 'rgba(255,255,255,0.7)' : isToday ? BLUE : MUTED, marginBottom: 2 }}>
                {day}
              </span>
              <span style={{ fontSize: 16, fontWeight: 700, lineHeight: 1, color: isSelected ? '#fff' : isToday ? BLUE : TEXT }}>
                {weekDates[i]}
              </span>
              <div style={{ marginTop: 4, width: 4, height: 4, borderRadius: 2, background: hasShifts ? (isSelected ? 'rgba(255,255,255,0.6)' : isToday ? BLUE : `${TEXT}30`) : 'transparent' }} />
            </button>
          );
        })}
      </div>

      {/* ── Live banner (today only) */}
      {liveShifts.length > 0 && selectedDay === todayIdx && (
        <div style={{ margin: '10px 16px 0', background: `${GREEN}18`, borderRadius: 10, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8, border: `1px solid ${GREEN}35` }}>
          <span style={{ position: 'relative', display: 'inline-flex', width: 8, height: 8, flexShrink: 0 }}>
            <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: GREEN, opacity: 0.4, animation: 'ping 1.5s cubic-bezier(0,0,0.2,1) infinite' }} />
            <span style={{ position: 'relative', display: 'inline-flex', width: 8, height: 8, borderRadius: '50%', background: GREEN }} />
          </span>
          <span style={{ fontSize: 12, color: GREEN, fontWeight: 600 }}>
            {liveShifts.length} staff clocked in
          </span>
          <span style={{ fontSize: 12, color: MUTED, marginLeft: 'auto' }}>
            {liveShifts.map(s => STAFF.find(st => st.id === s.userId)?.name.split(' ')[0]).join(' · ')}
          </span>
        </div>
      )}

      {/* ── Day label */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: '12px 16px 6px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 17, fontWeight: 700, color: TEXT }}>
            {DAYS[selectedDay]}, {weekDates[selectedDay]} Jul
          </span>
          {selectedDay === todayIdx && (
            <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 99, background: `${BLUE}18`, color: BLUE }}>
              Today
            </span>
          )}
        </div>
        <span style={{ fontSize: 12, color: MUTED }}>{shifts.length} {shifts.length === 1 ? 'shift' : 'shifts'}</span>
      </div>

      {/* ── Shift cards */}
      <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
        {shifts.length === 0 ? (
          <div style={{ padding: '32px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, background: CARD, borderRadius: 16, border: `1px solid ${BORDER}` }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={BORDER} strokeWidth="1.5" strokeLinecap="round">
              <rect x="3" y="4" width="18" height="18" rx="2"/>
              <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
            <span style={{ fontSize: 14, fontWeight: 600, color: TEXT }}>No shifts rostered</span>
            <span style={{ fontSize: 13, color: MUTED }}>Everyone's off this day</span>
          </div>
        ) : (
          shifts.map((shift, i) => {
            const staff = STAFF.find(s => s.id === shift.userId);
            if (!staff) return null;
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: CARD, borderRadius: 16, border: `1px solid ${BORDER}`, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                {/* Avatar */}
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  <div style={{ width: 42, height: 42, borderRadius: 21, background: staff.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{initials(staff.name)}</span>
                  </div>
                  {shift.live && (
                    <div style={{ position: 'absolute', bottom: 0, right: 0, width: 12, height: 12, borderRadius: 6, background: GREEN, border: '2px solid white' }} />
                  )}
                </div>

                {/* Name + position */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                    <span style={{ fontSize: 15, fontWeight: 600, color: TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{staff.name}</span>
                    {shift.live && (
                      <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 5px', borderRadius: 99, background: `${GREEN}18`, color: GREEN, flexShrink: 0 }}>LIVE</span>
                    )}
                  </div>
                  <span style={{ fontSize: 12, color: MUTED }}>{staff.pos}</span>
                </div>

                {/* Time + status */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: TEXT }}>
                    {fmt12(shift.start)}–{fmt12(shift.end)}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 11, color: MUTED }}>{shiftHours(shift.start, shift.end)}</span>
                    <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 99, background: shift.confirmed ? `${GREEN}18` : `${BLUE}18`, color: shift.confirmed ? GREEN : BLUE }}>
                      {shift.confirmed ? 'Confirmed' : 'Rostered'}
                    </span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ── Week Summary */}
      <div style={{ margin: '16px 16px 24px', background: CARD, borderRadius: 16, border: `1px solid ${BORDER}`, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
        <div style={{ padding: '11px 14px', borderBottom: `1px solid ${BORDER}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: TEXT }}>Week Summary</span>
          <span style={{ fontSize: 11, color: MUTED }}>{weekLabel}</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', borderBottom: `1px solid ${BORDER}` }}>
          {[
            { label: 'Shifts', value: String(totalShifts) },
            { label: 'Hours',  value: `${Math.round(totalHours)}h` },
            { label: 'Staff',  value: String(STAFF.length) },
          ].map(({ label, value }, i) => (
            <div key={label} style={{ padding: '10px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', borderRight: i < 2 ? `1px solid ${BORDER}` : 'none' }}>
              <span style={{ fontSize: 18, fontWeight: 700, color: TEXT }}>{value}</span>
              <span style={{ fontSize: 11, color: MUTED, marginTop: 1 }}>{label}</span>
            </div>
          ))}
        </div>
        {STAFF.map((staff, i) => {
          const staffShifts = Object.values(ROSTER).flat().filter(s => s.userId === staff.id);
          if (staffShifts.length === 0) return null;
          const hours = staffShifts.reduce((acc, s) => {
            const [sh, sm] = s.start.split(':').map(Number);
            const [eh, em] = s.end.split(':').map(Number);
            return acc + ((eh! * 60 + em!) - (sh! * 60 + sm!)) / 60;
          }, 0);
          return (
            <div key={staff.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', borderTop: i === 0 ? 'none' : `1px solid ${BORDER}` }}>
              <div style={{ width: 24, height: 24, borderRadius: 12, background: staff.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <span style={{ fontSize: 8, fontWeight: 700, color: '#fff' }}>{initials(staff.name)}</span>
              </div>
              <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{staff.name}</span>
              <span style={{ fontSize: 12, color: MUTED }}>{staffShifts.length} shift{staffShifts.length !== 1 ? 's' : ''}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: NAVY, width: 32, textAlign: 'right' }}>{Math.round(hours)}h</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
