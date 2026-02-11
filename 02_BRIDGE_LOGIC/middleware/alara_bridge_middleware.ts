/**
 * Project Alara: Bridge Logic Middleware
 *
 * Intercepts Echo interaction requests before they reach the Veridian AI (LLM).
 * Performs three operations in sequence:
 *   1. Archetype Evaluation — classify or load cached Seeker archetype
 *   2. Hebbian State Check — enforce loop ceilings and cooldowns
 *   3. Context Injection — assemble enriched payload for LLM system prompt
 *
 * Designed for Firebase Cloud Functions. All state is read from / written to
 * Firestore — no in-memory session state.
 *
 * @see ALARA_BRIDGE_LOGIC.md for full specification
 * @version 1.0.0
 * @date 2026-02-11
 */

import * as admin from "firebase-admin";
import { Request, Response, NextFunction } from "express";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TriggerRule {
  field: string;
  operator: "between" | "gte" | "lte" | "gt" | "lt" | "eq";
  value: number | number[] | string;
  description: string;
}

interface TriggerConditions {
  operator: "AND" | "OR";
  rules: TriggerRule[];
}

interface EngagementModifiers {
  tone: string;
  pacing: string;
  prompt_depth: string;
  echo_behavior: string;
  vocal_frequency_shift: number;
  [key: string]: string | number | boolean;
}

interface HebbianTargets {
  primary_loop: string;
  reinforcement_signal: string;
  loop_ceiling: number;
  cooldown_hours: number;
  description: string;
}

interface SafetyOverrides {
  [key: string]: string | number | boolean | string[];
}

interface SeekerTrigger {
  archetype_id: string;
  display_name: string;
  version: string;
  trigger_conditions: TriggerConditions;
  engagement_modifiers: EngagementModifiers;
  hebbian_targets: HebbianTargets;
  sacolu_phase_mapping: Record<string, string>;
  safety_overrides: SafetyOverrides;
}

interface HebbianState {
  active_loop: string | null;
  loop_count: number;
  loop_ceiling: number;
  last_reinforcement_at: admin.firestore.Timestamp | null;
  cooldown_until: admin.firestore.Timestamp | null;
  lifetime_loops: Record<string, number>;
}

interface SaCoLuPhase {
  current_phase: string;
  phase_entered_at: admin.firestore.Timestamp;
  phase_history: Array<{
    phase: string;
    entered_at: admin.firestore.Timestamp;
    exited_at: admin.firestore.Timestamp;
  }>;
  sapien_override_active: boolean;
  override_reason: string | null;
}

interface SeekerArchetype {
  primary: string | null;
  confidence: number;
  secondary: string | null;
  secondary_confidence: number;
  last_evaluated_at: admin.firestore.Timestamp | null;
  evaluation_window_days: number;
}

interface UserProfile {
  user_id: string;
  behavioral_signature: {
    risk_tolerance: number;
    social_anxiety: number;
    task_completion_rate: number;
  };
  hebbian_state: HebbianState;
  sacolu_phase: SaCoLuPhase;
  seeker_archetype: SeekerArchetype;
  session_history?: {
    late_night_ratio: number;
    avg_session_length_minutes: number;
  };
  echo_interaction?: {
    exploration_breadth: number;
  };
}

interface SessionContext {
  session_id: string;
  user_id: string;
  local_hour: number;
  started_at: admin.firestore.Timestamp;
  duration_minutes: number;
}

interface VeridianContext {
  seeker_archetype_primary: string | null;
  seeker_archetype_confidence: number;
  seeker_archetype_secondary: string | null;
  seeker_secondary_confidence: number;
  sacolu_phase: string;
  hebbian_active_loop: string | null;
  hebbian_loop_count: number;
  hebbian_loop_ceiling: number;
  hebbian_cooldown_active: boolean;
  hebbian_reinforcement_signal: string | null;
  session_local_hour: number;
  session_duration_minutes: number;
  session_soft_cap_minutes: number | null;
  engagement_tone: string;
  engagement_pacing: string;
  engagement_prompt_depth: string;
  engagement_echo_behavior: string;
  safety_perfectionism_flags: string[];
  safety_overrides: SafetyOverrides;
}

// ---------------------------------------------------------------------------
// Firestore References
// ---------------------------------------------------------------------------

const db = admin.firestore();
const userProfilesRef = db.collection("User_Profiles");
const seekerTriggersRef = db.collection("seeker_triggers");
const hebbianHistoryRef = db.collection("hebbian_loop_history");
const sacoLuTransitionsRef = db.collection("sacolu_phase_transitions");

// ---------------------------------------------------------------------------
// 1. Archetype Evaluator
// ---------------------------------------------------------------------------

/**
 * Loads all registered Seeker triggers and evaluates them against the user's
 * telemetry. Returns the best-matching archetype or the cached classification
 * if the evaluation window has not elapsed.
 */
async function evaluateArchetype(
  user: UserProfile,
  session: SessionContext
): Promise<{ trigger: SeekerTrigger | null; needsUpdate: boolean }> {
  const archetype = user.seeker_archetype;

  // Check if cached classification is still valid
  if (archetype.primary && archetype.last_evaluated_at) {
    const elapsedDays =
      (Date.now() - archetype.last_evaluated_at.toMillis()) /
      (1000 * 60 * 60 * 24);
    if (elapsedDays < archetype.evaluation_window_days) {
      // Load the cached trigger definition
      const triggerDoc = await seekerTriggersRef
        .doc(archetype.primary)
        .get();
      return {
        trigger: triggerDoc.exists
          ? (triggerDoc.data() as SeekerTrigger)
          : null,
        needsUpdate: false,
      };
    }
  }

  // Evaluation window elapsed or no classification — re-evaluate
  const triggersSnapshot = await seekerTriggersRef.get();
  let bestMatch: SeekerTrigger | null = null;
  let bestConfidence = 0;
  let secondMatch: SeekerTrigger | null = null;
  let secondConfidence = 0;

  for (const doc of triggersSnapshot.docs) {
    const trigger = doc.data() as SeekerTrigger;
    const confidence = evaluateTriggerConditions(
      trigger.trigger_conditions,
      user,
      session
    );

    if (confidence > bestConfidence) {
      secondMatch = bestMatch;
      secondConfidence = bestConfidence;
      bestMatch = trigger;
      bestConfidence = confidence;
    } else if (confidence > secondConfidence) {
      secondMatch = trigger;
      secondConfidence = confidence;
    }
  }

  // Persist updated classification
  if (bestMatch) {
    await userProfilesRef.doc(user.user_id).update({
      "seeker_archetype.primary": bestMatch.archetype_id,
      "seeker_archetype.confidence": bestConfidence,
      "seeker_archetype.secondary": secondMatch?.archetype_id ?? null,
      "seeker_archetype.secondary_confidence": secondConfidence,
      "seeker_archetype.last_evaluated_at":
        admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  return { trigger: bestMatch, needsUpdate: true };
}

/**
 * Evaluates a set of trigger conditions against user + session data.
 * Returns a confidence score between 0.0 and 1.0.
 */
function evaluateTriggerConditions(
  conditions: TriggerConditions,
  user: UserProfile,
  session: SessionContext
): number {
  const results = conditions.rules.map((rule) => {
    const actualValue = resolveFieldValue(rule.field, user, session);
    if (actualValue === undefined || actualValue === null) return 0;
    return evaluateRule(rule, actualValue) ? 1 : 0;
  });

  if (conditions.operator === "AND") {
    // All rules must pass; confidence = ratio of passing rules
    const passing = results.reduce((sum, r) => sum + r, 0);
    return passing / results.length;
  } else {
    // OR: at least one rule must pass
    return results.some((r) => r === 1) ? 1 : 0;
  }
}

/**
 * Resolves a dot-notation field path against the user profile and session.
 */
function resolveFieldValue(
  field: string,
  user: UserProfile,
  session: SessionContext
): number | string | undefined {
  const parts = field.split(".");
  const root = parts[0];

  // Route to correct data source
  let obj: Record<string, unknown>;
  if (root === "session") {
    obj = session as unknown as Record<string, unknown>;
    parts.shift();
  } else if (root === "user") {
    obj = user as unknown as Record<string, unknown>;
    parts.shift();
  } else {
    return undefined;
  }

  // Walk the path
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    current = (current as Record<string, unknown>)[part];
  }

  return current as number | string | undefined;
}

/**
 * Evaluates a single trigger rule against an actual value.
 */
function evaluateRule(rule: TriggerRule, actual: number | string): boolean {
  const val = typeof actual === "string" ? parseFloat(actual) : actual;

  switch (rule.operator) {
    case "between": {
      const [low, high] = rule.value as number[];
      // Handle wraparound (e.g., 22 to 5 for late-night)
      if (low > high) {
        return val >= low || val <= high;
      }
      return val >= low && val <= high;
    }
    case "gte":
      return val >= (rule.value as number);
    case "lte":
      return val <= (rule.value as number);
    case "gt":
      return val > (rule.value as number);
    case "lt":
      return val < (rule.value as number);
    case "eq":
      return actual === rule.value;
    default:
      return false;
  }
}

// ---------------------------------------------------------------------------
// 2. Hebbian State Machine
// ---------------------------------------------------------------------------

/**
 * Loads the user's Hebbian loop state, checks ceilings and cooldowns,
 * and returns whether reinforcement is allowed for this request.
 */
async function checkHebbianState(
  user: UserProfile,
  trigger: SeekerTrigger | null
): Promise<{
  reinforcementAllowed: boolean;
  activeLoop: string | null;
  loopCount: number;
  loopCeiling: number;
  cooldownActive: boolean;
}> {
  const state = user.hebbian_state;

  // No trigger = no active loop
  if (!trigger) {
    return {
      reinforcementAllowed: false,
      activeLoop: null,
      loopCount: 0,
      loopCeiling: 0,
      cooldownActive: false,
    };
  }

  const targets = trigger.hebbian_targets;

  // Check cooldown
  if (state.cooldown_until) {
    const cooldownEnd = state.cooldown_until.toMillis();
    if (Date.now() < cooldownEnd) {
      return {
        reinforcementAllowed: false,
        activeLoop: targets.primary_loop,
        loopCount: state.loop_count,
        loopCeiling: targets.loop_ceiling,
        cooldownActive: true,
      };
    }
  }

  // Check ceiling
  if (state.loop_count >= targets.loop_ceiling) {
    // Ceiling reached — activate cooldown
    const cooldownUntil = new Date(
      Date.now() + targets.cooldown_hours * 60 * 60 * 1000
    );
    await userProfilesRef.doc(user.user_id).update({
      "hebbian_state.cooldown_until":
        admin.firestore.Timestamp.fromDate(cooldownUntil),
    });

    return {
      reinforcementAllowed: false,
      activeLoop: targets.primary_loop,
      loopCount: state.loop_count,
      loopCeiling: targets.loop_ceiling,
      cooldownActive: true,
    };
  }

  // Reinforcement allowed
  return {
    reinforcementAllowed: true,
    activeLoop: targets.primary_loop,
    loopCount: state.loop_count,
    loopCeiling: targets.loop_ceiling,
    cooldownActive: false,
  };
}

/**
 * Called after the LLM response to record that a reinforcement signal was
 * delivered. Increments loop count and logs to history.
 */
async function recordReinforcement(
  userId: string,
  sessionId: string,
  trigger: SeekerTrigger
): Promise<void> {
  const userRef = userProfilesRef.doc(userId);

  await db.runTransaction(async (tx) => {
    const userDoc = await tx.get(userRef);
    if (!userDoc.exists) return;

    const state = userDoc.data()?.hebbian_state as HebbianState;
    const newCount = (state?.loop_count ?? 0) + 1;
    const loopName = trigger.hebbian_targets.primary_loop;

    // Increment session loop count
    tx.update(userRef, {
      "hebbian_state.loop_count": newCount,
      "hebbian_state.active_loop": loopName,
      "hebbian_state.last_reinforcement_at":
        admin.firestore.FieldValue.serverTimestamp(),
      [`hebbian_state.lifetime_loops.${loopName}`]:
        admin.firestore.FieldValue.increment(1),
    });

    // Append to audit log
    const historyRef = hebbianHistoryRef.doc();
    tx.set(historyRef, {
      user_id: userId,
      loop_name: loopName,
      loop_iteration: newCount,
      reinforcement_signal: trigger.hebbian_targets.reinforcement_signal,
      triggered_by_archetype: trigger.archetype_id,
      session_id: sessionId,
      created_at: admin.firestore.FieldValue.serverTimestamp(),
    });
  });
}

// ---------------------------------------------------------------------------
// 3. Context Injector
// ---------------------------------------------------------------------------

/**
 * Assembles the VeridianContext object that will be injected into the
 * LLM system prompt via template variable substitution.
 */
function buildVeridianContext(
  user: UserProfile,
  session: SessionContext,
  trigger: SeekerTrigger | null,
  hebbianResult: {
    reinforcementAllowed: boolean;
    activeLoop: string | null;
    loopCount: number;
    loopCeiling: number;
    cooldownActive: boolean;
  }
): VeridianContext {
  const modifiers = trigger?.engagement_modifiers;
  const safetyOverrides = trigger?.safety_overrides ?? {};

  return {
    seeker_archetype_primary: user.seeker_archetype.primary,
    seeker_archetype_confidence: user.seeker_archetype.confidence,
    seeker_archetype_secondary: user.seeker_archetype.secondary,
    seeker_secondary_confidence: user.seeker_archetype.secondary_confidence,
    sacolu_phase: user.sacolu_phase.current_phase,
    hebbian_active_loop: hebbianResult.activeLoop,
    hebbian_loop_count: hebbianResult.loopCount,
    hebbian_loop_ceiling: hebbianResult.loopCeiling,
    hebbian_cooldown_active: hebbianResult.cooldownActive,
    hebbian_reinforcement_signal:
      trigger?.hebbian_targets.reinforcement_signal ?? null,
    session_local_hour: session.local_hour,
    session_duration_minutes: session.duration_minutes,
    session_soft_cap_minutes:
      (modifiers?.session_soft_cap_minutes as number) ?? null,
    engagement_tone: modifiers?.tone ?? "neutral",
    engagement_pacing: modifiers?.pacing ?? "default",
    engagement_prompt_depth: modifiers?.prompt_depth ?? "standard",
    engagement_echo_behavior: modifiers?.echo_behavior ?? "default",
    safety_perfectionism_flags:
      (safetyOverrides.perfectionism_language_flags as string[]) ?? [],
    safety_overrides: safetyOverrides,
  };
}

// ---------------------------------------------------------------------------
// Express Middleware (Firebase Cloud Function entry point)
// ---------------------------------------------------------------------------

/**
 * Main middleware function. Attach to the Echo interaction endpoint.
 *
 * Usage:
 *   app.use("/api/echo/interact", alaraBridgeMiddleware);
 */
export async function alaraBridgeMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.body?.user_id;
    const sessionId = req.body?.session_id;

    if (!userId || !sessionId) {
      res.status(400).json({ error: "user_id and session_id are required" });
      return;
    }

    // Load user profile
    const userDoc = await userProfilesRef.doc(userId).get();
    if (!userDoc.exists) {
      res.status(404).json({ error: "User profile not found" });
      return;
    }
    const user = userDoc.data() as UserProfile;

    // Build session context
    const session: SessionContext = {
      session_id: sessionId,
      user_id: userId,
      local_hour: req.body?.local_hour ?? new Date().getHours(),
      started_at: req.body?.session_started_at
        ? admin.firestore.Timestamp.fromDate(
            new Date(req.body.session_started_at)
          )
        : admin.firestore.Timestamp.now(),
      duration_minutes: req.body?.session_duration_minutes ?? 0,
    };

    // Step 1: Evaluate archetype
    const { trigger } = await evaluateArchetype(user, session);

    // Step 2: Check Hebbian state
    const hebbianResult = await checkHebbianState(user, trigger);

    // Step 3: Check for safety overrides (short-circuit if needed)
    if (trigger?.safety_overrides) {
      const sapienOverride = user.sacolu_phase.sapien_override_active;
      if (sapienOverride) {
        // Moderator has control — reduce AI autonomy
        (req as Record<string, unknown>).veridianContext =
          buildVeridianContext(user, session, null, {
            reinforcementAllowed: false,
            activeLoop: null,
            loopCount: 0,
            loopCeiling: 0,
            cooldownActive: true,
          });
        next();
        return;
      }
    }

    // Step 4: Build and inject context
    const context = buildVeridianContext(
      user,
      session,
      trigger,
      hebbianResult
    );
    (req as Record<string, unknown>).veridianContext = context;

    // Attach recordReinforcement callback for post-LLM use
    (req as Record<string, unknown>).recordReinforcement = async () => {
      if (trigger && hebbianResult.reinforcementAllowed) {
        await recordReinforcement(userId, sessionId, trigger);
      }
    };

    next();
  } catch (error) {
    console.error("[AlaraBridge] Middleware error:", error);
    // Fail open — let the request through without enrichment
    // rather than blocking the user's interaction
    next();
  }
}

// ---------------------------------------------------------------------------
// SaCoLu Phase Transition Helper
// ---------------------------------------------------------------------------

/**
 * Transitions a user to a new SaCoLu phase. Call this from administrative
 * endpoints or automated phase-progression logic.
 */
export async function transitionSaCoLuPhase(
  userId: string,
  toPhase: string,
  trigger: string,
  sapienOverride: boolean = false,
  overrideReason: string | null = null
): Promise<void> {
  const userRef = userProfilesRef.doc(userId);

  await db.runTransaction(async (tx) => {
    const userDoc = await tx.get(userRef);
    if (!userDoc.exists) return;

    const currentPhase = userDoc.data()?.sacolu_phase as SaCoLuPhase;
    const fromPhase = currentPhase.current_phase;

    if (fromPhase === toPhase) return; // No-op

    // Update user document
    tx.update(userRef, {
      "sacolu_phase.current_phase": toPhase,
      "sacolu_phase.phase_entered_at":
        admin.firestore.FieldValue.serverTimestamp(),
      "sacolu_phase.sapien_override_active": sapienOverride,
      "sacolu_phase.override_reason": overrideReason,
      [`sacolu_phase.phase_history`]: admin.firestore.FieldValue.arrayUnion({
        phase: fromPhase,
        entered_at: currentPhase.phase_entered_at,
        exited_at: admin.firestore.Timestamp.now(),
      }),
    });

    // Log transition
    const transitionRef = sacoLuTransitionsRef.doc();
    tx.set(transitionRef, {
      user_id: userId,
      from_phase: fromPhase,
      to_phase: toPhase,
      transition_trigger: trigger,
      sapien_override: sapienOverride,
      override_reason: overrideReason,
      created_at: admin.firestore.FieldValue.serverTimestamp(),
    });
  });
}
