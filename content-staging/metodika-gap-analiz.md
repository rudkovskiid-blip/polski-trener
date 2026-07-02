# Методологическое заключение: gap-анализ и обновление схемы обучения

Дата: 2026-07-02. Источник: сверка полного банка PDF (`pdf-full-question-bank.md`) со 102 карточками `cards.json`, `personal.ts`, `scheduler.ts` (FSRS), `queue.ts`.

---

## 1. Gap-анализ покрытия

Покрытие ~70% банка PDF. Дыры кластерные: «гимн», «воеводства/UNESCO», часть праздников, Piłsudski.

### (а) Полностью отсутствуют (~27 тем)

**Критичные (спрашивают часто):**
- **Józef Piłsudski (№68)** — ни одной карточки (Naczelnik Państwa, 11.11.1918, przewrót majowy 1926)
- **Кластер гимна (№4, 6, 8, 9, 95):** gen. Dąbrowski (Legiony 1797), даты pieśń 1797 / hymn od 1927, два выпавших куплета, taraban, Muzeum Hymnu w Będominie
- **Zjazd gnieźnieński (№39)** — 1000 год, Otton III
- **Województwa (№86–87)** — даже факт «16 с 1999» отсутствует
- **UNESCO (№92)** — 13 объектов, ничего нет
- **Праздники:** Środa Popielcowa (№81), Niedziela Palmowa (№85), Trzej Królowie (№88), Dzień Polonii 2 maja (№13)
- **Okrągły Stół 1989 и сентябрь 1939** (Westerplatte, 17.09)

**Второстепенные:** insygnia koronacyjne целиком (№41), I/II/III Rzeczpospolita (№25), Matka Boża Ostrobramska (№75), festiwal w Zielonej Górze (№94), Toruń как город Коперника (№93), приветствие женщин (№77), strój pana młodego (№79), unia lubelska/w Krewie, powstanie w getcie 1943, trzej wieszcze.

### (б) Покрыто частично (~12 карточек к обогащению)

- `his_prezydenci` — нет Nawrockiego (рассинхрон с `wsp_prezydent`)
- `og_noblisci` — нет Reymonta
- `og_hymn_nazwa` — добавить 1797 / hymn od 1927
- `his_szczerbiec` — расширить до korona, jabłko, berło, Szczerbiec
- `his_sw_wojciech` — добавить «zginął u Prusów 997, wykupiony złotem na wagę»
- `lud_kopernik`/`his_kopernik` — добавить Toruń, Frombork, De revolutionibus 1543
- `geo_wawel` — добавить Malbork
- `og_swieta_panstwowe`+`og_swieta_katolickie` — довести до канона 9 dni wolnych (выпали Nowy Rok, 15 sierpnia, 26 grudnia)
- `og_tradycje` — добавить Prima Aprilis, noc świętojańska, Pierwszy Dzień Wiosny
- `lud_mickiewicz` — добавить Dziady, trzej wieszcze
- `his_ostatni_jagiellon` — добавить unia lubelska 1569

### (в) Карточки вне PDF — оставить все

`lud_lem`, `lud_szymborska`, `og_pisarze`, `wsp_nato`, `wsp_waluta`, `wsp_ustroj`, `wsp_prezydent`, `geo_powierzchnia_ludnosc`, `trad_oplatek`, `trad_koledy`, `trad_goscinnosc`, `trad_kuchnia_regionalna`, `his_mieszko_i` — реальные вопросы живых собеседований. Кандидат на слияние: `wsp_stolica` ≈ `geo_stolica`.

**Итог: ~15 правок + ~25–28 новых карточек (банк → ~130) + 5–6 «длинных материалов» вне карточек** (гимн, Warszawianka, хронология, воеводства, UNESCO, города).

---

## 2. Категории: не ломать

7 категорий оставить. Вместо новых категорий:
1. **Теги как вторичная ось** — унифицировать `гимн`, `легенды`, `праздники`, `кухня`, `даты`; фильтр по тегу в Learn.
2. Переливка в `wspolczesna`: `his_solidarnosc`, `his_stanwojenny`, `his_prezydenci`.

---

## 3. Схема обучения

### 3.1. Приоритизация: поле `priority: 1|2|3`

- **Волна 1 (ядро, ~35, недели 1–2):** символы, гимн (название/автор/первая строфа), 966, Konstytucja 3 maja, 11 listopada, соседи, Wisła, столицы, Chopin, Kopernik, Skłodowska, JP2, Wałęsa/Solidarność, Wigilia, bigos/żurek, UE/NATO, президент, весь личный блок.
- **Волна 2 (стандарт, ~60):** короли, разборы, восстания, potop, Grunwald, Wiedeń 1683, география, праздники, известные поляки.
- **Волна 3 (глубина, ~35):** Płowce, Warneńczyk, детали Targowicy, taraban, Będomin, Ostrobramska, региональная кухня, выпавшие куплеты.

### 3.2. Scheduler: FSRS не трогать, чинить queue.ts

Проблема: `isDue(undefined)===true` → в первый день вываливаются все неизученные, `dueCount` пугает.
1. `buildLearnQueue`: разделить повторения/новые; новые сортировать по priority, лимит `newPerDay` (8–12 по умолчанию).
2. `dueCount` = повторения + min(новые, лимит).
3. `newPerDay` в zustand + контрол в Learn/Progress.

### 3.3. Темп

`newPerDay ≈ (130 − освоено) / (N×7 − 20% буфер)`:
- 3 недели → 8–9 новых/день (30–40 мин/день)
- 4 недели → 6–7 (25–35 мин)
- 6 недель → 4–5 (20–25 мин)
Последние 4–5 дней: новых 0, только повторения + симуляции.

### 3.4. Длинные материалы — раздел «Materiały» (Guide.tsx), режимы «читать»/«тренировать»

- **Гимн** — построчный cloze («продолжи строку»), TTS есть; первая строфа + refren наизусть, остальное — узнавание.
- **Warszawianka** — только «знать, что это» (автор, 1831, повстанческая) + первая строфа для чтения.
- **Хронология 53 дат** — «лента»: событие↔дата, блоками по эпохам.
- **16 воеводств** — chunking по 4 группы по сторонам света; цель: «16» + назвать 6–8.
- **13 UNESCO** — «13» + уверенно 5–6 (Kraków, Wieliczka, Auschwitz, Warszawa, Malbork, Toruń).
- **Города (Gdańsk, Warszawa, Kraków, Wrocław)** — мини-тексты 4–5 предложений с транскрипцией.

Формат: `src/data/materials.ts`: `{id, title, mode: "lines"|"list"|"timeline", items[]}` — не тащить в FSRS.

### 3.5. Экзамен = симуляция собеседования (`sampleExam`)

- Блок 1: 2–3 из `osobiste` (сейчас личный блок в экзамен не попадает!)
- Блок 2: 1–2 «якоря» (гимн/символы/966)
- Блок 3: 7–10 предметных с весами priority 3/2/1
- TTS-озвучка вопроса ДО показа текста.

---

## 4. План внедрения

| # | Шаг | Файлы | Объём |
|---|---|---|---|
| 1 | Актуализация ~15 существующих карточек | `content-staging/*.json` → merge → `cards.json` | S, 1–2 ч |
| 2 | +25–28 новых карточек + поле priority | `content-staging/*.json`, `cards.json`, `src/types.ts` | M, вечер-два |
| 3 | Лимит новых/день + приоритетная сортировка | `src/lib/queue.ts`, store, `Learn.tsx` | S, ~1 ч |
| 4 | Раздел «Materiały» | `src/data/materials.ts`, `Guide.tsx`, LineTrainer | L, итерациями |
| 5 | Экзамен-симуляция | `queue.ts` (sampleExam), `Exam.tsx` | S–M, 1–2 ч |

Порядок: контент (1–2) → механика (3) → материалы (4) → экзамен (5).
