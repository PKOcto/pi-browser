#!/usr/bin/env node
/**
 * Pi-Browser CLI
 * Multi-model AI browser control using Pi-AI
 *
 * Supported providers: OpenAI, Anthropic, Google, Mistral, Groq, OpenRouter, etc.
 */

import "dotenv/config";
import readline from "node:readline";
import { chromium, type Browser, type Page, type BrowserContext } from "playwright-core";
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { Type } from "@sinclair/typebox";
import {
  getModel,
  streamSimple,
  getProviders,
  getModels,
  type Context,
  type Tool,
  type Model,
  type AssistantMessage,
} from "@mariozechner/pi-ai";

// ============================================================
// 색상
// ============================================================
const c = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
};

// ============================================================
// 브라우저 관리
// ============================================================
interface RunningChrome {
  process: ChildProcess;
  cdpUrl: string;
  userDataDir: string;
}

let chromeProcess: RunningChrome | null = null;
let browser: Browser | null = null;
let context: BrowserContext | null = null;

function findChromeExecutable(): string | null {
  const platform = os.platform();
  const paths: string[] =
    platform === "darwin"
      ? [
          "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
          "/Applications/Chromium.app/Contents/MacOS/Chromium",
        ]
      : platform === "linux"
        ? ["/usr/bin/google-chrome", "/usr/bin/chromium"]
        : [
            path.join(process.env.PROGRAMFILES || "", "Google/Chrome/Application/chrome.exe"),
            path.join(process.env.LOCALAPPDATA || "", "Google/Chrome/Application/chrome.exe"),
          ];

  for (const p of paths) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

async function startBrowser(): Promise<void> {
  if (browser) return;

  const executablePath = findChromeExecutable();
  if (!executablePath) throw new Error("Chrome not found");

  const cdpPort = 9444;
  const userDataDir = path.join(os.tmpdir(), `pi-browser-${Date.now()}`);
  fs.mkdirSync(userDataDir, { recursive: true });

  const args = [
    `--remote-debugging-port=${cdpPort}`,
    `--user-data-dir=${userDataDir}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-sync",
    "about:blank",
  ];

  const proc = spawn(executablePath, args, {
    detached: false,
    stdio: ["ignore", "pipe", "pipe"],
  });

  const cdpUrl = `http://127.0.0.1:${cdpPort}`;

  // CDP 준비 대기
  for (let i = 0; i < 50; i++) {
    try {
      const res = await fetch(`${cdpUrl}/json/version`, { signal: AbortSignal.timeout(500) });
      if (res.ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }

  chromeProcess = { process: proc, cdpUrl, userDataDir };
  browser = await chromium.connectOverCDP(cdpUrl);
  const contexts = browser.contexts();
  context = contexts[0] ?? (await browser.newContext());
}

async function stopBrowser(): Promise<void> {
  if (browser) {
    await browser.close();
    browser = null;
    context = null;
  }
  if (chromeProcess) {
    chromeProcess.process.kill("SIGTERM");
    chromeProcess = null;
  }
}

async function getPage(): Promise<Page> {
  if (!context) throw new Error("Browser not running");
  const pages = context.pages();
  return pages[0] ?? (await context.newPage());
}

// ============================================================
// 브라우저 도구 정의
// ============================================================
const browserTools: Tool[] = [
  {
    name: "browser_navigate",
    description: "Navigate to a URL",
    parameters: Type.Object({
      url: Type.String({ description: "The URL to navigate to" }),
    }),
  },
  {
    name: "browser_click",
    description: "Click an element by selector",
    parameters: Type.Object({
      selector: Type.String({ description: "CSS selector or text selector" }),
    }),
  },
  {
    name: "browser_fill",
    description: "Fill text into an input field",
    parameters: Type.Object({
      selector: Type.String({ description: "CSS selector for the input field" }),
      text: Type.String({ description: "Text to fill" }),
    }),
  },
  {
    name: "browser_press",
    description: "Press a keyboard key",
    parameters: Type.Object({
      key: Type.String({ description: "Key to press such as Enter, Tab, Escape" }),
    }),
  },
  {
    name: "browser_screenshot",
    description: "Take a screenshot of the current page",
    parameters: Type.Object({}),
  },
  {
    name: "browser_snapshot",
    description: "Get the accessibility snapshot of the page with interactive elements",
    parameters: Type.Object({}),
  },
  {
    name: "browser_scroll",
    description: "Scroll the page up or down",
    parameters: Type.Object({
      direction: Type.String({ description: "Scroll direction: up or down" }),
    }),
  },
  {
    name: "browser_get_text",
    description: "Get text content from the page",
    parameters: Type.Object({
      selector: Type.String({ description: "CSS selector or empty string for full page" }),
    }),
  },
];

// ============================================================
// 브라우저 도구 실행
// ============================================================
async function executeBrowserTool(
  name: string,
  args: Record<string, unknown>
): Promise<{ text: string; image?: { data: string; mimeType: string } }> {
  if (!browser) {
    await startBrowser();
  }

  const page = await getPage();

  switch (name) {
    case "browser_navigate": {
      await page.goto(args.url as string, { waitUntil: "domcontentloaded" });
      const title = await page.title();
      return { text: `Navigated to ${args.url}. Title: ${title}` };
    }

    case "browser_click": {
      const selector = args.selector as string;
      // role:"name" 형식 처리
      const roleMatch = selector.match(/^(\w+):"([^"]*)"$/);
      if (roleMatch) {
        const [, role, name] = roleMatch;
        await page.getByRole(role as any, { name, exact: false }).first().click();
      } else if (selector.match(/^\w+$/)) {
        // role만 있는 경우
        await page.getByRole(selector as any).first().click();
      } else {
        // 일반 CSS 셀렉터
        await page.locator(selector).first().click();
      }
      await page.waitForTimeout(1000);
      return { text: `Clicked: ${selector}` };
    }

    case "browser_fill": {
      const selector = args.selector as string;
      const text = args.text as string;
      // role:"name" 형식 처리
      const roleMatch = selector.match(/^(\w+):"([^"]*)"$/);
      if (roleMatch) {
        const [, role, name] = roleMatch;
        await page.getByRole(role as any, { name, exact: false }).first().fill(text);
      } else if (selector.match(/^\w+$/)) {
        // role만 있는 경우 (예: textbox, searchbox)
        await page.getByRole(selector as any).first().fill(text);
      } else {
        // 일반 CSS 셀렉터
        await page.locator(selector).first().fill(text);
      }
      return { text: `Filled "${text}" into ${selector}` };
    }

    case "browser_press": {
      await page.keyboard.press(args.key as string);
      await page.waitForTimeout(500);
      return { text: `Pressed: ${args.key}` };
    }

    case "browser_screenshot": {
      const buffer = await page.screenshot({ type: "jpeg", quality: 80 });
      return {
        text: "Screenshot captured",
        image: {
          data: buffer.toString("base64"),
          mimeType: "image/jpeg",
        },
      };
    }

    case "browser_snapshot": {
      // Playwright의 ariaSnapshot 사용 (클로드봇 방식)
      const ariaSnapshot = await page.locator(":root").ariaSnapshot();

      // 인터랙티브 요소만 추출
      const lines = String(ariaSnapshot || "").split("\n");
      const interactiveRoles = ["button", "link", "textbox", "searchbox", "combobox", "checkbox", "radio"];
      const results: string[] = [];
      let refIdx = 1;

      for (const line of lines) {
        const match = line.match(/^\s*-\s*(\w+)(?:\s+"([^"]*)")?/);
        if (!match) continue;

        const [, role, name] = match;
        if (!interactiveRoles.includes(role.toLowerCase())) continue;

        // ref 형식: role:name 또는 role만
        const ref = name ? `${role}:"${name}"` : role;
        results.push(`[e${refIdx}] ${role}${name ? ` "${name}"` : ""} → ${ref}`);
        refIdx++;

        if (refIdx > 20) break; // 최대 20개
      }

      return { text: `Page elements (use ref value for selector):\n${results.join("\n")}` };
    }

    case "browser_scroll": {
      const dir = args.direction as string;
      const amount = dir === "down" ? 500 : -500;
      await page.evaluate(`window.scrollBy(0, ${amount})`);
      return { text: `Scrolled ${dir}` };
    }

    case "browser_get_text": {
      const selector = args.selector as string | undefined;
      const text = selector
        ? (await page.locator(selector).first().textContent()) ?? ""
        : await page.evaluate(() => document.body.innerText);
      return { text: text.slice(0, 2000) };
    }

    default:
      return { text: `Unknown tool: ${name}` };
  }
}

// ============================================================
// 설정
// ============================================================
interface Config {
  provider: string;
  model: string;
  ollamaUrl?: string;
}

const CONFIG_PATH = path.join(os.homedir(), ".pi-browser.json");

function loadConfig(): Config {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
    }
  } catch {}
  return { provider: "google", model: "gemini-2.5-flash" };
}

function saveConfig(config: Config): void {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

// Ollama 모델 생성
function createOllamaModel(modelId: string, baseUrl: string = "http://localhost:11434/v1"): Model {
  return {
    id: modelId,
    name: `${modelId} (Ollama)`,
    api: "openai-completions",
    provider: "ollama",
    baseUrl,
    reasoning: false,
    input: ["text"],
    output: ["text"],
    inputTokenLimit: 128000,
    outputTokenLimit: 8192,
  } as Model;
}

// 모델 가져오기 (Ollama 지원)
function resolveModel(config: Config): Model {
  if (config.provider === "ollama") {
    return createOllamaModel(config.model, config.ollamaUrl);
  }
  return getModel(config.provider as any, config.model as any);
}

// ============================================================
// 에이전트 루프
// ============================================================
async function runAgent(mission: string, model: Model, isOllama: boolean = false): Promise<void> {
  console.log(`\n${c.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c.reset}`);
  console.log(`${c.bright}🎯 미션: ${mission}${c.reset}`);
  console.log(`${c.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c.reset}\n`);

  const ctx: Context = {
    systemPrompt: `You are a browser automation agent. Complete the user's mission using browser tools.

TOOLS:
- browser_navigate: {"url": "https://..."} - Go to URL
- browser_snapshot: {} - Get list of elements with selectors
- browser_fill: {"selector": "...", "text": "..."} - Type text
- browser_click: {"selector": "..."} - Click element
- browser_press: {"key": "Enter"} - Press key
- browser_screenshot: {} - Capture screen
- browser_get_text: {"selector": ""} - Get page text

WORKFLOW:
1. browser_navigate to the website
2. browser_snapshot to find element selectors
3. Use the EXACT selector from snapshot for browser_fill/browser_click
4. browser_press key="Enter" to submit
5. Report results

IMPORTANT:
- ALWAYS use browser_snapshot first to get correct selectors
- Use the selector value exactly as shown in snapshot output
- Common selectors: textarea[name="q"] for Google search, #search_input for Naver
- After filling, press Enter to submit

Be concise. Report final results clearly.`,
    messages: [{ role: "user", content: mission }],
    tools: browserTools,
  };

  const maxTurns = 20;

  for (let turn = 0; turn < maxTurns; turn++) {
    console.log(`${c.blue}[Turn ${turn + 1}/${maxTurns}]${c.reset}`);

    let response: AssistantMessage;

    try {
      // 스트리밍으로 응답 받기
      const streamOptions = isOllama ? { apiKey: "ollama" } : undefined;
      const s = streamSimple(model, ctx, streamOptions);
      let textBuffer = "";

      process.stdout.write(`${c.magenta}AI: ${c.reset}`);

      for await (const event of s) {
        if (event.type === "text_delta") {
          process.stdout.write(event.delta);
          textBuffer += event.delta;
        } else if (event.type === "tool_call_start") {
          console.log(`\n${c.dim}[tool: ${event.name}]${c.reset}`);
        }
      }

      response = await s.result();
      console.log();
    } catch (error) {
      console.log(`${c.red}Error: ${(error as Error).message}${c.reset}`);
      break;
    }

    ctx.messages.push(response);

    // 디버그: 응답 내용 출력
    if (response.content.length === 0) {
      console.log(`${c.dim}[DEBUG] Empty response content${c.reset}`);
    }

    // 도구 호출 처리
    const toolCalls = response.content.filter((b) => b.type === "toolCall");

    if (toolCalls.length === 0) {
      // 텍스트 응답이 있으면 완료
      const textContent = response.content.find((b) => b.type === "text");
      if (textContent) {
        console.log(`\n${c.green}✅ 미션 완료${c.reset}\n`);
      } else {
        console.log(`${c.yellow}⚠️ AI가 도구를 호출하지 않았습니다. 다시 시도...${c.reset}`);
        // 재시도 메시지 추가
        ctx.messages.push({
          role: "user",
          content: "도구를 사용해서 작업을 수행하세요. 먼저 browser_navigate로 웹사이트에 접속하세요.",
        });
        continue;
      }
      break;
    }

    // 도구 실행
    for (const call of toolCalls) {
      console.log(`${c.yellow}  → ${call.name}(${JSON.stringify(call.arguments)})${c.reset}`);

      try {
        const result = await executeBrowserTool(call.name, call.arguments as Record<string, unknown>);

        console.log(`${c.green}  ✓ ${result.text.split("\n")[0]}${c.reset}`);

        // 도구 결과 추가
        const content: Array<{ type: "text"; text: string } | { type: "image"; data: string; mimeType: string }> = [
          { type: "text", text: result.text },
        ];

        if (result.image) {
          content.push({
            type: "image",
            data: result.image.data,
            mimeType: result.image.mimeType,
          });
        }

        ctx.messages.push({
          role: "toolResult",
          toolCallId: call.id,
          toolName: call.name,
          content,
          isError: false,
          timestamp: Date.now(),
        });
      } catch (error) {
        const errMsg = (error as Error).message;
        console.log(`${c.red}  ✗ ${errMsg}${c.reset}`);

        ctx.messages.push({
          role: "toolResult",
          toolCallId: call.id,
          toolName: call.name,
          content: [{ type: "text", text: `Error: ${errMsg}` }],
          isError: true,
          timestamp: Date.now(),
        });
      }
    }

    console.log();
  }
}

// ============================================================
// CLI
// ============================================================
function printBanner(config: Config) {
  console.log(`
${c.cyan}╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║   ${c.bright}🤖 Pi-Browser CLI${c.reset}${c.cyan}                                          ║
║   ${c.dim}Multi-Model AI Browser Control${c.reset}${c.cyan}                             ║
║                                                               ║
╠═══════════════════════════════════════════════════════════════╣
║                                                               ║
║   ${c.yellow}현재 모델: ${config.provider}/${config.model}${c.cyan}
║                                                               ║
║   ${c.dim}명령어:${c.cyan}                                                    ║
║   ${c.green}/models${c.cyan} - 사용 가능한 모델 목록                           ║
║   ${c.green}/set <provider> <model>${c.cyan} - 모델 변경                       ║
║   ${c.green}/ollama-url <url>${c.cyan} - Ollama URL 설정                       ║
║   ${c.green}/config${c.cyan} - 현재 설정 확인                                  ║
║   ${c.green}exit${c.cyan} - 종료                                               ║
║                                                               ║
║   ${c.dim}예시:${c.cyan}                                                      ║
║   ${c.green}> 쿠팡에서 아이폰 16 가격 알려줘${c.cyan}                          ║
║   ${c.green}> 네이버에서 오늘 날씨 확인해줘${c.cyan}                           ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝${c.reset}
`);
}

function printModels() {
  const providers = getProviders();
  console.log(`\n${c.cyan}사용 가능한 Provider:${c.reset}`);

  // Ollama 추가
  console.log(`\n${c.yellow}ollama (로컬):${c.reset}`);
  console.log(`  - llama3.2`);
  console.log(`  - llama3.1`);
  console.log(`  - mistral`);
  console.log(`  - qwen2.5`);
  console.log(`  - gemma2`);
  console.log(`  ${c.dim}(ollama list로 설치된 모델 확인)${c.reset}`);

  for (const provider of providers) {
    const models = getModels(provider);
    console.log(`\n${c.yellow}${provider}:${c.reset}`);
    const modelIds = models.map((m) => m.id);
    for (const modelId of modelIds.slice(0, 10)) {
      console.log(`  - ${modelId}`);
    }
    if (modelIds.length > 10) {
      console.log(`  ... 외 ${modelIds.length - 10}개`);
    }
  }
  console.log();
}

async function main() {
  const config = loadConfig();

  // 커맨드 라인 인자 처리
  const args = process.argv.slice(2);
  if (args.length > 0) {
    const arg = args.join(" ");

    // 명령어 처리
    if (arg === "/models") {
      printModels();
      process.exit(0);
    }

    if (arg === "/config") {
      console.log(`\n${c.cyan}현재 설정:${c.reset}`);
      console.log(`  Provider: ${config.provider}`);
      console.log(`  Model: ${config.model}`);
      if (config.provider === "ollama") {
        console.log(`  Ollama URL: ${config.ollamaUrl || "http://localhost:11434/v1"}`);
      }
      console.log(`  Config: ${CONFIG_PATH}\n`);
      process.exit(0);
    }

    if (arg.startsWith("/set ")) {
      const parts = arg.slice(5).split(" ");
      if (parts.length >= 2) {
        const [provider, ...modelParts] = parts;
        const model = modelParts.join(" ");

        // Ollama는 유효성 검사 없이 설정
        if (provider === "ollama") {
          config.provider = provider;
          config.model = model;
          saveConfig(config);
          console.log(`${c.green}Ollama 모델 설정됨: ${model}${c.reset}`);
          console.log(`${c.dim}URL: ${config.ollamaUrl || "http://localhost:11434/v1"}${c.reset}\n`);
        } else {
          try {
            getModel(provider as any, model as any);
            config.provider = provider;
            config.model = model;
            saveConfig(config);
            console.log(`${c.green}모델 변경됨: ${provider}/${model}${c.reset}\n`);
          } catch (error) {
            console.log(`${c.red}잘못된 모델: ${(error as Error).message}${c.reset}\n`);
          }
        }
      } else {
        console.log(`${c.yellow}사용법: /set <provider> <model>${c.reset}`);
        console.log(`${c.dim}예: /set ollama llama3.2${c.reset}`);
        console.log(`${c.dim}예: /set google gemini-2.5-flash${c.reset}\n`);
      }
      process.exit(0);
    }

    // Ollama URL 설정
    if (arg.startsWith("/ollama-url ")) {
      const url = arg.slice(12).trim();
      config.ollamaUrl = url;
      saveConfig(config);
      console.log(`${c.green}Ollama URL 설정됨: ${url}${c.reset}\n`);
      process.exit(0);
    }

    // 미션 실행
    if (!arg.startsWith("/")) {
      try {
        const model = resolveModel(config);
        const isOllama = config.provider === "ollama";
        await runAgent(arg, model, isOllama);
      } catch (error) {
        console.log(`${c.red}Error: ${(error as Error).message}${c.reset}`);
      }
      await stopBrowser();
      process.exit(0);
    }
  }

  printBanner(config);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const prompt = () => {
    const status = browser ? `${c.green}●${c.reset}` : `${c.red}○${c.reset}`;
    rl.question(`${status} ${c.cyan}>${c.reset} `, async (input) => {
      const trimmed = input.trim();

      if (!trimmed) {
        prompt();
        return;
      }

      // 종료
      if (["exit", "quit", "종료", "q"].includes(trimmed.toLowerCase())) {
        console.log(`\n${c.yellow}종료 중...${c.reset}`);
        await stopBrowser();
        rl.close();
        process.exit(0);
      }

      // 모델 목록
      if (trimmed === "/models") {
        printModels();
        prompt();
        return;
      }

      // 설정 확인
      if (trimmed === "/config") {
        console.log(`\n${c.cyan}현재 설정:${c.reset}`);
        console.log(`  Provider: ${config.provider}`);
        console.log(`  Model: ${config.model}`);
        if (config.provider === "ollama") {
          console.log(`  Ollama URL: ${config.ollamaUrl || "http://localhost:11434/v1"}`);
        }
        console.log(`  Config: ${CONFIG_PATH}\n`);
        prompt();
        return;
      }

      // 모델 변경
      if (trimmed.startsWith("/set ")) {
        const parts = trimmed.slice(5).split(" ");
        if (parts.length >= 2) {
          const [provider, ...modelParts] = parts;
          const model = modelParts.join(" ");

          if (provider === "ollama") {
            config.provider = provider;
            config.model = model;
            saveConfig(config);
            console.log(`${c.green}Ollama 모델 설정됨: ${model}${c.reset}\n`);
          } else {
            try {
              getModel(provider as any, model as any);
              config.provider = provider;
              config.model = model;
              saveConfig(config);
              console.log(`${c.green}모델 변경됨: ${provider}/${model}${c.reset}\n`);
            } catch (error) {
              console.log(`${c.red}잘못된 모델: ${(error as Error).message}${c.reset}\n`);
            }
          }
        } else {
          console.log(`${c.yellow}사용법: /set <provider> <model>${c.reset}`);
          console.log(`${c.dim}예: /set ollama llama3.2${c.reset}`);
          console.log(`${c.dim}예: /set google gemini-2.5-flash${c.reset}\n`);
        }
        prompt();
        return;
      }

      // Ollama URL 설정
      if (trimmed.startsWith("/ollama-url ")) {
        const url = trimmed.slice(12).trim();
        config.ollamaUrl = url;
        saveConfig(config);
        console.log(`${c.green}Ollama URL 설정됨: ${url}${c.reset}\n`);
        prompt();
        return;
      }

      // 도움말
      if (trimmed === "/help" || trimmed === "?") {
        printBanner(config);
        prompt();
        return;
      }

      // 미션 실행
      try {
        const model = resolveModel(config);
        const isOllama = config.provider === "ollama";
        await runAgent(trimmed, model, isOllama);
      } catch (error) {
        console.log(`${c.red}Error: ${(error as Error).message}${c.reset}`);
      }

      prompt();
    });
  };

  prompt();

  process.on("SIGINT", async () => {
    console.log(`\n${c.yellow}종료 중...${c.reset}`);
    await stopBrowser();
    process.exit(0);
  });
}

main().catch(console.error);
