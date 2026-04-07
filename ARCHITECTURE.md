# InstAIgram - Phase 1 Architecture

## Stack
- Next.js 15 App Router
- TypeScript
- PostgreSQL + Prisma ORM
- Zod validation
- Tailwind CSS

## Folder Structure
```
src/
├── app/
│   ├── layout.tsx
│   ├── page.tsx
│   ├── api/
│   │   ├── channels/
│   │   │   ├── route.ts                          # POST /api/channels
│   │   │   └── [id]/
│   │   │       ├── route.ts                      # GET /api/channels/[id]
│   │   │       ├── generate-niches/route.ts      # POST /api/channels/[id]/generate-niches
│   │   │       ├── select-niche/route.ts         # POST /api/channels/[id]/select-niche
│   │   │       ├── generate-positioning/route.ts # POST /api/channels/[id]/generate-positioning
│   │   │       ├── generate-hooks/route.ts       # POST /api/channels/[id]/generate-hooks
│   │   │       ├── generate-posts/route.ts       # POST /api/channels/[id]/generate-posts
│   │   │       ├── posts/route.ts                # GET /api/channels/[id]/posts
│   │   │       └── validation-report/route.ts    # GET /api/channels/[id]/validation-report
│   │   └── posts/
│   │       └── [id]/
│   │           ├── route.ts                      # GET /api/posts/[id]
│   │           ├── regenerate-hook/route.ts      # POST /api/posts/[id]/regenerate-hook
│   │           ├── regenerate-post/route.ts      # POST /api/posts/[id]/regenerate-post
│   │           └── regenerate-slide/route.ts     # POST /api/posts/[id]/regenerate-slide
│   └── channels/
│       └── [id]/
│           ├── page.tsx                          # Channel detail page
│           ├── posts/
│           │   ├── page.tsx                      # Posts list page
│           │   └── [postId]/page.tsx             # Single post detail page
│           └── validation/page.tsx               # Validation report page
├── lib/
│   ├── ai/
│   │   ├── types.ts              # AIProvider interface
│   │   ├── provider.ts           # Provider factory (env-based selection)
│   │   ├── mock-provider.ts      # Mock AI for dev/testing
│   │   └── openai-provider.ts    # OpenAI integration
│   ├── db/
│   │   └── prisma.ts             # Prisma client singleton
│   ├── prompts/
│   │   ├── niche-generation.ts   # Niche discovery prompts
│   │   ├── positioning-generation.ts
│   │   ├── hook-generation.ts
│   │   ├── post-generation.ts
│   │   ├── caption-generation.ts
│   │   └── regeneration.ts       # Hook/post/slide regeneration prompts
│   ├── services/
│   │   ├── channel-service.ts    # Channel CRUD
│   │   ├── niche-service.ts      # Niche generation & selection
│   │   ├── positioning-service.ts
│   │   ├── hook-service.ts       # 30-day hook generation
│   │   ├── post-service.ts       # Slide + caption generation
│   │   ├── regeneration-service.ts # Re-gen individual hooks/posts/slides
│   │   └── validation-service.ts # Cross-channel content validation
│   ├── utils/
│   │   ├── api-helpers.ts        # Error handling, body parsing
│   │   └── similarity.ts         # Text similarity utilities
│   └── validation/
│       ├── enums.ts              # Re-exported Prisma enums + label maps
│       └── schemas.ts            # Zod schemas for AI output validation
└── generated/
    └── prisma/                   # Prisma-generated client (auto-generated)
```

## API Endpoints

| # | Method | Path | Description |
|---|--------|------|-------------|
| 1 | POST | `/api/channels` | Create a new channel |
| 2 | GET | `/api/channels/[id]` | Get channel details |
| 3 | POST | `/api/channels/[id]/generate-niches` | Generate 5 niche options via AI |
| 4 | POST | `/api/channels/[id]/select-niche` | Select a niche option |
| 5 | POST | `/api/channels/[id]/generate-positioning` | Generate channel positioning via AI |
| 6 | POST | `/api/channels/[id]/generate-hooks` | Generate 30 hooks (one per day) via AI |
| 7 | POST | `/api/channels/[id]/generate-posts` | Generate slides + captions for all posts |
| 8 | GET | `/api/channels/[id]/posts` | List all posts for a channel |
| 9 | GET | `/api/channels/[id]/validation-report` | Get content validation report |
| 10 | GET | `/api/posts/[id]` | Get a single post with slides + caption |
| 11 | POST | `/api/posts/[id]/regenerate-hook` | Regenerate hook for a post |
| 12 | POST | `/api/posts/[id]/regenerate-post` | Regenerate all slides + caption for a post |
| 13 | POST | `/api/posts/[id]/regenerate-slide` | Regenerate a single slide |

## How to Run Locally

### Prerequisites
- Node.js 18+
- PostgreSQL running locally
- Database named "instaigram"

### Setup
1. Clone the repo
2. npm install
3. Copy .env.example to .env and configure DATABASE_URL
4. npx prisma migrate dev (or npx prisma db push for quick setup)
5. npx prisma db seed (optional - seeds demo data)
6. npm run dev
7. Open http://localhost:3000

## Assumptions
- Single user, no auth needed
- Mock AI provider used by default (set AI_PROVIDER env var for real provider)
- PostgreSQL running on localhost:5432

## Phase 2 TODO (Visual Engine)
- Image generation service (canvas/sharp for text overlay)
- Template system for carousel slide designs
- Font and color palette management
- Image export (PNG/JPG) per slide
- Full carousel PDF/ZIP export
- Instagram API integration for publishing
- Scheduler for timed posts
- Analytics dashboard
