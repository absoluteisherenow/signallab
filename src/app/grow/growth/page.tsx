import GrowthDashboardPage from '@/components/broadcast/GrowthDashboardPage'

/**
 * /grow/growth — follower trajectory, funnel campaigns, growth rule
 * verdicts. Default landing for /grow. Body unchanged from the old
 * /broadcast/growth route; SignalLabHeader auto-swaps to Grow mode
 * based on pathname.
 */
export default function GrowthPage() {
  return <GrowthDashboardPage />
}
