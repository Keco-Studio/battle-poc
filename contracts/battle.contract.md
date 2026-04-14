# Battle System Contract

## Combat System

| Priority | Contract Item | Test File | Status |
|----------|--------------|-----------|--------|
| P1 | Damage = max(1, attack - defense) | CombatSystem.test.ts | Tested |
| P1 | Critical hits deal 2x damage | CombatSystem.test.ts | Tested |
| P1 | Status effects tick down each turn | CombatSystem.test.ts | Tested |
| P1 | Stunned actors skip their turn | CombatSystem.test.ts | Tested |
| P1 | Poison deals 10% maxHp per turn | CombatSystem.test.ts | Tested |
| P1 | Burn deals 5% maxHp per turn | CombatSystem.test.ts | Tested |

## Battle State Machine

| Priority | Contract Item | Test File | Status |
|----------|--------------|-----------|--------|
| P1 | Battle ends when one side eliminated | BattleStateMachine.test.ts | Tested |
| P1 | Input actors are never mutated | BattleStateMachine.test.ts | Tested |

## Notes

- All random values use SeededRNG for deterministic behavior
- Status effects are processed at the start of each actor's turn
- Critical hits are affected by luck stat
