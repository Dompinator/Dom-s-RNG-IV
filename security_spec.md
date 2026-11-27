# Security Specification & Payload-First TDD (`Dom's RNG IV`)

## 1. Data Invariants
1. All document IDs (`auraId`, `userId`, `sessionId`) must match `^[a-zA-Z0-9_\\-]+$` and have length `1..128`.
2. Every `rollPool/{auraId}` document is non-PII game catalog data readable by all visitors/players using bounded list queries (`request.query.limit >= 1 && request.query.limit <= 500`) so every device can roll auras immediately without enabling unbounded scraping.
3. Only the verified creator/admin (`codompic@gmail.com` with `email_verified == true` or a trusted `/admins/{uid}` document) can `create`, `update`, or `delete` entries in `/rollPool/{auraId}`.
4. `createdAt` and `authorUid` are immutable after creation; `createdAt == request.time` on create and `updatedAt == request.time` on create and update.
5. Exact allowed and required keys are enforced on `create` (`hasAll` + `hasOnly`), and `affectedKeys().hasOnly(...)` is enforced on `update`.
6. Native Maps and Lists are used for `project` (never JSON strings), with bounded string sizes (`name` 1..64, `description` 0..240), bounded `project.layers` size (`<= 64`), validated optional `posePreset` enum, and bounded optional `cutscene` (`elements <= 24`, `headlineText <= 80`, optional `customAudio <= 450000`).
7. Every `/players/{sessionId}` document contains zero PII (no email, phone, or profile URL), is readable via bounded list queries (`request.query.limit >= 1 && request.query.limit <= 100`), is owned by `ownerUid == request.auth.uid` (verified user), enforces world coordinate bounds (`x/z` within `[-80, 80]`, `y` within `[-5, 60]`), strict pose enum (`idle|walk|jump|levitate|levitate_walk`), `displayName` 1..24 chars, `equippedAuraId` `<= 128` chars, and server `updatedAt == request.time`.
8. Every `/accounts/{userId}` document is strictly private to the owner (`request.auth.uid == userId && isVerified()`), contains zero PII (no email/phone), validates `uid == userId`, `username` (`1..24` chars), bounded `storage` array (`<= 200` validated entries), `totalRolls >= 0`, `equippedAuraId <= 128` chars, immutable `uid`/`createdAt`, and server timestamps.
9. Every `/accounts/{userId}/projects/{projectId}` document is strictly private to the verified owner (`isOwner(userId)`), verifies parent `/accounts/{userId}` exists on single-document operations (`get`/`create`/`update`/`delete`), bounds `list` queries (`1..200`), validates `id == projectId`, `ownerUid == request.auth.uid`, `project` layers (`<= 64`), optional `posePreset`/`cutscene` (`elements <= 24`), and optional audio (`<= 920000`), and locks immutable `id`/`ownerUid`/`createdAt`.

## 2. The "Dirty Dozen" Attack Payloads (Must Return `PERMISSION_DENIED`)
1. Unauthenticated write to `/rollPool/hack_1` (`request.auth == null`).
2. Non-admin signed-in user attempting to create `/rollPool/hack_2`.
3. Admin with unverified email (`email_verified: false`) attempting to create `/rollPool/hack_3`.
4. Shadow field injection on create: valid fields plus `{ "isFeatured": true }`.
5. Missing required field on create (omitting `updatedAt` or `project`).
6. Oversized `auraId` path variable (`"a".repeat(200)`) or invalid characters (`"../bad"`).
7. Oversized `name` (`> 64` chars) or `description` (`> 240` chars).
8. Invalid `classification` enum (`"Godlike"` instead of `Common|Uncommon|Rare|Epic|Legendary|Mythic`).
9. Client-spoofed `createdAt` or `updatedAt` not equal to `request.time`.
10. Cross-user read/write on `/accounts/{otherUid}` or `/accounts/{otherUid}/projects/{id}`, or `uid != request.auth.uid` spoofing.
11. Immutable field mutation on update (`createdAt`, `authorUid`, `ownerUid`, `sessionId`, `uid`, or `id` changed, or mutating another player's `/players/{sessionId}`).
12. Invalid multiplayer pose/bounds or non-admin escalation on `/admins/{uid}`.
