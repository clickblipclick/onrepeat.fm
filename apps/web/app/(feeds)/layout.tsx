import { getSession } from '../../lib/session'
import { FeedTabs } from '../_components/feed-tabs'

/** Wraps the two feed routes (/ and /explore). Signed-in users get the FeedTabs
 *  segmented control (feed switching used to live in the header nav). Signed-out
 *  users have no "following" feed, so no tabs — the page renders as today. */
export default async function FeedsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getSession()
  return (
    <>
      {session.did && <FeedTabs />}
      {children}
    </>
  )
}
