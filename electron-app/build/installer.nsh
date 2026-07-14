# electron-builder NSIS 커스텀 스크립트 (nsis.include 기본 경로라 자동 포함됨)

# 설치 모드 선택 화면(모든 사용자/현재 사용자)을 건너뛰고 항상 현재 사용자(per-user)로 설치.
# per-user는 %LOCALAPPDATA%\Programs 에 설치되어 자동 업데이트 시 UAC 프롬프트가 뜨지 않음.
!macro customInstallMode
  StrCpy $isForceCurrentInstall "1"
!macroend
