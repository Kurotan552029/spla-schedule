import { useMemo, useState } from "react";
import Calendar from "react-calendar";
import "react-calendar/dist/Calendar.css";

const members = ["てる", "りの", "しゅんや", "やーん"] as const;
type Member = (typeof members)[number];

type Vote = "no" | "if" | "yes";
const voteCycle: Vote[] = ["no", "if", "yes"];
const voteEmoji: Record<Vote, string> = { no: "❌", if: "△", yes: "✔️" };
const voteColors: Record<Vote, string> = {
  no: "#f3f4f6",
  if: "#fcd34d",
  yes: "#34d399",
};

type Schedule = {
  id: number;
  date: Date;
  title: string;
  votes: Record<Member, Vote>;
};

export default function App() {
  const [date, setDate] = useState<Date>(new Date());
  const [title, setTitle] = useState("");
  const [schedules, setSchedules] = useState<Schedule[]>([]);

  const addSchedule = () => {
    const t = title.trim();
    if (!t) return;
    const newSchedule: Schedule = {
      id: Date.now(),
      date,
      title: t,
      votes: Object.fromEntries(members.map((m) => [m, "no"])) as Record<Member, Vote>,
    };
    setSchedules([...schedules, newSchedule]);
    setTitle("");
  };

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

  // 入力済み（❌以外を1つでも選んでる）なら緑
  const submittedMap = useMemo<Record<Member, boolean>>(() => {
    const map = Object.fromEntries(members.map((m) => [m, false])) as Record<Member, boolean>;
    for (const s of schedules) {
      for (const m of members) {
        if (s.votes[m] !== "no") map[m] = true;
      }
    }
    return map;
  }, [schedules]);

  return (
    <div style={{ padding: 24, maxWidth: 1000, margin: "0 auto" }}>
      <h1>スプラ日程調整</h1>

      {/* メンバー表示 */}
      <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
        {members.map((m) => (
          <span
            key={m}
            style={{
              padding: "4px 10px",
              borderRadius: 999,
              fontWeight: 700,
              color: "white",
              backgroundColor: submittedMap[m] ? "#16a34a" : "#ef4444",
            }}
          >
            {m}
          </span>
        ))}
      </div>

      {/* カレンダー */}
      <Calendar onChange={(value) => setDate(value as Date)} value={date} />

      {/* 予定入力 */}
      <div style={{ marginTop: 16 }}>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="予定の内容（例: 21:00集合）"
        />
        <button onClick={addSchedule} style={{ marginLeft: 8 }}>
          追加
        </button>
      </div>

      {/* 予定リスト */}
      <div style={{ marginTop: 24 }}>
        <h3>予定リスト</h3>
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr>
              <th style={{ borderBottom: "1px solid #ccc", textAlign: "left", padding: 8 }}>日付</th>
              <th style={{ borderBottom: "1px solid #ccc", textAlign: "left", padding: 8 }}>内容</th>
              {members.map((m) => (
                <th key={m} style={{ borderBottom: "1px solid #ccc", padding: 8 }}>
                  {m}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {schedules.map((s) => {
              const allYes = members.every((m) => s.votes[m] === "yes");
              return (
                <tr key={s.id} style={{ background: allYes ? "#d1fae5" : "white" }}>
                  <td style={{ padding: 8 }}>{s.date.toLocaleDateString()}</td>
                  <td style={{ padding: 8 }}>{s.title}</td>
                  {members.map((m) => (
                    <td key={m} style={{ padding: 8, textAlign: "center" }}>
                      <button
                        onClick={() => toggleVote(s.id, m)}
                        style={{
                          width: 40,
                          height: 30,
                          borderRadius: 6,
                          border: "1px solid #ccc",
                          backgroundColor: voteColors[s.votes[m]],
                        }}
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

    {/* 確定予定 */}
<div style={{ marginTop: 24 }}>
  <h3>確定した予定</h3>
  <ul>
    {schedules
      .filter((s) => members.every((m) => s.votes[m] === "yes"))
      .map((s) => (
        <li key={s.id}>
          {s.date.toLocaleDateString()} - {s.title}
        </li>
      ))}
  </ul>

  <button
    onClick={() => {
      const confirmed = schedules.filter((s) =>
        members.every((m) => s.votes[m] === "yes")
      );
      if (confirmed.length === 0) {
        alert("確定した予定がありません");
        return;
      }

      // .ics の内容を組み立て
      const icsEvents = confirmed
        .map((s) => {
          const start = s.date.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
          const endDate = new Date(s.date.getTime() + 2 * 60 * 60 * 1000); // 仮で2時間予定
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

      const icsContent =
        "BEGIN:VCALENDAR\nVERSION:2.0\n" + icsEvents + "\nEND:VCALENDAR";

      // ダウンロード処理
      const blob = new Blob([icsContent], { type: "text/calendar;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "splatoon-schedule.ics";
      a.click();
      URL.revokeObjectURL(url);
    }}
    style={{ marginTop: 8 }}
  >
    確定予定をエクスポート (.ics)
  </button>
</div>


    </div>
  );
}
