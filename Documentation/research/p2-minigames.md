# Jak 1 Two-Player Minigame Architecture
## Fishing & Swamp-Rat Shooting Input Routing

### Executive Summary
Both Jak 1 minigames (fishing in village1/jungle, swamp-rat shooting in swamp) use hardcoded `cpads[0]` reads and are embedded in `process-taskable` hierarchies that freeze P1 during play. Adapting them for P2 triggering requires:

1. **Global state tracking**: Store which player (0 or 1) triggered the minigame
2. **Input abstraction**: Replace hardcoded `cpads[0]` with dynamic index selection based on trigger player
3. **Target freeze logic**: Ensure correct target is frozen (currently only P1 is frozen)
4. **Camera/HUD assumptions**: Both minigames assume P1-centric setup; P2 triggering will need testing

---

## Minigame #1: Fishing (fisher.gc)

### Trigger Mechanism
- **File**: `goal_src/jak1/levels/jungle/fisher.gc` (1759 lines)
- **Type**: `process-taskable` subclass (inherits from `process-taskable.gc`)
- **Trigger**: NPC interaction -> `fisher` process spawned -> `enter-playing` state initiates
- **Entry Point**: `(send-event *target* 'change-mode 'fishing self)` transitions to `target-fishing` state
- **Target State Transition**: `target-fishing` (line 1531) sets up manipy (fish net) and freezes P1 control

### Input Architecture
- **Location**: `fisher-game-update()` function, line 1180
- **Current Code**:
  ```lisp
  (let ((f1-14 (analog-input (the-as int (-> *cpad-list* cpads 0 leftx)) ...)))
    (+! (-> self paddle-vel) (* f1-14 (seconds-per-frame))))
  ```
- **Reads**: `cpads[0].leftx` (analog stick X-axis) for paddle position
- **Frequency**: Every frame (in `fisher-playing` state loop)
- **Processing**: Analog input clamped to [-2.0, 2.0], lerped to paddle position (0.0-1.0)

### State Machine
1. **Idle -> Play-Anim** (taskable intro)
2. **Play-Anim -> Enter-Playing** (custom virtual state, line 1282)
3. **Enter-Playing -> Fisher-Playing** (actual minigame loop, line 1190)
   - Event handler: catches `fisher-fish-die`, `fisher-fish-caught`, `deadly`, `bad` messages from spawned fish
   - Exit: restores camera, clears ambient sound, deactivates P1 control freeze
4. **Fisher-Playing -> Fisher-Done** (completion)

### P1 Freeze Behavior
- **Freeze Location**: `target-fishing` state `:enter` (line 1540) clears target's collide-shape "as"
- **Effect**: P1 cannot move; animations locked to fishing motion
- **Unfreeze**: `:exit` restores collision (line 1240)
- **P2 Impact**: P2 still controllable during P1's fishing (current co-op behavior unaffected)

### Camera Assumptions
- **Override**: `(send-event *camera* 'change-to-entity-by-name "camera-152")` (line 1222)
- **Fixed to**: Fishing minigame camera entity (hardcoded by level design)
- **Risk**: If P2 triggers, camera won't track P2; P1's camera will snap to fixed entity instead

---

## Minigame #2: Swamp-Rat Shooting (billy.gc)

### Trigger Mechanism
- **File**: `goal_src/jak1/levels/swamp/billy.gc` (754 lines)
- **Type**: `process-taskable` subclass
- **Trigger**: NPC interaction -> `billy` process spawned -> `enter-playing` state initiates
- **Entry Point**: `(send-event *target* 'change-mode 'billy)` transitions P1 to target-billy mode
- **Target State**: Not shown in billy.gc excerpt (defined elsewhere in target code), freezes P1

### Input Architecture
- **Location**: `billy-game-update()` function (called from `billy-playing` state, line 664)
- **Current Code**: Search revealed only one cpad reference at line 667:
  ```lisp
  (and *cheat-mode* (cpad-pressed? 1 x))  ;; NOTE: uses cpad 1, not 0!
  ```
  This is a cheat exit, not game input.
- **Actual Input**: Hidden in `billy-game-update()` (external/not in excerpt). Likely reads joystick for aiming and buttons for firing.
- **Rats Spawned**: Billy spawns `billy-rat` (nav-enemy subclass) at wave intervals (lines 598-607)

### State Machine
1. **Idle -> Play-Anim** (taskable intro)
2. **Play-Anim -> Enter-Playing** (custom virtual state, line 674)
3. **Enter-Playing -> Billy-Playing** (actual minigame loop, line 600)
   - Setup: Spawns snack entities (farthy-snack), clears load state, sets music to 'danger'
   - Loop: Calls `billy-game-update()`, checks win/lose conditions (no snacks, no rats, cheat exit)
   - Exit: Restores load state and music (lines 651-656)
4. **Billy-Playing -> Billy-Done** (completion)

### P1 Freeze Behavior
- **Freeze Location**: `(send-event *target* 'change-mode 'billy)` (line 678)
- **Effect**: P1 frozen in place, likely gun-aim mode activated
- **Unfreeze**: State exit restores normal movement
- **P2 Impact**: P2 still controllable during P1's shooting (current co-op behavior unaffected)

### Camera Assumptions
- **Status**: No explicit camera override found in billy.gc (minigame camera likely set via layout/entity)
- **Risk**: Similar to fishing—camera may not track P2 if triggered

---

## Implementation Strategy

### Option A: Global State (Recommended)
```lisp
(define *minigame-player-index* 0)

(let ((f1-14 (analog-input (the-as int 
  (-> *cpad-list* cpads *minigame-player-index* leftx)) ...)))
  ...)
```

Set `*minigame-player-index*` in `enter-playing` state based on which target triggered event.

### Option B: Entity Field
Add `triggering-player` field to `fisher` and `billy` deftypes; pass through input read chain.

### Option C: Dual-Read (Not Suitable)
The Jak 2 `or`-based pattern allows either pad; minigames should be **exclusive** to trigger player.

---

## Blockers & Risks

| Issue | Severity | Mitigation |
|-------|----------|-----------|
| `billy-game-update()` location unknown | Medium | Grep for function; likely in billy.gc separate behavior file |
| Camera assumes P1 | High | Document as P1-only for PoC; flag for future work |
| Target freeze in target.gc | High | Must coordinate correct target freeze (P1 vs P2) |
| Minigame HUD tied to P1-only display | Medium | Test P2 play; may render twice or not at all |
| Cheat-mode exit uses `cpad 1` hardcoded | Low | Update to dynamic index |

---

## Related Files

**Fishing**:
- `goal_src/jak1/levels/jungle/fisher.gc` (input line 1180, target-fishing line 1531)
- `goal_src/jak1/levels/village1/fishermans-boat.gc` (likely NPC trigger)

**Swamp-Rat Shooting**:
- `goal_src/jak1/levels/swamp/billy.gc` (input line 667 cheat, minigame loop line 664)
- `goal_src/jak1/levels/swamp/swamp-rat.gc` (enemy type)
- `OG-Jak2-Multi/goal_src/jak2/engine/mods/localmulti.gc` (dual-pad pattern reference)

---

## Next Steps

1. Locate full `billy-game-update()` function definition
2. Identify NPC trigger code path (how player contact spawns minigame)
3. Implement `*minigame-player-index*` global state
4. Create input abstraction macro/function
5. Update fisher.gc and billy.gc to use abstraction
6. Test P2 triggering; verify camera/HUD behavior
7. Coordinate target freeze logic with P1/P2 selection

---

**Status**: Research phase; ready for implementation  
**Scope**: Jak 1 fishing + swamp-rat shooting two-player routing  
**Generated**: 2026-04-15
