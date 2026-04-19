import AdsDashboardPage from '@/components/broadcast/AdsDashboardPage'

/**
 * /grow/ads — Meta/IG paid dashboard. Body is the unchanged
 * AdsDashboardPage component; SignalLabHeader auto-detects `/grow/*`
 * and renders the Grow Lab sub-nav + eyebrow, so no component changes
 * are needed for the migration.
 */
export default function AdsPage() {
  return <AdsDashboardPage />
}
