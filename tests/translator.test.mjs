import assert from "node:assert/strict";
import test from "node:test";
import {
  countBundleDictionaryHits,
  createLocalizedBundle,
  createRuntimeOverlay,
  loadDomTranslations,
  translateDictionaryValue,
} from "../src/lib/translator.mjs";

const dictionary = {
  schemaVersion: 2,
  exact: {
    Settings: "设置",
    "New Conversation": "新建对话",
  },
  patterns: [
    {
      source:
        "^Quota refreshes in ([0-9]+) hours?, ([0-9]+) minutes?\\.$",
      target: "额度将在 $1 小时 $2 分钟后恢复。",
      flags: "u",
    },
  ],
};

test("runtime overlay keeps the original bundle unchanged", () => {
  const source = Buffer.from(
    `const state = "Settings"; console.log("New Conversation");`,
    "utf8",
  );
  const localized = createLocalizedBundle(source, dictionary);
  const output = localized.buffer.toString("utf8");

  assert.ok(output.startsWith(source.toString("utf8")));
  assert.match(output, /const state = "Settings"/);
  assert.match(output, /exactTranslations/);
  assert.match(output, /patternTranslations/);
  assert.equal(localized.coverage.hits, 2);
});

test("runtime overlay excludes editors and code-like regions", () => {
  const overlay = createRuntimeOverlay(dictionary);
  assert.match(overlay, /contenteditable/);
  assert.match(overlay, /monaco-editor/);
  assert.match(overlay, /blockedAttributeSelector/);
  assert.match(overlay, /isAttributeBlocked/);
  assert.match(overlay, /Node\.TEXT_NODE/);
});

test("dictionary hit count is deterministic", () => {
  assert.deepEqual(
    countBundleDictionaryHits("Settings only", dictionary),
    { hits: 1, total: 2 },
  );
});

test("dictionary translation supports exact and narrowly scoped dynamic text", () => {
  assert.equal(translateDictionaryValue("  Settings  ", dictionary), "  设置  ");
  assert.equal(
    translateDictionaryValue("Quota refreshes in 2 hours, 3 minutes.", dictionary),
    "额度将在 2 小时 3 分钟后恢复。",
  );
  assert.equal(translateDictionaryValue("Quota refreshes tomorrow.", dictionary), null);
});

test("Antigravity 2.15.0 config path label is translated", async () => {
  const current = await loadDomTranslations();
  assert.equal(
    translateDictionaryValue("Copy Config File Path", current),
    "复制配置文件路径",
  );
});

test("Antigravity 2.5.0 settings and usage strings are covered", async () => {
  const current = await loadDomTranslations();
  const visibleStrings = [
    "Models & Usage",
    "Manage your model quota and credits.",
    "Plan",
    "You can upgrade to a Google AI Ultra plan to receive higher rate limits.",
    "Model Credits",
    "Enable AI Credit Overages",
    "When toggled on, Antigravity will use your AI credits to fulfill model requests once you're out of model quota. Antigravity will always use your model quota first before using AI credits.",
    "Gemini Models",
    "Weekly Limit",
    "You have used some of your weekly limit, it will fully refresh in 2 days, 23 hours.",
    "Five Hour Limit",
    "Claude and GPT models",
    "Configure agent execution, queued message delivery, and permissions.",
    "Execution",
    "Queued Messages",
    "Configure when follow-up messages are sent.",
    "Keyboard shortcuts",
    "Queue After Turn",
    "Send Immediately",
    "Verbose Agent Chat",
    "Display and preserve intermediate thinking steps.",
    "Conversation Width",
    "Configure the maximum width of the conversation panel.",
    "Default",
    "Open IDE",
    "Message input",
    "Ask anything, @ to mention, / for actions",
    "Add context",
    "Select model, current: Gemini 3.6 Flash (High)",
    "Gemini 3.6 Flash (High)",
    "Record voice memo",
    "Send message",
    "Select Agent",
    "Main Agent",
    "Display Options",
    "Project options",
    "New Conversation in Project",
    "Typeahead menu",
    "Always Ask",
    "File Permissions",
    "Network Permissions",
    "Terminal & Tooling Permissions",
    "Dark",
    "Light",
    "System",
    "Requires manual review for all terminal commands and file accesses outside of the working folders.",
    "Full machine",
    "All terminal commands require review. The agent can read or write to any file in the machine.",
    "Turbo mode",
    "Disables all safety barriers for maximal iteration velocity.",
    "Manually customize individual settings.",
    "Outside of folders file access policy",
    "Configures how the agent tries to access files outside of its working folders.",
    "Require Review",
    "Build With Google Plugins",
    "Customize",
    "Block all browser JavaScript execution.",
    "Prompt for approval before running browser scripts.",
    "Allow full browser script execution without prompting.",
  ];

  for (const source of visibleStrings) {
    const translated = translateDictionaryValue(source, current);
    assert.ok(translated, `missing screenshot translation: ${source}`);
    assert.match(translated, /[\u3400-\u9fff]/u, `translation is not Chinese: ${source}`);
  }
});

test("Antigravity 2.6.0 settings and plugin strings are covered", async () => {
  const current = await loadDomTranslations();
  const visibleStrings = [
    "Agent Terminal Customizations",
    "Allow sandboxed commands to make network requests.",
    "Autonomous",
    "Autonomous mode active: the agent works independently, and does not ask questions or request new permissions.",
    "Discover helpful skills & plugins",
    "Every terminal command requires approval.",
    "Hooks",
    "Keep the app accessible from the menu bar and running in the background when all windows are closed.",
    "Let the agent access past conversations to inform its responses.",
    "Open files in the background if the agent creates or edits them",
    "Open the agent panel on window reload",
    "Plugin details",
    "Predict the location of your next edit and navigate you there with a tab keypress.",
    "Terminal Setup Script",
    "The agent always asks for confirmation before executing terminal commands (except those in the Allow list).",
    "The agent always asks for review.",
    "The agent asks for permission before executing commands matched by a deny list entry.",
    "The agent auto-executes commands matched by an allow list entry.",
    "Use my conversation history to tell me which skills and plugins would be helpful for me.",
    "View Usage",
  ];

  for (const source of visibleStrings) {
    const translated = current.exact[source];
    assert.ok(translated, `missing translation for: ${source}`);
    assert.match(translated, /[\u3400-\u9fff]/u, `translation is not Chinese: ${source}`);
  }
});

test("Antigravity 2.30.0 General settings visible strings are covered", async () => {
  const current = await loadDomTranslations();
  const visibleStrings = [
    "Knowledge Work",
    "Simplified interface for research, writing, and everyday tasks.",
    "Software Engineering",
    "Full interface for coding, developer tools, and managing agents.",
    "Configure what the agent can do in local and remote conversations.",
    "This Computer",
    "Remote",
    "Controls permissions for remote conversations.",
    "Type",
    "and select",
    "to have the agent generate a plan.",
    "Voice",
    "The voice used in Voice mode. Powered by Gemini Live.",
    "Not set",
    "Change",
    "Volume",
    "How loud Antigravity's voice is.",
    "Voice volume",
  ];

  for (const source of visibleStrings) {
    const translated = translateDictionaryValue(source, current);
    assert.ok(translated, `missing General settings translation: ${source}`);
    assert.match(translated, /[\u3400-\u9fff]/u);
  }
});

test("Antigravity 2.31.0 home screen greeting variants are translated without changing the name", async () => {
  const current = await loadDomTranslations();
  const greetings = new Map([
    ["Hey 小太阳, what should we build today?", "小太阳，今天想构建什么？"],
    ["Hey there, what should we build today?", "今天想构建什么？"],
    ["Welcome back, 小太阳. Where should we pick up?", "欢迎回来，小太阳。想从哪里继续？"],
    ["Welcome back. Where should we pick up?", "欢迎回来。想从哪里继续？"],
    ["Good to see you, 小太阳. What's next?", "很高兴见到你，小太阳。接下来做什么？"],
    ["Good to see you. What's next?", "很高兴见到你。接下来做什么？"],
  ]);
  for (const [source, target] of greetings) {
    assert.equal(translateDictionaryValue(source, current), target);
  }
  for (const source of [
    "Workspace",
    "Create New Project",
    "Announcements and tips",
    "Search Conversations",
    "Start Voice mode",
  ]) {
    assert.match(translateDictionaryValue(source, current), /[\u3400-\u9fff]/u);
  }
});

test("Antigravity 2.31.2 home screen controls are translated", async () => {
  const current = await loadDomTranslations();
  assert.equal(translateDictionaryValue("More actions", current), "更多操作");
  assert.equal(
    translateDictionaryValue("Where the agent runs, current: This Computer", current),
    "智能体运行位置，当前：此电脑",
  );
});

test("Antigravity 2.32.1 notification settings visible strings are covered", async () => {
  const current = await loadDomTranslations();
  for (const source of [
    "Manage your notification preferences.",
    "Enable Notifications for Agent",
    "Show system notifications when your action is needed or the agent finishes.",
    "Sound",
    "Enable Sounds for Agent",
    "Play a sound when your action is needed or the agent finishes.",
    "Volume",
    "Set the volume of agent sounds.",
    "Chime volume",
  ]) {
    assert.match(translateDictionaryValue(source, current), /[\u3400-\u9fff]/u, source);
  }
});

test("Antigravity 2.32.1 settings audit covers visible controls", async () => {
  const current = await loadDomTranslations();
  for (const source of [
    "Automatic Check for Updates",
    "Automatically prompt you to restart the app when a new update is available. When disabled, you can check for updates manually from the app menu.",
    "Font Size",
    "Background color picker",
    "Foreground color picker",
    "Accent color picker",
    "Code Preview",
    "Fill",
    "Accessibility",
    "Screen Reader Mode",
    "Optimize the interface and terminal output for screen readers.",
    "Change…",
    "Clear",
    "Configure allowed and denied URLs for the browser subagent. It runs in the built-in browser, so no separate browser install is needed.",
    "Weekly Limit Remaining",
    "Five Hour Limit Remaining",
    "Search shortcuts",
    "New Tab",
    "Conversation",
    "Submit Prompt (Alternate to Enter)",
    "Enter always submits. This adds a second shortcut.",
    "Jump to Previous Prompt",
    "Jump to Next Prompt",
    "Mute Voice Mic",
    "Mute Voice Speaker",
    "Add to Chat/Quote",
    "Pin / Unpin Conversation",
    "Archive This Conversation",
    "Layout Controls",
    "Toggle Overview Panel",
    "Toggle Terminal",
    "Manage project folders and settings.",
    "The breakdown below shows token usage from customizations like rules, skills, and MCP. If a budget is exceeded, large rules are demoted to path pointers and large customizations are excluded automatically.",
    "Settings for conversations outside of projects.",
    "Plugins",
    "Delete Project",
    "Delete",
    "Permanently delete",
    "including",
    "Copy path",
    "Edit project name",
    "Remove resource",
  ]) {
    assert.match(translateDictionaryValue(source, current), /[\u3400-\u9fff]/u, source);
  }
  assert.equal(translateDictionaryValue("Version 2.32.1", current), "版本 2.32.1");
  assert.equal(translateDictionaryValue("Show 2 breakdowns", current), "显示 2 项明细");
  assert.equal(translateDictionaryValue("Gemini 4 Argon Weekly Limit", current), "Gemini 4 Argon 每周额度");
  assert.equal(
    translateDictionaryValue("Permanently delete example including 4 active conversations and 1 archived conversation.", current),
    "永久删除 example，包括 4 条进行中的对话和 1 条已归档的对话。",
  );
  assert.equal(translateDictionaryValue("Delete ", current), "删除 ");
  assert.equal(translateDictionaryValue(" including ", current), " 包括 ");
  assert.equal(
    translateDictionaryValue("4 active conversations and 1 archived conversation", current),
    "4 条未归档对话和 1 条已归档对话",
  );
});

test("Antigravity 2.32.1 automation and customization chrome is translated", async () => {
  const current = await loadDomTranslations();
  for (const source of [
    "Create with Prompt",
    "New",
    "No automations yet",
    "Run a prompt on a schedule, like a morning summary of yesterday's changes. Runs show up here.",
    "Marketplace",
    "Installed",
    "Search customizations...",
    "Featured",
    "Details",
    "Create plugin",
    "Built In",
    "Skills & Rules",
    "All",
    "Filter skills and rules: All",
    "No custom agents yet.",
    "Copy Path",
    "Toggle Swarm",
    "Build with Google",
    "Design, Creative & Media",
    "Productivity & Project Management",
    "Cloud Hosting & Deployment",
    "Developer Tools",
    "Business",
    "More Plugins",
    "Explore other marketplace customizations",
    "See more in Build with Google",
    "See more in Productivity & Project Management",
    "See more in Developer Tools",
    "See more in Business",
    "See more in More Plugins",
  ]) {
    assert.match(translateDictionaryValue(source, current), /[\u3400-\u9fff]/u, source);
  }
  assert.equal(translateDictionaryValue("Unlock the power of agent swarms.", current), null);
});
