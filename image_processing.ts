import { execSync } from "child_process";
import "dotenv/config";
import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { z } from "zod";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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
      if (match) return { width: parseInt(match[1]) / 2, height: parseInt(match[2]) / 2 }; // div by 2 for retina display
    } else if (process.platform === "win32") {
      const output = execSync(
        "wmic path Win32_VideoController get CurrentHorizontalResolution,CurrentVerticalResolution",
      ).toString();
      const match = output.match(/(\d+)\s+(\d+)/);
      if (match) return { width: parseInt(match[1]), height: parseInt(match[2]) };
    } else {
      const output = execSync("xrandr | grep '*'").toString();
      const match = output.match(/(\d+)x(\d+)/);
      if (match) return { width: parseInt(match[1]), height: parseInt(match[2]) };
    }
  } catch (e) {
    console.warn("Could not detect screen size, using fallback");
  }
  return { width: 1280, height: 800 };
}

export async function getChromeIconCoordinates(imageBase64: string): Promise<ChromeIconCoordinates> {
  const { width, height } = getScreenDimensions();

  const response = await client.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: `You are a computer vision assistant. The user will send you a screenshot of a computer screen with dimensions ${width}x${height} pixels.
Your job is to locate the Google Chrome app icon and return its exact pixel coordinates.
Return the center x,y of the icon plus its width and height.
Coordinates should be absolute pixel values with origin at top-left.`,
      },
      {
        role: "user",
        content: [
          {
            type: "image_url",
            image_url: {
              url: `data:image/png;base64,${imageBase64}`,
            },
          },
          {
            type: "text",
            text: "Find the Google Chrome app icon and return its coordinates.",
          },
        ],
      },
    ],
    response_format: zodResponseFormat(ChromeIconCoordinates, "coordinates"),
  });

  console.log(JSON.stringify(response.choices[0].message, null, 2));

  const raw = response.choices[0].message.content;
  if (!raw) throw new Error("No coordinates");
  const result = JSON.parse(raw) as ChromeIconCoordinates;
  return result;
}

// test
import * as fs from "fs";
const testImage = fs.readFileSync("test_screenshot.png").toString("base64");
getChromeIconCoordinates(testImage).then(console.log).catch(console.error);
