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
          Configure your API keys and outreach preferences.
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
              <CardTitle>API Keys</CardTitle>
              <CardDescription>
                These are stored encrypted and never shown again after saving.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="resend_api_key">Resend API Key</Label>
                <Input
                  id="resend_api_key"
                  name="resend_api_key"
                  type="password"
                  placeholder={
                    settings?.resend_api_key ? "********" : "re_..."
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="apollo_api_key">Apollo API Key</Label>
                <Input
                  id="apollo_api_key"
                  name="apollo_api_key"
                  type="password"
                  placeholder={
                    settings?.apollo_api_key ? "********" : "Enter your key"
                  }
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
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Auto-send emails</Label>
                  <p className="text-xs text-muted-foreground">
                    Automatically send emails that pass quality checks.
                  </p>
                </div>
                <Switch
                  name="auto_send_enabled"
                  defaultChecked={settings?.auto_send_enabled ?? false}
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label>Review before sending</Label>
                  <p className="text-xs text-muted-foreground">
                    Require manual approval before each email is sent.
                  </p>
                </div>
                <Switch
                  name="review_before_send"
                  defaultChecked={settings?.review_before_send ?? true}
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
