export default function PayRun() {
  const BG = '#F2F2F7', CARD = '#fff', BLUE = '#007AFF', TEXT = '#1C1C1E',
    MUTED = '#8E8E93', BORDER = '#E5E7EB', GREEN = '#34C759', AMBER = '#F59E0B',
    RED = '#FF3B30', PURPLE = '#8B5CF6', NAVY = '#1A2B4A';

  const staff = [
    { name: 'Sarah Mitchell', role: 'Barista',    initials: 'SM', color: BLUE,   type: 'Casual',    rate: '$25.00', regHrs: '22.5', otHrs: '0.0', totalHrs: '22.5', gross: '$562.50',  status: 'pending', taxH: '$112.50', net: '$450.00' },
    { name: 'James Chen',     role: 'Supervisor', initials: 'JC', color: PURPLE, type: 'Part-Time', rate: '$30.00', regHrs: '36.0', otHrs: '0.0', totalHrs: '36.0', gross: '$1,080.00', status: 'approved', taxH: '$270.00', net: '$810.00' },
    { name: 'Emily Ross',     role: 'Barista',    initials: 'ER', color: '#EC4899', type: 'Casual', rate: '$23.00', regHrs: '28.0', otHrs: '0.0', totalHrs: '28.0', gross: '$644.00',  status: 'pending', taxH: '$128.80', net: '$515.20' },
    { name: 'Tom Walsh',      role: 'Kitchen',    initials: 'TW', color: AMBER,  type: 'Full-Time', rate: '$22.00', regHrs: '38.0', otHrs: '2.0', totalHrs: '40.0', gross: '$902.00',  status: 'pending', taxH: '$180.40', net: '$721.60' },
    { name: 'Priya Sharma',   role: 'Cashier',    initials: 'PS', color: '#06B6D4', type: 'Part-Time', rate: '$21.00', regHrs: '34.0', otHrs: '0.0', totalHrs: '34.0', gross: '$714.00', status: 'approved', taxH: '$142.80', net: '$571.20' },
  ];

  const statusConfig: Record<string, { bg: string, text: string, label: string }> = {
    approved: { bg: '#E8F9EE', text: GREEN,  label: 'Approved' },
    pending:  { bg: '#FEF3C7', text: AMBER,  label: 'Review'   },
    exported: { bg: '#EFF6FF', text: BLUE,   label: 'Exported' },
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
          <button style={{ background: GREEN, border: 'none', borderRadius: 8, padding: '6px 12px', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Export</button>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ background: CARD, borderBottom: `1px solid ${BORDER}`, padding: '10px 16px', display: 'flex', gap: 8 }}>
        {['Roster', 'Timesheets', 'Pay Run'].map((tab, i) => {
          const active = i === 2;
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

      {/* Pay period selector */}
      <div style={{ background: CARD, borderBottom: `1px solid ${BORDER}`, padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button style={{ width: 30, height: 30, borderRadius: 8, border: `1px solid ${BORDER}`, background: BG, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <svg width="13" height="13" fill="none" viewBox="0 0 24 24"><path stroke={TEXT} strokeWidth="2.5" strokeLinecap="round" d="M15 18l-6-6 6-6"/></svg>
        </button>
        <div style={{ textAlign: 'center' }}>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 4 }}>
            {['Weekly', 'Fortnightly', 'Monthly'].map((p, i) => (
              <button key={p} style={{ padding: '3px 8px', borderRadius: 8, border: `1px solid ${i === 0 ? BLUE : BORDER}`, background: i === 0 ? `${BLUE}15` : 'transparent', color: i === 0 ? BLUE : MUTED, fontSize: 10, fontWeight: 600, cursor: 'pointer' }}>{p}</button>
            ))}
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, color: TEXT }}>1 Jul – 14 Jul 2026</div>
        </div>
        <button style={{ width: 30, height: 30, borderRadius: 8, border: `1px solid ${BORDER}`, background: BG, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <svg width="13" height="13" fill="none" viewBox="0 0 24 24"><path stroke={TEXT} strokeWidth="2.5" strokeLinecap="round" d="M9 18l6-6-6-6"/></svg>
        </button>
      </div>

      {/* Hero wages card */}
      <div style={{ margin: '12px 16px', background: NAVY, borderRadius: 18, padding: 20, position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', right: -20, top: -20, width: 120, height: 120, borderRadius: 60, background: 'rgba(255,255,255,0.06)' }} />
        <div style={{ position: 'absolute', right: 20, bottom: -30, width: 90, height: 90, borderRadius: 45, background: 'rgba(255,255,255,0.04)' }} />
        <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.5)', letterSpacing: 1, marginBottom: 4, textTransform: 'uppercase' }}>Total Gross Wages</div>
        <div style={{ fontSize: 36, fontWeight: 800, color: '#fff', letterSpacing: -1, marginBottom: 12 }}>$3,902.50</div>
        <div style={{ display: 'flex', gap: 20 }}>
          {[['160.5h', 'Total Hours'], ['5 staff', 'Employees'], ['3 Pending', 'Need Review']].map(([val, lbl]) => (
            <div key={lbl}>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>{val}</div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)' }}>{lbl}</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
          <button style={{ flex: 1, padding: '9px 0', borderRadius: 10, background: BLUE, border: 'none', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Export to MYOB</button>
          <button style={{ flex: 1, padding: '9px 0', borderRadius: 10, background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Pay Slips PDF</button>
        </div>
      </div>

      {/* Staff pay cards */}
      <div style={{ padding: '0 16px 24px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: MUTED, letterSpacing: 0.8, textTransform: 'uppercase' }}>Staff Pay Summary</span>
          <span style={{ fontSize: 11, color: MUTED }}>Tap to expand</span>
        </div>

        {staff.map((s, i) => {
          const cfg = statusConfig[s.status] || statusConfig.pending;
          const hasOt = parseFloat(s.otHrs) > 0;
          return (
            <div key={i} style={{ background: CARD, borderRadius: 14, border: `1px solid ${BORDER}`, overflow: 'hidden' }}>
              {/* Staff row */}
              <div style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 38, height: 38, borderRadius: 19, background: s.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: '#fff', flexShrink: 0 }}>{s.initials}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: TEXT, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.name}</div>
                  <div style={{ fontSize: 11, color: MUTED }}>{s.role} · {s.type} · {s.rate}/hr</div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 800, color: NAVY }}>{s.gross}</div>
                  <span style={{ fontSize: 10, fontWeight: 700, background: cfg.bg, color: cfg.text, borderRadius: 6, padding: '2px 7px', border: `1px solid ${cfg.text}30` }}>{cfg.label}</span>
                </div>
              </div>

              {/* Hours breakdown */}
              <div style={{ borderTop: `1px solid ${BORDER}`, padding: '8px 14px', display: 'flex', gap: 0 }}>
                {[
                  { label: 'Reg Hours', val: s.regHrs, color: TEXT },
                  { label: 'Overtime', val: s.otHrs, color: hasOt ? AMBER : MUTED },
                  { label: 'Total', val: s.totalHrs, color: TEXT },
                  { label: 'Tax Est.', val: s.taxH, color: RED },
                  { label: 'Net Pay', val: s.net, color: GREEN },
                ].map((item, j) => (
                  <div key={j} style={{ flex: 1, textAlign: 'center', padding: '4px 2px', borderRight: j < 4 ? `1px solid ${BORDER}` : 'none' }}>
                    <div style={{ fontSize: 8, fontWeight: 600, color: MUTED, marginBottom: 2, textTransform: 'uppercase', lineHeight: 1.1 }}>{item.label}</div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: item.color }}>{item.val}</div>
                  </div>
                ))}
              </div>

              {/* Action row for pending */}
              {s.status === 'pending' && (
                <div style={{ borderTop: `1px solid ${BORDER}`, padding: '8px 14px', display: 'flex', gap: 8 }}>
                  <button style={{ flex: 1, padding: '7px 0', borderRadius: 8, border: `1px solid ${GREEN}`, background: `${GREEN}12`, color: GREEN, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>✓ Approve</button>
                  <button style={{ padding: '7px 14px', borderRadius: 8, border: `1px solid ${BORDER}`, background: BG, color: MUTED, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Edit</button>
                </div>
              )}
            </div>
          );
        })}

        {/* Totals footer */}
        <div style={{ background: `${NAVY}0A`, border: `1px solid ${NAVY}20`, borderRadius: 14, padding: '14px 16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: MUTED }}>Total Hours Worked</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: TEXT }}>160.5h</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: MUTED }}>Estimated Tax Withholding</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: RED }}>$834.50</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: MUTED }}>Net Payroll</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: GREEN }}>$3,068.00</span>
          </div>
          <div style={{ height: 1, background: BORDER, margin: '8px 0' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: TEXT }}>GROSS TOTAL</span>
            <span style={{ fontSize: 16, fontWeight: 800, color: NAVY }}>$3,902.50</span>
          </div>
        </div>

        {/* Compliance notice */}
        <div style={{ background: `${BLUE}08`, border: `1px solid ${BLUE}25`, borderRadius: 12, padding: '12px 14px', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, marginTop: 1 }}><circle cx="12" cy="12" r="9" stroke={BLUE} strokeWidth="2"/><path stroke={BLUE} strokeWidth="2" strokeLinecap="round" d="M12 8v4m0 4h.01"/></svg>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: BLUE, marginBottom: 2 }}>Super & Entitlements</div>
            <div style={{ fontSize: 11, color: MUTED, lineHeight: 1.5 }}>SGC super at 11% = $429.28. Annual leave accrual: 3 days this period. Verify award rates before exporting to payroll.</div>
          </div>
        </div>
      </div>
    </div>
  );
}
