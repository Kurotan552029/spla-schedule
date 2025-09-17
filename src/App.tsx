import { useEffect, useMemo, useState } from "react";
import Calendar from "react-calendar";
import "react-calendar/dist/Calendar.css";

// 固定メンバー（あなたのスクショに合わせて日本語名に）
const members = ["てる", "りの", "しゅんや", "やーん"] as const;
type Member = (typeof members)[number];

type Vote = "no" | "if" | "yes";
const voteCycle: Vote[] = ["no", "if", "yes"];
const voteEmoji: Record<Vote, string> = { no: "❌", if: "△", yes: "✔️" };
const voteColors: Record<Vote, string> = {
  no: "#f3f4f6", // グレー
  if: "#fde68a", // 黄色(濃いめ)
  yes: "#86efac", // 緑(濃いめ)
};

type Schedule = {
  id: number;
  date: Date;
  title: string;
  votes: Record<Member, Vote>;
};

const STORAGE_KEY = "spla-schedule-v1";

// 画面幅でモバイル判定（初回のみ）
const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(max-width: 640px)").matches;
  });
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 640px)");
    const handler = () => setIsMobile(mq.matches);
    mq.addEventListener?.("change", handler);
    return () => mq.removeEventListener?.("change", handler);
  }, []);
  return isMobile;
};

export default function App() {
  const isMobile = useIsMobile();
  const [date, setDate] = useState<Date>(new Date());
  const [title, setTitle] = useState("");
  const [schedules, setSchedules] = useState<Schedule[]>([]);

  // --- localStorage 読み込み ---
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as any[];
      const revived: Schedule[] = parsed.map((s) => ({
        ...s,
        date: new Date(s.date),
      }));
      setSchedules(revived);
    } catch {
      // 破損時は無視
    }
  }, []);

  // --- localStorage 保存 ---
  useEffect(() => {
    const payload = JSON.stringify(schedules);
    localStorage.setItem(STORAGE_KEY, payload);
  }, [schedules]);

  // 予定追加
  const addSchedule = () => {
    const t = title.trim();
    if (!t) return;
    const newSchedule: Schedule = {
      id: Date.now(),
      date,
      title: t,
      votes: Object.fromEntries(members.map((m) => [m, "no"])) as Record<Member, Vote>,
    };
    setSchedules((prev) => [...prev, newSchedule]);
    setTitle("");
  };

  // 投票切り替え
  const toggleVote = (scheduleId: number, member: Member) => {
    setSchedules((prev) =>
      prev.map((s) => {
        if (s.id !== scheduleId) return s;
        const current = s.votes[member];
        const next = voteCycle[(voteCycle.indexOf(current) + 1) % voteCycle.length];
        return { ...s, votes: { ...s.votes, [member]: next } };
      })
    );
  };

  // 入力済み（❌以外が1つでもある）→ 緑バッジ
  const submittedMap = useMemo<Record<Member, boolean>>(() => {
    const map = Object.fromEntries(members.map((m) => [m, false])) as Record<Member, boolean>;
    for (const s of schedules) {
      for (const m of members) if (s.votes[m] !== "no") map[m] = true;
    }
    return map;
  }, [schedules]);

  // 全員✔️の予定
  const confirmed = useMemo(
    () => schedules.filter((s) => members.every((m) => s.votes[m] === "yes")),
    [schedules]
  );

  // .ics エクスポート
  const exportICS = () => {
    if (confirmed.length === 0) {
      alert("確定した予定がありません");
      return;
    }
    const icsEvents = confirmed
      .map((s) => {
        const start = s.date.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
        const endDate = new Date(s.date.getTime() + 2 * 60 * 60 * 1000); // 仮: 2時間
        const end = endDate.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
        return [
          "BEGIN:VEVENT",
          `SUMMARY:${s.title}`,
          `DTSTART:${start}`,
          `DTEND:${end}`,
          "END:VEVENT",
        ].join("\n");
      })
      .join("\n");

    const icsContent = "BEGIN:VCALENDAR\nVERSION:2.0\n" + icsEvents + "\nEND:VCALENDAR";
    const blob = new Blob([icsContent], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "splatoon-schedule.ics";
    a.click();
    URL.revokeObjectURL(url);
  };

  // 共通スタイル（モバイルで見やすく）
  const chip = (done: boolean) => ({
    padding: "6px 12px",
    borderRadius: 999,
    fontWeight: 700,
    color: "white",
    backgroundColor: done ? "#16a34a" : "#ef4444",
    fontSize: isMobile ? 14 : 16,
  } as React.CSSProperties);

  const voteBtn = (v: Vote) => ({
    width: isMobile ? 44 : 40,
    height: isMobile ? 44 : 30,
    borderRadius: 8,
    border: "1px solid #cbd5e1",
    backgroundColor: voteColors[v],
    fontSize: isMobile ? 24 : 18,
  } as React.CSSProperties);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#111827", // 背景をダーク
        color: "#e5e7eb", // 文字は薄いグレーで見やすく
        padding: isMobile ? 12 : 24,
      }}
    >
      <div
        style={{
          maxWidth: 1000,
          margin: "0 auto",
          background: "white", // 内容は白背景にして可読性UP
          color: "#111827",
          borderRadius: 16,
          padding: isMobile ? 12 : 20,
          boxShadow: "0 8px 24px rgba(0,0,0,.2)",
        }}
      >
        <h1 style={{ marginBottom: 12, fontSize: isMobile ? 20 : 24 }}>スプラ日程調整</h1>

        {/* メンバー */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
            marginBottom: 12,
          }}
        >
          {members.map((m) => (
            <span key={m} style={chip(submittedMap[m])}>
              {m}
            </span>
          ))}
        </div>

        {/* カレンダー */}
        <div style={{ background: "white" }}>
          <Calendar onChange={(value) => setDate(value as Date)} value={date} />
        </div>

        {/* 入力 */}
        <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="予定の内容（例: 21:00集合）"
            style={{
              flex: 1,
              padding: "10px 12px",
              borderRadius: 8,
              border: "1px solid #cbd5e1",
              background: "white",
              color: "#111827",
              fontSize: isMobile ? 16 : 14,
            }}
          />
          <button
            onClick={addSchedule}
            style={{
              padding: "10px 16px",
              borderRadius: 8,
              background: "#111827",
              color: "white",
              fontWeight: 700,
              fontSize: isMobile ? 16 : 14,
            }}
          >
            追加
          </button>
        </div>

        {/* 予定一覧：モバイルはカード、PCはテーブル */}
        <div style={{ marginTop: 16 }}>
          <h3 style={{ marginBottom: 8 }}>予定リスト</h3>

          {!isMobile ? (
            // --- PC: テーブル表示 ---
            <div style={{ overflowX: "auto" }}>
              <table style={{ borderCollapse: "collapse", width: "100%" }}>
                <thead>
                  <tr>
                    <th style={{ borderBottom: "1px solid #e5e7eb", textAlign: "left", padding: 8 }}>
                      日付
                    </th>
                    <th style={{ borderBottom: "1px solid #e5e7eb", textAlign: "left", padding: 8 }}>
                      内容
                    </th>
                    {members.map((m) => (
                      <th key={m} style={{ borderBottom: "1px solid #e5e7eb", padding: 8 }}>
                        {m}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {schedules.map((s) => {
                    const allYes = members.every((m) => s.votes[m] === "yes");
                    return (
                      <tr key={s.id} style={{ background: allYes ? "#ecfdf5" : "white" }}>
                        <td style={{ padding: 8 }}>{s.date.toLocaleDateString()}</td>
                        <td style={{ padding: 8 }}>{s.title}</td>
                        {members.map((m) => (
                          <td key={m} style={{ padding: 8, textAlign: "center" }}>
                            <button
                              onClick={() => toggleVote(s.id, m)}
                              style={voteBtn(s.votes[m])}
                              aria-label={`${m} の投票を切替`}
                            >
                              {voteEmoji[s.votes[m]]}
                            </button>
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            // --- Mobile: カード表示 ---
            <div style={{ display: "grid", gap: 12 }}>
              {schedules.map((s) => {
                const allYes = members.every((m) => s.votes[m] === "yes");
                return (
                  <div
                    key={s.id}
                    style={{
                      border: "1px solid #e5e7eb",
                      borderRadius: 12,
                      padding: 12,
                      background: allYes ? "#ecfdf5" : "white",
                    }}
                  >
                    <div style={{ fontWeight: 700, marginBottom: 6 }}>
                      {s.date.toLocaleDateString()} ・ {s.title}
                    </div>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(4, 1fr)",
                        gap: 8,
                        alignItems: "center",
                      }}
                    >
                      {members.map((m) => (
                        <button
                          key={m}
                          onClick={() => toggleVote(s.id, m)}
                          style={voteBtn(s.votes[m])}
                          aria-label={`${m} の投票を切替`}
                        >
                          {voteEmoji[s.votes[m]]}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 確定した予定 & エクスポート */}
        <div style={{ marginTop: 20 }}>
          <h3 style={{ marginBottom: 8 }}>確定した予定</h3>
          <ul style={{ paddingLeft: 18 }}>
            {confirmed.map((s) => (
              <li key={s.id}>
                {s.date.toLocaleDateString()} - {s.title}
              </li>
            ))}
            {confirmed.length === 0 && <li>まだありません</li>}
          </ul>

          <button
            onClick={exportICS}
            style={{
              marginTop: 8,
              padding: "10px 16px",
              borderRadius: 8,
              background: "#0b74ff",
              color: "white",
              fontWeight: 700,
            }}
          >
            確定予定をエクスポート (.ics)
          </button>
        </div>
      </div>
    </div>
  );
}
