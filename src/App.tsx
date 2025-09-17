import { useEffect, useMemo, useState } from "react";
import Calendar from "react-calendar";
import "react-calendar/dist/Calendar.css";
import { createClient } from "@supabase/supabase-js";
import type { RealtimePostgresChangesPayload }from "@supabase/supabase-js";

/* ===== Supabase client ===== */
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL!,
  import.meta.env.VITE_SUPABASE_ANON_KEY!
);

/* ===== Members (内部キーは英字、表示名は日本語に) ===== */
const members = ["Teru", "Rino", "Shunya", "Yaan"] as const;
type Member = (typeof members)[number];
const memberLabel: Record<Member, string> = {
  Teru: "てる",
  Rino: "りの",
  Shunya: "しゅんや",
  Yaan: "やーん",
};

/* ===== Types ===== */
type Vote = "no" | "if" | "yes";
const voteCycle: Vote[] = ["no", "if", "yes"];
const voteEmoji: Record<Vote, string> = { no: "❌", if: "△", yes: "✔️" };
const voteColors: Record<Vote, string> = { no: "#f3f4f6", if: "#fde68a", yes: "#86efac" };

type Schedule = {
  id: string;                // uuid
  starts_at: string;         // ISO (timestamptz)
  title: string;
  votes: Record<Member, Vote>;
  created_at?: string;
};

/* ===== Mobile helper ===== */
const useIsMobile = () => {
  const [m, setM] = useState(() =>
    typeof window === "undefined"
      ? false
      : window.matchMedia("(max-width:640px)").matches
  );
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width:640px)");
    const h = () => setM(mq.matches);
    mq.addEventListener?.("change", h);
    return () => mq.removeEventListener?.("change", h);
  }, []);
  return m;
};

export default function App() {
  const isMobile = useIsMobile();

  const [date, setDate] = useState<Date>(new Date());
  const [title, setTitle] = useState("");
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  /* ----- 初期ロード ----- */
  useEffect(() => {
    (async () => {
      setErr(null);
      const { data, error } = await supabase
        .from("schedules")
        .select("*")
        .order("created_at", { ascending: true });
      if (error) {
        setErr(error.message);
        return;
      }
      setSchedules((data || []) as Schedule[]);
      setReady(true);
    })();
  }, []);

  /* ----- Realtime 購読（型付き） ----- */
// --- Realtime 購読（INSERT / UPDATE / DELETE をまとめて処理）---
useEffect(() => {
  const channel = supabase
    .channel("realtime:schedules")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "schedules" },
      (payload: RealtimePostgresChangesPayload<Schedule>) => {
        // eventType を見て分岐
        if (payload.eventType === "INSERT" && payload.new) {
          const row = payload.new as Schedule;
          setSchedules((prev: Schedule[]) => [...prev, row]);
        } else if (payload.eventType === "UPDATE" && payload.new) {
          const row = payload.new as Schedule;
          setSchedules((prev: Schedule[]) =>
            prev.map((x) => (x.id === row.id ? row : x))
          );
        } else if (payload.eventType === "DELETE" && payload.old) {
          const oldRow = payload.old as { id: string };
          setSchedules((prev: Schedule[]) =>
            prev.filter((x) => x.id !== oldRow.id)
          );
        }
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}, []);

  /* ----- 追加 ----- */
  async function addSchedule() {
    const t = title.trim();
    if (!t) return;
    const starts_at = date.toISOString();
    const emptyVotes = Object.fromEntries(
      members.map((m) => [m, "no"])
    ) as Record<Member, Vote>;

    const { error } = await supabase
      .from("schedules")
      .insert({ starts_at, title: t, votes: emptyVotes });

    if (error) alert("追加に失敗: " + error.message);
    else setTitle("");
  }

  /* ----- 投票切替 ----- */
  async function toggleVote(s: Schedule, m: Member) {
    const next = voteCycle[(voteCycle.indexOf(s.votes[m]) + 1) % voteCycle.length];
    const nextVotes = { ...s.votes, [m]: next };
    const { error } = await supabase
      .from("schedules")
      .update({ votes: nextVotes })
      .eq("id", s.id);
    if (error) alert("更新に失敗: " + error.message);
  }

  /* ----- 削除 ----- */
  async function removeSchedule(id: string) {
    const { error } = await supabase.from("schedules").delete().eq("id", id);
    if (error) alert("削除に失敗: " + error.message);
  }

  /* ----- 表示用集計 ----- */
  const submittedMap = useMemo(() => {
    const m: Record<Member, boolean> = Object.fromEntries(
      members.map((x) => [x, false])
    ) as any;
    for (const s of schedules) {
      for (const k of members) {
        if (s.votes?.[k] && s.votes[k] !== "no") m[k] = true;
      }
    }
    return m;
  }, [schedules]);
  const confirmed = useMemo(
    () => schedules.filter((s) => members.every((m) => s.votes?.[m] === "yes")),
    [schedules]
  );

  const voteBtn = (v: Vote) =>
    ({
      width: isMobile ? 44 : 40,
      height: isMobile ? 44 : 30,
      borderRadius: 8,
      border: "1px solid #cbd5e1",
      backgroundColor: voteColors[v],
      fontSize: isMobile ? 24 : 18,
    }) as React.CSSProperties;

  /* ----- .ics エクスポート ----- */
  function exportICS() {
    if (confirmed.length === 0) {
      alert("確定した予定がありません");
      return;
    }
    const icsEvents = confirmed
      .map((s) => {
        const start = new Date(s.starts_at)
          .toISOString()
          .replace(/[-:]/g, "")
          .split(".")[0] + "Z";
        const endDate = new Date(new Date(s.starts_at).getTime() + 2 * 60 * 60 * 1000); // +2h
        const end = endDate
          .toISOString()
          .replace(/[-:]/g, "")
          .split(".")[0] + "Z";
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
  }

  /* ===== UI ===== */
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#111827",
        color: "#e5e7eb",
        padding: isMobile ? 12 : 24,
      }}
    >
      <div
        style={{
          maxWidth: 1000,
          margin: "0 auto",
          background: "white",
          color: "#111827",
          borderRadius: 16,
          padding: isMobile ? 12 : 20,
          boxShadow: "0 8px 24px rgba(0,0,0,.2)",
        }}
      >
        <h1 style={{ marginBottom: 12, fontSize: isMobile ? 20 : 24 }}>
          スプラ日程調整（共有版）
        </h1>

        {!ready && (
          <div style={{ marginBottom: 8, padding: 8, background: "#fff3cd", borderRadius: 8 }}>
            読み込み中…
          </div>
        )}
        {err && (
          <div style={{ marginBottom: 8, padding: 8, background: "#fde2e2", borderRadius: 8 }}>
            Error: {err}
          </div>
        )}

        {/* メンバー */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
          {members.map((m) => (
            <span
              key={m}
              style={{
                padding: "6px 12px",
                borderRadius: 999,
                fontWeight: 700,
                color: "white",
                backgroundColor: submittedMap[m] ? "#16a34a" : "#ef4444",
                fontSize: isMobile ? 14 : 16,
              }}
            >
              {memberLabel[m]}
            </span>
          ))}
        </div>

        {/* カレンダー */}
        <div style={{ background: "white" }}>
          <Calendar onChange={(v) => setDate(v as Date)} value={date} />
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

        {/* 予定一覧 */}
        <div style={{ marginTop: 16 }}>
          <h3 style={{ marginBottom: 8 }}>予定リスト</h3>

          {!isMobile ? (
            // PC: テーブル
            <div style={{ overflowX: "auto" }}>
              <table style={{ borderCollapse: "collapse", width: "100%" }}>
                <thead>
                  <tr>
                    <th style={{ borderBottom: "1px solid #e5e7eb", textAlign: "left", padding: 8 }}>日付</th>
                    <th style={{ borderBottom: "1px solid #e5e7eb", textAlign: "left", padding: 8 }}>内容</th>
                    {members.map((m) => (
                      <th key={m} style={{ borderBottom: "1px solid #e5e7eb", padding: 8 }}>
                        {memberLabel[m]}
                      </th>
                    ))}
                    <th style={{ borderBottom: "1px solid #e5e7eb", padding: 8 }}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {schedules.map((s) => {
                    const allYes = members.every((m) => s.votes?.[m] === "yes");
                    return (
                      <tr key={s.id} style={{ background: allYes ? "#ecfdf5" : "white" }}>
                        <td style={{ padding: 8 }}>{new Date(s.starts_at).toLocaleDateString()}</td>
                        <td style={{ padding: 8 }}>{s.title}</td>
                        {members.map((m) => (
                          <td key={m} style={{ padding: 8, textAlign: "center" }}>
                            <button
                              onClick={() => toggleVote(s, m)}
                              style={voteBtn(s.votes?.[m] || "no")}
                              aria-label={`${memberLabel[m]} の投票を切替`}
                            >
                              {voteEmoji[s.votes?.[m] || "no"]}
                            </button>
                          </td>
                        ))}
                        <td style={{ padding: 8 }}>
                          <button
                            onClick={() => removeSchedule(s.id)}
                            style={{
                              background: "#ef4444",
                              color: "white",
                              border: "none",
                              padding: "6px 10px",
                              borderRadius: 6,
                              fontWeight: 600,
                            }}
                          >
                            削除
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            // Mobile: カード
            <div style={{ display: "grid", gap: 12 }}>
              {schedules.map((s) => {
                const allYes = members.every((m) => s.votes?.[m] === "yes");
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
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: 6,
                      }}
                    >
                      <div style={{ fontWeight: 700 }}>
                        {new Date(s.starts_at).toLocaleDateString()} ・ {s.title}
                      </div>
                      <button
                        onClick={() => removeSchedule(s.id)}
                        style={{
                          background: "#ef4444",
                          color: "white",
                          border: "none",
                          padding: "4px 8px",
                          borderRadius: 6,
                          fontSize: 12,
                          fontWeight: 600,
                        }}
                      >
                        削除
                      </button>
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
                          onClick={() => toggleVote(s, m)}
                          style={voteBtn(s.votes?.[m] || "no")}
                          aria-label={`${memberLabel[m]} の投票を切替`}
                        >
                          {voteEmoji[s.votes?.[m] || "no"]}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 確定した予定 & ics */}
        <div style={{ marginTop: 20 }}>
          <h3 style={{ marginBottom: 8 }}>確定した予定</h3>
          <ul style={{ paddingLeft: 18 }}>
            {confirmed.map((s) => (
              <li key={s.id}>
                {new Date(s.starts_at).toLocaleDateString()} - {s.title}
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
