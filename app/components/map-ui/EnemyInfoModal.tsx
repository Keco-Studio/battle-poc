'use client'

export type EnemyInfoModalProps = {
  open: boolean
  enemyName: string
  enemyPreview: { level: number; stats: { maxHp: number; atk: number; def: number; spd: number } }
  onClose: () => void
}

export default function EnemyInfoModal(props: EnemyInfoModalProps) {
  const { open, enemyName, enemyPreview, onClose } = props
  if (!open) return null

  return (
    <div className="absolute inset-0 flex items-center justify-center z-40 bg-black/50">
      <div className="bg-gray-900/90 backdrop-blur-md rounded-xl p-6 w-72 border border-gray-700">
        <h3 className="text-xl font-bold text-white mb-4 text-center">{enemyName}</h3>
        <div className="flex justify-center mb-4">
          <img src="/enemy/idle/south.png" alt="Enemy" className="h-32 object-contain" />
        </div>
        <div className="space-y-2 text-white">
          <div className="flex justify-between">
            <span className="text-gray-400">等级</span>
            <span className="font-bold text-yellow-400">Lv.{enemyPreview.level}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">类型</span>
            <span className="font-bold text-red-400">恶魔族</span>
          </div>
          <div className="text-xs text-gray-500 -mt-1 mb-1">以下为本次遭遇的实际战斗属性</div>
          <div className="flex justify-between">
            <span className="text-gray-400">HP</span>
            <span className="font-bold text-green-400">{enemyPreview.stats.maxHp}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">攻击</span>
            <span className="font-bold text-red-400">{enemyPreview.stats.atk}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">防御</span>
            <span className="font-bold text-blue-400">{enemyPreview.stats.def}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">速度</span>
            <span className="font-bold text-yellow-400">{enemyPreview.stats.spd}</span>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="mt-4 w-full py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-gray-300 transition-colors"
        >
          关闭
        </button>
      </div>
    </div>
  )
}

