import "dotenv/config";
import * as fs from "fs";
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export interface ChromeIconCoordinates {
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
}

export async function getChromeIconCoordinates(imageBase64: string): Promise<ChromeIconCoordinates> {
  // Write base64 to a temp file so we can upload it
  const tmpPath = "/tmp/screenshot.png";
  fs.writeFileSync(tmpPath, Buffer.from(imageBase64, "base64"));

  // Upload the image file
  const file = await client.files.create({
    file: fs.createReadStream(tmpPath),
    purpose: "assistants",
  });

  // Create an assistant with code interpreter
  const assistant = await client.beta.assistants.create({
    model: "gpt-4o",
    tools: [{ type: "code_interpreter" }],
    instructions: `You are a computer vision assistant. When given a screenshot, use code interpreter to analyze the image pixel by pixel and find the exact center coordinates of the Google Chrome icon (circular icon with red, yellow, green ring around blue center). Return ONLY a JSON object with keys: x, y, width, height, confidence. No other text.`,
  });

  // Create a thread with the image
  const thread = await client.beta.threads.create({
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image_file",
            image_file: { file_id: file.id },
          },
          {
            type: "text",
            text: `This is a 1440x900 screenshot. Write and execute Python code to:
1. Load the image
2. Convert to numpy array
3. Find pixels where the red channel > 150 AND green channel < 100 (the red part of Chrome icon)
4. Get the centroid of those pixels
5. Print the result as JSON: {"x": centroid_x, "y": centroid_y, "width": 70, "height": 70, "confidence": 0.99}
Return ONLY the JSON object, nothing else.`,
          },
        ],
      },
    ],
  });

  // Run the assistant
  let run = await client.beta.threads.runs.create(thread.id, {
    assistant_id: assistant.id,
  });

  // Poll until complete
  while (run.status === "queued" || run.status === "in_progress") {
    await new Promise((r) => setTimeout(r, 1000));
    run = await client.beta.threads.runs.retrieve(thread.id, run.id);
    console.log("Status:", run.status);
  }

  // Get the response
  const messages = await client.beta.threads.messages.list(thread.id);
  messages.data.forEach((m) => console.log(JSON.stringify(m.content, null, 2)));
  const content = messages.data[0].content[0];
  if (content.type !== "text") throw new Error("Unexpected response type");

  // Clean up
  await client.files.del(file.id);
  await client.beta.assistants.del(assistant.id);

  const raw = content.text.value.replace(/```json|```/g, "").trim();
  return JSON.parse(raw) as ChromeIconCoordinates;
}

// test
const testImage = fs.readFileSync("test_screenshot.png").toString("base64");
getChromeIconCoordinates(testImage).then(console.log).catch(console.error);
