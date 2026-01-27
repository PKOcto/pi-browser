# Pi-Browser

**다중 AI 모델을 활용한 브라우저 자동화 CLI 도구**

자연어로 브라우저를 제어하세요. Google Gemini, OpenAI GPT, Anthropic Claude, 그리고 Ollama 로컬 모델까지 다양한 AI 모델을 지원합니다.

## 주요 기능

- **자연어 브라우저 제어**: "쿠팡에서 아이폰 가격 알려줘" 같은 자연어 명령으로 브라우저 조작
- **다중 모델 지원**: 20개 이상의 AI 제공자와 수백 개의 모델 지원
- **로컬 모델 지원**: Ollama를 통한 완전 오프라인 실행 가능
- **Extension 모드**: 기존 Chrome 로그인 상태 유지하며 자동화 (네이버, 구글 등 로그인 필요 서비스)
- **에이전트 루프**: 목표 달성까지 자동으로 반복 실행
- **스크린샷 분석**: AI가 화면을 보고 상황 판단

## 설치

### 요구사항

- Node.js 20.0.0 이상
- Google Chrome 브라우저
- (선택) Ollama - 로컬 모델 사용 시

### 설치 방법

```bash
# 저장소 클론
git clone https://github.com/nicklockwood/pi-browser.git
cd pi-browser

# 의존성 설치
npm install
# 또는
pnpm install

# 환경 변수 설정
cp .env.example .env
# .env 파일을 열어 API 키 입력
```

## 환경 설정

`.env` 파일에 사용할 AI 제공자의 API 키를 설정하세요:

```env
# Google Gemini (무료 티어 있음)
GOOGLE_API_KEY=your-google-api-key

# Anthropic Claude
ANTHROPIC_API_KEY=your-anthropic-api-key

# OpenAI
OPENAI_API_KEY=your-openai-api-key

# 기타 제공자 (선택)
MISTRAL_API_KEY=your-mistral-api-key
GROQ_API_KEY=your-groq-api-key
XAI_API_KEY=your-xai-api-key
OPENROUTER_API_KEY=your-openrouter-api-key
```

### API 키 발급 방법

| 제공자 | 발급 링크 | 무료 티어 |
|--------|----------|----------|
| Google | [Google AI Studio](https://aistudio.google.com/apikey) | 있음 |
| Anthropic | [Anthropic Console](https://console.anthropic.com/) | 없음 |
| OpenAI | [OpenAI Platform](https://platform.openai.com/api-keys) | 없음 |
| Groq | [Groq Console](https://console.groq.com/) | 있음 |
| Mistral | [Mistral AI](https://console.mistral.ai/) | 있음 |

## 사용법

### 기본 사용 (CDP 모드)

별도의 Chrome 인스턴스를 실행하여 브라우저를 제어합니다.

```bash
# 브라우저 작업 실행
npm start '쿠팡에서 아이폰 16 가격 알려줘'
npm start '네이버에서 오늘 날씨 확인해줘'
npm start '구글에서 맛집 검색해줘'

# 대화형 모드 (여러 작업 연속 실행)
npm start
```

### Extension 모드 (로그인 상태 유지)

기존 Chrome 브라우저를 제어하여 **로그인 상태를 유지**합니다. 네이버 메일, 구글 드라이브 등 로그인이 필요한 서비스를 자동화할 때 유용합니다.

```bash
# Extension 모드로 시작
npm start /ext
# 또는
npm start /extension

# Extension 모드에서 작업 실행
npm start /ext
> 네이버 메일에서 최근 메일 3개 제목 알려줘
> 구글 드라이브에서 최근 파일 목록 보여줘
```

#### Extension 설치 방법

1. Chrome에서 `chrome://extensions` 열기
2. 우측 상단 **개발자 모드** 활성화
3. **압축해제된 확장 프로그램을 로드합니다** 클릭
4. `pi-browser/extension` 폴더 선택
5. Extension이 설치되면 아이콘에 "ON" 배지가 표시됨

#### Extension 모드 vs CDP 모드

| 기능 | Extension 모드 | CDP 모드 |
|------|---------------|----------|
| 로그인 상태 유지 | **유지됨** | 새 세션 |
| 설치 필요 | Extension 설치 | 없음 |
| 브라우저 | 기존 Chrome | 별도 Chrome |
| 추천 용도 | 로그인 필요 서비스 | 일반 웹 탐색 |

### 병렬 처리 모드 (Multi-Browser)

여러 브라우저로 동시에 작업을 실행합니다.

```bash
# 익명 브라우저 (로그인 없음) - 숫자로 개수 지정
npm start '/parallel 3 "구글에서 날씨 검색" "네이버에서 뉴스 검색" "다음에서 영화 검색"'

# 프로필 브라우저 (로그인 유지) - 프로필명으로 지정
npm start '/parallel "Default,Profile 1" "네이버 메일 확인" "Gmail 확인"'

# 프로필 목록 확인
npm start /profiles
```

#### 익명 vs 프로필 모드

| 모드 | 사용법 | 로그인 | 용도 |
|------|--------|--------|------|
| 익명 | `/parallel 3 "작업"...` | 없음 | 단순 검색, 크롤링 |
| 프로필 | `/parallel "Profile1,Profile2" "작업"...` | 유지 | 로그인 필요 서비스 |

#### 병렬 처리 특징

- 각 브라우저가 독립적으로 동시 실행
- 작업 수 > 브라우저 수인 경우 라운드 로빈 배분
- 처리 시간 대폭 단축

**주의**: 프로필 모드는 해당 프로필 사용 중인 Chrome을 종료해야 합니다.

### 모델 관리

```bash
# 사용 가능한 모델 목록 보기
npm start /models

# 모델 변경
npm start '/set google gemini-2.5-flash'
npm start '/set anthropic claude-sonnet-4-20250514'
npm start '/set openai gpt-4o'
npm start '/set groq llama-3.3-70b-versatile'

# 현재 설정 확인
npm start /config
```

### Ollama 로컬 모델 사용

Ollama를 사용하면 인터넷 없이 로컬에서 AI를 실행할 수 있습니다.

```bash
# 1. Ollama 설치 (https://ollama.ai)
# macOS
brew install ollama

# 2. 모델 다운로드 및 실행
ollama run llama3.2
# 또는
ollama run qwen2.5
ollama run mistral

# 3. Pi-Browser에서 Ollama 사용
npm start '/set ollama llama3.2'
npm start '구글 열어줘'

# Ollama URL 변경 (기본: http://localhost:11434/v1)
npm start '/ollama-url http://192.168.1.100:11434/v1'
```

#### 추천 Ollama 모델

| 모델 | 크기 | 용도 | 명령어 |
|------|------|------|--------|
| llama3.2 | 3B | 빠른 응답, 가벼움 | `ollama run llama3.2` |
| llama3.1 | 8B | 균형잡힌 성능 | `ollama run llama3.1` |
| qwen2.5 | 7B | 다국어 지원 우수 | `ollama run qwen2.5` |
| mistral | 7B | 유럽어 특화 | `ollama run mistral` |
| gemma2 | 9B | 코드 이해 우수 | `ollama run gemma2` |

## 명령어 목록

| 명령어 | 설명 | 예시 |
|--------|------|------|
| `/ext` 또는 `/extension` | Extension 모드로 시작 | `npm start /ext` |
| `/parallel <N>` | 익명 브라우저 N개 병렬 | `npm start '/parallel 3 "작업1" "작업2" "작업3"'` |
| `/parallel "profiles"` | 프로필 브라우저 병렬 | `npm start '/parallel "Default,Profile 1" "작업1" "작업2"'` |
| `/profiles` | Chrome 프로필 목록 | `npm start /profiles` |
| `/models` | 사용 가능한 모델 목록 | `npm start /models` |
| `/set <provider> <model>` | 모델 변경 | `npm start '/set google gemini-2.5-flash'` |
| `/config` | 현재 설정 확인 | `npm start /config` |
| `/help` | 도움말 | `npm start /help` |
| `exit` | 종료 (대화형 모드) | - |

## 브라우저 도구

AI가 사용할 수 있는 브라우저 제어 도구:

| 도구 | 설명 |
|------|------|
| `browser_navigate` | URL로 이동 |
| `browser_click` | 요소 클릭 |
| `browser_fill` | 입력 필드에 텍스트 입력 |
| `browser_press` | 키보드 키 누르기 (Enter, Tab 등) |
| `browser_screenshot` | 스크린샷 촬영 |
| `browser_snapshot` | 페이지의 상호작용 가능한 요소 목록 |
| `browser_scroll` | 페이지 스크롤 |
| `browser_get_text` | 페이지 텍스트 추출 |

## 사용 예시

### Extension 모드 (로그인 필요 서비스)
```bash
npm start /ext
> 네이버 메일에서 최근 메일 3개 제목 알려줘
> Gmail에서 안 읽은 메일 개수 알려줘
> 구글 캘린더에서 오늘 일정 보여줘
```

### 쇼핑 검색
```bash
npm start '쿠팡에서 에어팟 프로 2 가격 비교해줘'
npm start '11번가에서 가장 저렴한 키보드 찾아줘'
```

### 정보 검색
```bash
npm start '네이버에서 서울 날씨 알려줘'
npm start '구글에서 맥북 프로 M4 스펙 검색해줘'
```

### 웹사이트 탐색
```bash
npm start 'GitHub에서 trending repositories 보여줘'
npm start 'YouTube에서 코딩 튜토리얼 검색해줘'
```

## 문제 해결

### Extension이 연결되지 않음
```bash
# 1. Extension이 설치되어 있는지 확인
#    chrome://extensions 에서 "Pi-Browser Controller" 확인

# 2. Extension 아이콘에 "ON" 배지가 있는지 확인
#    없으면 Extension을 다시 로드

# 3. WebSocket 포트 확인 (9876)
lsof -i :9876
```

### Chrome이 실행되지 않음 (CDP 모드)
```bash
# Chrome 경로 확인 (macOS)
ls "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

# 다른 Chrome 프로세스가 CDP 포트를 사용 중인지 확인
lsof -i :9444
```

### API 키 오류
```bash
# .env 파일 확인
cat .env

# 환경 변수가 로드되는지 확인
node -e "require('dotenv').config(); console.log(process.env.GOOGLE_API_KEY ? 'OK' : 'Not set')"
```

### Ollama 연결 실패
```bash
# Ollama 실행 상태 확인
curl http://localhost:11434/api/tags

# Ollama 서비스 시작
ollama serve
```

## 프로젝트 구조

```
pi-browser/
├── src/
│   └── cli.ts           # 메인 CLI 코드
├── extension/           # Chrome Extension
│   ├── manifest.json    # Extension 설정
│   ├── background.js    # 서비스 워커
│   ├── popup.html       # 팝업 UI
│   ├── popup.js         # 팝업 스크립트
│   └── icon*.png        # 아이콘
├── dist/                # 빌드 출력
├── .env                 # 환경 변수 (API 키)
├── .env.example         # 환경 변수 예시
├── package.json         # 프로젝트 설정
├── tsconfig.json        # TypeScript 설정
└── README.md            # 이 파일
```

## 지원 AI 제공자

### 클라우드 제공자
- **Google**: Gemini 2.5 Flash, Gemini 2.5 Pro, Gemini 3 등
- **Anthropic**: Claude Sonnet 4, Claude Opus 4.5, Claude Haiku 등
- **OpenAI**: GPT-4o, GPT-4.1, o1, o3 등
- **Mistral**: Mistral Large, Codestral, Devstral 등
- **Groq**: Llama 3.3 70B, Mixtral 등 (빠른 추론)
- **xAI**: Grok 2, Grok 3 등
- **OpenRouter**: 200개 이상의 모델 접근
- **Amazon Bedrock**: AWS 관리형 AI
- **Google Vertex AI**: GCP 관리형 AI

### 로컬 제공자
- **Ollama**: Llama, Mistral, Qwen, Gemma 등 오픈소스 모델

## 라이선스

MIT License

## 크레딧

- [@mariozechner/pi-ai](https://github.com/nicklockwood/pi-ai) - 다중 AI 제공자 통합 라이브러리
- [Playwright](https://playwright.dev/) - 브라우저 자동화
- [TypeBox](https://github.com/sinclairzx81/typebox) - 타입 안전 스키마

---

**문의 및 기여**: 이슈나 PR은 언제든 환영합니다!
