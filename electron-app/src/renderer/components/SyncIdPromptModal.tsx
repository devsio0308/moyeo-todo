interface Props {
  onGoToSettings: () => void
  onDismiss: () => void
}

/**
 * 캐릭터 0명 + 동기화 ID 미등록 상태에서 캐릭터 탭 진입 시 뜨는 안내 팝업.
 * 여기서 바로 입력받지 않고 설정 화면의 "동기화 ID 연동" 섹션으로 보낸다.
 */
export default function SyncIdPromptModal({ onGoToSettings, onDismiss }: Props): React.JSX.Element {
  return (
    <div className="modal-backdrop" onClick={onDismiss}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">동기화 ID를 등록해보세요</h2>
        <p className="modal-desc">
          동기화 ID를 등록하면 캐릭터·퀘스트 진행 상황이 자동으로 클라우드에 백업되고,
          휴대폰 웹앱에서도 같은 데이터로 퀘스트를 체크할 수 있어요.
        </p>
        <div className="modal-actions">
          <button className="settings-btn" onClick={onDismiss}>
            나중에
          </button>
          <button className="add-task-btn" onClick={onGoToSettings}>
            입력하기
          </button>
        </div>
      </div>
    </div>
  )
}
