import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  ChartNoAxesCombined,
  CheckCircle2,
  FileChartColumn,
  Filter,
  GraduationCap,
  Loader2,
  Pencil,
  Plus,
  Search,
  TrendingUp,
  Upload,
  Users,
  Video as VideoIcon,
} from "lucide-react";
import { toast } from "sonner";
import type {
  Analysis,
  PhysicalTest,
  Player,
  PlayerCard,
  PlayerInput,
  SkillValue,
  Video,
} from "@shared/athlete";
import { PLAYER_LIMITS, POSITIONS, SKILLS } from "@shared/athlete";
import { api, useApi, useAthlete } from "@/lib/athleteApi";
import {
  Avatar,
  DemoBadge,
  EmptyState,
  ErrorState,
  Improvement,
  Loading,
  Modal,
  PageHeading,
  Panel,
  ScoreRing,
  Tabs,
  TextLink,
  TrendChart,
  UploadModal,
  VideoLibrary,
} from "@/components/athlete/UI";
import { hasDocumentedOverall } from "@/components/athlete/EvaluationSummary";

function PlayerEditor({
  player,
  onClose,
}: {
  player: Player | null;
  onClose: () => void;
}) {
  const { organization, invalidate } = useAthlete();
  const [form, setForm] = useState<PlayerInput>(() =>
    player
      ? {
          name: player.name,
          age: player.age,
          nationality: player.nationality,
          position: player.position,
          foot: player.foot,
          height: player.height,
          weight: player.weight,
          birthDate: player.birthDate.slice(0, 10),
          jersey: player.jersey,
          region: player.region,
          discoverable: player.discoverable,
          strengths: player.strengths,
          weaknesses: player.weaknesses,
          skills: player.skills,
          physicalTests: player.physicalTests,
        }
      : {
          name: "",
          age: 0,
          nationality: "",
          position: "",
          foot: "",
          height: 0,
          weight: 0,
          birthDate: "",
          jersey: 0,
          region: "",
          discoverable: true,
          strengths: [],
          weaknesses: [],
          skills: [],
          physicalTests: [],
        }
  );
  const [tab, setTab] = useState("basic");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const change = <K extends keyof PlayerInput>(key: K, value: PlayerInput[K]) =>
    setForm(prev => ({ ...prev, [key]: value }));
  const updateTest = <K extends keyof PhysicalTest>(
    index: number,
    key: K,
    value: PhysicalTest[K]
  ) =>
    setForm(prev => ({
      ...prev,
      physicalTests: prev.physicalTests?.map((t, i) =>
        i === index ? { ...t, [key]: value } : t
      ),
    }));
  const addTest = () =>
    setForm(prev => ({
      ...prev,
      physicalTests: [
        ...(prev.physicalTests ?? []),
        { name: "", value: "", unit: "" },
      ],
    }));
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api<Player>(player ? `/players/${player.id}` : "/players", {
        method: player ? "PUT" : "POST",
        body: JSON.stringify(form),
      });
      await invalidate();
      toast.success(
        player ? "تم تحديث ملف اللاعب" : "تمت إضافة اللاعب إلى الأكاديمية"
      );
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر حفظ بيانات اللاعب");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title={player ? "تعديل الملف الرقمي للاعب" : "إضافة لاعب جديد"}
      onClose={onClose}
      wide
    >
      <form onSubmit={save} className="section-stack">
        <Tabs
          items={[
            { id: "basic", label: "البيانات الأساسية" },
            { id: "sport", label: "البيانات الرياضية" },
          ]}
          value={tab}
          onChange={setTab}
        />
        {tab === "basic" ? (
          <div className="form-grid">
            <label className="field">
              اسم اللاعب
              <input
                required
                minLength={2}
                maxLength={100}
                value={form.name}
                onChange={e => change("name", e.target.value)}
                placeholder="اسم افتراضي للاعب"
              />
            </label>
            <label className="field">
              الأكاديمية
              <input value={organization?.name ?? ""} readOnly />
            </label>
            <label className="field">
              العمر
              <input
                type="number"
                required
                min={PLAYER_LIMITS.age.min}
                max={PLAYER_LIMITS.age.max}
                value={form.age || ""}
                onChange={e => change("age", Number(e.target.value))}
              />
            </label>
            <label className="field">
              الجنسية
              <input
                required
                maxLength={60}
                value={form.nationality}
                onChange={e => change("nationality", e.target.value)}
              />
            </label>
            <label className="field">
              المركز الرياضي
              <select
                required
                value={form.position}
                onChange={e => change("position", e.target.value)}
              >
                <option value="">اختر المركز</option>
                {POSITIONS.map(p => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </label>
            <label className="field">
              القدم المفضلة
              <select
                required
                value={form.foot}
                onChange={e => change("foot", e.target.value)}
              >
                <option value="">اختر القدم</option>
                <option>اليمنى</option>
                <option>اليسرى</option>
                <option>كلتا القدمين</option>
              </select>
            </label>
            <label className="field">
              الطول (سم)
              <input
                type="number"
                required
                min={PLAYER_LIMITS.height.min}
                max={PLAYER_LIMITS.height.max}
                value={form.height || ""}
                onChange={e => change("height", Number(e.target.value))}
              />
            </label>
            <label className="field">
              الوزن (كغ)
              <input
                type="number"
                required
                min={PLAYER_LIMITS.weight.min}
                max={PLAYER_LIMITS.weight.max}
                value={form.weight || ""}
                onChange={e => change("weight", Number(e.target.value))}
              />
            </label>
            <label className="field">
              تاريخ الميلاد
              <input
                type="date"
                required
                value={form.birthDate}
                max={new Date().toISOString().slice(0, 10)}
                onChange={e => change("birthDate", e.target.value)}
              />
            </label>
            <label className="field">
              رقم اللاعب
              <input
                type="number"
                required
                min={PLAYER_LIMITS.jersey.min}
                max={PLAYER_LIMITS.jersey.max}
                value={form.jersey}
                onChange={e => change("jersey", Number(e.target.value))}
              />
            </label>
            <label className="field">
              المنطقة
              <input
                required
                value={form.region}
                maxLength={60}
                onChange={e => change("region", e.target.value)}
              />
            </label>
            <label className="field" style={{ justifyContent: "center" }}>
              <span className="field-inline">
                <input
                  type="checkbox"
                  checked={form.discoverable}
                  onChange={e => change("discoverable", e.target.checked)}
                />
                إتاحة بطاقة موهبة مختصرة للأندية
              </span>
              <small className="muted">
                لا يتيح ذلك الاطلاع على الملف الكامل.
              </small>
            </label>
          </div>
        ) : (
          <>
            <p className="privacy-note">
              لا تُدخل درجات مهارات أو قوائم قوة/تطوير يدويًا هنا؛ تستمد هذه
              الأقسام من نتائج الجلسات ذات القاعدة الموثقة فقط. الاختبار البدني
              أدناه سجل يدوي منفصل لا يُنسب إلى الفيديو.
            </p>
            <div className="flex justify-between items-center gap-3">
              <h3 style={{ fontSize: 14 }}>نتائج الاختبارات البدنية المدخلة</h3>
              <button
                className="btn btn-outline btn-sm"
                type="button"
                onClick={addTest}
              >
                إضافة اختبار
              </button>
            </div>
            <div className="form-grid">
              {form.physicalTests?.map((test, i) => (
                <div className="form-grid" key={`${test.name}-${i}`}>
                  <label className="field">
                    اسم الاختبار
                    <input
                      maxLength={60}
                      value={test.name}
                      onChange={e => updateTest(i, "name", e.target.value)}
                      required
                    />
                  </label>
                  <label className="field">
                    النتيجة
                    <input
                      maxLength={30}
                      value={test.value}
                      onChange={e => updateTest(i, "value", e.target.value)}
                      required
                    />
                  </label>
                  <label className="field">
                    الوحدة
                    <input
                      maxLength={30}
                      value={test.unit}
                      onChange={e => updateTest(i, "unit", e.target.value)}
                      required
                    />
                  </label>
                </div>
              ))}
            </div>
            {!form.physicalTests?.length ? (
              <p className="muted">
                لا توجد اختبارات بدنية مدخلة. لا تُضاف قيمة افتراضية.
              </p>
            ) : null}
          </>
        )}
        <p className="privacy-note">
          <CheckCircle2 size={17} />
          استخدم بيانات تملك صلاحية إدارتها. لا يظهر الملف أو الفيديو خارج
          صلاحيات المؤسسة التي يتحقق منها الخادم.
        </p>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button
            className="btn btn-outline"
            type="button"
            onClick={onClose}
            disabled={busy}
          >
            إلغاء
          </button>
          <button className="btn btn-primary" disabled={busy}>
            {busy ? (
              <Loader2 className="spin" size={16} />
            ) : (
              <CheckCircle2 size={16} />
            )}
            {busy ? "جارٍ الحفظ…" : "حفظ بيانات اللاعب"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
export default function Academies() {
  const { organization, session, setOrgId, orgId } = useAthlete();
  const isAcademy = organization?.type === "academy";
  const isDemo = session?.mode === "demo";
  const playersQuery = useApi<PlayerCard[]>("/players", isAcademy);
  const players = playersQuery.data ?? [];
  const [search, setSearch] = useState("");
  const [position, setPosition] = useState("");
  const [age, setAge] = useState("");
  const [level, setLevel] = useState("");
  const [tab, setTab] = useState("all");
  const [moreFilters, setMoreFilters] = useState(false);
  const [editor, setEditor] = useState(false);
  const [editing, setEditing] = useState<Player | null>(null);
  const [uploadPlayer, setUploadPlayer] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const firstQuery = useApi<Player>(
    `/players/${players[0]?.id ?? 0}`,
    isAcademy && !!players[0]
  );
  const media = useQuery({
    queryKey: [
      "athlete",
      orgId,
      "academy-media",
      players.map(p => p.id).join(","),
    ],
    enabled: isAcademy && players.length > 0,
    queryFn: async () => {
      const groups = await Promise.all(
        players.map(async p => ({
          videos: await api<Video[]>(`/videos?playerId=${p.id}`),
          analyses: await api<Analysis[]>(`/analyses?playerId=${p.id}`),
        }))
      );
      return {
        videos: groups.flatMap(g => g.videos),
        analyses: groups.flatMap(g => g.analyses),
      };
    },
    retry: false,
  });
  const edit = async (id: number) => {
    setBusyId(id);
    try {
      const full = await api<Player>(`/players/${id}`);
      setEditing(full);
      setEditor(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذر فتح الملف");
    } finally {
      setBusyId(null);
    }
  };
  useEffect(() => {
    const id = Number(new URLSearchParams(window.location.search).get("edit"));
    if (id && players.some(p => p.id === id)) {
      void edit(id);
      window.history.replaceState(null, "", "/academies");
    }
  }, [playersQuery.data]);
  if (!isAcademy) {
    const academy = session?.memberships.find(m => m.type === "academy");
    return (
      <>
        <PageHeading
          title="واجهة الأكاديميات"
          subtitle="إدارة اللاعبين وتحليل أدائهم ومتابعة تطورهم"
          icon={GraduationCap}
        />
        <EmptyState
          title="هذه الواجهة خاصة بعضوية الأكاديمية"
          description="تستخدم الآن عضوية نادي. بدّل إلى أكاديمية تملك عضوية فعلية فيها لإدارة لاعبيها."
          action={
            academy ? (
              <button
                className="btn btn-primary"
                onClick={() => setOrgId(academy.organizationId)}
              >
                الانتقال إلى {academy.name}
              </button>
            ) : (
              <Link href="/settings" className="btn btn-primary">
                إنشاء أكاديمية خاصة بك
              </Link>
            )
          }
        />
      </>
    );
  }
  if (playersQuery.isLoading) return <Loading />;
  if (playersQuery.error)
    return (
      <ErrorState error={playersQuery.error} retry={playersQuery.refetch} />
    );
  const filtered = players.filter(
    p =>
      (!search || `${p.name} ${p.position}`.includes(search)) &&
      (!position || p.position === position) &&
      (!age || (p.age > 0 && (age === "u16" ? p.age < 16 : p.age >= 16))) &&
      (!level ||
        (level === "documented"
          ? hasDocumentedOverall(p.evaluation)
          : !hasDocumentedOverall(p.evaluation)))
  );
  const athleteProfiles = players.filter(p => p.age > 0);
  const documentedProfiles = athleteProfiles.filter(player =>
    hasDocumentedOverall(player.evaluation)
  );
  const documentedSessions = athleteProfiles.reduce(
    (sum, player) => sum + (player.evaluation?.sessionsCount ?? 0),
    0
  );
  return (
    <>
      <PageHeading
        title="واجهة الأكاديميات"
        subtitle="إدارة اللاعبين، تحليل أدائهم، ومتابعة تطورهم"
        icon={GraduationCap}
        actions={
          <button
            className="btn btn-primary"
            onClick={() => {
              setEditing(null);
              setEditor(true);
            }}
          >
            <Plus size={17} />
            إضافة لاعب جديد
          </button>
        }
      />
      <div className="stats-grid">
        <div className="stat-card">
          <span className="stat-icon">
            <Users size={25} />
          </span>
          <div>
            <small>عدد اللاعبين</small>
            <strong>{athleteProfiles.length}</strong>
            <em>ملفات لاعبين · عينات الفيديو منفصلة</em>
          </div>
        </div>
        <div className="stat-card">
          <span className="stat-icon">
            <VideoIcon size={23} />
          </span>
          <div>
            <small>عدد الفيديوهات</small>
            <strong>
              {media.isLoading || media.error
                ? "—"
                : (media.data?.videos.length ?? 0)}
            </strong>
            <em>مقطع خاص محفوظ</em>
          </div>
        </div>
        <div className="stat-card">
          <span className="stat-icon">
            <FileChartColumn size={25} />
          </span>
          <div>
            <small>التحليلات المسجلة</small>
            <strong>
              {media.isLoading || media.error
                ? "—"
                : (media.data?.analyses.length ?? 0)}
            </strong>
            <em>سجلات تحليل متاحة</em>
          </div>
        </div>
        <div className="stat-card">
          <span className="stat-icon">
            <TrendingUp size={26} />
          </span>
          <div>
            <small>الجلسات الموثقة</small>
            <strong style={{ color: "#0d8a5b" }}>{documentedSessions}</strong>
            <em>جلسات تحفظ قياسات وتقييمًا منفصلًا عن قيم الملف القديمة</em>
          </div>
        </div>
      </div>
      <Panel>
        <Tabs
          items={[
            { id: "all", label: "جميع اللاعبين" },
            { id: "age", label: "حسب الفئة العمرية" },
            { id: "level", label: "حسب المستوى" },
            { id: "skill", label: "حسب المهارة والمركز" },
          ]}
          value={tab}
          onChange={id => {
            setTab(id);
            if (id === "age") setAge("u16");
            else setAge("");
            if (id === "level") setLevel("high");
            else setLevel("");
          }}
        />
        <div className="filters">
          <div className="search-field">
            <Search size={15} />
            <input
              aria-label="البحث عن لاعب"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="البحث عن لاعب…"
            />
          </div>
          <select
            aria-label="المركز"
            value={position}
            onChange={e => setPosition(e.target.value)}
          >
            <option value="">جميع المراكز</option>
            {POSITIONS.map(p => (
              <option key={p}>{p}</option>
            ))}
          </select>
          <select
            aria-label="حالة التقييم"
            value={level}
            onChange={e => setLevel(e.target.value)}
          >
            <option value="">كل حالات التقييم</option>
            <option value="documented">تقييم عام موثق</option>
            <option value="unassessed">لم يُقيّم</option>
          </select>
          <select
            aria-label="الفئة العمرية"
            value={age}
            onChange={e => setAge(e.target.value)}
          >
            <option value="">جميع الفئات العمرية</option>
            <option value="u16">أقل من 16 سنة</option>
            <option value="over16">16 سنة فأكثر</option>
          </select>
          <button
            className="btn btn-outline"
            onClick={() => setMoreFilters(v => !v)}
          >
            <Filter size={15} />
            {moreFilters ? "إغلاق الفلاتر" : "المزيد من الفلاتر"}
          </button>
        </div>
        {moreFilters && (
          <div className="notice-box">
            <Filter size={17} />
            <span>نتائج مطابقة: {filtered.length} لاعب</span>
            <button
              className="btn btn-sm btn-ghost"
              onClick={() => {
                setSearch("");
                setAge("");
                setPosition("");
                setLevel("");
                setTab("all");
              }}
            >
              إعادة ضبط جميع الفلاتر
            </button>
          </div>
        )}
        {filtered.length ? (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>اللاعب</th>
                  <th>العمر</th>
                  <th>المركز</th>
                  <th>التقييم العام</th>
                  <th>الجلسات الموثقة</th>
                  <th>آخر تحليل</th>
                  <th>الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(p => (
                  <tr key={p.id}>
                    <td>
                      <Link href={`/players/${p.id}`} className="player-cell">
                        <Avatar player={p} />
                        <span>
                          <strong>{p.name}</strong>
                          <small>{p.academyName}</small>
                        </span>
                      </Link>
                    </td>
                    <td>
                      {p.isDemo && p.age === 0 ? "غير منسوب" : `${p.age} سنة`}
                    </td>
                    <td>{p.position}</td>
                    <td>
                      <span className="score-tag">
                        {hasDocumentedOverall(p.evaluation)
                          ? `${p.evaluation?.overall.score?.toLocaleString("ar")} — ${p.evaluation?.overall.method}`
                          : "لم يُقيّم"}
                      </span>
                    </td>
                    <td>{p.evaluation?.sessionsCount ?? 0}</td>
                    <td className="muted" dir="ltr">
                      {p.lastAnalysis?.slice(0, 10) || "—"}
                    </td>
                    <td>
                      <div className="row-actions">
                        <Link
                          href={`/players/${p.id}`}
                          className="btn btn-outline btn-sm"
                        >
                          عرض الملف
                        </Link>
                        <button
                          className="icon-btn"
                          style={{ width: 29, height: 29 }}
                          aria-label={`تعديل ${p.name}`}
                          onClick={() => void edit(p.id)}
                          disabled={
                            busyId !== null || Boolean(p.isDemo && p.age === 0)
                          }
                          title={
                            p.isDemo && p.age === 0
                              ? "ملف عينة فيديو مرخّص؛ لا توجد بيانات هوية رياضية منسوبة لتعديلها."
                              : undefined
                          }
                        >
                          {busyId === p.id ? (
                            <Loader2 size={13} className="spin" />
                          ) : (
                            <Pencil size={13} />
                          )}
                        </button>
                        <button
                          className="icon-btn"
                          style={{ width: 29, height: 29 }}
                          aria-label={`رفع فيديو ${p.name}`}
                          onClick={() => setUploadPlayer(p.id)}
                        >
                          <Upload size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title={
              players.length
                ? "لا توجد نتائج مطابقة"
                : "أضف أول لاعب إلى أكاديميتك"
            }
            description={
              players.length
                ? "جرّب تغيير البحث أو الفلاتر."
                : "أنشئ ملفًا افتراضيًا، ثم أضف فيديوهات وقياسات تجريبية."
            }
          />
        )}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginTop: 15,
            alignItems: "center",
          }}
        >
          <small className="muted" style={{ fontSize: 10 }}>
            عرض {filtered.length} من {players.length} لاعب
          </small>
          {isDemo ? (
            <DemoBadge compact />
          ) : (
            <span className="badge">بيانات المؤسسة المصرح بها</span>
          )}
        </div>
      </Panel>
      <div className="academy-bottom">
        <Panel title="تطور مستوى الأداء العام" icon={ChartNoAxesCombined}>
          <EmptyState
            title="لا يوجد اتجاه موثق معروض"
            description="يعرض التطور فقط عند مقارنة جلستين متوافقتين في القياس والوحدة والمهارة والقدم وظروف الاختبار."
          />
        </Panel>
        <Panel title="تغطية التقييم الموثق" icon={TrendingUp}>
          <div className="small-kpi">
            <strong style={{ fontSize: 28, color: "#0d8a5b" }}>
              {documentedProfiles.length} / {athleteProfiles.length}
            </strong>
            <p className="helper">
              ملفات تحوي درجة عامة مع طريقة حساب موثقة. لا يحسب هذا القسم
              متوسطًا أو يعامل غير المقاس كصفر.
            </p>
            {isDemo ? <DemoBadge compact /> : null}
          </div>
        </Panel>
        <Panel
          title="أحدث الفيديوهات"
          icon={VideoIcon}
          actions={
            players[0] && (
              <TextLink href={`/players/${players[0].id}`}>
                عرض المكتبة
              </TextLink>
            )
          }
        >
          {media.isLoading ? (
            <Loading />
          ) : media.error ? (
            <ErrorState error={media.error} retry={media.refetch} />
          ) : (
            <VideoLibrary
              videos={(media.data?.videos ?? [])
                .slice()
                .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                .slice(0, 3)}
              onUpload={
                players[0] ? () => setUploadPlayer(players[0].id) : undefined
              }
            />
          )}
        </Panel>
      </div>
      {editor && (
        <PlayerEditor player={editing} onClose={() => setEditor(false)} />
      )}
      {uploadPlayer && (
        <UploadModal
          playerId={uploadPlayer}
          onClose={() => setUploadPlayer(null)}
        />
      )}
    </>
  );
}
