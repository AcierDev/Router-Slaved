import { RouterControlSystem } from "./components/RouterControlSystem.js";
import { WebSocketProvider } from "./contexts/WebSocketContext.js";
import { StrictMode } from "react";

function App() {
  return (
    <StrictMode>
      <WebSocketProvider>
        <RouterControlSystem />
      </WebSocketProvider>
    </StrictMode>
  );
}

export default App;
