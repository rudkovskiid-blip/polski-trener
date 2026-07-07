import { useEffect, useState } from "react";
import { useStore } from "./store/useStore";
import BottomNav, { type Tab } from "./components/BottomNav";
import Learn from "./screens/Learn";
import Notebook from "./screens/Notebook";
import Words from "./screens/Words";
import Exam from "./screens/Exam";
import Progress from "./screens/Progress";
import Guide from "./screens/Guide";

export default function App() {
  const [tab, setTab] = useState<Tab>("learn");
  const init = useStore((s) => s.init);
  const loaded = useStore((s) => s.loaded);
  const toast = useStore((s) => s.toast);

  useEffect(() => {
    init();
  }, [init]);

  return (
    <div className="app">
      {!loaded ? (
        <div className="screen">
          <div className="empty">
            <div className="big">🦅</div>
            Загрузка…
          </div>
        </div>
      ) : tab === "learn" ? (
        <Learn />
      ) : tab === "notebook" ? (
        <Notebook />
      ) : tab === "words" ? (
        <Words />
      ) : tab === "exam" ? (
        <Exam />
      ) : tab === "progress" ? (
        <Progress />
      ) : (
        <Guide />
      )}
      {toast && <div className="toast">{toast}</div>}
      <BottomNav tab={tab} onChange={setTab} />
    </div>
  );
}
