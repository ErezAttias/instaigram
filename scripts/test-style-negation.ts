import { register } from 'tsconfig-paths';
import { resolve } from 'path';
register({ baseUrl: resolve(__dirname, '..'), paths: { '@/*': ['./src/*'] } });

import { auditPromptStyle } from '@/lib/validation/style-validator';

// Test 1: 'no futuristic elements' should NOT trigger
const r1 = auditPromptStyle(
  'ancient stone temple with torchlight. Shot like documentary. no futuristic elements. no fantasy aesthetics',
  'mythology'
);
console.log(`Test 1 (negation phrase): passed=${r1.passed} violations=${r1.violations.length}`);

// Test 2: actual 'futuristic' in positive context SHOULD trigger
const r2 = auditPromptStyle(
  'a futuristic neon-lit temple with hologram projections',
  'mythology'
);
console.log(`Test 2 (positive use):    passed=${r2.passed} violations=${r2.violations.length}`);

// Test 3: 'never show futuristic' should NOT trigger
const r3 = auditPromptStyle(
  'ancient weathered ruins. never show futuristic or modern elements. dramatic firelight',
  'mythology'
);
console.log(`Test 3 (never phrase):    passed=${r3.passed} violations=${r3.violations.length}`);

// Test 4: 'avoid sci-fi' should NOT trigger
const r4 = auditPromptStyle(
  'stone carvings in dim cave. avoid sci-fi aesthetics. natural torchlight only',
  'history'
);
console.log(`Test 4 (avoid phrase):    passed=${r4.passed} violations=${r4.violations.length}`);

// Test 5: real grounding directive from mythology style-lock
const r5 = auditPromptStyle(
  'ancient carved stone columns with firelight. Shot like a cinematic archaeological documentary. Everything in frame is ancient, physical, and weathered by time. Stone, bronze, clay, fire — no magical effects, no fantasy aesthetics, no futuristic elements. The drama comes from scale, age, and natural light on ancient surfaces.',
  'mythology'
);
console.log(`Test 5 (full grounding):  passed=${r5.passed} violations=${r5.violations.length}`);

const allPassed = r1.passed && !r2.passed && r3.passed && r4.passed && r5.passed;
console.log(allPassed ? '\n✅ ALL TESTS PASSED' : '\n❌ SOME TESTS FAILED');
process.exit(allPassed ? 0 : 1);
