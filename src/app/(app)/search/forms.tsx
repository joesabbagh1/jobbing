"use client";

import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useTransition } from "react";
import { toast } from "sonner";
import { ConfirmAction } from "@/components/confirm-action";
import { SubmitButton } from "@/components/submit-button";
import { TagInput } from "@/components/tag-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { type ActionState, addCompany, removeCompany, saveProfile, toggleCompany } from "@/lib/search/actions";
import type { SearchProfile } from "@/lib/search/profile";

/** Shows an action's result as a toast. */
function useToastResult(state: ActionState) {
  const last = useRef(state);
  useEffect(() => {
    if (state === last.current) return;
    last.current = state;
    if (state.error) toast.error(state.error);
    else if (state.ok) toast.success(state.ok);
  }, [state]);
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function ProfileForm({ profile }: { profile: SearchProfile }) {
  const [state, action] = useActionState(saveProfile, {});
  useToastResult(state);
  return (
    <form action={action} className="space-y-5">
      <Field
        label="About you"
        hint="The AI scores every job and writes cover letters from this. Mention your role, experience, stack, location, contract type and deal-breakers."
      >
        <Textarea name="about" defaultValue={profile.about} required className="min-h-40" />
      </Field>
      <div className="grid gap-5 md:grid-cols-2">
        <Field label="Title must contain one of" hint="Press Enter to add.">
          <TagInput name="titleKeywords" defaultValue={profile.titleKeywords} placeholder="e.g. devops" />
        </Field>
        <Field label="Skip titles containing">
          <TagInput name="excludeTitleKeywords" defaultValue={profile.excludeTitleKeywords} placeholder="e.g. senior" />
        </Field>
        <Field label="Location must contain one of" hint="Leave empty for any location.">
          <TagInput name="locations" defaultValue={profile.locations} placeholder="Any location" />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Max age (days)">
            <Input name="maxAgeDays" type="number" min={1} max={365} defaultValue={profile.maxAgeDays} />
          </Field>
          <Field label="Min AI score" hint="0–100">
            <Input name="minScore" type="number" min={0} max={100} defaultValue={profile.minScore} />
          </Field>
        </div>
      </div>
      <div className="space-y-4 rounded-lg border p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <Label htmlFor="linkedinEnabled">Also search LinkedIn</Label>
            <p className="mt-1 text-xs text-muted-foreground">
              Uses LinkedIn&apos;s public job search, without your account. Results go through the same filters. When a
              company there has a Lever, Ashby, Greenhouse, SmartRecruiters or Workable board, it&apos;s added to your
              boards automatically and its jobs come from its own site.
            </p>
          </div>
          <Switch id="linkedinEnabled" name="linkedinEnabled" defaultChecked={profile.linkedin.enabled} />
        </div>
        <div className="grid gap-5 md:grid-cols-2">
          <Field label="LinkedIn searches" hint="Each one is a separate LinkedIn search.">
            <TagInput name="linkedinQueries" defaultValue={profile.linkedin.queries} placeholder="e.g. cloud engineer" />
          </Field>
          <Field label="LinkedIn location" hint={'As typed in LinkedIn\'s location box, e.g. "France".'}>
            <Input name="linkedinLocation" defaultValue={profile.linkedin.location} required />
          </Field>
        </div>
      </div>
      <div className="space-y-4 rounded-lg border p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <Label htmlFor="jeanMichelEnabled">Also search Jean-Michel.io</Label>
            <p className="mt-1 text-xs text-muted-foreground">
              Uses the site&apos;s public listings, without an account. Only permanent (CDI) roles are kept, including
              those also open to freelancers. Results go through the same filters.
            </p>
          </div>
          <Switch id="jeanMichelEnabled" name="jeanMichelEnabled" defaultChecked={profile.jeanMichel.enabled} />
        </div>
        <Field label="Jean-Michel.io searches" hint="Each one is a separate search on the site.">
          <TagInput name="jeanMichelQueries" defaultValue={profile.jeanMichel.queries} placeholder="e.g. cloud" />
        </Field>
      </div>
      <SubmitButton pendingLabel="Saving…">Save profile</SubmitButton>
    </form>
  );
}

export function AddCompanyForm() {
  const [state, action] = useActionState(addCompany, {});
  useToastResult(state);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) form.current?.reset();
  }, [state]);
  return (
    <form ref={form} action={action} className="flex flex-col gap-2 sm:flex-row">
      <Input name="name" placeholder="Company name" className="sm:w-48" />
      <Input name="board" required placeholder="Careers page URL, e.g. https://jobs.lever.co/acme" className="flex-1" />
      <SubmitButton variant="outline" pendingLabel="Checking…">
        <Plus />
        Add board
      </SubmitButton>
    </form>
  );
}

/** On/off switch and delete button for one company board. */
export function CompanyActions({ id, name, enabled }: { id: number; name: string; enabled: boolean }) {
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex items-center justify-end gap-2">
      <Switch
        checked={enabled}
        disabled={pending}
        aria-label={enabled ? `Pause ${name}` : `Resume ${name}`}
        onCheckedChange={(on) => startTransition(() => toggleCompany(id, on))}
      />
      <ConfirmAction
        title={`Remove ${name}?`}
        description="The search stops checking this board. Jobs already found stay in your list."
        confirmLabel="Remove"
        onConfirm={() => removeCompany(id)}
        trigger={
          <Button variant="ghost" size="icon-sm" aria-label={`Remove ${name}`} className="text-muted-foreground hover:text-destructive">
            <Trash2 />
          </Button>
        }
      />
    </div>
  );
}

/** Refreshes the page every few seconds while a search is running. */
export function AutoRefresh({ active }: { active: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(t);
  }, [active, router]);
  return null;
}
