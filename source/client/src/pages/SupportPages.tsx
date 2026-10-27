import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useLocation } from "wouter";
import {
  BookOpenCheck,
  Building2,
  CheckSquare2,
  FilePenLine,
  LockKeyhole,
  LogOut,
  Plus,
  Settings2,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import type {
  AccessRequest,
  Analysis,
  Note,
  PlayerCard,
} from "@shared/athlete";
import {
  DEFAULT_SPORT,
  SPORT_IDS,
  sportDefinition,
  type SportId,
} from "@shared/sports";
import { api, clearDemoToken, useApi, useAthlete } from "@/lib/athleteApi";
import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import PlayerSessionWorkspace from "@/components/athlete/PlayerSessionWorkspace";
import "@/components/athlete/sport-forms.css";
import {
  DemoBadge,
  EmptyState,
  ErrorState,
  Loading,
  Modal,
  PageHeading,
  Panel,
} from "@/components/athlete/UI";

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString("ar-SA", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
}

function newestAnalysis(analyses: Analysis[]) {
  return analyses
    .slice()
    .sort(
      (left, right) =>
        new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
    )[0];
}

function ClubAccessNotice({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  const { session, setOrgId } = useAthlete();
  const clubMemberships = (session?.memberships ?? []).filter(
    membership => membership.type === "club"
  );
  return (
    <div className="section-stack">
      <PageHeading
        title={title}
        subtitle={description}
        icon={LockKeyhole}
        actions={<DemoBadge compact />}
      />
      <Panel title="يتطلب مساحة نادي" icon={LockKeyhole}>
        <div className="section-stack">
          <p className="muted">
            تظهر خطط التدريب فقط للاعبين الذين يملك ناديك صلاحية الاطلاع عليهم.
            لا يمكن تغيير الصلاحية من هذه الصفحة.
          </p>
          {clubMemberships.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {clubMemberships.map(membership => (
                <button
                  className="btn btn-primary"
                  type="button"
                  key={membership.organizationId}
                  onClick={() => setOrgId(membership.organizationId)}
                >
                  التبديل إلى {membership.name}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </Panel>
    </div>
  );
}

function LegacyTrainingArchive() {
  const { organization, orgId, session } = useAthlete();
  const isClub = organization?.type === "club";
  const isDemoSession = session?.mode === "demo";
  const playersQuery = useApi<PlayerCard[]>("/players", Boolean(organization));
  const requestsQuery = useApi<AccessRequest[]>("/requests", isClub);
  const [selectedPlayerId, setSelectedPlayerId] = useState<number | undefined>(
    () =>
      Number(new URLSearchParams(window.location.search).get("player")) ||
      undefined
  );
  const analysesQuery = useApi<Analysis[]>(
    `/analyses?playerId=${selectedPlayerId ?? ""}`,
    Boolean(organization) && Boolean(selectedPlayerId)
  );
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [activeExercise, setActiveExercise] = useState<{
    title: string;
    description: string;
  } | null>(null);
  const [completed, setCompleted] = useState<Record<string, boolean>>({});

  const approvedPlayerIds = useMemo(
    () =>
      new Set(
        (requestsQuery.data ?? [])
          .filter(request => request.status === "approved")
          .map(request => request.playerId)
      ),
    [requestsQuery.data]
  );
  const players = useMemo(
    () =>
      isClub
        ? (playersQuery.data ?? []).filter(
            player =>
              approvedPlayerIds.has(player.id) ||
              (isDemoSession && player.isDemo === true)
          )
        : (playersQuery.data ?? []),
    [approvedPlayerIds, isDemoSession, playersQuery.data, isClub]
  );
  const latest = useMemo(
    () => newestAnalysis(analysesQuery.data ?? []),
    [analysesQuery.data]
  );
  const latestIsPose = Boolean(latest?.pose && !latest.isDemo);
  const plannerKey =
    latest && orgId && selectedPlayerId
      ? `athlete-personal-practice:${orgId}:${selectedPlayerId}:${latest.id}`
      : "";

  useEffect(() => {
    if (!players.some(player => player.id === selectedPlayerId))
      setSelectedPlayerId(players[0]?.id);
  }, [players, selectedPlayerId]);

  useEffect(() => {
    if (!plannerKey) {
      setCompleted({});
      return;
    }
    try {
      const stored = localStorage.getItem(plannerKey);
      setCompleted(
        stored ? (JSON.parse(stored) as Record<string, boolean>) : {}
      );
    } catch {
      setCompleted({});
    }
  }, [plannerKey]);

  function togglePractice(title: string) {
    setCompleted(current => {
      const next = { ...current, [title]: !current[title] };
      try {
        if (plannerKey) localStorage.setItem(plannerKey, JSON.stringify(next));
      } catch {
        // The planner remains usable for the current session if local storage is unavailable.
      }
      return next;
    });
  }

  if (!organization) return <Loading label="جارٍ التحقق من العضوية…" />;
  if (playersQuery.isLoading || (isClub && requestsQuery.isLoading))
    return <Loading label="جارٍ تحميل اللاعبين المتاحين…" />;
  if (playersQuery.error || requestsQuery.error)
    return (
      <ErrorState
        error={playersQuery.error ?? requestsQuery.error}
        retry={() => {
          void Promise.all([playersQuery.refetch(), requestsQuery.refetch()]);
        }}
      />
    );

  return (
    <div className="section-stack">
      <PageHeading
        title="البرامج التدريبية"
        subtitle="معلومات وتمارين مسجلة للاعبين المتاحين ضمن صلاحية مؤسستك."
        icon={BookOpenCheck}
        actions={<DemoBadge />}
      />
      {players.length === 0 ? (
        <EmptyState
          title="لا يوجد لاعب متاح"
          description={
            isClub
              ? "ستظهر التمارين بعد موافقة الأكاديمية على طلب الاطلاع."
              : "أضف لاعبًا إلى الأكاديمية لتجربة التحليل والتمارين."
          }
        />
      ) : (
        <>
          <Panel title="اختيار اللاعب" icon={CheckSquare2}>
            <label>
              <span>اللاعب</span>
              <select
                className="field"
                value={selectedPlayerId ?? ""}
                onChange={event =>
                  setSelectedPlayerId(Number(event.target.value))
                }
              >
                {players.map(player => (
                  <option value={player.id} key={player.id}>
                    {player.name} — {player.position}
                  </option>
                ))}
              </select>
            </label>
          </Panel>

          {analysesQuery.isLoading ? (
            <Loading label="جارٍ تحميل التحليلات المصرح بها…" />
          ) : null}
          {analysesQuery.error ? (
            <ErrorState
              error={analysesQuery.error}
              retry={() => {
                void analysesQuery.refetch();
              }}
            />
          ) : null}
          {!analysesQuery.isLoading && !analysesQuery.error && !latest ? (
            <EmptyState
              title="لا يتوفر تحليل بعد"
              description="لا توجد تمارين لعرضها لأن أحدث تحليل متاح لهذا اللاعب لم يُسجل بعد."
            />
          ) : null}
          {latest ? (
            <>
              <Panel
                title={`أحدث تحليل: ${latest.skill}`}
                icon={Sparkles}
                actions={
                  <button
                    className="btn btn-outline"
                    type="button"
                    onClick={() => setAnalysisOpen(true)}
                  >
                    {latestIsPose
                      ? "تفاصيل الرؤية الحاسوبية"
                      : "تفاصيل التحليل التجريبي"}
                  </button>
                }
              >
                <div className="section-stack">
                  <p className="muted text-sm">
                    {latestIsPose
                      ? "تقدير رؤية حاسوبية من المقطع — زوايا 2D غير معايرة. لا ينتج هذا التحليل تقييمًا رياضيًا أو تشخيصًا طبيًا."
                      : `سُجل في ${formatDate(latest.createdAt)}. هذه بيانات تجريبية توضيحية وليست تشخيصًا طبيًا أو نتيجة ذكاء اصطناعي فعلية.`}
                  </p>
                  {latest.metrics.length > 0 ? (
                    <div className="grid-3">
                      {latest.metrics.map(metric => (
                        <div className="stat-card" key={metric.name}>
                          <span className="muted">{metric.name}</span>
                          <strong>
                            {metric.value} {metric.unit}
                          </strong>
                          <span className="badge">{metric.rating}</span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              </Panel>
              <Panel title="خطة ممارسة شخصية" icon={CheckSquare2}>
                <div className="section-stack">
                  {latestIsPose ? (
                    <p className="muted">
                      لا يولّد تحليل الرؤية الحاسوبية الحالي درجات رياضية أو
                      توصيات تدريبية. اعتمد على المدرب والقياسات المسجلة عند
                      إعداد خطة ممارسة.
                    </p>
                  ) : (
                    <>
                      <p className="muted">
                        هذه قائمة متابعة شخصية محفوظة محليًا على هذا المتصفح
                        فقط، وليست وصفة طبية أو نتيجة AI ولا تُرسل إلى
                        الأكاديمية.
                      </p>
                      {latest.exercises.length === 0 ? (
                        <EmptyState
                          title="لا توجد تمارين في التحليل"
                          description="لا يمكن إنشاء تمارين بديلة غير مسجلة في أحدث تحليل."
                        />
                      ) : (
                        latest.exercises.map(exercise => (
                          <div
                            className="flex items-start justify-between gap-3"
                            key={exercise.title}
                          >
                            <label className="flex items-start gap-3">
                              <input
                                type="checkbox"
                                checked={Boolean(completed[exercise.title])}
                                onChange={() => togglePractice(exercise.title)}
                              />
                              <span>
                                <strong>{exercise.title}</strong>
                                <small className="muted block">
                                  {exercise.description}
                                </small>
                              </span>
                            </label>
                            <button
                              className="btn btn-ghost"
                              type="button"
                              onClick={() => setActiveExercise(exercise)}
                            >
                              التفاصيل
                            </button>
                          </div>
                        ))
                      )}
                    </>
                  )}
                </div>
              </Panel>
            </>
          ) : null}
        </>
      )}

      {analysisOpen && latest ? (
        <Modal
          title={`تفاصيل تحليل ${latest.skill}`}
          onClose={() => setAnalysisOpen(false)}
          wide
        >
          <div className="section-stack">
            {latestIsPose ? (
              <span className="badge">
                تقدير رؤية حاسوبية من المقطع — زوايا 2D غير معايرة
              </span>
            ) : (
              <DemoBadge />
            )}
            <p className="muted">
              {latestIsPose
                ? "يعرض هذا السجل القراءة الحاسوبية المتاحة فقط ولا يولّد نتيجة رياضية أو توصيات جديدة."
                : "يوضح هذا العرض بيانات التحليل المتاحة فقط ولا يشغّل فيديو أو يولّد نتائج جديدة."}
            </p>
            {latest.metrics.length > 0 ? (
              <div className="grid-3">
                {latest.metrics.map(metric => (
                  <div className="stat-card" key={metric.name}>
                    <span>{metric.name}</span>
                    <strong>
                      {metric.value} {metric.unit}
                    </strong>
                    <small>{metric.rating}</small>
                  </div>
                ))}
              </div>
            ) : null}
            {latest.observations.length > 0 ? (
              <Panel title="الملاحظات">
                <div className="section-stack">
                  {latest.observations.map(observation => (
                    <div key={`${observation.type}-${observation.title}`}>
                      <strong>{observation.title}</strong>
                      <p className="muted">{observation.detail}</p>
                    </div>
                  ))}
                </div>
              </Panel>
            ) : null}
          </div>
        </Modal>
      ) : null}
      {activeExercise ? (
        <Modal
          title={activeExercise.title}
          onClose={() => setActiveExercise(null)}
        >
          <div className="section-stack">
            <DemoBadge compact />
            <p>{activeExercise.description}</p>
            <p className="muted">
              هذه تعليمات تجريبية مأخوذة من التحليل المسجل، وليست إرشادًا طبيًا
              أو بديلًا عن المدرب المختص.
            </p>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

function LegacyNotesArchive() {
  const { organization, invalidate } = useAthlete();
  const isAcademy = organization?.type === "academy";
  const notesQuery = useApi<Note[]>("/notes", Boolean(organization));
  const playersQuery = useApi<PlayerCard[]>("/players", isAcademy);
  const [search, setSearch] = useState("");
  const [selectedPlayerId, setSelectedPlayerId] = useState<
    number | undefined
  >();
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const players = playersQuery.data ?? [];
  const notes = notesQuery.data ?? [];
  const visibleNotes = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase("ar-SA");
    return notes.filter(
      note =>
        !needle ||
        [note.playerName, note.text].some(value =>
          value.toLocaleLowerCase("ar-SA").includes(needle)
        )
    );
  }, [notes, search]);

  useEffect(() => {
    if (!selectedPlayerId && players[0]) setSelectedPlayerId(players[0].id);
  }, [players, selectedPlayerId]);

  async function saveNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedPlayerId || !text.trim()) {
      setSaveError("اختر لاعبًا واكتب ملاحظة قبل الحفظ.");
      return;
    }
    setSaving(true);
    setSaveError("");
    try {
      await api<Note>("/notes", {
        method: "POST",
        body: JSON.stringify({ playerId: selectedPlayerId, text: text.trim() }),
      });
      await invalidate();
      setText("");
      toast.success("تم حفظ الملاحظة.");
    } catch (cause) {
      setSaveError(
        cause instanceof Error ? cause.message : "تعذر حفظ الملاحظة."
      );
    } finally {
      setSaving(false);
    }
  }

  if (!organization) return <Loading label="جارٍ التحقق من مساحة العمل…" />;
  if (notesQuery.isLoading || (isAcademy && playersQuery.isLoading))
    return <Loading label="جارٍ تحميل الملاحظات…" />;
  if (notesQuery.error || playersQuery.error)
    return (
      <ErrorState
        error={notesQuery.error ?? playersQuery.error}
        retry={() => {
          void Promise.all([notesQuery.refetch(), playersQuery.refetch()]);
        }}
      />
    );

  return (
    <div className="section-stack">
      <PageHeading
        title="ملاحظات الأداء"
        subtitle={
          isAcademy
            ? "سجل ملاحظات للاعبين التابعين لأكاديميتك."
            : "ملاحظات متاحة فقط ضمن صلاحيات ناديك."
        }
        icon={FilePenLine}
        actions={<DemoBadge />}
      />
      {isAcademy ? (
        <Panel title="إضافة ملاحظة" icon={Plus}>
          {players.length === 0 ? (
            <EmptyState
              title="لا يوجد لاعب لإضافة ملاحظة"
              description="ستتاح الإضافة عند وجود لاعب تابع للأكاديمية."
            />
          ) : (
            <form className="section-stack" onSubmit={saveNote}>
              <label>
                <span>اللاعب</span>
                <select
                  className="field"
                  value={selectedPlayerId ?? ""}
                  onChange={event =>
                    setSelectedPlayerId(Number(event.target.value))
                  }
                >
                  {players.map(player => (
                    <option value={player.id} key={player.id}>
                      {player.name} — {player.position}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>الملاحظة</span>
                <textarea
                  className="field"
                  rows={5}
                  value={text}
                  onChange={event => setText(event.target.value)}
                  placeholder="اكتب ملاحظة رياضية واضحة…"
                  required
                />
              </label>
              {saveError ? (
                <p className="text-sm text-red-600">{saveError}</p>
              ) : null}
              <button
                className="btn btn-primary"
                type="submit"
                disabled={saving}
              >
                {saving ? "جارٍ الحفظ…" : "حفظ الملاحظة"}
              </button>
            </form>
          )}
        </Panel>
      ) : (
        <Panel title="صلاحية الملاحظات" icon={LockKeyhole}>
          <p className="muted">
            إضافة الملاحظات متاحة للأكاديمية المالكة فقط. يعرض النادي ما تسمح به
            صلاحيات الوصول الخادمية.
          </p>
        </Panel>
      )}
      <Panel title="الملاحظات المسجلة" icon={FilePenLine}>
        <div className="section-stack">
          <label className="search-field">
            <FilePenLine size={18} />
            <input
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="ابحث باللاعب أو نص الملاحظة"
              aria-label="البحث في الملاحظات"
            />
          </label>
          {visibleNotes.length === 0 ? (
            <EmptyState
              title="لا توجد ملاحظات مطابقة"
              description="لا تظهر هنا إلا الملاحظات التي يسمح بها نطاق مؤسستك."
            />
          ) : (
            <div className="section-stack">
              {visibleNotes.map(note => (
                <article className="stat-card" key={note.id}>
                  <div className="flex justify-between gap-3">
                    <strong>{note.playerName}</strong>
                    <span className="muted text-sm">
                      {formatDate(note.createdAt)}
                    </span>
                  </div>
                  <p>{note.text}</p>
                </article>
              ))}
            </div>
          )}
        </div>
      </Panel>
    </div>
  );
}

export function Training() {
  return <PlayerSessionWorkspace section="training" />;
}
export function Notes() {
  return <PlayerSessionWorkspace section="notes" />;
}

export function Settings() {
  const { organization, session, setOrgId, invalidate } = useAthlete();
  const { logout } = useAuth();
  const [, setLocation] = useLocation();
  const [name, setName] = useState("");
  const [region, setRegion] = useState("");
  const [sports, setSports] = useState<SportId[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newRegion, setNewRegion] = useState("");
  const [newType, setNewType] = useState<"academy" | "club">("academy");
  const [newSports, setNewSports] = useState<SportId[]>([DEFAULT_SPORT]);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const isGuest = session?.mode === "demo" && !session?.user;

  useEffect(() => {
    setName(organization?.name ?? "");
    setRegion(organization?.region ?? "");
    setSports(
      organization?.sports?.length ? [...organization.sports] : [DEFAULT_SPORT]
    );
    setSaveError("");
  }, [
    organization?.name,
    organization?.region,
    organization?.sports,
    organization?.organizationId,
  ]);

  async function saveOrganization(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim() || !region.trim()) {
      setSaveError("أدخل اسم المؤسسة والمنطقة.");
      return;
    }
    if (!sports.length) {
      setSaveError("اختر رياضة واحدة على الأقل للمؤسسة.");
      return;
    }
    setSaving(true);
    setSaveError("");
    try {
      await api<unknown>("/organizations/current", {
        method: "PATCH",
        body: JSON.stringify({
          name: name.trim(),
          region: region.trim(),
          sports,
        }),
      });
      await invalidate();
      toast.success("تم حفظ إعدادات المؤسسة.");
    } catch (cause) {
      setSaveError(
        cause instanceof Error ? cause.message : "تعذر حفظ إعدادات المؤسسة."
      );
    } finally {
      setSaving(false);
    }
  }

  async function createOrganization(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isGuest) {
      setCreateError("إنشاء المؤسسات متاح بعد تسجيل الدخول للبيانات الحقيقية.");
      return;
    }
    if (!newName.trim() || !newRegion.trim()) {
      setCreateError("أدخل اسم المؤسسة والمنطقة.");
      return;
    }
    if (!newSports.length) {
      setCreateError("اختر رياضة واحدة على الأقل لمساحة العمل.");
      return;
    }
    setCreating(true);
    setCreateError("");
    try {
      await api<unknown>("/organizations", {
        method: "POST",
        body: JSON.stringify({
          name: newName.trim(),
          type: newType,
          region: newRegion.trim(),
          sports: newSports,
        }),
      });
      await invalidate();
      setCreateOpen(false);
      setNewName("");
      setNewRegion("");
      toast.success("تم إنشاء مساحة العمل المملوكة لحسابك.");
    } catch (cause) {
      setCreateError(
        cause instanceof Error ? cause.message : "تعذر إنشاء مساحة العمل."
      );
    } finally {
      setCreating(false);
    }
  }

  async function confirmLogout() {
    setLogoutError("");
    try {
      await logout();
      await invalidate();
      setLocation("/");
    } catch (cause) {
      setLogoutError(
        cause instanceof Error ? cause.message : "تعذر تسجيل الخروج."
      );
    }
  }

  function loginForRealData() {
    try {
      clearDemoToken();
      startLogin();
    } catch (cause) {
      toast.error(
        cause instanceof Error ? cause.message : "تعذر فتح تسجيل الدخول."
      );
    }
  }

  if (!organization) return <Loading label="جارٍ تحميل إعدادات المؤسسة…" />;
  const owner = organization.role === "owner";

  return (
    <div className="section-stack">
      <PageHeading
        title="الإعدادات"
        subtitle={`${organization.name} · ${organization.type === "academy" ? "أكاديمية" : "نادي"} · ${owner ? "مالك" : "موظف"}`}
        icon={Settings2}
        actions={
          isGuest ? (
            <span className="badge">عرض تجريبي · بيانات افتراضية</span>
          ) : (
            <DemoBadge compact />
          )
        }
      />
      <div className="grid-2">
        <Panel title="المؤسسة الحالية" icon={Building2}>
          <form className="section-stack" onSubmit={saveOrganization}>
            <p className="muted text-sm">
              يمكن لمالك المؤسسة فقط تعديل الاسم والمنطقة. الصلاحية النهائية
              تُتحقق خادميًا عند الحفظ.
            </p>
            <label>
              <span>اسم المؤسسة</span>
              <input
                className="field"
                value={name}
                onChange={event => setName(event.target.value)}
                disabled={!owner}
                required
              />
            </label>
            <label>
              <span>المنطقة</span>
              <input
                className="field"
                value={region}
                onChange={event => setRegion(event.target.value)}
                disabled={!owner}
                required
              />
            </label>
            <fieldset className="sport-toggle-group">
              <legend>الرياضات التي تعمل عليها المؤسسة</legend>
              <div className="sport-toggle-list">
                {SPORT_IDS.map(id => {
                  const checked = sports.includes(id);
                  return (
                    <label
                      key={id}
                      className={`sport-toggle ${checked ? "is-selected" : ""}`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={!owner || saving}
                        onChange={() =>
                          setSports(current =>
                            current.includes(id)
                              ? current.filter(item => item !== id)
                              : [...current, id]
                          )
                        }
                      />
                      <span>{sportDefinition(id).name}</span>
                    </label>
                  );
                })}
              </div>
              <small className="muted">
                تُقيد هذه القائمة رياضة اللاعبين والتقييمات؛ ويمنع الخادم إسناد
                رياضة غير مفعّلة. إلغاء رياضة لا يحذف لاعبين أو سجلات قائمة.
              </small>
            </fieldset>
            {saveError ? (
              <p className="text-sm text-red-600">{saveError}</p>
            ) : null}
            <button
              className="btn btn-primary"
              type="submit"
              disabled={!owner || saving}
            >
              {saving ? "جارٍ الحفظ…" : "حفظ الإعدادات"}
            </button>
          </form>
        </Panel>
        <Panel title="الخصوصية والوصول" icon={ShieldCheck}>
          <div className="section-stack">
            <p>
              لا يمكن للمؤسسات الأخرى الوصول إلى بيانات مؤسستك الخاصة. تتحقق
              المنصة من العضوية والصلاحيات على الخادم لكل طلب.
            </p>
            <p className="muted">
              تقتصر قابلية الاكتشاف على البطاقات المحدودة التي تسمح بها
              الأكاديمية؛ لا تُعد المفضلة أو طلب الاطلاع وعدًا بعرض الملف أو
              الفيديو أو التقارير الكاملة.
            </p>
          </div>
        </Panel>
      </div>

      <Panel
        title="مساحات العمل"
        icon={Building2}
        actions={
          <button
            className="btn btn-outline"
            type="button"
            onClick={() => setCreateOpen(true)}
            disabled={isGuest}
            title={
              isGuest
                ? "إنشاء المؤسسات متاح بعد تسجيل الدخول للبيانات الحقيقية."
                : undefined
            }
          >
            <Plus size={16} /> إنشاء مساحة
          </button>
        }
      >
        <div className="section-stack">
          <p className="muted">
            {isGuest
              ? "تستطيع التبديل بين مساحات العرض التي أنشأها الخادم لهذه الجلسة فقط."
              : "يمكنك التبديل فقط بين العضويات المرتبطة فعليًا بحسابك."}
          </p>
          <div className="grid-3">
            {(session?.memberships ?? []).map(membership => {
              const active =
                membership.organizationId === organization.organizationId;
              return (
                <div className="stat-card" key={membership.organizationId}>
                  <strong>{membership.name}</strong>
                  <span className="muted">
                    {membership.type === "academy" ? "أكاديمية" : "نادي"} ·{" "}
                    {membership.region}
                  </span>
                  <span className="badge">
                    {membership.role === "owner" ? "مالك" : "موظف"}
                  </span>
                  <button
                    className={active ? "btn btn-ghost" : "btn btn-outline"}
                    type="button"
                    disabled={active}
                    onClick={() => setOrgId(membership.organizationId)}
                  >
                    {active ? "المساحة الحالية" : "التبديل إلى هذه المساحة"}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </Panel>

      <Panel title="الحساب" icon={LogOut}>
        {isGuest ? (
          <div className="section-stack">
            <p className="muted">
              أنت في عرض تجريبي بلا حساب Manus. سجّل الدخول للوصول إلى بياناتك
              الحقيقية وإدارة مؤسساتك.
            </p>
            <button
              className="btn btn-outline"
              type="button"
              onClick={loginForRealData}
            >
              <LockKeyhole size={16} /> تسجيل الدخول للبيانات الحقيقية
            </button>
          </div>
        ) : (
          <button
            className="btn btn-outline"
            type="button"
            onClick={() => setLogoutOpen(true)}
          >
            <LogOut size={16} /> تسجيل الخروج
          </button>
        )}
      </Panel>

      {createOpen && !isGuest ? (
        <Modal title="إنشاء مساحة عمل" onClose={() => setCreateOpen(false)}>
          <form className="section-stack" onSubmit={createOrganization}>
            <p className="muted">
              تنشئ هذه العملية مؤسسة جديدة مملوكة لحسابك، ولا تمنح صلاحية على أي
              مؤسسة أخرى.
            </p>
            <label>
              <span>الاسم</span>
              <input
                className="field"
                value={newName}
                onChange={event => setNewName(event.target.value)}
                required
              />
            </label>
            <label>
              <span>النوع</span>
              <select
                className="field"
                value={newType}
                onChange={event =>
                  setNewType(event.target.value as "academy" | "club")
                }
              >
                <option value="academy">أكاديمية</option>
                <option value="club">نادي</option>
              </select>
            </label>
            <label>
              <span>المنطقة</span>
              <input
                className="field"
                value={newRegion}
                onChange={event => setNewRegion(event.target.value)}
                required
              />
            </label>
            <fieldset className="sport-toggle-group">
              <legend>الرياضات</legend>
              <div className="sport-toggle-list">
                {SPORT_IDS.map(id => {
                  const checked = newSports.includes(id);
                  return (
                    <label
                      key={id}
                      className={`sport-toggle ${checked ? "is-selected" : ""}`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          setNewSports(current =>
                            current.includes(id)
                              ? current.filter(item => item !== id)
                              : [...current, id]
                          )
                        }
                      />
                      <span>{sportDefinition(id).name}</span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
            {createError ? (
              <p className="text-sm text-red-600">{createError}</p>
            ) : null}
            <button
              className="btn btn-primary"
              type="submit"
              disabled={creating}
            >
              {creating ? "جارٍ الإنشاء…" : "إنشاء مساحة العمل"}
            </button>
          </form>
        </Modal>
      ) : null}
      {logoutOpen ? (
        <Modal title="تسجيل الخروج" onClose={() => setLogoutOpen(false)}>
          <div className="section-stack">
            <p>هل تريد إنهاء الجلسة الحالية؟</p>
            {logoutError ? (
              <p className="text-sm text-red-600">{logoutError}</p>
            ) : null}
            <div className="flex gap-2">
              <button
                className="btn btn-outline"
                type="button"
                onClick={() => setLogoutOpen(false)}
              >
                إلغاء
              </button>
              <button
                className="btn btn-primary"
                type="button"
                onClick={() => {
                  void confirmLogout();
                }}
              >
                تسجيل الخروج
              </button>
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
