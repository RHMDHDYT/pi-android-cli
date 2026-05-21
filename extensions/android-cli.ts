/**
 * Android CLI Extension for Pi
 *
 * Provides Android development tools that bridge both the official Android CLI
 * (https://developer.android.com/tools/agents/android-cli) and low-level SDK
 * binaries:
 *
 * - android_cli:      Generic wrapper for the official `android` command
 * - android_project:    Project description and template listing via Android CLI
 * - android_docs:       Search / fetch from the Android Knowledge Base
 * - android_layout:     Capture active app UI layout in JSON
 * - android_gradle:     Run Gradle wrapper tasks
 * - android_adb:        Low-level ADB commands
 * - android_emulator:   Manage Android Virtual Devices (AVDs)
 * - android_logcat:     Capture and filter device logs
 *
 * Auto-discovers ANDROID_HOME / ANDROID_SDK_ROOT and the `android` binary in
 * PATH. Falls back to common platform paths if environment variables are unset.
 *
 * Usage: copy or symlink to ~/.pi/agent/extensions/ or keep in the project at
 * .pi/extensions/ for project-local loading.
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";

/* ------------------------------------------------------------------ */
/*  SDK & CLI Discovery                                                */
/* ------------------------------------------------------------------ */

const COMMON_SDK_PATHS: string[] = [
	process.env.ANDROID_HOME,
	process.env.ANDROID_SDK_ROOT,
	process.env.HOME && join(process.env.HOME, "Library/Android/sdk"),
	process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, "Android/Sdk"),
].filter((p): p is string => !!p);

function findAndroidSdk(): string | null {
	for (const p of COMMON_SDK_PATHS) {
		if (existsSync(join(p, "platform-tools", "adb")) || existsSync(join(p, "platform-tools", "adb.exe"))) {
			return p;
		}
	}
	return null;
}

function findAndroidCli(): string | null {
	const pathDirs = process.env.PATH?.split(process.platform === "win32" ? ";" : ":") ?? [];
	const candidates = [
		...pathDirs.map((d) => join(d, "android")),
		...pathDirs.map((d) => join(d, "android.exe")),
		process.env.HOME && join(process.env.HOME, ".local/bin/android"),
		process.env.HOME && join(process.env.HOME, "bin/android"),
		process.env.HOME && join(process.env.HOME, "Library/Android/sdk/cmdline-tools/latest/bin/android"),
		process.env.HOME && join(process.env.HOME, "Library/Android/sdk/cmdline-tools/bin/android"),
	].filter((p): p is string => !!p);

	for (const p of candidates) {
		if (existsSync(p)) return p;
	}
	return null;
}

function adbPath(sdk: string): string {
	const bin = join(sdk, "platform-tools", "adb");
	return existsSync(bin) ? bin : join(sdk, "platform-tools", "adb.exe");
}

function emulatorPath(sdk: string): string {
	const bin = join(sdk, "emulator", "emulator");
	return existsSync(bin) ? bin : join(sdk, "emulator", "emulator.exe");
}

/* ------------------------------------------------------------------ */
/*  Command Execution Helpers                                          */
/* ------------------------------------------------------------------ */

interface ExecResult {
	stdout: string;
	stderr: string;
	code: number | null;
}

async function execCommand(
	pi: ExtensionAPI,
	command: string,
	args: string[],
	{ timeout, cwd }: { timeout?: number; cwd?: string } = {}
): Promise<ExecResult> {
	const full = [command, ...args].map((a) => `"${a.replace(/"/g, '\\"')}"`).join(" ");
	const cd = cwd ? `cd "${cwd.replace(/"/g, '\\"')}" && ` : "";
	const result = await pi.exec("bash", ["-c", `${cd}${full}`], { timeout });
	return {
		stdout: String(result.stdout ?? ""),
		stderr: String(result.stderr ?? ""),
		code: result.code ?? null,
	};
}

async function execShell(
	pi: ExtensionAPI,
	command: string,
	{ timeout, cwd }: { timeout?: number; cwd?: string } = {}
): Promise<ExecResult> {
	const cd = cwd ? `cd "${cwd.replace(/"/g, '\\"')}" && ` : "";
	const result = await pi.exec("bash", ["-c", `${cd}${command}`], { timeout });
	return {
		stdout: String(result.stdout ?? ""),
		stderr: String(result.stderr ?? ""),
		code: result.code ?? null,
	};
}

function truncate(text: string, maxLen = 15000): string {
	if (text.length <= maxLen) return text;
	return text.slice(0, maxLen) + `\n\n... truncated (${text.length - maxLen} chars)`;
}

/* ------------------------------------------------------------------ */
/*  Extension Factory                                                  */
/* ------------------------------------------------------------------ */

export default function androidCliExtension(pi: ExtensionAPI) {
	let cachedSdk: string | null = null;
	let cachedCli: string | null = null;

	function sdk(): string | null {
		if (!cachedSdk) cachedSdk = findAndroidSdk();
		return cachedSdk;
	}

	function androidCli(): string | null {
		if (!cachedCli) cachedCli = findAndroidCli();
		return cachedCli;
	}

	function ensureSdk(): string {
		const s = sdk();
		if (!s) throw new Error("Android SDK not found. Set ANDROID_HOME or ANDROID_SDK_ROOT.");
		return s;
	}

	function ensureCli(): string {
		const c = androidCli();
		if (!c) throw new Error("Android CLI not found. Install it from https://developer.android.com/tools/agents/android-cli");
		return c;
	}

	/* -------------------------------------------------------------- */
	/*  Tool: android_cli (generic wrapper)                            */
	/* -------------------------------------------------------------- */
	pi.registerTool({
		name: "android_cli",
		label: "Android CLI",
		description:
			"Run the official Android CLI (android) command. Covers project scaffolding, emulator management, docs, layout inspection, environment info, and any other android subcommand.",
		promptSnippet: "Run the official Android CLI (android) command",
		promptGuidelines: [
			"Use android_cli for any command under the 'android' binary: info, update, describe, create, emulator, docs, layout, etc.",
			"When the user asks about project metadata, templates, or KB docs, prefer the specialized android_project or android_docs tools.",
		],
		parameters: Type.Object({
			subcommand: Type.String({
				description:
					"The android CLI subcommand as a single string. Examples: 'info', 'update', 'describe --project_dir=.', 'create list', 'emulator list', 'emulator start medium_phone', 'docs search performance'",
			}),
			timeout: Type.Optional(Type.Number({ default: 60_000, description: "Timeout in milliseconds" })),
		}),
		async execute(_id, params, _signal, _onUpdate, _ctx) {
			const cli = androidCli();
			if (!cli) {
				return {
					content: [
						{
							type: "text",
							text: "Android CLI not found. Install it from https://developer.android.com/tools/agents/android-cli or add it to your PATH.",
						},
					],
					isError: true,
					details: {},
				};
			}
			const result = await execShell(pi, `"${cli.replace(/"/g, '\\"')}" ${params.subcommand}`, {
				timeout: params.timeout ?? 60_000,
			});
			const output = result.stdout + (result.stderr ? `\nSTDERR:\n${result.stderr}` : "");
			return {
				content: [{ type: "text", text: truncate(output) }],
				isError: result.code !== 0,
				details: { exitCode: result.code },
			};
		},
	});

	/* -------------------------------------------------------------- */
	/*  Tool: android_project                                          */
	/* -------------------------------------------------------------- */
	pi.registerTool({
		name: "android_project",
		label: "Android Project",
		description:
			"Analyze or scaffold Android projects using the official Android CLI. Describe the current project structure and build artifacts, or list available templates.",
		promptSnippet: "Describe Android project metadata or list templates",
		promptGuidelines: [
			"Use android_project when the user needs project structure info, build artifact locations, or template listings.",
			"The describe action outputs JSON paths that detail build targets and APK locations.",
		],
		parameters: Type.Object({
			action: Type.String({
				description: "Action: describe (project metadata) or list_templates (available templates)",
			}),
			projectDir: Type.Optional(
				Type.String({ description: "Project directory. Defaults to the current working directory." })
			),
		}),
		async execute(_id, params, _signal, _onUpdate, ctx: ExtensionContext) {
			const cli = androidCli();
			if (!cli) {
				return {
					content: [
						{
							type: "text",
							text: "Android CLI not found. Install it from https://developer.android.com/tools/agents/android-cli",
						},
					],
					isError: true,
					details: {},
				};
			}

			const dir = params.projectDir ?? ctx.cwd;
			let subcommand: string;
			let timeout = 30_000;

			switch (params.action) {
				case "describe":
					subcommand = `describe --project_dir="${dir.replace(/"/g, '\\"')}"`;
					break;
				case "list_templates":
					subcommand = "create list";
					break;
				default:
					return {
						content: [{ type: "text", text: `Unknown action: ${params.action}` }],
						isError: true,
						details: {},
					};
			}

			const result = await execShell(pi, `"${cli.replace(/"/g, '\\"')}" ${subcommand}`, { timeout });
			const output = result.stdout + (result.stderr ? `\nSTDERR:\n${result.stderr}` : "");
			return {
				content: [{ type: "text", text: truncate(output) }],
				isError: result.code !== 0,
				details: { exitCode: result.code, action: params.action },
			};
		},
	});

	/* -------------------------------------------------------------- */
	/*  Tool: android_docs                                             */
	/* -------------------------------------------------------------- */
	pi.registerTool({
		name: "android_docs",
		label: "Android Docs",
		description:
			"Search and fetch from the Android Knowledge Base using the Android CLI. Find official documentation related to a topic and retrieve it by KB URL.",
		promptSnippet: "Search or fetch Android Knowledge Base documentation",
		promptGuidelines: [
			"Use android_docs when the user asks for official Android documentation, best practices, or platform guidance.",
			"First search with a query, then fetch the resulting kb:// URL.",
		],
		parameters: Type.Object({
			action: Type.String({ description: "Action: search (query the KB) or fetch (retrieve a kb:// URL)" }),
			query: Type.Optional(Type.String({ description: "Search query (required for search action)" })),
			kbUrl: Type.Optional(Type.String({ description: "KB URL to fetch, e.g. kb://android/topic/performance/overview (required for fetch action)" })),
		}),
		async execute(_id, params, _signal, _onUpdate, _ctx) {
			const cli = androidCli();
			if (!cli) {
				return {
					content: [
						{
							type: "text",
							text: "Android CLI not found. Install it from https://developer.android.com/tools/agents/android-cli",
						},
					],
					isError: true,
					details: {},
				};
			}

			let subcommand: string;
			switch (params.action) {
				case "search": {
					if (!params.query) {
						return {
							content: [{ type: "text", text: "Query is required for search action." }],
							isError: true,
							details: {},
						};
					}
					subcommand = `docs search ${JSON.stringify(params.query)}`;
					break;
				}
				case "fetch": {
					if (!params.kbUrl) {
						return {
							content: [{ type: "text", text: "kbUrl is required for fetch action." }],
							isError: true,
							details: {},
						};
					}
					subcommand = `docs fetch ${params.kbUrl}`;
					break;
				}
				default:
					return {
						content: [{ type: "text", text: `Unknown action: ${params.action}` }],
						isError: true,
						details: {},
					};
			}

			const result = await execShell(pi, `"${cli.replace(/"/g, '\\"')}" ${subcommand}`, { timeout: 60_000 });
			const output = result.stdout + (result.stderr ? `\nSTDERR:\n${result.stderr}` : "");
			return {
				content: [{ type: "text", text: truncate(output) }],
				isError: result.code !== 0,
				details: { exitCode: result.code, action: params.action },
			};
		},
	});

	/* -------------------------------------------------------------- */
	/*  Tool: android_layout                                           */
	/* -------------------------------------------------------------- */
	pi.registerTool({
		name: "android_layout",
		label: "Android Layout",
		description:
			"Capture the UI layout of the active Android app (connected device or emulator) in JSON format using the Android CLI.",
		promptSnippet: "Capture active app UI layout as JSON",
		promptGuidelines: [
			"Use android_layout when the user needs to inspect the UI hierarchy of a running Android app.",
			"Requires a connected device or running emulator with an active foreground app.",
		],
		parameters: Type.Object({
			pretty: Type.Optional(Type.Boolean({ default: false, description: "Pretty-print the JSON output" })),
			output: Type.Optional(Type.String({ description: "Optional file path to save the layout JSON" })),
			diff: Type.Optional(Type.Boolean({ default: false, description: "Show layout diff against previous capture" })),
		}),
		async execute(_id, params, _signal, _onUpdate, _ctx) {
			const cli = androidCli();
			if (!cli) {
				return {
					content: [
						{
							type: "text",
							text: "Android CLI not found. Install it from https://developer.android.com/tools/agents/android-cli",
						},
					],
					isError: true,
					details: {},
				};
			}

			const flags: string[] = [];
			if (params.pretty) flags.push("--pretty");
			if (params.diff) flags.push("--diff");
			if (params.output) flags.push(`--output="${params.output.replace(/"/g, '\\"')}"`);

			const subcommand = `layout ${flags.join(" ")}`;
			const result = await execShell(pi, `"${cli.replace(/"/g, '\\"')}" ${subcommand}`, { timeout: 30_000 });
			const output = result.stdout + (result.stderr ? `\nSTDERR:\n${result.stderr}` : "");
			return {
				content: [{ type: "text", text: truncate(output) }],
				isError: result.code !== 0,
				details: { exitCode: result.code },
			};
		},
	});

	/* -------------------------------------------------------------- */
	/*  Tool: android_gradle                                             */
	/* -------------------------------------------------------------- */
	pi.registerTool({
		name: "android_gradle",
		label: "Gradle",
		description: "Run Gradle wrapper tasks for this Android project.",
		promptSnippet: "Run Gradle tasks via the wrapper",
		promptGuidelines: [
			"Use android_gradle when the user asks to run a Gradle task, check build output, or list tasks.",
			"Prefer existing wrapper script (./gradlew) over system gradle.",
		],
		parameters: Type.Object({
			task: Type.String({
				description:
					"Gradle task name. Examples: tasks, clean, assembleDevelopDebug, assembleStagingDebug, assembleProductionDebug, assembleProductionRelease, bundleProductionRelease, test",
			}),
			flags: Type.Optional(
				Type.Array(Type.String(), {
					description: "Additional Gradle flags, e.g. [--no-daemon, --stacktrace, --info]",
				})
			),
		}),
		async execute(_id, params, _signal, _onUpdate, ctx: ExtensionContext) {
			const gradlew = join(ctx.cwd, "gradlew");
			if (!existsSync(gradlew)) {
				return {
					content: [{ type: "text", text: `No gradlew found at ${gradlew}. Are you in the project root?` }],
					isError: true,
					details: {},
				};
			}

			const args = params.flags ?? [];
			args.push(params.task);

			const result = await execCommand(pi, gradlew, args, { timeout: 300_000 });
			const output = result.stdout + (result.stderr ? `\nSTDERR:\n${result.stderr}` : "");

			return {
				content: [{ type: "text", text: truncate(output) }],
				isError: result.code !== 0,
				details: { exitCode: result.code, task: params.task },
			};
		},
	});

	/* -------------------------------------------------------------- */
	/*  Tool: android_adb                                              */
	/* -------------------------------------------------------------- */
	pi.registerTool({
		name: "android_adb",
		label: "ADB",
		description: "Run Android Debug Bridge (adb) commands.",
		promptSnippet: "Execute ADB commands (devices, shell, install, etc.)",
		promptGuidelines: [
			"Use android_adb when interacting with connected Android devices or emulators.",
			"Always list devices first if the target device is unknown.",
		],
		parameters: Type.Object({
			command: Type.String({
				description:
					"ADB command to run. Examples: devices, shell, install, uninstall, push, pull, reboot, root, remount",
			}),
			args: Type.Optional(
				Type.Array(Type.String(), {
					description: "Command arguments, e.g. [\"pm\", \"list\", \"packages\"] for 'adb shell pm list packages'",
				})
			),
			device: Type.Optional(Type.String({ description: "Target device serial (default: first available device)" })),
		}),
		async execute(_id, params, _signal, _onUpdate, _ctx) {
			const s = ensureSdk();
			const adb = adbPath(s);
			const args: string[] = [];
			if (params.device) args.push("-s", params.device);
			args.push(params.command);
			if (params.args) args.push(...params.args);

			const result = await execCommand(pi, adb, args, { timeout: 60_000 });
			const output = result.stdout + (result.stderr ? `\nSTDERR:\n${result.stderr}` : "");

			return {
				content: [{ type: "text", text: truncate(output) }],
				isError: result.code !== 0,
				details: { exitCode: result.code, command: params.command },
			};
		},
	});

	/* -------------------------------------------------------------- */
	/*  Tool: android_emulator                                         */
	/* -------------------------------------------------------------- */
	pi.registerTool({
		name: "android_emulator",
		label: "Emulator",
		description:
			"Manage Android Virtual Devices (AVDs). Prefers the Android CLI when available; falls back to raw SDK emulator binary.",
		promptSnippet: "List, start, or stop Android emulators",
		promptGuidelines: [
			"Use android_emulator when the user needs to start or stop an emulator, or list available AVDs.",
			"If the Android CLI is installed, emulator operations go through it; otherwise raw SDK binaries are used.",
		],
		parameters: Type.Object({
			action: Type.String({
				description: "Action to perform: list_avds, list_running, start, stop, snapshot_list",
			}),
			name: Type.Optional(Type.String({ description: "AVD name (required for start/stop)" })),
			extraArgs: Type.Optional(Type.Array(Type.String(), { description: "Extra emulator flags, e.g. [-no-window, -gpu, swiftshader_indirect]" })),
		}),
		async execute(_id, params, _signal, _onUpdate, _ctx) {
			const cli = androidCli();
			const s = ensureSdk();
			const useCli = !!cli;

			// Prefer Android CLI for listing and starting when available
			if (useCli && (params.action === "list_avds" || params.action === "start")) {
				let subcommand: string;
				if (params.action === "list_avds") {
					subcommand = "emulator list";
				} else {
					if (!params.name) {
						return {
							content: [{ type: "text", text: "AVD name is required for start action." }],
							isError: true,
							details: {},
						};
					}
					subcommand = `emulator start ${params.name}`;
				}
				const result = await execShell(pi, `"${cli.replace(/"/g, '\\"')}" ${subcommand}`, { timeout: 30_000 });
				const output = result.stdout + (result.stderr ? `\nSTDERR:\n${result.stderr}` : "");
				return {
					content: [{ type: "text", text: truncate(output) }],
					isError: result.code !== 0,
					details: { exitCode: result.code, action: params.action },
				};
			}

			// Fallback to raw SDK emulator binary
			const emulator = emulatorPath(s);
			let args: string[] = [];
			let timeout = 30_000;

			switch (params.action) {
				case "list_avds":
					args = ["-list-avds"];
					break;
				case "list_running": {
					const result = await execCommand(pi, adbPath(s), ["devices"], { timeout: 15_000 });
					const lines = result.stdout.split("\n").filter((l) => l.includes("emulator") || l.includes("device"));
					return {
						content: [{ type: "text", text: lines.join("\n") || "No running emulators detected." }],
						isError: false,
						details: {},
					};
				}
				case "start": {
					if (!params.name) {
						return {
							content: [{ type: "text", text: "AVD name is required for start action. Use list_avds first." }],
							isError: true,
							details: {},
						};
					}
					args = ["@" + params.name];
					if (params.extraArgs) args.push(...params.extraArgs);
					await execCommand(pi, emulator, args, { timeout: 10_000 });
					return {
						content: [{ type: "text", text: `Emulator '${params.name}' start initiated.` }],
						isError: false,
						details: {},
					};
				}
				case "stop": {
					// Android CLI stop uses serial; raw adb emu kill works too
					const adb = adbPath(s);
					const deviceArg = params.name ? ["-s", params.name] : [];
					const result = await execCommand(pi, adb, [...deviceArg, "emu", "kill"], { timeout: 30_000 });
					return {
						content: [{ type: "text", text: truncate(result.stdout + result.stderr) }],
						isError: result.code !== 0,
						details: { exitCode: result.code },
					};
				}
				case "snapshot_list": {
					if (!params.name) {
						return {
							content: [{ type: "text", text: "AVD name is required for snapshot_list." }],
							isError: true,
							details: {},
						};
					}
					args = ["-snapshot-list", "-avd", params.name];
					break;
				}
				default:
					return {
						content: [{ type: "text", text: `Unknown action: ${params.action}` }],
						isError: true,
						details: {},
					};
			}

			const result = await execCommand(pi, emulator, args, { timeout });
			const output = result.stdout + (result.stderr ? `\nSTDERR:\n${result.stderr}` : "");

			return {
				content: [{ type: "text", text: truncate(output) }],
				isError: result.code !== 0,
				details: { exitCode: result.code, action: params.action },
			};
		},
	});

	/* -------------------------------------------------------------- */
	/*  Tool: android_logcat                                           */
	/* -------------------------------------------------------------- */
	pi.registerTool({
		name: "android_logcat",
		label: "Logcat",
		description: "Capture and filter Android device log output.",
		promptSnippet: "Read or filter Android logcat output",
		promptGuidelines: [
			"Use android_logcat when the user asks for device logs, crash logs, or app-specific logging.",
			"Prefer filtering by package name or tag to avoid overwhelming output.",
		],
		parameters: Type.Object({
			action: Type.String({
				description: "Action: dump (last N lines), clear, or filter (stream a brief window)",
			}),
			packageName: Type.Optional(Type.String({ description: "Filter by application package name (e.g., com.innovecto.etalastic)" })),
			tag: Type.Optional(Type.String({ description: "Filter by log tag" })),
			priority: Type.Optional(
				Type.String({
					description: "Minimum priority: V (verbose), D (debug), I (info), W (warn), E (error), F (fatal)",
				})
			),
			lines: Type.Optional(Type.Number({ default: 200, description: "Number of lines for dump action" })),
			device: Type.Optional(Type.String({ description: "Target device serial" })),
		}),
		async execute(_id, params, _signal, _onUpdate, _ctx) {
			const s = ensureSdk();
			const adb = adbPath(s);
			const args: string[] = [];
			if (params.device) args.push("-s", params.device);

			async function resolvePid(): Promise<string | null> {
				if (!params.packageName) return null;
				const pidResult = await execCommand(
					pi,
					adb,
					params.device ? ["-s", params.device, "shell", "pidof", params.packageName] : ["shell", "pidof", params.packageName],
					{ timeout: 10_000 }
				);
				return pidResult.stdout.trim() || null;
			}

			switch (params.action) {
				case "clear": {
					args.push("logcat", "-c");
					const result = await execCommand(pi, adb, args, { timeout: 15_000 });
					return {
						content: [{ type: "text", text: result.stdout || "Logcat cleared." }],
						isError: result.code !== 0,
						details: { exitCode: result.code },
					};
				}
				case "dump": {
					args.push("logcat", "-d");
					if (params.lines) args.push("-t", String(params.lines));
					if (params.priority) args.push(`*:${params.priority}`);
					if (params.tag) args.push("-s", params.tag + ":" + (params.priority || "D"));
					const pid = await resolvePid();
					if (pid) {
						args.push("--pid", pid);
					} else if (params.packageName) {
						return {
							content: [{ type: "text", text: `Package ${params.packageName} not running; no PID found.` }],
							isError: false,
							details: {},
						};
					}
					const result = await execCommand(pi, adb, args, { timeout: 30_000 });
					const output = result.stdout + (result.stderr ? `\nSTDERR:\n${result.stderr}` : "");
					return {
						content: [{ type: "text", text: truncate(output, 20000) }],
						isError: result.code !== 0,
						details: { exitCode: result.code },
					};
				}
				case "filter": {
					args.push("logcat");
					if (params.priority) args.push(`*:${params.priority}`);
					if (params.tag) args.push("-s", params.tag + ":" + (params.priority || "D"));
					const pid = await resolvePid();
					if (pid) args.push("--pid", pid);
					const result = await execCommand(pi, adb, args, { timeout: 15_000 });
					const output = result.stdout + (result.stderr ? `\nSTDERR:\n${result.stderr}` : "");
					return {
						content: [{ type: "text", text: truncate(output, 20000) }],
						isError: result.code !== 0,
						details: { exitCode: result.code },
					};
				}
				default:
					return {
						content: [{ type: "text", text: `Unknown action: ${params.action}` }],
						isError: true,
						details: {},
					};
			}
		},
	});

	/* -------------------------------------------------------------- */
	/*  Command: /android-sdk                                          */
	/* -------------------------------------------------------------- */
	pi.registerCommand("android-sdk", {
		description: "Show Android SDK path, CLI path, and binary locations",
		handler: async (_args, ctx) => {
			const s = sdk();
			const c = androidCli();
			if (!s && !c) {
				ctx.ui.notify("Android SDK and Android CLI not found. Set ANDROID_HOME or add android to PATH.", "error");
				return;
			}
			let msg = "";
			if (s) {
				msg += `SDK: ${s}\nadb: ${adbPath(s)}\nemulator: ${emulatorPath(s)}\n`;
			}
			if (c) {
				msg += `CLI: ${c}`;
			}
			ctx.ui.notify(msg.trim(), "info");
		},
	});

	/* -------------------------------------------------------------- */
	/*  Session Setup                                                  */
	/* -------------------------------------------------------------- */
	pi.on("session_start", async (_event, ctx) => {
		const parts: string[] = [];
		const s = sdk();
		const c = androidCli();
		if (s) parts.push(`SDK ${s}`);
		if (c) parts.push(`CLI ${dirname(c)}`);
		if (parts.length > 0) {
			ctx.ui.setStatus("android", `Android: ${parts.join(" | ")}`);
		}
	});
}
