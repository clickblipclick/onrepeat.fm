import { redirect } from 'next/navigation'

import { getNotifications } from '@onrepeat/appview'

import { NotificationsList } from '@/app/_components/notifications-list'
import { SectionLabel } from '@/app/_components/section-label'
import { hydrateNotifications } from '@/lib/appview'
import { db } from '@/lib/db'
import { getSession } from '@/lib/session'

export const metadata = {
  title: 'Notifications · onrepeat.fm',
}

export default async function NotificationsPage() {
  const { did } = await getSession()
  if (!did) redirect('/login')

  const page = await getNotifications(db, { did })
  const notifications = await hydrateNotifications(page.notifications)

  return (
    <>
      <SectionLabel as="h1" size="title">
        Notifications
      </SectionLabel>
      <NotificationsList initial={notifications} initialCursor={page.cursor} />
    </>
  )
}
