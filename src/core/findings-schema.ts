// SPEC.md §12 / contracts/findings-schema.json. Code decides PASS/BLOCK,
// never the model (Constitution Principle V) — this schema has no
// `verdict` field, and `additionalProperties: false` means a model that
// tries to smuggle one in fails validation outright rather than being
// silently accepted.

export type Severity = "critical" | "high" | "medium" | "low" | "note";

export const SEVERITY_RANK: Record<Severity, number> = {
  critical: 5,
  high: 4,
  medium: 3,
  low: 2,
  note: 1,
};

export interface Finding {
  severity: Severity;
  file: string;
  line: number | null;
  message: string;
}

export interface FindingsOutput {
  summary: string;
  findings: Finding[];
}

export const FINDINGS_JSON_SCHEMA = {
  $schema: "http://json-schema.org/draft-07/schema#",
  type: "object",
  additionalProperties: false,
  required: ["summary", "findings"],
  properties: {
    summary: { type: "string" },
    findings: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["severity", "file", "line", "message"],
        properties: {
          severity: { type: "string", enum: ["critical", "high", "medium", "low", "note"] },
          file: { type: "string" },
          line: { type: ["integer", "null"], minimum: 1 },
          message: { type: "string", minLength: 1 },
        },
      },
    },
  },
} as const;

export class InvalidFindingsError extends Error {
  constructor(cause: string) {
    super(`Model output failed findings schema validation: ${cause}`);
    this.name = "InvalidFindingsError";
  }
}

const VALID_SEVERITIES = new Set<string>(Object.keys(SEVERITY_RANK));

/**
 * Parses and validates model output against the findings schema.
 * Strips an optional markdown code fence first. Any `verdict` key present
 * is ignored, never read (FR-013) — validation rejects it as an unknown
 * property instead, which surfaces as an invalid-JSON infra failure.
 */
export function parseFindings(rawModelOutput: string): FindingsOutput {
  const unfenced = rawModelOutput
    .trim()
    .replace(/^```(?:json)?\n?/, "")
    .replace(/\n?```$/, "");

  let parsed: unknown;
  try {
    parsed = JSON.parse(unfenced);
  } catch (err) {
    throw new InvalidFindingsError(`not valid JSON: ${(err as Error).message}`);
  }

  if (typeof parsed !== "object" || parsed === null) {
    throw new InvalidFindingsError("root is not an object");
  }
  const obj = parsed as Record<string, unknown>;

  const allowedKeys = new Set(["summary", "findings"]);
  for (const key of Object.keys(obj)) {
    if (!allowedKeys.has(key)) {
      throw new InvalidFindingsError(`unexpected property "${key}"`);
    }
  }

  if (typeof obj.summary !== "string") {
    throw new InvalidFindingsError('"summary" must be a string');
  }
  if (!Array.isArray(obj.findings)) {
    throw new InvalidFindingsError('"findings" must be an array');
  }

  const findings: Finding[] = obj.findings.map((raw, i) => {
    if (typeof raw !== "object" || raw === null) {
      throw new InvalidFindingsError(`findings[${i}] is not an object`);
    }
    const f = raw as Record<string, unknown>;
    const findingKeys = new Set(["severity", "file", "line", "message"]);
    for (const key of Object.keys(f)) {
      if (!findingKeys.has(key)) {
        throw new InvalidFindingsError(`findings[${i}] has unexpected property "${key}"`);
      }
    }
    if (typeof f.severity !== "string" || !VALID_SEVERITIES.has(f.severity)) {
      throw new InvalidFindingsError(`findings[${i}].severity is invalid`);
    }
    if (typeof f.file !== "string") {
      throw new InvalidFindingsError(`findings[${i}].file must be a string`);
    }
    if (f.line !== null && (typeof f.line !== "number" || f.line < 1 || !Number.isInteger(f.line))) {
      throw new InvalidFindingsError(`findings[${i}].line must be an integer >= 1 or null`);
    }
    if (typeof f.message !== "string" || f.message.length === 0) {
      throw new InvalidFindingsError(`findings[${i}].message must be a non-empty string`);
    }
    return {
      severity: f.severity as Severity,
      file: f.file,
      line: f.line as number | null,
      message: f.message,
    };
  });

  return { summary: obj.summary, findings };
}
