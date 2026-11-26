/**
 * Dirty Dozen Security Rule Verification Cases for Dom's RNG IV
 * Verifies adversarial payloads against the Eight Pillars in firestore.rules.
 */
export const DIRTY_DOZEN_CASES = [
  { id: 1, name: 'Unauthenticated create', path: '/rollPool/hack_1', expected: 'PERMISSION_DENIED' },
  { id: 2, name: 'Non-admin signed-in user create', path: '/rollPool/hack_2', expected: 'PERMISSION_DENIED' },
  { id: 3, name: 'Unverified admin email create', path: '/rollPool/hack_3', expected: 'PERMISSION_DENIED' },
  { id: 4, name: 'Shadow field injection (isFeatured)', path: '/rollPool/hack_4', expected: 'PERMISSION_DENIED' },
  { id: 5, name: 'Missing required field (project)', path: '/rollPool/hack_5', expected: 'PERMISSION_DENIED' },
  { id: 6, name: 'Oversized/invalid document ID', path: '/rollPool/' + 'a'.repeat(200), expected: 'PERMISSION_DENIED' },
  { id: 7, name: 'Oversized aura name (>64 chars)', path: '/rollPool/hack_7', expected: 'PERMISSION_DENIED' },
  { id: 8, name: 'Invalid classification enum', path: '/rollPool/hack_8', expected: 'PERMISSION_DENIED' },
  { id: 9, name: 'Client-spoofed createdAt timestamp', path: '/rollPool/hack_9', expected: 'PERMISSION_DENIED' },
  { id: 10, name: 'Owner/Author UID spoofing on create', path: '/players/spoof_sess', expected: 'PERMISSION_DENIED' },
  { id: 11, name: 'Cross-player /players mutation or immutable field update', path: '/players/victim_sess', expected: 'PERMISSION_DENIED' },
  { id: 12, name: 'Invalid multiplayer pose/bounds or /admins escalation', path: '/players/hack_pose', expected: 'PERMISSION_DENIED' },
] as const;
