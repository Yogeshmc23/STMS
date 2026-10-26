/**
 * Minimal form-state helper sharing the zod schemas with the server
 * (AGENTS.md §3): client-side pre-checks use the SAME schemas; server 400
 * details map onto the same field names.
 */
import { useCallback, useState } from 'react';
import type { z, ZodTypeAny } from 'zod';
import type { FieldDetail } from '@stms/shared';

export interface ZodForm<S extends ZodTypeAny> {
  values: z.input<S>;
  errors: Record<string, string>;
  setField: (name: string, value: unknown) => void;
  /** Runs schema validation; returns parsed data or null (and sets errors). */
  validate: () => z.output<S> | null;
  /** Maps server VALIDATION_ERROR details onto fields. */
  applyApiDetails: (details: FieldDetail[] | undefined) => void;
  reset: (values?: z.input<S>) => void;
}

export function useZodForm<S extends ZodTypeAny>(schema: S, initial: z.input<S>): ZodForm<S> {
  const [values, setValues] = useState<z.input<S>>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const setField = useCallback((name: string, value: unknown) => {
    setValues((v) => ({ ...(v as Record<string, unknown>), [name]: value }) as z.input<S>);
    setErrors((e) => {
      if (!(name in e)) return e;
      const next = { ...e };
      delete next[name];
      return next;
    });
  }, []);

  const validate = useCallback((): z.output<S> | null => {
    const parsed = schema.safeParse(values);
    if (!parsed.success) {
      const mapped: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path.join('.') || '_';
        mapped[key] ??= issue.message;
      }
      setErrors(mapped);
      return null;
    }
    setErrors({});
    return parsed.data;
  }, [schema, values]);

  const applyApiDetails = useCallback((details: FieldDetail[] | undefined) => {
    if (!details || details.length === 0) return false;
    const mapped: Record<string, string> = {};
    for (const d of details) mapped[d.field] = d.message;
    setErrors(mapped);
    return true;
  }, []);

  const reset = useCallback(
    (next?: z.input<S>) => {
      setValues(next ?? initial);
      setErrors({});
    },
    [initial],
  );

  return { values, errors, setField, validate, applyApiDetails, reset };
}
