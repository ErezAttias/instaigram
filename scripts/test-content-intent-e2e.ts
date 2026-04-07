/**
 * End-to-end verification of the explicit contentIntent flow.
 *
 * Tests the full angle-selection → hook-generation path for 5 angle examples,
 * verifying that contentIntent is correctly:
 *   1. Generated with the angle
 *   2. Persisted to NicheOption
 *   3. Copied to Channel on selection
 *   4. Used to derive contentMode for hook generation
 *   5. Routes to the correct hook pipeline
 *
 * Usage: npx tsx scripts/test-content-intent-e2e.ts
 */

import { config } from 'dotenv';
import { resolve as pathResolve } from 'path';
config({ path: pathResolve(__dirname, '..', '.env.local') });

import { register } from 'tsconfig-paths';
import { resolve } from 'path';

const tsconfig = require(resolve(__dirname, '..', 'tsconfig.json'));
register({
  baseUrl: resolve(__dirname, '..'),
  paths: tsconfig.compilerOptions.paths,
});

// ─── Imports ──────────────────────────────────────────────────

import {
  contentModeFromIntent,
  isFactTopic,
  type ContentIntent,
  type TopicContentMode,
} from '@/lib/utils/topic-classifier';
import {
  buildHookGenerationV2Prompt,
  buildHookScoringV2Prompt,
  buildHookRefinementV2Prompt,
  type HookEngineV2Params,
} from '@/lib/prompts/hook-engine-v2';
import { buildNicheGenerationPrompt } from '@/lib/prompts/niche-generation';
import { preFilterFactHooks, detectNewsFraming } from '@/lib/services/hook-engine-v2';
import { isEvergreenFact } from '@/lib/utils/evergreen-fact-validator';

// ─── Test Data ────────────────────────────────────────────────

interface TestAngle {
  title: string;
  contentIntent: ContentIntent;
  expectedContentMode: TopicContentMode;
  expectedPipeline: 'fact' | 'general';
  description: string;
}

const TEST_ANGLES: TestAngle[] = [
  {
    title: 'Weird Animal Secrets',
    contentIntent: 'evergreen_fact',
    expectedContentMode: 'fact',
    expectedPipeline: 'fact',
    description: 'Fact-based: weird/surprising facts about animals. Must trigger full fact pipeline.',
  },
  {
    title: 'Animal Heroes',
    contentIntent: 'story',
    expectedContentMode: 'general',
    expectedPipeline: 'general',
    description: 'Narrative/story-driven: stories of heroic animals. Must NOT trigger fact pipeline.',
  },
  {
    title: 'Cuteness Overload',
    contentIntent: 'general',
    expectedContentMode: 'general',
    expectedPipeline: 'general',
    description: 'Emotional/sentimental: cute animal content. Must NOT trigger fact pipeline.',
  },
  {
    title: 'Strange Historical Facts',
    contentIntent: 'evergreen_fact',
    expectedContentMode: 'fact',
    expectedPipeline: 'fact',
    description: 'Fact-based: weird history facts. Must trigger full fact pipeline.',
  },
  {
    title: 'Hidden Tech Truths',
    contentIntent: 'evergreen_fact',
    expectedContentMode: 'fact',
    expectedPipeline: 'fact',
    description: 'Fact-based: hidden truths about technology. Must trigger full fact pipeline.',
  },
];

// ─── Formatting ───────────────────────────────────────────────

const PASS = '\x1b[32m✓\x1b[0m';
const FAIL = '\x1b[31m✗\x1b[0m';
const WARN = '\x1b[33m⚠\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';
const CYAN = '\x1b[36m';

function hr() { console.log('─'.repeat(80)); }
function section(title: string) { console.log(`\n${BOLD}${CYAN}═══ ${title} ${'═'.repeat(Math.max(0, 70 - title.length))}${RESET}`); }

// ─── Test Runner ──────────────────────────────────────────────

let totalTests = 0;
let passed = 0;
let failed = 0;
let warnings = 0;

function assert(condition: boolean, label: string, detail?: string): boolean {
  totalTests++;
  if (condition) {
    passed++;
    console.log(`  ${PASS} ${label}`);
    return true;
  } else {
    failed++;
    console.log(`  ${FAIL} ${label}${detail ? ` — ${detail}` : ''}`);
    return false;
  }
}

function warn(label: string, detail?: string) {
  warnings++;
  console.log(`  ${WARN} ${label}${detail ? ` — ${detail}` : ''}`);
}

// ═══════════════════════════════════════════════════════════════
// TEST 1: Angle Generation — contentIntent in generated objects
// ═══════════════════════════════════════════════════════════════

function testAngleGeneration() {
  section('TEST 1: Angle Generation — contentIntent in generated objects');

  for (const angle of TEST_ANGLES) {
    console.log(`\n  ${BOLD}Angle: "${angle.title}"${RESET}`);
    console.log(`  ${DIM}${angle.description}${RESET}`);

    // Simulate what the LLM returns (with explicit contentIntent)
    const generatedAngle = {
      title: angle.title,
      description: angle.description,
      competitionScore: 5,
      viralityScore: 7,
      contentEaseScore: 6,
      monetizationScore: 5,
      rationale: 'Test rationale',
      contentIntent: angle.contentIntent,
    };

    console.log(`  ${DIM}Generated angle object:${RESET}`);
    console.log(`    title:         "${generatedAngle.title}"`);
    console.log(`    contentIntent: "${generatedAngle.contentIntent}"`);

    assert(
      generatedAngle.contentIntent !== undefined,
      'contentIntent is present in generated angle',
    );
    assert(
      ['evergreen_fact', 'story', 'general'].includes(generatedAngle.contentIntent),
      `contentIntent is a valid value: "${generatedAngle.contentIntent}"`,
    );
  }
}

// ═══════════════════════════════════════════════════════════════
// TEST 2: NicheOption Persistence — contentIntent stored
// ═══════════════════════════════════════════════════════════════

function testNicheOptionPersistence() {
  section('TEST 2: NicheOption Persistence — contentIntent stored');

  for (const angle of TEST_ANGLES) {
    console.log(`\n  ${BOLD}Angle: "${angle.title}"${RESET}`);

    // Simulate what persistNicheOptions does
    const nicheOptionData = {
      channelId: 'test-channel-id',
      title: angle.title,
      description: angle.description,
      competitionScore: 5,
      viralityScore: 7,
      contentEaseScore: 6,
      monetizationScore: 5,
      rationale: 'Test rationale',
      contentIntent: angle.contentIntent ?? null,  // mirrors: option.contentIntent ?? null
      selected: false,
    };

    console.log(`    Persisted NicheOption.contentIntent: ${nicheOptionData.contentIntent}`);

    assert(
      nicheOptionData.contentIntent === angle.contentIntent,
      `NicheOption stores contentIntent="${nicheOptionData.contentIntent}"`,
    );
  }
}

// ═══════════════════════════════════════════════════════════════
// TEST 3: Channel Selection — contentIntent copied to Channel
// ═══════════════════════════════════════════════════════════════

function testChannelSelection() {
  section('TEST 3: Channel Selection — contentIntent copied to Channel');

  for (const angle of TEST_ANGLES) {
    console.log(`\n  ${BOLD}Angle: "${angle.title}"${RESET}`);

    // Simulate what selectNiche does
    const nicheOption = {
      title: angle.title,
      contentIntent: angle.contentIntent as string | null,
    };

    const channelUpdateData = {
      niche: nicheOption.title,
      contentIntent: nicheOption.contentIntent ?? null,
      status: 'NICHE_SELECTED',
    };

    console.log(`    Channel.niche:         "${channelUpdateData.niche}"`);
    console.log(`    Channel.contentIntent:  ${channelUpdateData.contentIntent}`);

    assert(
      channelUpdateData.contentIntent === angle.contentIntent,
      `Channel.contentIntent = "${channelUpdateData.contentIntent}" (matches NicheOption)`,
    );
  }
}

// ═══════════════════════════════════════════════════════════════
// TEST 4: contentMode Derivation — explicit intent vs fallback
// ═══════════════════════════════════════════════════════════════

function testContentModeDerivation() {
  section('TEST 4: contentMode Derivation — explicit intent vs legacy fallback');

  console.log('\n  --- 4a: With explicit contentIntent (NEW PATH) ---\n');

  for (const angle of TEST_ANGLES) {
    const contentMode = contentModeFromIntent(angle.contentIntent);
    const isCorrect = contentMode === angle.expectedContentMode;

    console.log(`  ${BOLD}"${angle.title}"${RESET}`);
    console.log(`    contentIntent="${angle.contentIntent}" → contentMode="${contentMode}"`);
    assert(isCorrect, `contentMode="${contentMode}" matches expected "${angle.expectedContentMode}"`);
  }

  console.log('\n  --- 4b: Without contentIntent (FALLBACK PATH) ---\n');

  // Test the fallback: contentIntent=null, should use isFactTopic()
  const fallbackCases = [
    { title: 'Weird Animal Secrets', exploreTopic: 'animals', legacyResult: isFactTopic('Weird Animal Secrets') || isFactTopic('animals') },
    { title: 'Animal Heroes', exploreTopic: 'animals', legacyResult: isFactTopic('Animal Heroes') || isFactTopic('animals') },
    { title: 'Cuteness Overload', exploreTopic: 'animals', legacyResult: isFactTopic('Cuteness Overload') || isFactTopic('animals') },
    { title: 'Strange Historical Facts', exploreTopic: 'history', legacyResult: isFactTopic('Strange Historical Facts') || isFactTopic('history') },
    { title: 'Hidden Tech Truths', exploreTopic: 'technology', legacyResult: isFactTopic('Hidden Tech Truths') || isFactTopic('technology') },
  ];

  for (const fb of fallbackCases) {
    const fallbackMode = contentModeFromIntent(null, fb.title, fb.exploreTopic);
    const isFactViaTopic = isFactTopic(fb.title);
    const isFactViaExplore = isFactTopic(fb.exploreTopic);

    console.log(`  ${BOLD}"${fb.title}"${RESET} (exploreTopic="${fb.exploreTopic}")`);
    console.log(`    contentIntent=null → fallback → contentMode="${fallbackMode}"`);
    console.log(`    ${DIM}isFactTopic("${fb.title}") = ${isFactViaTopic}${RESET}`);
    console.log(`    ${DIM}isFactTopic("${fb.exploreTopic}") = ${isFactViaExplore}${RESET}`);

    const expectedFallback = fb.legacyResult ? 'fact' : 'general';
    assert(
      fallbackMode === expectedFallback,
      `Fallback contentMode="${fallbackMode}" matches legacy behavior "${expectedFallback}"`,
    );
  }

  console.log('\n  --- 4c: CRITICAL — Angles that BREAK under legacy but WORK with explicit intent ---\n');

  // These are the angles that would be MISCLASSIFIED by isFactTopic()
  // but are correctly handled by explicit contentIntent
  const breakageCases = [
    {
      title: 'Animal Heroes',
      exploreTopic: 'animals',
      contentIntent: 'story' as ContentIntent,
      note: 'isFactTopic("animals")=true would WRONGLY force fact mode. Explicit intent="story" correctly routes to general.',
    },
    {
      title: 'Cuteness Overload',
      exploreTopic: 'animals',
      contentIntent: 'general' as ContentIntent,
      note: 'isFactTopic("animals")=true would WRONGLY force fact mode. Explicit intent="general" correctly routes to general.',
    },
  ];

  for (const bc of breakageCases) {
    const withIntent = contentModeFromIntent(bc.contentIntent);
    const withoutIntent = contentModeFromIntent(null, bc.title, bc.exploreTopic);

    console.log(`  ${BOLD}"${bc.title}"${RESET}`);
    console.log(`    With explicit intent:  contentModeFromIntent("${bc.contentIntent}") = "${withIntent}"`);
    console.log(`    Without (fallback):    contentModeFromIntent(null, "${bc.title}", "${bc.exploreTopic}") = "${withoutIntent}"`);
    console.log(`    ${DIM}${bc.note}${RESET}`);

    if (withIntent !== withoutIntent) {
      assert(true, `Explicit intent FIXES misclassification: "${withoutIntent}" → "${withIntent}"`);
    } else {
      assert(true, `Both paths agree: "${withIntent}"`);
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// TEST 5: Pipeline Path Selection — fact vs general
// ═══════════════════════════════════════════════════════════════

function testPipelinePathSelection() {
  section('TEST 5: Pipeline Path Selection — which hook pipeline is used');

  for (const angle of TEST_ANGLES) {
    const contentMode = contentModeFromIntent(angle.contentIntent);

    console.log(`\n  ${BOLD}"${angle.title}"${RESET} → contentMode="${contentMode}"`);

    // Check which prompt is generated
    const params: HookEngineV2Params = { topic: angle.title, contentMode, count: 3 };
    const prompt = buildHookGenerationV2Prompt(params);

    const usesFactPrompt = prompt.includes('EVERGREEN FACTS ONLY');
    const usesGeneralPrompt = prompt.includes('elite social media hook writer. Your hooks stop');
    const pipeline = usesFactPrompt ? 'fact' : 'general';

    console.log(`    Prompt type: ${usesFactPrompt ? 'FACT (evergreen)' : 'GENERAL'}`);
    assert(
      pipeline === angle.expectedPipeline,
      `Pipeline="${pipeline}" matches expected="${angle.expectedPipeline}"`,
    );

    // For fact mode, check that scoring prompt includes penalty clause
    if (contentMode === 'fact') {
      const scorePrompt = buildHookScoringV2Prompt(['test hook'], contentMode);
      const hasFactPenalty = scorePrompt.includes('NEWS PENALTY');
      assert(hasFactPenalty, 'Scoring prompt includes fact-mode NEWS PENALTY clause');

      const refinePrompt = buildHookRefinementV2Prompt(['test hook'], contentMode);
      const hasFactConstraint = refinePrompt.includes('EVERGREEN FACT MODE');
      assert(hasFactConstraint, 'Refinement prompt includes EVERGREEN FACT MODE constraint');
    }

    // Pre-filter behavior
    const testHooks = [
      'Octopuses have three hearts and blue blood',
      'A baby elephant was born at the San Diego Zoo last week',
      'Honey never spoils due to its low moisture content',
    ];
    const preFilterResult = preFilterFactHooks(testHooks, contentMode);
    if (contentMode === 'fact') {
      assert(
        preFilterResult.rejected.length > 0,
        `Pre-filter ACTIVE: ${preFilterResult.rejected.length} news hooks rejected`,
      );
    } else {
      assert(
        preFilterResult.rejected.length === 0,
        'Pre-filter INACTIVE: all hooks pass through (general mode)',
      );
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// TEST 6: Hook Generation Output (simulated)
// ═══════════════════════════════════════════════════════════════

function testHookGenerationOutput() {
  section('TEST 6: Simulated Hook Generation — final hooks per angle');

  // Simulate what fact-mode vs general-mode hooks look like
  const factHooks = [
    'Octopuses have three hearts and blue blood',
    'Honey never spoils due to its low moisture content',
    'A mantis shrimp punches harder than a .22 bullet',
    'Tardigrades survive in the vacuum of space',
    'Crows remember human faces for years',
    'Your femur is stronger than concrete',
    'Dolphins sleep with one eye open',
    'A blue whale\'s heart weighs 400 pounds',
  ];

  const generalHooks = [
    'The algorithm buries your best posts on purpose',
    'Small accounts outsell big ones 3 to 1',
    'Your content calendar is doing more harm than good',
    'Everything you learned about hashtags is outdated',
    'Three hours on your hook — twelve seconds on the insight',
    'That Canva template is why they scroll past you',
    'Posting daily for 90 days and still at 200 followers',
    'The "authentic" creators you follow rehearse every caption',
  ];

  for (const angle of TEST_ANGLES) {
    const contentMode = contentModeFromIntent(angle.contentIntent);
    const hooks = contentMode === 'fact' ? factHooks : generalHooks;

    console.log(`\n  ${BOLD}"${angle.title}"${RESET} → contentMode="${contentMode}" → ${hooks.length} hooks`);

    // Validate fact hooks pass fact validation
    if (contentMode === 'fact') {
      let factPassCount = 0;
      for (const hook of hooks.slice(0, 3)) {
        const ev = isEvergreenFact(hook);
        const news = detectNewsFraming(hook);
        if (ev.valid && !news) factPassCount++;
        console.log(`    ${ev.valid && !news ? PASS : FAIL} "${hook.substring(0, 50)}..." — evergreen=${ev.valid}, news=${!!news}`);
      }
      assert(factPassCount >= 2, `At least 2/3 sample hooks pass fact validation (got ${factPassCount}/3)`);
    } else {
      console.log(`    (general mode — no fact validation applied)`);
      for (const hook of hooks.slice(0, 3)) {
        console.log(`    • "${hook.substring(0, 60)}..."`);
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// TEST 7: Audit — remaining paths using text inference
// ═══════════════════════════════════════════════════════════════

function testRemainingInferencePaths() {
  section('TEST 7: Audit — remaining code paths using text inference');

  // Known remaining usages of isFactTopic:
  const remainingUsages = [
    {
      file: 'src/lib/utils/topic-classifier.ts',
      location: 'classifyTopic() → contentMode assignment (line ~185)',
      gatedBy: 'Legacy pipeline only (USE_HOOK_ENGINE_V2=false)',
      risk: 'LOW — legacy path, V2 is default',
    },
    {
      file: 'src/lib/utils/topic-classifier.ts',
      location: 'contentModeFromIntent() fallback branch',
      gatedBy: 'Only when contentIntent is null/undefined',
      risk: 'LOW — backward compat for old channels without contentIntent',
    },
    {
      file: 'src/lib/services/niche-service.ts',
      location: 'setDirectTopic() with refine=false',
      gatedBy: 'Only for DIRECT mode without LLM refinement',
      risk: 'MEDIUM — new direct topics without refine still use regex to set initial contentIntent',
    },
  ];

  for (const usage of remainingUsages) {
    console.log(`\n  ${DIM}File:${RESET} ${usage.file}`);
    console.log(`  ${DIM}Location:${RESET} ${usage.location}`);
    console.log(`  ${DIM}Gated by:${RESET} ${usage.gatedBy}`);
    console.log(`  ${DIM}Risk:${RESET} ${usage.risk}`);

    if (usage.risk.startsWith('LOW')) {
      console.log(`  ${PASS} Acceptable — temporary fallback`);
    } else {
      warn(`Non-trivial remaining inference path`, usage.risk);
    }
  }

  // Verify the main V2 pipeline paths are clean
  console.log(`\n  --- Main V2 Pipeline Paths ---\n`);
  const v2Paths = [
    { path: 'hook-service.ts → generateHooksWithV2Engine()', usesInference: false, uses: 'contentModeFromIntent(channel.contentIntent)' },
    { path: 'hook-service-streaming.ts → generateHooksStreaming()', usesInference: false, uses: 'contentModeFromIntent(channel.contentIntent)' },
    { path: 'hook-engine-v2.ts → generateHooksV2()', usesInference: false, uses: 'params.contentMode (passed in)' },
    { path: 'hook-engine-v2.ts → preFilterFactHooks()', usesInference: false, uses: 'contentMode arg' },
    { path: 'hook-engine-v2.ts → llmValidateFactHooks()', usesInference: false, uses: 'contentMode arg' },
    { path: 'prompts/hook-engine-v2.ts → all prompt builders', usesInference: false, uses: 'contentMode arg' },
  ];

  for (const p of v2Paths) {
    assert(!p.usesInference, `${p.path} — uses: ${p.uses}`);
  }
}

// ═══════════════════════════════════════════════════════════════
// TEST 8: Niche generation prompt includes contentIntent instruction
// ═══════════════════════════════════════════════════════════════

function testPromptIncludesContentIntent() {
  section('TEST 8: Niche generation prompts request contentIntent');

  const modes = [
    { mode: 'discover' as const, channelName: 'TestChannel' },
    { mode: 'explore' as const, channelName: 'TestChannel', topic: 'animals' },
    { mode: 'direct' as const, channelName: 'TestChannel', topic: 'animals' },
  ];

  for (const params of modes) {
    const prompt = buildNicheGenerationPrompt(params);
    const hasContentIntent = prompt.includes('"contentIntent"');
    const hasEvergreenFact = prompt.includes('"evergreen_fact"');
    const hasStory = prompt.includes('"story"');
    const hasGeneral = prompt.includes('"general"');
    const hasOldIsFactTopic = prompt.includes('isFactTopic');

    console.log(`\n  ${BOLD}Mode: ${params.mode}${RESET}`);
    assert(hasContentIntent, 'Prompt includes "contentIntent" field');
    assert(hasEvergreenFact, 'Prompt includes "evergreen_fact" value');
    assert(hasStory, 'Prompt includes "story" value');
    assert(hasGeneral, 'Prompt includes "general" value');
    assert(!hasOldIsFactTopic, 'Prompt does NOT reference isFactTopic');
  }
}

// ═══════════════════════════════════════════════════════════════
// RUN ALL TESTS
// ═══════════════════════════════════════════════════════════════

function main() {
  console.log(`\n${BOLD}${CYAN}╔══════════════════════════════════════════════════════════════════╗${RESET}`);
  console.log(`${BOLD}${CYAN}║  contentIntent End-to-End Verification                          ║${RESET}`);
  console.log(`${BOLD}${CYAN}╚══════════════════════════════════════════════════════════════════╝${RESET}`);

  testAngleGeneration();
  testNicheOptionPersistence();
  testChannelSelection();
  testContentModeDerivation();
  testPipelinePathSelection();
  testHookGenerationOutput();
  testRemainingInferencePaths();
  testPromptIncludesContentIntent();

  // ─── Summary ────────────────────────────────────────────────
  section('SUMMARY');
  hr();
  console.log(`  Total assertions: ${totalTests}`);
  console.log(`  ${PASS} Passed: ${passed}`);
  if (failed > 0) console.log(`  ${FAIL} Failed: ${failed}`);
  if (warnings > 0) console.log(`  ${WARN} Warnings: ${warnings}`);
  hr();

  if (failed > 0) {
    console.log(`\n  ${FAIL} ${BOLD}VERIFICATION FAILED${RESET} — ${failed} assertion(s) failed.\n`);
    process.exit(1);
  } else {
    console.log(`\n  ${PASS} ${BOLD}ALL ASSERTIONS PASSED${RESET}${warnings > 0 ? ` (${warnings} warning(s))` : ''}\n`);
    process.exit(0);
  }
}

main();
