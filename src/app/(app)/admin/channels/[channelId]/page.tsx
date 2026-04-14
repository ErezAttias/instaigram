import { redirect } from 'next/navigation'

export default function AdminChannelPage({ params }: { params: { channelId: string } }) {
  redirect(`/channels/${params.channelId}`)
}
