import { execSync } from "child_process";
import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-20250514";

const ChromeIconCoordinates = z.object({
  x: z.number().describe("X coordinate of the center of the Chrome icon"),
  y: z.number().describe("Y coordinate of the center of the Chrome icon"),
  width: z.number().describe("Width of the Chrome icon in pixels"),
  height: z.number().describe("Height of the Chrome icon in pixels"),
  confidence: z.number().describe("Confidence score between 0 and 1"),
});

type ChromeIconCoordinates = z.infer<typeof ChromeIconCoordinates>;

function getScreenDimensions(): { width: number; height: number } {
  try {
    if (process.platform === "darwin") {
      const output = execSync("system_profiler SPDisplaysDataType | grep Resolution").toString();
      const match = output.match(/(\d+) x (\d+)/);
      if (match?.[1] && match?.[2]) {
        return { width: parseInt(match[1], 10) / 2, height: parseInt(match[2], 10) / 2 }; // div by 2 for retina display
      }
    } else if (process.platform === "win32") {
      const output = execSync(
        "wmic path Win32_VideoController get CurrentHorizontalResolution,CurrentVerticalResolution",
      ).toString();
      const match = output.match(/(\d+)\s+(\d+)/);
      if (match?.[1] && match?.[2]) return { width: parseInt(match[1], 10), height: parseInt(match[2], 10) };
    } else {
      const output = execSync("xrandr | grep '*'").toString();
      const match = output.match(/(\d+)x(\d+)/);
      if (match?.[1] && match?.[2]) return { width: parseInt(match[1], 10), height: parseInt(match[2], 10) };
    }
  } catch {
    console.warn("Could not detect screen size, using fallback");
  }
  return { width: 1280, height: 800 };
}

export async function getChromeIconCoordinates(imageBase64: string): Promise<ChromeIconCoordinates> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not set");
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const { width, height } = getScreenDimensions();

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: "image/png",
              data: imageBase64,
            },
          },
          {
            type: "text",
            text: `You are a computer vision assistant. The screenshot is approximately ${width}x${height} pixels.
Locate the Google Chrome app icon and return ONLY a JSON object (no markdown) with these keys:
x, y (center of the icon in pixels, origin top-left), width, height (icon size in pixels), confidence (0-1).`,
          },
        ],
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  const raw = textBlock?.type === "text" ? textBlock.text.replace(/```json|```/g, "").trim() : "";
  if (!raw) throw new Error("No coordinates in response");

  const parsed = JSON.parse(raw) as unknown;
  return ChromeIconCoordinates.parse(parsed);
}
