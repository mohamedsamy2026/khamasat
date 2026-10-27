import { useMemo, useState } from "react";
import {
  FilePenLine,
  History,
  LockKeyhole,
  Pencil,
  Save,
  UserRound,
} from "lucide-react";
import type { Note } from "@shared/athlete";
import { api, useApi, useAthlete } from "@/lib/athleteApi";
import { EmptyState, ErrorState, Loading } from "./UI";
import { formatDate } from "./EvaluationSummary";
import "./session-evaluation.css";

function sourceLabel(note: Note) {
  return note.source === "automatic" ? "تحليل آلي" : "مدرب";
}

function NoteCard({
  note,
  canEdit,
  onUpdated,
}: {
  note: Note;
  canEdit: boolean;
  onUpdated: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(note.text);
  const [requiredAction, setRequiredAction] = useState(
    note.requiredAction ?? ""
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    if (!text.trim()) {
      setError("نص الملاحظة مطلوب.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await api<Note>(`/notes/${note.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          text: text.trim(),
          requiredAction: requiredAction.trim(),
        }),
      });
      await onUpdated();
      setEditing(false);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "تعذر حفظ تعديل الملاحظة."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <article className="session-note-item">
      <header>
        <div>
          <span
            className={`note-source ${note.source === "automatic" ? "automatic" : "coach"}`}
          >
            <UserRound aria-hidden="true" size={15} /> {sourceLabel(note)}
          </span>
          <strong>{note.authorName || "غير متوفر من الخادم"}</strong>
        </div>
        <time dateTime={note.createdAt}>{formatDate(note.createdAt)}</time>
      </header>
      <dl className="session-note-context">
        <div>
          <dt>الجلسة</dt>
          <dd>
            {note.analysisId
              ? `تحليل #${note.analysisId}`
              : "ملاحظة عامة للاعب"}
          </dd>
        </div>
        <div>
          <dt>الإجراء المطلوب</dt>
          <dd>{note.requiredAction || "غير محدد"}</dd>
        </div>
        {note.updatedAt ? (
          <div>
            <dt>آخر تعديل</dt>
            <dd>{formatDate(note.updatedAt)}</dd>
          </div>
        ) : null}
      </dl>
      {editing ? (
        <div className="session-note-editor">
          <label>
            <span>نص الملاحظة</span>
            <textarea
              className="field"
              rows={4}
              value={text}
              onChange={event => setText(event.target.value)}
              required
            />
          </label>
          <label>
            <span>الإجراء المطلوب</span>
            <input
              className="field"
              value={requiredAction}
              onChange={event => setRequiredAction(event.target.value)}
            />
          </label>
          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}
          <div className="inline-actions">
            <button
              className="btn btn-primary btn-sm"
              type="button"
              onClick={() => void save()}
              disabled={saving}
            >
              <Save size={15} /> {saving ? "جارٍ الحفظ…" : "حفظ التعديل"}
            </button>
            <button
              className="btn btn-ghost btn-sm"
              type="button"
              onClick={() => {
                setEditing(false);
                setText(note.text);
                setRequiredAction(note.requiredAction ?? "");
              }}
              disabled={saving}
            >
              إلغاء
            </button>
          </div>
        </div>
      ) : (
        <>
          <p className="session-note-text">{note.text}</p>
          {canEdit ? (
            <button
              className="btn btn-ghost btn-sm"
              type="button"
              onClick={() => setEditing(true)}
            >
              <Pencil size={15} /> تعديل المدرب
            </button>
          ) : null}
        </>
      )}
      {note.originalText || note.revisions?.length ? (
        <details className="session-note-history">
          <summary>
            <History aria-hidden="true" size={15} /> الأصل وسجل المراجعات
          </summary>
          {note.originalText ? (
            <p>
              <strong>النص الأصلي:</strong> {note.originalText}
            </p>
          ) : null}
          {note.revisions?.length ? (
            <ol>
              {note.revisions.map((revision, index) => (
                <li key={`${revision.editedAt}-${index}`}>
                  <strong>
                    {revision.authorName || "غير متوفر من الخادم"}
                  </strong>{" "}
                  · {formatDate(revision.editedAt)}
                  <span>{revision.text}</span>
                  <small>
                    الإجراء: {revision.requiredAction || "غير محدد"}
                  </small>
                </li>
              ))}
            </ol>
          ) : null}
        </details>
      ) : null}
    </article>
  );
}

export default function SessionNotes({
  playerId,
  analysisId,
}: {
  playerId: number;
  analysisId?: number;
}) {
  const { organization, invalidate } = useAthlete();
  const isAcademy = organization?.type === "academy";
  const isClub = organization?.type === "club";
  const notesQuery = useApi<Note[]>(
    `/notes?playerId=${playerId}`,
    Boolean(playerId)
  );
  const [text, setText] = useState("");
  const [requiredAction, setRequiredAction] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const notes = useMemo(
    () =>
      (notesQuery.data ?? []).filter(
        note => analysisId === undefined || note.analysisId === analysisId
      ),
    [analysisId, notesQuery.data]
  );

  async function createNote(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!text.trim()) {
      setError("نص الملاحظة مطلوب.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await api<Note>("/notes", {
        method: "POST",
        body: JSON.stringify({
          playerId,
          ...(analysisId ? { analysisId } : { unlinkedGeneral: true }),
          text: text.trim(),
          requiredAction: requiredAction.trim(),
        }),
      });
      setText("");
      setRequiredAction("");
      await invalidate();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر حفظ الملاحظة.");
    } finally {
      setSaving(false);
    }
  }

  if (!organization || notesQuery.isLoading) {
    return (
      <section className="session-evaluation-card">
        <Loading label="جارٍ تحميل الملاحظات المسجلة…" />
      </section>
    );
  }
  if (notesQuery.isError) {
    return (
      <section className="session-evaluation-card">
        <ErrorState
          error={notesQuery.error}
          retry={() => notesQuery.refetch()}
        />
      </section>
    );
  }

  return (
    <section
      className="session-evaluation-card session-notes-card"
      aria-label="الملاحظات المسجلة"
    >
      <header className="session-card-heading">
        <FilePenLine aria-hidden="true" size={21} />
        <div>
          <h2>الملاحظات المسجلة</h2>
          <p>
            {analysisId
              ? `مرتبطة بالجلسة #${analysisId}`
              : "الملاحظات المحفوظة لهذا اللاعب"}
          </p>
        </div>
      </header>
      {isClub && (
        <div className="session-private-notice">
          <LockKeyhole size={19} /> تعرض الملاحظات المشتركة المصرح بها فقط؛
          ملاحظات الأكاديمية الداخلية محجوبة خادميًا.
        </div>
      )}
      {isAcademy ? (
        <form className="session-note-create" onSubmit={createNote}>
          <label>
            <span>ملاحظة المدرب</span>
            <textarea
              className="field"
              rows={3}
              value={text}
              onChange={event => setText(event.target.value)}
              placeholder="اكتب ملاحظة قابلة للمراجعة…"
              required
            />
          </label>
          <label>
            <span>الإجراء المطلوب</span>
            <input
              className="field"
              value={requiredAction}
              onChange={event => setRequiredAction(event.target.value)}
              placeholder="مثال: راجع اللقطة مع اللاعب"
            />
          </label>
          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}
          <button
            className="btn btn-primary btn-sm"
            type="submit"
            disabled={saving}
          >
            <Save size={15} /> {saving ? "جارٍ الحفظ…" : "حفظ الملاحظة"}
          </button>
        </form>
      ) : null}
      {notes.length ? (
        <div className="session-note-list">
          {notes.map(note => (
            <NoteCard
              key={note.id}
              note={note}
              canEdit={
                isAcademy &&
                !(note.source === "automatic" && note.visibility === "shared")
              }
              onUpdated={invalidate}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          title="لا توجد ملاحظات محفوظة"
          description="لا يُنشأ نص تلقائي بديل عند غياب ملاحظة مسجلة."
        />
      )}
    </section>
  );
}
