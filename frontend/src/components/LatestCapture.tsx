import React, { useState, useEffect } from "react";
import { useWebSocket } from "../contexts/WebSocketContext";
import styled from "styled-components";

const Container = styled.div`
  background-color: #1e2229;
  border-radius: 8px;
  padding: 20px;
`;

const Title = styled.h2`
  display: flex;
  align-items: center;
  gap: 8px;
  color: white;
  margin: 0 0 20px 0;
  font-size: 1.2rem;
`;

const ImageContainer = styled.div`
  aspect-ratio: 16/9;
  background-color: #262b33;
  border-radius: 6px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  overflow: hidden;
`;

const NoImage = styled.div`
  color: #9ba1a6;
  text-align: center;
`;

const CaptureImage = styled.img`
  max-width: 100%;
  max-height: calc(100% - 24px);
  object-fit: contain;
`;

const TimestampText = styled.div`
  margin-top: 8px;
  font-size: 0.8rem;
  color: #9ba1a6;
`;

export const LatestCapture: React.FC = () => {
  const { latestImage } = useWebSocket();
  const [imageError, setImageError] = useState(false);
  const [debugInfo, setDebugInfo] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setImageError(false);
    if (latestImage?.imageData) {
      const info = {
        length: latestImage.imageData.length,
        prefix: latestImage.imageData.substring(0, 100),
        hasDataPrefix: latestImage.imageData.startsWith("data:image/"),
        timestamp: latestImage.timestamp,
      };
      setDebugInfo(JSON.stringify(info, null, 2));
      console.log("Image debug info:", info);
    }
  }, [latestImage]);

  const getImageUrl = (imageData: string) => {
    if (!imageData) {
      console.error("No image data provided");
      setImageError(true);
      return "";
    }

    try {
      // If it's already a complete data URL, return as is
      if (imageData.startsWith("data:image/")) {
        return imageData;
      }

      // Try to decode the base64 string to validate it
      atob(imageData);

      // If valid, add the data URL prefix
      return `data:image/jpeg;base64,${imageData}`;
    } catch (error) {
      console.error("Invalid base64 image data:", error);
      setImageError(true);
      return "";
    }
  };

  return (
    <Container>
      <Title>
        <span>📷</span>
        <span>Latest Capture</span>
      </Title>

      <ImageContainer>
        {latestImage?.imageData ? (
          <>
            <CaptureImage
              src={getImageUrl(latestImage.imageData)}
              alt="Latest capture"
              onError={() => {
                console.error("Failed to load image");
                setImageError(true);
                setIsLoading(false);
              }}
              onLoad={() => {
                setIsLoading(false);
                setImageError(false);
              }}
              style={{ display: isLoading ? "none" : "block" }}
            />
            {isLoading && !imageError && (
              <div style={{ color: "#9ba1a6" }}>Loading image...</div>
            )}
            {!imageError && !isLoading && (
              <TimestampText>
                Captured at: {new Date(latestImage.timestamp).toLocaleString()}
              </TimestampText>
            )}
            {imageError && (
              <>
                <div style={{ color: "#ff4444" }}>Failed to load image</div>
                <div
                  style={{
                    color: "#9ba1a6",
                    fontSize: "0.8rem",
                    marginTop: "8px",
                    maxWidth: "100%",
                    overflow: "auto",
                  }}
                >
                  Debug info:
                  <pre>{debugInfo}</pre>
                </div>
              </>
            )}
          </>
        ) : (
          <NoImage>No image captured</NoImage>
        )}
      </ImageContainer>
    </Container>
  );
};
