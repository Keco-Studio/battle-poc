# V3 Usability And Walk-Cycle Fix Design

## Goal

Resolve three V3 usability defects without changing combat rules or Keco-authored content: users must be able to move between V3 and the legacy app in both directions, character movement must visibly cycle through real walking poses, and the right-side panel must use player-facing language.

## Navigation

V3 keeps its existing `/legacy` link. The legacy page receives a fixed, high-contrast pixel button linking to `/`, outside `GameMap`, so it remains available regardless of the legacy modal or battle state. A production browser test covers the full `/` -> `/legacy` -> `/` round trip.

## Character Animation

Each character keeps eight directional sheets and eight frames per direction. The frame sequence represents one complete walk cycle: left contact, left down, left passing, left lift, right contact, right down, right passing, right lift. PixelLab first estimates each character's skeleton, then `animate-with-skeleton` renders three-frame windows from explicit hip, knee, foot, elbow, and hand keypoints. This preserves costume identity while making the gait structural rather than relying on text-only motion guesses.

The runtime continues looping the active direction's spritesheet only while the actor is moving. Exploration travel is slowed slightly so multiple walk poses are visible during a one-tile move. Asset validation checks more than byte uniqueness: opposite half-cycles must have materially different silhouettes, and generation can be forced so stale weak animations are not silently reused.

## Sidebar Information Design

The exploration panel becomes a short journey panel:

- current mission in plain Chinese;
- progress summary;
- encounter rows labeled `可挑战`, `已完成`, or `未解锁`;
- a single primary `挑战` action;
- one compact movement hint.

Preparation uses `战前准备`, `正式挑战`, and `自由测试` rather than internal identifiers. Battle uses `战况`, `AI 思路`, and `战斗记录`; technical Patch fields move under an `高级详情` disclosure. The report translates engine end reasons and version metadata into a collapsed technical section.

## Testing

Unit/static rendering tests assert the new player-facing copy and legacy return link. Asset tests assert eight-frame loops and meaningful silhouette changes. Playwright verifies bidirectional route switching, production asset loading, canvas rendering, sidebar labels, standard battle completion, and mobile overflow.
