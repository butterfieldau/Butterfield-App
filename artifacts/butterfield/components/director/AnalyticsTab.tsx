import { Feather } from '@expo/vector-icons';
import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text } from 'react-native';
import { s } from './reportStyles';
import { NAVY } from './directorColors';
import ReportDateRangePicker, { type DateRange, type RangePreset, getPresetRange } from './ReportDateRangePicker';
import SalesSummarySection from './SalesSummarySection';
import PaymentsSection from './PaymentsSection';
import ProductsSection from './ProductsSection';
import BusyTimesSection from './BusyTimesSection';
import StaffSection from './StaffSection';
import RefundsSection from './RefundsSection';
import CustomerGrowthSection from './CustomerGrowthSection';

export default function AnalyticsTab({ onDownloadPress }: { onDownloadPress: () => void }) {
  const [preset, setPreset] = useState<RangePreset>('today');
  const [customRange, setCustomRange] = useState<DateRange>(() => getPresetRange('today'));

  const range = useMemo<DateRange>(() =>
    preset === 'custom' ? customRange : getPresetRange(preset),
    [preset, customRange],
  );

  const handlePreset = useCallback((p: RangePreset) => {
    setPreset(p);
    if (p !== 'custom') setCustomRange(getPresetRange(p));
  }, []);

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingBottom: 48 }}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      <ReportDateRangePicker
        preset={preset}
        range={range}
        onPreset={handlePreset}
        onCustomChange={setCustomRange}
      />

      <SalesSummarySection from={range.from} to={range.to} />
      <PaymentsSection     from={range.from} to={range.to} />
      <ProductsSection     from={range.from} to={range.to} />
      <BusyTimesSection    from={range.from} to={range.to} />
      <StaffSection        from={range.from} to={range.to} />
      <RefundsSection      from={range.from} to={range.to} />
      <CustomerGrowthSection from={range.from} to={range.to} />

      <Pressable onPress={onDownloadPress} style={s.downloadBtn}>
        <Feather name="download" size={16} color="#fff" />
        <Text style={s.downloadBtnText}>Download Excel Report</Text>
      </Pressable>
    </ScrollView>
  );
}
