# 스킬 변경 판독기 — CLOVA OCR

## 배포 설정

Node.js 18 이상, `npm ci`, `npm start`를 사용합니다. Render의 기존 시작 명령은 그대로 유지합니다.

Render → 서비스 → Environment에 다음 값을 설정하고 재배포하세요.

| 환경변수 | 값 |
| --- | --- |
| `CLOVA_OCR_INVOKE_URL` | CLOVA OCR General 도메인에 표시되는 전체 Invoke URL (`https://…/general`) |
| `CLOVA_OCR_SECRET` | 같은 도메인에서 발급한 Secret Key |

네이버 클라우드 콘솔에서 **CLOVA OCR → General 도메인 → API 연동**을 설정합니다. 계정의 Access Key/Secret Access Key가 아니라 **OCR 도메인의 Secret Key**를 사용해야 합니다. 기존 `ANTHROPIC_API_KEY`는 더 이상 사용하지 않습니다. 키는 Git이나 브라우저에 저장하지 않습니다.

[공식 General OCR API 문서](https://api.ncloud-docs.com/docs/ai-application-service-ocr-ocr)

`/health`에서 provider와 설정 유무만 확인할 수 있습니다. 설정값의 유효성을 검사하거나 비밀값을 반환하지는 않습니다.

## 분석 방식

- 한국어 General OCR V2 (`lang: ko`)를 사용합니다. LLM 호출은 없습니다.
- 라인업은 기존과 같이 타자/투수 탭을 자동 구분하고 591×1280 기준 좌표를 업로드 해상도에 비례해 변환합니다. 전체 화면 11행에 맞춰져 있습니다.
- 라인업 원본 전체 화면을 한 번만 전송합니다. 라인업 한 장당 CLOVA 호출도 한 번입니다.
- OCR `boundingPoly` 좌표를 고정된 11개 선수 행과 타자·투수별 스킬 열에 대입해 이름·포지션·스킬명·레벨을 연결합니다. 두 줄 이름은 위에서 아래로 합칩니다.
- 화면의 기본 스킬명이 일치하면 괄호 조건은 선수의 SP/RP·카드 종류·4성/5성 정보로 자동 선택합니다. 같은 조건의 후보가 여러 개면 데이터시트의 첫 번째 후보를 사용합니다. OCR 신뢰도가 0.8 미만인 스킬명은 직접 확인합니다. 레벨은 지정된 숫자 영역에 신뢰도 0.8 이상의 숫자가 하나일 때만 확정합니다.
- 스킬 변경 모드는 좌우 영역 선택을 유지하며 2회 호출합니다. 등록된 스킬 이름을 찾고 근처에 숫자 배지가 하나일 때만 연결합니다. 인식하지 못한 이름과 숫자는 직접 선택해야 합니다.
- 화면의 `인식된 스킬 이름 보기`에는 CLOVA의 전체 JSON 대신 선수별 스킬 이름과 레벨만 표시합니다.
- 1~4레벨은 원래 숫자로 표시하고 점수 계산에만 5레벨 값을 적용합니다. 미확정 항목이 있으면 추천/순위를 보류합니다.

## 검증

`npm test`는 이름·레벨·좌표 매핑 및 CLOVA 요청/오류 처리 테스트를 실행합니다. 모의 OCR 응답을 사용하며 유료 요청은 발생하지 않습니다. 실제 인식률은 설정 완료 후 게임 스크린샷으로 확인해야 합니다.

`public/index.html` 수정 후 `npm run build:standalone`으로 `skill_analyzer.html`을 갱신합니다. 이 파일도 `/analyze` 서버가 필요합니다. 파일을 직접 열면 수동 계산만 가능하고 OCR은 실행하지 않습니다.
