import { useMemo, useState, type FormEvent } from "react";
import { useLocation } from "wouter";
import {
  ArrowDownUp,
  Building2,
  Check,
  ChevronDown,
  Filter,
  GitCompareArrows,
  Heart,
  LockKeyhole,
  Plus,
  Search,
  Send,
  SlidersHorizontal,
} from "lucide-react";
import { toast } from "sonner";
import {
  DEMO_LABEL,
  SKILLS,
  type AccessRequest,
  type PlayerCard,
  type Video,
} from "@shared/athlete";
import {
  ALL_GROUPS,
  gymnasticsCategoryName,
  isSportId,
  sportDefinition,
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
  ScoreRing,
  SkillBars,
  StatusBadge,
  VideoLibrary,
} from "@/components/athlete/UI";
import { hasDocumentedOverall } from "@/components/athlete/EvaluationSummary";

type RangeValue = [number, number];
type SortMode = "assessment" | "recent" | "sessions";
type RequestDraft = { player: PlayerCard; message: string };

const MAX_COMPARE = 3;

function ClubRecentVideoPreview({
  playerId,
  authorized,
}: {
  playerId: number;
  authorized: boolean;
}) {
  const videosQuery = useApi<Video[]>(
    `/videos?playerId=${playerId}`,
    authorized
  );
  const latestVideo = useMemo(
    () =>
      (videosQuery.data ?? [])
        .slice()
        .sort(
          (left, right) =>
            Date.parse(right.recordedAt) - Date.parse(left.recordedAt) ||
            Date.parse(right.createdAt) - Date.parse(left.createdAt)
        )[0],
    [videosQuery.data]
  );

  if (
    !authorized ||
    videosQuery.isLoading ||
    videosQuery.isError ||
    !latestVideo
  )
    return null;

  return (
    <div className="section-stack" aria-label="أحدث مقطع أداء مصرح به">
      <p className="muted text-xs">
        أحدث مقطع أداء مصرح به — التشغيل والمعاينة خاصان بهذه الجلسة.
      </p>
      <VideoLibrary
        videos={[latestVideo]}
        playerId={playerId}
        canStartAnalysis={false}
        showFilters={false}
      />
    </div>
  );
}

function latestRequest(requests: AccessRequest[], playerId: number) {
  return requests
    .filter(request => request.playerId === playerId)
    .sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    )[0];
}

function toggleValue(values: Set<string>, value: string) {
  const next = new Set(values);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

function TalentCard({
  player,
  request,
  favorite,
  selected,
  compareLocked,
  isDemoWorkspace,
  onFavorite,
  onCompare,
  onRequest,
  onOpenProfile,
}: {
  player: PlayerCard;
  request: AccessRequest | undefined;
  favorite: boolean;
  selected: boolean;
  compareLocked: boolean;
  isDemoWorkspace: boolean;
  onFavorite: () => void;
  onCompare: () => void;
  onRequest: () => void;
  onOpenProfile: () => void;
}) {
  const testedSkills = player.evaluation?.testedSkills ?? [];
  const profileApproved = request?.status === "approved";
  const demoPlayerAvailable = isDemoWorkspace && player.isDemo === true;
  const profileAvailable = profileApproved || demoPlayerAvailable;
  const isVideoSample = player.isDemo && player.age === 0;

  return (
    <Panel className="section-stack">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Avatar player={player} size="md" />
          <div className="min-w-0">
            <h3 className="font-bold truncate">{player.name}</h3>
            <p className="muted text-sm">
              {isVideoSample
                ? "ملف عرض — البيانات الأساسية غير متوفرة"
                : `${player.age} سنة · ${sportDefinition(player.sport).name} · ${
                    player.sport === "gymnastics" && player.gymnasticsCategory
                      ? gymnasticsCategoryName(player.gymnasticsCategory)
                      : player.position
                  }`}
            </p>
            <p className="muted text-sm truncate">{player.academyName}</p>
          </div>
        </div>
        <button
          className={`icon-btn ${favorite ? "is-active" : ""}`}
          type="button"
          onClick={onFavorite}
          aria-label={
            favorite
              ? `إزالة ${player.name} من المفضلة`
              : `إضافة ${player.name} إلى المفضلة`
          }
          title={favorite ? "إزالة من المفضلة" : "إضافة إلى المفضلة"}
        >
          <Heart size={18} fill={favorite ? "currentColor" : "none"} />
        </button>
      </div>

      <div className="flex items-center justify-between gap-3">
        {hasDocumentedOverall(player.evaluation) ? (
          <div className="section-stack" style={{ gap: 3 }}>
            <strong>
              {player.evaluation?.overall.score?.toLocaleString("ar")}
            </strong>
            <span className="muted text-xs">
              {player.evaluation?.overall.method}
            </span>
          </div>
        ) : (
          <span className="badge">لم يُقيّم</span>
        )}
        <div className="text-end">
          <p className="muted text-xs">
            {isVideoSample
              ? "الفيديو والقياسات فقط"
              : "التقييم العام يتطلب طريقة حساب موثقة"}
          </p>
          <p className="score-tag">
            {player.evaluation?.sessionsCount ?? 0} جلسات موثقة
          </p>
        </div>
      </div>

      {testedSkills.length > 0 ? (
        <p className="muted text-sm">
          المهارات المختبرة: {testedSkills.join("، ")}
        </p>
      ) : (
        <p className="muted text-sm">لم تُختبر مهارة موثقة قابلة للعرض.</p>
      )}

      {profileAvailable ? (
        <ClubRecentVideoPreview
          playerId={player.id}
          authorized={profileAvailable}
        />
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          className={`btn btn-ghost ${selected ? "is-active" : ""}`}
          type="button"
          onClick={onCompare}
          disabled={!selected && compareLocked}
          title={
            compareLocked && !selected
              ? `يمكن مقارنة ${MAX_COMPARE} لاعبين كحد أقصى`
              : undefined
          }
        >
          <GitCompareArrows size={16} />
          {selected ? "ضمن المقارنة" : "إضافة للمقارنة"}
        </button>
        {profileAvailable ? (
          <button
            className="btn btn-primary"
            type="button"
            onClick={onOpenProfile}
          >
            <Check size={16} />
            عرض الملف
          </button>
        ) : request?.status === "pending" ? (
          <span className="badge">
            <StatusBadge status="pending" /> طلبك قيد المراجعة
          </span>
        ) : (
          <button className="btn btn-outline" type="button" onClick={onRequest}>
            <LockKeyhole size={16} />
            طلب الملف كاملًا
          </button>
        )}
      </div>
      {demoPlayerAvailable ? (
        <div className="section-stack">
          <button
            className="btn btn-outline"
            type="button"
            onClick={onRequest}
            disabled={request?.status === "pending" || profileApproved}
            title={
              request?.status === "pending"
                ? "الطلب التجريبي قيد المراجعة؛ فتح الملف الافتراضي متاح دون انتظار."
                : profileApproved
                  ? "صدرت الموافقة على الطلب؛ الملف التجريبي متاح."
                  : "يبقى مسار الطلب للعرض، لكن البيانات الحقيقية لا تُفتح إلا بموافقة الأكاديمية."
            }
          >
            <LockKeyhole size={16} />
            طلب الملف كاملًا
          </button>
          <p className="helper">
            الملف الافتراضي متاح مباشرة للعرض. الموافقة مطلوبة للبيانات
            الحقيقية، والطلب هنا يحافظ على رحلة الوصول.
          </p>
        </div>
      ) : null}
      {request?.status === "rejected" || request?.status === "revoked" ? (
        <p className="muted text-xs">
          يمكنك إرسال طلب جديد وفقًا لسياسة الأكاديمية.
        </p>
      ) : null}
    </Panel>
  );
}

function ClubWorkspacePrompt() {
  const { organization, session, setOrgId, invalidate } = useAthlete();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [region, setRegion] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const clubMemberships = (session?.memberships ?? []).filter(
    membership => membership.type === "club"
  );
  const isDemo = session?.mode === "demo";

  async function createClub(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim() || !region.trim()) {
      setError("أدخل اسم النادي والمنطقة قبل الإنشاء.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await api<unknown>("/organizations", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          type: "club",
          region: region.trim(),
        }),
      });
      await invalidate();
      setOpen(false);
      setName("");
      setRegion("");
      toast.success("تم إنشاء مساحة النادي. ستظهر ضمن عضوياتك بعد التحديث.");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "تعذر إنشاء مساحة النادي."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="section-stack">
      <PageHeading
        title="واجهة الأندية"
        subtitle={`أنت تعمل حاليًا ضمن ${organization?.name ?? "أكاديمية"}. ${isDemo ? "اختر نادي مساحة العرض أدناه؛ لا يلزم تسجيل Manus." : "غيّر إلى عضوية نادٍ حقيقية للوصول إلى البحث."}`}
        icon={Building2}
        actions={<DemoBadge compact />}
      />
      <Panel title="ابحث من مساحة النادي المناسبة" icon={Building2}>
        <div className="section-stack">
          <p className="muted">
            {isDemo
              ? "يمكنك التبديل إلى نادي مساحة العرض المعزولة دون تغيير أي عضوية حقيقية أو الحاجة إلى موافقة لعرض الملفات الافتراضية."
              : "لا يمكن تحويل دور الأكاديمية من هذه الواجهة. استخدم عضوية نادٍ تملكها بالفعل أو أنشئ مساحة نادي جديدة مملوكة لحسابك."}
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
          {isDemo ? (
            <p className="muted text-sm">
              مساحة العرض التجريبي صادرة من الخادم وتحتوي على عضوياتها المحددة؛
              إنشاء مؤسسة جديدة متاح بعد تسجيل الدخول للبيانات الحقيقية.
            </p>
          ) : null}
          <button
            className="btn btn-outline"
            type="button"
            onClick={() => setOpen(true)}
            disabled={isDemo}
            title={
              isDemo ? "إنشاء المؤسسات متاح للحسابات المسجلة فقط." : undefined
            }
          >
            <Plus size={16} />
            إنشاء مساحة نادي
          </button>
        </div>
      </Panel>
      {open ? (
        <Modal title="إنشاء مساحة نادي" onClose={() => setOpen(false)}>
          <form className="section-stack" onSubmit={createClub}>
            <p className="muted text-sm">
              سيُنشأ هذا النادي كمساحة مملوكة لحسابك؛ لا يغير صلاحيات عضوياتك
              الأخرى.
            </p>
            <label>
              <span>اسم النادي</span>
              <input
                className="field"
                value={name}
                onChange={event => setName(event.target.value)}
                required
              />
            </label>
            <label>
              <span>المنطقة</span>
              <input
                className="field"
                value={region}
                onChange={event => setRegion(event.target.value)}
                required
              />
            </label>
            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            <button className="btn btn-primary" type="submit" disabled={saving}>
              {saving ? "جارٍ الإنشاء…" : "إنشاء مساحة النادي"}
            </button>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}

function ClubDiscovery({ favoritesOnly = false }: { favoritesOnly?: boolean }) {
  const { organization, invalidate, session } = useAthlete();
  const [, setLocation] = useLocation();
  const isClub = organization?.type === "club";
  const isDemoSession = session?.mode === "demo";
  const isDemoWorkspace = isDemoSession && organization?.isDemo === true;
  const playersQuery = useApi<PlayerCard[]>("/players", isClub);
  const requestsQuery = useApi<AccessRequest[]>("/requests", isClub);
  const favoritesQuery = useApi<number[]>("/favorites", isClub);

  const [search, setSearch] = useState("");
  const [age, setAge] = useState<RangeValue>([12, 22]);
  const [height, setHeight] = useState<RangeValue>([140, 210]);
  const [weight, setWeight] = useState<RangeValue>([35, 110]);
  const [positions, setPositions] = useState<Set<string>>(new Set());
  const [sportFilter, setSportFilter] = useState<SportId | "">("");
  const [skills, setSkills] = useState<Set<string>>(new Set());
  const [region, setRegion] = useState("");
  const [foot, setFoot] = useState("");
  const [sort, setSort] = useState<SortMode>("assessment");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [requestDraft, setRequestDraft] = useState<RequestDraft | null>(null);
  const [submittingRequest, setSubmittingRequest] = useState(false);
  const [requestError, setRequestError] = useState("");
  const [compareOpen, setCompareOpen] = useState(false);
  const [favoriteBusyId, setFavoriteBusyId] = useState<number | null>(null);

  const players = playersQuery.data ?? [];
  const activeGroups = sportFilter
    ? sportDefinition(sportFilter).groups.map(group => group.id)
    : ALL_GROUPS;
  const activeTerminology = sportFilter
    ? sportDefinition(sportFilter).terminology.positions
    : "المركز أو الفئة";
  const requests = requestsQuery.data ?? [];
  const favoriteIds = useMemo(
    () => new Set(favoritesQuery.data ?? []),
    [favoritesQuery.data]
  );
  const regions = useMemo(
    () =>
      [...new Set(players.map(player => player.region).filter(Boolean))].sort(),
    [players]
  );
  const feet = useMemo(
    () =>
      [...new Set(players.map(player => player.foot).filter(Boolean))].sort(),
    [players]
  );

  const results = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase("ar-SA");
    const filtered = players.filter(player => {
      const matchesSearch =
        !normalizedSearch ||
        [
          player.name,
          player.position,
          player.academyName,
          sportDefinition(player.sport).name,
        ].some(value =>
          value.toLocaleLowerCase("ar-SA").includes(normalizedSearch)
        );
      const referenceOnly = player.isDemo && player.age === 0;
      const matchesAge = referenceOnly
        ? age[0] === 12 && age[1] === 22
        : player.age >= age[0] && player.age <= age[1];
      const matchesHeight = referenceOnly
        ? height[0] === 140 && height[1] === 210
        : player.height >= height[0] && player.height <= height[1];
      const matchesWeight = referenceOnly
        ? weight[0] === 35 && weight[1] === 110
        : player.weight >= weight[0] && player.weight <= weight[1];
      const matchesSport = !sportFilter || player.sport === sportFilter;
      const matchesPosition =
        positions.size === 0 ||
        positions.has(
          player.sport === "gymnastics" && player.gymnasticsCategory
            ? gymnasticsCategoryName(player.gymnasticsCategory)
            : player.position
        );
      const matchesSkills =
        skills.size === 0 ||
        [...skills].every(skill =>
          player.evaluation?.testedSkills.includes(skill)
        );
      const matchesRegion = !region || player.region === region;
      const matchesFoot = !foot || player.foot === foot;
      const matchesFavorite = !favoritesOnly || favoriteIds.has(player.id);
      return (
        matchesSearch &&
        matchesAge &&
        matchesHeight &&
        matchesWeight &&
        matchesSport &&
        matchesPosition &&
        matchesSkills &&
        matchesRegion &&
        matchesFoot &&
        matchesFavorite
      );
    });

    return filtered.sort((left, right) => {
      if (sort === "sessions")
        return (
          (right.evaluation?.sessionsCount ?? 0) -
          (left.evaluation?.sessionsCount ?? 0)
        );
      if (sort === "recent")
        return (
          Date.parse(right.evaluation?.lastEvaluationAt ?? "") -
          Date.parse(left.evaluation?.lastEvaluationAt ?? "")
        );
      return (
        Number(hasDocumentedOverall(right.evaluation)) -
        Number(hasDocumentedOverall(left.evaluation))
      );
    });
  }, [
    age,
    favoriteIds,
    favoritesOnly,
    foot,
    height,
    players,
    positions,
    region,
    search,
    skills,
    sort,
    sportFilter,
    weight,
  ]);

  const comparedPlayers = useMemo(
    () => players.filter(player => selectedIds.includes(player.id)),
    [players, selectedIds]
  );

  function updateRange(
    index: 0 | 1,
    rawValue: string,
    currentRange: RangeValue,
    setter: (range: RangeValue) => void
  ) {
    const value = Number(rawValue);
    setter(
      index === 0
        ? [Math.min(value, currentRange[1]), currentRange[1]]
        : [currentRange[0], Math.max(value, currentRange[0])]
    );
  }

  function toggleCompare(playerId: number) {
    setSelectedIds(current => {
      if (current.includes(playerId))
        return current.filter(id => id !== playerId);
      if (current.length >= MAX_COMPARE) {
        toast.error(`يمكن مقارنة ${MAX_COMPARE} لاعبين كحد أقصى.`);
        return current;
      }
      return [...current, playerId];
    });
  }

  async function toggleFavorite(playerId: number) {
    setFavoriteBusyId(playerId);
    try {
      await api<unknown>(`/favorites/${playerId}`, { method: "POST" });
      await invalidate();
    } catch (cause) {
      toast.error(
        cause instanceof Error ? cause.message : "تعذر تحديث المفضلة."
      );
    } finally {
      setFavoriteBusyId(null);
    }
  }

  async function submitRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!requestDraft || !requestDraft.message.trim()) {
      setRequestError("اكتب رسالة موجزة للأكاديمية قبل الإرسال.");
      return;
    }
    setSubmittingRequest(true);
    setRequestError("");
    try {
      await api<AccessRequest>("/requests", {
        method: "POST",
        body: JSON.stringify({
          playerId: requestDraft.player.id,
          message: requestDraft.message.trim(),
        }),
      });
      await invalidate();
      toast.success("تم إرسال طلب الاطلاع إلى الأكاديمية.");
      setRequestDraft(null);
    } catch (cause) {
      setRequestError(
        cause instanceof Error ? cause.message : "تعذر إرسال الطلب."
      );
    } finally {
      setSubmittingRequest(false);
    }
  }

  if (!isClub) return <ClubWorkspacePrompt />;
  if (
    playersQuery.isLoading ||
    requestsQuery.isLoading ||
    favoritesQuery.isLoading
  )
    return <Loading label="جارٍ تحميل بطاقات المواهب…" />;
  if (playersQuery.error || requestsQuery.error || favoritesQuery.error) {
    const error =
      playersQuery.error ?? requestsQuery.error ?? favoritesQuery.error;
    return (
      <ErrorState
        error={error}
        retry={() => {
          void Promise.all([
            playersQuery.refetch(),
            requestsQuery.refetch(),
            favoritesQuery.refetch(),
          ]);
        }}
      />
    );
  }

  const headingTitle = favoritesOnly ? "المفضلة" : "البحث عن المواهب";
  const headingSubtitle = favoritesOnly
    ? "قائمة اللاعبين التي حفظها ناديك للمتابعة."
    : isDemoSession
      ? "اعرض ملفات اللاعبين الافتراضيين مباشرة أمام اللجنة؛ يبقى طلب الأكاديمية لازمًا للبيانات الحقيقية."
      : "اكتشف بطاقات رياضية محدودة، ثم اطلب الملف الكامل من الأكاديمية المالكة.";

  return (
    <div className="section-stack">
      <PageHeading
        title={headingTitle}
        subtitle={headingSubtitle}
        icon={favoritesOnly ? Heart : Search}
        actions={
          isDemoSession ? (
            <DemoBadge />
          ) : (
            <span className="badge">بطاقات مصرح بها</span>
          )
        }
      />

      <Panel
        title="بحث وتصفية"
        icon={Filter}
        actions={
          <span className="muted text-sm">
            {isDemoSession
              ? "بيانات العرض غير مقيمة؛ القياسات من الفيديو فقط دون معيار أداء مفترض"
              : "بطاقات محدودة وفق صلاحية المؤسسة"}
          </span>
        }
      >
        <div className="section-stack">
          <div className="flex flex-wrap items-end gap-3">
            <label className="search-field flex-1 min-w-[190px]">
              <Search size={18} />
              <input
                value={search}
                onChange={event => setSearch(event.target.value)}
                placeholder="ابحث بالاسم أو المركز أو الأكاديمية"
                aria-label="البحث عن لاعب"
              />
            </label>
            <label className="field min-w-[175px]">
              <span>الرياضة</span>
              <select
                aria-label="اختيار الرياضة"
                value={sportFilter}
                onChange={event => {
                  const next = event.target.value;
                  setSportFilter(isSportId(next) ? next : "");
                  setPositions(new Set());
                  setSkills(new Set());
                  setFoot("");
                }}
              >
                <option value="">جميع الرياضات</option>
                <option value="football">كرة القدم</option>
                <option value="gymnastics">الجمباز</option>
              </select>
            </label>
          </div>
          <div className="filters">
            <label>
              <span>المنطقة</span>
              <select
                className="field"
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
            {sportFilter !== "gymnastics" && <label>
              <span>القدم المفضلة</span>
              <select
                className="field"
                value={foot}
                onChange={event => setFoot(event.target.value)}
              >
                <option value="">كل الخيارات</option>
                {feet.map(item => (
                  <option value={item} key={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>}
            <label>
              <span>الترتيب</span>
              <select
                className="field"
                value={sort}
                onChange={event => setSort(event.target.value as SortMode)}
              >
                <option value="assessment">حالة التقييم الموثق</option>
                <option value="recent">أحدث جلسة مقاسة</option>
                <option value="sessions">عدد الجلسات المقاسة</option>
              </select>
            </label>
          </div>
          <details className="filters">
            <summary>
              <SlidersHorizontal size={16} /> مرشحات متقدمة
            </summary>
            <div className="form-grid">
              <RangeFilter
                label="العمر"
                range={age}
                unit="سنة"
                min={8}
                max={25}
                onChange={(index, value) =>
                  updateRange(index, value, age, setAge)
                }
              />
              <RangeFilter
                label="الطول"
                range={height}
                unit="سم"
                min={120}
                max={220}
                onChange={(index, value) =>
                  updateRange(index, value, height, setHeight)
                }
              />
              <RangeFilter
                label="الوزن"
                range={weight}
                unit="كغ"
                min={25}
                max={130}
                onChange={(index, value) =>
                  updateRange(index, value, weight, setWeight)
                }
              />
            </div>
          </details>
        </div>
      </Panel>

      <div className="grid-2">
        <Panel title={activeTerminology} icon={ChevronDown}>
          <div className="section-stack">
            {activeGroups.map(position => (
              <label className="flex items-center gap-2" key={position}>
                <input
                  type="checkbox"
                  checked={positions.has(position)}
                  onChange={() =>
                    setPositions(current => toggleValue(current, position))
                  }
                />
                <span>{position}</span>
              </label>
            ))}
          </div>
        </Panel>
        {sportFilter !== "gymnastics" && <Panel title="المهارات التي عولجت لها مقاطع" icon={ChevronDown}>
          <div className="section-stack">
            {SKILLS.map(skill => (
              <label className="flex items-center gap-2" key={skill}>
                <input
                  type="checkbox"
                  checked={skills.has(skill)}
                  onChange={() =>
                    setSkills(current => toggleValue(current, skill))
                  }
                />
                <span>{skill}</span>
              </label>
            ))}
          </div>
        </Panel>}
      </div>

      <Panel
        title={`${favoritesOnly ? "المفضلة" : "نتائج البحث"} (${results.length})`}
        icon={ArrowDownUp}
        actions={
          <button
            className="btn btn-outline"
            type="button"
            disabled={comparedPlayers.length < 2}
            onClick={() => setCompareOpen(true)}
          >
            <GitCompareArrows size={16} />
            مقارنة المختارين ({comparedPlayers.length}/{MAX_COMPARE})
          </button>
        }
      >
        {results.length === 0 ? (
          <EmptyState
            title={
              favoritesOnly
                ? "لا توجد عناصر مفضلة مطابقة"
                : "لا توجد نتائج مطابقة"
            }
            description={
              favoritesOnly
                ? "أضف بطاقة موهبة من نتائج البحث لتظهر هنا."
                : "عدّل المرشحات أو جرّب نطاقًا أوسع للبحث."
            }
          />
        ) : (
          <div className="grid-3">
            {results.map(player => {
              const request = latestRequest(requests, player.id);
              return (
                <TalentCard
                  key={player.id}
                  player={player}
                  request={request}
                  favorite={favoriteIds.has(player.id)}
                  selected={selectedIds.includes(player.id)}
                  compareLocked={selectedIds.length >= MAX_COMPARE}
                  isDemoWorkspace={isDemoWorkspace}
                  onFavorite={() => {
                    if (favoriteBusyId !== player.id)
                      void toggleFavorite(player.id);
                  }}
                  onCompare={() => toggleCompare(player.id)}
                  onRequest={() => {
                    setRequestError("");
                    setRequestDraft({ player, message: "" });
                  }}
                  onOpenProfile={() => setLocation(`/players/${player.id}`)}
                />
              );
            })}
          </div>
        )}
      </Panel>

      {requestDraft ? (
        <Modal
          title={`طلب الملف الكامل: ${requestDraft.player.name}`}
          onClose={() => setRequestDraft(null)}
        >
          <form className="section-stack" onSubmit={submitRequest}>
            <p className="muted text-sm">
              {isDemoSession
                ? "يُسجل الطلب في لوحة أكاديمية مساحة العرض. الملف الافتراضي متاح مباشرة دون انتظار؛ أما البيانات الحقيقية فلا تُفتح إلا بعد الموافقة."
                : "ستصل رسالتك إلى الأكاديمية المالكة. لا يصبح الملف الكامل متاحًا إلا بعد الموافقة."}
            </p>
            <label>
              <span>رسالة إلى الأكاديمية</span>
              <textarea
                className="field"
                rows={5}
                value={requestDraft.message}
                onChange={event =>
                  setRequestDraft(current =>
                    current
                      ? { ...current, message: event.target.value }
                      : current
                  )
                }
                placeholder="اذكر سبب الاهتمام الرياضي باللاعب…"
                required
              />
            </label>
            {requestError ? (
              <p className="text-sm text-red-600">{requestError}</p>
            ) : null}
            <button
              className="btn btn-primary"
              type="submit"
              disabled={submittingRequest}
            >
              <Send size={16} />
              {submittingRequest ? "جارٍ الإرسال…" : "إرسال الطلب"}
            </button>
          </form>
        </Modal>
      ) : null}

      {compareOpen ? (
        <Modal
          title="مقارنة اللاعبين المختارين"
          onClose={() => setCompareOpen(false)}
          wide
        >
          <div className="section-stack">
            <p className="muted text-sm">
              تُعرض المقارنة من مؤشرات البطاقات المتاحة لناديك فقط.
            </p>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>المؤشر</th>
                    {comparedPlayers.map(player => (
                      <th key={player.id}>{player.name}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <th>العمر</th>
                    {comparedPlayers.map(player => (
                      <td key={player.id}>
                        {player.age > 0 ? `${player.age} سنة` : "غير متوفر"}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <th>المركز</th>
                    {comparedPlayers.map(player => (
                      <td key={player.id}>{player.position}</td>
                    ))}
                  </tr>
                  <tr>
                    <th>التقييم</th>
                    {comparedPlayers.map(player => (
                      <td key={player.id}>
                        {hasDocumentedOverall(player.evaluation)
                          ? `${player.evaluation?.overall.score} — ${player.evaluation?.overall.method}`
                          : "لم يُقيّم"}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <th>الجلسات المقاسة</th>
                    {comparedPlayers.map(player => (
                      <td key={player.id}>
                        {player.evaluation?.sessionsCount ?? 0}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="grid-3">
              {comparedPlayers.map(player => (
                <Panel key={player.id} title={player.name}>
                  {(player.evaluation?.testedSkills.length ?? 0) > 0 ? (
                    <p>
                      {player.evaluation?.testedSkills.join("، ")} — نتائج فقط
                      دون درجة للمهارة.
                    </p>
                  ) : (
                    <p className="muted">
                      لم يُقيّم. تقارن جلسات اللاعب المتوافقة داخل الملف، لا هذه
                      البطاقات الخام.
                    </p>
                  )}
                </Panel>
              ))}
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

function RangeFilter({
  label,
  range,
  unit,
  min,
  max,
  onChange,
}: {
  label: string;
  range: RangeValue;
  unit?: string;
  min: number;
  max: number;
  onChange: (index: 0 | 1, value: string) => void;
}) {
  return (
    <fieldset>
      <legend>
        {label}: {range[0]}
        {unit ? ` ${unit}` : ""} — {range[1]}
        {unit ? ` ${unit}` : ""}
      </legend>
      <div className="progress">
        <input
          type="range"
          min={min}
          max={max}
          value={range[0]}
          onChange={event => onChange(0, event.target.value)}
          aria-label={`${label} الأدنى`}
        />
        <input
          type="range"
          min={min}
          max={max}
          value={range[1]}
          onChange={event => onChange(1, event.target.value)}
          aria-label={`${label} الأقصى`}
        />
      </div>
    </fieldset>
  );
}

export default function Clubs() {
  return <ClubDiscovery />;
}

export function Favorites() {
  return <ClubDiscovery favoritesOnly />;
}
