import type { StoreShape, TaskState } from '../../shared/types'
import { useDashboardStore } from '../store/useDashboardStore'

/**
 * 어드민 대시보드 (#22) — 캐릭터 전체를 가로질러 "누가 아직 안 했나"를 보여준다.
 * 퀘스트 이름에 키워드가 포함된 항목을 기준으로 집계 (카탈로그/커스텀 무관).
 */

/** 주요 주간 퀘스트 — 미완료 캐릭터를 보여줄 대상 */
const KEY_WEEKLY_QUESTS = [
  '불길한 소환의 결계',
  '필드 보스',
  '검은/심층 구멍',
  '심층던전 매우 어려움'
]

/** 레이드 — 별도 섹션으로 레이드별 미클리어 캐릭터 나열 */
const RAID_QUESTS = ['타바르타스', '에이렐', '화이트 서큐버스']

interface Incomplete {
  characterId: string
  name: string
  /** 카운트 퀘스트면 진행도 표시용 */
  count?: number
  target?: number
}

/** keyword 매칭 — 같은 이름이 일일/주간에 둘 다 있으면(검은/심층 구멍 분할) 주간 우선.
 *  대시보드는 '주간 현황' 보드라 주간 쪽 집계가 의미 있는 숫자다 */
function findKeywordTask(tasks: Record<string, TaskState>, keyword: string): TaskState | undefined {
  const matches = Object.values(tasks).filter((t) => t.displayName.includes(keyword))
  return matches.find((t) => t.period === 'weekly') ?? matches[0]
}

/** keyword를 포함한 퀘스트가 미완료인 캐릭터 목록 (캐릭터 탭 순서) */
function incompleteCharacters(data: StoreShape, keyword: string): Incomplete[] {
  const out: Incomplete[] = []
  for (const charId of data.characterOrder) {
    const character = data.characters[charId]
    if (!character) continue
    const task = findKeywordTask(character.tasks, keyword)
    if (!task || task.done) continue
    const target = task.targetCount ?? 1
    out.push({
      characterId: charId,
      name: character.displayName,
      ...(target > 1 ? { count: task.count ?? 0, target } : {})
    })
  }
  return out
}

/** keyword 퀘스트를 보유한 캐릭터 수 (분모 표시용) */
function holderCount(data: StoreShape, keyword: string): number {
  return data.characterOrder.filter(
    (id) => findKeywordTask(data.characters[id]?.tasks ?? {}, keyword) !== undefined
  ).length
}

function QuestCard({
  data,
  keyword
}: {
  data: StoreShape
  keyword: string
}): React.JSX.Element {
  const incomplete = incompleteCharacters(data, keyword)
  const holders = holderCount(data, keyword)
  const allDone = holders > 0 && incomplete.length === 0

  return (
    <div className={`dash-card ${allDone ? 'dash-card-done' : ''}`}>
      <div className="dash-card-head">
        <span className="dash-card-title">{keyword}</span>
        <span className="dash-card-count">
          {holders === 0 ? '보유 없음' : `미완료 ${incomplete.length}/${holders}`}
        </span>
      </div>
      {holders === 0 ? (
        <p className="dash-empty">이 퀘스트를 가진 캐릭터가 없습니다</p>
      ) : allDone ? (
        <p className="dash-all-done">✅ 전원 완료</p>
      ) : (
        <div className="dash-chips">
          {incomplete.map((c) => (
            <span className="dash-chip" key={c.characterId}>
              {c.name}
              {c.target && (
                <span className="dash-chip-progress">
                  {c.count}/{c.target}
                </span>
              )}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

export default function DashboardView(): React.JSX.Element {
  const data = useDashboardStore((s) => s.data)

  if (!data) return <></>
  if (data.characterOrder.length === 0) {
    return (
      <p className="placeholder">
        캐릭터 메뉴에서 캐릭터를 추가하면 주간 현황이 여기에 표시됩니다.
      </p>
    )
  }

  return (
    <div className="dashboard">
      <section className="dash-section">
        <h2 className="dash-section-title">주요 주간 퀘스트</h2>
        <div className="dash-grid">
          {KEY_WEEKLY_QUESTS.map((k) => (
            <QuestCard key={k} data={data} keyword={k} />
          ))}
        </div>
      </section>

      <section className="dash-section">
        <h2 className="dash-section-title">레이드</h2>
        <div className="dash-grid">
          {RAID_QUESTS.map((k) => (
            <QuestCard key={k} data={data} keyword={k} />
          ))}
        </div>
      </section>
    </div>
  )
}
