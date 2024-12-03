import React from "react";
import { useWebSocket } from "../contexts/WebSocketContext";
import { SystemStatus } from "./SystemStatus.js";
import { LatestCapture } from "./LatestCapture.js";
import { SystemMonitor } from "./SystemMonitor.js";
import styled from "styled-components";

const Container = styled.div`
  padding: 20px;
  background-color: #1a1d24;
  min-height: 100vh;
  color: white;
`;

const Header = styled.header`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
`;

const Title = styled.h1`
  color: #6c7cff;
  margin: 0;
`;

const MainContent = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
`;

export const RouterControlSystem: React.FC = () => {
  const { state } = useWebSocket();

  return (
    <Container>
      <Header>
        <div>
          <Title>Router Control System</Title>
          <p>Monitor and control the router system</p>
        </div>
        <div>
          <span>Status: {state?.status || "Disconnected"}</span>
          <button
            style={{
              marginLeft: "20px",
              backgroundColor: "#ff4444",
              color: "white",
              border: "none",
              padding: "8px 16px",
              borderRadius: "4px",
            }}
          >
            Emergency Stop
          </button>
        </div>
      </Header>

      <MainContent>
        <LatestCapture />
        <div>
          <SystemStatus />
          <SystemMonitor />
        </div>
      </MainContent>
    </Container>
  );
};
