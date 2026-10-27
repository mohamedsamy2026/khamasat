import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  Activity,
  ClipboardCheck,
  Info,
  Layers,
  Search,
  ShieldQuestion,
  UserRound,
} from "lucide-react";
import type { PlayerCard } from "@shared/athlete";
import {
  DEFAULT_SPORT,
  GYMNASTICS_CATEGORIES,
  gymnasticsCategoryName,
  type GymnasticsCategoryId,
} from "@shared/sports";
import { useApi, useAthlete } from "@/lib/athleteApi";
import {
  Avatar,
  EmptyState,
  ErrorState,
  Loading,
  PageHeading,
  Panel,
} from "@/components/athlete/UI";
import PhysicalAssessments from "@/components/athlete/PhysicalAssessments";
import "@/components/athlete/sport-forms.css";

type ApparatusContext = {
  id: string;
  name: string;
  englishName: string;
  description: string;
  order: number;
  indicators: Array<{ code: string; label: string }>;
};

type GymnasticsContext = {
  playerId: number;
  sport: "gymnastics";
  category: GymnasticsCategoryId;
  categoryName: string;
  apparatusOrder: string[];
  apparatus: ApparatusContext[];
  notes: string[];
};

function GymnastChooser({
  players,
  selectedId,
  onSelect,
}: {
  players: PlayerCard[];
  selectedId?: number;
  onSelect: (id: number) => void;
}) {
  const [search, setSearch] = useState("");
  const filtered = useMemo(() => {
    const phrase = search.trim().toLocaleLowerCase("ar");
    if (!phrase) return players;
    return players.filter(player =>
      [player.name, player.position, player.academyName].some(value =>
        String(value ?? "")
          .toLocaleLowerCase("ar")
          .includes(phrase)
      )
    );
  }, [players, search]);

  return (
    <Panel title="لاعبو الجمباز" icon={UserRound}>
      <label className="field">
        البحث بالاسم أو الفئة أو الأكاديمية
        <input
          type="search"
          value={search}
          onChange={event => setSearch(event.target.value)}
          placeholder="ابحث عن لاعب جمباز…"
        />
      </label>
      <div className="gymnast-choice-list">
        {filtered.map(player => (
          <button
            key={player.id}
            type="button"
            className={`apparatus-card ${
              player.id === selectedId ? "is-selected" : ""
            }`}
            onClick={() => onSelect(player.id)}
            aria-pressed={player.id === selectedId}
          >
            <header>
              <div className="flex items-center gap-2 min-w-0">
                <Avatar player={player} />
                <h3>{player.name}</h3>
              </div>
              <span className="apparatus-order">{player.age || "—"}</span>
            </header>
            <p>
              {player.gymnasticsCategory
                ? gymnasticsCategoryName(player.gymnasticsCategory)
                : "الفئة غير محددة"}
            </p>
            <small>{player.academyName}</small>
          </button>
        ))}
      </div>
      {!filtered.length ? (
        <p className="helper">
          <Search size={16} /> لا يوجد لاعب مطابق. أضف لاعبًا واختر رياضة
          الجمباز من لوحة الأكاديمية.
        </p>
      ) : null}
    </Panel>
  );
}

export default function Gymnastics() {
  const { organization } = useAthlete();
  const [, navigate] = useLocation();
  const playersQuery = useApi<PlayerCard[]>("/players");
  const gymnasts = useMemo(
    () =>
      (playersQuery.data ?? []).filter(player => player.sport === "gymnastics"),
    [playersQuery.data]
  );
  const initialPlayer = useMemo(() => {
    const requested = Number(
      new URLSearchParams(window.location.search).get("player")
    );
    return Number.isSafeInteger(requested) && requested > 0
      ? requested
      : undefined;
  }, []);
  const [playerId, setPlayerId] = useState<number | undefined>(initialPlayer);
  const [apparatusId, setApparatusId] = useState<string | undefined>();

  // Only auto-select a groomed state: an explicitly requested player wins, a
  // single-candidate roster is unambiguous. Otherwise the coach chooses.
  useEffect(() => {
    if (playerId !== undefined) return;
    if (gymnasts.length === 1) setPlayerId(gymnasts[0]!.id);
  }, [gymnasts, playerId]);

  const contextQuery = useApi<GymnasticsContext>(
    `/gymnastics/context?playerId=${playerId ?? 0}`,
    Boolean(playerId)
  );

  useEffect(() => {
    if (!contextQuery.data) return;
    setApparatusId(current =>
      current && contextQuery.data.apparatusOrder.includes(current)
        ? current
        : contextQuery.data.apparatusOrder[0]
    );
  }, [contextQuery.data]);

  const selectedPlayer = gymnasts.find(player => player.id === playerId);
  const selectedApparatus = contextQuery.data?.apparatus.find(
    item => item.id === apparatusId
  );
  const sportEnabled = organization?.sports?.includes("gymnastics") ?? false;
  const canWrite = organization?.type === "academy";

  if (playersQuery.isLoading) return <Loading label="جارٍ تحميل اللاعبين…" />;
  if (playersQuery.isError)
    return (
      <ErrorState
        error={playersQuery.error}
        retry={() => playersQuery.refetch()}
      />
    );

  return (
    <section className="section-stack gymnastics-page">
      <PageHeading
        title="قسم الجمباز"
        subtitle="اختيار الجهاز حسب فئة اللاعب، وتسجيل المؤشرات البدنية الموحّدة لكل جهاز"
        icon={Activity}
      />

      {organization?.type === "club" ? (
        <p className="helper">
          يعرض القسم بيانات اللاعبين الذين اعتمدت الأكاديمية وصول ناديك إليهم.
          إن لم يظهر لاعب فاطلب اعتماد الوصول من صفحة الطلبات أولًا.
        </p>
      ) : null}

      <p className="provisional-notice">
        <ShieldQuestion aria-hidden="true" size={18} />
        <span>
          الأجهزة وترتيبها ووصفها إعدادات رياضية ثابتة، أما المؤشرات البدنية فهي
          مسودة عمل بانتظار مراجعة علمية مستقلة ولا تحمل عتبات أو درجات. لا
          تُستنتج أي درجة من الفيديو في هذا القسم.
        </span>
      </p>

      {!sportEnabled ? (
        <EmptyState
          title="رياضة الجمباز غير مفعّلة لمؤسستك"
          description={
            organization?.role === "owner"
              ? "فعّل رياضة الجمباز من الإعدادات ← الرياضات، ثم أضف لاعبًا واختر فئته."
              : "يستطيع مالك المؤسسة تفعيل رياضة الجمباز من الإعدادات."
          }
          action={
            organization?.role === "owner" ? (
              <Link href="/settings" className="btn btn-primary">
                فتح إعدادات المؤسسة
              </Link>
            ) : undefined
          }
        />
      ) : null}

      {!gymnasts.length ? (
        <EmptyState
          title="لا يوجد لاعب جمباز مسجل"
          description="أضف لاعبًا من لوحة الأكاديمية واختر رياضة الجمباز وفئته (سيدات أو رجال)."
          action={
            canWrite ? (
              <Link href="/academies" className="btn btn-primary">
                إضافة لاعب من لوحة الأكاديمية
              </Link>
            ) : undefined
          }
        />
      ) : (
        <GymnastChooser
          players={gymnasts}
          selectedId={playerId}
          onSelect={id => {
            setPlayerId(id);
            navigate(`/gymnastics?player=${id}`);
          }}
        />
      )}

      {playerId !== undefined ? (
        contextQuery.isLoading ? (
          <Loading label="جارٍ تحميل أجهزة الفئة ومؤشراتها…" />
        ) : contextQuery.isError ? (
          <ErrorState
            error={contextQuery.error}
            retry={() => contextQuery.refetch()}
          />
        ) : contextQuery.data ? (
          <div className="gymnastics-layout">
            <div className="section-stack">
              <Panel
                title={`ترتيب أجهزة ${contextQuery.data.categoryName}`}
                icon={Layers}
                actions={
                  <span className="badge">{selectedPlayer?.name ?? ""}</span>
                }
              >
                <p className="helper">
                  الترتيب أدناه هو ترتيب الدوران المعتمد للفئة. الأجهزة غير
                  التابعة للفئة لا تظهر، ويرفض الخادم أي تقييم على جهاز خارج
                  ترتيب الفئة.
                </p>
                <div className="gymnastics-apparatus-grid">
                  {contextQuery.data.apparatus.map(apparatus => (
                    <button
                      key={apparatus.id}
                      type="button"
                      aria-pressed={apparatus.id === apparatusId}
                      className={`apparatus-card ${
                        apparatus.id === apparatusId ? "is-selected" : ""
                      }`}
                      onClick={() => setApparatusId(apparatus.id)}
                    >
                      <header>
                        <h3>{apparatus.name}</h3>
                        <span className="apparatus-order">
                          {apparatus.order}
                        </span>
                      </header>
                      <p>{apparatus.description}</p>
                      <small dir="ltr">{apparatus.englishName}</small>
                      <small>{apparatus.indicators.length} مؤشرًا متاحًا</small>
                    </button>
                  ))}
                </div>
              </Panel>

              <Panel
                title={
                  selectedApparatus
                    ? `تقييم ${selectedApparatus.name}`
                    : "اختر جهازًا"
                }
                icon={ClipboardCheck}
              >
                {selectedApparatus ? (
                  <PhysicalAssessments
                    playerId={contextQuery.data.playerId}
                    sport="gymnastics"
                    apparatus={selectedApparatus.id}
                    skillOptions={[selectedApparatus.name]}
                  />
                ) : (
                  <p className="helper">
                    اختر أحد أجهزة الفئة أعلاه لعرض مؤشراته المتاحة وتسجيل
                    تقييمه.
                  </p>
                )}
              </Panel>
            </div>

            <div className="section-stack">
              <Panel title="قواعد القسم" icon={Info}>
                <ul className="gymnastics-rules">
                  <li>
                    فئة اللاعب (سيدات/رجال) تحدد أجهزته وترتيب دورانها؛ لا تظهر
                    أجهزة الفئة الأخرى.
                  </li>
                  <li>
                    كل جهاز يعرض المؤشرات البدنية المصرّح بها له فقط من إعدادات
                    رياضة الجمباز.
                  </li>
                  <li>
                    التقييم يُسجل كما يقيسه المدرب، دون تحويل إلى درجة نهائية أو
                    تصنيف قوة/تطوير.
                  </li>
                  <li>
                    الملف الصحي وجهة الاتصال في الطوارئ لا يظهران هنا مطلقًا،
                    ولكل منهما صلاحية منفصلة في ملف اللاعب.
                  </li>
                </ul>
              </Panel>
              <Panel title="الفئات المدعومة" icon={Layers}>
                <dl className="gymnastics-history-item">
                  {GYMNASTICS_CATEGORIES.map(category => (
                    <div key={category.id}>
                      <dt>{category.name}</dt>
                      <dd>{category.apparatusOrder.length} أجهزة</dd>
                    </div>
                  ))}
                </dl>
              </Panel>
              {contextQuery.data.notes.length ? (
                <Panel title="ملاحظات علمية" icon={ShieldQuestion}>
                  {contextQuery.data.notes.map(note => (
                    <p key={note} className="helper">
                      {note}
                    </p>
                  ))}
                </Panel>
              ) : null}
            </div>
          </div>
        ) : null
      ) : gymnasts.length ? (
        <EmptyState
          title="اختر لاعب جمباز"
          description="يعرض القسم أجهزة الفئة وترتيبها ومؤشراتها البدنية بعد اختيار اللاعب."
        />
      ) : null}

      {!sportEnabled && organization?.sports?.length ? (
        <p className="helper">
          الرياضات المفعّلة حاليًا:{" "}
          {organization.sports
            .map(id =>
              id === DEFAULT_SPORT
                ? "كرة القدم"
                : id === "gymnastics"
                  ? "الجمباز"
                  : id
            )
            .join("، ")}
        </p>
      ) : null}
    </section>
  );
}
