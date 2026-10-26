/**
 * Create/edit task form (DESIGN.md §6 TaskForm): the payload is validated with
 * the SAME zod schema as the server; server 400s map onto the same fields.
 * In edit mode every field is optional (patch semantics) via taskUpdateSchema.
 */
import { useEffect, useState, type FormEvent } from 'react';
import {
  LIMITS,
  TASK_PRIORITIES,
  TASK_STATUSES,
  TASK_TYPES,
  taskCreateSchema,
  taskUpdateSchema,
  type Task,
  type TaskCreateInput,
  type TaskPriority,
  type TaskStatus,
  type TaskType,
} from '@stms/shared';
import { ApiError } from '../api/client';
import { fromInputValue, toInputValue } from '../utils/time';
import { FormAlert, TextArea, TextInput } from './FormControls';
import { Modal } from './Modal';

export interface TaskFormValues {
  title: string;
  description: string;
  subject: string;
  type: TaskType;
  priority: TaskPriority;
  status: TaskStatus;
  /** datetime-local input value (browser wall clock); '' = unscheduled. */
  due: string;
}

function valuesFor(task: Task | null): TaskFormValues {
  return {
    title: task?.title ?? '',
    description: task?.description ?? '',
    subject: task?.subject ?? '',
    type: task?.type ?? 'assignment',
    priority: task?.priority ?? 'medium',
    status: task?.status ?? 'pending',
    due: toInputValue(task?.dueAt ?? null),
  };
}

export function buildTaskPayload(values: TaskFormValues, forEdit: boolean) {
  const payload: Record<string, unknown> = {};
  if (!forEdit || values.title !== undefined) payload.title = values.title.trim();
  if (!forEdit || values.description !== undefined) payload.description = values.description;
  payload.subject = values.subject.trim();
  payload.type = values.type;
  payload.priority = values.priority;
  payload.status = values.status;
  payload.dueAt = fromInputValue(values.due);
  return payload;
}

export function TaskForm({
  open,
  task,
  subjectOptions,
  onClose,
  onSubmit,
}: {
  open: boolean;
  task: Task | null; // null = create mode
  subjectOptions: string[];
  onClose: () => void;
  onSubmit: (payload: TaskCreateInput) => Promise<void>;
}) {
  const [values, setValues] = useState<TaskFormValues>(() => valuesFor(task));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setValues(valuesFor(task));
      setErrors({});
      setFormError(null);
    }
  }, [open, task]);

  const set =
    <K extends keyof TaskFormValues>(key: K) =>
    (v: TaskFormValues[K]) => {
      setValues((prev) => ({ ...prev, [key]: v }));
      setErrors((prev) => {
        if (!(key in prev)) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      });
    };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const payload = buildTaskPayload(values, task !== null);
    const schema = task ? taskUpdateSchema : taskCreateSchema;
    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      const mapped: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path.join('.') || '_';
        mapped[key] ??= issue.message;
      }
      setErrors(mapped);
      return;
    }
    setSaving(true);
    try {
      await onSubmit(parsed.data as TaskCreateInput);
      onClose();
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 400 && err.details) {
          const mapped: Record<string, string> = {};
          for (const d of err.details) mapped[d.field] = d.message;
          setErrors(mapped);
        } else {
          setFormError(err.message);
        }
      } else {
        setFormError('Something went wrong. Please try again.');
      }
    } finally {
      setSaving(false);
    }
  };

  const typeLabels: Record<TaskType, string> = {
    assignment: 'Assignment',
    project: 'Project',
    exam: 'Exam',
    study: 'Study',
    other: 'Other',
  };

  return (
    <Modal
      open={open}
      onClose={saving ? () => undefined : onClose}
      title={task ? 'Edit task' : 'New task'}
      variant="sheet"
    >
      <form onSubmit={submit} noValidate className="task-form">
        <h2>{task ? 'Edit task' : 'New task'}</h2>
        {formError && <FormAlert message={formError} />}

        <TextInput
          id="task-title"
          label="Title"
          required
          maxLength={LIMITS.title}
          value={values.title}
          onChange={set('title')}
          error={errors.title}
          autoFocus
        />
        <TextInput
          id="task-subject"
          label="Subject"
          required
          maxLength={LIMITS.subject}
          list="task-subjects"
          value={values.subject}
          onChange={set('subject')}
          error={errors.subject}
          hint="Start typing — your past subjects are suggested."
        />
        <datalist id="task-subjects">
          {subjectOptions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>

        <fieldset className="seg-group" disabled={saving}>
          <legend>Type</legend>
          <div className="seg-row">
            {TASK_TYPES.map((t) => (
              <label key={t} className={`seg ${values.type === t ? 'seg-active' : ''}`}>
                <input
                  type="radio"
                  name="task-type"
                  value={t}
                  checked={values.type === t}
                  onChange={() => set('type')(t)}
                />
                {typeLabels[t]}
              </label>
            ))}
          </div>
          <p className="field-error" role={errors.type ? 'alert' : undefined}>
            {errors.type ?? ''}
          </p>
        </fieldset>

        <fieldset className="seg-group" disabled={saving}>
          <legend>Priority</legend>
          <div className="prio-row">
            {TASK_PRIORITIES.map((p) => (
              <label
                key={p}
                className={`badge badge-${p} prio-prio prio-active-${values.priority === p}`}
              >
                <input
                  type="radio"
                  name="task-priority"
                  value={p}
                  checked={values.priority === p}
                  onChange={() => set('priority')(p)}
                  className="prio-input"
                  aria-label={`${p} priority`}
                />
                {p === 'high' ? 'High' : p === 'low' ? 'Low' : 'Medium'}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="field">
          <label className="field-label" htmlFor="task-status">
            Status
          </label>
          <select
            id="task-status"
            className="input"
            value={values.status}
            onChange={(e) => set('status')(e.target.value as TaskStatus)}
          >
            {TASK_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s === 'in_progress' ? 'In progress' : s === 'pending' ? 'Pending' : 'Completed'}
              </option>
            ))}
          </select>
          {errors.status ? (
            <p className="field-error" role="alert">
              {errors.status}
            </p>
          ) : null}
        </div>

        <TextInput
          id="task-due"
          label="Due date & time"
          type="datetime-local"
          value={values.due}
          onChange={set('due')}
          error={errors.dueAt}
          hint="Leave empty for unscheduled tasks."
        />

        <TextArea
          id="task-description"
          label="Notes"
          placeholder="Links, requirements, pages to read…"
          maxLength={LIMITS.description}
          value={values.description}
          onChange={set('description')}
          error={errors.description}
        />

        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving…' : task ? 'Save changes' : 'Create task'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
