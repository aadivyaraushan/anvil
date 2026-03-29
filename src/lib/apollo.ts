export type ApolloSearchParams = {
  jobTitles: string[];
  seniorityLevels: string[];
  keywords: string[];
  perPage: number;
};

export type ApolloContact = {
  first_name: string;
  last_name: string;
  email: string;
  title: string;
  company: string;
  company_website: string;
  linkedin_url: string;
  industry: string;
  location: string;
  raw: Record<string, unknown>;
};

export async function searchApollo(params: ApolloSearchParams): Promise<ApolloContact[]> {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) throw new Error("APOLLO_API_KEY is not set");

  const body = {
    api_key: apiKey,
    q_organization_keyword_tags: params.keywords,
    person_titles: params.jobTitles,
    person_seniorities: params.seniorityLevels,
    per_page: params.perPage,
    page: 1,
  };

  const res = await fetch("https://api.apollo.io/v1/mixed_people/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`Apollo API error: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  const people: Record<string, unknown>[] = data.people ?? [];

  return people.map((p: Record<string, unknown>) => {
    const org = (p.organization as Record<string, unknown>) ?? {};
    const city = (p.city as string) ?? "";
    const state = (p.state as string) ?? "";
    const country = (p.country as string) ?? "";
    const location = [city, state, country].filter(Boolean).join(", ");

    return {
      first_name: (p.first_name as string) ?? "",
      last_name: (p.last_name as string) ?? "",
      email: (p.email as string) ?? "",
      title: (p.title as string) ?? "",
      company: (org.name as string) ?? "",
      company_website: (org.website_url as string) ?? "",
      linkedin_url: (p.linkedin_url as string) ?? "",
      industry: ((p.departments as string[]) ?? []).join(", "),
      location,
      raw: p,
    };
  });
}
