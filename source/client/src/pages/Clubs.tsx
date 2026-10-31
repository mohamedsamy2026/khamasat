import { useMemo, useState, type FormEvent } from "react";
import { useLocation } from "wouter";
import {
  ArrowDownUp,
  Building2,
  Check,
  Filter,
  Heart,
  LockKeyhole,
  Plus,
  Search,
  Send,
  Video,
} from "lucide-react";
import { toast } from "sonner";
import type { AccessRequest, PlayerCard } from "@shared/athlete";
import type { DemoDisplay } from "@shared/demo-display";
import {
  apparatusForCategory,
  apparatusName,
  gymnasticsCategoryName,
  type GymnasticsCategoryId,
  type SportId,
} from "@shared/sports";
import { api, useApi, useAthlete } from "@/lib/athleteApi";
import {
  Avatar,
  EmptyState,
  ErrorState,
  Loading,
  Modal,
  PageHeading,
  Panel,
  StatusBadge,
} from "@/components/athlete/UI";
import { SkillVideo } from "@/components/athlete/SkillCards";
import "./directory.css";

type DirectoryPlayerCard = PlayerCard & {
  demoDisplay?: DemoDisplay;
};
type RequestDraft = { player: DirectoryPlayerCard; message: string };
type AgeFilter = "" | "under16" | "16plus";
type SortOption = "score_desc" | "score_asc" | "name";

const DEFAULT_GYMNASTICS_CATEGORY: GymnasticsCategoryId = "womens_artistic";

function latestRequest(requests: AccessRequest[], playerId: number) {
  return requests
    .filter(request => request.playerId === playerId)
    .sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    )[0];
}

function gymnasticsShortLabel(category: GymnasticsCategoryId | "") {
  if (category === "womens_artistic") return "WAG";
  if (category === "mens_artistic") return "MAG";
  return "فئة غير محددة";
}

function primaryApparatusLabel(player: DirectoryPlayerCard) {
  if (!player.primaryApparatus) return "الجهاز غير محدد";
  return apparatusName(player.primaryApparatus);
}

function playerSportSummary(player: DirectoryPlayerCard) {
  if (player.sport === "football") return player.position || "المركز غير مسجل";
  if (!player.gymnasticsCategory) return "فئة الجمباز غير مسجلة";
  return `${gymnasticsShortLabel(player.gymnasticsCategory)} · ${primaryApparatusLabel(player)}`;
}

function playerMatchesFacet(
  player: DirectoryPlayerCard,
  sport: SportId,
  category: GymnasticsCategoryId,
  apparatus: string
) {
  if (sport === "football") return !apparatus || player.position === apparatus;
  if (player.gymnasticsCategory !== category) return false;
  // Membership in an apparatus is an athlete fact, not a category fact. Never
  // infer it from the other apparatus available to WAG or MAG.
  return !apparatus || player.primaryApparatus === apparatus;
}

function scoreForDirectory(player: DirectoryPlayerCard): number | null {
  const demoScore = player.demoDisplay?.overall10;
  if (typeof demoScore === "number" && Number.isFinite(demoScore))
    return demoScore;

  const coachMean = player.coachAssessment?.overall;
  if (typeof coachMean === "number" && Number.isFinite(coachMean)) {
    // Coach assessments are persisted on a 0–100 scale; the directory reads
    // their saved mean only and expresses it on the requested /10 scale.
    return coachMean / 10;
  }
  return null;
}

function scoreText(score: number) {
  return score.toLocaleString("ar", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

function TalentListRow({
  player,
  request,
  favorite,
  favoriteBusy,
  onFavorite,
  onRequest,
  onOpenProfile,
}: {
  player: DirectoryPlayerCard;
  request: AccessRequest | undefined;
  favorite: boolean;
  favoriteBusy: boolean;
  onFavorite: () => void;
  onRequest: () => void;
  onOpenProfile: () => void;
}) {
  const isDemo = Boolean(player.isDemo && player.demoDisplay);
  const profileApproved = request?.status === "approved";
  const score = scoreForDirectory(player);
  const topSkills = (player.demoDisplay?.skills ?? [])
    .filter(
      skill => typeof skill.score === "number" && Number.isFinite(skill.score)
    )
    .slice()
    .sort((left, right) => (right.score ?? -1) - (left.score ?? -1))
    .slice(0, 3);
  const featuredSkill = topSkills.find(skill => skill.video);

  return (
    <article
      className="directory-talent-row"
      data-player-id={player.id}
      aria-label={`بطاقة ${player.name}`}
    >
      <div className="directory-row-identity" data-label="اللاعب">
        <Avatar player={player} size="md" />
        <div className="directory-row-name">
          <strong>{player.name}</strong>
          <span>{player.academyName}</span>
          {player.sport === "gymnastics" ? (
            <small>
              {player.gymnasticsCategory
                ? `${gymnasticsShortLabel(player.gymnasticsCategory)} · ${gymnasticsCategoryName(player.gymnasticsCategory)}`
                : "فئة الجمباز غير مسجلة"}
            </small>
          ) : null}
        </div>
        <button
          className={`icon-btn directory-favorite ${favorite ? "is-active" : ""}`}
          type="button"
          onClick={onFavorite}
          disabled={favoriteBusy}
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

      <dl className="directory-row-facts" data-label="البيانات الرياضية">
        <div>
          <dt>العمر</dt>
          <dd>{player.age > 0 ? `${player.age} سنة` : "غير متاح"}</dd>
        </div>
        <div>
          <dt>المنطقة</dt>
          <dd>{player.region || "غير متاحة"}</dd>
        </div>
        <div>
          <dt>{player.sport === "football" ? "المركز" : "الفئة · الجهاز"}</dt>
          <dd>{playerSportSummary(player)}</dd>
        </div>
      </dl>

      <div className="directory-row-score" data-label="التقييم">
        {score !== null ? (
          <>
            <strong>{scoreText(score)} / 10</strong>
            <span>
              {isDemo
                ? player.demoDisplay?.level || "مستوى تجريبي محفوظ"
                : `متوسط تقييم المدرب · ${player.coachAssessment?.assessedSkills ?? 0} مهارات`}
            </span>
          </>
        ) : (
          <>
            <strong>غير مقيم</strong>
            <span>لا يوجد متوسط تقييم مدرب محفوظ</span>
          </>
        )}
      </div>

      <div className="directory-row-skills" data-label="أفضل 3 مهارات">
        {isDemo && topSkills.length ? (
          topSkills.map(skill => {
            const percentage = Math.max(0, Math.min(100, skill.score ?? 0));
            return (
              <div
                className="directory-skill-bar"
                key={`${skill.name}-${skill.englishName}`}
              >
                <div>
                  <span>{skill.name}</span>
                  <b>{Math.round(percentage).toLocaleString("ar")}٪</b>
                </div>
                <progress
                  value={percentage}
                  max={100}
                  aria-label={`${skill.name} ${Math.round(percentage)}٪`}
                />
              </div>
            );
          })
        ) : (
          <span className="directory-unassessed">
            لا توجد مهارات تجريبية مقيمة
          </span>
        )}
      </div>

      <div className="directory-row-video" data-label="فيديو الأداء">
        {isDemo && featuredSkill?.video ? (
          <SkillVideo
            video={featuredSkill.video}
            playerId={player.id}
            compact
          />
        ) : (
          <span className="directory-no-video">
            <Video size={16} /> لا يوجد فيديو مهارة مصرح للعرض
          </span>
        )}
      </div>

      <div className="directory-row-actions" data-label="الإجراءات">
        {isDemo ? (
          <button
            className="btn btn-primary btn-sm"
            type="button"
            onClick={onOpenProfile}
          >
            {player.sport === "gymnastics" && player.gymnasticsCategory
              ? `عرض ملف ${gymnasticsShortLabel(player.gymnasticsCategory)} التجريبي`
              : "عرض الملف التجريبي"}
          </button>
        ) : profileApproved ? (
          <button
            className="btn btn-primary btn-sm"
            type="button"
            onClick={onOpenProfile}
          >
            <Check size={16} /> عرض الملف الكامل
          </button>
        ) : null}

        {profileApproved ? (
          <span className="directory-request-state is-approved">
            <StatusBadge status="approved" /> وصول كامل مصرح
          </span>
        ) : request?.status === "pending" ? (
          <span className="directory-request-state">
            <StatusBadge status="pending" /> طلبك قيد المراجعة
          </span>
        ) : (
          <button
            className="btn btn-outline btn-sm"
            type="button"
            onClick={onRequest}
          >
            <LockKeyhole size={15} />
            {request?.status === "rejected" || request?.status === "revoked"
              ? "إعادة طلب الملف الكامل"
              : "طلب الملف الكامل"}
          </button>
        )}

        {request?.status === "rejected" || request?.status === "revoked" ? (
          <p className="directory-request-note">
            {request.status === "rejected"
              ? "تم رفض الطلب السابق؛ يمكنك إعادة الإرسال برسالة أوضح."
              : "ألغيت صلاحية الوصول؛ يلزم طلب جديد قبل فتح الملف الكامل."}
          </p>
        ) : null}
      </div>
    </article>
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
        subtitle={`تعمل حاليًا ضمن ${organization?.name ?? "مساحة أخرى"}. اختر عضوية نادٍ فعلية للبحث في ملفات المواهب.`}
        icon={Building2}
      />
      <Panel title="اختر ناديك أولًا" icon={Building2}>
        <div className="section-stack">
          <p className="muted">
            لا يمنح اختيار الواجهة أي صلاحية إضافية؛ تظهر هنا عضويات النادي التي
            يتحقق منها الخادم لحسابك فقط.
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
                  الدخول إلى {membership.name}
                </button>
              ))}
            </div>
          ) : null}
          <button
            className="btn btn-outline"
            type="button"
            onClick={() => setOpen(true)}
            disabled={session?.mode === "demo"}
            title={
              session?.mode === "demo"
                ? "إنشاء المؤسسات متاح للحسابات المسجلة فقط."
                : undefined
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
              سيُنشأ النادي ضمن حسابك. تبقى صلاحيات الوصول إلى ملفات اللاعبين
              خاضعة لموافقة الأكاديمية المالكة.
            </p>
            <label className="field">
              <span>اسم النادي</span>
              <input
                value={name}
                onChange={event => setName(event.target.value)}
                required
              />
            </label>
            <label className="field">
              <span>المنطقة</span>
              <input
                value={region}
                onChange={event => setRegion(event.target.value)}
                required
              />
            </label>
            {error ? <p className="form-error">{error}</p> : null}
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
  const { organization, invalidate } = useAthlete();
  const [, setLocation] = useLocation();
  const isClub = organization?.type === "club";
  const playersQuery = useApi<DirectoryPlayerCard[]>("/players", isClub);
  const requestsQuery = useApi<AccessRequest[]>("/requests", isClub);
  const favoritesQuery = useApi<number[]>("/favorites", isClub);

  const [search, setSearch] = useState("");
  const [sport, setSport] = useState<SportId>("football");
  const [gymnasticsCategory, setGymnasticsCategory] =
    useState<GymnasticsCategoryId>(DEFAULT_GYMNASTICS_CATEGORY);
  const [age, setAge] = useState<AgeFilter>("");
  const [region, setRegion] = useState("");
  const [facet, setFacet] = useState("");
  const [level, setLevel] = useState("");
  const [sort, setSort] = useState<SortOption>("score_desc");
  const [requestDraft, setRequestDraft] = useState<RequestDraft | null>(null);
  const [submittingRequest, setSubmittingRequest] = useState(false);
  const [requestError, setRequestError] = useState("");
  const [favoriteBusyId, setFavoriteBusyId] = useState<number | null>(null);

  const players = playersQuery.data ?? [];
  const requests = requestsQuery.data ?? [];
  const favoriteIds = useMemo(
    () => new Set(favoritesQuery.data ?? []),
    [favoritesQuery.data]
  );
  const sportPlayers = useMemo(
    () =>
      players.filter(
        player =>
          player.sport === sport &&
          (sport !== "gymnastics" ||
            player.gymnasticsCategory === gymnasticsCategory)
      ),
    [gymnasticsCategory, players, sport]
  );
  const regions = useMemo(
    () =>
      [
        ...new Set(sportPlayers.map(player => player.region).filter(Boolean)),
      ].sort(),
    [sportPlayers]
  );
  const levelOptions = useMemo(
    () =>
      [
        ...new Set(
          sportPlayers.flatMap(player =>
            player.demoDisplay?.level ? [player.demoDisplay.level] : []
          )
        ),
      ].sort(),
    [sportPlayers]
  );
  const facetOptions = useMemo(
    () =>
      sport === "football"
        ? [
            ...new Set(
              sportPlayers.map(player => player.position).filter(Boolean)
            ),
          ].sort()
        : apparatusForCategory(gymnasticsCategory).map(apparatus => ({
            id: apparatus.id,
            label: apparatus.name,
          })),
    [gymnasticsCategory, sport, sportPlayers]
  );

  const results = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase("ar-SA");
    const filtered = sportPlayers.filter(player => {
      const matchesSearch =
        !normalizedSearch ||
        [
          player.name,
          player.position,
          player.academyName,
          player.region,
          playerSportSummary(player),
          player.gymnasticsCategory
            ? gymnasticsShortLabel(player.gymnasticsCategory)
            : "",
        ].some(value =>
          value.toLocaleLowerCase("ar-SA").includes(normalizedSearch)
        );
      const matchesAge =
        !age ||
        (age === "under16"
          ? player.age > 0 && player.age < 16
          : player.age >= 16);
      const matchesRegion = !region || player.region === region;
      const matchesFacet = playerMatchesFacet(
        player,
        sport,
        gymnasticsCategory,
        facet
      );
      const matchesLevel = !level || player.demoDisplay?.level === level;
      return (
        matchesSearch &&
        matchesAge &&
        matchesRegion &&
        matchesFacet &&
        matchesLevel &&
        (!favoritesOnly || favoriteIds.has(player.id))
      );
    });

    return filtered.slice().sort((left, right) => {
      if (sort === "name") return left.name.localeCompare(right.name, "ar");
      const leftScore = scoreForDirectory(left);
      const rightScore = scoreForDirectory(right);
      if (leftScore === null && rightScore === null)
        return left.name.localeCompare(right.name, "ar");
      if (leftScore === null) return 1;
      if (rightScore === null) return -1;
      const difference =
        sort === "score_asc" ? leftScore - rightScore : rightScore - leftScore;
      return difference || left.name.localeCompare(right.name, "ar");
    });
  }, [
    age,
    facet,
    favoriteIds,
    favoritesOnly,
    gymnasticsCategory,
    level,
    region,
    search,
    sort,
    sport,
    sportPlayers,
  ]);

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
      toast.success("تم إرسال طلب الملف إلى الأكاديمية.");
      setRequestDraft(null);
    } catch (cause) {
      setRequestError(
        cause instanceof Error ? cause.message : "تعذر إرسال الطلب."
      );
    } finally {
      setSubmittingRequest(false);
    }
  }

  function selectSport(next: SportId) {
    setSport(next);
    setGymnasticsCategory(DEFAULT_GYMNASTICS_CATEGORY);
    setFacet("");
    setRegion("");
    setLevel("");
  }

  function selectGymnasticsCategory(next: GymnasticsCategoryId) {
    setGymnasticsCategory(next);
    setFacet("");
    setRegion("");
    setLevel("");
  }

  function resetFilters() {
    setSearch("");
    setAge("");
    setRegion("");
    setFacet("");
    setLevel("");
    setSort("score_desc");
  }

  if (!isClub) return <ClubWorkspacePrompt />;
  if (
    playersQuery.isLoading ||
    requestsQuery.isLoading ||
    favoritesQuery.isLoading
  )
    return <Loading label="جارٍ تحميل قائمة المواهب…" />;
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

  const isGymnastics = sport === "gymnastics";
  return (
    <div className="section-stack directory-page">
      <PageHeading
        title={favoritesOnly ? "المفضلة" : "اكتشاف المواهب"}
        subtitle={
          favoritesOnly
            ? "المواهب التي حفظها ناديك، مع بقاء تفاصيل الملفات خاضعة للصلاحية الفعلية."
            : "قائمة مواهب مختصرة؛ لا يفتح الملف الكامل للسجلات الحقيقية إلا بموافقة الأكاديمية."
        }
        icon={favoritesOnly ? Heart : Search}
        actions={<span className="badge">قائمة مواهب مصرح بها</span>}
      />

      <Panel title="ابحث عن لاعب" icon={Filter}>
        <div className="directory-toolbar">
          <label className="search-field directory-search">
            <Search size={18} />
            <input
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="ابحث بالاسم أو الأكاديمية أو المركز"
              aria-label="البحث عن لاعب"
            />
          </label>
          <div
            className="directory-sport-filter"
            role="group"
            aria-label="تصفية الرياضة"
          >
            <button
              className={sport === "football" ? "is-active" : ""}
              type="button"
              onClick={() => selectSport("football")}
            >
              كرة القدم
            </button>
            <span aria-hidden="true">|</span>
            <button
              className={sport === "gymnastics" ? "is-active" : ""}
              type="button"
              onClick={() => selectSport("gymnastics")}
            >
              الجمباز
            </button>
          </div>
          {isGymnastics ? (
            <label className="directory-filter-field">
              <span>الفئة الرياضية</span>
              <select
                aria-label="الفئة الرياضية"
                value={gymnasticsCategory}
                onChange={event =>
                  selectGymnasticsCategory(
                    event.target.value as GymnasticsCategoryId
                  )
                }
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
              onChange={event => setAge(event.target.value as AgeFilter)}
            >
              <option value="">كل الأعمار</option>
              <option value="under16">أقل من 16 سنة</option>
              <option value="16plus">16 سنة فأكثر</option>
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
            <span>{isGymnastics ? "الجهاز" : "المركز"}</span>
            <select
              aria-label={isGymnastics ? "الجهاز" : "المركز"}
              value={facet}
              onChange={event => setFacet(event.target.value)}
            >
              <option value="">
                {isGymnastics ? "كل الأجهزة" : "كل المراكز"}
              </option>
              {isGymnastics
                ? (facetOptions as Array<{ id: string; label: string }>).map(
                    option => (
                      <option value={option.id} key={option.id}>
                        {option.label}
                      </option>
                    )
                  )
                : (facetOptions as string[]).map(option => (
                    <option value={option} key={option}>
                      {option}
                    </option>
                  ))}
            </select>
          </label>
          <label className="directory-filter-field">
            <span>المستوى</span>
            <select
              aria-label="المستوى"
              value={level}
              onChange={event => setLevel(event.target.value)}
            >
              <option value="">كل المستويات</option>
              {levelOptions.map(item => (
                <option value={item} key={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label className="directory-filter-field">
            <span>ترتيب النتائج</span>
            <select
              aria-label="ترتيب النتائج"
              value={sort}
              onChange={event => setSort(event.target.value as SortOption)}
            >
              <option value="score_desc">الأعلى تقييمًا</option>
              <option value="score_asc">الأقل تقييمًا</option>
              <option value="name">الاسم</option>
            </select>
          </label>
          <button
            className="btn btn-ghost directory-reset"
            type="button"
            onClick={resetFilters}
          >
            إعادة الضبط
          </button>
        </div>
      </Panel>

      <Panel
        title={`${favoritesOnly ? "المفضلة" : "النتائج"} (${results.length})`}
        icon={ArrowDownUp}
        actions={
          <span className="muted text-sm">
            {isGymnastics
              ? `${gymnasticsShortLabel(gymnasticsCategory)} · أجهزة أساسية`
              : "بطاقات كرة القدم"}
          </span>
        }
      >
        {results.length === 0 ? (
          <EmptyState
            title={
              favoritesOnly
                ? "لا توجد عناصر مفضلة مطابقة"
                : "لا توجد مواهب مطابقة"
            }
            description={
              favoritesOnly
                ? "احفظ موهبة لتظهر هنا، أو وسّع التصفية."
                : "جرّب تغيير العمر أو المنطقة أو المركز / الجهاز."
            }
          />
        ) : (
          <div className="directory-talent-list">
            <div className="directory-list-header" aria-hidden="true">
              <span>اللاعب</span>
              <span>البيانات الرياضية</span>
              <span>التقييم</span>
              <span>أفضل 3 مهارات</span>
              <span>فيديو الأداء</span>
              <span>الإجراءات</span>
            </div>
            {results.map(player => {
              const request = latestRequest(requests, player.id);
              return (
                <TalentListRow
                  key={player.id}
                  player={player}
                  request={request}
                  favorite={favoriteIds.has(player.id)}
                  favoriteBusy={favoriteBusyId === player.id}
                  onFavorite={() => {
                    if (favoriteBusyId !== player.id)
                      void toggleFavorite(player.id);
                  }}
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
          title={`طلب الملف كاملًا: ${requestDraft.player.name}`}
          onClose={() => setRequestDraft(null)}
        >
          <form className="section-stack" onSubmit={submitRequest}>
            <p className="muted text-sm">
              سيصل طلبك إلى الأكاديمية المالكة. لا يصبح الملف الكامل للسجل
              الحقيقي متاحًا إلا عندما توافق الأكاديمية عليه.
            </p>
            <label className="field">
              <span>رسالة إلى الأكاديمية</span>
              <textarea
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
            {requestError ? <p className="form-error">{requestError}</p> : null}
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
    </div>
  );
}

export default function Clubs() {
  return <ClubDiscovery />;
}

export function Favorites() {
  return <ClubDiscovery favoritesOnly />;
}
