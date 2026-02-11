-- ============================================================================
-- Project Alara: Bridge Logic Schema Extensions
-- Purpose: Track Hebbian loop state and SaCoLu phase for neuro-behavioral
--          engagement management
-- Target:  Analytics warehouse / relational mirror of Firestore data
-- Depends: user_profiles table (from COMPREHENSIVE_OVERVIEW.md v4.0)
-- Date:    2026-02-11
-- ============================================================================

-- --------------------------------------------------------------------------
-- 1. Extend user_profiles with Hebbian + SaCoLu + Seeker fields
-- --------------------------------------------------------------------------

ALTER TABLE user_profiles
  ADD COLUMN hebbian_loop_count INTEGER DEFAULT 0,
  ADD COLUMN hebbian_active_loop VARCHAR(128) DEFAULT NULL,
  ADD COLUMN hebbian_loop_ceiling INTEGER DEFAULT 3,
  ADD COLUMN hebbian_last_reinforcement_at TIMESTAMP DEFAULT NULL,
  ADD COLUMN hebbian_cooldown_until TIMESTAMP DEFAULT NULL,
  ADD COLUMN sacolu_phase VARCHAR(64) DEFAULT 'lumina_onboarding',
  ADD COLUMN sacolu_phase_entered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN sacolu_sapien_override BOOLEAN DEFAULT FALSE,
  ADD COLUMN seeker_archetype_primary VARCHAR(64) DEFAULT NULL,
  ADD COLUMN seeker_archetype_confidence DECIMAL(3,2) DEFAULT 0.00,
  ADD COLUMN seeker_archetype_secondary VARCHAR(64) DEFAULT NULL,
  ADD COLUMN seeker_secondary_confidence DECIMAL(3,2) DEFAULT 0.00,
  ADD COLUMN seeker_last_evaluated_at TIMESTAMP DEFAULT NULL;

-- Hot-path indexes for middleware lookups
CREATE INDEX idx_user_sacolu_phase ON user_profiles (sacolu_phase);
CREATE INDEX idx_user_seeker_archetype ON user_profiles (seeker_archetype_primary);
CREATE INDEX idx_user_hebbian_cooldown ON user_profiles (hebbian_cooldown_until);

-- --------------------------------------------------------------------------
-- 2. Hebbian loop history (append-only audit table)
--    Tracks every reinforcement event for research analysis and debugging
-- --------------------------------------------------------------------------

CREATE TABLE hebbian_loop_history (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(128) NOT NULL REFERENCES user_profiles(user_id),
  loop_name VARCHAR(128) NOT NULL,
  loop_iteration INTEGER NOT NULL,
  reinforcement_signal VARCHAR(128) NOT NULL,
  triggered_by_archetype VARCHAR(64),
  session_id VARCHAR(128),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_hebbian_history_user ON hebbian_loop_history (user_id, created_at DESC);
CREATE INDEX idx_hebbian_history_loop ON hebbian_loop_history (loop_name, created_at DESC);

-- --------------------------------------------------------------------------
-- 3. SaCoLu phase transition log
--    Records every phase change with trigger reason and override status
-- --------------------------------------------------------------------------

CREATE TABLE sacolu_phase_transitions (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(128) NOT NULL REFERENCES user_profiles(user_id),
  from_phase VARCHAR(64) NOT NULL,
  to_phase VARCHAR(64) NOT NULL,
  transition_trigger VARCHAR(256),
  sapien_override BOOLEAN DEFAULT FALSE,
  override_reason TEXT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_sacolu_transitions_user ON sacolu_phase_transitions (user_id, created_at DESC);

-- --------------------------------------------------------------------------
-- 4. Seeker archetype evaluation log
--    Records archetype assignments for longitudinal analysis
-- --------------------------------------------------------------------------

CREATE TABLE seeker_archetype_evaluations (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(128) NOT NULL REFERENCES user_profiles(user_id),
  archetype_primary VARCHAR(64) NOT NULL,
  primary_confidence DECIMAL(3,2) NOT NULL,
  archetype_secondary VARCHAR(64),
  secondary_confidence DECIMAL(3,2),
  evaluation_window_days INTEGER DEFAULT 14,
  trigger_snapshot JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_seeker_eval_user ON seeker_archetype_evaluations (user_id, created_at DESC);
