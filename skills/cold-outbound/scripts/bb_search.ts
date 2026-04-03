// Browserbase Search API wrapper for cold outbound lead discovery.
// Usage: npx tsx bb_search.ts --query "fintech startups series A" --num 25 [--output /tmp/batch.json]

import Browserbase from "@browserbasehq/sdk";
import { writeFileSync } from "fs";

interface SearchResult {
  url: string;
  title: string;
  author?: string;
  publishedDate?: string;
}

function parseArgs(argv: string[]): { query: string; num: number; output?: string } {
  const args = argv.slice(2);
  let query = "";
  let num = 10;
  let output: string | undefined;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--query":
        query = args[++i];
        break;
      case "--num":
        num = Math.min(25, Math.max(1, parseInt(args[++i], 10)));
        break;
      case "--output":
        output = args[++i];
        break;
    }
  }

  if (!query) {
    console.error("Usage: npx tsx bb_search.ts --query \"search terms\" --num 25 [--output path.json]");
    process.exit(1);
  }

  return { query, num, output };
}

async function search(query: string, numResults: number): Promise<SearchResult[]> {
  const apiKey = process.env.BROWSERBASE_API_KEY;
  if (!apiKey) {
    console.error("Error: BROWSERBASE_API_KEY environment variable is required");
    process.exit(1);
  }

  const bb = new Browserbase({ apiKey });

  try {
    const response = await bb.search.web({ query, numResults });
    return (response.results || []).map((r: any) => ({
      url: r.url,
      title: r.title,
      author: r.author || undefined,
      publishedDate: r.publishedDate || undefined,
    }));
  } catch (error: any) {
    // Retry once on rate limit (429)
    if (error?.status === 429) {
      console.error("[bb_search] Rate limited, retrying in 1s...");
      await new Promise((r) => setTimeout(r, 1000));
      const response = await bb.search.web({ query, numResults });
      return (response.results || []).map((r: any) => ({
        url: r.url,
        title: r.title,
        author: r.author || undefined,
        publishedDate: r.publishedDate || undefined,
      }));
    }
    throw error;
  }
}

async function main() {
  const { query, num, output } = parseArgs(process.argv);

  console.error(`[bb_search] Searching: "${query}" (num=${num})`);
  const results = await search(query, num);
  console.error(`[bb_search] Found ${results.length} results`);

  const payload = JSON.stringify(results, null, 2);

  if (output) {
    writeFileSync(output, payload, "utf-8");
    console.error(`[bb_search] Written to ${output}`);
  } else {
    console.log(payload);
  }
}

main().catch((err) => {
  console.error("[bb_search] Error:", err.message || err);
  process.exit(1);
});
