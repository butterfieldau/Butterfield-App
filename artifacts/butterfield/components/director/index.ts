// ── Primitives ──────────────────────────────────────────────────────────────
export { default as StatCard }              from './StatCard';
export { default as HBar }                  from './HBar';
export { default as EmptyState }            from './EmptyState';
export { default as SectionLoader }         from './SectionLoader';
export { default as KpiTile }               from './KpiTile';
export { default as QuickBtn }              from './QuickBtn';
export { default as DeltaBadge }            from './DeltaBadge';
export { default as Sparkline }             from './Sparkline';

// ── Analytics / Reports ──────────────────────────────────────────────────────
export { default as ReportSectionHeader }   from './ReportSectionHeader';
export { default as AovCustomerRow }        from './AovCustomerRow';
export { default as HourlyInsightsChart }   from './HourlyInsightsChart';
export { default as RevenueRangePicker }    from './RevenueRangePicker';
export { default as SalesSummarySection }   from './SalesSummarySection';
export { default as PaymentsSection }       from './PaymentsSection';
export { default as ProductsSection }       from './ProductsSection';
export { default as BusyTimesSection }      from './BusyTimesSection';
export { default as StaffSection }          from './StaffSection';
export { default as RefundsSection }        from './RefundsSection';
export { default as CustomerGrowthSection } from './CustomerGrowthSection';
export { default as ReportDateRangePicker, getPresetRange } from './ReportDateRangePicker';
export { default as DownloadReportModal }   from './DownloadReportModal';
export { default as AnalyticsTab }          from './AnalyticsTab';
export { default as RegisterReportsTab }    from './RegisterReportsTab';
export { default as FeedbackTab }           from './FeedbackTab';
export { default as ExportCentreTab }       from './ExportCentreTab';

// ── Orders ───────────────────────────────────────────────────────────────────
export { default as OrderDetailModal }      from './OrderDetailModal';
export { default as OrderCard }             from './OrderCard';
export { default as OrdersSectionHeader }   from './OrdersSectionHeader';
export { default as CalendarModal }         from './CalendarModal';
export { default as PosTransactionCard }    from './PosTransactionCard';
export { PosTabContent }                    from './PosTabContent';
export { WholesaleTabContent }              from './WholesaleTabContent';
export { EditWholesaleOrderSheet }          from './EditWholesaleOrderSheet';
export { AdjustWholesaleOrderSheet }        from './AdjustWholesaleOrderSheet';
export { CreateWholesaleOrderSheet }        from './CreateWholesaleOrderSheet';

// ── Settings ─────────────────────────────────────────────────────────────────
export { default as DateField }             from './DateField';
export { default as SlideEditor }           from './SlideEditor';
export { BannerTab }                        from './BannerTab';
export { StoreTab }                         from './StoreTab';
export { StoreHoursSection }               from './StoreHoursSection';
export { default as AnnouncementModal }     from './AnnouncementModal';
export { RewardsTab }                       from './RewardsTab';
export { NotifyTab }                        from './NotifyTab';
export { ManagersTab }                      from './ManagersTab';
export { DirectorsTab }                     from './DirectorsTab';

// ── Products ─────────────────────────────────────────────────────────────────
export { OptionsTab }                       from './OptionsTab';
export { default as ProductModal }          from './ProductModal';
export { default as CatalogTab }            from './CatalogTab';

// ── Users / CRM ──────────────────────────────────────────────────────────────
export { CrmCustomersTab }                  from './CrmCustomersTab';
export { CrmCustomerDetailModal }           from './CrmCustomerDetailModal';
export { StaffProfileModal }               from './StaffProfileModal';
export { WholesaleDetailModal }             from './WholesaleDetailModal';
export { CreateUserModal }                  from './CreateUserModal';
export { ShopDisplayDetailModal }           from './ShopDisplayDetailModal';

// ── Style sheets & helpers ───────────────────────────────────────────────────
export * as directorColors                  from './directorColors';
export * as dashboardHelpers                from './dashboardHelpers';
export * as ordersHelpers                   from './ordersHelpers';
export * as reportHelpers                   from './reportHelpers';
export * as reportStyles                    from './reportStyles';
export * as dashboardStyles                 from './dashboardStyles';
export * as ordersStyles                    from './ordersStyles';
export * as settingsStyles                  from './settingsStyles';
export * as productsStyles                  from './productsStyles';
export * as usersStyles                     from './usersStyles';
