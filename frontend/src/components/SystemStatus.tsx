import React from "react";
import { useWebSocket } from "../contexts/WebSocketContext";
import styled from "styled-components";

const Container = styled.div`
  background-color: #1e2229;
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 20px;
`;

const Title = styled.h2`
  color: white;
  margin: 0 0 16px 0;
  font-size: 1.2rem;
`;

const Subtitle = styled.p`
  color: #9ba1a6;
  margin: 0 0 20px 0;
  font-size: 0.9rem;
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
`;

const StatusCard = styled.div`
  background-color: #262b33;
  border-radius: 6px;
  padding: 16px;
`;

const StatusTitle = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
`;

const StatusValue = styled.div<{ active?: boolean }>`
  color: ${(props) => (props.active ? "#4CAF50" : "#9ba1a6")};
  font-size: 0.9rem;
`;

export const SystemStatus: React.FC = () => {
  const { state } = useWebSocket();

  return (
    <Container>
      <Title>System Status</Title>
      <Subtitle>Real-time sensor and device status</Subtitle>

      <Grid>
        <StatusCard>
          <StatusTitle>
            <span>⚪</span>
            <span>Block Sensor</span>
          </StatusTitle>
          <StatusValue active={state?.sensor1 === "ON"}>
            {state?.sensor1 === "ON" ? "Active" : "Inactive"}
          </StatusValue>
        </StatusCard>

        <StatusCard>
          <StatusTitle>
            <span>⚡</span>
            <span>Push Cylinder</span>
          </StatusTitle>
          <StatusValue active={state?.push_cylinder === "ON"}>
            {state?.push_cylinder === "ON" ? "Engaged" : "Disengaged"}
          </StatusValue>
        </StatusCard>

        <StatusCard>
          <StatusTitle>
            <span>⚡</span>
            <span>Riser Cylinder</span>
          </StatusTitle>
          <StatusValue active={state?.riser_cylinder === "ON"}>
            {state?.riser_cylinder === "ON" ? "Engaged" : "Disengaged"}
          </StatusValue>
        </StatusCard>

        <StatusCard>
          <StatusTitle>
            <span>⚡</span>
            <span>Ejection Cylinder</span>
          </StatusTitle>
          <StatusValue active={state?.ejection_cylinder === "ON"}>
            {state?.ejection_cylinder === "ON" ? "Engaged" : "Disengaged"}
          </StatusValue>
        </StatusCard>
      </Grid>
    </Container>
  );
};
