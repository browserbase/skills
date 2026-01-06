import { query } from '@anthropic-ai/claude-agent-sdk';
import * as readline from "readline";
import { prepareChromeProfile } from './src/browser-utils.js';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Resolve plugin root directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PLUGIN_ROOT = __dirname; // agent-browse.ts is in the root

// ANSI color codes for prettier output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
  blue: '\x1b[34m',
};

async function main() {
  // Prepare Chrome profile before starting the agent (first run only)
  prepareChromeProfile(PLUGIN_ROOT);

  // Get initial prompt from command line arguments
  const args = process.argv.slice(2);
  const hasInitialPrompt = args.length > 0;
  const initialPrompt = hasInitialPrompt ? args.join(' ') : null;

  if (hasInitialPrompt) {
    console.log(`${colors.dim}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
    console.log(`${colors.bright}${colors.cyan}You:${colors.reset} ${initialPrompt}`);
    console.log(`${colors.dim}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}\n`);
  }

  // Create readline interface for interactive input
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const getUserInput = (prompt: string = `\n${colors.bright}${colors.cyan}You:${colors.reset} `): Promise<string> => {
    return new Promise((resolve) => {
      rl.question(prompt, (answer) => {
        resolve(answer);
      });
    });
  };

  let shouldPromptUser = !hasInitialPrompt; // If no initial prompt, ask for input immediately
  let conversationActive = true;

  // Streaming input mode: creates an async generator for multi-turn conversations
  async function* generateMessages() {
    // Send initial prompt if provided
    if (initialPrompt) {
      yield {
        type: "user" as const,
        message: {
          role: "user" as const,
          content: initialPrompt
        },
        parent_tool_use_id: null,
        session_id: "default"
      };
    }

    // Keep accepting new messages
    while (conversationActive) {
      // Wait until we're ready for next input
      while (!shouldPromptUser && conversationActive) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      if (!conversationActive) break;

      shouldPromptUser = false;
      const userInput = await getUserInput();

      if (userInput.toLowerCase() === 'exit' || userInput.toLowerCase() === 'quit') {
        conversationActive = false;
        console.log(`\n${colors.dim}Goodbye!${colors.reset}`);
        break;
      }

      yield {
        type: "user" as const,
        message: {
          role: "user" as const,
          content: userInput
        },
        parent_tool_use_id: null,
        session_id: "default"
      };
    }
  }

  const q = query({
    prompt: generateMessages(),
    options: {
      systemPrompt: {
        type: 'preset',
        preset: 'claude_code',
        append: `\n\n# Browser Automation via CLI

For browser automation tasks, use bash commands to call the CLI tool:

**Available commands:**
- \`tsx src/cli.ts navigate <url>\` - Navigate to a URL and take screenshot
- \`tsx src/cli.ts act "<action>"\` - Perform natural language action and take screenshot
- \`tsx src/cli.ts extract "<instruction>" '{"field": "type"}'\` - Extract structured data
- \`tsx src/cli.ts observe "<query>"\` - Discover elements on page
- \`tsx src/cli.ts screenshot\` - Take a screenshot
- \`tsx src/cli.ts close\` - Close the browser

**Important:**
- Always navigate first before performing actions
- Be as specific as possible in your action descriptions
- Check the success field in JSON output
- The browser stays open between commands for faster operations
- Always close the browser when done with tasks
- Use the TodoWrite tool to track your browser automation steps

All commands output JSON with success status and relevant data.`
      },
      maxTurns: 100,
      cwd: process.cwd(),
      model: "sonnet",
      executable: "node",
    },
  });

  for await (const message of q) {
    // Handle assistant messages (Claude's responses and tool uses)
    if (message.type === 'assistant' && message.message) {
      const textContent = message.message.content.find((c: any) => c.type === 'text');
      if (textContent && 'text' in textContent) {
        console.log(`\n${colors.bright}${colors.magenta}Claude:${colors.reset} ${textContent.text}`);
      }

      // Show tool uses (but not tool results - those come in 'user' type messages)
      const toolUses = message.message.content.filter((c: any) => c.type === 'tool_use');
      for (const toolUse of toolUses) {
        const toolName = (toolUse as any).name;
        console.log(`\n${colors.blue}🔧 Using tool:  ${colors.reset}${colors.bright}${toolName}${colors.reset}`);
        const input = JSON.stringify((toolUse as any).input, null, 2);
        const indentedInput = input.split('\n').map(line => `   ${colors.dim}${line}${colors.reset}`).join('\n');
        console.log(indentedInput);
      }
    }

    // Handle tool results (these come as 'user' type messages)
    if (message.type === 'user' && message.message) {
      const content = message.message.content;
      // Content can be a string or an array
      if (Array.isArray(content)) {
        const toolResults = content.filter((c: any) => c.type === 'tool_result');
        for (const result of toolResults as any[]) {
          // Handle errors
          if (result.is_error) {
            const errorText = typeof result.content === 'string'
              ? result.content
              : JSON.stringify(result.content);
            console.log(`\n${colors.red}❌ Tool error:${colors.reset} ${errorText}`);
            continue;
          }

          // Handle successful results
          if (result.content) {
            // Content can be a string or an array
            if (typeof result.content === 'string') {
              console.log(`\n${colors.green}✓ Tool result: ${colors.reset}${colors.dim}${result.content}${colors.reset}`);
            } else if (Array.isArray(result.content)) {
              const textResult = result.content.find((c: any) => c.type === 'text');
              if (textResult) {
                console.log(`\n${colors.green}✓ Tool result: ${colors.reset}${colors.dim}${textResult.text}${colors.reset}`);
              }
            }
          }
        }
      }
    }

    // Handle result message - this signals the conversation is complete and we should prompt for input
    if (message.type === 'result') {
      // Hand control back to user for follow-up questions
      shouldPromptUser = true;
    }
  }

  // Only close readline when conversation is fully done
  rl.close();

  // Close browser before exiting
  await closeBrowserOnExit();
  process.exit(0);
}

async function closeBrowserOnExit() {
  try {
    console.log(`\n${colors.dim}Closing browser...${colors.reset}`);
    const { spawn } = await import('child_process');
    const closeProcess = spawn('tsx', ['src/cli.ts', 'close'], {
      stdio: 'inherit'
    });

    // Wait for close command to complete (max 10 seconds)
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        closeProcess.kill();
        resolve();
      }, 10000);

      closeProcess.on('close', () => {
        clearTimeout(timeout);
        resolve();
      });
    });
  } catch (error) {
    // Ignore errors during cleanup
  }
}

// Handle Ctrl+C and other termination signals
process.on('SIGINT', async () => {
  console.log(`\n\n${colors.dim}Interrupted. Closing browser...${colors.reset}`);
  await closeBrowserOnExit();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log(`\n${colors.dim}Terminating. Closing browser...${colors.reset}`);
  await closeBrowserOnExit();
  process.exit(0);
});

main().catch(console.error);
