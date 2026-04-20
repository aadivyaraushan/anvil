import { describe, expect, it } from "vitest";
import { parseImportedContacts } from "@/lib/contact-import";

describe("parseImportedContacts", () => {
  it("parses CSV exports into normalized contacts", () => {
    const contacts = parseImportedContacts(
      "linkedin-export.csv",
      [
        "Full Name,Email,Headline,Company,LinkedIn URL,Location",
        '"Sarah Chen",sarah@finflow.com,"CFO","FinFlow",https://linkedin.com/in/sarah,"San Francisco, CA"',
      ].join("\n"),
    );

    expect(contacts).toHaveLength(1);
    expect(contacts[0]).toMatchObject({
      source: "csv",
      first_name: "Sarah",
      last_name: "Chen",
      title: "CFO",
      company: "FinFlow",
    });
  });

  it("parses JSON exports from nested profile arrays", () => {
    const contacts = parseImportedContacts(
      "instagram-followers.json",
      JSON.stringify({
        profiles: [
          {
            name: "Mia Torres",
            email_address: "mia@northstar.com",
            role: "Founder",
            organization: "Northstar",
            profile_url: "https://instagram.com/miatorres",
          },
        ],
      }),
    );

    expect(contacts).toHaveLength(1);
    expect(contacts[0]).toMatchObject({
      source: "json",
      first_name: "Mia",
      last_name: "Torres",
      email: "mia@northstar.com",
      title: "Founder",
      company: "Northstar",
    });
  });
});
