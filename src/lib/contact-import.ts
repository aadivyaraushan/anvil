export type ImportedContactDraft = {
  first_name: string;
  last_name: string;
  email: string;
  title: string;
  company: string;
  linkedin_url: string;
  company_website: string;
  industry: string;
  location: string;
};

const FIELD_ALIASES = {
  first_name: [
    "first_name",
    "first name",
    "firstname",
    "given_name",
    "given name",
  ],
  last_name: ["last_name", "last name", "lastname", "surname", "family_name"],
  full_name: ["name", "full_name", "full name"],
  email: ["email", "email_address", "email address", "work_email"],
  title: ["title", "headline", "job_title", "job title", "position", "role"],
  company: [
    "company",
    "company_name",
    "company name",
    "organization",
    "employer",
    "current_company",
  ],
  linkedin_url: [
    "linkedin",
    "linkedin_url",
    "linkedin url",
    "linkedin_profile",
    "linkedin profile",
    "profile_url",
    "profile url",
  ],
  company_website: [
    "company_website",
    "company website",
    "website",
    "site",
    "domain",
    "company_domain",
  ],
  industry: ["industry", "sector", "vertical"],
  location: ["location", "city", "region", "state", "country"],
  bio: ["bio", "summary", "about", "description"],
} satisfies Record<string, string[]>;

function normalizeKey(value: string): string {
  return value.trim().toLowerCase().replace(/[_-]+/g, " ");
}

function cleanString(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  return "";
}

function splitName(name: string): { first: string; last: string } {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: "", last: "" };
  if (parts.length === 1) return { first: parts[0], last: "" };
  return {
    first: parts.slice(0, -1).join(" "),
    last: parts.at(-1) ?? "",
  };
}

function csvRows(content: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < content.length; i += 1) {
    const char = content[i];
    const next = content[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(cell.trim());
      cell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(cell.trim());
      cell = "";
      if (row.some((item) => item.length > 0)) rows.push(row);
      row = [];
      continue;
    }

    cell += char;
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell.trim());
    if (row.some((item) => item.length > 0)) rows.push(row);
  }

  return rows;
}

function extractArrayCandidate(parsed: unknown): unknown[] {
  if (Array.isArray(parsed)) return parsed;
  if (!parsed || typeof parsed !== "object") return [];

  const record = parsed as Record<string, unknown>;
  const arrayKey = ["profiles", "contacts", "items", "data", "rows"].find(
    (key) => Array.isArray(record[key])
  );

  return arrayKey ? (record[arrayKey] as unknown[]) : [];
}

function getValue(
  record: Record<string, unknown>,
  keys: string[],
): string {
  const normalizedEntries = Object.entries(record).map(([key, value]) => [
    normalizeKey(key),
    value,
  ]) as Array<[string, unknown]>;

  for (const alias of keys) {
    const normalizedAlias = normalizeKey(alias);
    const match = normalizedEntries.find(([key]) => key === normalizedAlias);
    if (match) {
      const value = cleanString(match[1]);
      if (value) return value;
    }
  }

  return "";
}

function buildLocation(record: Record<string, unknown>): string {
  const direct = getValue(record, FIELD_ALIASES.location);
  if (direct) return direct;

  const city = getValue(record, ["city"]);
  const region = getValue(record, ["state", "region"]);
  const country = getValue(record, ["country"]);

  return [city, region, country].filter(Boolean).join(", ");
}

function normalizeRecord(
  record: Record<string, unknown>,
): ImportedContactDraft | null {
  const fullName = getValue(record, FIELD_ALIASES.full_name);
  const explicitFirst = getValue(record, FIELD_ALIASES.first_name);
  const explicitLast = getValue(record, FIELD_ALIASES.last_name);
  const parsedName = splitName(fullName);

  const firstName = explicitFirst || parsedName.first;
  const lastName = explicitLast || parsedName.last;
  const email = getValue(record, FIELD_ALIASES.email);
  const title = getValue(record, FIELD_ALIASES.title);
  const company = getValue(record, FIELD_ALIASES.company);
  const linkedinUrl = getValue(record, FIELD_ALIASES.linkedin_url);
  const companyWebsite = getValue(record, FIELD_ALIASES.company_website);
  const industry = getValue(record, FIELD_ALIASES.industry);
  const location = buildLocation(record);
  const bio = getValue(record, FIELD_ALIASES.bio);

  const hasEnoughSignal =
    email || firstName || lastName || title || company || linkedinUrl || bio;

  if (!hasEnoughSignal) return null;

  return {
    first_name: firstName,
    last_name: lastName,
    email,
    title,
    company,
    linkedin_url: linkedinUrl,
    company_website: companyWebsite,
    industry,
    location,
  };
}

function parseCsvContacts(content: string): ImportedContactDraft[] {
  const rows = csvRows(content);
  if (rows.length < 2) return [];

  const [headerRow, ...dataRows] = rows;
  return dataRows
    .map((row) => {
      const record: Record<string, unknown> = {};
      headerRow.forEach((header, index) => {
        record[header] = row[index] ?? "";
      });
      return normalizeRecord(record);
    })
    .filter((value): value is ImportedContactDraft => value !== null);
}

function parseJsonContacts(content: string): ImportedContactDraft[] {
  const parsed = JSON.parse(content) as unknown;
  return extractArrayCandidate(parsed)
    .map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return null;
      return normalizeRecord(item as Record<string, unknown>);
    })
    .filter((value): value is ImportedContactDraft => value !== null);
}

function dedupeContacts(contacts: ImportedContactDraft[]): ImportedContactDraft[] {
  const seen = new Set<string>();
  return contacts.filter((contact) => {
    const key = [
      contact.email.toLowerCase(),
      contact.linkedin_url.toLowerCase(),
      `${contact.first_name} ${contact.last_name}`.trim().toLowerCase(),
      contact.company.toLowerCase(),
    ].join("|");

    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function parseImportedContacts(
  filename: string,
  content: string,
): ImportedContactDraft[] {
  const lower = filename.toLowerCase();
  const contacts =
    lower.endsWith(".json") || content.trim().startsWith("[")
      ? parseJsonContacts(content)
      : parseCsvContacts(content);

  return dedupeContacts(contacts);
}
