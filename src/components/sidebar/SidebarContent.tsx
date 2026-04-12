'use client'

import { usePathname } from 'next/navigation'
import { AdminSidebar } from './AdminSidebar'
import { ChannelSidebar } from './ChannelSidebar'
import { CarouselSidebar } from './CarouselSidebar'
import { PreviewSidebar } from './PreviewSidebar'

export function SidebarContent() {
  const pathname = usePathname()

  if (pathname.startsWith('/channels/')) {
    return <ChannelSidebar />
  }
  if (pathname.startsWith('/carousel')) {
    return <CarouselSidebar />
  }
  if (pathname.startsWith('/preview')) {
    return <PreviewSidebar />
  }
  // Default: admin sidebar (covers /admin and any other routes)
  return <AdminSidebar />
}
