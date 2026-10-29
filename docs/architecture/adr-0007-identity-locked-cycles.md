# ADR-0007: Identity-locked animation cycles

## Status
Accepted

## Date
2026-10-29

## Context

### Problem Statement
Animation sheets were either four copies of one pose, or video frames that changed the rat into a different animal between cells. Playback also hopped because the foot line was not shared, and the renderer asked the terrain for a floor under every rat on every frame.

### Constraints
- Pixel art only. One cell size per creature (128 rats, 192 cat).
- Horizontal strips. The engine slices `frames` equal cells.
- A king, pup, herald, elder, enforcer, or outcast must never fall back onto the worker sheet.
- Cycles must close. The last cell has to meet the first without a vertical pop.

### Requirements
- Same action list per creature: walk, run, dig, eat, fight, haul, and the poses already in the index.
- Feet on one baseline for the whole strip.
- The head pixels of a walk stay the head pixels of that creature.

## Decision
Each action is cut from that creature's own still. Only the feet, the near paw, and the tail move, on a sine that returns to the start. The strip is then shifted so every cell's lowest pixel sits on the same row. If a clip is missing, the renderer uses that creature's idle or walk, not the worker.

While the camera is moving, bloom and the extra lighting samples turn off. They come back when the view is still. Floor probes are cached until the rat actually moves. Colony bounds are recomputed a few times a second, not every frame.

### Alternatives Considered

### Alternative 1: Video harvest
- **Description**: Animate the still, sample frames, chroma-key.
- **Pros**: Real motion blur and timing.
- **Cons**: The body redrew itself. Identity and the foot line both failed the flip test.
- **Rejection Reason**: The user forbade shipping frames that change the animal or fail to loop.

### Alternative 2: One shared walk for every rat
- **Description**: Play the worker cycle and tint it.
- **Pros**: One sheet.
- **Cons**: A king becomes a worker. That is the bug.
- **Rejection Reason**: Each creature keeps its own pixels.

## Consequences

### Positive
- A creature stays itself from idle into a stride.
- Loops do not hop.
- Pans spend less GPU time. A held frame keeps the full grade.

### Negative
- Limb motion is a cycle of the original pixels, not a newly drawn pose. Extreme actions (a full leap, a different skeleton) are not in these sheets.
- Death clips were left as they were.

### Risks
- A foot that was never separate in the still can only travel a short distance.
- Mitigation: the stride is large enough to read, and the head is measured against frame 0 before a walk is kept.

## Performance Implications
- **CPU**: Floor tests and colony scans no longer run for every rat every frame.
- **Memory**: Strips grew from 4 cells to 8. Still one texture per clip.
- **Load Time**: Slightly larger PNGs.
- **Network**: Same origin assets.

## Migration Plan
Replace the action PNGs in place and set `frames` to 8 in `assets/final/index.json`. No save-file change.

## Validation Criteria
- Walk strips are 8 cells, one foot baseline, head overlap with frame 0.
- `npx tsc --noEmit` and `npx vitest run` pass.

## Related Decisions
- Public building stages (scar, posts, shell, furnish, lived-in) stay in the room renderer. They are not taken from another game's source.
