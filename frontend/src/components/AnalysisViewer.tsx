import React, { useEffect, useState } from "react";
import { AnalysisImage } from "../../../master/src/typings/types";

interface Props {
  websocket: WebSocket;
}

export const AnalysisViewer: React.FC<Props> = ({ websocket }) => {
  const [currentImage, setCurrentImage] = useState<AnalysisImage | null>(null);

  useEffect(() => {
    websocket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.type === "analysis_image") {
        setCurrentImage(message.data);
      }
    });
  }, [websocket]);

  if (!currentImage) {
    return <div>No image available</div>;
  }

  return (
    <div className="analysis-viewer">
      <h2>Analysis Image</h2>
      <p>Timestamp: {new Date(currentImage.timestamp).toLocaleString()}</p>
      <img
        src={currentImage.imageData}
        alt={`Analysis from ${currentImage.timestamp}`}
        style={{ maxWidth: "100%", height: "auto" }}
      />
    </div>
  );
};
