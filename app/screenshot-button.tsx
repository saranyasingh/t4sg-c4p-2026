"use client";

import { Button } from "@/components/ui/button";

declare global {
  interface Window {
    electronAPI: {
      requestScreenshotPermission: () => Promise<boolean>;
      getScreenSources: () => Promise<Array<{ id: string; name: string }>>;
    };
  }
}

export default function ScreenshotButton() {
  async function takeScreenshot() {
    if (!window.electronAPI) {
      console.error("electronAPI not available — is the app running in Electron?");
      return;
    }

    const allowed = await window.electronAPI.requestScreenshotPermission();
    if (!allowed) return;

    const sources = await window.electronAPI.getScreenSources();
    const screen = sources[0];
    if (!screen) return;

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        mandatory: {
          chromeMediaSource: "desktop",
          chromeMediaSourceId: screen.id,
        },
      } as unknown as MediaTrackConstraints,
    });

    const video = document.createElement("video");
    video.srcObject = stream;
    await new Promise<void>((resolve) => {
      video.addEventListener("loadedmetadata", () => resolve());
    });
    await video.play();

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);

    stream.getTracks().forEach((track) => track.stop());

    const link = document.createElement("a");
    link.download = "screenshot.png";
    link.href = canvas.toDataURL();
    link.click();
  }

  return (
    <Button id="picButton" onClick={takeScreenshot}>
      Take Picture
    </Button>
  );
}
