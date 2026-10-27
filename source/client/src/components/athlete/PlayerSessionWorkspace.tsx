import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { BookOpenCheck, FilePenLine } from "lucide-react";
import type { AccessRequest, Analysis, PlayerCard } from "@shared/athlete";
import { useApi, useAthlete } from "@/lib/athleteApi";
import {
  DemoBadge,
  EmptyState,
  ErrorState,
  Loading,
  PageHeading,
  Panel,
} from "./UI";
import SessionNotes from "./SessionNotes";
import ExercisePlans from "./ExercisePlans";

export default function PlayerSessionWorkspace({
  section,
}: {
  section: "notes" | "training";
}) {
  const { organization, orgId, session } = useAthlete();
  const isClub = organization?.type === "club";
  const playersQuery = useApi<PlayerCard[]>("/players");
  const requests = useApi<AccessRequest[]>("/requests", isClub);
  const [playerId, setPlayerId] = useState(
    () => Number(new URLSearchParams(window.location.search).get("player")) || 0
  );
  const [analysisId, setAnalysisId] = useState(0);
  const players = useMemo(
    () =>
      (playersQuery.data ?? []).filter(
        p =>
          !isClub ||
          (session?.mode === "demo" && p.isDemo) ||
          requests.data?.some(
            r => r.playerId === p.id && r.status === "approved"
          )
      ),
    [playersQuery.data, requests.data, isClub, session?.mode]
  );
  const allowed = players.some(p => p.id === playerId);
  const analysesQuery = useApi<Analysis[]>(
    `/analyses?playerId=${playerId}`,
    allowed
  );
  const analyses = (analysesQuery.data ?? []).filter(a => a.pose && !a.isDemo);
  useEffect(() => {
    if (playersQuery.isLoading || (isClub && requests.isLoading)) return;
    if (!players.some(p => p.id === playerId)) {
      setPlayerId(players[0]?.id ?? 0);
      setAnalysisId(0);
    }
  }, [players, playerId, playersQuery.isLoading, requests.isLoading, isClub]);
  useEffect(() => {
    setAnalysisId(0);
  }, [playerId, orgId]);
  useEffect(() => {
    if (!allowed) return;
    const params = new URLSearchParams(window.location.search);
    params.set("player", String(playerId));
    window.history.replaceState(
      window.history.state,
      "",
      `${window.location.pathname}?${params}`
    );
  }, [allowed, playerId]);
  if (playersQuery.isLoading || !organization || (isClub && requests.isLoading))
    return <Loading />;
  if (playersQuery.error || requests.error)
    return (
      <ErrorState
        error={playersQuery.error ?? requests.error}
        retry={() => {
          void playersQuery.refetch();
          void requests.refetch();
        }}
      />
    );
  return (
    <div className="section-stack">
      <PageHeading
        title={
          section === "notes" ? "الملاحظات المسجلة" : "التمارين الموصى بها"
        }
        icon={section === "notes" ? FilePenLine : BookOpenCheck}
        subtitle="السجل المحفوظ مرتبط باللاعب والجلسة؛ لا توجد نصوص أو جرعات بديلة جاهزة."
        actions={<DemoBadge />}
      />
      {!players.length ? (
        <EmptyState
          title="لا يوجد لاعب متاح"
          description="أضف لاعبًا أو اطلب صلاحية الملف من الأكاديمية."
        />
      ) : (
        <>
          <Panel title="اللاعب والجلسة">
            <div className="form-grid">
              <label>
                اللاعب
                <select
                  className="field"
                  value={playerId}
                  onChange={e => setPlayerId(Number(e.target.value))}
                >
                  {players.map(p => (
                    <option value={p.id} key={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                الجلسة المرتبطة
                <select
                  className="field"
                  value={analysisId}
                  onChange={e => setAnalysisId(Number(e.target.value))}
                  disabled={analysesQuery.isLoading}
                >
                  <option value={0}>
                    كل سجل اللاعب — ملاحظة عامة عند الإضافة
                  </option>
                  {analyses.map(a => (
                    <option value={a.id} key={a.id}>
                      #{a.id} · {a.skill} ·{" "}
                      {new Date(a.createdAt).toLocaleDateString("ar")}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <Link href={`/players/${playerId}`} className="text-link">
              فتح ملف اللاعب
            </Link>
          </Panel>
          {analysesQuery.error ? (
            <ErrorState
              error={analysesQuery.error}
              retry={analysesQuery.refetch}
            />
          ) : null}
          {allowed &&
            (section === "notes" ? (
              <SessionNotes
                key={`notes-${orgId}-${playerId}-${analysisId}`}
                playerId={playerId}
                analysisId={analysisId || undefined}
              />
            ) : (
              <ExercisePlans
                key={`plans-${orgId}-${playerId}-${analysisId}`}
                playerId={playerId}
                analysisId={analysisId || undefined}
              />
            ))}
        </>
      )}
    </div>
  );
}
