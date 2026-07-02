import { useEffect, useState } from "react";
import type { Card } from "../types";
import { speakPl, ttsSupported } from "../lib/tts";
import { useStore } from "../store/useStore";
import TapWords from "./TapWords";

export default function AnswerBlock({ card }: { card: Card }) {
  const personalSaved = useStore((s) => s.personal[card.id]);
  const savePersonal = useStore((s) => s.savePersonal);
  const [draft, setDraft] = useState("");
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    setDraft(personalSaved?.text ?? "");
  }, [card.id, personalSaved?.text]);

  const onSave = async () => {
    await savePersonal(card.id, draft);
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1500);
  };

  return (
    <div className="answer">
      <div className="a-block">
        <div className="row-between">
          <div className="lbl">Эталон (PL)</div>
          {ttsSupported() && (
            <button className="speak-btn" onClick={() => speakPl(card.a_pl)}>
              🔊 Озвучить
            </button>
          )}
        </div>
        <div className="a-pl">
          <TapWords text={card.a_pl} />
        </div>
        <div className="tap-hint">Нажми на слово, чтобы услышать его отдельно</div>
      </div>

      {card.translit && (
        <div className="a-block">
          <div className="lbl">Произношение</div>
          <div className="a-translit">{card.translit}</div>
        </div>
      )}

      <div className="a-block">
        <div className="lbl">Перевод</div>
        <div className="a-ru">{card.a_ru}</div>
      </div>

      {card.why && <div className="a-why">💡 {card.why}</div>}

      {card.personal && (
        <div className="a-block">
          <div className="lbl">Твой ответ (сохраняется на устройстве)</div>
          <textarea
            className="personal-input"
            value={draft}
            placeholder="Напиши и сохрани свой вариант ответа…"
            onChange={(e) => setDraft(e.target.value)}
          />
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button className="btn ghost" onClick={onSave}>
              {savedFlash ? "✓ Сохранено" : "Сохранить мой ответ"}
            </button>
            {draft.trim() && ttsSupported() && (
              <button className="speak-btn" onClick={() => speakPl(draft)}>
                🔊
              </button>
            )}
          </div>
        </div>
      )}

      {card.source && <div className="a-source">Источник: {card.source}</div>}
    </div>
  );
}
