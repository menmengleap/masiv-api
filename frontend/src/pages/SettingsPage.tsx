import { useCallback, useEffect, useState } from 'react';
import { Save, Bot, FileText, Wallet, QrCode, Bitcoin } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import type { BotSettings, ServicePolicies } from '../lib/types';
import { useApi } from '../hooks/useApi';
import { useToast } from '../context/ToastContext';
import { PageHeader } from '../components/PageHeader';
import { Card, CardBody, CardHeader } from '../components/Card';
import { Spinner, LoadingState } from '../components/Spinner';
import { ErrorState } from '../components/States';

export function SettingsPage() {
  return (
    <div>
      <PageHeader
        title="Settings"
        description="Bot behaviour, payment details, and legal copy — all stored in the database and applied without a redeploy."
      />
      <div className="space-y-6">
        <BotSettingsForm />
        <PoliciesForm />
      </div>
    </div>
  );
}

/* ------------------------------- Bot settings ------------------------------ */

type SettingsForm = {
  bot_name: string;
  usd_to_usdt: string;
  payment_currency: string;
  payment_wallet: string;
  payment_network: string;
  payment_timeout_minutes: string;
  welcome_message: string;
  support_username: string;
  documentation_url: string;
  khqr_profile_id: string;
  /** Write-only: blank means "leave the stored key alone". */
  khqr_secret_key: string;
  khqr_enabled: boolean;
  usdt_enabled: boolean;
};

function toForm(s: BotSettings): SettingsForm {
  return {
    bot_name: s.bot_name ?? '',
    usd_to_usdt: s.usd_to_usdt ?? '',
    payment_currency: s.payment_currency ?? '',
    payment_wallet: s.payment_wallet ?? '',
    payment_network: s.payment_network ?? '',
    payment_timeout_minutes: String(s.payment_timeout_minutes ?? ''),
    welcome_message: s.welcome_message ?? '',
    support_username: s.support_username ?? '',
    documentation_url: s.documentation_url ?? '',
    khqr_profile_id: s.khqr_profile_id ?? '',
    // The API never returns the secret, so this always starts blank.
    khqr_secret_key: '',
    khqr_enabled: s.khqr_enabled ?? false,
    usdt_enabled: s.usdt_enabled ?? false,
  };
}

function BotSettingsForm() {
  const toast = useToast();
  const fetchSettings = useCallback((s: AbortSignal) => api.get<BotSettings>('/api/settings', undefined, s), []);
  const settings = useApi(fetchSettings, []);
  const [form, setForm] = useState<SettingsForm | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (settings.data) setForm(toForm(settings.data));
  }, [settings.data]);

  const set = (k: keyof SettingsForm, v: string | boolean) => setForm((f) => (f ? { ...f, [k]: v } : f));

  const save = async () => {
    if (!form) return;
    setSaving(true);
    try {
      // Numeric fields are coerced server-side; send strings null-safe.
      const payload = {
        bot_name: form.bot_name.trim(),
        usd_to_usdt: form.usd_to_usdt,
        payment_currency: form.payment_currency.trim(),
        payment_wallet: form.payment_wallet.trim() || null,
        payment_network: form.payment_network.trim() || null,
        payment_timeout_minutes: form.payment_timeout_minutes,
        welcome_message: form.welcome_message.trim() || null,
        support_username: form.support_username.trim() || null,
        documentation_url: form.documentation_url.trim() || null,
        khqr_profile_id: form.khqr_profile_id.trim() || null,
        // Blank = untouched. Sending '' tells the server to keep the stored key
        // rather than wiping a secret the form was never given.
        khqr_secret_key: form.khqr_secret_key,
        khqr_enabled: form.khqr_enabled,
        usdt_enabled: form.usdt_enabled,
      };
      const updated = await api.put<BotSettings>('/api/settings', payload);
      setForm(toForm(updated));
      settings.setData(updated);
      toast.success('Bot settings saved');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (settings.initialLoading) return <Card><LoadingState /></Card>;
  if (settings.error && !settings.data) return <Card><ErrorState message={settings.error} onRetry={settings.refetch} /></Card>;
  if (!form) return null;

  return (
    <Card>
      <CardHeader
        title={<span className="flex items-center gap-2"><Bot className="h-5 w-5 text-brand-400" /> Bot configuration</span>}
        subtitle="Shown to customers in the Telegram store."
      />
      <CardBody className="space-y-5">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Bot display name">
            <input className="input" value={form.bot_name} onChange={(e) => set('bot_name', e.target.value)} />
          </Field>
          <Field label="Support username" hint="Telegram @handle customers can contact.">
            <input className="input" value={form.support_username} placeholder="@support" onChange={(e) => set('support_username', e.target.value)} />
          </Field>
          <Field label="USD → USDT rate" hint="Conversion applied to package USD prices.">
            <input className="input font-mono" inputMode="decimal" value={form.usd_to_usdt} onChange={(e) => set('usd_to_usdt', e.target.value)} />
          </Field>
          <Field label="Documentation URL">
            <input className="input" value={form.documentation_url} placeholder="https://…" onChange={(e) => set('documentation_url', e.target.value)} />
          </Field>
        </div>

        <div className="border-t border-ink-750 pt-5">
          <p className="mb-3 flex items-center gap-2 text-sm font-medium text-gray-300">
            <Wallet className="h-4 w-4 text-brand-400" /> Pricing &amp; checkout
          </p>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Payment currency">
              <input className="input" value={form.payment_currency} placeholder="USDT" onChange={(e) => set('payment_currency', e.target.value)} />
            </Field>
            <Field label="Payment timeout (minutes)" hint="How long a KHQR stays valid. Unpaid orders auto-expire and release stock.">
              <input className="input" inputMode="numeric" value={form.payment_timeout_minutes} onChange={(e) => set('payment_timeout_minutes', e.target.value)} />
            </Field>
          </div>
        </div>

        <div className="border-t border-ink-750 pt-5">
          <p className="mb-1 flex items-center gap-2 text-sm font-medium text-gray-300">
            <QrCode className="h-4 w-4 text-brand-400" /> KHQR Payment Gateway
          </p>
          <p className="mb-3 text-xs text-gray-500">
            Automated. Customers scan a QR with any Bakong bank app (ABA, Wing, ACLEDA…) and the API key is
            delivered the moment khqr.cc confirms the payment.
          </p>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="flex items-center gap-3 md:col-span-2">
              <Toggle
                checked={form.khqr_enabled}
                onChange={(v) => set('khqr_enabled', v)}
                label="Enable KHQR payments"
              />
            </div>
            <Field label="KHQR Profile ID" hint="From your KHQR.cc dashboard.">
              <input className="input font-mono" value={form.khqr_profile_id} placeholder="QrBbF2nv…" spellCheck={false} onChange={(e) => set('khqr_profile_id', e.target.value)} />
            </Field>
            <Field
              label="KHQR Secret Key"
              hint={
                settings.data?.khqr_secret_key_set
                  ? 'A key is saved. Leave blank to keep it; type a new one to replace it.'
                  : 'Not set yet. Used to sign payment requests — never leaves the server.'
              }
            >
              <input
                className="input font-mono"
                type="password"
                autoComplete="new-password"
                value={form.khqr_secret_key}
                placeholder={settings.data?.khqr_secret_key_set ? '•••••••• (saved)' : 'Your secret key'}
                spellCheck={false}
                onChange={(e) => set('khqr_secret_key', e.target.value)}
              />
            </Field>
          </div>
          <p className="mt-2 text-xs text-gray-500">
            Set this webhook URL in your KHQR.cc dashboard: <code className="font-mono text-gray-400">{import.meta.env.VITE_API_URL ?? window.location.origin}/webhooks/khqr</code>
          </p>
          {form.khqr_enabled && !(form.khqr_profile_id.trim() && (settings.data?.khqr_secret_key_set || form.khqr_secret_key)) && (
            <p className="mt-2 text-xs text-amber-400">
              KHQR is enabled but not fully configured — the bot will hide it until both a profile ID and a secret key are saved.
            </p>
          )}
        </div>

        <div className="border-t border-ink-750 pt-5">
          <p className="mb-1 flex items-center gap-2 text-sm font-medium text-gray-300">
            <Bitcoin className="h-4 w-4 text-brand-400" /> USDT / Crypto Payment
          </p>
          <p className="mb-3 text-xs text-gray-500">
            Manual. There is no automated crypto verification — customers who pick this are told to contact
            Support, and an admin confirms the payment from the Orders page.
          </p>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="flex items-center gap-3 md:col-span-2">
              <Toggle
                checked={form.usdt_enabled}
                onChange={(v) => set('usdt_enabled', v)}
                label="Enable USDT (crypto) payments"
              />
            </div>
            <Field label="Network" hint="e.g. TRC20, ERC20, BEP20. Shown to the customer.">
              <input className="input" value={form.payment_network} placeholder="TRC20" onChange={(e) => set('payment_network', e.target.value)} />
            </Field>
            <Field label="Receiving wallet address" hint="Recorded on crypto invoices for reconciliation.">
              <input className="input font-mono" value={form.payment_wallet} placeholder="T…" spellCheck={false} onChange={(e) => set('payment_wallet', e.target.value)} />
            </Field>
          </div>
          {form.usdt_enabled && !form.support_username.trim() && (
            <p className="mt-2 text-xs text-amber-400">
              Set a Support username above — crypto customers are told to contact Support, and right now there's
              no handle to send them to.
            </p>
          )}
        </div>

        {!form.khqr_enabled && !form.usdt_enabled && (
          <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
            Every payment method is disabled — customers cannot check out.
          </p>
        )}

        <Field label="Welcome message" hint="Sent on /start. Supports plain text.">
          <textarea
            className="input min-h-[96px] resize-y"
            value={form.welcome_message}
            onChange={(e) => set('welcome_message', e.target.value)}
          />
        </Field>

        <div className="flex justify-end">
          <button className="btn-primary" onClick={save} disabled={saving}>
            {saving ? <Spinner className="h-4 w-4" /> : <Save className="h-4 w-4" />}
            Save settings
          </button>
        </div>
      </CardBody>
    </Card>
  );
}

/* --------------------------------- Policies -------------------------------- */

type PolicyForm = { terms_of_service: string; privacy_policy: string; service_policy: string };

function PoliciesForm() {
  const toast = useToast();
  const fetchPolicies = useCallback((s: AbortSignal) => api.get<ServicePolicies>('/api/policies', undefined, s), []);
  const policies = useApi(fetchPolicies, []);
  const [form, setForm] = useState<PolicyForm | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (policies.data) {
      setForm({
        terms_of_service: policies.data.terms_of_service ?? '',
        privacy_policy: policies.data.privacy_policy ?? '',
        service_policy: policies.data.service_policy ?? '',
      });
    }
  }, [policies.data]);

  const save = async () => {
    if (!form) return;
    setSaving(true);
    try {
      const updated = await api.put<ServicePolicies>('/api/policies', form);
      policies.setData(updated);
      toast.success('Policies saved');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (policies.initialLoading) return <Card><LoadingState /></Card>;
  if (policies.error && !policies.data) return <Card><ErrorState message={policies.error} onRetry={policies.refetch} /></Card>;
  if (!form) return null;

  return (
    <Card>
      <CardHeader
        title={<span className="flex items-center gap-2"><FileText className="h-5 w-5 text-brand-400" /> Service policies</span>}
        subtitle="Legal copy the bot can surface to customers on request."
      />
      <CardBody className="space-y-5">
        <PolicyField label="Terms of Service" value={form.terms_of_service} onChange={(v) => setForm((f) => (f ? { ...f, terms_of_service: v } : f))} />
        <PolicyField label="Privacy Policy" value={form.privacy_policy} onChange={(v) => setForm((f) => (f ? { ...f, privacy_policy: v } : f))} />
        <PolicyField label="Service Policy" value={form.service_policy} onChange={(v) => setForm((f) => (f ? { ...f, service_policy: v } : f))} />
        <div className="flex justify-end">
          <button className="btn-primary" onClick={save} disabled={saving}>
            {saving ? <Spinner className="h-4 w-4" /> : <Save className="h-4 w-4" />}
            Save policies
          </button>
        </div>
      </CardBody>
    </Card>
  );
}

function PolicyField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <Field label={label}>
      <textarea className="input min-h-[120px] resize-y font-sans" value={value} onChange={(e) => onChange(e.target.value)} />
    </Field>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
      {hint && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="relative inline-flex cursor-pointer items-center gap-2">
      <input type="checkbox" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <div className="h-6 w-11 rounded-full bg-ink-700 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-gray-400 after:transition-all peer-checked:bg-brand-600 peer-checked:after:translate-x-full peer-checked:after:bg-white" />
      <span className="text-sm text-gray-300">{label}</span>
    </label>
  );
}
