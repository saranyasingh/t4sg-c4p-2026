"use client";

import { useState } from "react";
import BoundingBoxOverlay from "./bounding-box-overlay";
import ScreenshotButton, { type Coordinates } from "./screenshot-button";

export default function Home() {
  const [coords, setCoords] = useState<Coordinates | null>(null);

  return (
    <div className="space-y-4">
      <ScreenshotButton onCoordinates={setCoords} />
      {coords && (
        <pre className="text-xs text-white">{JSON.stringify(coords, null, 2)}</pre>
      )}
      <BoundingBoxOverlay coords={coords} />
    </div>
  );
}
