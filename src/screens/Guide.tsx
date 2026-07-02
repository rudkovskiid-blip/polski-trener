import { hasPolishVoice, ttsSupported } from "../lib/tts";

export default function Guide() {
  return (
    <div className="screen">
      <h1 className="h-title">Как заниматься</h1>
      <p className="h-sub">Коротко: говори вслух, проверяй себя честно, возвращайся каждый день.</p>

      <div className="panel">
        <div className="lbl" style={{ marginBottom: 8 }}>
          Метод (active recall + интервалы)
        </div>
        <ol style={{ margin: 0, paddingLeft: 20, lineHeight: 1.7 }}>
          <li>Читаешь вопрос — сначала пробуешь ответить <b>вслух по-польски</b>.</li>
          <li>Только потом жмёшь «Показать ответ» и сверяешь.</li>
          <li>Честно ставишь оценку: <b>Не вспомнил / Частично / Верно</b>.</li>
          <li>Алгоритм (FSRS) сам вернёт карточку к повторению в нужный день.</li>
          <li>Темы идут вперемешку — так мозг учится переключаться, как на собесе.</li>
        </ol>
      </div>

      <div className="panel">
        <div className="lbl" style={{ marginBottom: 8 }}>
          План на 6–8 месяцев
        </div>
        <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.7 }}>
          <li>Каждый день: режим «Учить», 15–20 минут, все темы что «к повторению».</li>
          <li>1–2 раза в неделю: режим «Экзамен» на 20–30 вопросов под таймер.</li>
          <li>Раз в неделю: проговори вслух весь «Личный блок» как живому человеку.</li>
          <li>Следи за вкладкой «Прогресс» — добивай слабые темы.</li>
        </ul>
      </div>

      <div className="panel">
        <div className="lbl" style={{ marginBottom: 8 }}>
          Озвучка
        </div>
        <p style={{ margin: 0 }} className="muted">
          {!ttsSupported()
            ? "Синтез речи недоступен в этом браузере."
            : hasPolishVoice()
              ? "Польский голос найден ✓ — жми 🔊 у ответа."
              : "Польский голос не найден в системе. На iPhone: Настройки → Универсальный доступ → Контент вслух → Голоса → Польский. На Mac: Системные настройки → Универсальный доступ → Устная речь."}
        </p>
      </div>

      <div className="panel">
        <div className="lbl" style={{ marginBottom: 8 }}>
          Усилить связкой инструментов
        </div>
        <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.7 }}>
          <li>
            <b>Голосовой mock</b>: ChatGPT Voice / Gemini Live по-польски в роли
            чиновника — «Przepytaj mnie po polsku, jedno pytanie na raz».
          </li>
          <li>
            <b>NotebookLM</b>: залей материалы → Audio Overview по-польски слушать
            в дороге.
          </li>
          <li>
            <b>Forvo</b> — проверять произношение спорных слов.
          </li>
        </ul>
      </div>

      <div className="panel">
        <div className="lbl" style={{ marginBottom: 8 }}>
          Установить как приложение
        </div>
        <p style={{ margin: 0 }} className="muted">
          <b>iPhone (Safari):</b> «Поделиться» → «На экран Домой».
          <br />
          <b>Mac (Safari/Chrome):</b> меню «Файл/⋮» → «Добавить в Dock» /
          «Установить приложение». Работает офлайн.
        </p>
      </div>
    </div>
  );
}
