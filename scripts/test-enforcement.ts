/**
 * Enforcement Validation Test — exercises all new validators
 * against realistic carousel data for 3 topics.
 *
 * Run: npx tsx --tsconfig tsconfig.json scripts/test-enforcement.ts
 */

import { register } from 'tsconfig-paths';
import { resolve } from 'path';

// Register tsconfig paths so @/* imports work
register({
  baseUrl: resolve(__dirname, '..'),
  paths: { '@/*': ['./src/*'] },
});

import { validateRoleContent, getCTAFailures } from '@/lib/validation/role-content-validator';
import { extractVisualAttributes, quickVisualTruthCheck } from '@/lib/validation/visual-truth-validator';
import { auditPromptStyle } from '@/lib/validation/style-validator';
import { quickTextCheck } from '@/lib/validation/image-text-detector';
import { runPreRenderGate, runApprovalGate } from '@/lib/validation/carousel-enforcement';

// ─── Helpers ────────────────────────────────────────────────────

let passCount = 0;
let failCount = 0;

function assert(condition: boolean, label: string) {
  if (condition) {
    passCount++;
    console.log(`  ✅ ${label}`);
  } else {
    failCount++;
    console.log(`  ❌ ${label}`);
  }
}

function section(title: string) {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  ${title}`);
  console.log('═'.repeat(60));
}

function subsection(title: string) {
  console.log(`\n  ── ${title} ──`);
}

// ─── Test Data: Greek Gods Carousel (has known failures) ────────

const greekGodsSlides_BAD = [
  {
    slideNumber: 0,
    role: 'OPENER',
    headline: 'The Duality of Greek Gods',
    body: 'Discover the hidden power and energy of the ancient pantheon',
    supportingDetail: null,
    factType: null,
    containsNumber: false,
    topicEntity: null,
  },
  {
    slideNumber: 1,
    role: 'FACT',
    headline: 'Zeus Embodied the Balance of Power and Justice',
    body: 'The king of the gods represented the cosmic duality between order and chaos. His energy permeated all of Olympus, creating a harmony that sustained the divine balance of the universe.',
    supportingDetail: null,
    factType: 'mechanism',
    containsNumber: false,
    topicEntity: 'Zeus',
  },
  {
    slideNumber: 2,
    role: 'FACT',
    headline: 'Athena Was Born From Zeus\'s Forehead Fully Armored',
    body: 'According to Hesiod\'s Theogony (c. 700 BCE), Zeus swallowed Athena\'s mother Metis while pregnant. Hephaestus later split Zeus\'s skull with an axe, and Athena emerged fully grown in bronze armor. The ancient Greeks celebrated this with the Panathenaea festival every 4 years.',
    supportingDetail: 'Hesiod, Theogony, lines 886-900',
    factType: 'historical',
    containsNumber: true,
    topicEntity: 'Athena',
  },
  {
    slideNumber: 3,
    role: 'FACT',
    headline: 'Poseidon Could Cause Earthquakes by Striking the Ground',
    body: 'Ancient Greeks attributed earthquakes to Poseidon\'s trident. The temple at Sounion, built in 444 BCE on a cliff 60 meters above the Aegean Sea, was dedicated to appease his destructive power. Sailors would throw horses into the sea as offerings before long voyages.',
    supportingDetail: 'Temple of Poseidon, Cape Sounion, 444 BCE',
    factType: 'historical',
    containsNumber: true,
    topicEntity: 'Poseidon',
  },
  {
    slideNumber: 4,
    role: 'FACT',
    headline: 'Cerberus Had Three Heads But Also a Serpent Tail',
    body: 'Hesiod described Cerberus as having 50 heads, though later tradition settled on three. The serpent-tailed guard dog of the underworld was one of Echidna\'s children. Heracles captured Cerberus as his 12th labor — the only mortal to bring the beast to the surface and return it alive.',
    supportingDetail: 'Apollodorus, Library 2.5.12',
    factType: 'example',
    containsNumber: true,
    topicEntity: 'Cerberus',
  },
  {
    slideNumber: 5,
    role: 'CTA',
    headline: 'The Ancient World Holds Infinite Mysteries',
    body: 'These divine stories reveal the timeless energy and balance of civilization',
    supportingDetail: null,
    factType: null,
    containsNumber: false,
    topicEntity: null,
  },
];

const greekGodsSlides_GOOD = [
  {
    slideNumber: 0,
    role: 'OPENER',
    headline: 'Cerberus Had 50 Heads — Then the Greeks Changed Their Mind',
    body: '',
    supportingDetail: null,
    factType: null,
    containsNumber: true,
    topicEntity: 'Cerberus',
  },
  {
    slideNumber: 1,
    role: 'FACT',
    headline: 'Athena Was Born From Zeus\'s Forehead Fully Armored',
    body: 'According to Hesiod\'s Theogony (c. 700 BCE), Zeus swallowed Athena\'s mother Metis while pregnant. Hephaestus later split Zeus\'s skull with an axe, and Athena emerged fully grown in bronze armor. The ancient Greeks celebrated this with the Panathenaea festival every 4 years.',
    supportingDetail: 'Hesiod, Theogony, lines 886-900',
    factType: 'historical',
    containsNumber: true,
    topicEntity: 'Athena',
  },
  {
    slideNumber: 2,
    role: 'FACT',
    headline: 'Poseidon\'s Temple Sat 60 Meters Above the Sea to Calm Earthquakes',
    body: 'Ancient Greeks attributed earthquakes to Poseidon\'s trident. The temple at Sounion, built in 444 BCE on a cliff 60 meters above the Aegean Sea, was dedicated to appease his strikes. Sailors would throw horses into the sea as offerings before long voyages across the Mediterranean.',
    supportingDetail: 'Temple of Poseidon, Cape Sounion, 444 BCE',
    factType: 'historical',
    containsNumber: true,
    topicEntity: 'Poseidon',
  },
  {
    slideNumber: 3,
    role: 'FACT',
    headline: 'Hesiod Gave Cerberus 50 Heads — Later Artists Settled on Three',
    body: 'The original Theogony described a 50-headed beast guarding the underworld. By the 5th century BCE, Attic pottery consistently depicted three heads. The serpent-tailed guard dog was one of Echidna\'s children. Heracles captured Cerberus as his 12th labor — the only mortal to bring it above ground alive.',
    supportingDetail: 'Apollodorus, Library 2.5.12',
    factType: 'comparison',
    containsNumber: true,
    topicEntity: 'Cerberus',
  },
  {
    slideNumber: 4,
    role: 'FACT',
    headline: 'Ares Was Tried for Murder — in the First Court Case in Greek Myth',
    body: 'When Poseidon\'s son Halirrhothius assaulted Ares\'s daughter, Ares killed him. The gods convened a trial on a hill in Athens — the Areopagus — named after Ares himself. He was acquitted. This mythological trial became the basis for Athenian homicide law in the 5th century BCE.',
    supportingDetail: 'Euripides, Electra, lines 1258-1263',
    factType: 'mechanism',
    containsNumber: true,
    topicEntity: 'Ares',
  },
  {
    slideNumber: 5,
    role: 'CTA',
    headline: 'Save This Before Your Feed Buries It',
    body: 'Follow for more myths the textbooks left out',
    supportingDetail: null,
    factType: null,
    containsNumber: false,
    topicEntity: null,
  },
];

// ─── Test Data: Animal Myths Carousel ───────────────────────────

const animalMythsSlides = [
  {
    slideNumber: 0,
    role: 'OPENER',
    headline: 'Goldfish Have a 3-Second Memory — Or Do They?',
    body: 'Science says otherwise',
    supportingDetail: null,
    factType: null,
    containsNumber: false,
    topicEntity: 'Goldfish',
  },
  {
    slideNumber: 1,
    role: 'FACT',
    headline: 'Goldfish Remember for at Least 5 Months',
    body: 'Researchers at Plymouth University trained goldfish to push a lever for food, then removed the lever. Five months later, the same fish immediately returned to lever-pushing when it was reintroduced. Their spatial memory rivals that of many mammals studied under similar conditions.',
    supportingDetail: 'Warburton, 2003, Applied Animal Behaviour Science',
    factType: 'statistic',
    containsNumber: true,
    topicEntity: 'Goldfish',
  },
  {
    slideNumber: 2,
    role: 'FACT',
    headline: 'Bulls Are Actually Colorblind to Red',
    body: 'Bulls charge the matador\'s cape because of the movement, not the color. Cattle have dichromatic vision — they lack the red-sensitive cones humans have. Experiments at Cal State showed bulls charged white, blue, and red capes equally when waved. Static red capes were ignored entirely.',
    supportingDetail: 'MythBusters S5E11, confirmed by UC Davis veterinary studies',
    factType: 'mechanism',
    containsNumber: false,
    topicEntity: 'Bulls',
  },
  {
    slideNumber: 3,
    role: 'FACT',
    headline: 'Ostriches Don\'t Actually Bury Their Heads in Sand',
    body: 'This myth traces back to Pliny the Elder (77 CE). Ostriches dig shallow holes for their eggs and turn them with their beaks — from a distance, the head appears "buried." In reality, ostriches sprint at 70 km/h when threatened. They\'re the fastest two-legged animal alive.',
    supportingDetail: 'Pliny, Natural History, Book X',
    factType: 'historical',
    containsNumber: true,
    topicEntity: 'Ostriches',
  },
  {
    slideNumber: 4,
    role: 'FACT',
    headline: 'Lemmings Don\'t Commit Mass Suicide',
    body: 'The myth was fabricated by Disney\'s 1958 documentary "White Wilderness." Filmmakers purchased lemmings in Manitoba, transported them to Alberta, and manually herded them off a cliff for the camera. The species shown (brown lemmings) don\'t even live near cliffs in the wild.',
    supportingDetail: 'CBC investigation, 1982; Woodford, "White Wilderness Controversy"',
    factType: 'example',
    containsNumber: true,
    topicEntity: 'Lemmings',
  },
  {
    // BAD CTA — no action verb, introduces new fact
    slideNumber: 5,
    role: 'CTA',
    headline: 'Nature Is Full of Surprising Truths',
    body: 'Over 47 common animal beliefs have been scientifically debunked since 2001',
    supportingDetail: null,
    factType: null,
    containsNumber: false,
    topicEntity: null,
  },
];

// ─── Test Data: History — Roman Engineering ─────────────────────

const historySlides = [
  {
    slideNumber: 0,
    role: 'OPENER',
    headline: 'Roman Concrete Lasts 2,000 Years — Modern Concrete Crumbles in 50',
    body: '',
    supportingDetail: null,
    factType: null,
    containsNumber: true,
    topicEntity: 'Roman concrete',
  },
  {
    slideNumber: 1,
    role: 'FACT',
    headline: 'Seawater Made Roman Concrete Stronger Over Time',
    body: 'MIT researchers discovered in 2017 that Roman marine concrete contains aluminous tobermorite — a mineral that crystallizes when seawater seeps through volcanic ash. Modern Portland cement degrades in saltwater. Roman harbor walls at Caesarea Maritima (22 BCE) are still structurally sound after 2,000+ years.',
    supportingDetail: 'Jackson et al., American Mineralogist, 2017',
    factType: 'mechanism',
    containsNumber: true,
    topicEntity: 'Roman concrete',
  },
  {
    slideNumber: 2,
    role: 'FACT',
    headline: 'The Pantheon\'s Dome Is Still the Largest Unreinforced Concrete Dome',
    body: 'Built in 125 CE under Hadrian, the Pantheon\'s dome spans 43.3 meters — wider than the dome of St. Peter\'s Basilica. The builders varied the aggregate from heavy basalt at the base to lightweight pumice at the oculus. No steel rebar. No polymer additives. It\'s lasted 1,900 years.',
    supportingDetail: '43.3m span, completed 125 CE',
    factType: 'statistic',
    containsNumber: true,
    topicEntity: 'Pantheon',
  },
  {
    slideNumber: 3,
    role: 'FACT',
    headline: 'Rome\'s Sewers From 600 BCE Still Drain the City Today',
    body: 'The Cloaca Maxima, built under Tarquinius Priscus around 600 BCE, originally drained the marshy Forum valley. Upgraded multiple times, its stone arches still channel stormwater through central Rome. At its widest point, the tunnel is 3.2 meters across — large enough to row a boat through.',
    supportingDetail: 'Lanciani, "The Ruins and Excavations of Ancient Rome," 1897',
    factType: 'historical',
    containsNumber: true,
    topicEntity: 'Cloaca Maxima',
  },
  {
    slideNumber: 4,
    role: 'FACT',
    headline: 'Roman Roads Used a 4-Layer System That Highways Still Imitate',
    body: 'The Via Appia (312 BCE) was built with statumen (foundation stones), rudus (gravel), nucleus (cement-like layer), and summa crusta (fitted paving stones). Modern highway construction follows a near-identical layered approach. Sections of the Via Appia are still drivable after 2,300 years.',
    supportingDetail: 'Vitruvius, De Architectura, Book 7',
    factType: 'comparison',
    containsNumber: true,
    topicEntity: 'Via Appia',
  },
  {
    slideNumber: 5,
    role: 'CTA',
    headline: 'Follow for Engineering That Outlasted Empires',
    body: 'Save this — more ancient tech drops weekly',
    supportingDetail: null,
    factType: null,
    containsNumber: false,
    topicEntity: null,
  },
];

// ─── Test Execution ─────────────────────────────────────────────

function testRoleContentValidator() {
  section('1. ROLE-CONTENT VALIDATOR');

  subsection('Greek Gods BAD carousel');
  const badReport = validateRoleContent(greekGodsSlides_BAD);
  assert(!badReport.passed, 'BAD carousel should FAIL role-content validation');
  assert(badReport.failures.length > 0, `Found ${badReport.failures.length} failure(s)`);

  const ctaFails = getCTAFailures(badReport);
  assert(ctaFails.length > 0, `CTA failures detected: ${ctaFails.length}`);
  for (const f of badReport.failures) {
    console.log(`    → Slide ${f.slideIndex + 1} (${f.role}): ${f.rule}`);
  }

  subsection('Greek Gods GOOD carousel');
  const goodReport = validateRoleContent(greekGodsSlides_GOOD);
  assert(goodReport.passed, 'GOOD carousel should PASS role-content validation');
  if (!goodReport.passed) {
    for (const f of goodReport.failures) {
      console.log(`    → Slide ${f.slideIndex + 1} (${f.role}): ${f.rule} — ${f.detail}`);
    }
  }

  subsection('Animal Myths carousel (bad CTA)');
  const animalReport = validateRoleContent(animalMythsSlides);
  assert(!animalReport.passed, 'Animal myths should FAIL (bad CTA)');
  const animalCTA = getCTAFailures(animalReport);
  assert(animalCTA.length > 0, `CTA failures: ${animalCTA.length}`);
  for (const f of animalReport.failures) {
    console.log(`    → Slide ${f.slideIndex + 1} (${f.role}): ${f.rule}`);
  }

  subsection('History carousel (good CTA)');
  const histReport = validateRoleContent(historySlides);
  assert(histReport.passed, 'History carousel should PASS');
  if (!histReport.passed) {
    for (const f of histReport.failures) {
      console.log(`    → Slide ${f.slideIndex + 1} (${f.role}): ${f.rule} — ${f.detail}`);
    }
  }
}

function testVisualTruthExtraction() {
  section('2. VISUAL TRUTH — ATTRIBUTE EXTRACTION');

  subsection('Three-headed creature');
  const attrs1 = extractVisualAttributes(
    'Cerberus Had Three Heads But Also a Serpent Tail',
    'The three-headed guard dog of the underworld',
    'Cerberus',
  );
  assert(attrs1.length > 0, `Extracted ${attrs1.length} attribute(s)`);
  const countAttrs = attrs1.filter(a => a.type === 'count');
  assert(countAttrs.length > 0, `Count attributes found: ${countAttrs.map(a => a.claim).join(', ')}`);
  const highPriority = attrs1.filter(a => a.priority === 'high');
  assert(highPriority.length > 0, `High-priority attributes: ${highPriority.length}`);
  for (const a of attrs1) {
    console.log(`    → [${a.priority}] ${a.type}: "${a.claim}"`);
  }

  subsection('Golden fur + blue eyes');
  const attrs2 = extractVisualAttributes(
    'The Golden Eagle Has Blue-Tipped Feathers',
    'Golden fur on the neck with blue feathers on the wings',
  );
  assert(attrs2.length >= 2, `Extracted ${attrs2.length} attribute(s)`);
  const colorAttrs = attrs2.filter(a => a.type === 'color');
  assert(colorAttrs.length >= 2, `Color attributes: ${colorAttrs.map(a => a.claim).join(', ')}`);

  subsection('No visual attributes in abstract text');
  const attrs3 = extractVisualAttributes(
    'The Power of Ancient Civilizations',
    'The hidden truth about the energy and balance of the cosmos',
  );
  assert(attrs3.length === 0, `Abstract text yields ${attrs3.length} attributes (should be 0)`);

  subsection('Prompt mismatch detection');
  const check1 = quickVisualTruthCheck(
    'Cerberus Had Three Heads',
    'The three-headed guard dog',
    'a dog standing in a dark cave, dramatic lighting, cinematic',
  );
  assert(!check1.passed, 'Should detect mismatch: text says "three heads" but prompt has no count');
  for (const m of check1.mismatches) {
    console.log(`    → ${m}`);
  }

  const check2 = quickVisualTruthCheck(
    'Cerberus Had Three Heads',
    'The three-headed guard dog',
    'a three-headed dog standing in a dark underworld cave, 3 heads visible',
  );
  assert(check2.passed, 'Should pass: prompt includes the count');
}

function testStyleValidator() {
  section('3. STYLE VALIDATOR — PROMPT AUDIT');

  subsection('Mythology: sci-fi elements should be rejected');
  const myth1 = auditPromptStyle(
    'a futuristic neon-lit temple with hologram projections of Zeus, cyberpunk aesthetic',
    'mythology',
  );
  assert(!myth1.passed, 'Sci-fi mythology prompt should FAIL');
  assert(myth1.violations.length > 0, `Found ${myth1.violations.length} violation(s)`);
  for (const v of myth1.violations) {
    console.log(`    → [${v.severity}] ${v.element}: ${v.detail}`);
  }

  subsection('Mythology: ancient stone temple should pass');
  const myth2 = auditPromptStyle(
    'an ancient weathered stone temple with torchlight casting shadows on carved columns, archaeological photography',
    'mythology',
  );
  assert(myth2.passed, 'Ancient stone prompt should PASS for mythology');

  subsection('History: futuristic elements should be rejected');
  const hist1 = auditPromptStyle(
    'a Roman aqueduct rendered in futuristic neon wireframe, sci-fi hologram overlay',
    'history',
  );
  assert(!hist1.passed, 'Sci-fi history prompt should FAIL');
  for (const v of hist1.violations) {
    console.log(`    → [${v.severity}] ${v.element}: ${v.detail}`);
  }

  subsection('History: period-accurate prompt should pass');
  const hist2 = auditPromptStyle(
    'a weathered Roman aqueduct in golden hour light, archaeological documentary photography, stone arches covered in moss',
    'history',
  );
  assert(hist2.passed, 'Period-accurate history prompt should PASS');

  subsection('Animals: anthropomorphic should be rejected');
  const anim1 = auditPromptStyle(
    'an anthropomorphic goldfish wearing a suit, cartoon style, neon background',
    'animals',
  );
  assert(!anim1.passed, 'Anthropomorphic animal prompt should FAIL');
  for (const v of anim1.violations) {
    console.log(`    → [${v.severity}] ${v.element}: ${v.detail}`);
  }

  subsection('Animals: natural wildlife should pass');
  const anim2 = auditPromptStyle(
    'a goldfish in a clear aquarium, natural light, sharp detail, shallow depth of field',
    'animals',
  );
  assert(anim2.passed, 'Natural wildlife prompt should PASS');

  subsection('Tech domain: no violations in correct prompt');
  const tech1 = auditPromptStyle(
    'a server rack in a dark data center, LED indicator lights, cable management, documentary photography',
    'tech',
  );
  assert(tech1.passed, 'Tech-appropriate prompt should PASS');

  subsection('Unknown domain: should pass by default');
  const unknown = auditPromptStyle(
    'a futuristic hologram in neon space',
    'cooking',
  );
  assert(unknown.passed, 'Unknown domain should pass (no rules)');
}

function testTextInImageDetector() {
  section('4. TEXT-IN-IMAGE — QUICK HEURISTIC');

  subsection('Prompt with text instructions should flag');
  assert(quickTextCheck('write the word ZEUS on the stone'), 'Should detect "write the word"');
  assert(quickTextCheck('display text showing the title'), 'Should detect "display text"');
  assert(quickTextCheck('include text overlay on the image'), 'Should detect "include text"');

  subsection('Clean prompts should pass');
  assert(!quickTextCheck('a stone temple with dramatic lighting'), 'Clean prompt should not flag');
  assert(!quickTextCheck('a golden eagle in flight, telephoto lens'), 'Clean prompt should not flag');
}

function testPreRenderGate() {
  section('5. PRE-RENDER GATE (INTEGRATED)');

  subsection('Greek Gods BAD carousel');
  const badGate = runPreRenderGate(greekGodsSlides_BAD);
  assert(!badGate.passed, 'BAD carousel should fail pre-render gate');
  assert(badGate.ctaFailures.length > 0, `CTA failures for auto-regen: ${badGate.ctaFailures.length}`);
  console.log(`    Total failures: ${badGate.failures.length}`);
  for (const f of badGate.failures) {
    console.log(`    → [${f.category}] Slide ${f.slideIndex + 1}: ${f.rule}`);
  }

  subsection('Greek Gods GOOD carousel');
  const goodGate = runPreRenderGate(greekGodsSlides_GOOD);
  assert(goodGate.passed, 'GOOD carousel should pass pre-render gate');

  subsection('Animal Myths (bad CTA) carousel');
  const animalGate = runPreRenderGate(animalMythsSlides);
  assert(!animalGate.passed, 'Animal myths should fail (bad CTA)');
  assert(animalGate.ctaFailures.length > 0, 'CTA auto-regen should be triggered');

  subsection('History (all good) carousel');
  const histGate = runPreRenderGate(historySlides);
  assert(histGate.passed, 'History carousel should pass pre-render gate');

  subsection('Pre-render gate with prompt style audit');
  const mythGateWithPrompts = runPreRenderGate(greekGodsSlides_GOOD, [
    { slideIndex: 0, prompt: 'a futuristic neon temple with hologram of Cerberus, cyberpunk', topicDomain: 'mythology' },
    { slideIndex: 1, prompt: 'a weathered stone carving of Athena, torchlight, ancient', topicDomain: 'mythology' },
  ]);
  assert(!mythGateWithPrompts.passed, 'Should fail: sci-fi prompt for mythology topic');
  const styleFailures = mythGateWithPrompts.failures.filter(f => f.category === 'style');
  assert(styleFailures.length > 0, `Style failures in prompt: ${styleFailures.length}`);
  for (const f of styleFailures) {
    console.log(`    → [${f.category}] Slide ${f.slideIndex + 1}: ${f.detail}`);
  }
}

function testApprovalGate() {
  section('6. APPROVAL GATE');

  subsection('BAD carousel should be BLOCKED at approval');
  const badApproval = runApprovalGate(greekGodsSlides_BAD);
  assert(!badApproval.approved, 'BAD carousel approval should be BLOCKED');
  console.log(`    Blocked with ${badApproval.failures.length} failure(s):`);
  for (const f of badApproval.failures) {
    console.log(`    → [${f.category}] Slide ${f.slideIndex + 1}: ${f.rule}`);
  }
  console.log(`    Summary: ${badApproval.summary.passedSlides} passed, ${badApproval.summary.failedSlides} failed`);

  subsection('GOOD carousel should be APPROVED');
  const goodApproval = runApprovalGate(greekGodsSlides_GOOD);
  assert(goodApproval.approved, 'GOOD carousel should be APPROVED');
  console.log(`    Summary: ${goodApproval.summary.passedSlides}/${goodApproval.summary.totalSlides} passed`);

  subsection('History carousel should be APPROVED');
  const histApproval = runApprovalGate(historySlides);
  assert(histApproval.approved, 'History carousel should be APPROVED');
}

// ─── Failure Scenario Summary ───────────────────────────────────

function testFailureScenarioSummary() {
  section('7. ORIGINAL GREEK GODS FAILURE SCENARIOS');

  console.log('\n  Checking if the enforcement layer now catches the exact');
  console.log('  failures from the original Greek gods run:\n');

  // Failure 1: CTA had no action verb
  subsection('F1: CTA with no action verb');
  const ctaReport = validateRoleContent([greekGodsSlides_BAD[5]]);
  const hasActionVerbFail = ctaReport.failures.some(f => f.rule === 'CTA_REQUIRES_ACTION_VERB');
  assert(hasActionVerbFail, 'Catches CTA missing action verb');

  // Failure 2: CTA introduced new factual content
  subsection('F2: CTA introducing facts (animal myths)');
  const ctaFactReport = validateRoleContent([animalMythsSlides[5]]);
  const hasFactFail = ctaFactReport.failures.some(f => f.rule === 'CTA_NO_NEW_FACTS');
  assert(hasFactFail, 'Catches CTA introducing new factual content');

  // Failure 3: Vague abstract language ("duality", "energy", "balance")
  subsection('F3: Vague language in OPENER and FACT');
  const openerReport = validateRoleContent([greekGodsSlides_BAD[0]]);
  const openerFailed = !openerReport.passed;
  assert(openerFailed, 'Catches vague OPENER ("The Duality of Greek Gods")');

  const factReport = validateRoleContent([greekGodsSlides_BAD[1]]);
  const factFailed = !factReport.passed;
  assert(factFailed, 'Catches vague FACT about "cosmic duality" and "energy"');
  console.log(`    FACT slide 1 failures: ${factReport.failures.length}`);
  for (const f of factReport.failures) {
    console.log(`    → ${f.rule}: ${f.detail}`);
  }

  // Failure 3b: Abstract mythic phrases
  subsection('F3b: Abstract mythic phrases');
  const mythicSlide = {
    slideNumber: 0, role: 'FACT',
    headline: 'Hermes Was More Than Light',
    body: 'Hermes guided the souls of the dead through the underworld. He represented the power and duality between life and death, embodied the spirit of the divine messenger.',
    factType: 'mechanism', containsNumber: false, topicEntity: 'Hermes',
  };
  const mythicReport = validateRoleContent([mythicSlide]);
  assert(!mythicReport.passed, 'Catches "guided the souls" + "embodied the spirit"');
  for (const f of mythicReport.failures) {
    console.log(`    → ${f.rule}: ${f.detail}`);
  }

  const concreteSlide = {
    slideNumber: 0, role: 'FACT',
    headline: 'Hermes Had Winged Sandals Made by Hephaestus',
    body: 'According to Homer, Hermes guided 3,000 souls to the underworld each year. His sandals, crafted by Hephaestus, were made of imperishable gold.',
    factType: 'historical', containsNumber: true, topicEntity: 'Hermes',
  };
  const concreteReport = validateRoleContent([concreteSlide]);
  assert(concreteReport.passed, 'Allows "guided 3,000 souls" (concrete number anchors it)');

  // Failure 4: Sci-fi visuals for mythology topic
  subsection('F4: Sci-fi image prompt for mythology');
  const styleCheck = auditPromptStyle(
    'a futuristic holographic display showing Zeus with neon lightning, cyberpunk temple',
    'mythology',
  );
  assert(!styleCheck.passed, 'Catches sci-fi elements in mythology');
  assert(styleCheck.shouldRegenerate, 'Triggers image regeneration');

  // Failure 5: Text visible in generated image
  subsection('F5: Text in image prompt leakage');
  const textCheck = quickTextCheck('write "ZEUS" on the temple wall in glowing letters');
  assert(textCheck, 'Catches text-rendering instructions in prompt');

  // Failure 6: Image count mismatch (three-headed but shows two)
  subsection('F6: Visual truth — count mismatch');
  const truthCheck = quickVisualTruthCheck(
    'Cerberus Had Three Heads',
    'The three-headed guard dog of the underworld',
    'a large dog in a dark cave, two glowing eyes, dramatic rim lighting',
  );
  assert(!truthCheck.passed, 'Catches prompt missing "three heads" count');
  for (const m of truthCheck.mismatches) {
    console.log(`    → ${m}`);
  }
}

// ─── Run All Tests ──────────────────────────────────────────────

console.log('\n' + '█'.repeat(60));
console.log('  ENFORCEMENT VALIDATION TEST');
console.log('  Testing all new validators against 3 topic carousels');
console.log('█'.repeat(60));

testRoleContentValidator();
testVisualTruthExtraction();
testStyleValidator();
testTextInImageDetector();
testPreRenderGate();
testApprovalGate();
testFailureScenarioSummary();

// ─── Final Summary ──────────────────────────────────────────────

section('FINAL RESULTS');
console.log(`\n  ✅ Passed: ${passCount}`);
console.log(`  ❌ Failed: ${failCount}`);
console.log(`  Total:   ${passCount + failCount}`);
console.log(`\n  ${failCount === 0 ? '🟢 ALL CHECKS PASSED' : `🔴 ${failCount} CHECK(S) FAILED`}\n`);

process.exit(failCount > 0 ? 1 : 0);
