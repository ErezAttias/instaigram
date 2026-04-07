/**
 * Distortion / Visual Tension Engine
 *
 * Injects ONE bold, immediately visible visual inconsistency as the
 * PRIMARY FOCAL POINT of the image. The distortion IS the image.
 *
 * Placement rules:
 *   - Must be on the SUBJECT: face, hands, or the object they touch
 *   - Must be visible within 0.5 seconds of viewing
 *   - Must be the first thing the eye lands on
 *   - Must have high contrast against the rest of the scene
 *   - All other scene elements exist to support the distortion
 *
 * Distortion types:
 *   1. physical-inconsistency  — the subject's body or held object is in a wrong state
 *   2. reflection-mismatch     — the subject's reflection contradicts reality
 *   3. temporal-tension        — the subject is frozen at the peak moment of an action
 *   4. scale-imbalance         — the subject or their hands are in wrong proportion
 *
 * Only ONE distortion per image. Physically plausible. No surrealism.
 */

import type { TopicDomain, HeadlineTension } from './intent';

// ─── Types ───────────────────────────────────────────────────────

export type DistortionType =
  | 'physical-inconsistency'
  | 'reflection-mismatch'
  | 'temporal-tension'
  | 'scale-imbalance';

export interface Distortion {
  /** Which distortion type was selected */
  type: DistortionType;
  /** The distortion as a dominant scene directive — injected into scene text */
  sceneInjection: string;
  /** Composition directive — how the camera/framing should emphasize the distortion */
  compositionDirective: string;
  /** Why this distortion was chosen (for debugging) */
  rationale: string;
}

export interface DistortionInput {
  slideRole: string;
  tensionType: HeadlineTension['type'];
  topic: TopicDomain;
  headline?: string;
  subject?: string;
}

// ─── Role Strategies ─────────────────────────────────────────────

interface RoleStrategy {
  preferred: DistortionType[];
  intensity: 'dominant' | 'strong' | 'present';
}

const ROLE_STRATEGIES: Record<string, RoleStrategy> = {
  HOOK:        { preferred: ['reflection-mismatch', 'physical-inconsistency', 'temporal-tension', 'scale-imbalance'], intensity: 'dominant' },
  OPENER:      { preferred: ['reflection-mismatch', 'physical-inconsistency', 'temporal-tension', 'scale-imbalance'], intensity: 'dominant' },
  TWIST:       { preferred: ['physical-inconsistency', 'reflection-mismatch', 'temporal-tension'], intensity: 'dominant' },
  CTA:         { preferred: ['temporal-tension', 'scale-imbalance', 'physical-inconsistency'], intensity: 'strong' },
  IMPLICATION: { preferred: ['physical-inconsistency', 'temporal-tension', 'reflection-mismatch'], intensity: 'strong' },
  FACT:        { preferred: ['temporal-tension', 'scale-imbalance'], intensity: 'present' },
  BUILD:       { preferred: ['temporal-tension', 'scale-imbalance'], intensity: 'present' },
  SETUP:       { preferred: ['scale-imbalance', 'temporal-tension'], intensity: 'present' },
  INSIGHT:     { preferred: ['scale-imbalance', 'physical-inconsistency'], intensity: 'present' },
};

// ─── Tension Affinity ────────────────────────────────────────────

const TENSION_DISTORTION_AFFINITY: Record<HeadlineTension['type'], DistortionType[]> = {
  contrast:       ['reflection-mismatch', 'physical-inconsistency'],
  threat:         ['temporal-tension', 'physical-inconsistency'],
  revelation:     ['reflection-mismatch', 'scale-imbalance'],
  challenge:      ['physical-inconsistency', 'temporal-tension'],
  transformation: ['temporal-tension', 'reflection-mismatch'],
  neutral:        ['temporal-tension', 'scale-imbalance'],
};

// ─── Composition Directives Per Distortion Type ──────────────────

/**
 * How the camera/framing should emphasize each distortion type.
 * These ensure the distortion dominates the composition.
 */
const COMPOSITION_DIRECTIVES: Record<DistortionType, string> = {
  'physical-inconsistency': 'The inconsistent element is in sharp focus at the center of the frame. The rest of the scene is slightly softer. The eye must hit the wrong detail first.',
  'reflection-mismatch': 'Both the subject and their reflection are in the frame with equal visual weight. The contradiction between them is the composition — the image is split between reality and reflection.',
  'temporal-tension': 'The frozen moment is center-frame with razor-sharp focus. Motion blur radiates outward from the frozen point. Everything else in the scene is secondary to this instant.',
  'scale-imbalance': 'The oversized or undersized element fills the frame aggressively. The subject is composed in direct physical relationship to it — touching it, holding it, standing against it.',
};

// ─── Subject-Centered Distortion Vocabulary ──────────────────────

/**
 * Every distortion targets the SUBJECT directly:
 *   - Their face or expression
 *   - Their hands or what they hold
 *   - The object they are touching or interacting with
 *
 * Nothing in the background. Nothing environmental.
 * The distortion IS the subject.
 */

interface TopicDistortions {
  'physical-inconsistency': string[];
  'reflection-mismatch': string[];
  'temporal-tension': string[];
  'scale-imbalance': string[];
}

const TOPIC_DISTORTIONS: Record<string, TopicDistortions> = {
  tech: {
    'physical-inconsistency': [
      // ── Competence gap: output is hollow / meaningless ──
      'the subject holds a printed page of code up to their face, reading it, but the page is visibly blank on the side facing the camera — they are staring at nothing',
      'the subject\'s hands are steady on a keyboard, but every key they have pressed is visibly pushed inward and stuck — the keyboard is broken under their fingers',
      'the subject sits at a desk with a monitor showing a single blinking cursor on an otherwise empty black screen — their fingers are poised over the keyboard in typing position but the screen has produced nothing',
      'the subject holds a laptop open at chest level, presenting it toward the camera, but the screen displays only a plain white 404 error page — the machine has no answer and their face shows they expected one',
      'the subject\'s hands type on a keyboard but the monitor behind them shows the same single line of code repeated hundreds of times, filling the screen with identical useless output — the work is happening but producing nothing new',
      'the subject grips a thick stack of printed documents fanned in one hand, but every visible page is covered in redacted black bars — the work exists but its content has been emptied out, made meaningless',
      // ── Obsolescence: the human is idle / disconnected / irrelevant ──
      'the subject grips a thick bundle of severed cables in their fist, the cut ends clean and fresh, sparks still dying on the floor — they just disconnected something critical and their face shows they know it',
      'the subject stands at a whiteboard covered in handwritten diagrams and equations, but a large red X has been drawn across the entire board in a single stroke — their work has been visibly rejected',
      'the subject sits in a desk chair with their hands resting on the keyboard, but the desk itself is bare — no monitor, no screen, no machine, just the keyboard connected to nothing, the subject typing into empty air',
      'the subject holds a USB drive between their fingers at eye level, but the drive\'s connector end is visibly snapped off — the data exists but can never be delivered, the bridge between person and machine is broken',
    ],
    'reflection-mismatch': [
      'the subject faces a dark monitor, and the monitor\'s screen reflects their face clearly — but in the reflection, the subject\'s eyes are closed while their real eyes are open and alert',
      'the subject looks at their own hands, but a glass panel next to them reflects hands in a different position — fists clenched in the reflection while open and flat in reality',
      'the subject stares at a turned-off screen, but the dead screen reflects a face that is looking directly at the camera while the real subject faces away',
      // ── Obsolescence via reflection: the machine shows a different reality ──
      'the subject types at a keyboard facing a monitor, and the monitor reflects the room behind them — but in the reflection the desk chair is empty, as if the person sitting there does not exist in the machine\'s world',
      'the subject holds up their phone to take a photo of their own workstation, but the phone screen shows a clean empty desk with no computer, no papers, no sign anyone works there — the device has erased them',
    ],
    'temporal-tension': [
      'the subject\'s finger is pressing a red button or switch on a server rack, captured at the exact millisecond of contact — the button is half-depressed, the action irreversible, the subject\'s face frozen in the instant of commitment',
      'the subject is caught mid-pull of a cable from a rack, the cable taut and halfway out, a shower of tiny sparks frozen in the air around the connection point',
      // ── Competence gap: frozen moment of futile effort ──
      'the subject\'s finger hovers one millimeter above the enter key, about to submit, but the monitor behind them already shows a red error message — the result was decided before the human could act',
      'the subject is frozen mid-reach for a ringing desk phone, hand outstretched, but the phone\'s screen shows the call has already been answered by an automated system — their hand will arrive too late',
    ],
    'scale-imbalance': [
      'extreme close-up of the subject\'s hands filling the lower two-thirds of the frame, fingers spread wide across a keyboard, each fingertip in sharp detail — the subject\'s face is small and distant above, out of focus',
      'the subject holds a single tiny microchip between their thumb and forefinger at eye level, the chip pin-sharp and the subject\'s face soft behind it — the chip is the subject now',
      'the subject\'s open palm in extreme foreground, a single USB drive lying on it, the drive enormous in the frame while the server room behind the hand shrinks to miniature',
    ],
  },

  psychology: {
    'physical-inconsistency': [
      'the subject holds a glass of water at chest level and it is perfectly still, but the subject\'s knuckles are white and their forearm muscles are visibly tensed — the effort of holding still is the distortion',
      'the subject sits with perfect posture, face calm, but both hands under the table are gripping the chair seat hard enough to bend their fingers backward — only the hands betray the truth',
      'the subject faces the camera with a neutral expression, but one hand is raised to their own throat, fingers wrapped lightly around it — the gesture contradicts the calm face',
    ],
    'reflection-mismatch': [
      'the subject stands at a window, face calm and composed — but their reflection in the glass shows them with furrowed brow and mouth open as if shouting. The reflection and the person are clearly the same figure, but the expressions are opposite',
      'the subject looks down at their own hands held in front of them — but the reflection in a table surface below shows the hands covering the face, not held out. The real hands are open, the reflected hands are hiding',
      'a close-up of the subject\'s face in profile, a mirror behind them showing the other side of the same face — but the mirrored side has a visibly different expression, one side composed and one side strained',
    ],
    'temporal-tension': [
      'the subject\'s hand is frozen mid-swing toward a mirror, palm open, about to strike the glass — the hand fills the frame, the mirror is still intact, the impact has not happened yet',
      'a tear on the subject\'s cheek frozen mid-fall, caught as a perfect sphere at the jawline, lit so it glows against the dark skin — the tear is the brightest point in the frame',
      'the subject is mid-blink, eyes half-closed, captured at the exact frame where you cannot tell if they are opening or closing — the ambiguity is the distortion',
    ],
    'scale-imbalance': [
      'extreme close-up of the subject\'s eye filling most of the frame, the iris in sharp detail — and in the reflection of the eye\'s surface, the entire room they sit in is visible, tiny and curved',
      'the subject\'s two hands are the entire foreground, palms up, enormous and sharp — the rest of the body and room are small and soft behind them, as if the hands are the only real thing',
      'the subject sits in a chair that is visibly too large for them — a normal chair but the subject appears to have shrunk within it, feet not touching the floor, shoulders below the armrests',
    ],
  },

  business: {
    'physical-inconsistency': [
      'the subject holds a pen as if about to sign a document, but the pen is pressed so hard into the paper it has torn through — the point punctures the page, ink bleeding outward in a circle',
      'the subject sits at the head of a long conference table, hands flat on the surface — but their chair is pushed back a foot from the table, creating visible empty space between their body and their hands, as if they were pulled backward',
      'the subject holds a phone to their ear, face composed — but the phone is held upside down, the screen facing outward, and the subject does not seem to notice',
    ],
    'reflection-mismatch': [
      'the subject stands in an elevator with mirror-finish doors closing — the reflection shows them facing forward, but the real subject has turned to look behind them, creating two opposing orientations in one frame',
      'the subject sits at a glass desk, and their reflection in the desk surface shows them with their head in their hands — while the real subject sits upright with arms crossed',
      'the subject walks down a corridor, their shadow on the polished floor is stationary while they are clearly in motion — the shadow is planted in place',
    ],
    'temporal-tension': [
      'the subject\'s hand caught in the exact instant of releasing a stack of papers — the fingers are open, the papers have just left the hand, the stack is separating into individual sheets but has not yet scattered',
      'the subject reaches for a door handle, their fingers millimeters from the brass — the entire body is leaning forward into the reach, weight committed, but contact has not been made',
      'the subject\'s fist is frozen mid-strike on a conference table, the surface bowing visibly under the impact, objects on the table beginning to jump but not yet airborne',
    ],
    'scale-imbalance': [
      'the subject\'s hand in extreme close-up gripping a business card, the card filling half the frame with every printed character legible — the subject\'s face is a soft blur behind it, the card is more present than the person',
      'the subject stands at the base of a column in a bank lobby, the column fills the frame from floor to ceiling, the subject is pressed against it and reaches barely a third of its height',
      'the subject\'s signature on a document is in extreme close-up, the pen strokes thick and detailed — zoom out slightly and the document is on a vast, empty mahogany desk that dwarfs everything',
    ],
  },

  health: {
    'physical-inconsistency': [
      'the subject grips a barbell at full arm extension above their head, veins visible in their forearms — but one arm is locked straight while the other has a visible bend at the elbow, the imbalance obvious',
      'the subject holds a pill between their fingers at eye level, studying it — the pill casts a shadow on their face that is far larger than the pill itself should produce',
      'the subject\'s hand is wrapped in athletic tape, and one finger is taped pointing in the wrong direction — bent at an angle that reads as wrong immediately',
    ],
    'reflection-mismatch': [
      'the subject stands in front of a gym mirror, body facing forward — but the reflection shows them turned sideways, a profile view that contradicts the real pose',
      'the subject checks their pulse at the wrist, looking down — a mirror behind them shows the same pose but the reflected hand is gripping the wrist much harder, knuckles white',
    ],
    'temporal-tension': [
      'a bead of sweat on the subject\'s forehead frozen at the moment of release, a perfect lens-shaped drop pulled by gravity, the skin beneath it indented from the weight — the drop is the sharpest thing in the frame',
      'the subject\'s fist connecting with a heavy bag, the bag surface deforming into a deep crater around the fist, sweat droplets exploding outward in a frozen halo from the impact point',
    ],
    'scale-imbalance': [
      'extreme close-up of the subject\'s hands gripping a jump rope handle, filling the frame — knuckles white, veins sharp, rope taut — the subject\'s body is a soft vertical line between the two enormous hands',
      'a single syringe held up by the subject, needle in pin-sharp focus filling the center of the frame, the subject\'s face behind it reduced to soft shapes of light and shadow',
    ],
  },

  finance: {
    'physical-inconsistency': [
      'the subject signs a document with a fountain pen, but the ink flowing from the pen is red instead of black — a thick, wet, red signature being laid down while the rest of the document is in standard black print',
      'the subject holds a stack of bills fanned in one hand, but the bills are blank on the visible side — clean white paper the exact size and shape of currency, held as if valuable',
      'the subject sits at a desk with a calculator, and the display shows all zeros — a long row of zeros filling the screen, the subject staring at it',
    ],
    'reflection-mismatch': [
      'the subject counts money at a desk, and their reflection in the desk\'s glass surface shows empty hands — the money exists only in reality, not in the reflection',
      'the subject stands in a bank vault, the vault door\'s polished surface reflects the room — but the reflection shows the shelves empty while the real shelves are stacked',
    ],
    'temporal-tension': [
      'the subject\'s hand frozen mid-drop of a coin into a glass jar, the coin suspended in the air between the fingers and the jar — the moment of release, gravity not yet won',
      'the subject tearing a document in half, the paper caught mid-rip, fibers stretching between the two halves, the tear perfectly bisecting a printed paragraph',
    ],
    'scale-imbalance': [
      'extreme close-up of the subject\'s hand holding a single gold coin, the coin\'s surface filling most of the frame with stamped detail visible — the subject\'s face behind is a shadow',
      'the subject stands in a vault, the door frame enormous around them, the subject taking up only the bottom third of the doorway — the institutional scale makes them insignificant',
    ],
  },

  animals: {
    'physical-inconsistency': [
      'a predator mid-stride, every muscle taut and visible — but one paw hangs limp and relaxed while the other three are driving hard, the broken rhythm of the run immediately visible',
      'a bird of prey perched on a branch, talons gripping — but one talon holds a feather from its own wing, pulled loose, as if the bird has started taking itself apart',
      'a wolf standing alert in snow, ears forward, body ready — but its shadow on the snow behind it shows a posture of submission, head down, tail tucked',
    ],
    'reflection-mismatch': [
      'a wolf drinking from a perfectly still pool, head lowered to the water — the reflection shows the wolf\'s head raised high, ears back, teeth bared. The real wolf drinks peacefully while the reflection snarls',
      'a bird perched on a bare branch above water, motionless — its reflection in the water shows the bird mid-wingbeat, in full flight, as if the reflection escaped first',
    ],
    'temporal-tension': [
      'a hawk\'s talons in extreme close-up, frozen at the instant of closing around prey — the talons are half-shut, the prey visible between them, the kill not yet complete, every claw edge in razor focus',
      'a cobra strike frozen at maximum extension, mouth wide, fangs forward, the target centimeters away — the snake\'s body is a blur of motion but the head is frozen and pin-sharp',
    ],
    'scale-imbalance': [
      'extreme close-up of a predator\'s eye filling the frame, iris detail visible, the slit pupil razor-sharp — and reflected in the glossy surface of the eye, a tiny human silhouette stares back',
      'a single paw print in mud, perfectly formed, filling the bottom half of the frame — and in the distance, the animal itself is small, walking away, the track bigger than the creature seems',
    ],
  },

  science: {
    'physical-inconsistency': [
      'the subject holds a test tube up to the light, the liquid inside is stratified into three distinct colored layers — but the top layer is heavier than the bottom, the densities are visibly inverted',
      'the subject peers through a microscope, one eye on the lens — the other eye, visible to the camera, is wide open and dilated far wider than normal, the pupil enormous',
    ],
    'reflection-mismatch': [
      'the subject\'s safety goggles reflect a chalkboard behind them, and the reflected equations are different from the ones actually written — the reflection shows a crossed-out answer',
    ],
    'temporal-tension': [
      'a glass beaker falling from the subject\'s hand, caught mid-air with the liquid inside forming a perfect frozen column rising above the rim as it drops — the subject\'s fingers still in the shape of holding it',
      'the subject\'s hand pulling a specimen slide from under a microscope, the slide caught at the exact angle where it catches the light and the specimen is magnified by the glass — visible to the naked eye for one instant',
    ],
    'scale-imbalance': [
      'the subject holds a petri dish up to camera level, the dish fills the frame with its contents in sharp detail — the subject\'s face behind is an out-of-focus presence, the specimen is the subject now',
    ],
  },

  education: {
    'physical-inconsistency': [
      'the subject holds an open book but their eyes are staring over the top edge of the pages, looking directly at the camera — the book is a barrier between them and the viewer, not a thing being read',
      'the subject\'s pen is pressed to paper, and the line they are writing trails off the edge of the page onto the desk surface — they kept writing past the paper and didn\'t notice',
    ],
    'reflection-mismatch': [
      'the subject reads at a desk by a window, and the window reflects them — but in the reflection, the book is closed on the desk and the subject is staring out into the dark',
    ],
    'temporal-tension': [
      'the subject\'s pencil just snapped under pressure, the two halves separating, a puff of graphite dust frozen in the air between the broken ends — the force of concentration made visible',
    ],
    'scale-imbalance': [
      'extreme close-up of the subject\'s eyes, enormous, pin-sharp — reflected in both pupils is the same page of text, tiny and curved, the entire world reduced to what they are reading',
    ],
  },

  general: {
    'physical-inconsistency': [
      'the subject holds or touches one object that is in a visibly wrong state — broken, empty, inverted, or still where it should be moving. The wrongness is on the subject, not in the background',
    ],
    'reflection-mismatch': [
      'the subject and their reflection (in glass, water, metal, or screen) are both visible and both sharp — but the reflection shows a different action, expression, or posture than reality',
    ],
    'temporal-tension': [
      'the subject\'s hands are frozen at the peak instant of an irreversible action — breaking, releasing, catching, striking. The moment is center-frame and everything else is secondary',
    ],
    'scale-imbalance': [
      'the subject\'s hands or a held object fill most of the frame in extreme close-up and sharp focus, while the subject\'s face and body are small and soft behind — the detail overwhelms the person',
    ],
  },
};

// ─── Selection Logic ─────────────────────────────────────────────

function selectDistortionType(
  role: string,
  tensionType: HeadlineTension['type'],
): DistortionType {
  const roleStrategy = ROLE_STRATEGIES[role] ?? ROLE_STRATEGIES.HOOK;
  const tensionAffinity = TENSION_DISTORTION_AFFINITY[tensionType] ?? TENSION_DISTORTION_AFFINITY.neutral;

  for (const rolePref of roleStrategy.preferred) {
    if (tensionAffinity.includes(rolePref)) {
      return rolePref;
    }
  }
  return roleStrategy.preferred[0];
}

function selectDistortionVariant(
  type: DistortionType,
  topic: TopicDomain,
  headline?: string,
): string {
  const topicDistortions = TOPIC_DISTORTIONS[topic] ?? TOPIC_DISTORTIONS.general;
  const variants = topicDistortions[type];

  if (!variants || variants.length === 0) {
    return TOPIC_DISTORTIONS.general[type][0];
  }

  const hash = simpleHash(headline ?? 'default');
  return variants[hash % variants.length];
}

function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash = hash & hash;
  }
  return Math.abs(hash);
}

// ─── Main Builder ────────────────────────────────────────────────

/**
 * Build a visual distortion for a slide.
 *
 * The distortion is the PRIMARY FOCAL POINT of the image.
 * Returns both a scene injection and a composition directive
 * that tells the camera to emphasize the distortion.
 */
export function buildDistortion(input: DistortionInput): Distortion {
  const role = input.slideRole.toUpperCase();

  // INFORMATIONAL TOPICS: disable distortion entirely.
  // Animals, science, health topics need literal depiction, not visual tension tricks.
  // This applies to ALL roles — OPENER/CTA included. The distortion pool contains
  // hardcoded animal species (wolves, hawks, cobras) that override the actual subject.
  const isInformationalTopic =
    ['animals', 'science', 'health', 'education'].includes(input.topic);

  if (isInformationalTopic) {
    return {
      type: 'temporal-tension',
      sceneInjection: 'Depict the subject naturally and literally. No visual distortion, no symbolic elements. Show the real animal, phenomenon, or mechanism exactly as it exists.',
      compositionDirective: 'The subject is centered and clearly visible. Clean, documentary-style composition. The viewer should immediately identify what the image depicts.',
      rationale: `informational_domain_bypass: role=${role}, topic=${input.topic} — distortion disabled for literal imagery`,
    };
  }

  const type = selectDistortionType(role, input.tensionType);
  const roleStrategy = ROLE_STRATEGIES[role] ?? ROLE_STRATEGIES.HOOK;
  const rawDescription = selectDistortionVariant(type, input.topic, input.headline);

  // Injection language by intensity — no hedging, no "slightly"
  let sceneInjection: string;
  switch (roleStrategy.intensity) {
    case 'dominant':
      sceneInjection = `THE CENTRAL VISUAL: ${rawDescription}. This is the first thing the viewer sees. Everything else in the frame exists to support this detail.`;
      break;
    case 'strong':
      sceneInjection = `The key visual element: ${rawDescription}. The camera and lighting emphasize this above all other details.`;
      break;
    case 'present':
      sceneInjection = `Visible in the scene: ${rawDescription}. This detail is clearly readable and draws the eye.`;
      break;
  }

  const compositionDirective = COMPOSITION_DIRECTIVES[type];

  return {
    type,
    sceneInjection,
    compositionDirective,
    rationale: `role=${role} (${roleStrategy.intensity}) + tension=${input.tensionType} → distortion=${type}`,
  };
}

export { TOPIC_DISTORTIONS, ROLE_STRATEGIES };
