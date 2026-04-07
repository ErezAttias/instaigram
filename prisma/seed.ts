import { createChannel } from '../src/lib/services/channel-service'
import { generateNiches, selectNiche } from '../src/lib/services/niche-service'
import { setChannelName } from '../src/lib/services/name-service'
import { generateHooks } from '../src/lib/services/hook-service'
import { generatePosts } from '../src/lib/services/post-service'
import { generateValidationReport } from '../src/lib/services/validation-service'
import { prisma } from '../src/lib/db/prisma'

async function seed() {
  const totalStart = performance.now()
  console.log('Seeding database...\n')

  try {
    // Clean up: if "Digital Minimalism" channel already exists, delete it and all related data
    const existing = await prisma.channel.findFirst({
      where: { name: 'Digital Minimalism' },
    })
    if (existing) {
      console.log(`Found existing "Digital Minimalism" channel (${existing.id}). Deleting...`)
      const cleanStart = performance.now()

      // Delete in dependency order: slides/captions -> posts -> niches/memory/jobs -> channel
      await prisma.slide.deleteMany({ where: { post: { channelId: existing.id } } })
      await prisma.caption.deleteMany({ where: { post: { channelId: existing.id } } })
      await prisma.post.deleteMany({ where: { channelId: existing.id } })
      await prisma.nicheOption.deleteMany({ where: { channelId: existing.id } })
      await prisma.channelMemory.deleteMany({ where: { channelId: existing.id } })
      await prisma.generationJob.deleteMany({ where: { channelId: existing.id } })
      await prisma.channel.delete({ where: { id: existing.id } })

      console.log(`  Cleaned up in ${(performance.now() - cleanStart).toFixed(0)}ms\n`)
    }

    // 1. Create channel
    let stepStart = performance.now()
    const channel = await createChannel({
      nicheMode: 'EXPLORE',
      exploreTopic: 'digital minimalism and intentional tech use',
    })
    console.log(`1. Channel created: ${channel.id} (${(performance.now() - stepStart).toFixed(0)}ms)`)

    // 2. Generate niches
    stepStart = performance.now()
    const niches = await generateNiches(channel.id, 'EXPLORE', 'digital minimalism')
    console.log(`2. Generated ${niches.length} niches (${(performance.now() - stepStart).toFixed(0)}ms)`)

    // 3. Select first niche
    stepStart = performance.now()
    await selectNiche(channel.id, niches[0].id)
    console.log(`3. Selected niche: ${niches[0].title} (${(performance.now() - stepStart).toFixed(0)}ms)`)

    // 4. Name the channel
    stepStart = performance.now()
    await setChannelName(channel.id, 'Digital Minimalism')
    console.log(`4. Channel named: Digital Minimalism (${(performance.now() - stepStart).toFixed(0)}ms)`)

    // 5. Generate hooks
    stepStart = performance.now()
    const hooks = await generateHooks(channel.id)
    console.log(`5. Generated ${hooks.length} hooks (${(performance.now() - stepStart).toFixed(0)}ms)`)

    // 6. Generate posts
    stepStart = performance.now()
    const posts = await generatePosts(channel.id)
    console.log(`6. Generated ${posts.length} posts with slides and captions (${(performance.now() - stepStart).toFixed(0)}ms)`)

    // 7. Validation report
    stepStart = performance.now()
    const report = await generateValidationReport(channel.id)
    console.log(`7. Validation score: ${report.overallScore}, Issues: ${report.issues.length} (${(performance.now() - stepStart).toFixed(0)}ms)`)

    const totalMs = (performance.now() - totalStart).toFixed(0)
    console.log(`\nSeed complete! Total time: ${totalMs}ms`)
  } catch (error) {
    console.error('\nSeed failed with error:')
    console.error(error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

seed().catch((error) => {
  console.error('Unexpected seed error:', error)
  process.exit(1)
})
