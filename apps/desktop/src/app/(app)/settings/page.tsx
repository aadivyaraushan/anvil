"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useUser } from "@/lib/hooks/use-auth";
import { getSupabase } from "@/lib/supabase/client";
import { mapError } from "@/lib/errors";
import { ErrorCard } from "@/components/error-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function SettingsPage() {
  const user = useUser();
  const qc = useQueryClient();
  const [calendarConnecting, setCalendarConnecting] = useState(false);
  const [saved, setSaved] = useState(false);

  const { data: settings, error, isLoading } = useQuery({
    queryKey: ["user_settings", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from("user_settings")
        .select("*")
        .eq("user_id", user!.id)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: calendarConnection } = useQuery({
    queryKey: ["calendar_connection", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await getSupabase()
        .from("calendar_connections")
        .select("calendar_email, created_at")
        .eq("user_id", user!.id)
        .maybeSingle();
      return data;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      // settings are read-only for now — desktop_connected_at is set by the app
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["user_settings"] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
  });

  const handleCalendarConnect = async () => {
    setCalendarConnecting(true);
    try {
      const session = await getSupabase().auth.getSession();
      const token = session.data.session?.access_token;
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/calendar/google/connect`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const { url } = await res.json();
      if (url) window.open(url, "_blank");
    } catch (e) {
      console.error("Calendar connect failed", e);
    } finally {
      setCalendarConnecting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="p-8 space-y-4">
        {[1, 2].map((i) => (
          <div key={i} className="h-32 rounded-xl bg-muted animate-pulse" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8">
        <ErrorCard error={mapError(error)} />
      </div>
    );
  }

  return (
    <div className="p-8 max-w-2xl space-y-6">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Manage your account and integrations.
        </p>
      </div>

      {/* Account */}
      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <CardDescription>Your login email.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{user?.email}</p>
        </CardContent>
      </Card>

      {/* Desktop app */}
      <Card>
        <CardHeader>
          <CardTitle>Desktop app</CardTitle>
          <CardDescription>
            The Anvil Mac app captures mic + system audio for any conversation.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm">
            {settings?.desktop_connected_at ? (
              <>
                <span className="size-2 rounded-full bg-rose inline-block" />
                <span className="text-muted-foreground">
                  Connected{" "}
                  {new Date(settings.desktop_connected_at).toLocaleDateString()}
                </span>
              </>
            ) : (
              <span className="text-muted-foreground">Not connected</span>
            )}
          </div>
          <a
            href="https://releases.anvil.app/Anvil-latest.dmg"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center h-7 px-2.5 text-[0.8rem] rounded-[min(var(--radius-md),12px)] border border-border bg-background hover:bg-muted hover:text-foreground"
          >
            Download for Mac
          </a>
        </CardContent>
      </Card>

      {/* Google Calendar */}
      <Card>
        <CardHeader>
          <CardTitle>Google Calendar</CardTitle>
          <CardDescription>
            Connect to auto-detect 1:1 calls with external attendees and
            prefill interview names.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-between">
          {calendarConnection ? (
            <div className="flex items-center gap-2 text-sm">
              <span className="size-2 rounded-full bg-azure inline-block" />
              <span className="text-muted-foreground">
                {calendarConnection.calendar_email ?? "Connected"}
              </span>
            </div>
          ) : (
            <span className="text-sm text-muted-foreground">Not connected</span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleCalendarConnect}
            disabled={calendarConnecting}
          >
            {calendarConnection ? "Reconnect" : "Connect Calendar"}
          </Button>
        </CardContent>
      </Card>

      {saved && (
        <p className="text-sm text-muted-foreground">Saved.</p>
      )}
    </div>
  );
}
