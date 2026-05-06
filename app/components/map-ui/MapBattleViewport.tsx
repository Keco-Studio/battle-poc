/* eslint-disable @next/next/no-img-element */
import type { KeyboardEvent, MouseEvent, MutableRefObject, RefObject } from 'react'
import type { Enemy, MapCharacterVisualId } from '@/app/constants'
import { mapCharacterIdleStyle } from '@/app/lib/mapEntitySpriteStyles'
import { DEFAULT_DIRECTION, pixelLabSheetActorStyle, toEnemyIdlePngPath, toEnemyRunningFramePath, toEnemyWalkFramePath, toPlayerIdlePngPath, toPlayerRunningFramePath, toPlayerWalkFramePath, type PixelLabPackMeta, type RotationKey } from './gameMapUtils'
import { getActiveCombatFx, isCombatActionAnim, toCombatSpriteTransform } from './utils/combatFxRenderUtils'
import type { CombatFxState } from './hooks/useMapCombatFx'
import type { MapFloatText, MapImpactFx, MapMoveFx, MapProjectileFx } from './hooks/useMapTransientFx'

type GridPos = { x: number; y: number }

type Props = {
  mapViewportRef: RefObject<HTMLDivElement | null>
  mapCanvasRef: RefObject<HTMLCanvasElement | null>
  onMapClick: (e: MouseEvent<HTMLDivElement>) => void
  enemies: Enemy[]
  showBattle: boolean
  isPVPMode: boolean
  combatEnemyId: number | null
  mounted: boolean
  enemyPositions: Record<number, GridPos>
  gridToScreen: (x: number, y: number) => { x: number; y: number }
  handleEnemyMarkerClick: (enemy: Enemy) => (e: MouseEvent<HTMLDivElement>) => void
  handleEnemyMarkerKeyDown: (enemy: Enemy) => (e: KeyboardEvent<HTMLDivElement>) => void
  enemyHpRatioForUi: number
  enemyLevelRangeMin: number
  enemyLevelRangeMax: number
  enemyFacings: Record<number, RotationKey>
  pixelLabPacks: Record<string, PixelLabPackMeta | null>
  enemyCombatFx: Record<number, CombatFxState>
  enemyTargetsRef: MutableRefObject<Record<number, GridPos>>
  mapCellDisplayPx: number
  walkAnimTick: number
  actorPx: number
  mapBattleControllerRef: MutableRefObject<any>
  playerPos: GridPos
  playerHpRatioForUi: number
  playerCombatFx: CombatFxState
  playerLastMoveAt: number
  playerVisualId: MapCharacterVisualId
  playerFacing: RotationKey
  projectileFx: MapProjectileFx[]
  impactFx: MapImpactFx[]
  moveFx: MapMoveFx[]
  floatTexts: MapFloatText[]
}

export default function MapBattleViewport(props: Props) {
  const {
    mapViewportRef,
    mapCanvasRef,
    onMapClick,
    enemies,
    showBattle,
    isPVPMode,
    combatEnemyId,
    mounted,
    enemyPositions,
    gridToScreen,
    handleEnemyMarkerClick,
    handleEnemyMarkerKeyDown,
    enemyHpRatioForUi,
    enemyLevelRangeMin,
    enemyLevelRangeMax,
    enemyFacings,
    pixelLabPacks,
    enemyCombatFx,
    enemyTargetsRef,
    mapCellDisplayPx,
    walkAnimTick,
    actorPx,
    mapBattleControllerRef,
    playerPos,
    playerHpRatioForUi,
    playerCombatFx,
    playerLastMoveAt,
    playerVisualId,
    playerFacing,
    projectileFx,
    impactFx,
    moveFx,
    floatTexts,
  } = props

  return (
    <div ref={mapViewportRef} className="absolute inset-0 cursor-crosshair" onClick={onMapClick}>
      <canvas ref={mapCanvasRef} className="absolute inset-0 z-0 block h-full w-full" />
      <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
        {enemies.map((enemy) => {
          if (showBattle && isPVPMode && (combatEnemyId === null || enemy.id !== combatEnemyId)) return null
          const pos = mounted ? (enemyPositions[enemy.id] || { x: enemy.x, y: enemy.y }) : { x: enemy.x, y: enemy.y }
          const inBattle = showBattle && combatEnemyId !== null && enemy.id === combatEnemyId
          const enemyTransitionStyle = inBattle
            ? { transitionProperty: 'left, top', transitionDuration: '300ms', transitionTimingFunction: 'linear', willChange: 'left, top' as const }
            : undefined
          return (
            <div
              key={enemy.id}
              className="absolute z-20 cursor-pointer"
              style={{ left: `${gridToScreen(pos.x, pos.y).x}px`, top: `${gridToScreen(pos.x, pos.y).y}px`, transform: 'translate(-50%, -50%)', ...enemyTransitionStyle }}
              onClick={handleEnemyMarkerClick(enemy)}
              role="button"
              tabIndex={0}
              onKeyDown={handleEnemyMarkerKeyDown(enemy)}
              aria-label={`View ${enemy.name} info`}
            >
              {inBattle && (
                <div className="absolute -top-10 left-1/2 w-14 -translate-x-1/2">
                  <div className="mb-0.5 text-center font-arcade text-[8px] text-red-200">HP</div>
                  <div className="h-2 overflow-hidden rounded-sm border border-red-900 bg-[#2b0a0a]/90 shadow-[0_0_0_1px_rgba(0,0,0,0.5)]">
                    <div className="h-full bg-gradient-to-r from-red-500 via-rose-500 to-red-400" style={{ width: `${enemyHpRatioForUi}%` }} />
                  </div>
                </div>
              )}
              {(() => {
                const facing = enemyFacings[enemy.id] || DEFAULT_DIRECTION
                const vid = enemy.visualId
                const plMeta = typeof vid === 'string' && vid.startsWith('pixellab:') ? pixelLabPacks[vid] : undefined
                const activeFx = getActiveCombatFx(enemyCombatFx[enemy.id], Date.now())
                const curTarget = enemyTargetsRef.current[enemy.id]
                const isWalking = !!curTarget && Math.hypot(curTarget.x - pos.x, curTarget.y - pos.y) > 0.02
                const animWalking = isWalking || isCombatActionAnim(activeFx)
                const spriteTransform = toCombatSpriteTransform(activeFx, mapCellDisplayPx)
                if (typeof vid === 'string' && vid.startsWith('pixellab:')) {
                  if (plMeta) {
                    return (
                      <div
                        className="drop-shadow-[0_0_8px_rgba(239,68,68,0.45)]"
                        style={{ ...pixelLabSheetActorStyle(plMeta, facing, animWalking, walkAnimTick, actorPx), transform: spriteTransform, transition: 'transform 110ms ease-out', filter: activeFx?.anim === 'hit' ? 'brightness(1.28) saturate(1.18)' : undefined }}
                        role="img"
                        aria-label={enemy.name}
                      />
                    )
                  }
                  return <div className="animate-pulse drop-shadow-[0_0_8px_rgba(239,68,68,0.45)]" style={mapCharacterIdleStyle(vid, actorPx)} role="img" aria-label={enemy.name} />
                }
                const chase = mapBattleControllerRef.current?.session?.chaseState
                const isFleePending = !!showBattle && combatEnemyId !== null && enemy.id === combatEnemyId && chase?.status === 'flee_pending'
                return (
                  <img
                    src={isFleePending ? toEnemyRunningFramePath(facing, walkAnimTick) : animWalking ? toEnemyWalkFramePath(facing, walkAnimTick) : toEnemyIdlePngPath(facing)}
                    alt={enemy.name}
                    className="animate-pulse object-contain drop-shadow-[0_0_8px_rgba(239,68,68,0.45)]"
                    style={{ width: actorPx, height: actorPx, imageRendering: 'pixelated', transform: spriteTransform, transition: 'transform 110ms ease-out, filter 90ms ease-out', filter: activeFx?.anim === 'hit' ? 'brightness(1.24) saturate(1.18)' : undefined }}
                  />
                )
              })()}
              <div className="absolute -bottom-7 left-1/2 -translate-x-1/2 text-[10px] text-amber-100/95 bg-black/75 px-1.5 py-0.5 rounded whitespace-nowrap max-w-[8rem] truncate">
                {enemy.name} Lv.{enemyLevelRangeMin}~{enemyLevelRangeMax}
              </div>
            </div>
          )
        })}

        <div className="absolute pointer-events-none z-30" style={{ left: mounted ? `${gridToScreen(playerPos.x, playerPos.y).x}px` : '15%', top: mounted ? `${gridToScreen(playerPos.x, playerPos.y).y}px` : '80%', transform: mounted ? 'translate(-50%, -50%)' : undefined, transitionProperty: 'left, top', transitionDuration: showBattle ? '300ms' : '120ms', transitionTimingFunction: showBattle ? 'linear' : 'ease-out', willChange: 'left, top' }}>
          {showBattle && (
            <div className="absolute -top-10 left-1/2 w-14 -translate-x-1/2">
              <div className="mb-0.5 text-center font-arcade text-[8px] text-emerald-200">HP</div>
              <div className="h-2 overflow-hidden rounded-sm border border-emerald-900 bg-[#072318]/90 shadow-[0_0_0_1px_rgba(0,0,0,0.5)]">
                <div className="h-full bg-gradient-to-r from-emerald-500 via-lime-400 to-emerald-400" style={{ width: `${playerHpRatioForUi}%` }} />
              </div>
            </div>
          )}
          {(() => {
            const activeFx = getActiveCombatFx(playerCombatFx, Date.now())
            const isAnimMove = Date.now() - playerLastMoveAt < 480 || isCombatActionAnim(activeFx)
            const spriteTransform = toCombatSpriteTransform(activeFx, mapCellDisplayPx)
            if (playerVisualId.startsWith('pixellab:')) {
              return pixelLabPacks[playerVisualId] ? (
                <div className="object-contain drop-shadow-[0_0_6px_rgba(59,130,246,0.45)]" style={{ ...pixelLabSheetActorStyle(pixelLabPacks[playerVisualId]!, playerFacing, isAnimMove, walkAnimTick, actorPx), transform: spriteTransform, transition: 'transform 110ms ease-out, filter 90ms ease-out', filter: activeFx?.anim === 'hit' ? 'brightness(1.28) saturate(1.2)' : undefined }} role="img" aria-label="You" />
              ) : (
                <div className="object-contain drop-shadow-[0_0_6px_rgba(59,130,246,0.45)]" style={mapCharacterIdleStyle(playerVisualId, actorPx)} role="img" aria-label="You" />
              )
            }
            return (
              <img
                src={mapBattleControllerRef.current?.session?.chaseState?.status === 'flee_pending' ? toPlayerRunningFramePath(playerFacing, walkAnimTick) : isAnimMove ? toPlayerWalkFramePath(playerFacing, walkAnimTick) : toPlayerIdlePngPath(playerFacing)}
                alt="You"
                className="object-contain drop-shadow-[0_0_6px_rgba(59,130,246,0.45)]"
                style={{ width: actorPx, height: actorPx, imageRendering: 'pixelated', transform: spriteTransform, transition: 'transform 110ms ease-out, filter 90ms ease-out', filter: activeFx?.anim === 'hit' ? 'brightness(1.24) saturate(1.2)' : undefined }}
              />
            )
          })()}
          <div className="absolute -bottom-7 left-1/2 -translate-x-1/2 text-[10px] text-sky-100 bg-black/75 px-1.5 py-0.5 rounded whitespace-nowrap">You</div>
        </div>

        {showBattle && combatEnemyId !== null && (
          <div className="pointer-events-none absolute inset-0 z-[26] overflow-hidden">
            {projectileFx.map((fx) => {
              const start = gridToScreen(fx.startX, fx.startY)
              const end = gridToScreen(fx.startX + fx.deltaX, fx.startY + fx.deltaY)
              const dx = end.x - start.x
              const dy = end.y - start.y
              const angle = Math.atan2(dy, dx)
              const projectileClass = fx.kind === 'arrow' ? 'oc-projectile-arrow' : fx.kind === 'fireball' ? 'oc-projectile-fireball' : fx.kind === 'arcane_bolt' ? 'oc-projectile-arcane' : fx.kind === 'frost' ? 'oc-projectile-frost' : fx.kind === 'slash' ? 'oc-projectile-slash' : fx.kind === 'support' ? 'oc-projectile-support' : 'oc-projectile-generic'
              return <span key={fx.id} className={`oc-projectile ${projectileClass}`} style={{ left: start.x, top: start.y, ['--proj-dx' as string]: `${dx}px`, ['--proj-dy' as string]: `${dy}px`, ['--proj-rot' as string]: `${angle}rad`, animationDuration: `${fx.durationMs}ms` }} />
            })}
            {impactFx.map((fx) => {
              const p = gridToScreen(fx.x, fx.y)
              const impactClass = fx.kind === 'hit' ? (fx.target === 'player' ? 'oc-impact-hit-player' : 'oc-impact-hit-enemy') : fx.target === 'player' ? 'oc-impact-dodge-player' : 'oc-impact-dodge-enemy'
              return <span key={fx.id} className={`oc-impact ${impactClass}`} style={{ left: p.x, top: p.y }} />
            })}
            {moveFx.map((fx) => {
              const screen = gridToScreen(fx.x, fx.y)
              const tintClass = fx.target === 'player' ? 'oc-battle-step-fx-player' : 'oc-battle-step-fx-enemy'
              return <span key={fx.id} className={`oc-battle-step-fx ${tintClass}`} style={{ left: screen.x, top: screen.y }} />
            })}
            {floatTexts.map((h) => {
              const foe = enemies.find((e) => e.id === combatEnemyId)
              const grid = h.target === 'player' ? playerPos : enemyPositions[combatEnemyId] || (foe ? { x: foe.x, y: foe.y } : playerPos)
              const screen = gridToScreen(grid.x, grid.y)
              const colorClass = h.variant === 'heal' ? 'text-emerald-300' : h.target === 'player' ? 'text-sky-400' : 'text-red-500'
              return (
                <div key={h.id} className={`animate-map-hp-float absolute text-sm font-black tabular-nums [text-shadow:0_1px_2px_rgba(0,0,0,0.85)] ${colorClass}`} style={{ left: screen.x + h.offsetX, top: screen.y - 40 }}>
                  {h.text}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
