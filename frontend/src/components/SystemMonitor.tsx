import React, { useState } from "react";
import styled from "styled-components";
import { SystemLogs } from "./SystemLogs";

const Container = styled.div`
  background-color: #1e2229;
  border-radius: 8px;
  padding: 20px;
`;

const Title = styled.h2`
  color: white;
  margin: 0 0 20px 0;
  font-size: 1.2rem;
`;

const TabContainer = styled.div`
  display: flex;
  gap: 16px;
  margin-bottom: 20px;
`;

const Tab = styled.button<{ $active: boolean }>`
  background: none;
  border: none;
  color: ${(props) => (props.$active ? "#6c7cff" : "#9ba1a6")};
  padding: 0;
  font-size: 0.9rem;
  cursor: pointer;
  border-bottom: 2px solid
    ${(props) => (props.$active ? "#6c7cff" : "transparent")};
  padding-bottom: 4px;

  &:hover {
    color: ${(props) => (props.$active ? "#6c7cff" : "#ffffff")};
  }
`;

const Content = styled.div`
  min-height: 200px;
  color: #9ba1a6;
  display: flex;
  align-items: center;
  justify-content: center;
`;

export const SystemMonitor: React.FC = () => {
  const [activeTab, setActiveTab] = useState<"logs" | "stats">("logs");

  return (
    <Container>
      <Title>System Monitor</Title>

      <TabContainer>
        <Tab
          $active={activeTab === "logs"}
          onClick={() => setActiveTab("logs")}
        >
          System Logs
        </Tab>
        <Tab
          $active={activeTab === "stats"}
          onClick={() => setActiveTab("stats")}
        >
          System Stats
        </Tab>
      </TabContainer>

      <Content>
        {activeTab === "logs" ? <SystemLogs /> : <div>No System Stats</div>}
      </Content>
    </Container>
  );
};
