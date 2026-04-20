import HomeKhromaSplit from '../../page-khroma-split'

export default async function ResumedCarouselPage({
  params,
}: {
  params: Promise<{ jobId: string }>
}) {
  const { jobId } = await params
  return <HomeKhromaSplit initialJobId={jobId} />
}
