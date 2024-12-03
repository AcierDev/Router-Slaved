import React, { useState, useEffect } from "react";
import styled from "styled-components";
import { useWebSocket } from "../contexts/WebSocketContext";

const LogContainer = styled.div`
  background-color: #262b33;
  border-radius: 6px;
  padding: 16px;
  height: 200px;
  overflow-y: auto;
  font-family: monospace;
  font-size: 0.9rem;
`;

const LogEntry = styled.div<{ $level: string }>`
  margin: 4px 0;
  color: ${(props) => {
    switch (props.$level) {
      case "error":
        return "#ff4444";
      case "warn":
        return "#ffaa00";
      default:
        return "#9ba1a6";
    }
  }};
`;

const Timestamp = styled.span`
  color: #6c7cff;
  margin-right: 8px;
`;

interface LogMessage {
  timestamp: string;
  message: string;
  level: string;
}

export const SystemLogs: React.FC = () => {
  const [logs, setLogs] = useState<LogMessage[]>([]);
  const { ws } = useWebSocket();

  useEffect(() => {
    const handleLog = (log: LogMessage) => {
      setLogs((prev) => [...prev, log].slice(-100)); // Keep last 100 logs
    };

    ws.onLog(handleLog);

    // Clean up listener when component unmounts
    return () => {
      ws.removeLogListener(handleLog);
    };
  }, [ws]);

  return (
    <LogContainer>
      {logs.length === 0 ? (
        <div style={{ textAlign: "center", color: "#9ba1a6" }}>
          No logs available
        </div>
      ) : (
        logs.map((log, index) => (
          <LogEntry key={index} $level={log.level}>
            <Timestamp>
              {new Date(log.timestamp).toLocaleTimeString()}
            </Timestamp>
            {log.message}
          </LogEntry>
        ))
      )}
    </LogContainer>
  );
};
