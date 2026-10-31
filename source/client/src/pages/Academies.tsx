import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  ChartNoAxesCombined,
  CheckCircle2,
  FileChartColumn,
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
  Video,
} from "@shared/athlete";
import { PLAYER_LIMITS } from "@shared/athlete";
import { calendarToday, formatAcademyTenure } from "@shared/academy-tenure";
import {
  DEFAULT_SPORT,
  GYMNASTICS_CATEGORIES,
  apparatusForCategory,
  gymnasticsCategoryName,
  isGymnasticsCategoryId,
  isSportId,
  sportDefinition,
  type GymnasticsCategoryId,
  type SportId,
} from "@shared/sports";
import { api, useApi, useAthlete } from "@/lib/athleteApi";
import {
  Avatar,
  DemoBadge,
  EmptyState,
  ErrorState,
  Loading,
  Modal,
  PageHeading,
  Panel,
  Tabs,
  TextLink,
  UploadModal,
  VideoLibrary,
} from "@/components/athlete/UI";
import { hasDocumentedOverall } from "@/components/athlete/EvaluationSummary";
import "./directory.css";

/** Sports the organization actually operates; football is the safe default. */
function configuredSports(sports: readonly string[] | undefined): SportId[] {
  const list = (sports ?? []).filter(isSportId);
  return list.length ? list : [DEFAULT_SPORT];
}

function playerMatchesDirectoryFacet(
  player: PlayerCard,
  sport: SportId,
  gymnasticsCategory: GymnasticsCategoryId,
  facet: string
) {
  if (sport === "football") return !facet || player.position === facet;
  if (player.gymnasticsCategory !== gymnasticsCategory) return false;
  return !facet || player.primaryApparatus === facet;
}

function gymnasticsCategoryCode(category: GymnasticsCategoryId | "") {
  if (category === "womens_artistic") return "WAG";
  if (category === "mens_artistic") return "MAG";
  return "فئة غير محددة";
}

function gymnasticsDirectoryLabel(player: PlayerCard) {
  if (player.sport !== "gymnastics") return player.position;
  const category = gymnasticsCategoryCode(player.gymnasticsCategory);
  const apparatus =
    player.primaryApparatus && player.gymnasticsCategory
      ? (apparatusForCategory(player.gymnasticsCategory).find(
          item => item.id === player.primaryApparatus
        )?.name ?? player.primaryApparatus)
      : "الجهاز غير محدد";
  return `${category} · ${apparatus}`;
}

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
          sport: player.sport,
          gymnasticsCategory: player.gymnasticsCategory,
          primaryApparatus:
            player.sport === "gymnastics"
              ? (player.primaryApparatus ?? "")
              : "",
          position: player.position,
          foot:
            player.foot === "أيمن"
              ? "اليمنى"
              : player.foot === "أيسر"
                ? "اليسرى"
                : player.foot,
          height: player.height,
          weight: player.weight,
          birthDate: player.birthDate.slice(0, 10),
          academyJoinDate: player.academyJoinDate ?? "",
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
          // Defaults to the organization's first configured sport; the server
          // rejects any sport the organization does not operate.
          sport: organization?.sports?.[0] ?? DEFAULT_SPORT,
          gymnasticsCategory:
            (organization?.sports?.[0] ?? DEFAULT_SPORT) === "gymnastics"
              ? "womens_artistic"
              : "",
          primaryApparatus: "",
          position:
            (organization?.sports?.[0] ?? DEFAULT_SPORT) === "gymnastics"
              ? gymnasticsCategoryName("womens_artistic")
              : "",
          foot:
            (organization?.sports?.[0] ?? DEFAULT_SPORT) === "gymnastics"
              ? "لا ينطبق"
              : "",
          height: 0,
          weight: 0,
          birthDate: "",
          academyJoinDate: "",
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
  const availableSports = configuredSports(organization?.sports);
  const definition = sportDefinition(form.sport);
  const today = calendarToday();
  const academyTenure = formatAcademyTenure(form.academyJoinDate, today);
  const apparatusOptions =
    form.sport === "gymnastics" &&
    isGymnasticsCategoryId(form.gymnasticsCategory)
      ? apparatusForCategory(form.gymnasticsCategory)
      : [];
  // A sport switch invalidates sport-specific vocabulary; never carry a
  // football position into gymnastics (the server re-validates this too).
  const changeSport = (next: SportId) => {
    const groups = sportDefinition(next).groups;
    setForm(prev => ({
      ...prev,
      sport: next,
      gymnasticsCategory:
        next === "gymnastics"
          ? isGymnasticsCategoryId(prev.gymnasticsCategory)
            ? prev.gymnasticsCategory
            : "womens_artistic"
          : "",
      primaryApparatus: "",
      // Gymnastics stores the category name as the athlete's group, so the
      // position must follow the category selection.
      position:
        next === "gymnastics"
          ? gymnasticsCategoryName(
              isGymnasticsCategoryId(prev.gymnasticsCategory)
                ? prev.gymnasticsCategory
                : "womens_artistic"
            )
          : (groups[0]?.name ?? ""),
      // The column is required; a gymnast has no preferred kicking foot.
      foot: next === "football" ? prev.foot : "لا ينطبق",
    }));
  };
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
              الرياضة
              <select
                required
                value={form.sport}
                onChange={e => {
                  const next = e.target.value;
                  if (isSportId(next)) changeSport(next);
                }}
              >
                {availableSports.map(id => (
                  <option key={id} value={id}>
                    {sportDefinition(id).name}
                  </option>
                ))}
              </select>
              <small className="muted">
                لا تظهر إلا الرياضات المفعّلة لمؤسستك. لا يمكن تغيير الرياضة بعد
                وجود تحليلات أو تقييمات بدنية للاعب.
              </small>
            </label>
            {form.sport === "gymnastics" ? (
              <label className="field">
                فئة الجمباز
                <select
                  required
                  value={form.gymnasticsCategory}
                  onChange={e => {
                    const next = e.target.value;
                    if (!isGymnasticsCategoryId(next)) return;
                    setForm(prev => ({
                      ...prev,
                      gymnasticsCategory: next as GymnasticsCategoryId,
                      position: gymnasticsCategoryName(next),
                      primaryApparatus: apparatusForCategory(next).some(
                        apparatus => apparatus.id === prev.primaryApparatus
                      )
                        ? prev.primaryApparatus
                        : "",
                    }));
                  }}
                >
                  {GYMNASTICS_CATEGORIES.map(category => (
                    <option key={category.id} value={category.id}>
                      {gymnasticsCategoryCode(category.id)} · {category.name}
                    </option>
                  ))}
                </select>
                <small className="muted">
                  تحدد الفئة أجهزة اللاعب وترتيبها في قسم الجمباز.
                </small>
              </label>
            ) : null}
            {form.sport === "gymnastics" ? (
              <label className="field">
                الجهاز الأساسي
                <select
                  value={form.primaryApparatus ?? ""}
                  onChange={e => change("primaryApparatus", e.target.value)}
                >
                  <option value="">الجهاز غير محدد</option>
                  {apparatusOptions.map(apparatus => (
                    <option key={apparatus.id} value={apparatus.id}>
                      {apparatus.name}
                    </option>
                  ))}
                </select>
                <small className="muted">
                  لا تظهر إلا أجهزة الفئة المختارة. يظل اللاعب بلا جهاز أساسي إن
                  لم يُحدَّد اختيار.
                </small>
              </label>
            ) : null}
            <label className="field">
              {definition.terminology.group}
              <select
                required
                value={form.position}
                onChange={e => change("position", e.target.value)}
              >
                <option value="">اختر {definition.terminology.group}</option>
                {definition.groups.map(group => (
                  <option key={group.id} value={group.name}>
                    {group.name}
                  </option>
                ))}
              </select>
            </label>
            {form.sport === "football" ? (
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
            ) : null}
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
              تاريخ الانضمام للأكاديمية
              <input
                type="date"
                aria-label="تاريخ الانضمام للأكاديمية"
                required
                value={form.academyJoinDate ?? ""}
                min={form.birthDate || undefined}
                max={today}
                onChange={e => change("academyJoinDate", e.target.value)}
              />
              <small className="muted">
                {academyTenure} · مدة تقويمية وليست عدد أيام الحضور.
              </small>
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
  const [sportFilter, setSportFilter] = useState<SportId>("football");
  const [gymnasticsCategory, setGymnasticsCategory] =
    useState<GymnasticsCategoryId>("womens_artistic");
  const [facet, setFacet] = useState("");
  const [age, setAge] = useState("");
  const [region, setRegion] = useState("");
  const [editor, setEditor] = useState(false);
  const [editing, setEditing] = useState<Player | null>(null);
  const [uploadPlayer, setUploadPlayer] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const regions = useMemo(
    () =>
      [
        ...new Set(
          players
            .filter(
              player =>
                player.sport === sportFilter &&
                (sportFilter !== "gymnastics" ||
                  player.gymnasticsCategory === gymnasticsCategory)
            )
            .map(player => player.region)
            .filter(Boolean)
        ),
      ].sort(),
    [gymnasticsCategory, players, sportFilter]
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
  const facetOptions =
    sportFilter === "football"
      ? sportDefinition("football").groups.map(group => ({
          id: group.name,
          label: group.name,
        }))
      : apparatusForCategory(gymnasticsCategory).map(apparatus => ({
          id: apparatus.id,
          label: apparatus.name,
        }));
  const normalizedSearch = search.trim().toLocaleLowerCase("ar-SA");
  const filtered = players.filter(player => {
    const searchValues = [
      player.name,
      player.position,
      player.academyName,
      player.region,
      player.gymnasticsCategory
        ? gymnasticsCategoryName(player.gymnasticsCategory)
        : "",
      player.primaryApparatus && player.gymnasticsCategory
        ? (apparatusForCategory(player.gymnasticsCategory).find(
            apparatus => apparatus.id === player.primaryApparatus
          )?.name ?? player.primaryApparatus)
        : "",
    ];
    const matchesSearch =
      !normalizedSearch ||
      searchValues.some(value =>
        value.toLocaleLowerCase("ar-SA").includes(normalizedSearch)
      );
    const matchesAge =
      !age ||
      (age === "u16" ? player.age > 0 && player.age < 16 : player.age >= 16);
    return (
      matchesSearch &&
      player.sport === sportFilter &&
      matchesAge &&
      (!region || player.region === region) &&
      playerMatchesDirectoryFacet(
        player,
        sportFilter,
        gymnasticsCategory,
        facet
      )
    );
  });
  const documentedProfiles = players.filter(player =>
    hasDocumentedOverall(player.evaluation)
  );
  const documentedSessions = players.reduce(
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
            <strong>{players.length}</strong>
            <em>كل صف ظاهر في قائمة اللاعبين محسوب هنا</em>
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
      <Panel title="دليل اللاعبين" icon={Search}>
        <div className="directory-toolbar">
          <label className="search-field directory-search">
            <Search size={16} />
            <input
              aria-label="البحث عن لاعب"
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="البحث بالاسم أو المنطقة أو المركز"
            />
          </label>
          <div
            className="directory-sport-filter"
            role="group"
            aria-label="تصفية الرياضة"
          >
            <button
              className={sportFilter === "football" ? "is-active" : ""}
              type="button"
              onClick={() => {
                setSportFilter("football");
                setGymnasticsCategory("womens_artistic");
                setFacet("");
                setRegion("");
              }}
            >
              كرة القدم
            </button>
            <span aria-hidden="true">|</span>
            <button
              className={sportFilter === "gymnastics" ? "is-active" : ""}
              type="button"
              onClick={() => {
                setSportFilter("gymnastics");
                setGymnasticsCategory("womens_artistic");
                setFacet("");
                setRegion("");
              }}
            >
              الجمباز
            </button>
          </div>
          {sportFilter === "gymnastics" ? (
            <label className="directory-filter-field">
              <span>الفئة الرياضية</span>
              <select
                aria-label="الفئة الرياضية"
                value={gymnasticsCategory}
                onChange={event => {
                  setGymnasticsCategory(
                    event.target.value as GymnasticsCategoryId
                  );
                  setFacet("");
                  setRegion("");
                }}
              >
                <option value="womens_artistic">WAG · سيدات</option>
                <option value="mens_artistic">MAG · رجال</option>
              </select>
            </label>
          ) : null}
          <label className="directory-filter-field">
            <span>العمر</span>
            <select
              aria-label="العمر"
              value={age}
              onChange={event => setAge(event.target.value)}
            >
              <option value="">كل الأعمار</option>
              <option value="u16">أقل من 16 سنة</option>
              <option value="over16">16 سنة فأكثر</option>
            </select>
          </label>
          <label className="directory-filter-field">
            <span>المنطقة</span>
            <select
              aria-label="المنطقة"
              value={region}
              onChange={event => setRegion(event.target.value)}
            >
              <option value="">كل المناطق</option>
              {regions.map(item => (
                <option value={item} key={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label className="directory-filter-field">
            <span>{sportFilter === "football" ? "المركز" : "الجهاز"}</span>
            <select
              aria-label={sportFilter === "football" ? "المركز" : "الجهاز"}
              value={facet}
              onChange={event => setFacet(event.target.value)}
            >
              <option value="">
                {sportFilter === "football" ? "كل المراكز" : "كل الأجهزة"}
              </option>
              {facetOptions.map(option => (
                <option value={option.id} key={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <button
            className="btn btn-ghost directory-reset"
            type="button"
            onClick={() => {
              setSearch("");
              setAge("");
              setRegion("");
              setFacet("");
              setGymnasticsCategory("womens_artistic");
            }}
          >
            إعادة الضبط
          </button>
        </div>
        {filtered.length ? (
          <div className="table-wrap">
            <table className="data-table directory-player-table">
              <thead>
                <tr>
                  <th>اللاعب</th>
                  <th>العمر</th>
                  <th>
                    {sportFilter === "football" ? "المركز" : "الفئة · الجهاز"}
                  </th>
                  <th>المنطقة</th>
                  <th>التقييم المسجل</th>
                  <th>الجلسات الموثقة</th>
                  <th>آخر تحليل</th>
                  <th>الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(p => (
                  <tr key={p.id} data-player-id={p.id}>
                    <td data-label="اللاعب">
                      <Link href={`/players/${p.id}`} className="player-cell">
                        <Avatar player={p} />
                        <span>
                          <strong>{p.name}</strong>
                          <small>
                            {p.sport === "gymnastics"
                              ? `${p.academyName} · ${gymnasticsCategoryCode(p.gymnasticsCategory)}`
                              : p.academyName}
                          </small>
                        </span>
                      </Link>
                    </td>
                    <td data-label="العمر">
                      {p.age > 0 ? `${p.age} سنة` : "غير متاح"}
                    </td>
                    <td
                      data-label={
                        sportFilter === "football" ? "المركز" : "الفئة · الجهاز"
                      }
                    >
                      {gymnasticsDirectoryLabel(p)}
                    </td>
                    <td data-label="المنطقة">{p.region || "—"}</td>
                    <td data-label="التقييم المسجل">
                      <span className="score-tag">
                        {p.coachAssessment?.overall != null
                          ? `${p.coachAssessment.overall.toLocaleString("ar")} / 100 — تقييم مدرب`
                          : hasDocumentedOverall(p.evaluation)
                            ? `${p.evaluation?.overall.score?.toLocaleString("ar")} — ${p.evaluation?.overall.method}`
                            : "لم تُقيّم بعد"}
                      </span>
                    </td>
                    <td data-label="الجلسات الموثقة">
                      {p.evaluation?.sessionsCount ?? 0}
                    </td>
                    <td className="muted" dir="ltr" data-label="آخر تحليل">
                      {p.lastAnalysis?.slice(0, 10) || "—"}
                    </td>
                    <td data-label="الإجراءات">
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
                : "أنشئ ملف اللاعب الأول ثم أضف الفيديوهات والقياسات المسجلة."
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
              {documentedProfiles.length} / {players.length}
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
