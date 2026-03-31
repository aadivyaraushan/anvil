import { getUserSettings, updateUserSettings } from "@/lib/actions/settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function AccountSettingsPage() {
  const settings = await getUserSettings();

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">
          Account Settings
        </h1>
        <p className="text-sm text-muted-foreground">
          Configure your email and outreach preferences.
        </p>
      </div>

      <div className="max-w-2xl space-y-6">
        <form action={updateUserSettings} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Email Configuration</CardTitle>
              <CardDescription>
                Configure the sender identity for outreach emails.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="sender_name">Sender name</Label>
                <Input
                  id="sender_name"
                  name="sender_name"
                  defaultValue={settings?.sender_name ?? ""}
                  placeholder="Team Anvil"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="sender_email">Sender email</Label>
                <Input
                  id="sender_email"
                  name="sender_email"
                  type="email"
                  defaultValue={settings?.sender_email ?? ""}
                  placeholder="you@yourdomain.com"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Outreach Preferences</CardTitle>
              <CardDescription>
                Control how outreach emails are sent.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <Label>Auto-send emails</Label>
                  <p className="text-xs text-muted-foreground">
                    When off, you review and approve each email before it sends.
                  </p>
                </div>
                <Switch
                  name="auto_send_enabled"
                  defaultChecked={settings?.auto_send_enabled ?? false}
                />
              </div>
            </CardContent>
          </Card>

          <Button type="submit">Save settings</Button>
        </form>
      </div>
    </div>
  );
}
