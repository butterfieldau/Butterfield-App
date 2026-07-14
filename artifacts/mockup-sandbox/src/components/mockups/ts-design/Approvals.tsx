export default function Approvals() {
  const BG = '#F2F2F7', CARD = '#fff', BLUE = '#007AFF', TEXT = '#1C1C1E',
    MUTED = '#8E8E93', BORDER = '#E5E7EB', GREEN = '#34C759', AMBER = '#F59E0B',
    RED = '#FF3B30', PURPLE = '#8B5CF6', NAVY = '#1A2B4A';

  const staffGroups = [
    {
      name: 'Sarah Mitchell', role: 'Barista', initials: 'SM', color: BLUE,
      totalHrs: '22h 30m', totalPay: '$562.50', pending: 1, approved: 3,
      shifts: [
        { date: 'Mon 14 Jul', in: '7:02 am', out: '3:05 pm', break: 30, hrs: '7h 33m', status: 'approved', flag: false },
        { date: 'Tue 15 Jul', in: '7:00 am', out: '3:01 pm', break: 30, hrs: '7h 31m', status: 'approved', flag: false },
        { date: 'Thu 17 Jul', in: '7:41 am', out: '3:12 pm', break: 30, hrs: '7h 01m', status: 'pending', flag: true, note: 'Late start — 41 mins' },
        { date: 'Fri 18 Jul', in: 'Clocked in', out: '—', break: 0, hrs: '4h 22m', status: 'live', flag: false },
      ],
    },
    {
      name: 'James Chen', role: 'Supervisor', initials: 'JC', color: PURPLE,
      totalHrs: '36h 00m', totalPay: '$1,080.00', pending: 0, approved: 4,
      shifts: [
        { date: 'Mon 14 Jul', in: '9:00 am', out: '5:00 pm', break: 30, hrs: '7h 30m', status: 'approved', flag: false },
        { date: 'Wed 16 Jul', in: '9:03 am', out: '5:02 pm', break: 30, hrs: '7h 29m', status: 'approved', flag: false },
        { date: 'Thu 17 Jul', in: '9:01 am', out: '5:01 pm', break: 30, hrs: '7h 30m', status: 'approved', flag: false },
        { date: 'Fri 18 Jul', in: 'Clocked in', out: '—', break: 0, hrs: '6h 11m', status: 'live', flag: false },
      ],
    },
  ];

  const statusConfig: Record<string, { bg: string, text: string, label: string }> = {
    approved: { bg: '#E8F9EE', text: GREEN,  label: 'Approved' },
    pending:  { bg: '#FEF3C7', text: AMBER,  label: 'Pending'  },
    flagged:  { bg: '#FEE2E2', text: RED,    label: 'Flagged'  },
    live:     { bg: '#EFF6FF', text: BLUE,   label: 'Live'     },
  };

  return (
    <div style={{ fontFamily: '-apple-system,BlinkMacSystemFont,sans-serif', background: BG, minHeight: '100vh', width: 390, margin: '0 auto', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
      {/* Header */}
      <div style={{ background: NAVY, paddingTop: 56, paddingBottom: 16, paddingLeft: 16, paddingRight: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 16, background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24"><path stroke="#fff" strokeWidth="2.5" strokeLinecap="round" d="M15 18l-6-6 6-6"/></svg>
            </div>
            <span style={{ fontSize: 20, fontWeight: 700, color: '#fff', letterSpacing: -0.3 }}>Timesheets</span>
          </div>
          <button style={{ background: BLUE, border: 'none', borderRadius: 8, padding: '6px 12px', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Approve All</button>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ background: CARD, borderBottom: `1px solid ${BORDER}`, padding: '10px 16px', display: 'flex', gap: 8 }}>
        {['Roster', 'Timesheets', 'Pay Run'].map((tab, i) => {
          const active = i === 1;
          const icons = [
            <svg key="r" width="15" height="15" fill="none" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" stroke={active ? '#fff' : MUTED} strokeWidth="2"/><path stroke={active ? '#fff' : MUTED} strokeWidth="2" strokeLinecap="round" d="M16 2v4M8 2v4M3 10h18"/></svg>,
            <svg key="t" width="15" height="15" fill="none" viewBox="0 0 24 24"><path stroke={active ? '#fff' : MUTED} strokeWidth="2" strokeLinecap="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/></svg>,
            <svg key="p" width="15" height="15" fill="none" viewBox="0 0 24 24"><path stroke={active ? '#fff' : MUTED} strokeWidth="2" strokeLinecap="round" d="M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>,
          ];
          return (
            <button key={tab} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '8px 0', borderRadius: 12, border: `1px solid ${active ? TEXT : BORDER}`, background: active ? TEXT : CARD, cursor: 'pointer' }}>
              {icons[i]}
              <span style={{ fontSize: 11, fontWeight: 600, color: active ? '#fff' : MUTED }}>{tab}</span>
            </button>
          );
        })}
      </div>

      {/* Date range chips */}
      <div style={{ display: 'flex', gap: 8, padding: '10px 16px', background: CARD, borderBottom: `1px solid ${BORDER}` }}>
        {['This Week', 'Last Week', 'Fortnight', 'Custom'].map((p, i) => (
          <button key={p} style={{ padding: '5px 12px', borderRadius: 16, border: `1px solid ${i === 0 ? TEXT : BORDER}`, background: i === 0 ? TEXT : CARD, color: i === 0 ? '#fff' : MUTED, fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            {p}
          </button>
        ))}
      </div>

      {/* Summary strip */}
      <div style={{ display: 'flex', margin: '12px 16px', background: CARD, borderRadius: 14, border: `1px solid ${BORDER}`, overflow: 'hidden' }}>
        {[
          { label: 'TOTAL HOURS', val: '58h 30m', color: TEXT },
          { label: 'PENDING', val: '1 shift', color: AMBER },
          { label: 'EST. WAGES', val: '$1,643', color: GREEN },
        ].map((s, i) => (
          <div key={i} style={{ flex: 1, padding: '12px 8px', textAlign: 'center', borderRight: i < 2 ? `1px solid ${BORDER}` : 'none' }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: MUTED, letterSpacing: 0.8, marginBottom: 4, textTransform: 'uppercase' }}>{s.label}</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: s.color }}>{s.val}</div>
          </div>
        ))}
      </div>

      {/* Staff sections */}
      <div style={{ padding: '0 16px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {staffGroups.map((sg, gi) => (
          <div key={gi} style={{ background: CARD, borderRadius: 14, border: `1px solid ${BORDER}`, overflow: 'hidden' }}>
            {/* Staff header */}
            <div style={{ padding: '12px 14px', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 18, background: sg.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#fff', flexShrink: 0 }}>{sg.initials}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: TEXT }}>{sg.name}</div>
                <div style={{ fontSize: 11, color: MUTED }}>{sg.role} · {sg.approved} approved{sg.pending > 0 ? ` · ${sg.pending} pending` : ''}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: GREEN }}>{sg.totalPay}</div>
                <div style={{ fontSize: 11, color: MUTED }}>{sg.totalHrs}</div>
              </div>
            </div>

            {/* Shift rows */}
            {sg.shifts.map((sh, si) => {
              const cfg = statusConfig[sh.status] || statusConfig.pending;
              return (
                <div key={si} style={{ padding: '10px 14px', borderBottom: si < sg.shifts.length - 1 ? `1px solid ${BORDER}` : 'none', background: sh.flag ? `${AMBER}08` : 'transparent' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: TEXT }}>{sh.date}</span>
                        {sh.flag && (
                          <span style={{ fontSize: 9, fontWeight: 700, background: `${AMBER}20`, color: AMBER, borderRadius: 4, padding: '2px 5px', border: `1px solid ${AMBER}40` }}>⚑ FLAG</span>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <svg width="11" height="11" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" stroke={GREEN} strokeWidth="2"/><path stroke={GREEN} strokeWidth="2" strokeLinecap="round" d="M12 7v5l3 3"/></svg>
                          <span style={{ fontSize: 11, color: MUTED }}>{sh.in}</span>
                        </div>
                        <svg width="10" height="10" fill="none" viewBox="0 0 24 24"><path stroke={MUTED} strokeWidth="2" strokeLinecap="round" d="M5 12h14"/></svg>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <svg width="11" height="11" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" stroke={sh.status === 'live' ? BLUE : RED} strokeWidth="2"/><path stroke={sh.status === 'live' ? BLUE : RED} strokeWidth="2" strokeLinecap="round" d="M12 7v5l3 3"/></svg>
                          <span style={{ fontSize: 11, color: MUTED }}>{sh.out}</span>
                        </div>
                        {sh.break > 0 && <span style={{ fontSize: 11, color: MUTED }}>· {sh.break}m break</span>}
                      </div>
                      {sh.note && <div style={{ fontSize: 11, color: AMBER, marginTop: 3, fontStyle: 'italic' }}>{sh.note}</div>}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: TEXT }}>{sh.hrs}</span>
                      <span style={{ fontSize: 10, fontWeight: 700, background: cfg.bg, color: cfg.text, borderRadius: 6, padding: '2px 7px', border: `1px solid ${cfg.text}30` }}>{cfg.label}</span>
                    </div>
                  </div>
                  {sh.status === 'pending' && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                      <button style={{ flex: 1, padding: '6px 0', borderRadius: 8, border: `1px solid ${GREEN}`, background: `${GREEN}10`, color: GREEN, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>✓ Approve</button>
                      <button style={{ padding: '6px 12px', borderRadius: 8, border: `1px solid ${BORDER}`, background: BG, color: MUTED, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Edit</button>
                      <button style={{ padding: '6px 12px', borderRadius: 8, border: `1px solid ${RED}`, background: `${RED}10`, color: RED, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Flag</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}

        {/* Approve all CTA */}
        <button style={{ width: '100%', padding: '14px 0', borderRadius: 14, border: 'none', background: GREEN, color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <svg width="16" height="16" fill="none" viewBox="0 0 24 24"><path stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" d="M20 6L9 17l-5-5"/></svg>
          Approve All Pending Shifts
        </button>
      </div>
    </div>
  );
}
