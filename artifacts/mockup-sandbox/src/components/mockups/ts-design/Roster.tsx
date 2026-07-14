export default function Roster() {
  const BG = '#F2F2F7', CARD = '#fff', BLUE = '#007AFF', TEXT = '#1C1C1E',
    MUTED = '#8E8E93', BORDER = '#E5E7EB', GREEN = '#34C759', AMBER = '#F59E0B',
    RED = '#FF3B30', PURPLE = '#8B5CF6', NAVY = '#1A2B4A';

  const days = [
    { d: 'Mon', n: 14 }, { d: 'Tue', n: 15 }, { d: 'Wed', n: 16 },
    { d: 'Thu', n: 17 }, { d: 'Fri', n: 18 }, { d: 'Sat', n: 19 }, { d: 'Sun', n: 20 },
  ];
  const today = 14;

  const staff = [
    {
      name: 'Sarah M.', role: 'Barista', color: BLUE, initials: 'SM', live: true,
      shifts: ['7a–3p', '7a–3p', null, '7a–3p', '7a–3p', '8a–2p', null],
      status: ['conf', 'conf', null, 'rost', 'rost', 'rost', null],
    },
    {
      name: 'James C.', role: 'Supervisor', color: PURPLE, initials: 'JC', live: true,
      shifts: ['9a–5p', null, '9a–5p', '9a–5p', '9a–5p', '10a–4p', '10a–4p'],
      status: ['conf', null, 'rost', 'rost', 'rost', 'rost', 'rost'],
    },
    {
      name: 'Emily R.', role: 'Barista', color: '#EC4899', initials: 'ER', live: false,
      shifts: [null, '8a–4p', '8a–4p', null, '8a–4p', '8a–4p', null],
      status: [null, 'conf', 'conf', null, 'rost', 'rost', null],
    },
    {
      name: 'Tom W.', role: 'Kitchen', color: AMBER, initials: 'TW', live: false,
      shifts: ['6a–2p', '6a–2p', '6a–2p', '6a–2p', null, null, null],
      status: ['late', 'conf', 'rost', 'rost', null, null, null],
    },
    {
      name: 'Priya S.', role: 'Cashier', color: '#06B6D4', initials: 'PS', live: false,
      shifts: [null, '10a–6p', null, '10a–6p', '10a–6p', '9a–5p', '9a–5p'],
      status: [null, 'conf', null, 'rost', 'rost', 'rost', 'rost'],
    },
  ];

  const statusColor: Record<string, string> = {
    conf: '#E8F9EE', rost: '#EFF6FF', late: '#FEF3C7', noshow: '#FEE2E2',
  };
  const statusBorder: Record<string, string> = {
    conf: GREEN, rost: BLUE, late: AMBER, noshow: RED,
  };
  const statusText: Record<string, string> = {
    conf: GREEN, rost: BLUE, late: AMBER, noshow: RED,
  };

  return (
    <div style={{ fontFamily: '-apple-system,BlinkMacSystemFont,sans-serif', background: BG, minHeight: '100vh', width: 390, margin: '0 auto', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
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
            <button style={{ background: BLUE, border: 'none', borderRadius: 8, padding: '6px 12px', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>+ Shift</button>
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ background: CARD, borderBottom: `1px solid ${BORDER}`, padding: '10px 16px', display: 'flex', gap: 8 }}>
        {['Roster', 'Timesheets', 'Pay Run'].map((tab, i) => {
          const active = i === 0;
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

      {/* Week nav */}
      <div style={{ background: CARD, borderBottom: `1px solid ${BORDER}`, padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button style={{ width: 32, height: 32, borderRadius: 8, border: `1px solid ${BORDER}`, background: BG, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <svg width="14" height="14" fill="none" viewBox="0 0 24 24"><path stroke={TEXT} strokeWidth="2.5" strokeLinecap="round" d="M15 18l-6-6 6-6"/></svg>
        </button>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: TEXT }}>14 – 20 Jul 2026</div>
          <div style={{ fontSize: 11, color: MUTED, marginTop: 1 }}>Current week</div>
        </div>
        <button style={{ width: 32, height: 32, borderRadius: 8, border: `1px solid ${BORDER}`, background: BG, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <svg width="14" height="14" fill="none" viewBox="0 0 24 24"><path stroke={TEXT} strokeWidth="2.5" strokeLinecap="round" d="M9 18l6-6-6-6"/></svg>
        </button>
      </div>

      {/* Live indicator */}
      <div style={{ margin: '10px 16px 0', background: '#E8F9EE', borderRadius: 10, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8, border: `1px solid ${GREEN}30` }}>
        <div style={{ width: 8, height: 8, borderRadius: 4, background: GREEN, flexShrink: 0 }} />
        <span style={{ fontSize: 12, color: GREEN, fontWeight: 600 }}>2 staff clocked in now</span>
        <span style={{ fontSize: 12, color: MUTED, marginLeft: 'auto' }}>Sarah M. · James C.</span>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 12, padding: '8px 16px', alignItems: 'center' }}>
        {[['Confirmed', GREEN], ['Rostered', BLUE], ['Late', AMBER]].map(([label, color]) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 10, height: 10, borderRadius: 3, background: color as string }} />
            <span style={{ fontSize: 10, color: MUTED, fontWeight: 500 }}>{label}</span>
          </div>
        ))}
      </div>

      {/* Roster grid */}
      <div style={{ flex: 1, overflowX: 'auto', paddingBottom: 16 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 390 }}>
          <thead>
            <tr style={{ background: CARD, borderBottom: `1px solid ${BORDER}` }}>
              <th style={{ width: 62, padding: '6px 8px', textAlign: 'left', fontSize: 10, fontWeight: 600, color: MUTED, borderRight: `1px solid ${BORDER}` }}>STAFF</th>
              {days.map(d => (
                <th key={d.n} style={{ padding: '6px 2px', textAlign: 'center', fontSize: 9, fontWeight: 600, color: d.n === today ? BLUE : MUTED, borderRight: `1px solid ${BORDER}` }}>
                  <div>{d.d}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: d.n === today ? BLUE : TEXT, marginTop: 1 }}>{d.n}</div>
                  {d.n === today && <div style={{ width: 4, height: 4, borderRadius: 2, background: BLUE, margin: '3px auto 0' }} />}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {staff.map((s, si) => (
              <tr key={si} style={{ borderBottom: `1px solid ${BORDER}`, background: si % 2 === 0 ? CARD : `${BG}80` }}>
                <td style={{ padding: '8px 6px', borderRight: `1px solid ${BORDER}`, verticalAlign: 'middle' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                    <div style={{ width: 28, height: 28, borderRadius: 14, background: s.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: '#fff', position: 'relative' }}>
                      {s.initials}
                      {s.live && <div style={{ position: 'absolute', bottom: 0, right: 0, width: 7, height: 7, borderRadius: 4, background: GREEN, border: '1.5px solid white' }} />}
                    </div>
                    <span style={{ fontSize: 8, color: TEXT, fontWeight: 600, textAlign: 'center', lineHeight: 1.2, maxWidth: 50 }}>{s.name}</span>
                  </div>
                </td>
                {s.shifts.map((shift, di) => (
                  <td key={di} style={{ padding: '4px 2px', borderRight: `1px solid ${BORDER}`, textAlign: 'center', verticalAlign: 'middle' }}>
                    {shift && s.status[di] ? (
                      <div style={{ background: statusColor[s.status[di]!] || '#F1F5F9', border: `1px solid ${statusBorder[s.status[di]!] || BORDER}30`, borderRadius: 5, padding: '3px 2px' }}>
                        <div style={{ fontSize: 8, fontWeight: 700, color: statusText[s.status[di]!] || TEXT, lineHeight: 1.3 }}>{shift}</div>
                      </div>
                    ) : (
                      <div style={{ width: '80%', height: 1, background: BORDER, margin: '0 auto', opacity: 0.4 }} />
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>

        {/* Week summary */}
        <div style={{ margin: '12px 16px 0', background: CARD, borderRadius: 12, border: `1px solid ${BORDER}`, overflow: 'hidden' }}>
          <div style={{ padding: '10px 14px', borderBottom: `1px solid ${BORDER}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: TEXT }}>Week Summary</span>
            <span style={{ fontSize: 11, color: MUTED }}>Mon 14 – Sun 20 Jul</span>
          </div>
          {[
            { name: 'Sarah M.', hours: '30h', cost: '$750', shifts: 5 },
            { name: 'James C.', hours: '40h', cost: '$1,000', shifts: 6 },
            { name: 'Emily R.', hours: '32h', cost: '$736', shifts: 4 },
            { name: 'Tom W.', hours: '32h', cost: '$704', shifts: 4 },
            { name: 'Priya S.', hours: '40h', cost: '$840', shifts: 5 },
          ].map((row, i) => (
            <div key={i} style={{ padding: '8px 14px', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, color: TEXT, flex: 1, fontWeight: 500 }}>{row.name}</span>
              <span style={{ fontSize: 11, color: MUTED }}>{row.shifts} shifts</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: TEXT, width: 36, textAlign: 'right' }}>{row.hours}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: GREEN, width: 52, textAlign: 'right' }}>{row.cost}</span>
            </div>
          ))}
          <div style={{ padding: '10px 14px', background: `${NAVY}08`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: TEXT }}>TOTAL</span>
            <span style={{ fontSize: 13, fontWeight: 800, color: NAVY }}>174h · $4,030</span>
          </div>
        </div>
      </div>
    </div>
  );
}
